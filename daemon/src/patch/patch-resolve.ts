// daemon/src/patch/patch-resolve.ts
//
// Phase 3 (EDIT-02 / D-06) — resolve patch ops against clip state + preview as a
// StateDiff. PURE module: the only import is computeStateDiff from diff-logic.ts
// (D-06 reuse contract — do NOT fork a patch-vs-state diff; resolve ops → after
// state, then diff). Mirrors daemon/src/cli/diff-logic.ts discipline.
//
// D-06: preview output is the SAME StateDiff shape bw-diff emits
// (notesAdded/notesRemoved/notesChanged + automationTouched + scopeTrackSids).
// UX-02 diff pane renders ONE shape. SC#1's round-trip property (proven by
// diff-logic.test.ts) covers preview too because preview IS computeStateDiff.
//
// Identity contract: Note.key is the set index (mirrors diff-logic.ts:96-100
// indexByKey). add→set, remove→delete, update→set op.after (key unchanged by
// the Pitfall 2 invariant). resolveOps is order-independent for non-overlapping
// keys; previewPatch does NOT mutate its input.
import { computeStateDiff, type Note, type RawState, type StateDiff } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "./inverse-ops.js";

/**
 * Resolve a sequence of primitive ops against a before-state, yielding the
 * after-state. Pure — does NOT mutate `before`.
 *
 * Builds a `Map<key,Note>` from `before` (mirrors diff-logic.ts indexByKey),
 * then applies each op: add_note → set, remove_note → delete, update_note_field
 * → set op.after (identity-stable: before.key === after.key). Returns the
 * surviving notes as a new array.
 *
 * @param before - the starting notes (the live cursor-clip state).
 * @param ops - the primitive ops to apply, in order.
 * @returns the after-state notes (a NEW array; `before` is untouched).
 *
 * @example
 * const after = resolveOps(before, [{ op: "add_note", note }]);
 */
export function resolveOps(before: Note[], ops: PrimitiveOp[]): Note[] {
  const byKey = new Map(before.map((n) => [n.key, n]));
  for (const op of ops) {
    switch (op.op) {
      case "add_note":
        byKey.set(op.note.key, op.note);
        break;
      case "remove_note":
        byKey.delete(op.note.key);
        break;
      case "update_note_field":
        // Pitfall 2 invariant: before.key === after.key (identity-stable). The
        // key indexes the same slot; only the mutable content (velocity/length)
        // is replaced. A pitch change would be remove+add, never this branch.
        byKey.set(op.after.key, op.after);
        break;
    }
  }
  return [...byKey.values()];
}

/**
 * Preview a patch: resolve ops against live clip state, then computeStateDiff.
 * Pure — returns the SAME StateDiff shape `bw-diff` emits (D-06 — UX-02 diff
 * pane renders ONE shape). Does NOT mutate `before`.
 *
 * Mechanically, `previewPatch(before, ops)` deep-equals
 * `computeStateDiff({notes:before}, {notes:resolveOps(before, ops)})` by
 * construction (INV-5) — the test guards against regressions that fork the
 * preview diff from the canonical diff-logic shape.
 *
 * @param before - the starting notes (the live cursor-clip state).
 * @param ops - the primitive ops to preview.
 * @returns the StateDiff the patch would produce if applied.
 *
 * @example
 * const diff = previewPatch(before, ops);
 * // diff.notesAdded / diff.notesRemoved / diff.notesChanged ...
 */
export function previewPatch(before: Note[], ops: PrimitiveOp[]): StateDiff {
  const after = resolveOps(before, ops);
  return computeStateDiff(
    { notes: before } as RawState,
    { notes: after } as RawState,
  );
}
