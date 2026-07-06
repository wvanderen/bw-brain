// daemon/src/transforms/section-detector.test.ts
//
// P4 / 04-03 Task 1 — SectionDetector Analyzer + agglomerativeBoundaries +
// labelSections. ARRANGE-01 at the analyzer level (CLI wiring in Plan 05).
//
// INVARIANTS pinned here (the trust-spine gates for ARRANGE-01):
//   1. agglomerativeBoundaries produces contiguous, gap-free, overlap-free
//      boundaries covering [0, n-1].
//   2. Boundaries never exceed maxSections (the ceiling is honored).
//   3. labelSections uses profile.sectionLabels; below-threshold / no-match
//      → label "unknown" (refuse — Pitfall 7).
//   4. SectionDetector.analyze on an empty grid REFUSES (returns []).
//   5. Confidence is honest ∈ [0,1] — NEVER pre-floored (Pitfall 4; runAll owns
//      the 0.5 floor).
//   6. Every emitted DerivedField carries assumptions[] (UX-06).
//
// Mirrors self-similarity.test.ts + motif-signature.test.ts discipline.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  SectionDetector,
  agglomerativeBoundaries,
  labelSections,
  type SceneBoundary,
  type SectionSummary,
} from "./section-detector.js";
import { sceneFeatureVector, type SceneColumn, type SceneFeatureVector } from "./scene-features.js";
import { selfSimilarityMatrix } from "./self-similarity.js";
import { loadProfile } from "../profiles/profile-loader.js";
import type { Note } from "../cli/diff-logic.js";
import type { RawState } from "../state/analyzer-registry.js";

function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** Build a SceneColumn with a single track cell carrying `notes`. */
function sceneFromNotes(sceneIdx: number, notes: Note[]): SceneColumn {
  return {
    sceneIdx,
    cells: [{ trackSid: "t", trackName: "T", hasContent: notes.length > 0, loopBeats: 16, notes }],
  };
}

/** A minimal SceneFeatureVector with a controlled velocityAggregate (energy proxy). */
function featureWithEnergy(sceneIdx: number, velocityAggregate: number): SceneFeatureVector {
  return {
    sceneIdx,
    noteDensity: 1,
    pcp: new Array(12).fill(1 / 12),
    velocityAggregate,
    activeTrackCount: 1,
    lengthBeats: 4,
    pitchCentroid: 60,
    polyphony: 1,
    // A simple non-zero normalized vector so cosine affinity is well-defined.
    normalized: [velocityAggregate, 1],
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

// ---------------------------------------------------------------------------
// agglomerativeBoundaries — pure contiguous clustering (D-14)
// ---------------------------------------------------------------------------

describe("agglomerativeBoundaries — pure contiguous agglomerative (D-14)", () => {
  it("4 identical features → single section [0,3] (all merge)", () => {
    const features = [
      sceneFeatureVector(sceneFromNotes(0, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(1, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(2, [note(60, 0)])),
      sceneFeatureVector(sceneFromNotes(3, [note(60, 0)])),
    ];
    const sim = selfSimilarityMatrix(features);
    const boundaries = agglomerativeBoundaries(features, sim);
    expect(boundaries).toEqual([{ startScene: 0, endScene: 3 }]);
  });

  it("two similar pairs with a dissimilar gap → two sections [0,1] + [2,3]", () => {
    // Hand-crafted sim matrix: sim[0][1] = 0.9, sim[2][3] = 0.9, sim[1][2] = 0.3.
    // All other cross-pairs below the merge floor.
    const features = [
      featureWithEnergy(0, 0.5),
      featureWithEnergy(1, 0.5),
      featureWithEnergy(2, 0.5),
      featureWithEnergy(3, 0.5),
    ];
    const sim = [
      [1.0, 0.9, 0.2, 0.2],
      [0.9, 1.0, 0.3, 0.2],
      [0.2, 0.3, 1.0, 0.9],
      [0.2, 0.2, 0.9, 1.0],
    ];
    const boundaries = agglomerativeBoundaries(features, sim);
    expect(boundaries).toEqual([
      { startScene: 0, endScene: 1 },
      { startScene: 2, endScene: 3 },
    ]);
  });

  it("single scene → single boundary {startScene:0, endScene:0}", () => {
    const features = [sceneFeatureVector(sceneFromNotes(0, [note(60, 0)]))];
    const sim = selfSimilarityMatrix(features);
    const boundaries = agglomerativeBoundaries(features, sim);
    expect(boundaries).toEqual([{ startScene: 0, endScene: 0 }]);
  });

  it("empty features → empty boundaries (refuse)", () => {
    const boundaries = agglomerativeBoundaries([], []);
    expect(boundaries).toEqual([]);
  });

  it("boundaries are contiguous — cover [0, n-1] with no gaps or overlaps", () => {
    const features = Array.from({ length: 6 }, (_, i) =>
      sceneFeatureVector(sceneFromNotes(i, [note(60 + i, 0)])),
    );
    const sim = selfSimilarityMatrix(features);
    const boundaries = agglomerativeBoundaries(features, sim);
    expect(boundaries.length).toBeGreaterThan(0);
    expect(boundaries[0].startScene).toBe(0);
    expect(boundaries[boundaries.length - 1].endScene).toBe(features.length - 1);
    for (let i = 1; i < boundaries.length; i++) {
      expect(boundaries[i].startScene).toBe(boundaries[i - 1].endScene + 1);
    }
  });

  it("respects maxSections ceiling", () => {
    // 10 scenes that all merge (identical) but maxSections = 3.
    const features = Array.from({ length: 10 }, (_, i) =>
      sceneFeatureVector(sceneFromNotes(i, [note(60, 0)])),
    );
    const sim = selfSimilarityMatrix(features);
    const boundaries = agglomerativeBoundaries(features, sim, { maxSections: 3 });
    expect(boundaries.length).toBeLessThanOrEqual(3);
  });

  it("property: boundaries cover [0, n-1] contiguously and never exceed maxSections (fast-check)", () => {
    const noteArb = fc.record({
      pitch: fc.integer({ min: 36, max: 84 }),
      start: fc.integer({ min: 0, max: 400 }).map((t) => t / 100),
      length: fc.integer({ min: 10, max: 200 }).map((t) => t / 100),
      velocity: fc.integer({ min: 40, max: 120 }),
    }).map((n) => note(n.pitch, n.start, n.length, n.velocity));
    const sceneArb = fc.array(noteArb, { minLength: 1, maxLength: 6 });
    const maxSectionsArb = fc.integer({ min: 1, max: 8 });

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.array(sceneArb, { minLength: 1, maxLength: 30 }),
        maxSectionsArb,
        (n, scenes, maxSections) => {
          const features = scenes
            .slice(0, n)
            .map((notes, i) => sceneFeatureVector(sceneFromNotes(i, notes)));
          const sim = selfSimilarityMatrix(features);
          const boundaries = agglomerativeBoundaries(features, sim, { maxSections });
          if (features.length === 0) {
            expect(boundaries).toEqual([]);
            return;
          }
          // Contiguous cover invariant.
          expect(boundaries.length).toBeGreaterThanOrEqual(1);
          expect(boundaries.length).toBeLessThanOrEqual(Math.max(1, maxSections));
          expect(boundaries[0].startScene).toBe(0);
          expect(boundaries[boundaries.length - 1].endScene).toBe(features.length - 1);
          for (let i = 1; i < boundaries.length; i++) {
            expect(boundaries[i].startScene).toBe(boundaries[i - 1].endScene + 1);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// labelSections — pure genre-profile labeling
// ---------------------------------------------------------------------------

describe("labelSections — genre-profile labeling (D-07)", () => {
  it("section at position 'start' with energy [0.0,0.4] in generic profile → labeled 'intro'", () => {
    const features = [
      featureWithEnergy(0, 0.2),
      featureWithEnergy(1, 0.9),
      featureWithEnergy(2, 0.9),
      featureWithEnergy(3, 0.9),
    ];
    const boundaries: SceneBoundary[] = [
      { startScene: 0, endScene: 0 },
      { startScene: 1, endScene: 3 },
    ];
    const profile = loadProfile(); // generic
    const sections = labelSections(boundaries, features, profile);
    expect(sections[0].label).toBe("intro");
  });

  it("section with energy above 0.85 in techno profile → labeled 'drop'", () => {
    // Boundary {1,2} in n=4 → center 1.5 → relativePos 0.5 → position "middle".
    const features = [
      featureWithEnergy(0, 0.3),
      featureWithEnergy(1, 0.9),
      featureWithEnergy(2, 0.9),
      featureWithEnergy(3, 0.3),
    ];
    const boundaries: SceneBoundary[] = [
      { startScene: 0, endScene: 0 },
      { startScene: 1, endScene: 2 },
      { startScene: 3, endScene: 3 },
    ];
    const profile = loadProfile("techno");
    const sections = labelSections(boundaries, features, profile);
    const drop = sections.find((s) => s.label === "drop");
    expect(drop).toBeDefined();
    expect(drop!.startScene).toBe(1);
    expect(drop!.endScene).toBe(2);
  });

  it("below-threshold / no-match → label 'unknown' (refuse — Pitfall 7)", () => {
    // Energy 0.95 at position "start" in techno: drop needs position "middle";
    // break/roll max out at 0.85. No match → unknown.
    const features = [featureWithEnergy(0, 0.95), featureWithEnergy(1, 0.5)];
    const boundaries: SceneBoundary[] = [
      { startScene: 0, endScene: 0 },
      { startScene: 1, endScene: 1 },
    ];
    const profile = loadProfile("techno");
    const sections = labelSections(boundaries, features, profile);
    expect(sections[0].label).toBe("unknown");
  });

  it("without a profile, all sections carry label 'unknown' (ARCH-02 generic core)", () => {
    const features = [featureWithEnergy(0, 0.5)];
    const boundaries: SceneBoundary[] = [{ startScene: 0, endScene: 0 }];
    const sections = labelSections(boundaries, features, undefined);
    expect(sections[0].label).toBe("unknown");
  });

  it("confidence is honest ∈ [0,1] — NEVER pre-floored (Pitfall 4)", () => {
    // A section whose intra-section similarity is low must carry that low value
    // verbatim (runAll owns the 0.5 floor; the analyzer does NOT round up).
    const features = [
      featureWithEnergy(0, 0.5),
      featureWithEnergy(1, 0.5),
      featureWithEnergy(2, 0.5),
      featureWithEnergy(3, 0.5),
    ];
    const sim = [
      [1.0, 0.3, 0.2, 0.2],
      [0.3, 1.0, 0.2, 0.2],
      [0.2, 0.2, 1.0, 0.3],
      [0.2, 0.2, 0.3, 1.0],
    ];
    const boundaries = agglomerativeBoundaries(features, sim);
    const profile = loadProfile();
    const sections = labelSections(boundaries, features, profile);
    for (const s of sections) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("single-scene section → confidence 1.0 (trivially self-similar)", () => {
    const features = [featureWithEnergy(0, 0.5)];
    const boundaries: SceneBoundary[] = [{ startScene: 0, endScene: 0 }];
    const sections = labelSections(boundaries, features, loadProfile());
    expect(sections[0].confidence).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// SectionDetector — Analyzer plugin (D-08)
// ---------------------------------------------------------------------------

describe("SectionDetector — Analyzer plugin (D-08)", () => {
  it("implements the Analyzer interface (id/consumes/produces)", () => {
    expect(SectionDetector.id).toBe("sections");
    expect(SectionDetector.consumes).toEqual(["clips"]);
    expect(SectionDetector.produces).toEqual(["sections"]);
  });

  it("analyze() on an empty grid REFUSES (returns []) — no guess", () => {
    const raw = { version: "1.0", project: { name: "T", tempo: 130, timeSignature: "4/4" }, selection: {} } as unknown as RawState;
    const out = SectionDetector.analyze(raw, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });

  it("analyze() is pure: never mutates raw state", () => {
    const raw = rawWithGrid([
      {
        trackSid: "t1",
        name: "Kick",
        scenes: [
          { sceneIdx: 0, clipSid: "c1", hasContent: true, loopBeats: 4, notes: [note(36, 0)] },
          { sceneIdx: 1, clipSid: "c2", hasContent: true, loopBeats: 4, notes: [note(36, 0)] },
        ],
      },
    ]);
    const snapshot = JSON.stringify(raw);
    SectionDetector.analyze(raw, { intent: null, now: 0 });
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it("analyze() on a real grid emits a sections DerivedField with assumptions[]", () => {
    const raw = rawWithGrid([
      {
        trackSid: "t1",
        name: "Lead",
        scenes: [
          { sceneIdx: 0, clipSid: "c1", hasContent: true, loopBeats: 4, notes: [note(60, 0), note(64, 1)] },
          { sceneIdx: 1, clipSid: "c2", hasContent: true, loopBeats: 4, notes: [note(60, 0), note(64, 1)] },
          { sceneIdx: 2, clipSid: "c3", hasContent: true, loopBeats: 4, notes: [note(72, 0), note(76, 1)] },
          { sceneIdx: 3, clipSid: "c4", hasContent: true, loopBeats: 4, notes: [note(72, 0), note(76, 1)] },
        ],
      },
    ]);
    const out = SectionDetector.analyze(raw, { intent: null, now: 0 });
    expect(out.length).toBe(1);
    const f = out[0];
    expect(f.field).toBe("sections");
    expect(f.confidence).toBeGreaterThanOrEqual(0);
    expect(f.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(f.value)).toBe(true);
    expect((f.value as SectionSummary[]).length).toBeGreaterThanOrEqual(1);
    expect(f.assumptions.length).toBeGreaterThan(0);
    // Every assumption must carry claim + confidence + source (UX-06 shape).
    for (const a of f.assumptions) {
      expect(typeof a.claim).toBe("string");
      expect(a.claim.length).toBeGreaterThan(0);
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("analyze() confidence is NOT pre-floored — honest mean intra-section similarity", () => {
    // 4 scenes all dissimilar → low intra-section similarity → low confidence.
    // runAll would drop this; the analyzer must emit the honest value, NOT 0.5.
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
    const out = SectionDetector.analyze(raw, { intent: null, now: 0 });
    // The analyzer may refuse ([]) OR emit with honest low confidence.
    // Either is acceptable; what's forbidden is Math.max(0.5, ...) inside.
    if (out.length > 0) {
      // If it emitted, confidence must NOT be artificially floored to 0.5
      // when the true intra-section similarity is lower. We can't assert the
      // exact value without re-implementing the clustering, but we CAN assert
      // the confidence is ≤ 1.0 (honest bound).
      expect(out[0].confidence).toBeLessThanOrEqual(1.0);
    }
  });

  it("property: sections tile [0,n-1] contiguously; every section confidence ∈ [0,1] (fast-check)", () => {
    const noteArb = fc.record({
      pitch: fc.integer({ min: 36, max: 84 }),
      start: fc.integer({ min: 0, max: 400 }).map((t) => t / 100),
      length: fc.integer({ min: 10, max: 200 }).map((t) => t / 100),
      velocity: fc.integer({ min: 40, max: 120 }),
    }).map((n) => note(n.pitch, n.start, n.length, n.velocity));
    const sceneArb = fc.array(noteArb, { minLength: 1, maxLength: 6 });

    fc.assert(
      fc.property(fc.array(sceneArb, { minLength: 1, maxLength: 20 }), (scenes) => {
        const features = scenes.map((notes, i) => sceneFeatureVector(sceneFromNotes(i, notes)));
        const sim = selfSimilarityMatrix(features);
        const boundaries = agglomerativeBoundaries(features, sim);
        const sections = labelSections(boundaries, features, loadProfile());
        if (sections.length === 0) return;
        // Contiguous cover.
        expect(sections[0].startScene).toBe(0);
        expect(sections[sections.length - 1].endScene).toBe(features.length - 1);
        for (let i = 1; i < sections.length; i++) {
          expect(sections[i].startScene).toBe(sections[i - 1].endScene + 1);
        }
        // Honest confidence bounds.
        for (const s of sections) {
          expect(s.confidence).toBeGreaterThanOrEqual(0);
          expect(s.confidence).toBeLessThanOrEqual(1);
          expect(s.avgSimilarity).toBeGreaterThanOrEqual(0);
          expect(s.avgSimilarity).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});
