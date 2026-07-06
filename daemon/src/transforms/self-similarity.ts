// daemon/src/transforms/self-similarity.ts
//
// P4 / 04-02 Task 1 — n×n cosine-affinity self-similarity matrix. PURE.
//
// Adapted from librosa.segment.recurrence_matrix(mode='affinity', metric='cosine',
// sym=true) — the canonical self-similarity matrix for music structure analysis.
// Adapted to MIDI feature vectors (no STFT — each scene's feature vector is
// already computed by sceneFeatureVector).
//
// Shared substrate for D-04 (section detection via temporally-constrained
// agglomerative clustering) and D-06 (repetition report via union-find over
// high-affinity pairs). Both Wave 3 analyzers consume this matrix as input.
//
// Adapted from motif-signature.ts `cosine()` (lines 136-147) + the
// `(cos + 1) / 2` remap (lines 128-133) — the cosine ∈ [-1,1] → [0,1] mapping
// P4 needs so affinity is always non-negative (a structurally-meaningful
// distance metric).
//
// PURE module: no fs/net imports. Mirrors motif-signature.ts discipline.

import type { SceneFeatureVector } from "./scene-features.js";

/**
 * Cosine affinity ∈ [0, 1]. Cosine similarity ∈ [-1, 1] is remapped to [0, 1]
 * via `(cos + 1) / 2` so the affinity is always non-negative (a structurally
 * meaningful distance metric for clustering + repetition detection).
 *
 * Zero-magnitude vectors yield affinity 0 (NOT NaN — INV-6 guard, mirrors
 * motif-signature.ts:136-147). This is the "an empty scene is dissimilar to
 * everything except itself" semantics — the caller (selfSimilarityMatrix) sets
 * the diagonal to 1.0 explicitly so an empty scene is still self-identical.
 *
 * Pure.
 *
 * @example
 * cosineAffinity([1, 0, 0], [1, 0, 0]); // 1.0 (identical)
 * cosineAffinity([1, 0, 0], [0, 1, 0]); // 0.5 (orthogonal — cos=0 remapped)
 * cosineAffinity([0, 0, 0], [1, 2, 3]); // 0 (zero-magnitude guard)
 */
export function cosineAffinity(u: number[], v: number[]): number {
  // Defensive: mismatched lengths are a caller bug — treat as zero overlap.
  const len = Math.min(u.length, v.length);
  if (len === 0) return 0;
  let dot = 0;
  let magU = 0;
  let magV = 0;
  for (let i = 0; i < len; i++) {
    dot += u[i] * v[i];
    magU += u[i] ** 2;
    magV += v[i] ** 2;
  }
  // Zero-magnitude → 0 (NOT 0.5). Spec: "zero-magnitude → 0" takes precedence
  // over the (cos+1)/2 remap — an empty/zero vector is dissimilar to everything,
  // including itself (the self-similarity matrix sets the diagonal to 1.0
  // explicitly so an empty scene is still self-identical).
  if (magU === 0 || magV === 0) return 0;
  const cos = dot / (Math.sqrt(magU) * Math.sqrt(magV)); // ∈ [-1, 1]
  return (cos + 1) / 2; // ∈ [0, 1]
}

/**
 * Build the n×n symmetric cosine-affinity self-similarity matrix for a sequence
 * of scene feature vectors. Pure.
 *
 * Properties (pinned by fast-check property tests):
 *   1. Square `n × n` matrix.
 *   2. Symmetric: `m[i][j] === m[j][i]` (within float epsilon).
 *   3. Diagonal = 1.0 (every scene is identical to itself).
 *   4. Every entry ∈ [0, 1] (cosine remapped).
 *
 * Empty-scene guard: a feature with `normalized: []` (empty scene) yields a
 * row/col of all-zeros EXCEPT the diagonal, which is 1.0. An empty scene is
 * trivially self-identical but cannot be similar to anything else.
 *
 * @param features - the per-scene feature vectors (any length n ≥ 0).
 * @returns the n×n symmetric affinity matrix. `[]` for empty input.
 *
 * @example
 * const features = [sceneFeatureVector(col0), sceneFeatureVector(col1)];
 * const sim = selfSimilarityMatrix(features);
 * // sim[0][0] === 1.0; sim[1][1] === 1.0; sim[0][1] === sim[1][0] ∈ [0,1]
 */
export function selfSimilarityMatrix(features: SceneFeatureVector[]): number[][] {
  const n = features.length;
  // Allocate the n×n matrix once (fills with 0; we overwrite every cell).
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    // Diagonal: every scene is self-identical (even an empty one).
    m[i][i] = 1.0;
    const fi = features[i];
    for (let j = i + 1; j < n; j++) {
      // Symmetric fill: compute once, write twice.
      const fj = features[j];
      // Empty-scene guard: an empty feature is dissimilar to everything but itself.
      const aff =
        fi.normalized.length === 0 || fj.normalized.length === 0
          ? 0
          : cosineAffinity(fi.normalized, fj.normalized);
      m[i][j] = aff;
      m[j][i] = aff;
    }
  }
  return m;
}
