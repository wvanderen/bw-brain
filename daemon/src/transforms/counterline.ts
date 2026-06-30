// daemon/src/transforms/counterline.ts
//
// MIDI-03 counterline — companion voice in the SAME clip (creative tier, D-12).
// For each strong-beat source note, emit a companion `add_note` a third or fifth
// BELOW, pitch drawn from the harmonic-center scale (chord tones preferred).
// Rhythm matches the source strong-beat positions (preserves motif rhythmic
// identity). Writes into the SAME clip (D-02).
//
// INV-7 (creative gate): result is EITHER motifSimilarity>=threshold(counterline)
//   OR status:"refused" — NO THIRD STATE.
// INV-11 (below-bar default refuses): a refused counterline carries status +
//   the near-miss score (the apply path requires --allow-below-bar + --confirm).
// D-09/INV-10: the refused branch self-declares risk:"high" at BIRTH (the
//   daemon-side classifyRisk re-validation lands in Task 2 handleMidiCounterline).
//
// PURE module: no fs/net. The candidate-store mint happens in the daemon dispatch.

import type { Note } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import { noteKey } from "../patch/inverse-ops.js";
import type { RiskClass } from "../patch/risk-classifier.js";
import type { Profile } from "../gen/profile.js";
import { motifSignature, motifSimilarity } from "./motif-signature.js";
import { materializeScale, type HarmonicDetection } from "./harmonic-detect.js";
import { Note as TonalNote } from "tonal";

/** Optional region window (D-11) + harmonic center (D-12, REQUIRED for a non-trivial counterline). */
export type Region = { start: number; end: number };
export type Harmonic = { key: string; mode: "major" | "minor" };

/** counterline result. Accepted → operations non-empty + risk "medium"; refused → empty + risk "high" + status. */
export interface CounterlineResult {
  operations: PrimitiveOp[];
  /** Self-declared risk: "medium" accepted / "high" refused (D-07/D-09). */
  risk: RiskClass;
  motifSimilarity: number;
  status?: "refused";
}

/** Companion intervals BELOW the source, in semitones (a minor third + a perfect fifth). */
const COMPANION_INTERVALS = [3, 7];

/**
 * Generate a counterline (companion voice) for `source`. Pure.
 *
 * @param source   - the clip notes (filtered to `region` internally).
 * @param region   - OPTIONAL {start,end} beats window (D-11).
 * @param profile  - the genre profile (thresholds.counterline + strongBeatGrid).
 * @param harmonic - the harmonic center (D-12). When absent, counterline REFUSES
 *                   (no companion pitches without a scale — no guess).
 * @returns accepted ({operations, risk:"medium", motifSimilarity}) when the
 *          variant clears the threshold, or refused ({operations:[], risk:"high",
 *          status:"refused", motifSimilarity}) otherwise.
 */
export function counterline(
  source: Note[],
  region: Region | undefined,
  profile: Profile,
  harmonic: Harmonic | undefined,
): CounterlineResult {
  const threshold = profile.thresholds.counterline;
  const src = filterRegion(source, region);
  const sourceSig = motifSignature(src);

  // No harmonic center → no scale to draw chord tones from → refuse (D-12, no guess).
  if (!harmonic || src.length === 0) {
    return refuse(sourceSig, sourceSig, threshold);
  }

  const strongBeats = profile.strongBeatGrid ?? [0, 1, 2, 3];
  const det: HarmonicDetection = { key: harmonic.key, mode: harmonic.mode, confidence: 1.0 };
  const scalePcs = materializeScale(det).map((name) => TonalNote.chroma(name)); // e.g. [0,2,4,5,7,9,11]
  const scalePcSet = new Set(scalePcs);
  const existingKeys = new Set(src.map((n) => n.key));

  const variant: Note[] = [...src];
  for (const n of src) {
    const beat = Math.floor(n.start) % 4;
    if (!strongBeats.includes(beat)) continue;
    // Pick the companion pitch: try a third below, then a fifth below, choosing
    // the first whose pitch class is IN the harmonic scale.
    let companion: number | null = null;
    for (const interval of COMPANION_INTERVALS) {
      const cand = n.pitch - interval;
      if (cand < 0 || cand > 127) continue;
      const pc = ((cand % 12) + 12) % 12;
      if (scalePcSet.has(pc)) {
        companion = cand;
        break;
      }
    }
    if (companion === null) continue;
    const key = noteKey(companion, n.start);
    if (existingKeys.has(key)) continue; // a companion voice slot is already filled
    existingKeys.add(key);
    variant.push({
      pitch: companion,
      start: n.start,
      length: n.length,
      velocity: Math.max(1, Math.floor(n.velocity * 0.8)), // companion is slightly softer
      key,
    });
  }

  const variantSig = motifSignature(variant);
  const sim = motifSimilarity(sourceSig, variantSig);
  if (sim >= threshold) {
    return { operations: diffAdds(src, variant), risk: "medium", motifSimilarity: sim };
  }
  return { operations: [], risk: "high", motifSimilarity: sim, status: "refused" };
}

/** Build a refuse result (no ops; below-bar near-miss score). */
function refuse(sourceSig: ReturnType<typeof motifSignature>, variantSig: ReturnType<typeof motifSignature>, threshold: number): CounterlineResult {
  const sim = motifSimilarity(sourceSig, variantSig);
  void threshold;
  return { operations: [], risk: "high", motifSimilarity: sim, status: "refused" };
}

/** Filter `source` to notes whose start is in [region.start, region.end). Whole clip when region absent. */
function filterRegion(source: Note[], region: Region | undefined): Note[] {
  if (!region) return [...source];
  return source.filter((n) => n.start >= region.start && n.start < region.end);
}

/** Derive the add_note ops that turn `before` into `after` (counterline only adds). */
function diffAdds(before: Note[], after: Note[]): PrimitiveOp[] {
  const beforeKeys = new Set(before.map((n) => n.key));
  const ops: PrimitiveOp[] = [];
  for (const n of after) {
    if (!beforeKeys.has(n.key)) ops.push({ op: "add_note", note: n });
  }
  return ops;
}
