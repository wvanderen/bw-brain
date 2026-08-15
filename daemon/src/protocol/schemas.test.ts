// daemon/src/protocol/schemas.test.ts
//
// SC#3 made executable: for EACH frozen JSON Schema 2020-12 file under
// schemas/protocol/, Ajv-compile it and assert a representative valid example
// passes AND at least one counter-example fails. Covers the behavior block in
// 01-01-PLAN.md Task 2 (envelope additionalProperties:false, edit undoLabel
// trust-spine, request/response required fields, handshake hello/hello.response).
//
// The envelope carries cross-file `$ref`s into the 5 message-type schemas; Ajv
// resolves those by `$id` when all schemas are registered in ONE instance (the
// json-schema-ref-parser limitation that forced scripts/gen-types.mjs does NOT
// apply at runtime — Ajv implements 2020-12 $id-based $ref resolution).
//
// ESM + NodeNext: all relative imports end in .js (AGENTS.md convention).
//
// NOTE on the Ajv import + the absence of addFormats:
//  - `ajv 8.20.0` ships no `exports` map, so the deep subpath `ajv/dist/2020`
//    resolves at runtime but NOT under tsc NodeNext ESM mode. The NAMED import
//    `{ Ajv2020 }` (with the `.js` extension) resolves cleanly under both.
//  - `ajv-formats` is intentionally NOT applied: no frozen schema uses the
//    `format` keyword (verified — they use `pattern` only), so addFormats would
//    register nothing the contract needs. Under NodeNext the ajv-formats CJS
//    default-export interop is also not callable as a static import; dropping it
//    removes a dead dependency and a tsc failure. Re-add (with a cast) if a
//    future schema introduces a `format:` keyword.
import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import envelopeSchema from "../../../schemas/protocol/envelope.schema.json" with { type: "json" };
import eventSchema from "../../../schemas/protocol/event.schema.json" with { type: "json" };
import requestSchema from "../../../schemas/protocol/request.schema.json" with { type: "json" };
import responseSchema from "../../../schemas/protocol/response.schema.json" with { type: "json" };
import editSchema from "../../../schemas/protocol/edit.schema.json" with { type: "json" };
import handshakeSchema from "../../../schemas/protocol/handshake.schema.json" with { type: "json" };
// Phase 2 (Plan 02-01): the 4 new contract schemas. Each gets a round-trip
// suite below + the assumptions[] shape on result is exercised.
import projectStateSchema from "../../../schemas/project-state.schema.json" with { type: "json" };
import intentSchema from "../../../schemas/intent.schema.json" with { type: "json" };
import cliQuerySchema from "../../../schemas/cli-query/query.schema.json" with { type: "json" };
import cliResultSchema from "../../../schemas/cli-query/result.schema.json" with { type: "json" };
// Phase 3 (Plan 03-01): the patch contract. edit.schema.json operations.items
// now $refs patch.schema.json#/$defs/PrimitiveOp — registered here so the
// cross-file $ref resolves at runtime.
import patchSchema from "../../../schemas/patch.schema.json" with { type: "json" };
import clapPeerSchema from "../../../schemas/clap/peer.schema.json" with { type: "json" };
import clapIdentitySchema from "../../../schemas/clap/identity.schema.json" with { type: "json" };
import clapTelemetrySchema from "../../../schemas/clap/telemetry.schema.json" with { type: "json" };
import clapProposalSchema from "../../../schemas/clap/proposal.schema.json" with { type: "json" };
import clapPhraseSchema from "../../../schemas/clap/phrase.schema.json" with { type: "json" };
import clapGolden from "../../../schemas/clap/fixtures/golden.json" with { type: "json" };
import { OBSERVATIONAL_EVENT_TYPES } from "./reader.js";

// Ajv2020 = JSON Schema Draft 2020-12 mode (AGENTS.md line 37: use 2020-12 not
// draft-07). The default `new Ajv()` is draft-07 and would reject our `$schema`.
const ajv = new Ajv2020({ allErrors: true, strict: false });
// Phase 3: register the patch contract FIRST — edit.schema.json operations.items
// $refs patch.schema.json#/$defs/PrimitiveOp, which Ajv must find at compile
// time. The cross-file $ref resolves by $id when both schemas are in byId.
ajv.addSchema(patchSchema);
ajv.addSchema(eventSchema);
ajv.addSchema(requestSchema);
ajv.addSchema(responseSchema);
ajv.addSchema(editSchema);
ajv.addSchema(handshakeSchema);
// Phase 2: register the 4 new contract schemas so cross-schema $refs (if any
// land later) resolve by $id. Envelope registered last.
ajv.addSchema(projectStateSchema);
ajv.addSchema(intentSchema);
ajv.addSchema(cliQuerySchema);
ajv.addSchema(cliResultSchema);
// Envelope registered last — its oneOf `$ref`s resolve to the schemas above.
ajv.addSchema(envelopeSchema);

const validateEnvelope = ajv.getSchema(envelopeSchema.$id)!;
const validateEvent = ajv.getSchema(eventSchema.$id)!;
const validateRequest = ajv.getSchema(requestSchema.$id)!;
const validateResponse = ajv.getSchema(responseSchema.$id)!;
const validateEdit = ajv.getSchema(editSchema.$id)!;
const validateHandshake = ajv.getSchema(handshakeSchema.$id)!;
const validateProjectState = ajv.getSchema(projectStateSchema.$id)!;
const validateIntent = ajv.getSchema(intentSchema.$id)!;
const validateCliQuery = ajv.getSchema(cliQuerySchema.$id)!;
const validateCliResult = ajv.getSchema(cliResultSchema.$id)!;

describe("envelope.schema.json (SC#3 versioned wire envelope)", () => {
  it("accepts a valid hello message", () => {
    const ok = validateEnvelope({
      version: "1.0",
      type: "hello",
      payload: { capabilities: ["events"] },
    });
    expect(ok, JSON.stringify(validateEnvelope.errors)).toBe(true);
  });

  it("accepts a valid selection.changed event", () => {
    const ok = validateEnvelope({
      version: "1.0",
      type: "selection.changed",
      timestamp: 1773501001,
      payload: { trackId: "trk_5", clipId: "clip_19", deviceId: "dev_2" },
    });
    expect(ok, JSON.stringify(validateEnvelope.errors)).toBe(true);
  });

  it("rejects a message missing `version`", () => {
    const ok = validateEnvelope({ type: "hello", payload: { capabilities: [] } });
    expect(ok).toBe(false);
  });

  it("rejects a message missing `type`", () => {
    const ok = validateEnvelope({ version: "1.0", payload: { capabilities: [] } });
    expect(ok).toBe(false);
  });

  it("rejects an unknown top-level property (additionalProperties: false)", () => {
    const ok = validateEnvelope({
      version: "1.0",
      type: "hello",
      bogus: true,
      payload: { capabilities: [] },
    });
    expect(ok).toBe(false);
  });
});

describe("event.schema.json (selection.changed)", () => {
  it("accepts the seed.md selection.changed example", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "selection.changed",
      timestamp: 1773501001,
      payload: { trackId: "trk_5", clipId: "clip_19", deviceId: "dev_2" },
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it("accepts an empty-selection event (payload all-optional)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "selection.changed",
      timestamp: 1,
      payload: {},
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it("rejects a response-shaped object (type enum + additionalProperties)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "response",
      id: "r1",
      ok: true,
      payload: {},
    });
    expect(ok).toBe(false);
  });

  it("rejects an event missing `timestamp` (sender-originated, required)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "selection.changed",
      payload: {},
    });
    expect(ok).toBe(false);
  });
});

describe("request.schema.json (get.selected_clip)", () => {
  it("accepts get.selected_clip with id (correlation key)", () => {
    const ok = validateRequest({ version: "1.0", type: "get.selected_clip", id: "req_91" });
    expect(ok, JSON.stringify(validateRequest.errors)).toBe(true);
  });

  it("rejects a request missing `id`", () => {
    const ok = validateRequest({ version: "1.0", type: "get.selected_clip" });
    expect(ok).toBe(false);
  });
});

describe("response.schema.json ({id, ok, payload})", () => {
  it("accepts {id, ok:true, payload}", () => {
    const ok = validateResponse({
      version: "1.0",
      type: "response",
      id: "req_91",
      ok: true,
      payload: { clipId: "clip_19", notes: [] },
    });
    expect(ok, JSON.stringify(validateResponse.errors)).toBe(true);
  });

  it("rejects a response missing `ok`", () => {
    const ok = validateResponse({
      version: "1.0",
      type: "response",
      id: "req_91",
      payload: {},
    });
    expect(ok).toBe(false);
  });
});

describe("edit.schema.json (apply.patch — trust-spine)", () => {
  it("accepts apply.patch WITH undoLabel + non-empty operations", () => {
    const ok = validateEdit({
      version: "1.0",
      type: "apply.patch",
      id: "req_92",
      payload: {
        undoLabel: "bw-brain: subtle variation",
        operations: [
          // Phase 3 (EDIT-01) tightened operations.items to $ref the
          // PrimitiveOp union. The legacy {type:"midi_velocity_scale",...}
          // Phase-1 stub fixture is replaced with a valid primitive op.
          {
            op: "add_note",
            note: { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.5, velocity: 100 },
          },
        ],
      },
    });
    expect(ok, JSON.stringify(validateEdit.errors)).toBe(true);
  });

  it("REJECTS apply.patch WITHOUT payload.undoLabel (trust-spine enforcement)", () => {
    const ok = validateEdit({
      version: "1.0",
      type: "apply.patch",
      id: "req_92",
      payload: {
        operations: [
          { op: "add_note", note: { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.5, velocity: 100 } },
        ],
      },
    });
    expect(ok).toBe(false);
  });

  it("REJECTS apply.patch WITH empty operations array", () => {
    const ok = validateEdit({
      version: "1.0",
      type: "apply.patch",
      id: "req_92",
      payload: { undoLabel: "x", operations: [] },
    });
    expect(ok).toBe(false);
  });

  it("REJECTS apply.patch WITH empty-string undoLabel", () => {
    const ok = validateEdit({
      version: "1.0",
      type: "apply.patch",
      id: "req_92",
      payload: { undoLabel: "", operations: [{}] },
    });
    expect(ok).toBe(false);
  });

  it("REJECTS apply.patch WITH a non-primitive operation (Phase 3 EDIT-01 tightening)", () => {
    // The legacy {type:"midi_velocity_scale",...} shape is no longer valid —
    // operations.items $ref's patch.schema.json#/$defs/PrimitiveOp.
    const ok = validateEdit({
      version: "1.0",
      type: "apply.patch",
      id: "req_92",
      payload: {
        undoLabel: "x",
        operations: [{ type: "midi_velocity_scale", target: "clip_19", amount: 0.12 }],
      },
    });
    expect(ok).toBe(false);
  });
});

describe("handshake.schema.json (hello / hello.response)", () => {
  it("accepts hello with capabilities", () => {
    const ok = validateHandshake({
      version: "1.0",
      type: "hello",
      payload: { capabilities: ["events", "requests"] },
    });
    expect(ok, JSON.stringify(validateHandshake.errors)).toBe(true);
  });

  it("accepts hello.response with ok + serverVersion", () => {
    const ok = validateHandshake({
      version: "1.0",
      type: "hello.response",
      ok: true,
      payload: { serverVersion: "1.0" },
    });
    expect(ok, JSON.stringify(validateHandshake.errors)).toBe(true);
  });

  it("rejects hello.response missing `ok`", () => {
    const ok = validateHandshake({
      version: "1.0",
      type: "hello.response",
      payload: { serverVersion: "1.0" },
    });
    expect(ok).toBe(false);
  });

  it("rejects hello.response missing payload.serverVersion", () => {
    const ok = validateHandshake({
      version: "1.0",
      type: "hello.response",
      ok: true,
      payload: {},
    });
    expect(ok).toBe(false);
  });

  it("rejects hello missing payload.capabilities", () => {
    const ok = validateHandshake({
      version: "1.0",
      type: "hello",
      payload: {},
    });
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 (Plan 02-01): the 4 new contract schemas + the Pitfall-1 equality
// gate. Each new schema gets a valid example (passes) + a counter-example
// (fails), mirroring the Phase-1 round-trip discipline. The Pitfall-1 gate
// asserts reader.ts's OBSERVATIONAL_EVENT_TYPES equals event.schema.json's
// type enum — the build fails on drift so the drop-oldest backpressure
// classifies new push events correctly (RESEARCH.md lines 793-798).
// ---------------------------------------------------------------------------

describe("project-state.schema.json (STATE-01 raw-state)", () => {
  it("accepts a valid raw-state with fingerprint trackSid", () => {
    const ok = validateProjectState({
      version: "1.0",
      project: { name: "techno-sketch", tempo: 130, timeSignature: "4/4" },
      selection: { trackSid: "trk_0123456789abcdef" },
    });
    expect(ok, JSON.stringify(validateProjectState.errors)).toBe(true);
  });

  it("accepts a raw-state carrying stateFreshness + transport + region", () => {
    const ok = validateProjectState({
      version: "1.0",
      stateFreshness: "live",
      project: {
        name: "x",
        tempo: 120,
        timeSignature: "4/4",
        transport: { playing: true, positionBeats: 16.5, loop: { enabled: true, start: 0, length: 4 } },
      },
      selection: {
        trackSid: "trk_0123456789abcdef",
        clipSid: "clip_0123456789abcdef",
        deviceSid: "dev_0123456789abcdef",
        region: { start: 0, end: 16 },
      },
      tracks: [],
      clips: [],
      devices: [],
      automation: [],
    });
    expect(ok, JSON.stringify(validateProjectState.errors)).toBe(true);
  });

  it("REJECTS a bare slot-index trackSid 'trk_5' (Pitfall 2 — fingerprint defense)", () => {
    const ok = validateProjectState({
      version: "1.0",
      project: { name: "x", tempo: 120, timeSignature: "4/4" },
      selection: { trackSid: "trk_5" },
    });
    expect(ok).toBe(false);
  });

  it("REJECTS automation with items (D-04: maxItems 0 — slot reserved empty in M1)", () => {
    const ok = validateProjectState({
      version: "1.0",
      project: { name: "x", tempo: 120, timeSignature: "4/4" },
      selection: {},
      automation: [{ envelope: "forbidden" }],
    });
    expect(ok).toBe(false);
  });

  it("REJECTS an unknown top-level property (additionalProperties: false)", () => {
    const ok = validateProjectState({
      version: "1.0",
      project: { name: "x", tempo: 120, timeSignature: "4/4" },
      selection: {},
      bogus: true,
    });
    expect(ok).toBe(false);
  });

  it("REJECTS missing project.name (project required)", () => {
    const ok = validateProjectState({
      version: "1.0",
      project: { tempo: 120, timeSignature: "4/4" },
      selection: {},
    });
    expect(ok).toBe(false);
  });
});

describe("intent.schema.json (STATE-03 user-authored intent)", () => {
  it("accepts a valid intent with summary only", () => {
    const ok = validateIntent({
      version: "1.0",
      projectIntent: { summary: "techno track, dark, 130 BPM" },
    });
    expect(ok, JSON.stringify(validateIntent.errors)).toBe(true);
  });

  it("accepts an intent with summary + constraints + targets", () => {
    const ok = validateIntent({
      version: "1.0",
      projectIntent: {
        summary: "techno track",
        constraints: ["preserve bass motif", "stay under 6 min"],
        targets: ["build tension toward the drop"],
      },
    });
    expect(ok, JSON.stringify(validateIntent.errors)).toBe(true);
  });

  it("REJECTS an empty projectIntent (summary required)", () => {
    const ok = validateIntent({ version: "1.0", projectIntent: {} });
    expect(ok).toBe(false);
  });

  it("REJECTS a blank summary (minLength 1)", () => {
    const ok = validateIntent({ version: "1.0", projectIntent: { summary: "" } });
    expect(ok).toBe(false);
  });
});

describe("cli-query/query.schema.json (D-07 CLI query op)", () => {
  it("accepts focus.export without payload", () => {
    const ok = validateCliQuery({ version: "1.0", type: "query", op: "focus.export" });
    expect(ok, JSON.stringify(validateCliQuery.errors)).toBe(true);
  });

  it("accepts project.region with payload {start,end}", () => {
    const ok = validateCliQuery({
      version: "1.0",
      type: "query",
      op: "project.region",
      payload: { start: 0, end: 16 },
    });
    expect(ok, JSON.stringify(validateCliQuery.errors)).toBe(true);
  });

  it("accepts the diff op (D-05: promoted to live M1)", () => {
    const ok = validateCliQuery({ version: "1.0", type: "query", op: "diff" });
    expect(ok, JSON.stringify(validateCliQuery.errors)).toBe(true);
  });

  it("REJECTS an unknown op (Pitfall 3 — separate contract, explicit enum)", () => {
    const ok = validateCliQuery({ version: "1.0", type: "query", op: "unknown.op" });
    expect(ok).toBe(false);
  });

  it("REJECTS type !== 'query' (discriminator)", () => {
    const ok = validateCliQuery({ version: "1.0", type: "result", op: "diff" });
    expect(ok).toBe(false);
  });
});

describe("cli-query/result.schema.json (D-07 result + UX-06 assumptions)", () => {
  it("accepts an ok:true live result with payload + assumptions", () => {
    const ok = validateCliResult({
      version: "1.0",
      type: "result",
      ok: true,
      stateFreshness: "live",
      payload: { summary: "selected clip has 32 notes" },
      assumptions: [
        { claim: "selected clip has 32 notes", confidence: 1, source: "selection" },
        { claim: "intent says preserve bass motif", confidence: 1, source: "intent" },
      ],
    });
    expect(ok, JSON.stringify(validateCliResult.errors)).toBe(true);
  });

  it("accepts an ok:false stub result (not_implemented arm)", () => {
    const ok = validateCliResult({
      version: "1.0",
      type: "result",
      ok: false,
      stateFreshness: "disconnected",
      error: "not_implemented",
      availableFrom: "M2",
    });
    expect(ok, JSON.stringify(validateCliResult.errors)).toBe(true);
  });

  it("REJECTS a result missing stateFreshness (SC#3 — required on every result)", () => {
    const ok = validateCliResult({
      version: "1.0",
      type: "result",
      ok: true,
      payload: {},
    });
    expect(ok).toBe(false);
  });

  it("REJECTS ok:false MISSING error (T-2-01-S — stub arm requires error)", () => {
    const ok = validateCliResult({
      version: "1.0",
      type: "result",
      ok: false,
      stateFreshness: "live",
      availableFrom: "M2",
    });
    expect(ok).toBe(false);
  });

  it("REJECTS ok:false WITH payload (T-2-01-S — stub cannot ship fake success)", () => {
    const ok = validateCliResult({
      version: "1.0",
      type: "result",
      ok: false,
      stateFreshness: "live",
      error: "not_implemented",
      availableFrom: "M2",
      payload: { fake: "success" },
    });
    expect(ok).toBe(false);
  });

  it("REJECTS an assumptions item missing source (UX-06 shape enforcement)", () => {
    const ok = validateCliResult({
      version: "1.0",
      type: "result",
      ok: true,
      stateFreshness: "live",
      assumptions: [{ claim: "x", confidence: 0.9 }],
    });
    expect(ok).toBe(false);
  });

  it("REJECTS an assumptions item with an unknown source enum value", () => {
    const ok = validateCliResult({
      version: "1.0",
      type: "result",
      ok: true,
      stateFreshness: "live",
      assumptions: [{ claim: "x", confidence: 0.9, source: "guess" }],
    });
    expect(ok).toBe(false);
  });
});

describe("extended event/request enums (Phase 2 bridge surface)", () => {
  it("event.schema.json: track.name_changed now validates (would have been rejected pre-Phase-2)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "track.name_changed",
      timestamp: 1773501002,
      payload: {},
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it("event.schema.json: transport.changed validates", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "transport.changed",
      timestamp: 1,
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it("event.schema.json: rejects an unknown event type", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "bogus.event",
      timestamp: 1,
    });
    expect(ok).toBe(false);
  });

  // Plan 02 (bridge) payload-union extension: the 4 new event types carry
  // observed state (name/playing/slot) that the Phase-1 selection.changed-only
  // payload could not represent. These lock the additive contract Plan 03a
  // normalizes against. additionalProperties stays false (T-2-02-E).
  it("event.schema.json: track.name_changed carries a name payload (Plan 02 extension)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "track.name_changed",
      timestamp: 1,
      payload: { slot: 0, name: "Kick" },
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it("event.schema.json: transport.changed carries a boolean playing payload", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "transport.changed",
      timestamp: 1,
      payload: { playing: true },
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it("event.schema.json: selection.changed carries a raw slot (Pitfall 2 — not a stable id)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "selection.changed",
      timestamp: 1,
      payload: { slot: 3 },
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  // Phase 03.1-02 D-03a — the event payload now carries an optional `clipSid`
  // field on clip.name_changed (populated by the bridge from the V1 hash
  // sha256(trackSid:loopBeats).slice(0,16)). additionalProperties stays false
  // (trust-spine); only the allowed-properties list grew by one entry.
  it("event.schema.json: clip.name_changed carries a pattern-valid clipSid (Phase 03.1-02 D-03a)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "clip.name_changed",
      timestamp: 1,
      payload: { clipSid: "clip_a1b2c3d4e5f60718" },
    });
    expect(ok, JSON.stringify(validateEvent.errors)).toBe(true);
  });

  it("event.schema.json: REJECTS a malformed clipSid (pattern enforcement — D-03a)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "clip.name_changed",
      timestamp: 1,
      payload: { clipSid: "not-a-clip-sid" },
    });
    expect(ok).toBe(false);
  });

  it("event.schema.json: rejects an unknown payload property (additionalProperties: false preserved)", () => {
    const ok = validateEvent({
      version: "1.0",
      type: "track.name_changed",
      timestamp: 1,
      payload: { bogus: true },
    });
    expect(ok).toBe(false);
  });

  it("request.schema.json: get.project_summary now validates (enum extended)", () => {
    const ok = validateRequest({ version: "1.0", type: "get.project_summary", id: "r1" });
    expect(ok, JSON.stringify(validateRequest.errors)).toBe(true);
  });

  it("request.schema.json: get.selected_device_chain validates (enum extended)", () => {
    const ok = validateRequest({ version: "1.0", type: "get.selected_device_chain", id: "r2" });
    expect(ok, JSON.stringify(validateRequest.errors)).toBe(true);
  });
});

describe("Pitfall 1: OBSERVATIONAL_EVENT_TYPES === event.schema.json type enum", () => {
  // RESEARCH.md lines 793-798: if these two sets drift, the reader's
  // backpressure classifier mis-classifies new push events as never-drop,
  // which under a bridge flood can pause edits. This test fails the build
  // on drift (T-2-01-T mitigation).
  it("the reader's observational set size equals the event schema enum size", () => {
    const schemaEnum = eventSchema.properties.type.enum as string[];
    expect(OBSERVATIONAL_EVENT_TYPES.size).toBe(schemaEnum.length);
  });

  it("every event-schema type is in the reader's observational set", () => {
    const schemaEnum = eventSchema.properties.type.enum as string[];
    for (const t of schemaEnum) {
      expect(OBSERVATIONAL_EVENT_TYPES.has(t), `event type '${t}' missing from OBSERVATIONAL_EVENT_TYPES`).toBe(true);
    }
  });

  it("the reader's observational set has no event type outside the schema enum", () => {
    const schemaEnum = new Set(eventSchema.properties.type.enum as string[]);
    for (const t of OBSERVATIONAL_EVENT_TYPES) {
      expect(schemaEnum.has(t), `OBSERVATIONAL_EVENT_TYPES has '${t}' not in event schema enum`).toBe(true);
    }
  });
});

describe("CLAP companion bounded protocol fixtures", () => {
  const clapAjv = new Ajv2020({ allErrors: true, strict: false });
  const schemas = [
    clapPeerSchema,
    clapIdentitySchema,
    clapTelemetrySchema,
    clapProposalSchema,
    clapPhraseSchema,
  ];
  for (const schema of schemas) clapAjv.addSchema(schema);

  it.each(clapGolden.valid)("accepts $name at its declared maximum", ({ schema, value }) => {
    const validate = clapAjv.getSchema(schema);
    expect(validate, `missing validator ${schema}`).toBeTypeOf("function");
    expect(validate!(value), JSON.stringify(validate!.errors)).toBe(true);
  });

  it.each(clapGolden.invalid)("rejects $name", ({ schema, value }) => {
    const validate = clapAjv.getSchema(schema);
    expect(validate, `missing validator ${schema}`).toBeTypeOf("function");
    expect(validate!(value)).toBe(false);
  });

  it("keeps every CLAP schema closed at the top-level", () => {
    for (const schema of schemas) {
      const validate = clapAjv.getSchema(schema.$id)!;
      const valid = clapGolden.valid.find((fixture) => fixture.schema === schema.$id)!;
      expect(validate({ ...valid.value, unknown: true })).toBe(false);
    }
  });

  it("rejects unknown discriminants and every limit+1 boundary class", () => {
    const peer = clapAjv.getSchema(clapPeerSchema.$id)!;
    const telemetry = clapAjv.getSchema(clapTelemetrySchema.$id)!;
    const proposal = clapAjv.getSchema(clapProposalSchema.$id)!;
    const phrase = clapAjv.getSchema(clapPhraseSchema.$id)!;
    const hello = clapGolden.valid[0]!.value;
    const snapshot = clapGolden.valid[2]!.value;
    const published = clapGolden.valid[3]!.value;
    const armed = clapGolden.valid[4]!.value;

    expect(peer({ ...hello, type: "clap.unknown" })).toBe(false);
    expect(peer({ ...hello, instanceId: "i".repeat(65) })).toBe(false);
    expect(peer({ ...hello, limits: { ...hello.limits, maxLineBytes: 65537 } })).toBe(false);
    expect(peer({ ...hello, limits: { ...hello.limits, maxQueueBytes: 262145 } })).toBe(false);
    expect(peer({ ...hello, capabilities: [...(hello.capabilities ?? []), "c16"] })).toBe(false);
    expect(telemetry({ type: "conversation.chunk", requestId: "r", sequence: 0, text: "x".repeat(513) })).toBe(false);
    const recentNotes = snapshot.recentNotes ?? [];
    expect(telemetry({ ...snapshot, recentNotes: [...recentNotes, recentNotes[0]] })).toBe(false);
    expect(proposal({ ...published, rationale: "x".repeat(513) })).toBe(false);
    expect(phrase({ ...armed, lengthBeats: 65 })).toBe(false);
  });

  it("accepts one confirmed-scope Analyze request and its bounded lifecycle responses", () => {
    const telemetry = clapAjv.getSchema(clapTelemetrySchema.$id)!;
    const scope = { projectId: "project-a", instanceId: "instance-a", clipSid: "clip-a" };
    expect(telemetry({ type: "analysis.request", requestId: "analysis-1", scope })).toBe(true);
    expect(telemetry({ type: "analysis.status", requestId: "analysis-1", status: "running", scope })).toBe(true);
    expect(telemetry({ type: "analysis.complete", requestId: "analysis-1", status: "ok" })).toBe(true);
    expect(telemetry({ type: "analysis.complete", requestId: "analysis-1", status: "error", error: "analysis_auth_required" })).toBe(true);
    expect(telemetry({ type: "analysis.complete", requestId: "analysis-1", status: "error", error: "raw provider detail" })).toBe(false);
  });
});
