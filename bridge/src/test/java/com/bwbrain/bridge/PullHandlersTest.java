// bridge/src/test/java/com/bwbrain/bridge/PullHandlersTest.java
//
// Pure-logic tests for the PullHandlers response builders. These exercise the
// response-shape builders WITHOUT live Bitwig (RESEARCH.md §Validation
// Architecture "Manual-Only" table — the bridge cannot be integration-tested
// against Bitwig without a harness). The builders take simple view records
// (NoteView / PageView / TrackView) and produce response lines shaped per
// schemas/protocol/response.schema.json ({version,type:"response",id,ok,payload}).
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PullHandlersTest {

    private static final ObjectMapper READER = new ObjectMapper();

    private static JsonNode parseResponse(final String line) throws Exception {
        assertTrue(line.endsWith("\n"), "response line must end with newline");
        final JsonNode node = READER.readTree(line.substring(0, line.length() - 1));
        assertEquals("response", node.get("type").asText(), "pull responses use type 'response'");
        assertEquals("1.0", node.get("version").asText());
        assertTrue(node.has("id"), "response carries the echoed request id");
        return node;
    }

    @Test
    void buildClipResponseCarriesNonEmptyNotesArray() throws Exception {
        // NoteView is the daemon's Note shape: (key, pitch, start-beats, length-beats, velocity-1-127).
        final List<PullHandlers.NoteView> notes = List.of(
                new PullHandlers.NoteView("n:60:0.0000", 60, 0.0, 0.25, 100.0),
                new PullHandlers.NoteView("n:64:0.5000", 64, 0.5, 0.125, 95.0));
        // Phase 03.1-02 D-03b: buildClipResponse now carries the top-level clipSid.
        final String line = PullHandlers.buildClipResponse("req-1", notes, "clip_a1b2c3d4e5f60718");
        final JsonNode node = parseResponse(line);
        assertEquals("req-1", node.get("id").asText());
        assertTrue(node.get("ok").asBoolean());
        assertTrue(node.get("payload").get("notes").isArray());
        assertEquals(2, node.get("payload").get("notes").size());
        final JsonNode first = node.get("payload").get("notes").get(0);
        assertEquals("n:60:0.0000", first.get("key").asText());
        assertEquals(60, first.get("pitch").asInt());
        assertEquals(0.0, first.get("start").asDouble(), 0.001);
        assertEquals(0.25, first.get("length").asDouble(), 0.001);
        assertEquals(100.0, first.get("velocity").asDouble(), 0.001);
        // D-03b: clipSid rides at the payload top level alongside notes.
        assertEquals("clip_a1b2c3d4e5f60718", node.get("payload").get("clipSid").asText());
    }

    @Test
    void buildClipResponseEmptyNotesIsStillValidOkResponse() throws Exception {
        final String line = PullHandlers.buildClipResponse("req-2", List.of(), "clip_0000000000000000");
        final JsonNode node = parseResponse(line);
        assertTrue(node.get("ok").asBoolean());
        assertEquals(0, node.get("payload").get("notes").size());
        assertEquals("clip_0000000000000000", node.get("payload").get("clipSid").asText());
    }

    @Test
    void buildDeviceChainResponseCarriesPagesWithRemotes() throws Exception {
        final List<PullHandlers.RemoteView> remotes = List.of(
                new PullHandlers.RemoteView("Cutoff", 0.5),
                new PullHandlers.RemoteView("Resonance", 0.1));
        final List<PullHandlers.PageView> pages = List.of(
                new PullHandlers.PageView("Main", remotes));
        final String line = PullHandlers.buildDeviceChainResponse("req-3", pages);
        final JsonNode node = parseResponse(line);
        assertTrue(node.get("ok").asBoolean());
        final JsonNode pagesNode = node.get("payload").get("pages");
        assertEquals(1, pagesNode.size());
        assertEquals("Main", pagesNode.get(0).get("name").asText());
        assertEquals(2, pagesNode.get(0).get("remotes").size());
        assertEquals("Cutoff", pagesNode.get(0).get("remotes").get(0).get("name").asText());
        assertEquals(0.5, pagesNode.get(0).get("remotes").get(0).get("value").asDouble(), 0.001);
    }

    @Test
    void buildDeviceChainResponseEmptyPagesIsTheDeferredM1Floor() throws Exception {
        // get.selected_device_chain returns an empty pages list until Task-3 live
        // verification resolves the CursorRemoteControlsPage parameter-walk path
        // (Open Question A1 / Pitfall 10 — CursorDevice has no getRemoteControls()
        // in extension-api:21). Empty is a valid ok response, not an error.
        final String line = PullHandlers.buildDeviceChainResponse("req-4", List.of());
        final JsonNode node = parseResponse(line);
        assertTrue(node.get("ok").asBoolean());
        assertEquals(0, node.get("payload").get("pages").size());
    }

    @Test
    void buildProjectSummaryResponseCarriesBankSizeTrackEntries() throws Exception {
        final List<PullHandlers.TrackView> tracks = List.of(
                new PullHandlers.TrackView(0, "Kick"),
                new PullHandlers.TrackView(1, "Bass"),
                new PullHandlers.TrackView(2, ""));
        final String line = PullHandlers.buildProjectSummaryResponse("req-5", tracks);
        final JsonNode node = parseResponse(line);
        assertTrue(node.get("ok").asBoolean());
        final JsonNode tracksNode = node.get("payload").get("tracks");
        assertEquals(3, tracksNode.size());
        assertEquals(0, tracksNode.get(0).get("slot").asInt());
        assertEquals("Kick", tracksNode.get(0).get("name").asText());
        assertEquals("", tracksNode.get(2).get("name").asText());
    }

    @Test
    void unknownRequestTypeProducesErrorResponse() throws Exception {
        // LineJson.responseError is the dispatch error arm (unknown_request /
        // internal). Verified here so the pull-handler error path is locked.
        final String line = LineJson.responseError("req-6", "unknown_request");
        final JsonNode node = parseResponse(line);
        assertFalse(node.get("ok").asBoolean());
        assertEquals("unknown_request", node.get("payload").get("error").asText());
    }
}
