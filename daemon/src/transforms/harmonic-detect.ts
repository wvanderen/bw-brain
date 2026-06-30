// daemon/src/transforms/harmonic-detect.ts
//
// D-12 harmonic-center detection — hand-rolled Krumhansl-Schmuckler key
// finding. tonal CANNOT detect a key from a pitch-class profile
// (`Key.majorKey`/`Key.minorKey` are LOOKUP functions taking a KNOWN tonic —
// verified via @tonaljs/key docs; there is no `Key.detect()`). The K-S
// correlation against the 24 public-domain Krumhansl-Kessler reference
// profiles is the ONE piece of P3 musical reasoning that cannot delegate to
// tonal.
//
// INV-12 / D-12: detectHarmonicCenter REFUSES (returns null) when the best
// correlation r < 0.5 — NO silent guess. Inference is opt-in (the producer
// leaves intent.harmonicCenter blank) and the caller ALWAYS discloses the
// inference via assumptions[] (Pitfall 6).
//
// PURE module: no fs/net imports. tonal is used for LOOKUP-only materialization
// of the detected scale (downstream counterline/voice-leading consumes it).

import { Key } from "tonal";
import type { Note } from "../cli/diff-logic.js";

/**
 * Krumhansl-Kessler major reference profile (12-dim, C-indexed).
 * Public-domain MIR template; canonical key-finding profile since
 * Krumhansl 1990. Strong tonic (C) + dominant (G) + major third (E).
 */
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

/**
 * Krumhansl-Kessler minor reference profile (12-dim, C-indexed).
 * Strong tonic (C) + dominant (G) + minor third (Eb).
 */
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Tonic pitch-class name lookup (C-indexed). Uses flats for the black keys. */
const TONIC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** Minimum note count to attempt detection (below = refuse, no guess). */
const MIN_NOTES = 4;

/** K-S correlation floor; below this the detection REFUSES (D-12). */
const CORRELATION_FLOOR = 0.5;

/**
 * A detected harmonic center.
 *
 * - `key`: the tonic name (e.g. "A", "Eb").
 * - `mode`: "major" | "minor".
 * - `confidence`: ∈ [0,1], mapped from the K-S Pearson correlation r
 *   (r > 0.85 → 0.9; 0.7 < r ≤ 0.85 → 0.75; 0.5 < r ≤ 0.7 → 0.6).
 *
 * INV-12: a detection is only returned when r > {@link CORRELATION_FLOOR};
 * otherwise {@link detectHarmonicCenter} returns null (refuse, no guess).
 */
export interface HarmonicDetection {
  /** Tonic name (C-indexed pitch-class name). */
  key: string;
  /** Mode determined by which K-S profile won. */
  mode: "major" | "minor";
  /** Confidence mapped from the K-S correlation. */
  confidence: number;
}

/**
 * Detect the harmonic center from a clip's pitch-class profile. Pure (never
 * mutates `notes`).
 *
 * Algorithm: build a velocity×length-weighted 12-bin PCP, then for each of the
 * 12 rotations correlate against both the major and minor K-S reference
 * profiles. Track the best correlation r, tonic, and mode. Map r → confidence;
 * if r ≤ {@link CORRELATION_FLOOR}, REFUSE (return null — D-12, no silent guess).
 *
 * @param notes - the clip notes (any order).
 * @returns the detection, or `null` when notes.length < {@link MIN_NOTES} or
 *   the best correlation is below the floor (INV-12 refuse-below-bar).
 *
 * @example
 * const det = detectHarmonicCenter(cMajorScaleNotes);
 * // det -> { key: "C", mode: "major", confidence: 0.9 }
 * detectHarmonicCenter([]); // -> null (refuse)
 */
export function detectHarmonicCenter(notes: Note[]): HarmonicDetection | null {
  // Below minimum density -> refuse (no guess, INV-12).
  if (notes.length < MIN_NOTES) return null;

  // Velocity × length weighted PCP (C-indexed).
  const pcp = new Array(12).fill(0);
  for (const n of notes) pcp[n.pitch % 12] += n.velocity * n.length;

  // Correlate against every rotation of both reference profiles.
  //
  // Rotation semantics: to test tonic class `rot`, the reference profile's
  // tonic weight (index 0) must land on pitch class `rot`. A note of class `q`
  // sits `(q - rot) mod 12` semitones above the tonic, so the expected salience
  // at index `q` is profile[(q - rot) mod 12]. rotate(profile, k)[q] =
  // profile[(q + k) mod 12], so we need k = (12 - rot) % 12 for the tonic to
  // align with class `rot`. (Rotating by `rot` directly would invert the
  // tonic — e.g. rot=9/A would land the tonic weight on class 3/Eb.)
  let bestR = -Infinity;
  let bestTonic = 0;
  let bestMode: "major" | "minor" = "major";
  for (let rot = 0; rot < 12; rot++) {
    const shift = (12 - rot) % 12;
    const rMaj = correlate(pcp, rotate(KS_MAJOR, shift));
    const rMin = correlate(pcp, rotate(KS_MINOR, shift));
    if (rMaj > bestR) {
      bestR = rMaj;
      bestTonic = rot;
      bestMode = "major";
    }
    if (rMin > bestR) {
      bestR = rMin;
      bestTonic = rot;
      bestMode = "minor";
    }
  }

  // Map correlation r ∈ [-1, 1] → confidence ∈ [0, 1].
  // r > 0.85 → very strong (0.9); 0.7-0.85 → strong (0.75); 0.5-0.7 → weak (0.6);
  // ≤ 0.5 → REFUSE (no silent guess, D-12).
  let confidence: number;
  if (bestR > 0.85) confidence = 0.9;
  else if (bestR > 0.7) confidence = 0.75;
  else if (bestR > CORRELATION_FLOOR) confidence = 0.6;
  else return null; // below bar — REFUSE (INV-12)

  const key = TONIC_NAMES[bestTonic];
  return { key, mode: bestMode, confidence };
}

/**
 * Materialize the scale of a detected key via tonal LOOKUP. tonal cannot
 * detect, but given a known tonic + mode it returns the scale notes. Used by
 * downstream counterline chord-tone selection + voice-leading interval lookup
 * (Plan 04).
 *
 * Pure (tonal Key.majorKey/minorKey are pure lookup functions). Returns a
 * fresh mutable array (tonal's scale property is readonly — we copy so callers
 * may freely mutate without aliasing tonal's internal data).
 *
 * @example
 * materializeScale({ key: "A", mode: "minor", confidence: 0.9 });
 * // -> ["A", "B", "C", "D", "E", "F", "G"]  (A natural minor)
 */
export function materializeScale(det: HarmonicDetection): string[] {
  if (det.mode === "major") {
    // Key.majorKey returns { tonic, type, scale, ... }; .scale is the note names.
    return [...Key.majorKey(det.key).scale];
  }
  // Key.minorKey returns { natural, harmonic, melodic, ... } each with .scale.
  return [...Key.minorKey(det.key).natural.scale];
}

/**
 * Pearson correlation coefficient over two 12-element vectors.
 * Returns 0 (not NaN) when either vector has zero variance (the uniform-PCP
 * case — deterministic refuse, not a divide-by-zero crash).
 */
function correlate(a: number[], b: number[]): number {
  const n = a.length;
  let sumA = 0;
  let sumB = 0;
  let sumAB = 0;
  let sumA2 = 0;
  let sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] ** 2;
    sumB2 += b[i] ** 2;
  }
  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA ** 2) * (n * sumB2 - sumB ** 2));
  return den === 0 ? 0 : num / den;
}

/** Rotate a 12-element array by `n` positions (the pitch-class transposition). */
function rotate(arr: number[], n: number): number[] {
  const k = ((n % arr.length) + arr.length) % arr.length;
  return arr.slice(k).concat(arr.slice(0, k));
}
