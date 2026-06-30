// daemon/src/transforms/humanize.ts
//
// MIDI-05 humanize — velocity/timing humanization (cleanup tier, D-10). For
// each note: gaussian-ish velocity jitter ±profile.velocityHumanize.jitter
// (clamped 1-127), timing jitter ±profile.timingHumanize.jitterBeats (clamped
// ≥0). Emits update_note_field ops ONLY (key stable — identity unchanged).
//
// INV-8 (cleanup tier never refuses): result is NEVER status:"refused" on motif
// grounds (D-10 — a refusing humanize is a bug, not a feature).
// Identity-stable (Pitfall 2): every update_note_field op has before.key ===
// after.key. Humanize jitters velocity + start CONTENT; pitch + the quantized
// start grid ARE identity, so the `key` is preserved by fiat (after.key is set
// to before.key — the jittered start is sub-grid feel, not a new identity).
//
// Determinism: humanize is a PURE function — the jitter is derived from a
// deterministic hash of each note's identity fields (NOT Math.random). This
// keeps the transform reproducible (the same clip + profile always yields the
// same humanization) and testable (property tests are stable across runs).
//
// PURE module: no fs/net. Self-declares risk "low" (cleanup tier, D-07).

import type { Note } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import type { RiskClass } from "../patch/risk-classifier.js";
import type { Profile } from "../gen/profile.js";

/** humanize result. Cleanup tier → NEVER refused (INV-8); risk "low". */
export interface HumanizeResult {
  operations: PrimitiveOp[];
  risk: RiskClass;
}

/**
 * Humanize velocity + timing across `source`. Pure + deterministic.
 *
 * @param source  - the clip notes.
 * @param profile - the genre profile (velocityHumanize.jitter +
 *                  timingHumanize.jitterBeats). Defaults to a small jitter when
 *                  the profile omits the curves.
 * @returns {operations, risk:"low"}. Every op is update_note_field with
 *          before.key === after.key (identity-stable, Pitfall 2).
 */
export function humanize(source: Note[], profile: Profile): HumanizeResult {
  const velJitter = profile.velocityHumanize?.jitter ?? 5;
  const timeJitter = profile.timingHumanize?.jitterBeats ?? 0.01;

  const ops: PrimitiveOp[] = [];
  for (let i = 0; i < source.length; i++) {
    const before = source[i];
    // Deterministic pseudo-jitter in [-1, 1] from a smooth hash of identity
    // fields. Math.sin is bounded + smooth → a cheap gaussian-ish shape (the
    // "curve: gaussian" aspiration; the precise distribution is not load-bearing
    // for the cleanup-tier invariants — ranges + identity-stability are).
    const h = hash(before.pitch, before.start, before.length, i);
    const vDelta = Math.sin(h * 2.5) * velJitter;
    const tDelta = Math.cos(h * 2.5) * timeJitter;

    const velocity = clampVelocity(before.velocity + vDelta);
    const start = Math.max(0, before.start + tDelta);

    // Identity-stable: after.key === before.key (pitch + quantized start
    // unchanged). The jittered start is sub-grid feel; the key is the identity.
    const after: Note = { ...before, velocity, start };
    ops.push({ op: "update_note_field", before, after });
  }

  return { operations: ops, risk: "low" };
}

/** Clamp velocity into the valid MIDI range [1, 127] (D-05). */
function clampVelocity(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

/**
 * Deterministic hash → a real number in [0, 1). Derived from the note's
 * identity fields + its index, so humanize is a pure function of (source,
 * profile). Two calls on the same input yield the same jitter.
 */
function hash(pitch: number, start: number, length: number, index: number): number {
  // Fractional part of a large irrational multiple — a cheap, well-distributed hash.
  const x = pitch * 0.6180339887498949 + start * 1.6180339887498949 + length * 2.414213562373095 + index * 3.141592653589793;
  return x - Math.floor(x);
}
