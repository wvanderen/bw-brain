package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** Pure, read-only controller evidence builder for daemon/CLAP correlation. */
public final class ClapCorrelation {
    private ClapCorrelation() {}

    public record SelectionEvidence(String trackSidHint, String deviceNameHint,
                                    boolean selectedDeviceAvailable) {}

    public static String respond(final String id, final JsonNode payload,
                                 final SelectionEvidence evidence) {
        final Map<String, Object> out = new LinkedHashMap<>();
        final String projectId = text(payload, "projectId");
        final String instanceId = text(payload, "instanceId");
        final String requestedTrackSid = text(payload, "trackSid");
        final String nonce = text(payload, "nonce");

        out.put("available", evidence.selectedDeviceAvailable());
        out.put("trackSidHint", nullable(evidence.trackSidHint()));
        out.put("deviceHint", nullable(evidence.deviceNameHint()));
        if (evidence.selectedDeviceAvailable()
                && projectId != null && instanceId != null
                && requestedTrackSid != null && nonce != null) {
            out.put("projectId", projectId);
            out.put("instanceId", instanceId);
            out.put("trackSid", requestedTrackSid);
            out.put("selectedDeviceEvidence", "controller-selected-device");
            out.put("nonce", nonce);
        }
        return LineJson.response(id, true, out);
    }

    /** Recognizes only the additive read-only request; mutation cases remain elsewhere. */
    static Optional<String> dispatch(final String type, final String id, final JsonNode payload,
                                     final SelectionEvidence evidence) {
        if (!"get.clap_correlation".equals(type)) return Optional.empty();
        return Optional.of(respond(id, payload, evidence));
    }

    private static String text(final JsonNode payload, final String field) {
        if (payload == null || !payload.has(field) || !payload.get(field).isTextual()) return null;
        final String value = payload.get(field).asText();
        return value.isBlank() ? null : value;
    }

    private static String nullable(final String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
