// bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java
//
// The pull half of the bridge transport (D-03): a daemon thread that reads
// inbound get.* request lines off the SAME loopback socket the Outbox writes to
// (one socket, two directions), dispatches each request, and offers the response
// line back through the shared Outbox (so the writer thread sends it).
//
//   get.selected_clip        -> enumerate cursorClip.getStep(x,y,0) over the grid,
//                               filter velocity>0, map to NoteView -> response
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

    // Grid dims match createLauncherCursorClip(16, 128). x = time column,
    // y = pitch row. The exact note-vs-step semantics are confirmed live in
    // Task 3; velocity > 0 is the heuristic for "a note is present here".
    static final int GRID_W = 16;
    static final int GRID_H = 128;

    private PullHandlers() {}

    // --- pure-logic view records (testable without live Bitwig) ---

    public record NoteView(int x, int y, double velocity, double duration) {}

    public record RemoteView(String name, double value) {}

    public record PageView(String name, List<RemoteView> remotes) {}

    public record TrackView(int slot, String name) {}

    // --- pure-logic response builders (exercised by PullHandlersTest) ---

    public static String buildClipResponse(final String id, final List<NoteView> notes) {
        final List<Map<String, Object>> notesPayload = new ArrayList<>();
        for (final NoteView n : notes) {
            final Map<String, Object> nm = new LinkedHashMap<>();
            nm.put("x", n.x());
            nm.put("y", n.y());
            nm.put("velocity", n.velocity());
            nm.put("duration", n.duration());
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
                default -> outbox.offer(LineJson.responseError(id, "unknown_request"));
            }
        } catch (final Exception e) {
            outbox.offer(LineJson.responseError(id, "internal"));
        }
    }

    private static String handleSelectedClip(final String id, final PinnableCursorClip cursorClip) {
        // Enumerate the step grid via Clip.getStep(x, y, scene) and keep steps
        // with velocity > 0 (a note is present). The grid dims, scene indexing,
        // and note-vs-rest semantics are confirmed live in Task 3 (capabilities
        // doc §2); velocity>0 is the conservative heuristic for now.
        final List<NoteView> notes = new ArrayList<>();
        for (int x = 0; x < GRID_W; x++) {
            for (int y = 0; y < GRID_H; y++) {
                final NoteStep step;
                try {
                    step = cursorClip.getStep(x, y, 0);
                } catch (final Exception ignored) {
                    continue; // grid index out of range on this clip — skip
                }
                if (step == null) { continue; }
                final double vel = step.velocity();
                if (vel > 0.0) {
                    notes.add(new NoteView(x, y, vel, step.duration()));
                }
            }
        }
        return buildClipResponse(id, notes);
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
}
