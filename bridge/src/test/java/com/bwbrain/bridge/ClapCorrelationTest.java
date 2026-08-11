package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ClapCorrelationTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode request() throws Exception {
        return MAPPER.readTree("{\"projectId\":\"project-1\",\"instanceId\":\"instance-1\",\"trackSid\":\"trk_0123456789abcdef\",\"deviceHint\":\"Polymer\",\"nonce\":\"nonce-1\"}");
    }

    private static JsonNode parse(final String line) throws Exception {
        return MAPPER.readTree(line.trim()).path("payload");
    }

    @Test void unavailableSelectionReturnsNullableHintsAndNeverConfirms() throws Exception {
        final JsonNode payload = parse(ClapCorrelation.respond("c1", request(),
                new ClapCorrelation.SelectionEvidence(null, null, false)));
        assertFalse(payload.path("available").asBoolean());
        assertTrue(payload.path("trackSidHint").isNull());
        assertTrue(payload.path("deviceHint").isNull());
        assertFalse(payload.has("nonce"));
        assertFalse(payload.has("projectId"));
    }

    @Test void selectedControllerDeviceReturnsExactNonceBoundTuple() throws Exception {
        final JsonNode payload = parse(ClapCorrelation.respond("c2", request(),
                new ClapCorrelation.SelectionEvidence("trk_hint_only", "Polymer", true)));
        assertTrue(payload.path("available").asBoolean());
        assertEquals("trk_hint_only", payload.path("trackSidHint").asText());
        assertEquals("Polymer", payload.path("deviceHint").asText());
        assertEquals("project-1", payload.path("projectId").asText());
        assertEquals("instance-1", payload.path("instanceId").asText());
        assertEquals("trk_0123456789abcdef", payload.path("trackSid").asText());
        assertEquals("controller-selected-device", payload.path("selectedDeviceEvidence").asText());
        assertEquals("nonce-1", payload.path("nonce").asText());
    }

    @Test void incompleteRequestCannotCreateConfirmationMaterial() throws Exception {
        final JsonNode incomplete = MAPPER.readTree("{\"projectId\":\"project-1\",\"nonce\":\"nonce-1\"}");
        final JsonNode payload = parse(ClapCorrelation.respond("c3", incomplete,
                new ClapCorrelation.SelectionEvidence("track", "device", true)));
        assertTrue(payload.path("available").asBoolean());
        assertFalse(payload.has("selectedDeviceEvidence"));
        assertFalse(payload.has("nonce"));
    }
}
