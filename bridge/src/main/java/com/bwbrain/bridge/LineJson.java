// bridge/src/main/java/com/bwbrain/bridge/LineJson.java
//
// Thin Jackson-backed serializer for JSON-Lines message lines. Replaces the
// Phase-1 spike's hand-concatenated JSON strings (SpikeExtension lines 93-95)
// with com.fasterxml.jackson.databind.ObjectMapper per AGENTS.md §Technology
// Stack. Every produced line is a single JSON object terminated by '\n'
// (jsonlines.org); the writer thread writes the bytes verbatim.
//
// Shapes match the frozen protocol schemas:
//   - event:    schemas/protocol/event.schema.json  -> {version,type,timestamp,payload}
//   - response: schemas/protocol/response.schema.json -> {version,type:"response",id,ok,payload}
//
// ObjectMapper is thread-safe after configuration (one shared static instance),
// which matters because both the controller-thread observers (via Outbox.offer)
// and the pull-handler thread call these builders concurrently.
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

public final class LineJson {

    public static final String VERSION = "1.0";

    // Jackson ObjectMapper is documented thread-safe once configured; sharing one
    // instance avoids per-call mapper construction overhead in observer callbacks.
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private LineJson() {}

    /** Base envelope for an observational event (sender-originated, no ack). */
    public static String event(final String type, final Map<String, ?> payload, final long timestampUnixSec) {
        final Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("version", VERSION);
        envelope.put("type", type);
        envelope.put("timestamp", timestampUnixSec);
        envelope.put("payload", payload == null ? Map.of() : payload);
        return toJson(envelope);
    }

    /** Response to a prior get.* request. `id` echoes the originating request id. */
    public static String response(final String id, final boolean ok, final Map<String, ?> payload) {
        final Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("version", VERSION);
        envelope.put("type", "response");
        envelope.put("id", id);
        envelope.put("ok", ok);
        envelope.put("payload", payload == null ? Map.of() : payload);
        return toJson(envelope);
    }

    /** Error response ({ok:false, payload:{error:<code>}}). For unknown/failed pull handlers. */
    public static String responseError(final String id, final String errorCode) {
        return response(id, false, Map.of("error", errorCode));
    }

    private static String toJson(final Map<String, Object> envelope) {
        try {
            // Include the trailing newline so the writer thread writes the line
            // verbatim (matches the spike's embedded-\n convention; the daemon's
            // LineBuffer splits on '\n').
            return MAPPER.writeValueAsString(envelope) + "\n";
        } catch (final Exception e) {
            // ObjectMapper only throws on genuinely un-serializable nodes; our
            // payloads are plain Maps of primitives. Re-throw so a bug surfaces
            // loudly rather than emitting a malformed line.
            throw new RuntimeException("LineJson serialization failed: " + e.getMessage(), e);
        }
    }
}
