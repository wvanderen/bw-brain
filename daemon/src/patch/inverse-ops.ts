// daemon/src/patch/inverse-ops.ts
//
// Phase 3 (EDIT-05 / D-03) — self-inverting primitive ops + the note identity
// scheme. PURE module: ZERO imports beyond types (mirrors daemon/src/cli/
// diff-logic.ts discipline — documented interface + @example, NO I/O, NO side
// effects). The reversibility spine (INV-1/2/3) is provable by fast-check
// PRECISELY because this module is pure.
//
// D-03: each primitive op is self-inverting at creation time. add_note inverse
// = remove_note (and vice versa); update_note_field inverse = swap before/after.
// patch-history.jsonl records applied patches in order; revert replays inverse
// ops in reverse order. No snapshot storage, no computed-at-revert ambiguity.
//
// NOTE IDENTITY (D-01/D-03 agent discretion — PINNED): the key scheme is
// `n:${pitch}:${startQuantized}` with 1/64-beat quantization. pitch + start ARE
// the identity; velocity/length/pressure are MUTABLE CONTENT (their change is an
// update_note_field, not a new identity). A pitch change is ALWAYS remove_note +
// add_note, NEVER update_note_field on pitch (Pitfall 2 — a different pitch IS a
// different identity). The key matches diff-logic.ts Note.key so bw-edit preview
// and bw-diff share identity (D-06 reuse contract).
import type { Note } from "../cli/diff-logic.js";

// Re-export Note so consumers of the patch pipeline import ONE canonical shape.
export type { Note };

/**
 * One authored automation point (Phase 5 05-05): a beat position within the
 * scope region + a normalized [0,1] value (Pitfall 6 contract side).
 */
export interface AutomationPoint {
  beat: number;
  value: number;
}

/**
 * The automation operation kinds (Phase 5 05-05). These carry NO target
 * fields — the AutomationScope holds the single parameter target; ops carry
 * values/points only (D-05-14: a second parameter target is structurally
 * unrepresentable).
 *
 * NOT per-op self-inverting: `set_parameter_value`'s inverse needs the
 * apply-time PRIOR value, so the automation inverse is sequence-level +
 * author-aware ({@link buildAutomationInverse}, D-05-07).
 */
export type AutomationOp =
  | { op: "set_parameter_value"; value: number }
  | { op: "automation_points"; points: AutomationPoint[] }
  | { op: "remove_automation_points"; points: AutomationPoint[] };

/**
 * The canonical primitive operation union (D-01 hybrid catalog — primitives are
 * canonical; semantic transform names ride in Patch.transformIntent as metadata
 * the bridge NEVER branches on). The bridge dispatches ONLY on the primitive op
 * discriminant (Pitfall 7 / Pitfall 10 — the retired "3-case forever" count is
 * deliberate: Phase 5 added the automation kinds).
 *
 * Identity invariant (Pitfall 2): for `update_note_field`, `before.key ===
 * after.key` (only velocity/length mutate; a pitch change is remove+add). Pure
 * JSON Schema 2020-12 cannot express cross-property equality, so the invariant
 * is enforced at (1) the TS gen type, (2) arb.ts arbPrimitiveOp, and (3) the
 * resolveOps/previewPatch + INV-1 round-trip property (a mismatched key breaks
 * set-semantics and fails the fast-check spine).
 */
export type PrimitiveOp =
  | { op: "add_note"; note: Note }
  | { op: "remove_note"; note: Note }
  | { op: "update_note_field"; before: Note; after: Note }
  | AutomationOp;

/** The 1/64-beat quantization grid (0.015625 beats) — see {@link noteKey}. */
const KEY_GRID = 1 / 64;

/**
 * Mint a stable note key from its identity-stable fields.
 *
 * `pitch` + `start` ARE the identity. `velocity` / `length` / `pressure` are
 * MUTABLE CONTENT (their change is an `update_note_field`, not a new identity).
 *
 * Pitch changes are modeled as `remove_note(old)` + `add_note(new)`, never
 * `update_note_field` on pitch — a different pitch IS a different note identity
 * (musically honest, mechanically sound for revert). This is why MIDI-04
 * voice-leading-fix emits remove+add pairs, not pitch updates.
 *
 * Quantization: start is rounded to the nearest 1/64 beat (0.015625) so
 * floating-point drift from the bridge's NoteStep grid doesn't split identities.
 *
 * @param pitch - MIDI pitch 0–127.
 * @param startBeats - start position in beats (quantized to 1/64).
 * @returns the key string `n:${pitch}:${quantized.toFixed(4)}`.
 *
 * @example
 * noteKey(60, 0)      // "n:60:0.0000"
 * noteKey(64, 1.5)    // "n:64:1.5000"
 * noteKey(60, 0.014)  // "n:60:0.0000"  (quantized to the 1/64 grid)
 */
export function noteKey(pitch: number, startBeats: number): string {
  const quantized = Math.round(startBeats / KEY_GRID) * KEY_GRID;
  return `n:${pitch}:${quantized.toFixed(4)}`;
}

/**
 * Compute the inverse of a single primitive op. Pure.
 *
 * - `add_note`    → `remove_note` (the inverse of adding is removing)
 * - `remove_note` → `add_note`    (the inverse of removing is adding)
 * - `update_note_field` → swap `before`/`after` (revert the field mutation)
 * - automation kinds → THROWS: a parameter write's inverse needs the apply-time
 *   PRIOR value — per-op inversion is undefined (D-05-07). Use
 *   {@link buildAutomationInverse} with the priorValue captured at apply time.
 *
 * @param op - the primitive op to invert.
 * @returns the inverse op; applying it undoes `op`.
 * @throws Error for the automation kinds (author-aware inverse required).
 *
 * @example
 * inverseOp({ op: "add_note", note })        // { op: "remove_note", note }
 * inverseOp({ op: "update_note_field", before, after })  // swap before/after
 */
export function inverseOp(op: PrimitiveOp): PrimitiveOp {
  switch (op.op) {
    case "add_note":
      return { op: "remove_note", note: op.note };
    case "remove_note":
      return { op: "add_note", note: op.note };
    case "update_note_field":
      return { op: "update_note_field", before: op.after, after: op.before };
    case "set_parameter_value":
    case "automation_points":
    case "remove_automation_points":
      throw new Error(
        `inverseOp: per-op inversion is undefined for automation op '${op.op}' — the inverse needs the apply-time prior value (D-05-07); use buildAutomationInverse(ops, priorValue)`,
      );
  }
}

/**
 * Compute the inverse of an op SEQUENCE. Pure.
 *
 * The inverse of a sequence is the reverse-ordered inverses: to undo ops
 * applied in order [a, b, c], you invert + reverse → [inverseOp(c),
 * inverseOp(b), inverseOp(a)]. This is the LIFO replay the daemon-authoritative
 * revert path (D-03) uses: `bw-edit revert <patchId>` reads the inverse ops
 * stamped at apply time and replays them through the SAME bridge apply.patch
 * path in reverse order.
 *
 * Does NOT mutate the input array (returns a new array).
 *
 * @param ops - the op sequence to invert.
 * @returns the reversed + per-op-inverted sequence.
 *
 * @example
 * inverseOps([{ op: "add_note", note: n1 }, { op: "remove_note", note: n2 }])
 * // [{ op: "add_note", note: n2 }, { op: "remove_note", note: n1 }]
 */
export function inverseOps(ops: PrimitiveOp[]): PrimitiveOp[] {
  // slice() before reverse() so the input array is not mutated in place.
  return ops.slice().reverse().map(inverseOp);
}

/**
 * Build the AUTHOR-AWARE inverse of an automation op sequence (Phase 5 05-05,
 * D-05-07). Pure.
 *
 * Unlike note ops, a parameter write is NOT per-op self-inverting — the
 * inverse must restore the parameter's PRIOR value, which only exists as
 * apply-time state. This function takes that priorValue as an argument (the
 * edit-service captures it from the bridge apply response and FREEZES the
 * result into patch-history.jsonl — INV-14: frozen at apply, never re-derived
 * from drifted live state, never read off the live envelope at revert time).
 *
 * Shape: [remove_automation_points(exactly the patch's authored additions),
 * (automation_points(the patch's authored removals) when present),
 * set_parameter_value(priorValue) LAST] — removal ops first, the prior-value
 * restore last, so replay semantics end at prior.
 *
 * The inverse references ONLY the authored points carried in the ops
 * themselves — no envelope read, no re-derivation from live state (D-05-07).
 * Does NOT mutate the input array.
 *
 * @param ops        - the automation op sequence to invert (note ops are a
 *   pairing violation upstream — this function accepts only automation kinds).
 * @param priorValue - the parameter's normalized value captured at apply time.
 * @returns the inverse op sequence (author-aware, frozen-inverse-compatible).
 *
 * @example
 * buildAutomationInverse([{ op: "automation_points", points: P }, { op:
 * "set_parameter_value", value: 0.8 }], 0.25)
 * // [{ op: "remove_automation_points", points: P }, { op: "set_parameter_value", value: 0.25 }]
 */
export function buildAutomationInverse(ops: AutomationOp[], priorValue: number): PrimitiveOp[] {
  const authoredAdditions: AutomationPoint[] = [];
  const authoredRemovals: AutomationPoint[] = [];
  for (const op of ops) {
    if (op.op === "automation_points") authoredAdditions.push(...op.points);
    else if (op.op === "remove_automation_points") authoredRemovals.push(...op.points);
    // set_parameter_value contributes only the prior-value restore (below).
  }
  const inverse: PrimitiveOp[] = [];
  if (authoredAdditions.length > 0) {
    inverse.push({ op: "remove_automation_points", points: authoredAdditions });
  }
  if (authoredRemovals.length > 0) {
    inverse.push({ op: "automation_points", points: authoredRemovals });
  }
  inverse.push({ op: "set_parameter_value", value: priorValue });
  return inverse;
}
