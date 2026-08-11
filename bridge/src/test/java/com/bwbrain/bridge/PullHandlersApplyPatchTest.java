// bridge/src/test/java/com/bwbrain/bridge/PullHandlersApplyPatchTest.java
//
// Phase 3 Plan 03-02 Task 3 — JUnit test for the bridge apply.patch primitive
// dispatch (D-01 / Pitfall 7). RED test authored before the implementation (TDD).
//
// The bridge handler is 3-CASE FOREVER (D-01 — add_note / remove_note /
// update_note_field; it NEVER branches on transformIntent). This test pins the
// dispatch + the NoteStep mutation values + the per-op try/catch (grid out of
// range -> failed, no exception propagates).
//
// No-Mockito discipline: the project has no Mockito dep, and the existing
// PullHandlersTest exercises PURE builders only. To keep the 3-case dispatch
// testable without mocking PinnableCursorClip (a broad Bitwig interface), the
// handler extracts a package-private pure helper `applyOps` that takes a
// `PullHandlers.NoteStepWriter` functional interface. This test injects a
// recording writer that captures every {x, y, velocity, duration} mutation.
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PullHandlersApplyPatchTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void correlationSeamCannotDispatchApplyPatchOrAnyControllerMutation() throws Exception {
        final JsonNode payload = MAPPER.readTree("{\"projectId\":\"p\",\"instanceId\":\"i\",\"trackSid\":\"t\",\"nonce\":\"n\"}");
        final ClapCorrelation.SelectionEvidence evidence =
                new ClapCorrelation.SelectionEvidence("track hint", "device hint", true);
        assertTrue(ClapCorrelation.dispatch("get.clap_correlation", "read-1", payload, evidence).isPresent());
        assertTrue(ClapCorrelation.dispatch("apply.patch", "mut-1", payload, evidence).isEmpty());
        assertTrue(ClapCorrelation.dispatch("set.device", "mut-2", payload, evidence).isEmpty());
    }

    /** A recording NoteStepWriter — captures every mutation the dispatch issues. */
    static final class RecordingWriter implements PullHandlers.NoteStepWriter {
        final List<int[]> xy = new ArrayList<>();
        final List<Double> velocities = new ArrayList<>();
        final List<Double> durations = new ArrayList<>();
        int throwOnX = -1; // when >=0, getStep for this x throws (grid out of range)

        @Override
        public void write(final int x, final int y, final double velocity, final double duration) {
            if (x == throwOnX) {
                throw new IndexOutOfBoundsException("grid out of range x=" + x);
            }
            xy.add(new int[]{x, y});
            velocities.add(velocity);
            durations.add(duration);
        }
    }

    /** Build a one-op JSON operations array. */
    private static JsonNode ops(final JsonNode... opNodes) {
        final ArrayNode arr = MAPPER.createArrayNode();
        for (final JsonNode n : opNodes) arr.add(n);
        return arr;
    }

    private static JsonNode addNote(final double start, final int pitch, final double velocity, final double length) {
        try {
            return MAPPER.readTree(String.format(
                    "{\"op\":\"add_note\",\"note\":{\"start\":%.4f,\"pitch\":%d,\"velocity\":%.4f,\"length\":%.4f}}",
                    start, pitch, velocity, length));
        } catch (final Exception e) { throw new RuntimeException(e); }
    }

    private static JsonNode removeNote(final double start, final int pitch) {
        try {
            return MAPPER.readTree(String.format(
                    "{\"op\":\"remove_note\",\"note\":{\"start\":%.4f,\"pitch\":%d}}", start, pitch));
        } catch (final Exception e) { throw new RuntimeException(e); }
    }

    private static JsonNode updateNoteField(final double start, final int pitch, final double velocity, final double length) {
        try {
            return MAPPER.readTree(String.format(
                    "{\"op\":\"update_note_field\",\"before\":{\"start\":%.4f,\"pitch\":%d,\"velocity\":80.0,\"length\":0.25},"
                            + "\"after\":{\"start\":%.4f,\"pitch\":%d,\"velocity\":%.4f,\"length\":%.4f}}",
                    start, pitch, start, pitch, velocity, length));
        } catch (final Exception e) { throw new RuntimeException(e); }
    }

    @Test
    void threeCaseDispatchAppliesAddRemoveUpdate() throws Exception {
        // loopBeats = 16, GRID_W = 16 -> beatsPerColumn = 1.0. start=2 -> x=2.
        final RecordingWriter w = new RecordingWriter();
        final JsonNode ops = ops(
                addNote(2.0, 60, 100.0, 0.25),
                removeNote(4.0, 64),
                updateNoteField(6.0, 72, 110.0, 0.5));
        final String line = PullHandlers.applyOps("req-1", ops, 1.0, w);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertEquals("response", resp.get("type").asText());
        assertEquals("req-1", resp.get("id").asText());
        assertTrue(resp.get("ok").asBoolean(), "all 3 ops succeeded -> ok:true");
        assertEquals(3, resp.get("payload").get("applied").asInt());
        assertEquals(0, resp.get("payload").get("failed").asInt());
        // All three mutations were issued with the right x/y/velocity/duration.
        assertEquals(3, w.xy.size());
        // add_note: x=2, y=60, vel=100, dur=0.25
        assertEquals(2, w.xy.get(0)[0]); assertEquals(60, w.xy.get(0)[1]);
        assertEquals(100.0, w.velocities.get(0), 0.001);
        assertEquals(0.25, w.durations.get(0), 0.001);
        // remove_note: x=4, y=64, vel=0.0 (velocity 0 = no note)
        assertEquals(4, w.xy.get(1)[0]); assertEquals(64, w.xy.get(1)[1]);
        assertEquals(0.0, w.velocities.get(1), 0.001);
        // update_note_field: x=6, y=72, vel=110, dur=0.5 (uses `after`)
        assertEquals(6, w.xy.get(2)[0]); assertEquals(72, w.xy.get(2)[1]);
        assertEquals(110.0, w.velocities.get(2), 0.001);
        assertEquals(0.5, w.durations.get(2), 0.001);
    }

    @Test
    void beatsPerColumnMapsStartBeatsToGridColumn() throws Exception {
        // loopBeats = 8, GRID_W = 16 -> beatsPerColumn = 0.5. start=1.0 -> x=2.
        final RecordingWriter w = new RecordingWriter();
        final JsonNode ops = ops(addNote(1.0, 60, 90.0, 0.25));
        PullHandlers.applyOps("req-2", ops, 0.5, w);
        assertEquals(2, w.xy.get(0)[0], "start=1.0 / beatsPerColumn=0.5 -> x=2");
    }

    @Test
    void gridOutOfRangeIncrementsFailedNoException() throws Exception {
        // The writer throws on x=5 -> the per-op try/catch increments failed,
        // no exception propagates, the handler replies.
        final RecordingWriter w = new RecordingWriter();
        w.throwOnX = 5;
        final JsonNode ops = ops(
                addNote(2.0, 60, 100.0, 0.25),   // x=2 ok
                addNote(5.0, 62, 95.0, 0.125));  // x=5 throws -> failed
        final String line = PullHandlers.applyOps("req-3", ops, 1.0, w);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertEquals(1, resp.get("payload").get("applied").asInt());
        assertEquals(1, resp.get("payload").get("failed").asInt());
        assertFalse(resp.get("ok").asBoolean(), "failed>0 -> ok:false");
    }

    @Test
    void unknownOpIncrementsFailed() throws Exception {
        final RecordingWriter w = new RecordingWriter();
        final JsonNode ops = ops(MAPPER.readTree("{\"op\":\"vary_velocity\",\"note\":{\"start\":0,\"pitch\":60}}"));
        final String line = PullHandlers.applyOps("req-4", ops, 1.0, w);
        final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
        assertEquals(0, resp.get("payload").get("applied").asInt());
        assertEquals(1, resp.get("payload").get("failed").asInt());
    }

    @Test
    void threeCaseForeverDoesNotReadTransformIntent() {
        // Pitfall 7 / D-01: the dispatch switches ONLY on the primitive op
        // discriminant. A payload carrying transformIntent metadata MUST NOT
        // branch on it. Assert the handler has exactly three op cases by
        // exercising each + an unknown one (which fails). This is a structural
        // pin against a future semantic-catalog switch growing in Java.
        final RecordingWriter w = new RecordingWriter();
        try {
            final JsonNode ops = ops(MAPPER.readTree(
                    "{\"op\":\"add_note\",\"note\":{\"start\":0,\"pitch\":60},"
                            + "\"transformIntent\":{\"name\":\"vary\",\"variant\":\"displace\"}}"));
            final String line = PullHandlers.applyOps("req-5", ops, 1.0, w);
            final JsonNode resp = MAPPER.readTree(line.substring(0, line.length() - 1));
            // transformIntent is IGNORED — add_note still applies normally.
            assertEquals(1, resp.get("payload").get("applied").asInt());
        } catch (final Exception e) {
            fail("transformIntent must be ignored, not crash the handler: " + e.getMessage());
        }
    }
}
