// daemon/src/transforms/scene-features.ts
//
// P4 / 04-02 Task 1 — per-scene feature vector (D-04 input). Pure feature
// extraction: takes a SceneColumn (one sceneIdx across all tracks) and produces
// a flat, comparable feature vector. The `normalized` field is the L2-unit
// concatenation that downstream analyzers feed into selfSimilarityMatrix (D-04
// section detection, D-06 repetition report) and the energy composite (D-05).
//
// Adapted from motif-signature.ts (the canonical "compute a feature vector from
// a Note[]" pattern):
//   - PCP loop (motif-signature.ts:76-81) → 12-bin velocity×length weighted profile
//   - density (motif-signature.ts:102-104) → notes / span-beats
//   - divide-by-zero guards (INV-6 — never NaN for empty/single-note inputs)
//
// PURE module: no fs/net imports. Mirrors diff-logic.ts + motif-signature.ts
// discipline (documented interfaces, @example JSDoc, NO side effects). Consumes
// Note from diff-logic (canonical shape — NEVER redefine).
//
// Empty-scene contract: an all-empty column returns `normalized: []`. The caller
// (section-detector, repetition-report) REFUSES — emits honest low confidence
// upstream. The vector is never fabricated.

import type { Note } from "../cli/diff-logic.js";

/**
 * A single scene's clip-grid column at a specific scene index. One cell per
 * track; `hasContent=false` cells carry empty notes (they are skipped during
 * feature extraction).
 */
export interface SceneColumn {
  sceneIdx: number;
  cells: Array<{
    trackSid: string;
    trackName: string;
    hasContent: boolean;
    /** Empty when `hasContent` is false. */
    notes: Note[];
    /** Loop length in beats for this cell's clip (0 when empty). */
    loopBeats: number;
  }>;
}

/**
 * The per-scene feature vector. Reuses motif-signature.ts primitives (PCP +
 * density) and extends with scene-level aggregates (activeTrackCount, polyphony,
 * pitchCentroid).
 *
 * INV-4: every scalar field is FINITE for any non-empty column (divide-by-zero
 * guarded — no NaN, no Infinity). The `normalized` field is L2-unit-length for
 * non-empty scenes and `[]` for empty scenes (caller refuses upstream).
 *
 * Normalization scheme (documented — D-04 binding contract):
 *   normalized = L2-normalize([
 *     noteDensity,
 *     ...pcp,                 // 12 bins
 *     velocityAggregate,
 *     activeTrackCount,
 *     lengthBeats / 16,       // scale to ~[0,1]
 *     pitchCentroid / 127,    // scale to [0,1]
 *     polyphony / 16,         // scale to ~[0,1]
 *   ])
 * The 16/127 divisors are deterministic scalers (NOT learned); they map each
 * raw feature into a comparable range so no single dimension dominates the
 * cosine similarity. Determinism is load-bearing — Wave 3 analyzers persist
 * feature snapshots keyed by this exact vector.
 */
export interface SceneFeatureVector {
  sceneIdx: number;
  /** Notes per beat across all active cells (totalNotes / max(spanBeats, 0.25)). */
  noteDensity: number;
  /** 12-bin pitch-class profile (C-indexed), velocity×length weighted, sum≈1.0. */
  pcp: number[];
  /** Mean velocity / 127 across active-cell notes (∈ [0,1] for non-empty). */
  velocityAggregate: number;
  /** Number of cells with hasContent=true. */
  activeTrackCount: number;
  /** Longest loopBeats across active cells (the scene's "duration"). */
  lengthBeats: number;
  /** Velocity-weighted mean MIDI pitch (0-127). */
  pitchCentroid: number;
  /** Max simultaneous notes (peak across cells — notes overlapping in start time). */
  polyphony: number;
  /**
   * L2-unit-length concatenation of [noteDensity, ...pcp, velocityAggregate,
   * activeTrackCount, lengthBeats/16, pitchCentroid/127, polyphony/16]. Empty
   * scene → `[]` (caller refuses; never fabricated).
   */
  normalized: number[];
}

/**
 * Compute the per-scene feature vector. Pure (never mutates `column`).
 *
 * @param column - the scene column (one sceneIdx across all tracks).
 * @returns the feature vector. Always finite scalar fields; `normalized` is
 *   L2-unit-length for non-empty scenes and `[]` for empty scenes.
 *
 * @example
 * const v = sceneFeatureVector({
 *   sceneIdx: 0,
 *   cells: [{
 *     trackSid: "t", trackName: "Kick", hasContent: true, loopBeats: 16,
 *     notes: [{ key: "n:36:0", pitch: 36, start: 0, length: 0.25, velocity: 100 }],
 *   }],
 * });
 * // v.noteDensity > 0; v.pcp[0] > 0 (C); v.normalized is L2-unit-length.
 */
export function sceneFeatureVector(column: SceneColumn): SceneFeatureVector {
  const activeCells = column.cells.filter((c) => c.hasContent);
  const allNotes = activeCells.flatMap((c) => c.notes);

  // --- PCP: velocity × length weighted, 12-bin, divide-by-zero guarded. ---
  const pcpRaw = new Array(12).fill(0);
  for (const n of allNotes) {
    pcpRaw[n.pitch % 12] += n.velocity * n.length; // salience = loud × long
  }
  const pcpSum = pcpRaw.reduce((a, b) => a + b, 0) || 1; // INV-4 zero guard
  const pcp = pcpRaw.map((v) => v / pcpSum);

  // --- noteDensity: totalNotes / max(spanBeats, 0.25). ---
  const spanBeats = allNotes.length > 1
    ? Math.max(...allNotes.map((n) => n.start)) - Math.min(...allNotes.map((n) => n.start))
    : Math.max(...activeCells.map((c) => c.loopBeats), 0);
  const noteDensity = allNotes.length / Math.max(spanBeats, 0.25);

  // --- velocityAggregate: mean velocity / 127 across active-cell notes. ---
  const velocityAggregate = allNotes.length > 0
    ? allNotes.reduce((s, n) => s + n.velocity, 0) / allNotes.length / 127
    : 0;

  // --- activeTrackCount: number of cells with hasContent. ---
  const activeTrackCount = activeCells.length;

  // --- lengthBeats: max loopBeats across active cells. ---
  const lengthBeats = activeCells.length > 0
    ? Math.max(...activeCells.map((c) => c.loopBeats))
    : 0;

  // --- pitchCentroid: velocity-weighted mean MIDI pitch (0-127). ---
  const velocitySum = allNotes.reduce((s, n) => s + n.velocity, 0) || 1; // guard
  const pitchCentroid = allNotes.length > 0
    ? allNotes.reduce((s, n) => s + n.pitch * n.velocity, 0) / velocitySum
    : 0;

  // --- polyphony: max simultaneous notes (peak across cells). ---
  // For each cell, count max notes that overlap at any single start time. This
  // is a per-cell peak (not a global timeline) — adequate for role inference.
  // Initial value 0 so an empty activeCells list → polyphony 0 (which makes the
  // raw vector all-zeros → normalized=[] for truly empty columns).
  const polyphony = activeCells.reduce((peak, c) => {
    if (c.notes.length === 0) return peak;
    // Group by start time (rounded to 0.01 beats to merge quantization jitter);
    // the largest group is the per-cell peak polyphony.
    const byStart = new Map<number, number>();
    for (const n of c.notes) {
      const bucket = Math.round(n.start * 100) / 100;
      byStart.set(bucket, (byStart.get(bucket) ?? 0) + 1);
    }
      const cellPeak = Math.max(...byStart.values());
      return Math.max(peak, cellPeak);
    }, 0);

  // --- normalized: L2-unit-length concatenation. ---
  // Empty scene → []. Active-but-zero-notes scene → still normalizes (the raw
  // vector is all zeros except activeTrackCount, which gives a unit vector along
  // that axis — that's the honest encoding for "a cell exists but is silent").
  const raw = [
    noteDensity,
    ...pcp,
    velocityAggregate,
    activeTrackCount,
    lengthBeats / 16,
    pitchCentroid / 127,
    polyphony / 16,
  ];
  const mag = Math.sqrt(raw.reduce((s, x) => s + x * x, 0));
  const normalized = mag === 0 ? [] : raw.map((x) => x / mag);

  return {
    sceneIdx: column.sceneIdx,
    noteDensity,
    pcp,
    velocityAggregate,
    activeTrackCount,
    lengthBeats,
    pitchCentroid,
    polyphony,
    normalized,
  };
}
