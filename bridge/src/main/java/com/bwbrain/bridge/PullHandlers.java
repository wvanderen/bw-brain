// bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java
//
// The pull half of the bridge transport (D-03): a daemon thread that reads
// inbound get.* request lines off the SAME loopback socket the Outbox writes to
// (one socket, two directions), dispatches each request, and offers the response
// line back through the shared Outbox (so the writer thread sends it).
//
//   get.selected_clip        -> enumerate cursorClip.getStep(channel, x, y) over
//                               the grid (channel 0), filter velocity>0, map to
//                               NoteView -> response
//   get.selected_device_chain-> (DEFERRED to Task-3 live verification, Open
//                               Question A1 / Pitfall 10) CursorDevice exposes no
//                               getRemoteControls() accessor in extension-api:21's
//                               public surface; the parameter-enumeration path is
//                               resolved live. Returns an empty pages list for now.
//   get.project_summary      -> snapshot the windowed TrackBank via Observers cache
//
// The Bitwig-facing enumeration only runs inside Bitwig (Task 3 live). The pure
// response builders (buildClipResponse / buildDeviceChainResponse /
// buildProjectSummaryResponse) are unit-tested WITHOUT live Bitwig.
package com.bwbrain.bridge;

import com.bitwig.extension.controller.api.NoteStep;
import com.bitwig.extension.controller.api.PinnableCursorClip;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class PullHandlers {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // Grid dims match createLauncherCursorClip(gridWidth, gridHeight) in
    // BridgeExtension. x = time column, y = pitch row. gridWidth=64 covers a
    // 4-bar clip at 16th-note resolution (the common producer case); longer/
    // finer clips will need paging via scrollToStep (deferred). The exact
    // note-vs-step semantics + grid-vs-clip-length coverage are confirmed live
    // in Task 3 (capabilities doc §2); velocity > 0 is the heuristic for "a
    // note is present here".
    static final int GRID_W = 64;
    static final int GRID_H = 128;

    private PullHandlers() {}

    // --- pure-logic view records (testable without live Bitwig) ---

    // Note fields use the DAEMON'S Note contract (diff-logic.ts): key, pitch
    // (0-127), start (beats), length (beats), velocity (1-127). The bridge owns
    // the grid->beats conversion (it knows Bitwig's loop length + step grid).
    public record NoteView(String key, int pitch, double start, double length, double velocity) {}

    public record RemoteView(String name, double value) {}

    public record PageView(String name, List<RemoteView> remotes) {}

    public record TrackView(int slot, String name) {}

    // --- pure-logic response builders (exercised by PullHandlersTest) ---

    public static String buildClipResponse(final String id, final List<NoteView> notes) {
        final List<Map<String, Object>> notesPayload = new ArrayList<>();
        for (final NoteView n : notes) {
            final Map<String, Object> nm = new LinkedHashMap<>();
            nm.put("key", n.key());
            nm.put("pitch", n.pitch());
            nm.put("start", n.start());
            nm.put("length", n.length());
            nm.put("velocity", n.velocity());
            notesPayload.add(nm);
        }
        return LineJson.response(id, true, Map.of("notes", notesPayload));
    }

    public static String buildDeviceChainResponse(final String id, final List<PageView> pages) {
        final List<Map<String, Object>> pagesPayload = new ArrayList<>();
        for (final PageView p : pages) {
            final List<Map<String, Object>> remotesPayload = new ArrayList<>();
            for (final RemoteView r : p.remotes()) {
                final Map<String, Object> rm = new LinkedHashMap<>();
                rm.put("name", r.name());
                rm.put("value", r.value());
                remotesPayload.add(rm);
            }
            final Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("name", p.name());
            pm.put("remotes", remotesPayload);
            pagesPayload.add(pm);
        }
        return LineJson.response(id, true, Map.of("pages", pagesPayload));
    }

    public static String buildProjectSummaryResponse(final String id, final List<TrackView> tracks) {
        final List<Map<String, Object>> tracksPayload = new ArrayList<>();
        for (final TrackView t : tracks) {
            final Map<String, Object> tm = new LinkedHashMap<>();
            tm.put("slot", t.slot());
            tm.put("name", t.name());
            tracksPayload.add(tm);
        }
        return LineJson.response(id, true, Map.of("tracks", tracksPayload));
    }

    // --- dispatch thread ---

    /**
     * Start the daemon pull-handler thread bound to the given already-connected
     * loopback socket. Reads request lines, dispatches, offers responses via the
     * shared Outbox (the writer thread sends them on the same socket).
     */
    public static Thread start(final Socket socket, final Outbox outbox,
                               final PinnableCursorClip cursorClip, final Observers observers) {
        final Thread t = new Thread(() -> runLoop(socket, outbox, cursorClip, observers),
                "bw-brain-pull");
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static void runLoop(final Socket socket, final Outbox outbox,
                                final PinnableCursorClip cursorClip, final Observers observers) {
        try (final Socket s = socket) {
            final BufferedReader in = new BufferedReader(
                    new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            String line;
            while ((line = in.readLine()) != null) {
                handle(line, outbox, cursorClip, observers);
            }
        } catch (final Exception e) {
            // socket closed / daemon shutdown — daemon-thread, just exit.
        }
    }

    private static void handle(final String rawLine, final Outbox outbox,
                               final PinnableCursorClip cursorClip, final Observers observers) {
        final JsonNode req;
        try {
            req = MAPPER.readTree(rawLine);
        } catch (final Exception e) {
            // Malformed request line — no id to echo; drop silently (the daemon
            // framing pipe rejects malformed envelopes before they reach here, but
            // be defensive).
            return;
        }
        final String id = req.has("id") ? req.get("id").asText() : "";
        final String type = req.has("type") ? req.get("type").asText() : "";
        try {
            switch (type) {
                case "get.selected_clip" -> outbox.offer(handleSelectedClip(id, cursorClip));
                case "get.selected_device_chain" -> outbox.offer(handleSelectedDeviceChain(id));
                case "get.project_summary" -> outbox.offer(handleProjectSummary(id, observers));
                // Phase 3 Plan 03-02 — apply.patch: 3-case primitive dispatch
                // (D-01 / Pitfall 7). The handler NEVER branches on the
                // semantic-intent metadata field — it stays three-case forever.
                case "apply.patch" -> outbox.offer(handleApplyPatch(id, req, cursorClip));
                default -> outbox.offer(LineJson.responseError(id, "unknown_request"));
            }
        } catch (final Exception e) {
            outbox.offer(LineJson.responseError(id, "internal"));
        }
    }

    private static String handleSelectedClip(final String id, final PinnableCursorClip cursorClip) {
        // Enumerate the step grid via Clip.getStep(channel, x, y) (channel 0) and
        // keep steps with velocity > 0. Map each NoteStep to the daemon's Note
        // contract (key/pitch/start-beats/length-beats/velocity-1-127) — the bridge
        // owns the grid->beats conversion since it knows Bitwig's loop length.
        // API signature confirmed from in-app Javadoc 6.0.6 (Clip.html):
        // NoteStep getStep(int channel, int x, int y).
        final double loopBeats;
        try {
            loopBeats = cursorClip.getLoopLength().get();
        } catch (final Exception e) {
            // Loop length unavailable — fall back to 1 beat/column.
            return buildClipResponse(id, enumerateNotes(cursorClip, 1.0));
        }
        final double beatsPerColumn = loopBeats > 0 ? loopBeats / GRID_W : 1.0;
        return buildClipResponse(id, enumerateNotes(cursorClip, beatsPerColumn));
    }

    private static List<NoteView> enumerateNotes(final PinnableCursorClip cursorClip,
                                                  final double beatsPerColumn) {
        final List<NoteView> notes = new ArrayList<>();
        for (int x = 0; x < GRID_W; x++) {
            for (int y = 0; y < GRID_H; y++) {
                final NoteStep step;
                try {
                    step = cursorClip.getStep(0, x, y);
                } catch (final Exception ignored) {
                    continue; // grid index out of range on this clip — skip
                }
                if (step == null) { continue; }
                final double vel01 = step.velocity();
                if (vel01 > 0.0) {
                    final int pitch = y;
                    final double start = x * beatsPerColumn;
                    final double length = step.duration(); // NoteStep.duration() is in beats
                    final int velocity = Math.max(1, (int) Math.round(vel01 * 127.0));
                    final String key = "n:" + pitch + ":" + String.format(java.util.Locale.ROOT, "%.4f", start);
                    notes.add(new NoteView(key, pitch, start, length, velocity));
                }
            }
        }
        return notes;
    }

    private static String handleSelectedDeviceChain(final String id) {
        // DEFERRED (Open Question A1 / Pitfall 10): CursorDevice exposes no
        // getRemoteControls()/parameter-page accessor in extension-api:21's public
        // surface (verified via javap this session). The CursorRemoteControlsPage
        // parameter-walk path — including whether VST/AU params populate it — is
        // resolved by the Task-3 live human-verify checkpoint. Until then, return
        // an empty pages list (valid response; the CLI shows "no parameters").
        // Task 3 records the finding (or fallback to direct parameter enumeration)
        // in docs/bitwig-capabilities.md §4.
        return buildDeviceChainResponse(id, List.of());
    }

    private static String handleProjectSummary(final String id, final Observers observers) {
        final Map<Integer, String> names = observers.getBankTrackNames();
        final List<TrackView> tracks = new ArrayList<>();
        for (int slot = 0; slot < observers.getBankSize(); slot++) {
            tracks.add(new TrackView(slot, names.getOrDefault(slot, "")));
        }
        return buildProjectSummaryResponse(id, tracks);
    }

    // ------------------------------------------------------------------------
    // Phase 3 Plan 03-02 Task 3 — apply.patch primitive dispatch (D-01 / Pitfall 7)
    // ------------------------------------------------------------------------

    /**
     * Functional interface for the NoteStep write surface. The pure {@link #applyOps}
     * helper calls this for every primitive op; the production {@link #handleApplyPatch}
     * wires it to {@code cursorClip.getStep(x,y,0).setVelocity().setDuration()}, and
     * the JUnit test injects a recording implementation (no Mockito in this project).
     */
    interface NoteStepWriter {
        /**
         * Write velocity + duration at grid column {@code x}, pitch row {@code y}.
         * Throwing (e.g. {@link IndexOutOfBoundsException}) signals a grid-out-of-range
         * cell — the per-op try/catch in {@link #applyOps} increments {@code failed}.
         */
        void write(int x, int y, double velocity, double duration);
    }

    /**
     * Pure primitive-op dispatch — the 3-CASE-FOREVER spine (D-01 / Pitfall 7).
     *
     * <p>Switches ONLY on the primitive op discriminant ({@code add_note} /
     * {@code remove_note} / {@code update_note_field}); NEVER reads the semantic-
     * intent metadata field (Pitfall 7 — the bridge handler is three-case forever;
     * new transforms emit the SAME primitives). Each op maps to a single
     * {@link NoteStepWriter#write} call via the beatsPerColumn -> grid column
     * mapping; an out-of-range cell (writer throws) increments {@code failed}
     * without crashing the handler.</p>
     *
     * <p>Package-private so {@link PullHandlersApplyPatchTest} can exercise the
     * dispatch with a recording writer (no live Bitwig).</p>
     *
     * @param id             the echoed request id.
     * @param ops            the operations JSON array ({payload.operations}).
     * @param beatsPerColumn loopBeats / GRID_W (start-beats -> grid column).
     * @param writer         the NoteStep write surface (production = cursorClip; test = recording).
     * @return the JSON-Lines response ({applied, failed} payload).
     */
    static String applyOps(final String id, final JsonNode ops, final double beatsPerColumn,
                           final NoteStepWriter writer) {
        if (ops == null || !ops.isArray() || ops.isEmpty()) {
            return LineJson.responseError(id, "invalid_patch");
        }
        int applied = 0;
        int failed = 0;
        final List<Map<String, Object>> failureDetails = new ArrayList<>();
        for (final JsonNode opNode : ops) {
            final String opType = opNode.path("op").asText("");
            try {
                switch (opType) {
                    case "add_note" -> {
                        final JsonNode n = opNode.path("note");
                        final int x = (int) Math.round(n.path("start").asDouble() / beatsPerColumn);
                        final int y = n.path("pitch").asInt();
                        writer.write(x, y, n.path("velocity").asDouble(), n.path("length").asDouble());
                        applied++;
                    }
                    case "remove_note" -> {
                        final JsonNode n = opNode.path("note");
                        final int x = (int) Math.round(n.path("start").asDouble() / beatsPerColumn);
                        final int y = n.path("pitch").asInt();
                        // velocity 0 = no note (mirrors the read heuristic at line 173).
                        writer.write(x, y, 0.0, 0.0);
                        applied++;
                    }
                    case "update_note_field" -> {
                        // Identity-stable (Pitfall 2): before.key === after.key;
                        // pitch+start unchanged, only velocity/length mutate.
                        // Dispatch on the `after` note (the new content).
                        final JsonNode after = opNode.path("after");
                        final int x = (int) Math.round(after.path("start").asDouble() / beatsPerColumn);
                        final int y = after.path("pitch").asInt();
                        writer.write(x, y, after.path("velocity").asDouble(), after.path("length").asDouble());
                        applied++;
                    }
                    default -> failed++; // unknown op — daemon pre-validates; defensive
                }
            } catch (final Exception e) {
                failed++; // grid out of range, etc. — do not crash the handler
                final Map<String, Object> fd = new LinkedHashMap<>();
                fd.put("op", opType);
                fd.put("start", opNode.path("note").path("start").asDouble(opNode.path("after").path("start").asDouble()));
                fd.put("pitch", opNode.path("note").path("pitch").asInt(opNode.path("after").path("pitch").asInt()));
                fd.put("beatsPerColumn", beatsPerColumn);
                fd.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                failureDetails.add(fd);
            }
        }
        final Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("applied", applied);
        payload.put("failed", failed);
        payload.put("failures", failureDetails);
        return LineJson.response(id, failed == 0, payload);
    }

    /**
     * Bridge-facing apply.patch handler: read the loop length, compute
     * beatsPerColumn, and delegate to {@link #applyOps} with a writer backed by
     * {@code cursorClip.getStep(x,y,0)} NoteStep setters (capabilities §2 VERIFIED:
     * NoteStep exposes setVelocity / setDuration / etc.).
     *
     * <p>Falls back to 1.0 beat/column when the loop length is 0/unknown
     * (BridgeExtension.java:64 default is 16x128 launcher clip).</p>
     */
    private static String handleApplyPatch(final String id, final JsonNode req,
                                            final PinnableCursorClip cursorClip) {
        final JsonNode ops = req.path("payload").path("operations");
        final double loopBeats;
        try {
            loopBeats = cursorClip.getLoopLength().get();
        } catch (final Exception e) {
            // Loop length unavailable — fall back to 1 beat/column.
            return applyOps(id, ops, 1.0, cursorClipWriter(cursorClip));
        }
        final double beatsPerColumn = loopBeats > 0 ? loopBeats / GRID_W : 1.0;
        return applyOps(id, ops, beatsPerColumn, cursorClipWriter(cursorClip));
    }

    /** Build a NoteStepWriter backed by the live cursor clip's NoteStep setters. */
    private static NoteStepWriter cursorClipWriter(final PinnableCursorClip cursorClip) {
        // getStep signature is (channel, x, y) — see handleSelectedClip. channel 0.
        // Velocity: the daemon stores/imports velocity in MIDI 0-127, but Bitwig's
        // NoteStep.setVelocity expects 0.0-1.0 (live finding 2026-06-30: passing
        // 119.0 throws "Parameter velocity must be in the range 0.0 to 1.0"). Scale
        // here at the bridge boundary so the daemon's contract stays 0-127.
        // remove_note ops pass velocity 0.0 (0/127 = 0.0 = no note — valid).
        return (x, y, velocity, duration) -> {
            final NoteStep step = cursorClip.getStep(0, x, y);
            step.setVelocity(Math.max(0.0, Math.min(1.0, velocity / 127.0)));
            step.setDuration(duration);
        };
    }
}
