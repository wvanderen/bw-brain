// bridge/src/test/java/com/bwbrain/bridge/PullHandlersDeviceChainTest.java
//
// Phase 5 Plan 05-03 Task 3 (TDD RED) — real device-chain response assembly
// (AUTO-04 / D-05-03). Replaces the A1-NEGATED empty-pages stub
// (PullHandlers.handleSelectedDeviceChain :308-318 — the 2026-06-29 finding
// history: VST/AU params do NOT surface via CursorRemoteControlsPage, so the
// response now assembles from the Observers chain/parameter/remote-page
// caches via the bounded getParameter window + page knobs).
//
// Pure-builder tests over FABRICATED caches (the PullHandlersApplyPatchTest
// recording-writer style — no Mockito, no Bitwig host): the builder takes
// plain view records; Observers exposes thin cache getters the production
// handler reads. Test 3 proves the cursorDevice plumbing is null-safe on the
// reconnect path (no inbound line exercises the device path — the
// BridgeExtensionReconnectTest javadoc contract).
//
// 40+ lines minimum per the plan artifact contract.
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class PullHandlersDeviceChainTest {

    private static final ObjectMapper READER = new ObjectMapper();

    private static JsonNode parseResponse(final String line) throws Exception {
        assertTrue(line.endsWith("\n"), "response line must end with newline");
        final JsonNode node = READER.readTree(line.substring(0, line.length() - 1));
        assertEquals("response", node.get("type").asText());
        assertEquals("1.0", node.get("version").asText());
        return node;
    }

    /**
     * The Task 1 fixture: one native device (macro page knob bound) + one VST
     * (params 0..41 bound, absent from 42). deviceSid values come from the
     * SAME Observers.deriveDeviceSid fingerprint the bridge caches use — the
     * parameter.changed deviceKey IS the AutomationScope deviceSid (05-05 pin).
     */
    private static String sid(final String deviceName, final int position) {
        return Observers.deriveDeviceSid("Lead", deviceName, position);
    }

    @Test
    void assemblesDevicesAndBoundedParametersFromFabricatedCaches() throws Exception {
        // Behavior Test 1: both devices present with correct
        // deviceSid/name/isPlugin/position; parameters array lists BOUND
        // indices with source fields — page knobs as remote_page, VST params
        // as device_parameter.
        final List<PullHandlers.DeviceView> devices = List.of(
                new PullHandlers.DeviceView(sid("Polysynth", 0), "Polysynth", false, 0),
                new PullHandlers.DeviceView(sid("Surge XT", 1), "Surge XT", true, 1));
        final List<PullHandlers.ParamView> parameters = new ArrayList<>();
        // The native device's macro page knob (bound via the remote page cache).
        parameters.add(new PullHandlers.ParamView(sid("Polysynth", 0), 0, "Macro 1", 0.25, "remote_page"));
        // The VST's bounded window: bound at 0..41 (three sampled here), absent at 42.
        final String vstKey = sid("Surge XT", 1);
        parameters.add(new PullHandlers.ParamView(vstKey, 0, "Filter Cutoff", 0.9, "device_parameter"));
        parameters.add(new PullHandlers.ParamView(vstKey, 1, "Filter Resonance", 0.1, "device_parameter"));
        parameters.add(new PullHandlers.ParamView(vstKey, 41, "Release", 0.5, "device_parameter"));
        final List<PullHandlers.PageView> pages = List.of(
                new PullHandlers.PageView("Macros", List.of(new PullHandlers.RemoteView("Macro 1", 0.25))));

        final String line = PullHandlers.buildDeviceChainResponse("chain-1", devices, parameters, pages);
        final JsonNode payload = parseResponse(line).get("payload");
        assertTrue(payload.get("ok") == null, "payload is the inner object (ok lives on the envelope)");

        // devices array: both devices, correct fields.
        final JsonNode devicesNode = payload.get("devices");
        assertEquals(2, devicesNode.size());
        assertEquals(sid("Polysynth", 0), devicesNode.get(0).get("deviceSid").asText());
        assertEquals("Polysynth", devicesNode.get(0).get("name").asText());
        assertFalse(devicesNode.get(0).get("isPlugin").asBoolean());
        assertEquals(0, devicesNode.get(0).get("position").asInt());
        assertEquals("Surge XT", devicesNode.get(1).get("name").asText());
        assertTrue(devicesNode.get(1).get("isPlugin").asBoolean(), "VST/AU detection (AUTO-04)");
        assertEquals(1, devicesNode.get(1).get("position").asInt());

        // parameters array: bounded entries with source discrimination.
        final JsonNode paramsNode = payload.get("parameters");
        assertEquals(4, paramsNode.size());
        final JsonNode macro = paramsNode.get(0);
        assertEquals(sid("Polysynth", 0), macro.get("deviceKey").asText());
        assertEquals(0, macro.get("paramIndex").asInt());
        assertEquals("Macro 1", macro.get("paramName").asText());
        assertEquals("remote_page", macro.get("source").asText());
        assertEquals(0.25, macro.get("value").asDouble(), 0.0001);
        final JsonNode cutoff = paramsNode.get(1);
        assertEquals(vstKey, cutoff.get("deviceKey").asText());
        assertEquals("device_parameter", cutoff.get("source").asText());
        assertEquals(0.9, cutoff.get("value").asDouble(), 0.0001);
        assertEquals(41, paramsNode.get(3).get("paramIndex").asInt(), "bounded window: index 41 present");

        // Test 2 (walk termination): NO entry for index 42 — the fabricated
        // caches omit it because exists() reported absent. Assert the highest
        // listed VST index is 41 and no paramIndex 42 appears anywhere.
        for (final JsonNode p : paramsNode) {
            if ("device_parameter".equals(p.get("source").asText())) {
                assertTrue(p.get("paramIndex").asInt() <= 41,
                        "absent-from-42 honored: no parameter entry beyond the exists() bound");
            }
        }
    }

    @Test
    void absentExistsCacheProducesNoEntryForThatIndex() throws Exception {
        // Behavior Test 2 (explicit): the parameters array contains NO entry
        // for an index whose exists() cache reports absent — the assembly
        // consumes ONLY bound indices, so a mid-window hole stays a hole.
        final String key = sid("Surge XT", 0);
        final List<PullHandlers.ParamView> parameters = List.of(
                new PullHandlers.ParamView(key, 0, "A", 0.1, "device_parameter"),
                // index 1 absent (exists() false) — nothing fabricated for it
                new PullHandlers.ParamView(key, 2, "C", 0.3, "device_parameter"));
        final String line = PullHandlers.buildDeviceChainResponse("chain-2",
                List.of(new PullHandlers.DeviceView(key, "Surge XT", true, 0)),
                parameters, List.of());
        final JsonNode paramsNode = parseResponse(line).get("payload").get("parameters");
        assertEquals(2, paramsNode.size(), "only the two bound entries — index 1 produces nothing");
        assertEquals(0, paramsNode.get(0).get("paramIndex").asInt());
        assertEquals(2, paramsNode.get(1).get("paramIndex").asInt());
    }

    @Test
    void responseRetainsTopLevelPagesFieldForLegacyConsumers() throws Exception {
        // Behavior Test 4: the existing top-level `pages` field survives
        // (backward compatibility for the current CLI device-inspect consumer
        // — daemon/src/query/query-server.ts surfaces the pages payload).
        final List<PullHandlers.PageView> pages = List.of(
                new PullHandlers.PageView("Macros", List.of(
                        new PullHandlers.RemoteView("Macro 1", 0.25),
                        new PullHandlers.RemoteView("Macro 2", 0.75))));
        final String line = PullHandlers.buildDeviceChainResponse("chain-3",
                List.of(), List.of(), pages);
        final JsonNode payload = parseResponse(line).get("payload");
        assertTrue(payload.has("pages"), "top-level pages field retained");
        assertEquals(1, payload.get("pages").size());
        assertEquals("Macros", payload.get("pages").get(0).get("name").asText());
        assertEquals(2, payload.get("pages").get(0).get("remotes").size());
        // The additive arrays exist (empty) so the shape is stable for consumers.
        assertTrue(payload.get("devices").isArray());
        assertEquals(0, payload.get("devices").size());
        assertTrue(payload.get("parameters").isArray());
        assertEquals(0, payload.get("parameters").size());
    }

    @Test
    void startAcceptsNullCursorDeviceWhenNoLineExercisesTheDevicePath() throws Exception {
        // Behavior Test 3: the cursorDevice plumbing is PURE signature
        // threading in this plan (applyOps stays note-only until 05-06 —
        // Pitfall 3 groundwork). On the reconnect-test path (no Bitwig host,
        // null proxies, NO inbound request lines) the pull thread must start,
        // block on readLine, and exit cleanly on socket close — no NPE from
        // the null cursorDevice.
        try (final ServerSocket server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))) {
            final CountDownLatch accepted = new CountDownLatch(1);
            final Socket[] serverSide = new Socket[1];
            final Thread acceptor = new Thread(() -> {
                try (final Socket s = server.accept()) {
                    serverSide[0] = s;
                    accepted.countDown();
                    // Drain until the pull thread exits on close (readLine null).
                    final BufferedReader r = new BufferedReader(
                            new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                    while (r.readLine() != null) { /* no lines expected */ }
                } catch (final Exception ignored) {
                    // closed — fine
                }
            }, "device-chain-test-acceptor");
            acceptor.setDaemon(true);
            acceptor.start();

            try (final Socket client = new Socket("127.0.0.1", server.getLocalPort())) {
                assertTrue(accepted.await(3, TimeUnit.SECONDS), "server accepted the pull connection");
                final Thread pull = PullHandlers.start(client, new Outbox(),
                        null, null, null, null); // null cursorClip/cursorDevice/observers/walker
                // Close from the server side: the pull thread's readLine must
                // see EOF and exit WITHOUT throwing through the null proxies.
                serverSide[0].close();
                pull.join(3_000);
                assertFalse(pull.isAlive(), "pull thread exits cleanly on socket close (null cursorDevice safe)");
            } finally {
                acceptor.interrupt();
            }
        }
    }
}
