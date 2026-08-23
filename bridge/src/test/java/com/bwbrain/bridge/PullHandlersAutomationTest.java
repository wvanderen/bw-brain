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

    // ------------------------------------------------------------------
    // Behavior 3: automation_points dispatches a touch+setValue sequence PER
    // POINT in ASCENDING BEAT ORDER — the §3 consequence row pins the
    // instant-write model (an approved armed curve writes immediately; the
    // probe's per-write sequence was touch(true) -> set -> touch(false)), and
    // the writer — not the wire order — owns temporal ordering.
    // ------------------------------------------------------------------
    @Test
    void automationPointsWritePerPointInAscendingBeatOrder() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        // Deliberately out of wire order: beat 8, 0, 4 -> writer order 0, 4, 8.
        final JsonNode ops = ops(MAPPER.readTree(
                "{\"op\":\"automation_points\",\"points\":["
                        + "{\"beat\":8,\"value\":0.9},{\"beat\":0,\"value\":0.1},{\"beat\":4,\"value\":0.5}]}"));
        final String line = PullHandlers.applyOps("req-4", ops, 1.0, NOOP_NOTE_WRITER, w, 2);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertTrue(resp.get("ok").asBoolean());
        assertEquals(
                List.of("capture",
                        "touch(true)", "setValue", "touch(false)",
                        "touch(true)", "setValue", "touch(false)",
                        "touch(true)", "setValue", "touch(false)"),
                w.methods(),
                "one touch->set->touch(false) per point, ascending beat order");
        // The setValue values follow the ASCENDING-BEAT order (0.1, 0.5, 0.9),
        // not the wire order (0.9, 0.1, 0.5). setValue sits at indices 2/5/8
        // (capture, then per point: touch, setValue, touch(false)).
        assertEquals(0.1, w.calls.get(2).value(), 0.0);
        assertEquals(0.5, w.calls.get(5).value(), 0.0);
        assertEquals(0.9, w.calls.get(8).value(), 0.0);
        assertEquals(2, w.calls.get(2).paramIndex(), "every write addresses the scope's single target");
    }

    // ------------------------------------------------------------------
    // Behavior 4 (doc-pinned honesty, D-05-06): remove_automation_points has
    // NO live-verified removal surface (the 2026-08-22 probe verified writes
    // only) — the op must FAIL VISIBLY with a named reason, never count as
    // applied, and never be a silent no-op.
    // ------------------------------------------------------------------
    @Test
    void removeAutomationPointsRefusesHonestlyNeverSilently() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        final JsonNode ops = ops(MAPPER.readTree(
                "{\"op\":\"remove_automation_points\",\"points\":[{\"beat\":0,\"value\":0.5}]}"));
        final String line = PullHandlers.applyOps("req-5", ops, 1.0, NOOP_NOTE_WRITER, w, 1);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertFalse(resp.get("ok").asBoolean(), "the refusal op fails the patch");
        assertEquals(0, resp.get("payload").get("applied").asInt(), "never counted as applied");
        assertEquals(1, resp.get("payload").get("failed").asInt());
        assertEquals(1, resp.get("payload").get("failures").size());
        final String error = resp.get("payload").get("failures").get(0).get("error").asText();
        assertTrue(error.contains("removal_surface_unverified"),
                "the failure names the refusal reason: " + error);
        // No write was issued (capture is a read, not a write — but even it
        // must not silently "succeed" the op): no touch/setValue happened.
        assertTrue(w.methods().stream().noneMatch(m -> m.startsWith("touch") || m.equals("setValue")),
                "a refusal never writes");
    }

    // ------------------------------------------------------------------
    // Behavior 5 (existing discipline extended): a writer throwing on setValue
    // increments the failed count WITHOUT crashing the handler — remaining
    // ops still execute and the response reports the failure.
    // ------------------------------------------------------------------
    @Test
    void writerExceptionIncrementsFailedRemainingOpsStillExecute() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        w.throwOnFirstSetValue = true;
        final JsonNode ops = ops(
                MAPPER.readTree("{\"op\":\"set_parameter_value\",\"value\":0.3}"),   // setValue throws
                MAPPER.readTree("{\"op\":\"set_parameter_value\",\"value\":0.6}"));  // still executes
        final String line = PullHandlers.applyOps("req-6", ops, 1.0, NOOP_NOTE_WRITER, w, 4);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertEquals(1, resp.get("payload").get("applied").asInt(), "second op applied");
        assertEquals(1, resp.get("payload").get("failed").asInt(), "first op failed");
        assertEquals("set_parameter_value",
                resp.get("payload").get("failures").get(0).get("op").asText());
        // The SECOND op completed its full touch->set->touch(false) sequence
        // (the first op aborted mid-sequence at setValue).
        assertEquals(List.of(
                "capture", "touch(true)",                                   // op 1: capture + touch, setValue threw
                "touch(true)", "setValue", "touch(false)"),                  // op 2: full sequence
                w.methods());
        // Prior was captured ONCE (first automation op) even across the failure.
        assertEquals(1, w.methods().stream().filter("capture"::equals).count());
        // capturedPriorValue still present (the daemon refuses failed>0 first —
        // apply_failed — so a carried prior never masks a partial failure).
        assertTrue(resp.get("payload").has("capturedPriorValue"));
    }

    // ------------------------------------------------------------------
    // Behavior 7 (discriminant-only dispatch over ONE op list): a mixed patch
    // (notes + automation) routes each op to its OWN writer by discriminant —
    // note ops to the NoteStepWriter, automation ops to the ParameterWriter,
    // in op-list order.
    // ------------------------------------------------------------------
    @Test
    void mixedPatchDispatchesBothWriterTypesFromOneOpList() throws Exception {
        final RecordingParameterWriter pw = new RecordingParameterWriter();
        final PullHandlersApplyPatchTest.RecordingWriter nw =
                new PullHandlersApplyPatchTest.RecordingWriter();
        final JsonNode ops = ops(
                MAPPER.readTree("{\"op\":\"add_note\",\"note\":{\"start\":2.0,\"pitch\":60,\"velocity\":100.0,\"length\":0.25}}"),
                MAPPER.readTree("{\"op\":\"set_parameter_value\",\"value\":0.5}"),
                MAPPER.readTree("{\"op\":\"remove_note\",\"note\":{\"start\":4.0,\"pitch\":64}}"));
        final String line = PullHandlers.applyOps("req-7", ops, 1.0, nw, pw, 6);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertTrue(resp.get("ok").asBoolean(), "all 3 ops applied");
        assertEquals(3, resp.get("payload").get("applied").asInt());
        // Note writer: add_note (vel 100) then remove_note (vel 0) — 2 writes.
        assertEquals(2, nw.xy.size());
        assertEquals(100.0, nw.velocities.get(0), 0.001);
        assertEquals(0.0, nw.velocities.get(1), 0.001);
        // Parameter writer: exactly the one automation op's sequence.
        assertEquals(List.of("capture", "touch(true)", "setValue", "touch(false)"), pw.methods());
        assertEquals(6, pw.calls.get(2).paramIndex());
        // The response carries capturedPriorValue (an automation op ran) AND
        // the note-path fields unchanged.
        assertEquals(0.25, resp.get("payload").get("capturedPriorValue").asDouble(), 1e-9);
        assertEquals(0, resp.get("payload").get("failed").asInt());
    }

    // ------------------------------------------------------------------
    // Behavior 8 (Pitfall 7 / Pitfall 10 structural pin): NO code path in
    // applyOps reads the transform-intent metadata field. The only JSON read
    // mechanism in this dispatch is .path(...) — the source must not contain
    // a transformIntent path read. Plus the behavioral mirror: ops carrying
    // transformIntent dispatch on the discriminant, unchanged.
    // ------------------------------------------------------------------
    @Test
    void noCodePathReadsTransformIntent() throws Exception {
        // Structural half: grep-level assertion over the dispatch source.
        final String source = readMainSource();
        assertFalse(source.contains("path(\"transformIntent\")"),
                "applyOps must never read the transform-intent field (Pitfall 7/10)");
        // Behavioral half: an automation op WITH transformIntent metadata
        // dispatches exactly like one without (the discriminant is the only
        // switch input).
        final RecordingParameterWriter withMeta = new RecordingParameterWriter();
        final RecordingParameterWriter withoutMeta = new RecordingParameterWriter();
        final JsonNode withMetaOps = ops(MAPPER.readTree(
                "{\"op\":\"set_parameter_value\",\"value\":0.7,"
                        + "\"transformIntent\":{\"name\":\"manual\",\"variant\":\"macro-shape\"}}"));
        final JsonNode withoutMetaOps = ops(MAPPER.readTree("{\"op\":\"set_parameter_value\",\"value\":0.7}"));
        PullHandlers.applyOps("req-8a", withMetaOps, 1.0, NOOP_NOTE_WRITER, withMeta, 0);
        PullHandlers.applyOps("req-8b", withoutMetaOps, 1.0, NOOP_NOTE_WRITER, withoutMeta, 0);
        assertEquals(withoutMeta.methods(), withMeta.methods(),
                "transformIntent changes nothing about the dispatch");
        assertTrue(withMeta.methods().contains("setValue"), "the op still applied by discriminant");
    }

    // ------------------------------------------------------------------
    // Behavior 9 (request-level validation ordering): an automation patch
    // whose ops list is EMPTY is refused by the existing invalid_patch gate
    // BEFORE any writer is consulted.
    // ------------------------------------------------------------------
    @Test
    void emptyOpsListRefusedBeforeWriterTouched() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        final String line = PullHandlers.applyOps("req-9", ops(), 1.0, NOOP_NOTE_WRITER, w, 0);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertFalse(resp.get("ok").asBoolean());
        assertEquals("invalid_patch", resp.get("payload").get("error").asText());
        assertTrue(w.calls.isEmpty(), "the writer is never consulted for an invalid patch");
    }

    // ------------------------------------------------------------------
    // Behavior 10 (pure-construction pin, the ApplyPatchTest discipline): the
    // writer seam is consulted ONLY through the ParameterWriter interface —
    // the whole dispatch runs with ZERO Bitwig types constructed (no host,
    // no proxies; this test class builds only records + JSON nodes).
    // ------------------------------------------------------------------
    @Test
    void writerConsultedOnlyThroughInterfaceNoBitwigHost() throws Exception {
        final RecordingParameterWriter w = new RecordingParameterWriter();
        w.priorOnCapture = 0.125;
        final JsonNode ops = ops(MAPPER.readTree(
                "{\"op\":\"automation_points\",\"points\":[{\"beat\":0,\"value\":0.2},{\"beat\":1,\"value\":0.4}]}"));
        final String line = PullHandlers.applyOps("req-10", ops, 1.0, NOOP_NOTE_WRITER, w, 7);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertTrue(resp.get("ok").asBoolean());
        // Every observable interaction with the write surface is IN the
        // recording list — the interface is the only seam applyOps touched.
        assertEquals(7, w.calls.get(1).paramIndex());
        assertEquals(0.125, resp.get("payload").get("capturedPriorValue").asDouble(), 1e-9);
        // The recording writer implements the interface and NOTHING in this
        // test constructed a Bitwig proxy — pure dispatch logic (JUnit-only).
        assertTrue(PullHandlers.ParameterWriter.class.isInstance(w));
    }

    /** Read the PullHandlers main source (surefire runs from the module basedir). */
    private static String readMainSource() throws Exception {
        final String[] candidates = {
                "src/main/java/com/bwbrain/bridge/PullHandlers.java",
                "bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java",
        };
        for (final String candidate : candidates) {
            final java.nio.file.Path p = java.nio.file.Path.of(candidate);
            if (java.nio.file.Files.exists(p)) {
                return java.nio.file.Files.readString(p);
            }
        }
        fail("PullHandlers.java source not found from the test working directory");
        throw new IllegalStateException("unreachable");
    }
}
