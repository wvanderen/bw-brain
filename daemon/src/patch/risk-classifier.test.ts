// daemon/src/patch/risk-classifier.test.ts
//
// Phase 3 (Plan 03-01) — scope containment + risk monotonicity tests.
//
// INV-9 scope containment:  when scope.region is declared, classifyRisk throws
//   ScopeMismatchError if any op references a note whose start is outside
//   [region.start, region.end). The thrown error carries the offending start.
//   (scope.touched ⊆ scope.declared for every accepted patch — the region
//   containment check is the active guard; the daemon-boundary clipSid check
//   lands in Plan 02.)
//
// INV-10 risk monotonicity:  multi-track ⇒ high; belowBar ⇒ high; risk =
//   max(declared, floor) where floor rises with op count (>5 → medium, >20 →
//   high). The daemon never downgrades (D-07).
//
// Source: RESEARCH.md §Validation Architecture INV-9/INV-10 (lines 1238-1239) +
// §Code Examples "risk classifier" (lines 286-322). Pure module.
import { describe, it, expect } from "vitest";
import { classifyRisk, ScopeMismatchError, type RiskInput } from "./risk-classifier.js";
import { noteKey, type PrimitiveOp } from "./inverse-ops.js";
import type { Note } from "../cli/diff-logic.js";

function noteAt(pitch: number, start: number, velocity = 100, length = 0.5): Note {
  return { key: noteKey(pitch, start), pitch, start, length, velocity };
}

/** Build a RiskInput with N add_note ops (each a distinct pitch so keys differ). */
function riskInput(ops: PrimitiveOp[], overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    declared: "low",
    operations: ops,
    scopeDeclared: { clipSid: "clip_0123456789abcdef" },
    belowBar: false,
    ...overrides,
  };
}

/** N add_note ops at distinct pitches (so each mints a unique key). */
function addOps(n: number): PrimitiveOp[] {
  return Array.from({ length: n }, (_, i) => ({
    op: "add_note" as const,
    note: noteAt(60 + (i % 12), i * 0.25),
  }));
}

describe("risk-classifier — INV-10 risk monotonicity (max(declared, floor))", () => {
  it("declared low + ≤5 ops → low (floor stays low)", () => {
    expect(classifyRisk(riskInput(addOps(5)))).toBe("low");
  });

  it("declared low + 0 ops → low", () => {
    // 0 ops is unusual (the schema enforces minItems:1) but the classifier must
    // not throw on an empty list — the floor is low.
    expect(classifyRisk(riskInput(addOps(0)))).toBe("low");
  });

  it("declared low + >5 ops → medium (floor rises to medium)", () => {
    expect(classifyRisk(riskInput(addOps(6)))).toBe("medium");
  });

  it("declared low + exactly 5 ops → low (boundary: >5 is medium, 5 is not)", () => {
    expect(classifyRisk(riskInput(addOps(5)))).toBe("low");
  });

  it("declared low + >20 ops → high (floor rises to high)", () => {
    expect(classifyRisk(riskInput(addOps(21)))).toBe("high");
  });

  it("declared low + exactly 20 ops → medium (boundary: >20 is high, 20 is not)", () => {
    expect(classifyRisk(riskInput(addOps(20)))).toBe("medium");
  });

  it("declared high stays high even with few ops (never downgrades)", () => {
    expect(classifyRisk(riskInput(addOps(1), { declared: "high" }))).toBe("high");
  });

  it("declared medium + 21 ops → high (floor dominates declared)", () => {
    expect(classifyRisk(riskInput(addOps(21), { declared: "medium" }))).toBe("high");
  });

  it("declared medium + 2 ops → medium (declared dominates floor)", () => {
    expect(classifyRisk(riskInput(addOps(2), { declared: "medium" }))).toBe("medium");
  });

  it("declared low + belowBar → high (D-09 override forces high)", () => {
    expect(classifyRisk(riskInput(addOps(1), { belowBar: true }))).toBe("high");
  });

  it("declared low + multiTrack → high (D-02: daemon rejects >1 trackSid; classifier forces high if it slips through)", () => {
    expect(classifyRisk(riskInput(addOps(1), { multiTrack: true }))).toBe("high");
  });

  it("belowBar + multiTrack + 0 ops → high (both high-force signals)", () => {
    expect(classifyRisk(riskInput(addOps(0), { belowBar: true, multiTrack: true }))).toBe("high");
  });
});

describe("risk-classifier — INV-9 scope containment (region)", () => {
  it("PASSES when all op note starts are within the declared region [start, end)", () => {
    const ops: PrimitiveOp[] = [
      { op: "add_note", note: noteAt(60, 0) },
      { op: "add_note", note: noteAt(61, 1) },
      { op: "add_note", note: noteAt(62, 3.5) },
    ];
    const result = classifyRisk(
      riskInput(ops, { scopeDeclared: { clipSid: "clip_0123456789abcdef", region: { start: 0, end: 4 } } }),
    );
    expect(result).toBe("low");
  });

  it("THROWS ScopeMismatchError when an add_note start is outside [start, end)", () => {
    const ops: PrimitiveOp[] = [
      { op: "add_note", note: noteAt(60, 0) },
      { op: "add_note", note: noteAt(61, 4.5) }, // outside [0, 4)
    ];
    try {
      classifyRisk(riskInput(ops, { scopeDeclared: { clipSid: "clip_0123456789abcdef", region: { start: 0, end: 4 } } }));
      throw new Error("expected ScopeMismatchError");
    } catch (e) {
      expect(e).toBeInstanceOf(ScopeMismatchError);
      // the error carries the offending note start (4.5) for caller-side reporting
      expect(String((e as Error).message)).toContain("4.5");
    }
  });

  it("THROWS ScopeMismatchError when a remove_note start is below region.start", () => {
    const ops: PrimitiveOp[] = [{ op: "remove_note", note: noteAt(60, -1) }];
    // Note: noteAt quantizes; -1 is the raw start. noteKey(-1...) — pitch 60 start -1.
    // region [0,4); start -1 < 0 → outside.
    expect(() =>
      classifyRisk(riskInput(ops, { scopeDeclared: { clipSid: "clip_0123456789abcdef", region: { start: 0, end: 4 } } })),
    ).toThrow(ScopeMismatchError);
  });

  it("THROWS ScopeMismatchError when an update_note_field note start is outside the region", () => {
    const before = noteAt(60, 5); // outside region [0,4)
    const after = { ...before, velocity: 110 };
    const ops: PrimitiveOp[] = [{ op: "update_note_field", before, after }];
    expect(() =>
      classifyRisk(riskInput(ops, { scopeDeclared: { clipSid: "clip_0123456789abcdef", region: { start: 0, end: 4 } } })),
    ).toThrow(ScopeMismatchError);
  });

  it("does NOT enforce a region when scopeDeclared.region is absent (whole-clip default)", () => {
    // No region → no containment check; a note at start 100 is allowed.
    const ops: PrimitiveOp[] = [{ op: "add_note", note: noteAt(60, 100) }];
    expect(() => classifyRisk(riskInput(ops))).not.toThrow();
  });

  it("the boundary start === region.end is OUTSIDE [start, end) (half-open)", () => {
    const ops: PrimitiveOp[] = [{ op: "add_note", note: noteAt(60, 4) }]; // 4 is NOT in [0,4)
    expect(() =>
      classifyRisk(riskInput(ops, { scopeDeclared: { clipSid: "clip_0123456789abcdef", region: { start: 0, end: 4 } } })),
    ).toThrow(ScopeMismatchError);
  });
});

describe("ScopeMismatchError", () => {
  it("is an Error subclass carrying the offending note start in the message", () => {
    const err = new ScopeMismatchError("op touches note at 7.5 outside declared region");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("7.5");
    expect(err.name).toBe("ScopeMismatchError");
  });
});
