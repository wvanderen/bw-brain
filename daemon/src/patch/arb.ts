// daemon/src/patch/arb.ts
//
// Phase 3 (Plan 03-01) — fast-check arbitraries for the trust-spine property
// tests (INV-1..INV-5, INV-9, INV-10). This is the FIRST fast-check file in
// the repo; pattern authority is daemon/src/store/atomic-write.test.ts:31-51
// (the only existing "property-style" assertion) + the note-builder helper at
// daemon/src/cli/diff-logic.test.ts:29-37.
//
// CRITICAL IDENTITY INVARIANT: arbNote mints its `key` via the REAL noteKey()
// from inverse-ops.ts — NEVER a free string. This guarantees the generated
// identities match production (D-01/D-03 + RESEARCH.md:1245-1249). A free key
// would drift from how the daemon/diff/bridge mint keys and silently invalidate
// every set-semantics property.
//
// arbOpSeq generates a base Note[] + a target Note[], then derives the op
// sequence via diffToOps. This makes every generated sequence INTERNALLY
// CONSISTENT (no remove_note of a note absent from the base) — without this,
// INV-1 (round-trip reversibility) is not even testable, because a random
// remove_note against an empty base never round-trips. diffToOps mirrors how a
// real transform engine emits ops from a before/after Note[] pair.
//
// Pure module: no I/O. fast-check is a devDependency (test-only import).
import fc from "fast-check";
import type { Note } from "../cli/diff-logic.js";
import { noteKey } from "./inverse-ops.js";

/**
 * Generate a canonical MIDI note with a production-minted key.
 *
 * pitch ∈ [0,127], start ∈ [0,16] beats, length ∈ [0.0625,4], velocity ∈ [1,127].
 * The key is `noteKey(pitch, start)` (1/64-quantized) so identity matches the
 * daemon/diff/bridge exactly. Two notes with the same pitch+quantized-start
 * yield the SAME key (set semantics — mirrors diff-logic.ts indexByKey).
 */
export const arbNote: fc.Arbitrary<Note> = fc
  .record({
    pitch: fc.integer({ min: 0, max: 127 }),
    start: fc.double({ min: 0, max: 16, noNaN: true }),
    length: fc.double({ min: 0.0625, max: 4, noNaN: true }),
    velocity: fc.integer({ min: 1, max: 127 }),
  })
  .map(({ pitch, start, length, velocity }) => ({
    key: noteKey(pitch, start),
    pitch,
    start,
    length,
    velocity,
  }));

/**
 * Generate a set of notes with UNIQUE keys (no identity collisions). Mirrors
 * diff-logic.ts set semantics (indexByKey: last-write-wins on duplicate keys).
 * The empty array is an explicit known case (the empty-clip edge).
 */
export const arbNoteSet: fc.Arbitrary<Note[]> = fc.oneof(
  fc.constant([]),
  fc.uniqueArray(arbNote, {
    selector: (n) => n.key,
    minLength: 1,
    maxLength: 12,
  }),
);

/**
 * Derive a primitive-op sequence that transforms `base` into `target`.
 *
 * - notes in target not in base → add_note
 * - notes in base not in target → remove_note
 * - notes in both with differing content → update_note_field (key matches —
 *   identity-stable; before.key === after.key by construction, Pitfall 2)
 *
 * Emits removes, then updates, then adds. Because every key is unique within a
 * set and the three buckets are disjoint, op order is irrelevant to resolveOps
 * (add/remove/update on distinct keys commute). The sequence is INTERNALLY
 * CONSISTENT: no remove_note references a note absent from base.
 */
export function diffToOps(base: Note[], target: Note[]): import("./inverse-ops.js").PrimitiveOp[] {
  const baseByKey = new Map(base.map((n) => [n.key, n]));
  const targetByKey = new Map(target.map((n) => [n.key, n]));
  const ops: import("./inverse-ops.js").PrimitiveOp[] = [];

  // removes: in base not target.
  for (const [key, n] of baseByKey) {
    if (!targetByKey.has(key)) ops.push({ op: "remove_note", note: n });
  }
  // updates: in both, content differs.
  for (const [key, bn] of baseByKey) {
    const tn = targetByKey.get(key);
    if (tn && (tn.velocity !== bn.velocity || tn.length !== bn.length || tn.pitch !== bn.pitch || tn.start !== bn.start)) {
      // key matches (same pitch+quantized-start); identity-stable update.
      ops.push({ op: "update_note_field", before: bn, after: tn });
    }
  }
  // adds: in target not base.
  for (const [key, n] of targetByKey) {
    if (!baseByKey.has(key)) ops.push({ op: "add_note", note: n });
  }
  return ops;
}

/**
 * Generate an internally-consistent op sequence: pick a base Note[] + a target
 * Note[], derive ops via diffToOps. Guarantees INV-1 round-trip is testable.
 * The empty sequence (base === target) is a known case.
 */
export const arbOpSeq: fc.Arbitrary<{ base: Note[]; ops: import("./inverse-ops.js").PrimitiveOp[] }> =
  fc.tuple(arbNoteSet, arbNoteSet).map(([base, target]) => ({
    base,
    ops: diffToOps(base, target),
  }));

/**
 * Generate a single primitive op (for INV-2 self-inverse tests).
 *
 * update_note_field is constrained so before.key === after.key: the `after`
 * note mutates velocity/length but keeps pitch+start (so the key is unchanged).
 * This honors Pitfall 2 (a pitch change would be remove+add, never update).
 */
export const arbPrimitiveOp: fc.Arbitrary<import("./inverse-ops.js").PrimitiveOp> = fc.oneof(
  // add_note
  arbNote.map((note) => ({ op: "add_note" as const, note })),
  // remove_note
  arbNote.map((note) => ({ op: "remove_note" as const, note })),
  // update_note_field (identity-stable: before.key === after.key)
  arbNote.chain((before) =>
    fc.record({
      newVelocity: fc.integer({ min: 1, max: 127 }),
      newLength: fc.double({ min: 0.0625, max: 4, noNaN: true }),
    }).map(({ newVelocity, newLength }) => ({
      op: "update_note_field" as const,
      before,
      // same pitch + start → same key (identity-stable); only velocity/length mutate.
      after: { ...before, velocity: newVelocity, length: newLength },
    })),
  ),
);
