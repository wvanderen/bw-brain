// daemon/src/transforms/self-similarity.test.ts
//
// P4 / 04-02 Task 1 — n×n cosine-affinity self-similarity matrix.
// INVARIANTS (pinned by fast-check property tests):
//   1. Square n×n symmetric matrix.
//   2. Diagonal = 1.0 (within float epsilon).
//   3. Every entry ∈ [0, 1] (cosine remapped).
//   4. cosineAffinity(u, u) = 1.0; cosineAffinity(u, v) ∈ [0,1] for nonzero vectors.
//
// Mirrors motif-signature.test.ts INV-6 sanity discipline (symmetry, bounded, self=1.0).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { cosineAffinity, selfSimilarityMatrix } from "./self-similarity.js";
import { sceneFeatureVector, type SceneColumn } from "./scene-features.js";
import type { Note } from "../cli/diff-logic.js";

function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** Build a SceneColumn with N copies of the same note (a simple non-empty scene). */
function sceneFromNotes(sceneIdx: number, notes: Note[]): SceneColumn {
  return {
    sceneIdx,
    cells: [{ trackSid: "t", trackName: "T", hasContent: notes.length > 0, loopBeats: 16, notes }],
  };
}

describe("cosineAffinity — pure helper", () => {
  it("returns 1.0 for identical non-zero vectors", () => {
    const u = [1, 2, 3, 4];
    expect(cosineAffinity(u, u)).toBeCloseTo(1.0, 6);
  });

  it("returns 0 for zero-magnitude vectors (no NaN — INV-6 guard)", () => {
    expect(cosineAffinity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineAffinity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("bounded in [0, 1] for any pair of non-zero vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const s = cosineAffinity(a, b);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("symmetry: cosineAffinity(u, v) === cosineAffinity(v, u)", () => {
    const u = [1, 2, 3, 4, 5];
    const v = [5, 4, 3, 2, 1];
    expect(cosineAffinity(u, v)).toBeCloseTo(cosineAffinity(v, u), 6);
  });

  it("property: cosineAffinity ∈ [0, 1] for any non-zero vectors (fast-check)", () => {
    const vecArb = fc.array(fc.integer({ min: -10, max: 10 }), { minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(vecArb, vecArb, (u, v) => {
        // pad to equal length (cosine requires matching dimensionality)
        const len = Math.max(u.length, v.length);
        while (u.length < len) u.push(0);
        while (v.length < len) v.push(0);
        // Skip the all-zero corner case (it's covered explicitly above).
        if (u.every((x) => x === 0) || v.every((x) => x === 0)) return;
        const s = cosineAffinity(u, v);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("selfSimilarityMatrix — square symmetric matrix", () => {
  it("3 features → 3×3 matrix", () => {
    const features = [
      sceneFeatureVector(sceneFromNotes(0, [note(60, 0), note(64, 1)])),
      sceneFeatureVector(sceneFromNotes(1, [note(62, 0), note(65, 1)])),
      sceneFeatureVector(sceneFromNotes(2, [note(64, 0), note(67, 1)])),
    ];
    const m = selfSimilarityMatrix(features);
    expect(m).toHaveLength(3);
    for (const row of m) expect(row).toHaveLength(3);
  });

  it("diagonal is exactly 1.0 for every scene", () => {
    const features = [
      sceneFeatureVector(sceneFromNotes(0, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(1, [note(62, 0)])),
      sceneFeatureVector(sceneFromNotes(2, [note(64, 0)])),
    ];
    const m = selfSimilarityMatrix(features);
    for (let i = 0; i < features.length; i++) {
      expect(m[i][i]).toBeCloseTo(1.0, 6);
    }
  });

  it("matrix is symmetric: m[i][j] ≈ m[j][i] (toBeCloseTo 5)", () => {
    const features = [
      sceneFeatureVector(sceneFromNotes(0, [note(60, 0), note(64, 1), note(67, 2)])),
      sceneFeatureVector(sceneFromNotes(1, [note(50, 0), note(53, 1)])),
      sceneFeatureVector(sceneFromNotes(2, [note(72, 0)])),
    ];
    const m = selfSimilarityMatrix(features);
    for (let i = 0; i < features.length; i++) {
      for (let j = 0; j < features.length; j++) {
        expect(m[i][j]).toBeCloseTo(m[j][i], 5);
      }
    }
  });

  it("all entries ∈ [0, 1]", () => {
    const features = [
      sceneFeatureVector(sceneFromNotes(0, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(1, [note(62, 0)])),
    ];
    const m = selfSimilarityMatrix(features);
    for (const row of m) for (const v of row) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("single feature → 1×1 matrix with m[0][0] = 1.0", () => {
    const features = [sceneFeatureVector(sceneFromNotes(0, [note(60, 0)]))];
    const m = selfSimilarityMatrix(features);
    expect(m).toHaveLength(1);
    expect(m[0]).toHaveLength(1);
    expect(m[0][0]).toBeCloseTo(1.0, 6);
  });

  it("empty array → empty matrix (no crash)", () => {
    const m = selfSimilarityMatrix([]);
    expect(m).toEqual([]);
  });

  it("feature with normalized:[] (empty scene) → row/col are 0 except diagonal (per spec guard)", () => {
    // An empty-scene feature cannot be similar to anything; the diagonal must
    // still be 1.0 (self-similarity is trivially complete for an empty scene).
    const emptyFeature = sceneFeatureVector({ sceneIdx: 0, cells: [] });
    const denseFeature = sceneFeatureVector(sceneFromNotes(1, [note(60, 0)]));
    const m = selfSimilarityMatrix([emptyFeature, denseFeature]);
    // Diagonal must be 1.0 even for the empty scene.
    expect(m[0][0]).toBeCloseTo(1.0, 6);
    expect(m[1][1]).toBeCloseTo(1.0, 6);
    // Off-diagonal where empty scene pairs with a dense scene: must be 0.
    expect(m[0][1]).toBe(0);
    expect(m[1][0]).toBe(0);
  });

  it("property: matrix is symmetric + diagonal=1.0 + all entries ∈ [0,1] for N=1..50", () => {
    // Use fc.integer + scale to avoid fc.float's 32-bit-float constraint quirk.
    const noteArb = fc.record({
      pitch: fc.integer({ min: 36, max: 84 }),
      start: fc.integer({ min: 0, max: 800 }).map((t) => t / 100), // 0.00..8.00 beats
      length: fc.integer({ min: 10, max: 200 }).map((t) => t / 100), // 0.10..2.00 beats
      velocity: fc.integer({ min: 40, max: 120 }),
    }).map((n) => note(n.pitch, n.start, n.length, n.velocity));

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.array(noteArb, { minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 50 }),
        (n, scenesNotes) => {
          // Truncate to length n (the integer generator forces the dimension test).
          const features = scenesNotes
            .slice(0, n)
            .map((notes, i) => sceneFeatureVector(sceneFromNotes(i, notes)));
          const m = selfSimilarityMatrix(features);
          expect(m).toHaveLength(features.length);
          for (let i = 0; i < features.length; i++) {
            expect(m[i]).toHaveLength(features.length);
            for (let j = 0; j < features.length; j++) {
              expect(m[i][j]).toBeGreaterThanOrEqual(0);
              expect(m[i][j]).toBeLessThanOrEqual(1);
              expect(m[i][j]).toBeCloseTo(m[j][i], 5);
              if (i === j) expect(m[i][j]).toBeCloseTo(1.0, 5);
            }
          }
        },
      ),
    );
  });
});
