// daemon/src/patch/patch-resolve.test.ts
//
// Phase 3 (Plan 03-01) — preview purity + D-06 equivalence property tests.
//
// INV-4 preview purity:  previewPatch(before, ops) does NOT mutate `before`;
//   N consecutive calls return deep-equal output (no side effects).
// INV-5 preview = computeStateDiff(after):  previewPatch(before, ops) deep-equals
//   computeStateDiff({notes:before}, {notes:resolveOps(before, ops)}) (D-06 —
//   mechanically true by construction; guards against regressions that fork the
//   preview diff from the canonical diff-logic shape).
//
// Also covers the empty-clip edge (resolveOps([], [add_note])).
//
// Source: RESEARCH.md §Validation Architecture INV-4/INV-5 (lines 1233-1234) +
// §Code Examples "preview = computeStateDiff" (lines 567-609). Pure module.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveOps, previewPatch } from "./patch-resolve.js";
import { computeStateDiff, type Note, type RawState } from "../cli/diff-logic.js";
import { noteKey } from "./inverse-ops.js";
import { arbNoteSet, arbOpSeq } from "./arb.js";

describe("patch-resolve — property (INV-5 preview === computeStateDiff(after))", () => {
  it("previewPatch(before, ops) deep-equals computeStateDiff({notes:before}, {notes:resolveOps(before, ops)})", () => {
    fc.assert(
      fc.property(arbNoteSet, arbOpSeq, (before, { ops }) => {
        const preview = previewPatch(before, ops);
        const expected = computeStateDiff(
          { notes: before } as RawState,
          { notes: resolveOps(before, ops) } as RawState,
        );
        // Order-independent comparison on the note buckets (sets, not sequences).
        const canon = (d: typeof preview) => ({
          ...d,
          notesAdded: [...d.notesAdded].sort((a, b) => (a.key < b.key ? -1 : 1)),
          notesRemoved: [...d.notesRemoved].sort((a, b) => (a.key < b.key ? -1 : 1)),
          notesChanged: [...d.notesChanged].sort((a, b) => (a.after.key < b.after.key ? -1 : 1)),
        });
        expect(canon(preview)).toStrictEqual(canon(expected));
      }),
      { numRuns: 100 },
    );
  });
});

describe("patch-resolve — property (INV-4 preview purity / no mutation)", () => {
  it("previewPatch does NOT mutate `before` (deep-equal snapshot before + after)", () => {
    fc.assert(
      fc.property(arbNoteSet, arbOpSeq, (before, { ops }) => {
        const snapshot = JSON.stringify(before);
        previewPatch(before, ops);
        expect(JSON.stringify(before)).toBe(snapshot);
      }),
      { numRuns: 100 },
    );
  });

  it("5 consecutive previewPatch calls return deep-equal output (idempotent)", () => {
    fc.assert(
      fc.property(arbNoteSet, arbOpSeq, (before, { ops }) => {
        const outs = Array.from({ length: 5 }, () => JSON.stringify(previewPatch(before, ops)));
        expect(new Set(outs).size).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it("resolveOps does NOT mutate `before`", () => {
    fc.assert(
      fc.property(arbNoteSet, arbOpSeq, (before, { ops }) => {
        const snapshot = JSON.stringify(before);
        resolveOps(before, ops);
        expect(JSON.stringify(before)).toBe(snapshot);
      }),
      { numRuns: 100 },
    );
  });
});

describe("patch-resolve — edge cases", () => {
  it("resolveOps([], [add_note]) works (empty-clip edge)", () => {
    const note: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const out = resolveOps([], [{ op: "add_note", note }]);
    expect(out).toStrictEqual([note]);
  });

  it("previewPatch([], [add_note]) reports one noteAdded + zero removed/changed", () => {
    const note: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const diff = previewPatch([], [{ op: "add_note", note }]);
    expect(diff.notesAdded).toHaveLength(1);
    expect(diff.notesRemoved).toHaveLength(0);
    expect(diff.notesChanged).toHaveLength(0);
  });

  it("resolveOps of an empty op sequence returns a set-equal copy (not the same ref)", () => {
    const base: Note[] = [
      { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 },
    ];
    const out = resolveOps(base, []);
    expect(out).not.toBe(base); // new array (no aliasing)
    expect(JSON.stringify(out)).toBe(JSON.stringify(base));
  });

  it("update_note_field replaces note content in-place by key (identity-stable)", () => {
    const before: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 100 };
    const after: Note = { key: noteKey(60, 0), pitch: 60, start: 0, length: 0.5, velocity: 127 };
    const out = resolveOps([before], [{ op: "update_note_field", before, after }]);
    expect(out).toStrictEqual([after]);
  });
});
