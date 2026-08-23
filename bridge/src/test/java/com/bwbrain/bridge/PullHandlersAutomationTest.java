// bridge/src/test/java/com/bwbrain/bridge/PullHandlersAutomationTest.java
//
// Phase 5 Plan 05-06 — recording-writer dispatch tests for the bridge
// automation execution (AUTO-03 bridge half). RED first (TDD): authored
// BEFORE the ParameterWriter seam + the three automation dispatch cases
// exist in applyOps.
//
// No-Mockito discipline (the PullHandlersApplyPatchTest precedent): the
// project has no Mockito dep; the pure package-private applyOps helper takes
// a PullHandlers.ParameterWriter functional interface, and this test injects
// a RECORDING writer that appends (method, paramIndex, value) tuples to a
// list. No Bitwig host is constructed — the dispatch logic is pure.
//
// Binding spec: docs/bitwig-capabilities.md §3 (2026-08-22 live probe) —
//   * write surface = Parameter.touch(boolean) + SettableRangedValue.set(double),
//     normalized 0..1 (set(0.25) -> readback 0.24999999999999956);
//   * write-arm is the gate (daemon-side pre-flight, 05-05); an approved
//     armed curve writes INSTANTLY (playing OR stopped, latch mode);
//   * value readback is ASYNC — the bridge must NOT verify a write via
//     synchronous value().get() readback.
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PullHandlersAutomationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * Recording ParameterWriter — captures every call the dispatch issues as a
     * (method, paramIndex, value) tuple in order. capture() returns a FIXED
     * prior (configurable) so the response's capturedPriorValue is assertable.
     */
    static final class RecordingParameterWriter implements PullHandlers.ParameterWriter {
        record Call(String method, int paramIndex, double value) {}

        final List<Call> calls = new ArrayList<>();
        double priorOnCapture = 0.25;
        boolean throwOnFirstSetValue = false;

        @Override
        public double capture(final int paramIndex) {
            calls.add(new Call("capture", paramIndex, Double.NaN));
            return priorOnCapture;
        }

        @Override
        public void touch(final int paramIndex, final boolean touched) {
            calls.add(new Call(touched ? "touch(true)" : "touch(false)", paramIndex, Double.NaN));
        }

        @Override
        public void setValue(final int paramIndex, final double normalizedValue) {
            if (throwOnFirstSetValue) {
                throwOnFirstSetValue = false;
                throw new IllegalStateException("write rejected by writer");
            }
            calls.add(new Call("setValue", paramIndex, normalizedValue));
        }

        List<String> methods() {
            return calls.stream().map(Call::method).toList();
        }
    }

    /** A no-op NoteStepWriter (mixed-patch tests pair it with the param writer). */
    private static final PullHandlers.NoteStepWriter NOOP_NOTE_WRITER = (x, y, v, d) -> {};

    private static JsonNode ops(final JsonNode... opNodes) {
        final ArrayNode arr = MAPPER.createArrayNode();
        for (final JsonNode n : opNodes) arr.add(n);
        return arr;
    }

    // ------------------------------------------------------------------
    // Behavior 1 (D-05-07 / Pitfall 11): the parameter's current value is
    // captured BEFORE any write — capture(target) strictly precedes every
    // touch/setValue call.
    // ------------------------------------------------------------------
    @Test
    void automationPointsCapturesPriorBeforeAnyWrite() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        final JsonNode ops = ops(MAPPER.readTree(
                "{\"op\":\"automation_points\",\"points\":["
                        + "{\"beat\":0,\"value\":0.1},{\"beat\":4,\"value\":0.5},{\"beat\":8,\"value\":0.9}]}"));
        final String line = PullHandlers.applyOps("req-1", ops, 1.0, NOOP_NOTE_WRITER, w, 3);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertTrue(resp.get("ok").asBoolean(), "3 points applied");
        assertEquals("capture", w.calls.get(0).method(), "capture must be the FIRST writer call");
        assertEquals(3, w.calls.get(0).paramIndex(), "capture addresses the patch's single target index");
        for (int i = 1; i < w.calls.size(); i++) {
            assertNotEquals("capture", w.calls.get(i).method(),
                    "capture happens once, before any write");
        }
    }

    // ------------------------------------------------------------------
    // Behavior 2: set_parameter_value dispatches touch(true) -> setValue ->
    // touch(false) in order with the EXACT normalized value from the op
    // (Pitfall 6: values are normalized [0,1] end-to-end; no scaling at the
    // dispatch — the 2026-08-22 probe confirmed Parameter.set takes 0..1).
    // ------------------------------------------------------------------
    @Test
    void setParameterValueDispatchesTouchSetValueTouchInOrder() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        final JsonNode ops = ops(MAPPER.readTree("{\"op\":\"set_parameter_value\",\"value\":0.75}"));
        PullHandlers.applyOps("req-2", ops, 1.0, NOOP_NOTE_WRITER, w, 5);
        assertEquals(List.of("capture", "touch(true)", "setValue", "touch(false)"), w.methods());
        assertEquals(5, w.calls.get(2).paramIndex());
        assertEquals(0.75, w.calls.get(2).value(), 0.0, "exact normalized value, byte-identical from the op");
    }

    // ------------------------------------------------------------------
    // Behavior 6 (05-05 Task 3 daemon contract): the apply response for an
    // automation patch carries capturedPriorValue equal to the writer's
    // captured value — the daemon freezes the author-aware inverse from it
    // (or refuses prior_unavailable when absent).
    // ------------------------------------------------------------------
    @Test
    void applyResponseCarriesCapturedPriorValue() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        w.priorOnCapture = 0.42;
        final JsonNode ops = ops(MAPPER.readTree("{\"op\":\"set_parameter_value\",\"value\":0.9}"));
        final String line = PullHandlers.applyOps("req-3", ops, 1.0, NOOP_NOTE_WRITER, w, 0);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertTrue(resp.get("payload").has("capturedPriorValue"),
                "automation patches must carry capturedPriorValue");
        assertEquals(0.42, resp.get("payload").get("capturedPriorValue").asDouble(), 1e-9);
    }
}
