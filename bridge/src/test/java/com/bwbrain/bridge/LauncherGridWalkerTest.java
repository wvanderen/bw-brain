// bridge/src/test/java/com/bwbrain/bridge/LauncherGridWalkerTest.java
//
// Phase 4 Plan 04-01 Task 1 — JUnit test for the launcher-grid cursor-walk
// state machine (D-01 / RESEARCH §Pattern 3 / INV-P4-3).
//
// The walker is a pure state machine driven by four functional interfaces
// (SlotSelector, HasContentReader, NotesReader, ReadySignal). This test
// injects recording fakes that mirror the PullHandlersApplyPatchTest
// recording-writer pattern (no Mockito in this project — just hand-rolled
// fakes that capture every call). The walker does NOT depend on any Bitwig
// type, so a plain JUnit run exercises the full state machine.
//
// Coverage (per the plan's <acceptance_criteria>):
//   (a) every hasContent=true cell returns notes (INV-P4-3)
//   (b) timeout marks cell empty + advances (Pitfall 1 / D-22)
//   (c) empty grid returns empty tracks array
//   (d) the walk is sequential — no parallel cell races (the cursor clip is
//       a SINGLE shared resource)
//   (e) the response builder carries the D-12 shape
//   (f) ClipSid.derive(trackSid, loopBeats, sceneIdx) overload disambiguates
//       (paired with ClipSidTest's existing 2-arg coverage)
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class LauncherGridWalkerTest {

    private static final ObjectMapper READER = new ObjectMapper();

    // === Recording fakes (mirror PullHandlersApplyPatchTest.RecordingWriter) ===

    /** Captures every select(t,s) call in order — proves sequential walk. */
    static final class RecordingSelector implements LauncherGridWalker.SlotSelector {
        final List<int[]> calls = new ArrayList<>();
        @Override public void select(final int trackIdx, final int sceneIdx) {
            calls.add(new int[]{trackIdx, sceneIdx});
        }
    }

    /** Scripted hasContent grid (trackIdx × sceneIdx → boolean). */
    static final class ScriptedHasContent implements LauncherGridWalker.HasContentReader {
        private final Map<Long, Boolean> grid = new HashMap<>();
        private final boolean defaultValue;
        ScriptedHasContent(final boolean defaultValue) { this.defaultValue = defaultValue; }
        ScriptedHasContent set(final int t, final int s, final boolean v) {
            grid.put(key(t, s), v); return this;
        }
        @Override public boolean hasContent(final int trackIdx, final int sceneIdx) {
            return grid.getOrDefault(key(trackIdx, sceneIdx), defaultValue);
        }
        private static long key(final int t, final int s) { return ((long) t << 32) | (s & 0xFFFFFFFFL); }
    }

    /** Returns scripted note lists per call (round-robin if exhausted). */
    static final class ScriptedNotes implements LauncherGridWalker.NotesReader {
        final List<List<PullHandlers.NoteView>> queued = new ArrayList<>();
        final List<Double> loopBeatsSeen = new ArrayList<>();
        ScriptedNotes queue(final List<PullHandlers.NoteView> notes) { queued.add(notes); return this; }
        @Override public List<PullHandlers.NoteView> readNotes(final double loopBeats) {
            loopBeatsSeen.add(loopBeats);
            if (queued.isEmpty()) { return List.of(); }
            return queued.remove(0);
        }
    }

    /**
     * Scripted ready-signal: returns a queue of (loopBeats) values per awaitNext
     * call. A negative value simulates a timeout; a non-negative value simulates
     * a fire with that loop length. Validates the arm()→awaitNext() sequence.
     */
    static final class ScriptedReadySignal implements LauncherGridWalker.ReadySignal {
        final List<Double> queued = new ArrayList<>();
        final AtomicInteger armCount = new AtomicInteger(0);
        final AtomicInteger awaitCount = new AtomicInteger(0);
        ScriptedReadySignal fire(final double loopBeats) { queued.add(loopBeats); return this; }
        ScriptedReadySignal timeout() { queued.add(-1.0); return this; }
        @Override public void arm() { armCount.incrementAndGet(); }
        @Override public double awaitNext(final long timeoutMs) {
            awaitCount.incrementAndGet();
            if (queued.isEmpty()) { return -1.0; }
            return queued.remove(0);
        }
    }

    // === Tests ===

    @Test
    void emptyGridReturnsEmptyTracksAndSceneNames() throws Exception {
        // No tracks × no scenes — the walk completes immediately with no cells.
        final LauncherGridWalker walker = new LauncherGridWalker(0, 0);
        final LauncherGridWalker.LauncherGridResponse grid = walker.walkGrid(
                new RecordingSelector(),
                new ScriptedHasContent(false),
                new ScriptedNotes(),
                new ScriptedReadySignal(),
                t -> "trk_" + t,
                t -> "Track " + t);
        assertNotNull(grid);
        assertTrue(grid.tracks.isEmpty(), "zero tracks → empty tracks array");
    }

    @Test
    void hasContentCellsReturnNotesAndCorrectClipSids() {
        // INV-P4-3: every hasContent=true cell returns notes + a per-cell clipSid.
        // Grid: 2 tracks × 2 scenes; (0,0), (0,1), (1,1) have content.
        final LauncherGridWalker walker = new LauncherGridWalker(2, 2);
        final RecordingSelector selector = new RecordingSelector();
        final ScriptedHasContent hasContent = new ScriptedHasContent(false)
                .set(0, 0, true).set(0, 1, true).set(1, 1, true);
        final PullHandlers.NoteView n1 = new PullHandlers.NoteView("n:60:0.0", 60, 0.0, 0.25, 100.0);
        final PullHandlers.NoteView n2 = new PullHandlers.NoteView("n:64:0.5", 64, 0.5, 0.125, 95.0);
        final PullHandlers.NoteView n3 = new PullHandlers.NoteView("n:67:0.0", 67, 0.0, 0.5, 110.0);
        final ScriptedNotes notes = new ScriptedNotes()
                .queue(List.of(n1)).queue(List.of(n2)).queue(List.of(n3));
        final ScriptedReadySignal ready = new ScriptedReadySignal()
                .fire(4.0).fire(8.0).fire(4.0);

        final LauncherGridWalker.LauncherGridResponse grid = walker.walkGrid(
                selector, hasContent, notes, ready, t -> "trk_" + t, t -> "Track " + t);

        assertEquals(2, grid.tracks.size());
        // Track 0: scenes 0 + 1 both have content.
        assertEquals(2, grid.tracks.get(0).scenes.size());
        final LauncherGridWalker.CellView c00 = grid.tracks.get(0).scenes.get(0);
        assertTrue(c00.hasContent);
        assertEquals(4.0, c00.loopBeats, 0.001);
        assertEquals(1, c00.notes.size());
        assertEquals(60, c00.notes.get(0).pitch());
        // clipSid uses the (trackSid, loopBeats, sceneIdx) overload —
        // different scenes → different clipSids.
        assertTrue(c00.clipSid.matches("^clip_[0-9a-f]{16}$"),
                "sceneIdx overload produces pattern-valid clipSid; got: " + c00.clipSid);
        final LauncherGridWalker.CellView c01 = grid.tracks.get(0).scenes.get(1);
        assertTrue(c01.hasContent);
        assertEquals(8.0, c01.loopBeats, 0.001);
        assertNotEquals(c00.clipSid, c01.clipSid,
                "different sceneIdx → different clipSid (D-12 disambiguator)");
        // Track 1: scene 0 empty, scene 1 has content.
        assertEquals(2, grid.tracks.get(1).scenes.size());
        final LauncherGridWalker.CellView c10 = grid.tracks.get(1).scenes.get(0);
        assertFalse(c10.hasContent);
        assertEquals(0, c10.notes.size());
        assertEquals("clip_0000000000000000", c10.clipSid,
                "empty cell falls back to pattern-valid zero sid");
        assertEquals(0.0, c10.loopBeats, 0.001);
        final LauncherGridWalker.CellView c11 = grid.tracks.get(1).scenes.get(1);
        assertTrue(c11.hasContent);
        assertEquals(67, c11.notes.get(0).pitch());

        // The walker called select() exactly 3 times (once per hasContent=true cell).
        assertEquals(3, selector.calls.size());
        // INV-P4-3 — every hasContent=true cell returns notes (none of the 3 are empty).
        for (final LauncherGridWalker.TrackRowView t : grid.tracks) {
            for (final LauncherGridWalker.CellView c : t.scenes) {
                if (c.hasContent) {
                    assertFalse(c.notes.isEmpty(),
                            "INV-P4-3: hasContent=true cell MUST return notes");
                } else {
                    assertTrue(c.notes.isEmpty(),
                            "hasContent=false cell MUST have empty notes");
                }
            }
        }
    }

    @Test
    void timeoutMarksCellEmptyAndAdvances() {
        // D-22: on per-cell timeout, the walker marks the cell empty + advances.
        // A missing/slow clip is NEVER fatal (producers leave gaps).
        final LauncherGridWalker walker = new LauncherGridWalker(1, 2);
        final ScriptedHasContent hasContent = new ScriptedHasContent(true); // both cells "have content"
        final ScriptedNotes notes = new ScriptedNotes().queue(List.of()); // never reached for the timeout cell
        final ScriptedReadySignal ready = new ScriptedReadySignal()
                .timeout()    // cell (0,0) times out
                .fire(4.0);   // cell (0,1) fires normally

        final LauncherGridWalker.LauncherGridResponse grid = walker.walkGrid(
                new RecordingSelector(), hasContent, notes, ready,
                t -> "trk_x", t -> "Track X");

        assertEquals(1, grid.tracks.size());
        assertEquals(2, grid.tracks.get(0).scenes.size());
        // Cell (0,0) timed out → marked empty.
        final LauncherGridWalker.CellView c0 = grid.tracks.get(0).scenes.get(0);
        assertFalse(c0.hasContent, "timeout → cell marked empty");
        assertEquals("clip_0000000000000000", c0.clipSid);
        assertTrue(c0.notes.isEmpty());
        // Cell (0,1) fired normally → has content.
        final LauncherGridWalker.CellView c1 = grid.tracks.get(0).scenes.get(1);
        assertTrue(c1.hasContent);
        assertEquals(4.0, c1.loopBeats, 0.001);
    }

    @Test
    void walkIsSequentialSelectOrderIsRowMajor() {
        // Pitfall 1: the cursor clip is a SINGLE shared resource — parallel
        // selects would race + observer coalescing would lose fires. The walk
        // is strictly sequential in row-major order (trackIdx outer, sceneIdx
        // inner). This test pins the call order against any future "optimization"
        // that tries to parallelize.
        final int T = 3, S = 3;
        final LauncherGridWalker walker = new LauncherGridWalker(T, S);
        final RecordingSelector selector = new RecordingSelector();
        final ScriptedHasContent hasContent = new ScriptedHasContent(true);
        final ScriptedNotes notes = new ScriptedNotes();
        final ScriptedReadySignal ready = new ScriptedReadySignal();
        for (int i = 0; i < T * S; i++) { ready.fire(4.0); notes.queue(List.of()); }

        walker.walkGrid(selector, hasContent, notes, ready, t -> "t" + t, t -> "T" + t);

        // All T*S cells were selected (every cell has content).
        assertEquals(T * S, selector.calls.size());
        // The order is row-major: (0,0), (0,1), (0,2), (1,0), ...
        for (int i = 0; i < selector.calls.size(); i++) {
            final int[] call = selector.calls.get(i);
            final int expectedT = i / S;
            final int expectedS = i % S;
            assertEquals(expectedT, call[0], "call " + i + " trackIdx");
            assertEquals(expectedS, call[1], "call " + i + " sceneIdx");
        }
        // arm() is called exactly once per awaited cell (every hasContent=true cell).
        assertEquals(T * S, ready.armCount.get());
        assertEquals(T * S, ready.awaitCount.get(),
                "armCount === awaitCount — one arm per await (Pitfall 1 race guard)");
    }

    @Test
    void emptyCellsSkipSelectAndAwait() {
        // hasContent=false cells MUST NOT call select() or arm() — they emit
        // empty + advance directly. This avoids unnecessary GUI focus moves
        // (Pitfall 7) on producer-left gaps.
        final LauncherGridWalker walker = new LauncherGridWalker(1, 3);
        final RecordingSelector selector = new RecordingSelector();
        final ScriptedHasContent hasContent = new ScriptedHasContent(false)
                .set(0, 1, true); // only the middle cell has content
        final ScriptedNotes notes = new ScriptedNotes().queue(List.of(
                new PullHandlers.NoteView("n:60:0", 60, 0.0, 0.25, 100.0)));
        final ScriptedReadySignal ready = new ScriptedReadySignal().fire(4.0);

        walker.walkGrid(selector, hasContent, notes, ready, t -> "t", t -> "T");

        // Only 1 select call (the hasContent=true cell).
        assertEquals(1, selector.calls.size());
        assertEquals(0, selector.calls.get(0)[0]);
        assertEquals(1, selector.calls.get(0)[1]);
        // Only 1 arm/await pair (empty cells skip both).
        assertEquals(1, ready.armCount.get());
        assertEquals(1, ready.awaitCount.get());
    }

    @Test
    void buildLauncherGridResponseCarriesD12Shape() throws Exception {
        // The response payload shape: {tracks:[{trackSid, name, scenes:[{
        // sceneIdx, clipSid, hasContent, loopBeats, notes:[NoteView]}]}],
        // sceneNames:[...]} (D-12).
        final PullHandlers.NoteView n = new PullHandlers.NoteView("n:60:0", 60, 0.0, 0.25, 100.0);
        final LauncherGridWalker.CellView cell = new LauncherGridWalker.CellView(
                0, "clip_a1b2c3d4e5f60718", true, 4.0, List.of(n));
        final LauncherGridWalker.TrackRowView track = new LauncherGridWalker.TrackRowView(
                "trk_x", "Kick", List.of(cell));
        final LauncherGridWalker.LauncherGridResponse grid = new LauncherGridWalker.LauncherGridResponse(
                List.of(track), Arrays.asList("Intro", "Build"));

        final String line = LauncherGridWalker.buildLauncherGridResponse("req-1", grid);
        assertTrue(line.endsWith("\n"), "response line ends with newline");
        final JsonNode resp = READER.readTree(line.substring(0, line.length() - 1));
        assertEquals("response", resp.get("type").asText());
        assertEquals("1.0", resp.get("version").asText());
        assertEquals("req-1", resp.get("id").asText());
        assertTrue(resp.get("ok").asBoolean());
        final JsonNode tracksNode = resp.get("payload").get("tracks");
        assertEquals(1, tracksNode.size());
        assertEquals("trk_x", tracksNode.get(0).get("trackSid").asText());
        assertEquals("Kick", tracksNode.get(0).get("name").asText());
        final JsonNode scenesNode = tracksNode.get(0).get("scenes");
        assertEquals(1, scenesNode.size());
        assertEquals(0, scenesNode.get(0).get("sceneIdx").asInt());
        assertEquals("clip_a1b2c3d4e5f60718", scenesNode.get(0).get("clipSid").asText());
        assertTrue(scenesNode.get(0).get("hasContent").asBoolean());
        assertEquals(4.0, scenesNode.get(0).get("loopBeats").asDouble(), 0.001);
        assertEquals(1, scenesNode.get(0).get("notes").size());
        assertEquals(60, scenesNode.get(0).get("notes").get(0).get("pitch").asInt());
        final JsonNode sceneNamesNode = resp.get("payload").get("sceneNames");
        assertEquals(2, sceneNamesNode.size());
        assertEquals("Intro", sceneNamesNode.get(0).asText());
        assertEquals("Build", sceneNamesNode.get(1).asText());
    }

    @Test
    void clipSidSceneIdxOverloadDisambiguatesSameTrackSameLength() {
        // D-12 grid-clip disambiguator: same track + same loop length + DIFFERENT
        // scene → different clipSid (the documented V1 same-track-same-length
        // collision is closed for grid clips).
        final String a = ClipSid.derive("trk_abc", 4.0, 0);
        final String b = ClipSid.derive("trk_abc", 4.0, 1);
        assertNotEquals(a, b, "same track + length + DIFFERENT scene → different clipSid");
        // All outputs match the STATE-04 family pattern.
        final Set<String> seen = new HashSet<>();
        for (final String s : Arrays.asList(a, b)) {
            assertTrue(s.matches("^clip_[0-9a-f]{16}$"),
                    "sceneIdx overload stays pattern-valid; got: " + s);
            seen.add(s);
        }
        assertEquals(2, seen.size(), "two different scenes → two distinct clipSids");
    }

    @Test
    void clipSidSceneIdxOverloadMatchesBasePatternAndIsStable() {
        // Deterministic + pattern-valid (same scene → same clipSid).
        final String a1 = ClipSid.derive("trk_xyz", 8.0, 3);
        final String a2 = ClipSid.derive("trk_xyz", 8.0, 3);
        assertEquals(a1, a2);
        assertTrue(a1.matches("^clip_[0-9a-f]{16}$"));
    }
}
