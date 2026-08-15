// bridge/src/main/java/com/bwbrain/bridge/LauncherGridWalker.java
//
// Phase 4 Plan 04-01 Task 1 — D-01 launcher grid enumeration via the
// cursor-walk state machine. The bridge cannot read non-cursor launcher
// clips directly (RESEARCH finding 1: Scene/ClipLauncherSlot expose NO
// Clip accessor in extension-api:21). It walks the grid by programmatically
// selecting each cell, awaiting the cursor-clip ready-signal, reading the
// NoteStep grid, then advancing. This is the ONLY API-faithful path and the
// data foundation every P4 analyzer depends on.
//
// STATE MACHINE (RESEARCH §Pattern 3 lines 360-381):
//   IDLE ──start()──▶ SELECTING(cellIdx)
//   SELECTING: slotSelector.select(trackIdx, sceneIdx)
//                  → if !hasContent: ADVANCING (empty cell, no select needed)
//   AWAITING_LOOPLEN: readySignal.awaitNext(timeoutMs)
//                  → fire: DRAINING (read notes via notesReader)
//                  → timeout (D-22, 500ms default): mark cell empty + ADVANCING
//   DRAINING: enumerate notes for the cell the cursor sits on → accumulate
//   ADVANCING: ++cellIdx → SELECTING (or DONE)
//   DONE: return LauncherGridResponse (D-12 shape)
//
// The walker is SEQUENTIAL by design — the cursor clip is a SINGLE shared
// resource (Pitfall 1: parallel selects would race + coalesce observer
// callbacks, so the daemon would see fewer fires than walks and read stale
// NoteSteps). The package-private walkGrid(...) seam takes pure functional
// interfaces so LauncherGridWalkerTest can exercise the state machine with
// recording fakes (mirror the PullHandlers.NoteStepWriter + recording-writer
// pattern from PullHandlersApplyPatchTest — no Mockito in this project).
//
// Per-cell timeout (D-22): a missing clip is NEVER fatal — producers leave
// gaps (RESEARCH §Pattern 3). On timeout, mark the cell empty + ADVANCE.
// The live probe (Task 2, capabilities doc §7) validates the per-cell p95
// latency distribution; if > 250ms p95 the walker timeout grows + the UX
// cost is documented, if > 1s the snapshot is cell-count-capped.
package com.bwbrain.bridge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * D-01 launcher-grid cursor-walk state machine. Package-private; constructed
 * once in {@link BridgeExtension#init()} and threaded into {@link PullHandlers}
 * via the dispatch switch's {@code "get.launcher_clips"} arm.
 *
 * <p>The state machine is driven entirely through the four functional
 * interfaces below ({@link SlotSelector}, {@link HasContentReader},
 * {@link NotesReader}, {@link ReadySignal}) + two lookup functions
 * ({@code trackSidFor}, {@code trackNameFor}). The production wiring in
 * {@link PullHandlers#handleLauncherGrid} binds these to the live Bitwig
 * {@code TrackBank}/{@link com.bitwig.extension.controller.api.PinnableCursorClip}
 * surface; the JUnit test in {@link LauncherGridWalkerTest} drives recording
 * fakes (no Bitwig host needed).</p>
 */
final class LauncherGridWalker {

    // === STATE MACHINE CONSTANTS (the RESEARCH §Pattern 3 sketch) ===
    static final int IDLE             = 0;
    static final int SELECTING        = 1;
    static final int AWAITING_LOOPLEN = 2;
    static final int DRAINING         = 3;
    static final int ADVANCING        = 4;
    static final int DONE             = 5;

    /** D-22 default per-cell timeout (the trust-spine budget the probe validates). */
    static final long DEFAULT_PER_CELL_TIMEOUT_MS = 500L;

    private final int trackCount;
    private final int sceneCount;
    private final long perCellTimeoutMs;

    /**
     * @param trackCount      grid width (matches the windowed TrackBank size —
     *                        {@link BridgeExtension#BANK_SIZE}).
     * @param sceneCount      grid height (matches the SceneBank size —
     *                        {@link BridgeExtension#SCENE_COUNT}).
     * @param perCellTimeoutMs D-22 per-cell timeout. On expiry the cell is marked
     *                        empty + the walker advances (a missing clip is
     *                        never fatal — RESEARCH §Pattern 3).
     */
    LauncherGridWalker(final int trackCount, final int sceneCount, final long perCellTimeoutMs) {
        this.trackCount = trackCount;
        this.sceneCount = sceneCount;
        this.perCellTimeoutMs = perCellTimeoutMs;
    }

    /** Convenience ctor with the D-22 default per-cell timeout. */
    LauncherGridWalker(final int trackCount, final int sceneCount) {
        this(trackCount, sceneCount, DEFAULT_PER_CELL_TIMEOUT_MS);
    }

    // === FUNCTIONAL INTERFACES (testable without Bitwig) ===

    /**
     * Select the launcher slot at (trackIdx, sceneIdx). Production wires this to
     * {@code trackBank.getItemAt(t).clipLauncherSlotBank().select(s)} (NON-deprecated
     * per RESEARCH Javadoc scan; Pitfall 2 — {@code Track.selectSlot(int)} /
     * {@code getClipLauncherSlots()} are the deprecated alternates).
     */
    @FunctionalInterface
    interface SlotSelector {
        void select(int trackIdx, int sceneIdx);
    }

    /**
     * Read hasContent for the slot at (trackIdx, sceneIdx). Production wires this
     * to {@code trackBank.getItemAt(t).clipLauncherSlotBank().getItemAt(s).hasContent().get()}
     * ({@code ClipLauncherSlot.hasContent()} returns a {@code BooleanValue}).
     */
    @FunctionalInterface
    interface HasContentReader {
        boolean hasContent(int trackIdx, int sceneIdx);
    }

    /**
     * Read the NoteStep grid for the clip the cursor currently sits on, given
     * the loop length reported by the latest {@link ReadySignal} fire. Production
     * wires this to the existing {@link PullHandlers#enumerateNotes} helper
     * (lines 207-231) — the EXACT shape the walker invokes per cell.
     */
    @FunctionalInterface
    interface NotesReader {
        List<PullHandlers.NoteView> readNotes(double loopBeats);
    }

    /**
     * The cursor-clip ready-signal. After {@link SlotSelector#select} moves the
     * {@link com.bitwig.extension.controller.api.PinnableCursorClip} to a new
     * cell, {@code getLoopLength()} fires exactly once with the new clip's loop
     * length (Observers.java:122-128 — the existing ready-signal observer).
     *
     * <p>Production wires this to a one-shot {@link java.util.concurrent.CountDownLatch}
     * armed before each select() and counted down by the loopLength observer.
     * The recording fake in {@link LauncherGridWalkerTest} returns scripted
     * values per arm to validate the fire vs timeout branches.</p>
     *
     * <p>Sequence per cell: (1) {@code arm()}, (2) {@code select()}, (3) await
     * {@code loopBeats} via {@code awaitNext(timeoutMs)}. {@code arm()} MUST
     * happen before {@code select()} to avoid the race where the observer fires
     * before the await is parked (Pitfall 1 — observer coalescing).</p>
     */
    @FunctionalInterface
    interface ReadySignal {
        /**
         * Arm before {@link SlotSelector#select}; await the next loop-length
         * fire (or timeout).
         *
         * @param timeoutMs the per-cell timeout budget (D-22).
         * @return the loop length in beats on fire; {@code -1.0} on timeout.
         */
        double awaitNext(long timeoutMs);

        /**
         * Arm the signal before the next {@link SlotSelector#select}. Default
         * no-op for test fakes that handle sequencing internally; production
         * re-arms a CountDownLatch here.
         */
        default void arm() {}
    }

    // === RESPONSE SHAPE (D-12) ===

    /** A single cell in the grid (one scene within one track). */
    static final class CellView {
        final int sceneIdx;
        final String clipSid;     // ^clip_[0-9a-f]{16}$ ; clip_0000000000000000 for empty/timeout
        final boolean hasContent;
        final double loopBeats;   // 0 for empty/timeout
        final List<PullHandlers.NoteView> notes; // empty for empty/timeout

        CellView(final int sceneIdx, final String clipSid, final boolean hasContent,
                 final double loopBeats, final List<PullHandlers.NoteView> notes) {
            this.sceneIdx = sceneIdx;
            this.clipSid = clipSid;
            this.hasContent = hasContent;
            this.loopBeats = loopBeats;
            this.notes = notes;
        }
    }

    /** A single track's contribution to the grid (its name + per-scene cells). */
    static final class TrackRowView {
        final String trackSid;   // V1: the raw cursor track name (STATE-04 reconciles)
        final String name;
        final List<CellView> scenes;

        TrackRowView(final String trackSid, final String name, final List<CellView> scenes) {
            this.trackSid = trackSid;
            this.name = name;
            this.scenes = scenes;
        }
    }

    /** The full grid response (D-12). Pure record-like shape. */
    static final class LauncherGridResponse {
        final List<TrackRowView> tracks;
        final List<String> sceneNames;

        LauncherGridResponse(final List<TrackRowView> tracks, final List<String> sceneNames) {
            this.tracks = tracks;
            this.sceneNames = sceneNames;
        }
    }

    /**
     * Walk the launcher grid (trackIdx × sceneIdx) sequentially. The walk is
     * sequential because the cursor clip is a SINGLE shared resource (Pitfall 1:
     * parallel selects race + the observer coalesces fires).
     *
     * <p>Per cell: (1) read hasContent via {@code hasContentReader}; (2) if true,
     * {@code readySignal.arm()} then {@code slotSelector.select(t,s)}, then
     * await the loop-length fire; (3) on fire, {@code notesReader.readNotes(loopBeats)};
     * (4) on timeout (D-22), mark empty + advance. Empty cells (hasContent=false
     * OR timeout) emit {@code notes:[] + clipSid:clip_0000000000000000}.</p>
     *
     * @param slotSelector    production: {@code trackBank.getItemAt(t).clipLauncherSlotBank().select(s)}
     * @param hasContentReader production: {@code ...slotBank.getItemAt(s).hasContent().get()}
     * @param notesReader     production: {@link PullHandlers#enumerateNotes}
     * @param readySignal     production: one-shot CountDownLatch armed before select
     *                        + counted down by the loopLength observer
     *                        (Observers.java:122-128)
     * @param trackSidFor     V1: returns the raw track name (STATE-04 reconciles
     *                        downstream; ClipSid.derive is opaque to trackSid-vs-name)
     * @param trackNameFor    returns the track name for the response payload
     * @return the D-12 grid response
     */
    LauncherGridResponse walkGrid(final SlotSelector slotSelector,
                                   final HasContentReader hasContentReader,
                                   final NotesReader notesReader,
                                   final ReadySignal readySignal,
                                   final java.util.function.IntFunction<String> trackSidFor,
                                   final java.util.function.IntFunction<String> trackNameFor) {
        return walkGrid(slotSelector, hasContentReader, notesReader, readySignal,
                trackSidFor, trackNameFor, () -> {});
    }

    LauncherGridResponse walkGrid(final SlotSelector slotSelector,
                                   final HasContentReader hasContentReader,
                                   final NotesReader notesReader,
                                   final ReadySignal readySignal,
                                   final java.util.function.IntFunction<String> trackSidFor,
                                   final java.util.function.IntFunction<String> trackNameFor,
                                   final Runnable restoreSelection) {
        try {
            return walkGridWithoutRestore(slotSelector, hasContentReader, notesReader, readySignal,
                    trackSidFor, trackNameFor);
        } finally {
            restoreSelection.run();
        }
    }

    private LauncherGridResponse walkGridWithoutRestore(final SlotSelector slotSelector,
                                   final HasContentReader hasContentReader,
                                   final NotesReader notesReader,
                                   final ReadySignal readySignal,
                                   final java.util.function.IntFunction<String> trackSidFor,
                                   final java.util.function.IntFunction<String> trackNameFor) {
        int state = IDLE;
        final List<TrackRowView> tracks = new ArrayList<>();
        int trackIdx = 0;
        int sceneIdx = 0;
        // The cursor clip is shared across the whole grid; cellIdx is the global
        // walk position (used by the state-machine narrative + diagnostics, NOT
        // for parallelism — the walk is strictly sequential).
        int cellIdx = 0;

        // Per-track accumulators (re-used per track).
        String currentTrackSid = null;
        String currentTrackName = null;
        List<CellView> currentScenes = null;

        state = SELECTING;
        while (state != DONE) {
            switch (state) {
                case SELECTING -> {
                    if (trackIdx >= trackCount) {
                        // Flush the last track + finish.
                        if (currentScenes != null) {
                            tracks.add(new TrackRowView(currentTrackSid, currentTrackName, currentScenes));
                        }
                        state = DONE;
                        break;
                    }
                    if (sceneIdx == 0) {
                        // Entering a new track row.
                        if (currentScenes != null) {
                            tracks.add(new TrackRowView(currentTrackSid, currentTrackName, currentScenes));
                        }
                        currentTrackSid = trackSidFor.apply(trackIdx);
                        currentTrackName = trackNameFor.apply(trackIdx);
                        currentScenes = new ArrayList<>(sceneCount);
                    }
                    if (sceneIdx >= sceneCount) {
                        // Exhausted this track's scenes; advance track.
                        trackIdx++;
                        sceneIdx = 0;
                        // Re-enter SELECTING for the next track.
                        break;
                    }
                    final boolean hasContent = hasContentReader.hasContent(trackIdx, sceneIdx);
                    if (!hasContent) {
                        // Empty cell — no select needed; emit empty + ADVANCE.
                        currentScenes.add(emptyCell(sceneIdx));
                        state = ADVANCING;
                        break;
                    }
                    // Has content — arm BEFORE select (Pitfall 1 race guard).
                    readySignal.arm();
                    try {
                        slotSelector.select(trackIdx, sceneIdx);
                    } catch (final Exception e) {
                        // select() threw — treat as empty + advance (a missing
                        // clip is never fatal; RESEARCH §Pattern 3).
                        currentScenes.add(emptyCell(sceneIdx));
                        state = ADVANCING;
                        break;
                    }
                    state = AWAITING_LOOPLEN;
                }
                case AWAITING_LOOPLEN -> {
                    final double loopBeats = readySignal.awaitNext(perCellTimeoutMs);
                    if (loopBeats < 0.0) {
                        // Timeout (D-22) — mark empty + advance.
                        currentScenes.add(emptyCell(sceneIdx));
                        state = ADVANCING;
                        break;
                    }
                    state = DRAINING;
                    // Stash loopBeats via a one-shot holder (avoid final-efficiency
                    // dance by re-reading in DRAINING via a cell-scoped variable).
                    lastLoopBeats = loopBeats;
                }
                case DRAINING -> {
                    final double loopBeats = lastLoopBeats;
                    lastLoopBeats = 0.0;
                    List<PullHandlers.NoteView> notes;
                    try {
                        notes = notesReader.readNotes(loopBeats);
                    } catch (final Exception e) {
                        notes = List.of();
                    }
                    if (notes == null) { notes = List.of(); }
                    final String clipSid = ClipSid.derive(currentTrackSid, loopBeats, sceneIdx);
                    currentScenes.add(new CellView(sceneIdx, clipSid, true, loopBeats, notes));
                    state = ADVANCING;
                }
                case ADVANCING -> {
                    cellIdx++;
                    sceneIdx++;
                    state = SELECTING;
                }
                default -> {
                    // IDLE / DONE / unknown — terminal guard.
                    state = DONE;
                }
            }
        }
        // sceneNames is enriched separately (Observers.wireSceneBank) — the
        // walker returns an empty list here; PullHandlers.handleLauncherGrid
        // fills it from the observers cache before building the response line.
        return new LauncherGridResponse(tracks, new ArrayList<>(sceneCount));
    }

    // Cell-scoped loop-length holder between AWAITING_LOOPLEN and DRAINING.
    // Strictly sequential — never observed across cells.
    private double lastLoopBeats = 0.0;

    private static CellView emptyCell(final int sceneIdx) {
        return new CellView(sceneIdx, "clip_0000000000000000", false, 0.0, List.of());
    }

    /**
     * Pure response builder mirror of {@link PullHandlers#buildClipResponse} /
     * {@link PullHandlers#buildProjectSummaryResponse}: LinkedHashMap payload +
     * {@link LineJson#response}. Package-private so {@link PullHandlers}
     * (same package) calls it directly + the JUnit test can pin the shape.
     */
    static String buildLauncherGridResponse(final String id, final LauncherGridResponse grid) {
        final List<Map<String, Object>> tracksPayload = new ArrayList<>();
        for (final TrackRowView t : grid.tracks) {
            final List<Map<String, Object>> scenesPayload = new ArrayList<>();
            for (final CellView c : t.scenes) {
                final List<Map<String, Object>> notesPayload = new ArrayList<>();
                for (final PullHandlers.NoteView n : c.notes) {
                    final Map<String, Object> nm = new LinkedHashMap<>();
                    nm.put("key", n.key());
                    nm.put("pitch", n.pitch());
                    nm.put("start", n.start());
                    nm.put("length", n.length());
                    nm.put("velocity", n.velocity());
                    notesPayload.add(nm);
                }
                final Map<String, Object> cm = new LinkedHashMap<>();
                cm.put("sceneIdx", c.sceneIdx);
                cm.put("clipSid", c.clipSid);
                cm.put("hasContent", c.hasContent);
                cm.put("loopBeats", c.loopBeats);
                cm.put("notes", notesPayload);
                scenesPayload.add(cm);
            }
            final Map<String, Object> tm = new LinkedHashMap<>();
            tm.put("trackSid", t.trackSid);
            tm.put("name", t.name);
            tm.put("scenes", scenesPayload);
            tracksPayload.add(tm);
        }
        final Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("tracks", tracksPayload);
        payload.put("sceneNames", grid.sceneNames);
        return LineJson.response(id, true, payload);
    }
}
