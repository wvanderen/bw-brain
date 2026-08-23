import { describe, expect, it, vi } from "vitest";
import { createRestrictedPiTools, PREVIEW_EDIT_PARAMETERS } from "./pi-tools.js";
import { Ajv2020 } from "ajv/dist/2020.js";

// 05-05 Task 2: compile PREVIEW_EDIT_PARAMETERS ONCE for accept/reject tests
// (mirrors patch-schema.ts's standalone-compiled-validators pattern).
const validatePreviewParams = new Ajv2020({ allErrors: true, strict: false }).compile(
  PREVIEW_EDIT_PARAMETERS as unknown as object,
);

/** N distinct automation points (beat i, value cycling within [0,1]). */
function points(n: number): { beat: number; value: number }[] {
  return Array.from({ length: n }, (_, i) => ({ beat: i, value: (i % 8) / 8 }));
}

/** A canonical automation-flavored preview_edit input. */
function automationPreviewInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    undoLabel: "filter sweep",
    scope: {
      deviceSid: "dev_0123456789abcdef",
      paramIndex: 5,
      paramSource: "remote_page",
      region: { startBar: 0, lengthBars: 8 },
    },
    operations: [{ op: "automation_points", points: points(4) }],
    rationale: "bounded macro sweep",
    reversibility: "manual-inverse",
    risk: "medium",
    ...overrides,
  };
}

describe("restricted Pi tools", () => {
  it("exposes only handler-backed reads, preview, and proposal creation", async () => {
    const deps = { readConfirmedScope: vi.fn(async () => ({ projectId: "p", instanceId: "i" })), readContext: vi.fn(async () => ({ tempo: 120 })), preview: vi.fn(async () => ({ patchId: "x" })), createProposal: vi.fn(async () => ({ proposalId: "y" })) };
    const tools = createRestrictedPiTools(deps);
    expect(tools.map(t => t.name)).toEqual(["read_confirmed_scope", "read_context", "preview_edit", "create_proposal"]);
    expect(tools.map(t => t.name).join(" ")).not.toMatch(/apply|arm|socket|file|audio/);
    const previewEdit = tools.find(tool => tool.name === "preview_edit")!;
    expect((previewEdit as PiToolWithParameters).parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["scope", "operations", "rationale", "reversibility", "risk"],
      properties: {
        scope: { oneOf: expect.any(Array) },
        operations: { type: "array", minItems: 1, maxItems: 64, items: { oneOf: expect.any(Array) } },
        rationale: { type: "string" },
        reversibility: { enum: ["self-inverse", "manual-inverse", "irreversible"] },
        risk: { enum: ["low", "medium", "high"] },
      },
    });
    // 05-05 Task 2: scope is a oneOf carrying BOTH the unchanged clip member
    // and the bounded automation member (extended, not weakened).
    const scope = ((previewEdit as PiToolWithParameters).parameters as { scope: { oneOf: object[] } }).scope;
    expect(scope.oneOf).toHaveLength(2);
    expect(scope.oneOf[0]).toMatchObject({ type: "object", additionalProperties: false, required: ["clipSid"] });
    expect(scope.oneOf[1]).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["deviceSid", "paramIndex", "paramSource", "region"],
    });
    // The operations oneOf now carries SIX kinds (3 note + 3 automation).
    const operations = ((previewEdit as PiToolWithParameters).parameters as { operations: { items: { oneOf: object[] } } }).operations;
    expect(operations.items.oneOf).toHaveLength(6);
    const createProposal = tools.find(tool => tool.name === "create_proposal")!;
    expect((createProposal as PiToolWithParameters).parameters).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["proposalId", "kind", "scope", "rationale", "assumptions", "material"],
      properties: {
        proposalId: { type: "string" },
        kind: { enum: ["existing_edit", "live_midi"] },
        scope: { type: "object", required: ["projectId", "instanceId"] },
        rationale: { type: "string" },
        assumptions: { type: "array" },
        material: expect.objectContaining({ oneOf: expect.any(Array) }),
      },
    });
    await tools[0]!.execute({}, new AbortController().signal);
    expect(deps.readConfirmedScope).toHaveBeenCalledOnce();
    expect(Object.keys(tools[0]!)).not.toContain("controller");
  });
});

// ============================================================================
// Phase 5 Plan 05-05 Task 2 — the preview_edit parameter surface widens to
// bounded automation (D-05-14 bounds mirrored from patch.schema.json); the
// TOOL LIST stays closed (no apply/arm/socket/filesystem/audio handles).
// ============================================================================

describe("PREVIEW_EDIT_PARAMETERS automation surface (05-05 Task 2)", () => {
  it("ACCEPTS an automation scope + automation_points op with 64 points (Test 4)", () => {
    const input = automationPreviewInput({
      operations: [{ op: "automation_points", points: points(64) }],
    });
    expect(validatePreviewParams(input), JSON.stringify(validatePreviewParams.errors)).toBe(true);
  });

  it("REJECTS 65 points (maxItems 64, D-05-14) and an out-of-[0,1] value (Test 4)", () => {
    expect(
      validatePreviewParams(automationPreviewInput({ operations: [{ op: "automation_points", points: points(65) }] })),
    ).toBe(false);
    expect(
      validatePreviewParams(
        automationPreviewInput({ operations: [{ op: "automation_points", points: [{ beat: 0, value: 1.5 }] }] }),
      ),
    ).toBe(false);
    expect(
      validatePreviewParams(automationPreviewInput({ operations: [{ op: "set_parameter_value", value: -0.1 }] })),
    ).toBe(false);
  });

  it("REJECTS automation-scope shape violations: bad deviceSid, paramIndex 128, lengthBars 17, extra fields", () => {
    expect(
      validatePreviewParams(automationPreviewInput({ scope: { deviceSid: "dev_short", paramIndex: 5, paramSource: "remote_page", region: { startBar: 0, lengthBars: 8 } } })),
    ).toBe(false);
    expect(
      validatePreviewParams(automationPreviewInput({ scope: { deviceSid: "dev_0123456789abcdef", paramIndex: 128, paramSource: "remote_page", region: { startBar: 0, lengthBars: 8 } } })),
    ).toBe(false);
    expect(
      validatePreviewParams(automationPreviewInput({ scope: { deviceSid: "dev_0123456789abcdef", paramIndex: 5, paramSource: "remote_page", region: { startBar: 0, lengthBars: 17 } } })),
    ).toBe(false);
    expect(
      validatePreviewParams(automationPreviewInput({ scope: { deviceSid: "dev_0123456789abcdef", paramIndex: 5, paramSource: "remote_page", region: { startBar: 0, lengthBars: 8 }, extra: true } })),
    ).toBe(false);
  });

  it("the clip-scope member still accepts the legacy clip preview input unchanged", () => {
    const clipInput = {
      scope: { clipSid: "clip_0123456789abcdef" },
      operations: [{ op: "add_note", note: { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.5, velocity: 100 } }],
      rationale: "add a kick",
      reversibility: "self-inverse",
      risk: "low",
    };
    expect(validatePreviewParams(clipInput), JSON.stringify(validatePreviewParams.errors)).toBe(true);
  });

  it("the tool list remains closed — no new tools, no apply/arm/socket/filesystem/audio parameters (Test 5)", () => {
    const tools = createRestrictedPiTools({
      readConfirmedScope: vi.fn(async () => ({})),
      readContext: vi.fn(async () => ({})),
      preview: vi.fn(async () => ({})),
      createProposal: vi.fn(async () => ({})),
    });
    // Tool count unchanged: exactly the four handler-backed tools.
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name).sort()).toEqual(["create_proposal", "preview_edit", "read_confirmed_scope", "read_context"]);
    // The widened preview parameters contain no authority-shaped entries.
    const props = (PREVIEW_EDIT_PARAMETERS.properties ?? {}) as Record<string, unknown>;
    for (const forbidden of ["apply", "arm", "armToken", "socket", "filePath", "audio"]) {
      expect(props).not.toHaveProperty(forbidden);
    }
  });
});

type PiToolWithParameters = { parameters?: Record<string, unknown> };
