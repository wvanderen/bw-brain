// daemon/src/patch/inverse-ops.test.ts
//
// Phase 3 (Plan 03-01) — the REVERSIBILITY SPINE property tests.
//
// INV-1 round-trip reversibility:  resolveOps(resolveOps(base, ops), inverseOps(ops))
//   set-equals `base` (by Note.key, order-independent) for arbitrary op sequences.
// INV-2 self-inverse primitives:  inverseOp(inverseOp(op)) deep-equals op for each
//   primitive; inverseOps(inverseOps(ops)) deep-equals ops.
// INV-3 double-revert identity (pure half): inverseOps(inverseOps(ops)) deep-equals ops
//   (the end-to-end double-revert through history is Plan 02's INV-14 integration).
//
// These run at numRuns: 500 (RESEARCH.md:1259 — the reversibility spine holds for
// arbitrary op sequences, not just hand-picked cases; fast-check shrinks failures
// to a minimal counterexample). Curated edge cases cover empty seq, single op,
// and the identity-stable no-op update.
//
// Source: RESEARCH.md §Validation Architecture INV-1..INV-3 (lines 1230-1232) +
// §Code Examples "Self-inverting primitive ops" (lines 537-562). Pure modules.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  inverseOp,
  inverseOps,
  noteKey,
  type PrimitiveOp,
} from "./inverse-ops.js";
import { resolveOps } from "./patch-resolve.js";
import type { Note } from "../cli/diff-logic.js";
import { arbNoteSet, arbOpSeq, arbPrimitiveOp } from "./arb.js";

/** Canonicalize a notes array by key for order-independent deep comparison. */
function sortByKey(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Order-independent set-equality of two note sets (by Note.key + content). */
function notesEqualSet(a: Note[], b: Note[]): boolean {
  return JSON.stringify(sortByKey(a)) === JSON.stringify(sortByKey(b));
}

describe("inverse-ops — property (INV-2 self-inverse primitives)", () => {
  it("inverseOp(inverseOp(op)) deep-equals op for every primitive (numRuns: 500)", () => {
    fc.assert(
      fc.property(arbPrimitiveOp, (op) => {
        expect(inverseOp(inverseOp(op))).toStrictEqual(op);
      }),
      { numRuns: 500 },
    );
  });

  it("inverseOp swaps add_note <-> remove_note", () => {
    const note: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const addOp: PrimitiveOp = { op: "add_note", note };
    const removeOp: PrimitiveOp = { op: "remove_note", note };
    expect(inverseOp(addOp)).toStrictEqual(removeOp);
    expect(inverseOp(removeOp)).toStrictEqual(addOp);
  });

  it("inverseOp swaps update_note_field before/after", () => {
    const before: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const after: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 110 };
    const op: PrimitiveOp = { op: "update_note_field", before, after };
    expect(inverseOp(op)).toStrictEqual({ op: "update_note_field", before: after, after: before });
  });
});

describe("inverse-ops — property (INV-3 double-revert identity, pure half)", () => {
  it("inverseOps(inverseOps(ops)) deep-equals ops (numRuns: 500)", () => {
    fc.assert(
      fc.property(arbOpSeq, ({ ops }) => {
        expect(inverseOps(inverseOps(ops))).toStrictEqual(ops);
      }),
      { numRuns: 500 },
    );
  });

  it("inverseOps reverses the op order then inverts each op", () => {
    const n1: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const n2: Note = { key: noteKey(64, 1), pitch: 64, start: 1, length: 0.25, velocity: 90 };
    const ops: PrimitiveOp[] = [
      { op: "add_note", note: n1 },
      { op: "remove_note", note: n2 },
    ];
    // inverse: reversed ([remove n2, add n1]) then each inverted ([add n2, remove n1])
    expect(inverseOps(ops)).toStrictEqual([
      { op: "add_note", note: n2 },
      { op: "remove_note", note: n1 },
    ]);
  });
});

describe("inverse-ops — property (INV-1 round-trip reversibility)", () => {
  it("resolveOps(resolveOps(base, ops), inverseOps(ops)) set-equals base (numRuns: 500)", () => {
    // ops are derived FROM base (via arbOpSeq's diffToOps), so the sequence is
    // internally consistent (no remove/update of a note absent from base). The
    // round-trip only holds for VALID sequences — two independent note sets
    // would test a nonsensical property (ops from one base applied to another).
    fc.assert(
      fc.property(arbOpSeq, ({ base, ops }) => {
        const after = resolveOps(base, ops);
        const reverted = resolveOps(after, inverseOps(ops));
        expect(notesEqualSet(reverted, base)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("round-trip with an EMPTY op sequence yields the base unchanged", () => {
    const base: Note[] = [
      { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 },
    ];
    const ops: PrimitiveOp[] = [];
    const reverted = resolveOps(resolveOps(base, ops), inverseOps(ops));
    expect(reverted).toStrictEqual(base);
  });

  it("round-trip with a SINGLE add_note removes it again", () => {
    const base: Note[] = [];
    const note: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const ops: PrimitiveOp[] = [{ op: "add_note", note }];
    const reverted = resolveOps(resolveOps(base, ops), inverseOps(ops));
    expect(reverted).toStrictEqual([]);
  });

  it("round-trip of a no-op update (before === after) leaves base unchanged", () => {
    const note: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const base: Note[] = [note];
    const ops: PrimitiveOp[] = [{ op: "update_note_field", before: note, after: { ...note } }];
    const reverted = resolveOps(resolveOps(base, ops), inverseOps(ops));
    expect(notesEqualSet(reverted, base)).toBe(true);
  });
});

describe("noteKey (identity scheme — D-01/D-03)", () => {
  it("mints n:${pitch}:${startQuantized} with 1/64-beat quantization", () => {
    expect(noteKey(60, 0)).toBe("n:60:0.0000");
    expect(noteKey(60, 1)).toBe("n:60:1.0000");
  });

  it("quantizes off-grid starts to the nearest 1/64 beat", () => {
    // 1/64 = 0.015625. 0.007/0.015625 = 0.448 → rounds to 0; 0.014/0.015625 =
    // 0.896 → rounds to 1 (= 0.015625); 0.02/0.015625 = 1.28 → rounds to 1.
    expect(noteKey(60, 0.007)).toBe("n:60:0.0000");
    expect(noteKey(60, 0.014)).toBe("n:60:0.0156");
    expect(noteKey(60, 0.02)).toBe("n:60:0.0156");
  });

  it("two notes with the same pitch + quantized start share a key (set identity)", () => {
    expect(noteKey(64, 2)).toBe(noteKey(64, 2.001)); // both quantize to 2.0000
  });

  it("a pitch change mints a DIFFERENT key (pitch change = new identity, Pitfall 2)", () => {
    expect(noteKey(60, 0)).not.toBe(noteKey(61, 0));
  });
});

// ============================================================================
// Phase 5 Plan 05-05 Task 2 — the AUTHOR-AWARE automation inverse (D-05-07).
//
// Unlike note ops (per-op self-inverting), a parameter write's inverse needs
// the apply-time PRIOR value — revert restores the prior parameter value and
// removes exactly the authored points. NO envelope read, NO re-derivation
// from live state: the inverse references ONLY the authored points frozen in
// the patch itself + the priorValue captured at apply time.
// ============================================================================

import { buildAutomationInverse, type AutomationOp, type AutomationPoint } from "./inverse-ops.js";

/** Deterministic automation-op reducer (test-only simulation of the write surface). */
function applyAutomationOps(
  state: { points: AutomationPoint[]; value: number },
  ops: AutomationOp[],
): { points: AutomationPoint[]; value: number } {
  let s = { value: state.value, points: [...state.points] };
  for (const op of ops) {
    if (op.op === "set_parameter_value") s = { ...s, value: op.value };
    else if (op.op === "automation_points") s = { ...s, points: [...s.points, ...op.points] };
    else s = { ...s, points: s.points.filter((p) => !op.points.some((q) => q.beat === p.beat)) };
  }
  return s;
}

describe("buildAutomationInverse (05-05 Task 2 — D-05-07 author-aware inverse)", () => {
  const P: AutomationPoint[] = [
    { beat: 0, value: 0 },
    { beat: 4, value: 0.5 },
    { beat: 12, value: 1 },
  ];

  it("returns [remove exactly P, set priorValue] for [automation_points P, set 0.8] with prior 0.25 (Test 1)", () => {
    const ops: AutomationOp[] = [
      { op: "automation_points", points: P },
      { op: "set_parameter_value", value: 0.8 },
    ];
    expect(buildAutomationInverse(ops, 0.25)).toStrictEqual([
      { op: "remove_automation_points", points: P },
      { op: "set_parameter_value", value: 0.25 },
    ]);
  });

  it("round-trip: applying the original ops then the inverse leaves the authored-point set EMPTY and the value at PRIOR (Test 1)", () => {
    const ops: AutomationOp[] = [
      { op: "automation_points", points: P },
      { op: "set_parameter_value", value: 0.8 },
    ];
    const prior = 0.25;
    const afterApply = applyAutomationOps({ points: [], value: prior }, ops);
    expect(afterApply.points).toHaveLength(3);
    expect(afterApply.value).toBe(0.8);
    const afterRevert = applyAutomationOps(afterApply, buildAutomationInverse(ops, prior) as AutomationOp[]);
    expect(afterRevert.points).toStrictEqual([]);
    expect(afterRevert.value).toBe(prior);
  });

  it("the inverse references ONLY the authored points — no envelope read, no re-derivation (Test 2, structural)", () => {
    const ops: AutomationOp[] = [
      { op: "automation_points", points: P },
      { op: "set_parameter_value", value: 0.8 },
    ];
    const inverse = buildAutomationInverse(ops, 0.25);
    const removeOp = inverse.find((o) => o.op === "remove_automation_points") as {
      op: "remove_automation_points";
      points: AutomationPoint[];
    };
    // Exactly the input points — same members, same order, nothing derived.
    expect(removeOp.points).toStrictEqual(P);
    // No other point-carrying ops sneak in.
    expect(inverse.filter((o) => o.op === "automation_points")).toStrictEqual([]);
  });

  it("re-adds points the patch REMOVED (the removed points are in the op itself) and restores prior LAST", () => {
    const ops: AutomationOp[] = [
      { op: "remove_automation_points", points: P },
    ];
    const inverse = buildAutomationInverse(ops, 0.4);
    expect(inverse).toStrictEqual([
      { op: "automation_points", points: P },
      { op: "set_parameter_value", value: 0.4 },
    ]);
    // The prior-value restore is always the FINAL op (replay ends at prior).
    const ops2: AutomationOp[] = [
      { op: "automation_points", points: P },
      { op: "remove_automation_points", points: [{ beat: 4, value: 0.5 }] },
    ];
    const inverse2 = buildAutomationInverse(ops2, 0.1);
    expect(inverse2[inverse2.length - 1]).toStrictEqual({ op: "set_parameter_value", value: 0.1 });
  });

  it("inverseOps sequencing for NOTE ops is untouched — reverse-then-invert still holds (Test 3)", () => {
    // Existing INV-3 property covers this; this pins the coexistence explicitly:
    // widening PrimitiveOp with the automation kinds must not alter note-op inverses.
    const n1: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const n2: Note = { key: noteKey(64, 1), pitch: 64, start: 1, length: 0.25, velocity: 90 };
    const ops: PrimitiveOp[] = [
      { op: "add_note", note: n1 },
      { op: "remove_note", note: n2 },
    ];
    expect(inverseOps(ops)).toStrictEqual([
      { op: "add_note", note: n2 },
      { op: "remove_note", note: n1 },
    ]);
  });

  it("per-op inverseOp is UNDEFINED for automation kinds — honest throw, never a guessed prior (D-05-07)", () => {
    expect(() => inverseOp({ op: "set_parameter_value", value: 0.5 })).toThrow(/buildAutomationInverse/);
    expect(() => inverseOp({ op: "automation_points", points: P })).toThrow(/buildAutomationInverse/);
    expect(() => inverseOp({ op: "remove_automation_points", points: P })).toThrow(/buildAutomationInverse/);
  });

  it("module purity: inverse-ops.ts imports NOTHING beyond types (no fs/net/timer)", async () => {
    const source = await import("node:fs").then((fs) => fs.promises.readFile(new URL("./inverse-ops.ts", import.meta.url), "utf8"));
    const imports = source.match(/^import .*$/gm) ?? [];
    for (const line of imports) {
      expect(line).toMatch(/^import type /);
    }
  });
});
