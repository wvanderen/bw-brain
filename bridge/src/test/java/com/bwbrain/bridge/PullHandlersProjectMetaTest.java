// bridge/src/test/java/com/bwbrain/bridge/PullHandlersProjectMetaTest.java
//
// Phase 5 Plan 05-03 Task 1 (TDD RED) — get.project_meta pure-builder tests
// (D-05-16 — closes the M1 tempo=120 LIMITATION documented in
// daemon/src/runtime/boot.ts + 02-07-SUMMARY.md).
//
// The builder follows the PullHandlers "pure response builder + record
// pattern" (NoteView/PageView/TrackView at :64-131): primitive/String params
// only, no Bitwig types, unit-testable without a live host (PullHandlersTest
// precedent). The dispatch case reads the Observers pull-only tempo/
// timeSignature caches (the hasContent :388-432 / sceneNames :358-371
// PULL-ONLY precedent — cache on every fire, never offer an event).
//
// No-Mockito discipline (project-wide): Observers is constructed directly
// (its ctor is plain — only register() needs Bitwig proxies), so the
// unregistered-defaults test needs no mocking at all.
package com.bwbrain.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Iterator;

import static org.junit.jupiter.api.Assertions.*;

class PullHandlersProjectMetaTest {

    private static final ObjectMapper READER = new ObjectMapper();

    private static JsonNode parseResponse(final String line) throws Exception {
        assertTrue(line.endsWith("\n"), "response line must end with newline");
        final JsonNode node = READER.readTree(line.substring(0, line.length() - 1));
        assertEquals("response", node.get("type").asText());
        assertEquals("1.0", node.get("version").asText());
        return node;
    }

    @Test
    void projectMetaSerializesExactlyNameTempoTimeSignature() throws Exception {
        // Behavior Test 1: buildProjectMetaResponse(id, 128.5, "4/4")
        // serializes exactly {id, ok:true, payload:{name, tempo, timeSignature}}
        // — field-for-field. `name` is the honest empty string: Project exposes
        // no document name in extension-api:21 (javap-verified — the
        // ClapCapabilityView.projectDocument finding at PullHandlers.java:139-149);
        // the daemon's DEFAULT_PROJECT carries the same shape.
        final String line = PullHandlers.buildProjectMetaResponse("meta-1", 128.5, "4/4");
        final JsonNode node = parseResponse(line);
        assertEquals("meta-1", node.get("id").asText());
        assertTrue(node.get("ok").asBoolean());
        final JsonNode payload = node.get("payload");
        assertNotNull(payload, "payload present");
        // Field-for-field: exactly the 3 keys, no more, no fewer.
        final Iterator<String> fields = payload.fieldNames();
        int count = 0;
        while (fields.hasNext()) {
            fields.next();
            count++;
        }
        assertEquals(3, count, "payload carries exactly {name, tempo, timeSignature}");
        assertEquals("", payload.get("name").asText());
        assertEquals(128.5, payload.get("tempo").asDouble(), 0.0001);
        assertEquals("4/4", payload.get("timeSignature").asText());
    }

    @Test
    void projectMetaBuilderIsPureNoBitwigTypesInSignature() throws Exception {
        // Behavior Test 2: purity — the builder's signature uses ONLY
        // primitives/Strings (no com.bitwig.* types), so it is JUnit-testable
        // without a live host (the buildDeviceChainResponse precedent).
        Method found = null;
        for (final Method m : PullHandlers.class.getDeclaredMethods()) {
            if ("buildProjectMetaResponse".equals(m.getName())) {
                found = m;
                break;
            }
        }
        assertNotNull(found, "buildProjectMetaResponse must exist on PullHandlers");
        assertTrue(Modifier.isPublic(found.getModifiers()), "public (called from the dispatch switch)");
        for (final Class<?> p : found.getParameterTypes()) {
            final String name = p.getName();
            assertFalse(name.startsWith("com.bitwig"),
                    "pure builder — no Bitwig types in signature, found " + name);
        }
        assertEquals(3, found.getParameterTypes().length, "(String id, double tempo, String timeSignature)");
    }

    @Test
    void unregisteredObserversAnswerHonestDefaultsMirroringDaemonDefaultProject() {
        // The dispatch case reads the Observers caches. Before any transport
        // observer fires (unregistered/test construction), the caches must
        // answer the honest defaults that mirror the daemon's DEFAULT_PROJECT
        // (tempo 120, "4/4") — never a fabricated live value. Observers' ctor
        // is Bitwig-free (register() is the Bitwig entry point), so this needs
        // no mocking.
        final Observers observers = new Observers(new Outbox(), 8);
        assertEquals(120.0, observers.getTempo(), 0.0001,
                "unregistered tempo cache defaults to the honest 120 (DEFAULT_PROJECT mirror)");
        assertEquals("4/4", observers.getTimeSignature(),
                "unregistered timeSignature cache defaults to the honest 4/4");
    }
}
