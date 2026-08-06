package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/** Contract tests for the read-only Phase 04.1 controller capability probe. */
class ClapCapabilityProbeTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode parse(final String line) throws Exception {
        assertTrue(line.endsWith("\n"));
        return MAPPER.readTree(line.substring(0, line.length() - 1));
    }

    @Test
    void responseSeparatesObservedValuesFromUnavailableIdentityFields() throws Exception {
        final PullHandlers.ClapCapabilityView view = new PullHandlers.ClapCapabilityView(
                "Polymer", true);
        final JsonNode response = parse(PullHandlers.buildClapCapabilityResponse("cap-1", view));
        final JsonNode payload = response.path("payload");

        assertTrue(response.path("ok").asBoolean());
        assertEquals("cap-1", response.path("id").asText());
        assertEquals("Polymer", payload.path("selectedDevice").path("name").asText());
        assertTrue(payload.path("selectedDevice").path("nameAvailable").asBoolean());
        assertTrue(payload.path("selectedDevice").path("selected").asBoolean());

        assertTrue(payload.path("projectDocument").path("name").isNull());
        assertFalse(payload.path("projectDocument").path("nameAvailable").asBoolean());
        assertTrue(payload.path("projectDocument").path("path").isNull());
        assertFalse(payload.path("projectDocument").path("pathAvailable").asBoolean());
        assertTrue(payload.path("projectDocument").path("stableId").isNull());
        assertFalse(payload.path("projectDocument").path("stableIdAvailable").asBoolean());
        assertFalse(payload.path("projectDocument").path("saveAsObservable").asBoolean());
    }

    @Test
    void unavailableSelectedDeviceIsExplicitAndNeverInferred() throws Exception {
        final PullHandlers.ClapCapabilityView view = new PullHandlers.ClapCapabilityView("", false);
        final JsonNode payload = parse(PullHandlers.buildClapCapabilityResponse("cap-2", view)).path("payload");

        assertTrue(payload.path("selectedDevice").path("name").isNull());
        assertFalse(payload.path("selectedDevice").path("nameAvailable").asBoolean());
        assertFalse(payload.path("selectedDevice").path("selected").asBoolean());
        assertEquals("controller-api:21", payload.path("apiSurface").asText());
    }

    @Test
    void capabilityDispatcherAcceptsOnlyTheReadOnlyRequest() throws Exception {
        final PullHandlers.ClapCapabilityView view = new PullHandlers.ClapCapabilityView("Polymer", true);

        final Optional<String> probe = PullHandlers.dispatchClapCapabilityRequest(
                "get.clap_capabilities", "cap-3", view);
        assertTrue(probe.isPresent());
        assertTrue(parse(probe.orElseThrow()).path("ok").asBoolean());

        assertTrue(PullHandlers.dispatchClapCapabilityRequest("apply.patch", "mut-1", view).isEmpty());
        assertTrue(PullHandlers.dispatchClapCapabilityRequest("set.project", "mut-2", view).isEmpty());
    }
}
