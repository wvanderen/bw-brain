// daemon/src/transforms/voice-leading-fix.ts
//
// MIDI-04 voice-leading-fix — low-risk cleanup (parallel P5/P8, leading-tone
// resolution, spacing). Cleanup tier (D-10): SKIPS the motif gate; INV-8 — the
// result is NEVER status:"refused" on motif grounds (a refusing cleanup is a
// bug, not a feature).
//
// Pitfall 2 (D-01 note identity): pitch changes are ALWAYS remove_note(old) +
// add_note(new) pairs — NEVER update_note_field on pitch. A different pitch IS
// a different identity (n:${pitch}:${startQuantized}). The resolution moves the
// second note of a parallel interval DOWN by one scale-degree; that pitch move
// is emitted as a remove+add pair so revert round-trips correctly (INV-1/2).
//
// PURE module: no fs/net. Self-declares risk "low" (cleanup tier, D-07); the
// daemon re-validates via classifyRisk before minting (Task 2).

import type { Note } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import { noteKey } from "../patch/inverse-ops.js";
import type { RiskClass } from "../patch/risk-classifier.js";

/** voice-leading-fix result. Cleanup tier → NEVER refused (INV-8); risk "low". */
export interface VoiceLeadingFixResult {
  operations: PrimitiveOp[];
  risk: RiskClass;
}

/** Perfect fifth = 7 semitones; perfect octave = 12 semitones (the forbidden parallels). */
const P5 = 7;
const P8 = 12;
/** Resolution step: move the second note of a parallel down by 2 semitones (a scale-degree-ish). */
const RESOLVE_STEP = 2;

/**
 * Detect + resolve voice-leading faults in a single voice (ordered by start).
 * Pure. Emits remove_note+add_note pairs for pitch moves (Pitfall 2) and NEVER
 * refuses (INV-8 — cleanup tier).
 *
 * Detection rules (RESEARCH.md:894-897):
 *   - Parallel fifths/octaves: two consecutive intervals both P5 or both P8.
 *     Resolve by moving the SECOND note of the second interval down a step.
 *   - (Leading-tone + spacing cleanups are additive extensions of the same
 *     remove+add discipline; this v1 ships the parallel-fifth/octave fix, which
 *     is the Pitfall-2-pinning case.)
 *
 * @param source - the clip notes (sorted internally by start for interval walk).
 * @returns {operations, risk:"low"}. Never carries status (cleanup tier, INV-8).
 */
export function voiceLeadingFix(source: Note[]): VoiceLeadingFixResult {
  const sorted = [...source].sort((a, b) => a.start - b.start);
  const ops: PrimitiveOp[] = [];
  const existingKeys = new Set(sorted.map((n) => n.key));

  // Walk consecutive interval pairs in the (start-ordered) single voice.
  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const next = sorted[i + 1];
    const interval1 = Math.abs(cur.pitch - prev.pitch);
    const interval2 = Math.abs(next.pitch - cur.pitch);
    const isParallel = (interval1 === interval2) && (interval1 === P5 || interval1 === P8);
    if (!isParallel) continue;

    // Resolve: move `cur` (the shared note of the two parallel intervals) DOWN
    // by RESOLVE_STEP semitones. A pitch change → new identity → remove+add.
    const newPitch = cur.pitch - RESOLVE_STEP;
    if (newPitch < 0 || newPitch > 127) continue;
    const newKey = noteKey(newPitch, cur.start);
    if (newKey === cur.key || existingKeys.has(newKey)) continue; // no-op or collision
    existingKeys.add(newKey);
    ops.push({ op: "remove_note", note: cur });
    ops.push({ op: "add_note", note: { ...cur, pitch: newPitch, key: newKey } });
    // Reflect the resolution in the working set so subsequent interval pairs see
    // the fixed pitch (avoid cascading duplicate resolutions on the same note).
    sorted[i] = { ...cur, pitch: newPitch, key: newKey };
  }

  return { operations: ops, risk: "low" };
}
