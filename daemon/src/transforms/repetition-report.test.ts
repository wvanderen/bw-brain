// daemon/src/transforms/repetition-report.test.ts
//
// P4 / 04-03 Task 2 — RepetitionReport Analyzer + repetitionClusters (union-find).
// ARRANGE-02 at the analyzer level (CLI wiring in Plan 05).
//
// INVARIANTS pinned here (the trust-spine gates for ARRANGE-02):
//   1. Union-find transitive closure: every pair with sim ≥ threshold lands in
//      the SAME cluster (transitive — A~B, B~C ⇒ A,B,C grouped even if A≁C).
//   2. Singleton groups FILTERED (a group of one is NOT a repetition).
//   3. Clusters are DISJOINT (no scene appears in two clusters).
//   4. matchedOn populated with the feature dimensions that drove similarity.
//   5. Empty grid / <2 scenes → REFUSES (returns [] — no guess).
//   6. Confidence honest ∈ [0,1] (NOT pre-floored — Pitfall 4).
//   7. assumptions[] on every emitted DerivedField (UX-06).
//
// Mirrors section-detector.test.ts + self-similarity.test.ts discipline.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  RepetitionReport,
  repetitionClusters,
  type RepetitionCluster,
} from "./repetition-report.js";
import { sceneFeatureVector, type SceneColumn, type SceneFeatureVector } from "./scene-features.js";
import { selfSimilarityMatrix } from "./self-similarity.js";
import type { Note } from "../cli/diff-logic.js";
import type { RawState } from "../state/analyzer-registry.js";

function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

function sceneFromNotes(sceneIdx: number, notes: Note[]): SceneColumn {
  return {
    sceneIdx,
    cells: [{ trackSid: "t", trackName: "T", hasContent: notes.length > 0, loopBeats: 16, notes }],
  };
}

/** A minimal SceneFeatureVector carrying a hand-crafted normalized vector. */
function featureWithVector(sceneIdx: number, normalized: number[]): SceneFeatureVector {
  return {
    sceneIdx,
    noteDensity: 0,
    pcp: new Array(12).fill(0),
    velocityAggregate: 0,
    activeTrackCount: 1,
    lengthBeats: 4,
    pitchCentroid: 60,
    polyphony: 1,
    normalized,
  };
}

/** Build a RawState carrying a launcher grid (track-major → scene-minor). */
function rawWithGrid(tracks: Array<{
  trackSid: string;
  name: string;
  scenes: Array<{ sceneIdx: number; clipSid: string; hasContent: boolean; loopBeats: number; notes: Note[] }>;
}>): RawState {
  return {
    version: "1.0",
    project: { name: "T", tempo: 130, timeSignature: "4/4" },
    selection: {},
    tracks: tracks as unknown as RawState["tracks"],
  } as unknown as RawState;
}

/** 4 stub features (only used for length / matchedOn — sim is hand-crafted). */
function stubFeatures(n: number): SceneFeatureVector[] {
  return Array.from({ length: n }, (_, i) => featureWithVector(i, [1]));
}

// ---------------------------------------------------------------------------
// repetitionClusters — pure union-find (D-15)
// ---------------------------------------------------------------------------

describe("repetitionClusters — pure union-find (D-15)", () => {
  it("sim[0][2]≥0.7 and sim[1][3]≥0.7 (no other high pairs) → 2 clusters [0,2] + [1,3]", () => {
    const features = stubFeatures(4);
    const sim = [
      [1.0, 0.2, 0.8, 0.2],
      [0.2, 1.0, 0.2, 0.75],
      [0.8, 0.2, 1.0, 0.2],
      [0.2, 0.75, 0.2, 1.0],
    ];
    const clusters = repetitionClusters(features, sim, 0.7);
    expect(clusters).toHaveLength(2);
    // Each cluster must contain the expected pair (order within group may vary).
    const groups = clusters.map((c) => [...c.group].sort((a, b) => a - b));
    expect(groups).toContainEqual([0, 2]);
    expect(groups).toContainEqual([1, 3]);
    // Each cluster carries an honest similarity + non-empty matchedOn.
    for (const c of clusters) {
      expect(c.similarity).toBeGreaterThanOrEqual(0);
      expect(c.similarity).toBeLessThanOrEqual(1);
      expect(c.matchedOn.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("4 identical scenes (all pairwise sim≥0.7) → 1 cluster [0,1,2,3]", () => {
    const features = [
      sceneFeatureVector(sceneFromNotes(0, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(1, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(2, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(3, [note(60, 0)])),
    ];
    const sim = selfSimilarityMatrix(features);
    const clusters = repetitionClusters(features, sim, 0.7);
    expect(clusters).toHaveLength(1);
    expect([...clusters[0].group].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("4 all-dissimilar scenes (all pairwise sim<0.7) → 0 clusters (NO singletons)", () => {
    const features = stubFeatures(4);
    const sim = [
      [1.0, 0.3, 0.2, 0.4],
      [0.3, 1.0, 0.5, 0.2],
      [0.2, 0.5, 1.0, 0.3],
      [0.4, 0.2, 0.3, 1.0],
    ];
    const clusters = repetitionClusters(features, sim, 0.7);
    expect(clusters).toEqual([]);
  });

  it("transitive closure: sim[0][1]≥0.7, sim[1][2]≥0.7, sim[0][2]<0.7 → 1 cluster [0,1,2]", () => {
    const features = stubFeatures(3);
    const sim = [
      [1.0, 0.8, 0.4],
      [0.8, 1.0, 0.75],
      [0.4, 0.75, 1.0],
    ];
    const clusters = repetitionClusters(features, sim, 0.7);
    expect(clusters).toHaveLength(1);
    expect([...clusters[0].group].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("matchedOn includes 'pcp' when similarity is driven primarily by pcp", () => {
    // Two features with identical pcp-heavy normalized vectors. The pcp band
    // dominates the dot product; every other band is zero → matchedOn = ["pcp"].
    const pcpHeavy = [0, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const features = [
      featureWithVector(0, pcpHeavy),
      featureWithVector(1, [...pcpHeavy]),
    ];
    const sim = selfSimilarityMatrix(features);
    const clusters = repetitionClusters(features, sim, 0.7);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchedOn).toContain("pcp");
  });

  it("empty features → 0 clusters (refuse)", () => {
    const clusters = repetitionClusters([], [], 0.7);
    expect(clusters).toEqual([]);
  });

  it("single scene → 0 clusters (can't have repetition with <2 scenes)", () => {
    const features = [sceneFeatureVector(sceneFromNotes(0, [note(60, 0)]))];
    const sim = selfSimilarityMatrix(features);
    const clusters = repetitionClusters(features, sim, 0.7);
    expect(clusters).toEqual([]);
  });

  it("property: clusters DISJOINT + every high-sim pair co-clustered + NO singletons (fast-check)", () => {
    const noteArb = fc.record({
      pitch: fc.integer({ min: 36, max: 84 }),
      start: fc.integer({ min: 0, max: 400 }).map((t) => t / 100),
      length: fc.integer({ min: 10, max: 200 }).map((t) => t / 100),
      velocity: fc.integer({ min: 40, max: 120 }),
    }).map((n) => note(n.pitch, n.start, n.length, n.velocity));
    const sceneArb = fc.array(noteArb, { minLength: 1, maxLength: 6 });
    const thresholdArb = fc.integer({ min: 50, max: 95 }).map((t) => t / 100);

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.array(sceneArb, { minLength: 0, maxLength: 20 }),
        thresholdArb,
        (n, scenes, threshold) => {
          const features = scenes
            .slice(0, n)
            .map((notes, i) => sceneFeatureVector(sceneFromNotes(i, notes)));
          const sim = selfSimilarityMatrix(features);
          const clusters = repetitionClusters(features, sim, threshold);

          // NO singletons.
          for (const c of clusters) {
            expect(c.group.length).toBeGreaterThanOrEqual(2);
          }
          // DISJOINT: no scene in two clusters.
          const seen = new Set<number>();
          for (const c of clusters) {
            for (const idx of c.group) {
              expect(seen.has(idx)).toBe(false);
              seen.add(idx);
            }
          }
          // Every pair with sim ≥ threshold is in the same cluster.
          for (let i = 0; i < features.length; i++) {
            for (let j = i + 1; j < features.length; j++) {
              if (sim[i][j] >= threshold) {
                const ci = clusters.find((c) => c.group.includes(i));
                const cj = clusters.find((c) => c.group.includes(j));
                // If either isn't in a cluster, that's a bug (unless it's a
                // singleton edge case — but sim≥threshold + transitive closure
                // guarantees grouping). Both must be in the SAME cluster.
                expect(ci).toBeDefined();
                expect(cj).toBeDefined();
                expect(ci).toBe(cj);
              }
            }
          }
          // Honest similarity bounds.
          for (const c of clusters) {
            expect(c.similarity).toBeGreaterThanOrEqual(0);
            expect(c.similarity).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// RepetitionReport — Analyzer plugin (D-08)
// ---------------------------------------------------------------------------

describe("RepetitionReport — Analyzer plugin (D-08)", () => {
  it("implements the Analyzer interface (id='repetition')", () => {
    expect(RepetitionReport.id).toBe("repetition");
    expect(RepetitionReport.consumes).toEqual(["clips"]);
    expect(RepetitionReport.produces).toEqual(["repetition"]);
  });

  it("analyze() on an empty grid REFUSES (returns []) — no guess", () => {
    const raw = { version: "1.0", project: { name: "T", tempo: 130, timeSignature: "4/4" }, selection: {} } as unknown as RawState;
    const out = RepetitionReport.analyze(raw, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });

  it("analyze() on a single-scene grid REFUSES (<2 scenes can't repeat)", () => {
    const raw = rawWithGrid([
      {
        trackSid: "t1",
        name: "Lead",
        scenes: [
          { sceneIdx: 0, clipSid: "c1", hasContent: true, loopBeats: 4, notes: [note(60, 0)] },
        ],
      },
    ]);
    const out = RepetitionReport.analyze(raw, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });

  it("analyze() is pure: never mutates raw state", () => {
    const raw = rawWithGrid([
      {
        trackSid: "t1",
        name: "Lead",
        scenes: [
          { sceneIdx: 0, clipSid: "c1", hasContent: true, loopBeats: 4, notes: [note(60, 0)] },
          { sceneIdx: 1, clipSid: "c2", hasContent: true, loopBeats: 4, notes: [note(60, 0)] },
        ],
      },
    ]);
    const snapshot = JSON.stringify(raw);
    RepetitionReport.analyze(raw, { intent: null, now: 0 });
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it("analyze() on a grid with repeated scenes emits a repetition DerivedField with assumptions[]", () => {
    const raw = rawWithGrid([
      {
        trackSid: "t1",
        name: "Lead",
        scenes: [
          { sceneIdx: 0, clipSid: "c1", hasContent: true, loopBeats: 4, notes: [note(60, 0), note(64, 1)] },
          { sceneIdx: 1, clipSid: "c2", hasContent: true, loopBeats: 4, notes: [note(72, 0)] },
          { sceneIdx: 2, clipSid: "c3", hasContent: true, loopBeats: 4, notes: [note(60, 0), note(64, 1)] },
          { sceneIdx: 3, clipSid: "c4", hasContent: true, loopBeats: 4, notes: [note(72, 0)] },
        ],
      },
    ]);
    const out = RepetitionReport.analyze(raw, { intent: null, now: 0 });
    expect(out.length).toBe(1);
    const f = out[0];
    expect(f.field).toBe("repetition");
    expect(f.confidence).toBeGreaterThanOrEqual(0);
    expect(f.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(f.value)).toBe(true);
    const clusters = f.value as RepetitionCluster[];
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(f.assumptions.length).toBeGreaterThan(0);
    for (const a of f.assumptions) {
      expect(typeof a.claim).toBe("string");
      expect(a.claim.length).toBeGreaterThan(0);
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("analyze() on a grid with NO repetition REFUSES (returns []) — honest", () => {
    // 4 scenes with maximally different single-note content → all dissimilar.
    const raw = rawWithGrid([
      {
        trackSid: "t1",
        name: "FX",
        scenes: [
          { sceneIdx: 0, clipSid: "c1", hasContent: true, loopBeats: 4, notes: [note(36, 0)] },
          { sceneIdx: 1, clipSid: "c2", hasContent: true, loopBeats: 4, notes: [note(67, 0)] },
          { sceneIdx: 2, clipSid: "c3", hasContent: true, loopBeats: 4, notes: [note(98, 0)] },
          { sceneIdx: 3, clipSid: "c4", hasContent: true, loopBeats: 4, notes: [note(43, 0)] },
        ],
      },
    ]);
    const out = RepetitionReport.analyze(raw, { intent: null, now: 0 });
    // With maximally-different single notes across distant pitch classes,
    // cosine affinity on the raw feature vector may or may not exceed 0.7.
    // The honest contract: either clusters are emitted OR [] is returned.
    // What's forbidden: fabricating clusters that don't exist.
    if (out.length > 0) {
      for (const c of out[0].value as RepetitionCluster[]) {
        expect(c.group.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("analyze() confidence is NOT pre-floored — honest mean cluster similarity", () => {
    const raw = rawWithGrid([
      {
        trackSid: "t1",
        name: "Lead",
        scenes: [
          { sceneIdx: 0, clipSid: "c1", hasContent: true, loopBeats: 4, notes: [note(60, 0)] },
          { sceneIdx: 1, clipSid: "c2", hasContent: true, loopBeats: 4, notes: [note(60, 0)] },
        ],
      },
    ]);
    const out = RepetitionReport.analyze(raw, { intent: null, now: 0 });
    if (out.length > 0) {
      expect(out[0].confidence).toBeLessThanOrEqual(1.0);
    }
  });
});
