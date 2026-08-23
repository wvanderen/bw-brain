// daemon/src/patch/patch-schema.test.ts
//
// Phase 3 (EDIT-01) — the Patch contract validator tests.
//
// Mirrors daemon/src/protocol/schemas.test.ts:26-65 (Ajv addSchema + getSchema
// by $id) but exercises the CANONICAL boot-time-compiled validator exported
// from ./patch-schema.ts (the same instance the CLI + daemon import). The
// cross-file $ref edit.schema.json operations.items -> patch.schema.json
// PrimitiveOp is loaded by patch-schema.ts at module init, so importing
// validatePatch is sufficient — no per-test recompile.
//
// Coverage (Task 1 <behavior>):
//   - a well-formed Patch VALIDATES;
//   - patch.schema.json REJECTS: missing patchId, empty operations array,
//     unknown op discriminant, Note with velocity 0, Note with pitch 128,
//     Note missing a required field, additionalProperties violation;
//   - the primitive discriminated union accepts all three op kinds.
//
// Pitfall 2 layering note: the before.key===after.key invariant for
// update_note_field is enforced at the TS + runtime layer (arb.ts constrains
// the generator; resolveOps/previewPatch + INV-1 round-trip pin it), NOT at the
// schema level. Pure JSON Schema 2020-12 cannot express cross-property equality
// without the non-standard $data keyword (which the Java bridge's Jackson
// parser would ignore but Ajv needs {$data:true} for — breaking pristine
// portability). The schema $comment at UpdateNoteFieldOp documents this. A
// valid (matched-key) update_note_field is asserted to PASS here; the runtime
// guard is pinned in inverse-ops.test.ts (INV-1/2) + arb.ts.
import { describe, it, expect } from "vitest";
import { validatePatch, validatePatchOrThrow } from "./patch-schema.js";

/** A canonical valid Note (matches the n:${pitch}:${startQuantized} key scheme). */
function validNote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "n:60:0.0000",
    pitch: 60,
    start: 0,
    length: 0.5,
    velocity: 100,
    ...overrides,
  };
}

/** A canonical valid Patch (single add_note op). Callers mutate to build counter-examples. */
function validPatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patchId: "pt_00000000-0000-4000-8000-000000000000",
    undoLabel: "humanize test clip",
    scope: { clipSid: "clip_0123456789abcdef" },
    operations: [{ op: "add_note", note: validNote() }],
    rationale: "add a kick on the downbeat",
    reversibility: "self-inverse",
    risk: "low",
    ...overrides,
  };
}

describe("patch.schema.json (EDIT-01 — Patch contract validator)", () => {
  it("VALIDATES a well-formed Patch (single add_note)", () => {
    expect(validatePatch(validPatch()), JSON.stringify(validatePatch.errors)).toBe(true);
  });

  it("VALIDATES a Patch with all three primitive op kinds", () => {
    const patch = validPatch({
      operations: [
        { op: "add_note", note: validNote({ key: "n:60:0.0000" }) },
        {
          op: "update_note_field",
          before: validNote({ key: "n:64:1.0000", pitch: 64, start: 1 }),
          after: validNote({ key: "n:64:1.0000", pitch: 64, start: 1, velocity: 80 }),
        },
        { op: "remove_note", note: validNote({ key: "n:72:2.0000", pitch: 72, start: 2 }) },
      ],
    });
    expect(validatePatch(patch), JSON.stringify(validatePatch.errors)).toBe(true);
  });

  it("VALIDATES optional metadata (transformIntent, harmonicCenter, assumptions, motifSimilarity, belowBar)", () => {
    const patch = validPatch({
      transformIntent: { name: "humanize", variant: "gaussian-velocity", profile: "generic" },
      harmonicCenter: { key: "A", mode: "minor", source: "authored", confidence: 1.0 },
      motifSimilarity: 0.92,
      belowBar: false,
      assumptions: [
        { claim: "harmonicCenter: authored in intent.json", confidence: 1.0, source: "intent" },
      ],
    });
    expect(validatePatch(patch), JSON.stringify(validatePatch.errors)).toBe(true);
  });

  it("VALIDATES a region-scoped Patch (D-11 scope.region {start,end})", () => {
    const patch = validPatch({ scope: { clipSid: "clip_0123456789abcdef", region: { start: 0, end: 4 } } });
    expect(validatePatch(patch), JSON.stringify(validatePatch.errors)).toBe(true);
  });

  // --- counter-examples (schema-rejected) ---

  it("REJECTS a Patch missing patchId", () => {
    const { patchId: _omit, ...rest } = validPatch() as Record<string, unknown> & { patchId: string };
    expect(validatePatch(rest)).toBe(false);
  });

  it("REJECTS a Patch with a malformed patchId (not ^pt_[0-9a-f-]{36}$)", () => {
    expect(validatePatch(validPatch({ patchId: "not-a-uuid" }))).toBe(false);
  });

  it("REJECTS a Patch with an empty operations array (minItems:1 trust-spine)", () => {
    expect(validatePatch(validPatch({ operations: [] }))).toBe(false);
  });

  it("REJECTS an unknown op discriminant", () => {
    expect(
      validatePatch(validPatch({ operations: [{ op: "nuke_everything", note: validNote() }] })),
    ).toBe(false);
  });

  it("REJECTS a Note with velocity 0 (minimum:1 — velocity 0 = no note)", () => {
    expect(
      validatePatch(validPatch({ operations: [{ op: "add_note", note: validNote({ velocity: 0 }) }] })),
    ).toBe(false);
  });

  it("REJECTS a Note with velocity 128 (maximum:127)", () => {
    expect(
      validatePatch(validPatch({ operations: [{ op: "add_note", note: validNote({ velocity: 128 }) }] })),
    ).toBe(false);
  });

  it("REJECTS a Note with pitch 128 (maximum:127)", () => {
    expect(
      validatePatch(validPatch({ operations: [{ op: "add_note", note: validNote({ pitch: 128 }) }] })),
    ).toBe(false);
  });

  it("REJECTS a Note with pitch -1 (minimum:0)", () => {
    expect(
      validatePatch(validPatch({ operations: [{ op: "add_note", note: validNote({ pitch: -1 }) }] })),
    ).toBe(false);
  });

  it("REJECTS a Note missing a required field (length)", () => {
    const { length: _omit, ...noteRest } = validNote() as Record<string, unknown> & { length: number };
    expect(
      validatePatch(validPatch({ operations: [{ op: "add_note", note: noteRest }] })),
    ).toBe(false);
  });

  it("REJECTS a Note with a malformed key (not ^n:[0-9]+:[0-9.]+$)", () => {
    expect(
      validatePatch(validPatch({ operations: [{ op: "add_note", note: validNote({ key: "xyz" }) }] })),
    ).toBe(false);
  });

  it("REJECTS additionalProperties at the Patch root (trust-spine closed shape)", () => {
    expect(validatePatch({ ...validPatch(), evilExtraField: true })).toBe(false);
  });

  it("REJECTS additionalProperties inside Note (closed shape)", () => {
    expect(
      validatePatch(
        validPatch({ operations: [{ op: "add_note", note: { ...validNote(), extra: 1 } }] }),
      ),
    ).toBe(false);
  });

  it("REJECTS an unknown reversibility value", () => {
    expect(validatePatch(validPatch({ reversibility: "magic" }))).toBe(false);
  });

  it("REJECTS an unknown risk value", () => {
    expect(validatePatch(validPatch({ risk: "extreme" }))).toBe(false);
  });

  it("REJECTS an empty rationale (minLength:1)", () => {
    expect(validatePatch(validPatch({ rationale: "" }))).toBe(false);
  });

  it("REJECTS a scope with a malformed clipSid (not ^clip_[0-9a-f]{16}$)", () => {
    expect(validatePatch(validPatch({ scope: { clipSid: "clip_short" } }))).toBe(false);
  });

  // --- Pitfall 2 layering (documented, not schema-enforced) ---

  it("VALIDATES a matched-key update_note_field (before.key === after.key, identity-stable)", () => {
    // The identity-stable case: same pitch+start → same key; only velocity/length mutate.
    const patch = validPatch({
      operations: [
        {
          op: "update_note_field",
          before: validNote({ key: "n:60:0.0000", pitch: 60, start: 0, velocity: 100 }),
          after: validNote({ key: "n:60:0.0000", pitch: 60, start: 0, velocity: 110 }),
        },
      ],
    });
    expect(validatePatch(patch), JSON.stringify(validatePatch.errors)).toBe(true);
  });

  it("documents the Pitfall 2 layering: schema alone ACCEPTS a mismatched-key update (pure 2020-12 cannot express cross-property equality; runtime + arb.ts enforce it)", () => {
    // A pitch change modeled as update_note_field (before.key !== after.key) is
    // structurally a valid Pair-of-Notes at the JSON Schema level. Pure 2020-12
    // has no cross-property-equality keyword (the $data extension is non-standard
    // and the Java bridge's Jackson would not honor it). The before.key===
    // after.key invariant is therefore enforced at:
    //   (1) the TS gen type (the PrimitiveOp union conveys Note identity),
    //   (2) arb.ts arbPrimitiveOp (constrains the generator to matched keys), and
    //   (3) resolveOps/previewPatch + the INV-1 round-trip property (a mismatched
    //       key would break set-semantics and fail the fast-check spine).
    // This test ASSERTS the schema gap deliberately so the layering is explicit;
    // the runtime guard is pinned in inverse-ops.test.ts (INV-1/INV-2).
    const mismatchedPatch = validPatch({
      operations: [
        {
          op: "update_note_field",
          before: validNote({ key: "n:60:0.0000", pitch: 60 }),
          after: validNote({ key: "n:64:0.0000", pitch: 64 }), // pitch changed → key changed
        },
      ],
    });
    expect(validatePatch(mismatchedPatch)).toBe(true); // schema accepts — runtime layer guards
  });
});

// ============================================================================
// Phase 5 Plan 05-05 Task 1 — AutomationScope + automation op kinds + D-05-14
// bounds + the TS-level scope↔op pairing rule (03-01 precedent: cross-property
// rules are TS/runtime, NOT JSON Schema).
// ============================================================================

/** The canonical valid AutomationScope (dev_ + 16 hex, per the 05-03 fingerprint). */
function automationScope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deviceSid: "dev_0123456789abcdef",
    paramIndex: 5,
    paramSource: "device_parameter",
    region: { startBar: 0, lengthBars: 8 },
    ...overrides,
  };
}

/** N distinct automation points (beat i, value cycling within [0,1]). */
function automationPoints(n: number): { beat: number; value: number }[] {
  return Array.from({ length: n }, (_, i) => ({ beat: i, value: (i % 8) / 8 }));
}

/** A canonical valid automation Patch (single automation_points op). */
function validAutomationPatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patchId: "pt_00000000-0000-4000-8000-000000000000",
    undoLabel: "open the filter over 8 bars",
    scope: automationScope(),
    operations: [{ op: "automation_points", points: automationPoints(4) }],
    rationale: "bounded filter sweep on the selected device macro",
    reversibility: "manual-inverse",
    risk: "medium",
    ...overrides,
  };
}

describe("patch.schema.json automation extension (05-05 Task 1 — D-05-14 bounds)", () => {
  it("VALIDATES an automation patch: AutomationScope + 64-point automation_points op (Test 1)", () => {
    const patch = validAutomationPatch({
      operations: [{ op: "automation_points", points: automationPoints(64) }],
    });
    expect(validatePatch(patch), JSON.stringify(validatePatch.errors)).toBe(true);
    expect(() => validatePatchOrThrow(patch)).not.toThrow();
  });

  it("REJECTS 65 points (maxItems 64 — D-05-14, Test 2)", () => {
    const patch = validAutomationPatch({
      operations: [{ op: "automation_points", points: automationPoints(65) }],
    });
    expect(validatePatch(patch)).toBe(false);
  });

  it("REJECTS an empty points array (minItems 1)", () => {
    const patch = validAutomationPatch({
      operations: [{ op: "automation_points", points: [] }],
    });
    expect(validatePatch(patch)).toBe(false);
  });

  it("REJECTS region lengthBars 17; lengthBars 16 VALIDATES (D-05-14, Test 3)", () => {
    const tooLong = validAutomationPatch({
      scope: automationScope({ region: { startBar: 0, lengthBars: 17 } }),
    });
    expect(validatePatch(tooLong)).toBe(false);
    const max = validAutomationPatch({
      scope: automationScope({ region: { startBar: 4, lengthBars: 16 } }),
    });
    expect(validatePatch(max), JSON.stringify(validatePatch.errors)).toBe(true);
  });

  it("REJECTS out-of-[0,1] values in points AND in set_parameter_value (Pitfall 6, Test 4)", () => {
    expect(
      validatePatch(
        validAutomationPatch({
          operations: [{ op: "automation_points", points: [{ beat: 0, value: 1.5 }] }],
        }),
      ),
    ).toBe(false);
    expect(
      validatePatch(
        validAutomationPatch({
          operations: [{ op: "automation_points", points: [{ beat: 0, value: -0.1 }] }],
        }),
      ),
    ).toBe(false);
    expect(
      validatePatch(
        validAutomationPatch({ operations: [{ op: "set_parameter_value", value: 1.5 }] }),
      ),
    ).toBe(false);
    expect(
      validatePatch(
        validAutomationPatch({ operations: [{ op: "set_parameter_value", value: -0.1 }] }),
      ),
    ).toBe(false);
  });

  it("VALIDATES set_parameter_value and remove_automation_points kinds at bounds", () => {
    expect(
      validatePatch(validAutomationPatch({ operations: [{ op: "set_parameter_value", value: 0 }] })),
      JSON.stringify(validatePatch.errors),
    ).toBe(true);
    expect(
      validatePatch(validAutomationPatch({ operations: [{ op: "set_parameter_value", value: 1 }] })),
    ).toBe(true);
    expect(
      validatePatch(
        validAutomationPatch({
          operations: [{ op: "remove_automation_points", points: automationPoints(64) }],
        }),
      ),
    ).toBe(true);
  });

  it("REJECTS a malformed deviceSid (not ^dev_[0-9a-f]{16}$)", () => {
    expect(validatePatch(validAutomationPatch({ scope: automationScope({ deviceSid: "dev_short" }) }))).toBe(false);
    expect(
      validatePatch(validAutomationPatch({ scope: automationScope({ deviceSid: "trk_0123456789abcdef" }) })),
    ).toBe(false);
  });

  it("REJECTS paramIndex 128 / -1 (0..127) and an unknown paramSource", () => {
    expect(validatePatch(validAutomationPatch({ scope: automationScope({ paramIndex: 128 }) }))).toBe(false);
    expect(validatePatch(validAutomationPatch({ scope: automationScope({ paramIndex: -1 }) }))).toBe(false);
    expect(
      validatePatch(validAutomationPatch({ scope: automationScope({ paramSource: "macro_knob" }) })),
    ).toBe(false);
  });

  it("REJECTS a negative startBar and additionalProperties in the automation scope", () => {
    expect(
      validatePatch(validAutomationPatch({ scope: automationScope({ region: { startBar: -1, lengthBars: 4 } }) })),
    ).toBe(false);
    expect(
      validatePatch(validAutomationPatch({ scope: automationScope({ clipSid: "clip_0123456789abcdef" }) })),
    ).toBe(false);
  });

  it("REJECTS automation target fields on ops — a second parameter target is structurally unrepresentable (Test 7)", () => {
    // The scope carries the ONLY target (deviceSid+paramIndex); ops carry
    // values/points only. Structurally: no op kind has target fields.
    const ops = [
      { op: "automation_points", points: automationPoints(2) },
      { op: "remove_automation_points", points: automationPoints(2) },
      { op: "set_parameter_value", value: 0.5 },
    ];
    for (const op of ops) {
      expect("deviceSid" in op).toBe(false);
      expect("paramIndex" in op).toBe(false);
      expect("paramSource" in op).toBe(false);
    }
    // ...and an op that smuggles a target field is schema-rejected (closed shapes).
    expect(
      validatePatch(
        validAutomationPatch({
          operations: [
            { op: "set_parameter_value", value: 0.5, paramIndex: 6 } as unknown as Record<string, unknown>,
          ],
        }),
      ),
    ).toBe(false);
  });

  it("existing clip fixtures still VALIDATE byte-identically (no clip-contract regression, Test 8)", () => {
    // The canonical clip fixture + the region-scoped fixture from the Phase 3
    // suite re-validate unchanged — the ClipScope shape is field-for-field
    // identical after the Scope -> oneOf restructure.
    expect(validatePatch(validPatch()), JSON.stringify(validatePatch.errors)).toBe(true);
    expect(
      validatePatch(validPatch({ scope: { clipSid: "clip_0123456789abcdef", region: { start: 0, end: 4 } } })),
    ).toBe(true);
  });
});

describe("validatePatchOrThrow scope↔op pairing (05-05 Task 1 — TS-level rule, 03-01 precedent)", () => {
  it("REJECTS a note op under an AutomationScope (Test 5)", () => {
    const patch = validAutomationPatch({
      operations: [{ op: "add_note", note: validNote() }],
    });
    expect(() => validatePatchOrThrow(patch)).toThrow(/pairing/);
  });

  it("REJECTS an automation op under a ClipScope (Test 6)", () => {
    const patch = validPatch({
      operations: [{ op: "automation_points", points: automationPoints(2) }],
    });
    expect(() => validatePatchOrThrow(patch)).toThrow(/pairing/);
  });

  it("REJECTS a mixed note+automation op sequence under either scope", () => {
    const mixedOps = [
      { op: "automation_points", points: automationPoints(2) },
      { op: "add_note", note: validNote() },
    ];
    expect(() => validatePatchOrThrow(validAutomationPatch({ operations: mixedOps }))).toThrow(/pairing/);
    expect(() => validatePatchOrThrow(validPatch({ operations: mixedOps }))).toThrow(/pairing/);
  });
});

describe("validatePatchOrThrow", () => {
  it("returns the typed Patch on valid input", () => {
    const patch = validatePatchOrThrow(validPatch());
    expect(patch.patchId).toBe("pt_00000000-0000-4000-8000-000000000000");
    expect(patch.operations).toHaveLength(1);
  });

  it("throws a structured Error carrying Ajv context on invalid input", () => {
    expect(() => validatePatchOrThrow(validPatch({ operations: [] }))).toThrow(/patch invalid:/);
  });
});
