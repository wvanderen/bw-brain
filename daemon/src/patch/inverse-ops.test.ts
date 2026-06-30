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
    fc.assert(
      fc.property(arbNoteSet, arbOpSeq, (base, { ops }) => {
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
    // 1/64 = 0.015625. A start of 0.014 snaps to 0; 0.02 snaps to 0.015625.
    expect(noteKey(60, 0.014)).toBe("n:60:0.0000");
    expect(noteKey(60, 0.02)).toBe("n:60:0.0156");
  });

  it("two notes with the same pitch + quantized start share a key (set identity)", () => {
    expect(noteKey(64, 2)).toBe(noteKey(64, 2.001)); // both quantize to 2.0000
  });

  it("a pitch change mints a DIFFERENT key (pitch change = new identity, Pitfall 2)", () => {
    expect(noteKey(60, 0)).not.toBe(noteKey(61, 0));
  });
});
