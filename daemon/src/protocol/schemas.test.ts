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
import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import envelopeSchema from "../../../schemas/protocol/envelope.schema.json" with { type: "json" };
import eventSchema from "../../../schemas/protocol/event.schema.json" with { type: "json" };
import requestSchema from "../../../schemas/protocol/request.schema.json" with { type: "json" };
import responseSchema from "../../../schemas/protocol/response.schema.json" with { type: "json" };
import editSchema from "../../../schemas/protocol/edit.schema.json" with { type: "json" };
import handshakeSchema from "../../../schemas/protocol/handshake.schema.json" with { type: "json" };

// Ajv2020 = JSON Schema Draft 2020-12 mode (AGENTS.md line 37: use 2020-12 not
// draft-07). The default `new Ajv()` is draft-07 and would reject our `$schema`.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(eventSchema);
ajv.addSchema(requestSchema);
ajv.addSchema(responseSchema);
ajv.addSchema(editSchema);
ajv.addSchema(handshakeSchema);
// Envelope registered last — its oneOf `$ref`s resolve to the schemas above.
ajv.addSchema(envelopeSchema);

const validateEnvelope = ajv.getSchema(envelopeSchema.$id)!;
const validateEvent = ajv.getSchema(eventSchema.$id)!;
const validateRequest = ajv.getSchema(requestSchema.$id)!;
const validateResponse = ajv.getSchema(responseSchema.$id)!;
const validateEdit = ajv.getSchema(editSchema.$id)!;
const validateHandshake = ajv.getSchema(handshakeSchema.$id)!;

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
        operations: [{ type: "midi_velocity_scale", target: "clip_19", amount: 0.12 }],
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
        operations: [{ type: "midi_velocity_scale", target: "clip_19", amount: 0.12 }],
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
