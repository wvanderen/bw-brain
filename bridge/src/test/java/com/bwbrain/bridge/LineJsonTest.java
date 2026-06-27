// bridge/src/test/java/com/bwbrain/bridge/LineJsonTest.java
//
// Pure-logic tests for LineJson. Asserts every produced line parses as valid
// JSON carrying the frozen envelope shape (version "1.0" + the given type for
// events; version + type "response" + id + ok for responses), and that all 5
// Phase-2 event type names serialize cleanly. No live Bitwig required.
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class LineJsonTest {

    private static final ObjectMapper READER = new ObjectMapper();

    private static JsonNode parseTail(final String line) throws Exception {
        // LineJson appends a trailing '\n'; strip it before parsing.
        assertTrue(line.endsWith("\n"), "LineJson output must end with newline");
        return READER.readTree(line.substring(0, line.length() - 1));
    }

    @Test
    void eventProducesValidEnvelopeWithVersionAndType() throws Exception {
        final String line = LineJson.event("selection.changed",
                Map.of("trackSlot", 3), 1773501001L);
        final JsonNode node = parseTail(line);
        assertEquals("1.0", node.get("version").asText());
        assertEquals("selection.changed", node.get("type").asText());
        assertEquals(1773501001L, node.get("timestamp").asLong());
        assertEquals(3, node.get("payload").get("trackSlot").asInt());
    }

    @Test
    void eventHandlesNullPayloadAsEmptyObject() throws Exception {
        final String line = LineJson.event("transport.changed", null, 1L);
        final JsonNode node = parseTail(line);
        assertTrue(node.get("payload").isObject());
        assertEquals(0, node.get("payload").size());
    }

    @Test
    void allFiveEventTypeNamesSerialize() throws Exception {
        // The Plan-01-extended event.schema.json enum (5 observational events).
        final String[] types = {
            "selection.changed",
            "track.name_changed",
            "clip.name_changed",
            "device.name_changed",
            "transport.changed",
        };
        for (final String t : types) {
            final String line = LineJson.event(t, Map.of(), 1L);
            final JsonNode node = parseTail(line);
            assertEquals(t, node.get("type").asText(),
                    "event type " + t + " did not round-trip");
            assertEquals("1.0", node.get("version").asText());
        }
    }

    @Test
    void responseCarriesIdAndOkFieldsPerResponseSchema() throws Exception {
        final String line = LineJson.response("req-42", true,
                Map.of("notes", List.of()));
        final JsonNode node = parseTail(line);
        assertEquals("1.0", node.get("version").asText());
        assertEquals("response", node.get("type").asText());
        assertEquals("req-42", node.get("id").asText());
        assertTrue(node.get("ok").asBoolean());
        assertTrue(node.get("payload").has("notes"));
    }

    @Test
    void responseErrorCarriesOkFalseAndErrorCode() throws Exception {
        final String line = LineJson.responseError("req-43", "unknown_request");
        final JsonNode node = parseTail(line);
        assertEquals("response", node.get("type").asText());
        assertEquals("req-43", node.get("id").asText());
        assertFalse(node.get("ok").asBoolean());
        assertEquals("unknown_request", node.get("payload").get("error").asText());
    }

    @Test
    void eventPayloadSupportsNestedObjectsForNoteDumps() throws Exception {
        // get.selected_clip response payloads (and rich event payloads) carry
        // arrays of objects; verify Jackson serializes them cleanly.
        final String line = LineJson.response("req-44", true,
                Map.of("notes", List.of(
                        Map.of("pitch", 60, "start", 0.0, "length", 0.25, "velocity", 100),
                        Map.of("pitch", 64, "start", 0.25, "length", 0.25, "velocity", 95))));
        final JsonNode node = parseTail(line);
        assertTrue(node.get("payload").get("notes").isArray());
        assertEquals(2, node.get("payload").get("notes").size());
        assertEquals(60, node.get("payload").get("notes").get(0).get("pitch").asInt());
    }
}
