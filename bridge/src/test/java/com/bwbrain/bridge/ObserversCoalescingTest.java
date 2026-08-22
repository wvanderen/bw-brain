// bridge/src/test/java/com/bwbrain/bridge/ObserversCoalescingTest.java
//
// Phase 5 Plan 05-03 Task 2 (TDD RED) — behavior tests for the eager device/
// parameter/remote-page/automation-write observers (D-05-01/02/03).
//
// The Bitwig-facing wiring (addValueObserver over live proxies) cannot run
// without a host, so the movement logic lives in two package-private nested
// cores inside Observers (the PullHandlers.applyOps/NoteStepWriter
// injectable-seam precedent — recording surfaces, no Mockito):
//   - Observers.ParameterCoalescer  — per-param last-value-wins coalescing
//     (Pitfall 5 / T-05-06: control-rate floods are folded on the controller
//     thread; the bounded flush offers ONE parameter.changed per moved key)
//   - Observers.AutomationWriteEmitter — the D-05-05 automationWrite state
//     push on transport.changed (skipFirstFire honored per field)
//
// Test 5 (structural): every new observer group is reachable ONLY from the
// register()/init() path — Bitwig forbids post-init registration
// ("This can only be called during driver initialization" — live-observed,
// capabilities doc §7 finding 3 / Pitfall 7). The test pins the wiring
// method names to exactly one call site each (inside the register overload)
// by scanning the Observers.java source.
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ObserversCoalescingTest {

    private static final ObjectMapper READER = new ObjectMapper();

    /** Recording sink — captures every line the coalescer/emitter offers. */
    private static final class RecordingSink implements java.util.function.Consumer<String> {
        final List<String> lines = new ArrayList<>();
        @Override public void accept(final String line) { lines.add(line); }
    }

    private static JsonNode parseEvent(final String line, final String expectedType) throws Exception {
        assertTrue(line.endsWith("\n"), "event line must end with newline");
        final JsonNode node = READER.readTree(line.substring(0, line.length() - 1));
        assertEquals(expectedType, node.get("type").asText(), "LineJson.event stamps the event type");
        assertEquals("1.0", node.get("version").asText());
        assertTrue(node.has("timestamp"), "sender-originated events carry a timestamp");
        return node;
    }

    @Test
    void coalescerFlushesExactlyOneLastValueWinEventPerWindow() throws Exception {
        // Behavior Test 1 (Pitfall 5): values 0.1, 0.2, 0.3 for param index 7
        // within one coalescing window -> exactly ONE parameter.changed event
        // carrying value 0.3 (last-value-wins).
        final RecordingSink sink = new RecordingSink();
        final Observers.ParameterCoalescer c = new Observers.ParameterCoalescer(sink);
        final long key = Observers.paramKey(Observers.SOURCE_DEVICE_PARAMETER, 7);
        c.onValue(key, 7, "Cutoff", "device_parameter", 0.1);
        c.onValue(key, 7, "Cutoff", "device_parameter", 0.2);
        c.onValue(key, 7, "Cutoff", "device_parameter", 0.3);
        final int offered = c.flush("dev_a1b2c3d4e5f60718");
        assertEquals(1, offered, "one coalesced event per key per flush window");
        assertEquals(1, sink.lines.size());
        final JsonNode payload = parseEvent(sink.lines.get(0), "parameter.changed").get("payload");
        assertEquals("dev_a1b2c3d4e5f60718", payload.get("deviceKey").asText());
        assertEquals(7, payload.get("paramIndex").asInt());
        assertEquals("Cutoff", payload.get("paramName").asText());
        assertEquals("device_parameter", payload.get("source").asText());
        assertEquals(0.3, payload.get("value").asDouble(), 0.0001, "last value wins");
        // A second flush with no new movement offers nothing.
        assertEquals(0, c.flush("dev_a1b2c3d4e5f60718"));
    }

    @Test
    void epsilonEqualValueProducesNoEventAndNoMovementIncrement() {
        // Behavior Test 2: a value equal to the stored value (delta <= 1e-4)
        // produces no event and no movement increment.
        final RecordingSink sink = new RecordingSink();
        final Observers.ParameterCoalescer c = new Observers.ParameterCoalescer(sink);
        final long key = Observers.paramKey(Observers.SOURCE_DEVICE_PARAMETER, 3);
        c.onValue(key, 3, "Reso", "device_parameter", 0.5);   // first observation: cached only
        assertEquals(0, c.movementCount(key));
        c.onValue(key, 3, "Reso", "device_parameter", 0.5);   // identical: no movement
        c.onValue(key, 3, "Reso", "device_parameter", 0.50005); // delta 5e-5 <= 1e-4: no movement
        assertEquals(0, c.movementCount(key), "no movement increments for epsilon-equal values");
        assertEquals(0, c.flush("dev_x"), "nothing offered");
        assertTrue(sink.lines.isEmpty());
        // A real movement still increments exactly once per fire.
        c.onValue(key, 3, "Reso", "device_parameter", 0.6);
        assertEquals(1, c.movementCount(key));
    }

    @Test
    void sourceDiscriminationRemotePageVersusDeviceParameter() throws Exception {
        // Behavior Test 3: remote-page knob callbacks produce events with
        // source="remote_page"; device-window callbacks with
        // source="device_parameter". Same index, different source -> distinct
        // coalescing keys (both may be pending in one window).
        final RecordingSink sink = new RecordingSink();
        final Observers.ParameterCoalescer c = new Observers.ParameterCoalescer(sink);
        c.onValue(Observers.paramKey(Observers.SOURCE_DEVICE_PARAMETER, 0), 0, "Param 1", "device_parameter", 0.42);
        c.onValue(Observers.paramKey(Observers.SOURCE_REMOTE_PAGE, 0), 0, "Macro 1", "remote_page", 0.7);
        c.onValue(Observers.paramKey(Observers.SOURCE_DEVICE_PARAMETER, 0), 0, "Param 1", "device_parameter", 0.5);
        c.onValue(Observers.paramKey(Observers.SOURCE_REMOTE_PAGE, 0), 0, "Macro 1", "remote_page", 0.9);
        assertEquals(2, c.flush("dev_k"));
        assertEquals(2, sink.lines.size());
        final JsonNode deviceParam = parseEvent(sink.lines.get(0), "parameter.changed").get("payload");
        assertEquals("device_parameter", deviceParam.get("source").asText());
        assertEquals(0.5, deviceParam.get("value").asDouble(), 0.0001);
        final JsonNode remote = parseEvent(sink.lines.get(1), "parameter.changed").get("payload");
        assertEquals("remote_page", remote.get("source").asText());
        assertEquals(0.9, remote.get("value").asDouble(), 0.0001);
    }

    @Test
    void automationWriteChangesPushTransportChangedWithSkipFirstFire() throws Exception {
        // Behavior Test 4 (D-05-05): automation-write state changes push
        // transport.changed carrying the automationWrite object; the per-field
        // registration boot fire is skipped (skipFirstFire precedent).
        final RecordingSink sink = new RecordingSink();
        final Observers.AutomationWriteEmitter e = new Observers.AutomationWriteEmitter(sink);
        // Registration boot fires — cached, NOT emitted (4 observers fire once
        // each on registration with the boot state).
        e.onArrangerWriteEnabled(true);
        e.onLauncherWriteEnabled(false);
        e.onOverrideActive(false);
        e.onWriteMode("latch");
        assertTrue(sink.lines.isEmpty(), "skipFirstFire: boot fires cache only, no events");
        // A real change: arranger write toggles OFF -> one transport.changed
        // carrying the full 4-field automationWrite snapshot.
        e.onArrangerWriteEnabled(false);
        assertEquals(1, sink.lines.size());
        final JsonNode payload = parseEvent(sink.lines.get(0), "transport.changed").get("payload");
        final JsonNode aw = payload.get("automationWrite");
        assertNotNull(aw, "transport.changed carries the automationWrite object");
        assertEquals(false, aw.get("arrangerWriteEnabled").asBoolean());
        assertEquals(false, aw.get("launcherWriteEnabled").asBoolean());
        assertEquals(false, aw.get("overrideActive").asBoolean());
        assertEquals("latch", aw.get("writeMode").asText());
        // Override becomes active -> next push carries the updated snapshot.
        e.onOverrideActive(true);
        assertEquals(2, sink.lines.size());
        final JsonNode aw2 = parseEvent(sink.lines.get(1), "transport.changed").get("payload").get("automationWrite");
        assertTrue(aw2.get("overrideActive").asBoolean());
        assertEquals("latch", aw2.get("writeMode").asText());
        // writeMode transitions emit the schema-bounded enum value.
        e.onWriteMode("touch");
        assertEquals(3, sink.lines.size());
        assertEquals("touch", parseEvent(sink.lines.get(2), "transport.changed").get("payload")
                .get("automationWrite").get("writeMode").asText());
    }

    @Test
    void everyNewObserverGroupIsReachableOnlyFromTheInitRegistrationPath() throws Exception {
        // Behavior Test 5 (structural, Pitfall 7): every addValueObserver call
        // site added by this task lives inside a wire* method whose ONLY call
        // site is the register()/init() path — Bitwig forbids observer
        // registration outside init() ("This can only be called during driver
        // initialization" — live-observed, wireClipLauncherSlotsEager javadoc
        // :374-388). Each new wire method must appear EXACTLY twice in the
        // source: its declaration + its single register()-overload call site.
        final String source = readObserversSource();
        for (final String method : new String[] {
                "wireTransportMeta", "wireDeviceChain", "wireParameterWindow",
                "wireRemotePage", "wireAutomationWrite"}) {
            final int occurrences = countOccurrences(source, method + "(");
            assertEquals(2, occurrences,
                    method + " must appear exactly twice (declaration + single register() call) — "
                            + "an observer group reachable from anywhere but init() throws at "
                            + "runtime (Pitfall 7); found " + occurrences);
        }
    }

    @Test
    void deviceSidFingerprintMatchesTheClipSidV1Discipline() {
        // D-05-02/T-05-07: deviceSid = "dev_" + sha256(track:device:position)
        // .slice(0,16) — the ClipSid V1 precedent applied to devices. The
        // parameter.changed deviceKey IS the AutomationScope deviceSid value
        // (same fingerprint, 05-05 contract), so the output pattern is pinned
        // here: ^dev_[0-9a-f]{16}$ + stability across calls + sensitivity to
        // each input component.
        final String sid = Observers.deriveDeviceSid("Lead", "Surge XT", 2);
        assertTrue(sid.matches("^dev_[0-9a-f]{16}$"), "pattern-valid dev_ + 16-hex: " + sid);
        assertEquals(sid, Observers.deriveDeviceSid("Lead", "Surge XT", 2), "stable");
        assertNotEquals(sid, Observers.deriveDeviceSid("Bass", "Surge XT", 2), "track-sensitive");
        assertNotEquals(sid, Observers.deriveDeviceSid("Lead", "FM-4", 2), "device-sensitive");
        assertNotEquals(sid, Observers.deriveDeviceSid("Lead", "Surge XT", 3), "position-sensitive");
        // Null-safety: null components fold to "" (an observer cache may hold
        // null early) — the output stays pattern-valid, never throws.
        assertTrue(Observers.deriveDeviceSid(null, null, -1).matches("^dev_[0-9a-f]{16}$"));
    }

    // --- helpers ---

    private static String readObserversSource() throws Exception {
        // Surefire's working dir is the bridge module; fall back to the repo
        // root layout so the scan works under either invocation.
        final Path modulePath = Path.of("src/main/java/com/bwbrain/bridge/Observers.java");
        final Path repoPath = Path.of("bridge/src/main/java/com/bwbrain/bridge/Observers.java");
        final Path p = Files.exists(modulePath) ? modulePath : repoPath;
        assertTrue(Files.exists(p), "Observers.java source must be reachable for the structural scan");
        return Files.readString(p);
    }

    private static int countOccurrences(final String haystack, final String needle) {
        int count = 0;
        for (int i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
            count++;
        }
        return count;
    }
}
