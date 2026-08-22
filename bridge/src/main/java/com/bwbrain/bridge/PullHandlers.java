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
//   get.project-meta (05-03) -> tempo/timeSignature from the Observers pull-only
//                               transport caches (D-05-16)
//
// The Bitwig-facing enumeration only runs inside Bitwig (Task 3 live). The pure
// response builders (buildClipResponse / buildDeviceChainResponse /
// buildProjectSummaryResponse) are unit-tested WITHOUT live Bitwig.
package com.bwbrain.bridge;

import com.bitwig.extension.controller.api.CursorDevice;
import com.bitwig.extension.controller.api.NoteStep;
import com.bitwig.extension.controller.api.ClipLauncherSlotBank;
import com.bitwig.extension.controller.api.PinnableCursorClip;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
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
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

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

    /**
     * Phase 5 Plan 05-03 Task 3 — one chain device (AUTO-04). {@code deviceSid}
     * is the Observers.deriveDeviceSid fingerprint (dev_ + 16-hex) — the SAME
     * value the parameter.changed {@code deviceKey} carries, which is the
     * AutomationScope deviceSid the 05-05 apply path will compare
     * like-for-like (T-05-07).
     */
    public record DeviceView(String deviceSid, String name, boolean isPlugin, int position) {}

    /**
     * Phase 5 Plan 05-03 Task 3 — one bound parameter (device window index or
     * remote-page slot). {@code source} is the parameter.changed vocabulary:
     * "device_parameter" (the bounded getParameter window — the A1-NEGATED
     * fallback surface) or "remote_page" (native macro knobs).
     */
    public record ParamView(String deviceKey, int paramIndex, String paramName, double value, String source) {}

    /**
     * Snapshot inputs for the Phase 04.1 controller capability request.
     * Only values already observed by the existing read-only controller
     * surface belong here; absent project/document identity is represented in
     * the response explicitly rather than guessed from a track or device name.
     */
    public record ClapCapabilityView(String selectedDeviceName, boolean selectedDeviceObserved) {}

    // --- pure-logic response builders (exercised by PullHandlersTest) ---

    public static String buildClipResponse(final String id, final List<NoteView> notes, final String clipSid) {
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
        // D-03b (Phase 03.1-02): top-level clipSid alongside notes. Response
        // payloads are open at the envelope level (LineJson.response carries
        // arbitrary Map<String,?>), so no response-schema change. The daemon
        // reads resp.clipSid in (a) handleMidiInspect + (b) refreshSnapshot
        // (boot.ts D-03d reconcile-on-reconnect).
        final Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("notes", notesPayload);
        payload.put("clipSid", clipSid);
        return LineJson.response(id, true, payload);
    }

    public static String buildDeviceChainResponse(final String id, final List<PageView> pages) {
        // Phase 5 Plan 05-03 Task 3: legacy pages-only overload — delegates to
        // the full assembly with empty devices/parameters (backward compat for
        // PullHandlersTest's pages-shape pins).
        return buildDeviceChainResponse(id, List.of(), List.of(), pages);
    }

    /**
     * Phase 5 Plan 05-03 Task 3 — real device-chain response assembly
     * (AUTO-04 / D-05-03). Pure builder over view records (no Bitwig types —
     * the PullHandlersTest/ApplyPatchTest discipline): devices from the
     * DeviceBank chain cache, parameters from the bound parameter-window +
     * remote-page caches, pages retained for the CLI device-inspect consumer.
     *
     * <p>Replaces the A1-NEGATED empty-pages stub. Finding history: on
     * 2026-06-29 the Phase-2 UAT live-verified (Surge XT + javap) that VST/AU
     * parameters do NOT surface via CursorRemoteControlsPage and that
     * CursorDevice exposes no getRemoteControls() in extension-api:21 — the
     * response returned an empty pages list by design. Phase 5 (D-05-03)
     * closes the gap with the bounded getParameter(int) window + page-knob
     * observation; this builder shapes that evidence for the wire.</p>
     */
    public static String buildDeviceChainResponse(final String id,
                                                   final List<DeviceView> devices,
                                                   final List<ParamView> parameters,
                                                   final List<PageView> pages) {
        final List<Map<String, Object>> devicesPayload = new ArrayList<>();
        for (final DeviceView d : devices) {
            final Map<String, Object> dm = new LinkedHashMap<>();
            dm.put("deviceSid", d.deviceSid());
            dm.put("name", d.name());
            dm.put("isPlugin", d.isPlugin());
            dm.put("position", d.position());
            devicesPayload.add(dm);
        }
        final List<Map<String, Object>> paramsPayload = new ArrayList<>();
        for (final ParamView p : parameters) {
            final Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("deviceKey", p.deviceKey());
            pm.put("paramIndex", p.paramIndex());
            pm.put("paramName", p.paramName());
            pm.put("value", p.value());
            pm.put("source", p.source());
            paramsPayload.add(pm);
        }
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
        final Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("devices", devicesPayload);
        payload.put("parameters", paramsPayload);
        payload.put("pages", pagesPayload);
        return LineJson.response(id, true, payload);
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

    /**
     * Phase 5 Plan 05-03 (D-05-16) — pure project-meta response builder.
     * Reads NO Bitwig state (the dispatch case passes the Observers pull-only
     * caches), so it is JUnit-testable without a live host (the
     * buildDeviceChainResponse precedent).
     *
     * <p>{@code name} is the honest empty string: Project exposes no document
     * name in extension-api:21 (javap-verified — the ClapCapabilityView
     * projectDocument finding above). The daemon's DEFAULT_PROJECT carries
     * the same shape, so the boot fold (boot.ts foldProjectMeta) can overlay
     * tempo/timeSignature without a name mismatch ever masquerading as a
     * real project name.</p>
     */
    public static String buildProjectMetaResponse(final String id, final double tempo, final String timeSignature) {
        final Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", "");
        payload.put("tempo", tempo);
        payload.put("timeSignature", timeSignature);
        return LineJson.response(id, true, payload);
    }

    /** Build the read-only Controller API evidence response for the CLAP gate. */
    static String buildClapCapabilityResponse(final String id, final ClapCapabilityView view) {
        final boolean nameAvailable = view.selectedDeviceObserved()
                && view.selectedDeviceName() != null
                && !view.selectedDeviceName().isBlank();

        final Map<String, Object> projectDocument = new LinkedHashMap<>();
        // extension-api:21 Project exposes isModified(), but neither Project nor
        // DocumentState exposes a document name, path, stable ID, or Save As
        // event. Null + availability flags make that absence machine-readable.
        projectDocument.put("name", null);
        projectDocument.put("nameAvailable", false);
        projectDocument.put("path", null);
        projectDocument.put("pathAvailable", false);
        projectDocument.put("stableId", null);
        projectDocument.put("stableIdAvailable", false);
        projectDocument.put("saveAsObservable", false);

        final Map<String, Object> selectedDevice = new LinkedHashMap<>();
        selectedDevice.put("name", nameAvailable ? view.selectedDeviceName() : null);
        selectedDevice.put("nameAvailable", nameAvailable);
        selectedDevice.put("selected", nameAvailable);

        final Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("apiSurface", "controller-api:21");
        payload.put("projectDocument", projectDocument);
        payload.put("selectedDevice", selectedDevice);
        return LineJson.response(id, true, payload);
    }

    /**
     * Narrow dispatch seam proving the capability probe recognizes exactly one
     * read-only request. Mutation-shaped messages are never handled here and
     * remain owned by the pre-existing top-level apply.patch path.
     */
    static Optional<String> dispatchClapCapabilityRequest(final String type, final String id,
                                                           final ClapCapabilityView view) {
        if (!"get.clap_capabilities".equals(type)) {
            return Optional.empty();
        }
        return Optional.of(buildClapCapabilityResponse(id, view));
    }

    // --- dispatch thread ---

    /**
     * Start the daemon pull-handler thread bound to the given already-connected
     * loopback socket. Reads request lines, dispatches, offers responses via the
     * shared Outbox (the writer thread sends them on the same socket).
     *
     * <p>Phase 5 Plan 05-03 Task 3: {@code cursorDevice} joins the signature
     * (created at BridgeExtension.java:84, threaded through runConnectorCycle —
     * Pitfall 3). Pure plumbing in this plan: the apply path stays note-only
     * until 05-06. Null-safe: the reconnect-test path passes null proxies and
     * no line exercises the device path.</p>
     */
    public static Thread start(final Socket socket, final Outbox outbox,
                                final PinnableCursorClip cursorClip,
                                final CursorDevice cursorDevice,
                                final Observers observers,
                                final LauncherGridWalker walker) {
        final Thread t = new Thread(() -> runLoop(socket, outbox, cursorClip, cursorDevice, observers, walker),
                "bw-brain-pull");
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static void runLoop(final Socket socket, final Outbox outbox,
                                final PinnableCursorClip cursorClip,
                                final CursorDevice cursorDevice,
                                final Observers observers,
                                final LauncherGridWalker walker) {
        try (final Socket s = socket) {
            final BufferedReader in = new BufferedReader(
                    new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            String line;
            while ((line = in.readLine()) != null) {
                handle(line, outbox, cursorClip, cursorDevice, observers, walker);
            }
        } catch (final Exception e) {
            // socket closed / daemon shutdown — daemon-thread, just exit.
        }
    }

    private static void handle(final String rawLine, final Outbox outbox,
                               final PinnableCursorClip cursorClip,
                               final CursorDevice cursorDevice,
                               final Observers observers,
                               final LauncherGridWalker walker) {
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
                case "get.selected_clip" -> outbox.offer(handleSelectedClip(id, cursorClip, observers));
                case "get.selected_device_chain" -> outbox.offer(handleSelectedDeviceChain(id, observers));
                case "get.project_summary" -> outbox.offer(handleProjectSummary(id, observers));
                // Phase 5 Plan 05-03 (D-05-16) — real project meta from the
                // Observers pull-only transport caches. Closes the M1
                // tempo=120 limitation (02-07 Minor 3); the request enum
                // member landed in 05-01 (schema-first ordering, Pitfall 8).
                case "get.project_meta" -> outbox.offer(
                        buildProjectMetaResponse(id, observers.getTempo(), observers.getTimeSignature()));
                case "get.clap_capabilities" -> outbox.offer(dispatchClapCapabilityRequest(type, id,
                        new ClapCapabilityView(observers.getCursorDeviceName(),
                                !observers.getCursorDeviceName().isBlank())).orElseThrow());
                case "get.clap_correlation" -> outbox.offer(ClapCorrelation.dispatch(type, id, req.path("payload"),
                        new ClapCorrelation.SelectionEvidence(
                                observers.getCursorSlot(),
                                observers.getCursorTrackName(),
                                observers.getCursorDeviceName(),
                                !observers.getCursorDeviceName().isBlank())).orElseThrow());
                // Phase 3 Plan 03-02 — apply.patch: 3-case primitive dispatch
                // (D-01 / Pitfall 7). The handler NEVER branches on the
                // semantic-intent metadata field — it stays three-case forever.
                // Phase 5 Plan 05-03: cursorDevice is now IN scope (Pitfall 3
                // plumbing) but deliberately NOT consumed here yet — the
                // automation write path lands in 05-06 behind the probe.
                case "apply.patch" -> outbox.offer(handleApplyPatch(id, req, cursorClip));
                // Phase 4 Plan 04-01 (D-01) — launcher grid cursor-walk. Additive
                // to the dispatch switch (sibling to get.selected_clip). The
                // handler delegates to LauncherGridWalker.walkGrid; the walker
                // is null in tests (BridgeExtensionReconnectTest) — return the
                // "internal" error arm so the dispatch stays total.
                case "get.launcher_clips" -> outbox.offer(handleLauncherGrid(id, cursorClip, observers, walker));
                default -> outbox.offer(LineJson.responseError(id, "unknown_request"));
            }
        } catch (final Exception e) {
            outbox.offer(LineJson.responseError(id, "internal"));
        }
    }

    private static String handleSelectedClip(final String id, final PinnableCursorClip cursorClip,
                                               final Observers observers) {
        // Enumerate the step grid via Clip.getStep(channel, x, y) (channel 0) and
        // keep steps with velocity > 0. Map each NoteStep to the daemon's Note
        // contract (key/pitch/start-beats/length-beats/velocity-1-127) — the bridge
        // owns the grid->beats conversion since it knows Bitwig's loop length.
        // API signature confirmed from in-app Javadoc 6.0.6 (Clip.html):
        // NoteStep getStep(int channel, int x, int y).
        //
        // D-03b (Phase 03.1-02): derive the V1 clipSid from the parent cursor
        // track name + the live loop length (ClipSid.derive is the SAME hash
        // used by the D-03a push path, so push + pull agree). On the
        // loop-length-unavailable fallback, pass the pattern-valid constant
        // clip_0000000000000000 so the response is never missing clipSid
        // (the daemon's pre-flight catches any mismatch downstream).
        final double loopBeats;
        try {
            loopBeats = cursorClip.getLoopLength().get();
        } catch (final Exception e) {
            // Loop length unavailable — fall back to 1 beat/column + the
            // pattern-valid clipSid fallback so the response shape is preserved.
            return buildClipResponse(id, enumerateNotes(cursorClip, 1.0),
                    "clip_0000000000000000");
        }
        final double beatsPerColumn = loopBeats > 0 ? loopBeats / GRID_W : 1.0;
        final String clipSid = ClipSid.derive(observers.getCursorTrackName(), loopBeats);
        return buildClipResponse(id, enumerateNotes(cursorClip, beatsPerColumn), clipSid);
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

    /**
     * Phase 5 Plan 05-03 Task 3 — REAL device-chain assembly (AUTO-04 /
     * D-05-03), replacing the A1-NEGATED empty-pages stub that lived here
     * since Phase 2. Finding history: 2026-06-29 live-verified (Surge XT +
     * javap) that VST/AU parameters do NOT surface via
     * CursorRemoteControlsPage and CursorDevice exposes no getRemoteControls()
     * in extension-api:21 — the handler returned an empty pages list "by
     * design" (the honest M1 floor). Phase 5 closes the gap: the Observers
     * caches now hold the chain membership (DeviceBank), the bounded
     * parameter window, and the remote-page knobs, and this handler shapes
     * them into the wire response.
     *
     * <p>Assembly rules:</p>
     * <ul>
     *   <li>devices — chain slots with a NON-BLANK name (the phantom-tail
     *       trim precedent) carrying the deviceSid fingerprint;</li>
     *   <li>parameters — ONLY bound entries (exists cache true with a cached
     *       value): the fixed device window as {@code device_parameter} plus
     *       page knobs as {@code remote_page}, all keyed by the CURSOR
     *       device's deviceKey (the same fingerprint parameter.changed
     *       carries — the 05-05 AutomationScope pin);</li>
     *   <li>pages — retained from the remote-page cache (the CLI
     *       device-inspect consumer contract, Test 4 backward compat).</li>
     * </ul>
     *
     * <p>Null-guarded (Pitfall 8): a null observers (reconnect-test path)
     * returns {@code "internal"} so the dispatch stays total.</p>
     */
    private static String handleSelectedDeviceChain(final String id, final Observers observers) {
        if (observers == null) {
            return LineJson.responseError(id, "internal");
        }
        // devices: chain membership from the DeviceBank cache.
        final List<DeviceView> devices = new ArrayList<>();
        final String trackName = observers.getCursorTrackName();
        for (int slot = 0; slot < observers.getDeviceBankSize(); slot++) {
            final String name = observers.getChainDeviceName(slot);
            if (name == null || name.isBlank()) {
                continue; // phantom/unpopulated bank tail — not chain membership
            }
            final int position = observers.getChainDevicePosition(slot);
            devices.add(new DeviceView(
                    Observers.deriveDeviceSid(trackName, name, position),
                    name,
                    observers.isChainDevicePlugin(slot),
                    position));
        }
        // parameters: the cursor device's deviceKey for BOTH sources (the
        // window and the page both observe the selected device — the
        // parameter.changed deviceKey IS this value).
        final String deviceKey = Observers.deriveDeviceSid(trackName,
                observers.getCursorDeviceName(), observers.getCursorDevicePosition());
        final List<ParamView> parameters = new ArrayList<>();
        for (int i = 0; i < Observers.PARAM_WINDOW; i++) {
            if (!observers.isParamBound(i)) {
                continue; // exists() absent — walk termination honored (Test 2)
            }
            final Double value = observers.getParamValue(i);
            if (value == null) {
                continue; // bound but never fired — honest omission over a fabricated 0.0
            }
            parameters.add(new ParamView(deviceKey, i, observers.getParamName(i),
                    value.doubleValue(), "device_parameter"));
        }
        for (int i = 0; i < Observers.REMOTE_PAGE_SIZE; i++) {
            if (!observers.isRemoteBound(i)) {
                continue;
            }
            final Double value = observers.getRemoteValue(i);
            if (value == null) {
                continue;
            }
            parameters.add(new ParamView(deviceKey, i, observers.getRemoteName(i),
                    value.doubleValue(), "remote_page"));
        }
        // pages: retained for the legacy CLI consumer (bound knobs only).
        final List<RemoteView> remotes = new ArrayList<>();
        for (int i = 0; i < Observers.REMOTE_PAGE_SIZE; i++) {
            if (!observers.isRemoteBound(i)) {
                continue;
            }
            final Double value = observers.getRemoteValue(i);
            if (value == null) {
                continue;
            }
            remotes.add(new RemoteView(observers.getRemoteName(i), value.doubleValue()));
        }
        final List<PageView> pages = remotes.isEmpty()
                ? List.of()
                : List.of(new PageView(observers.getRemotePageName(), remotes));
        return buildDeviceChainResponse(id, devices, parameters, pages);
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

    // ------------------------------------------------------------------------
    // Phase 4 Plan 04-01 Task 1 — get.launcher_clips cursor-walk handler (D-01).
    // ------------------------------------------------------------------------

    /**
     * D-01 launcher-grid enumeration. Delegates to
     * {@link LauncherGridWalker#walkGrid} with the Bitwig bindings built from
     * the live {@code cursorClip} + {@code observers.getTrackBank()}.
     *
     * <p>Per-cell flow (RESEARCH §Pattern 3):</p>
     * <ol>
     *   <li>Read hasContent from {@code trackBank.getItemAt(t)
     *       .clipLauncherSlotBank().getItemAt(s).hasContent().get()}.</li>
     *   <li>If true: publish a fresh {@link CountDownLatch} via
     *       {@link Observers#setWalkerReadyLatch}, call
     *       {@code slotBank.select(s)}, await the latch (the
     *       {@code cursorClip.getLoopLength()} observer — wired once in
     *       {@link Observers#register} — counts it down on the controller
     *       thread). On timeout (D-22 500ms default), mark empty + advance (a
     *       missing clip is never fatal — Pitfall 1/4).</li>
     *   <li>On fire: read loopBeats via {@code cursorClip.getLoopLength().get()},
     *       then {@code enumerateNotes(cursorClip, loopBeats/GRID_W)} for the
     *       NoteStep grid (lifted from {@link #handleSelectedClip}).</li>
     * </ol>
     *
     * <p>Null-guarded: if {@code walker == null} (BridgeExtensionReconnectTest
     * path — no Bitwig host), returns {@link LineJson#responseError} with
     * {@code "internal"} so the dispatch stays total (Pitfall 8 — never throw
     * into the void).</p>
     */
    private static String handleLauncherGrid(final String id,
                                              final PinnableCursorClip cursorClip,
                                              final Observers observers,
                                              final LauncherGridWalker walker) {
        if (walker == null || cursorClip == null || observers == null
                || observers.getTrackBank() == null) {
            // Test path (no Bitwig host) OR pre-init race — return internal so
            // the dispatch is total (Pitfall 8). The daemon treats the response
            // as a transient error + surfaces to the CLI.
            return LineJson.responseError(id, "internal");
        }
        final TrackBank trackBank = observers.getTrackBank();

        // Phase 4 Plan 04.3-06 (04.3 gap closure / DEFECT A bridge half) —
        // SYNC-BEFORE-WALK. The 2026-08-21 live UAT proved the FIRST pull
        // after connect completes fast against UNSYNCED banks (empty
        // trackSids, all 128 cells hasContent:false → poisoned snapshot),
        // while later populated-but-slower walks exceeded the daemon's 3000ms
        // pull timeout and were dropped by the correlator. Block here until
        // the bank-observation burst settles (threshold OR quiet, capped at
        // 5s), so walkGrid reads populated caches.
        //
        // minExpectedObservations derives from the same constants that size
        // the banks: BANK_SIZE track-name observers + SCENE_COUNT scene-name
        // observers + BANK_SIZE×SCENE_COUNT hasContent observers (derived
        // from the live BridgeExtension sizing; no hard-coded threshold).
        //
        // Why post-walk re-stamping of trackSids is deliberately NOT done:
        // ClipSid.derive pins each cell's clipSid hash to the trackSid
        // captured when the walker entered the row (used during DRAINING), so
        // rewriting row trackSids after the walk would desynchronize row
        // identity from cell clipSids. The honest mechanism is
        // settle-before-walk (here) plus the daemon-side refuse-to-persist
        // write gate from Plan 04.3-07 — layered defense: if the sync budget
        // expires, this walk still proceeds (never hangs, never throws into
        // the void) and answers an incomplete grid AS-IS for the daemon to
        // refuse downstream.
        //
        // Steady-state cost: on a settled bank the wait returns immediately
        // (threshold met, or lastBankObservationAt is old so the quiet check
        // passes on the first poll with 0 waited) — repeated pulls pay no
        // latency.
        // The threshold is REQUEST-RELATIVE, not a lifetime absolute. The
        // observer counter is cumulative; using the bare 152 threshold meant
        // it stayed permanently satisfied after init and every later pull
        // skipped the quiet window, including pulls racing a project-tab
        // switch. Anchor the full-population target at this request's count.
        // A partial project-switch burst normally exits through QUIET; a full
        // repopulation may reach this request-relative threshold first.
        final int observationsAtRequest = observers.getBankObservationCount();
        final int observationsPerFullPopulation = observers.getBankSize()
                + observers.getSceneBankSize()
                + (observers.getBankSize() * observers.getSceneBankSize());
        final int minExpectedBankObservations = observationsAtRequest > Integer.MAX_VALUE - observationsPerFullPopulation
                ? Integer.MAX_VALUE
                : observationsAtRequest + observationsPerFullPopulation;
        BankSyncWait.awaitSettled(
                System::currentTimeMillis,
                observers::getBankObservationCount,
                observers::getLastBankObservationAt,
                minExpectedBankObservations,
                BankSyncWait.BANK_SYNC_SETTLE_MS,
                BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                Thread::sleep);

        // Ready-signal: per-cell CountDownLatch published to Observers via
        // setWalkerReadyLatch; the loopLength observer (wired once in register)
        // counts it down on fire. Observers.clearWalkerReadyLatch guards against
        // a stale fire bleeding into the next cell (the observer itself also
        // clears the slot after countDown). The cell-scoped holder (pending[0])
        // keeps a local ref so awaitNext can block on the exact latch arm() set
        // even if Observers clears its slot during a timeout cleanup race.
        final CountDownLatch[] pending = new CountDownLatch[1];
        final LauncherGridWalker.ReadySignal readySignal = new LauncherGridWalker.ReadySignal() {
            @Override public void arm() {
                final CountDownLatch l = new CountDownLatch(1);
                pending[0] = l;
                observers.setWalkerReadyLatch(l);
            }
            @Override public double awaitNext(final long timeoutMs) {
                final CountDownLatch l = pending[0];
                pending[0] = null;
                if (l == null) { return -1.0; }
                try {
                    if (!l.await(timeoutMs, TimeUnit.MILLISECONDS)) {
                        observers.clearWalkerReadyLatch();
                        // A same-length clip does not necessarily fire the
                        // loopLength observer. The slot was already proven
                        // populated by subscribed hasContent, so retain it
                        // when the cursor exposes a positive current length.
                        return currentLoopBeats();
                    }
                } catch (final InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    observers.clearWalkerReadyLatch();
                    return -1.0;
                }
                // Fire — read the loop length the cursor clip now reports.
                return currentLoopBeats();
            }
            private double currentLoopBeats() {
                try {
                    final double loopBeats = cursorClip.getLoopLength().get();
                    return loopBeats > 0 ? loopBeats : -1.0;
                } catch (final Exception e) {
                    return -1.0;
                }
            }
        };
        final LauncherGridWalker.SlotSelector selector = (t, s) ->
                trackBank.getItemAt(t).clipLauncherSlotBank().select(s);
        // Every slot BooleanValue was subscribed eagerly during init. Read the
        // subscribed LIVE value at walk time so a project-switch callback that
        // has not yet published into the cache cannot produce an all-false
        // snapshot. The observer cache remains a defensive fallback for a
        // transient Bitwig accessor failure. (The original unsafe direct read
        // happened before subscription; this read is explicitly post-subscribe.)
        final LauncherGridWalker.HasContentReader hasContent = (t, s) -> {
            try {
                final ClipLauncherSlotBank slotBank = trackBank.getItemAt(t).clipLauncherSlotBank();
                if (slotBank != null) return slotBank.getItemAt(s).hasContent().get();
            } catch (final Exception e) {
                // Fall through to the last observer-published value.
            }
            return observers.getHasContent(t, s);
        };
        final LauncherGridWalker.NotesReader notes = loopBeats -> {
            final double beatsPerColumn = loopBeats > 0 ? loopBeats / GRID_W : 1.0;
            return enumerateNotes(cursorClip, beatsPerColumn);
        };
        // V1 trackSid: the raw cursor track name (STATE-04 reconciles downstream;
        // ClipSid.derive is opaque to trackSid-vs-name — same convention as
        // Observers.wireCursorClip).
        final java.util.function.IntFunction<String> trackSidFor = t ->
                observers.getBankTrackNames().getOrDefault(t, "");
        final java.util.function.IntFunction<String> trackNameFor = t ->
                observers.getBankTrackNames().getOrDefault(t, "");

        final int originalTrackSlot = observers.getCursorSlot();
        final LauncherGridWalker.LauncherGridResponse grid = walker.walkGrid(
                selector, hasContent, notes, readySignal, trackSidFor, trackNameFor,
                () -> {
                    if (originalTrackSlot < 0 || originalTrackSlot >= observers.getBankSize()) return;
                    try {
                        trackBank.getItemAt(originalTrackSlot).selectInEditor();
                    } catch (final Exception ignored) {
                        // Best effort: an out-of-window/deleted track must not fail the pull.
                    }
                });

        // Enrich sceneNames from the observers cache (PULL-ONLY; Pitfall 6 —
        // no new event type, just the response array).
        final int sceneCount = observers.getSceneBankSize();
        for (int s = 0; s < sceneCount; s++) {
            grid.sceneNames.add(observers.getSceneNames().getOrDefault(s, ""));
        }

        return LauncherGridWalker.buildLauncherGridResponse(id, grid);
    }
}
