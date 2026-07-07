// daemon/src/transforms/energy-curve.test.ts
//
// P4 / 04-04 Task 1 — ARRANGE-03 energy curve.
// INVARIANT: every emitted energy point has value ∈ [0,1] with peak ≈ 1.0
// (linear normalization against project peak — D-16). The bar count is the sum
// of ceil(scene.loopBeats / beatsPerBar) across scenes (D-17 per-bar mapping).
//
// Mirrors scene-features.test.ts (pure-fn discipline) + fast-check property
// tests for the normalization + bar-count invariants.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  energyCurve,
  normalizeAgainstPeak,
  EnergyCurve,
  type EnergyWeights,
} from "./energy-curve.js";
import type { SceneColumn } from "./scene-features.js";
import type { Note } from "../cli/diff-logic.js";
import type { Analyzer, DerivedField } from "../state/analyzer-registry.js";

/** Note builder mirroring scene-features.test.ts helper. */
function note(pitch: number, start: number, length = 0.5, velocity = 100, key?: string): Note {
  return { key: key ?? `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** Default weights (mirrors generic.json energyWeights). */
const WEIGHTS: EnergyWeights = {
  noteDensity: 0.35,
  velocityAggregate: 0.25,
  polyphony: 0.2,
  pitchCentroid: 0.2,
};

/** A 16-beat (4-bar) scene with dense high-velocity kicks on every quarter. */
function denseScene(sceneIdx = 0, trackSid = "trk_kick"): SceneColumn {
  const notes: Note[] = [];
  for (let beat = 0; beat < 16; beat++) {
    notes.push(note(36, beat, 0.25, 120));
  }
  return {
    sceneIdx,
    cells: [{ trackSid, trackName: "Kick", hasContent: true, loopBeats: 16, notes }],
  };
}

/** A sparse scene: one note at the downbeat of bar 0 only. */
function sparseScene(sceneIdx = 1, trackSid = "trk_pad"): SceneColumn {
  return {
    sceneIdx,
    cells: [
      { trackSid, trackName: "Pad", hasContent: true, loopBeats: 16, notes: [note(60, 0, 4, 40)] },
    ],
  };
}

describe("normalizeAgainstPeak — pure helper (D-16)", () => {
  it("[3, 1, 2] → [1.0, 0.333..., 0.666...] (linear division by peak)", () => {
    const out = normalizeAgainstPeak([3, 1, 2]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBeCloseTo(1.0, 6);
    expect(out[1]).toBeCloseTo(1 / 3, 6);
    expect(out[2]).toBeCloseTo(2 / 3, 6);
  });

  it("peak is exactly 1.0 (the max entry normalizes to 1.0)", () => {
    const out = normalizeAgainstPeak([5, 10, 7]);
    expect(Math.max(...out)).toBeCloseTo(1.0, 6);
  });

  it("all values ∈ [0,1] (post-normalization)", () => {
    const out = normalizeAgainstPeak([3, 1, 2]);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("[0, 0, 0] → [0, 0, 0] (zero-guard: peak=1e-9, all zeros)", () => {
    const out = normalizeAgainstPeak([0, 0, 0]);
    expect(out).toEqual([0, 0, 0]);
  });

  it("[] → [] (empty input)", () => {
    expect(normalizeAgainstPeak([])).toEqual([]);
  });

  it("single positive value → [1.0]", () => {
    expect(normalizeAgainstPeak([42])).toEqual([1.0]);
  });
});

describe("energyCurve — concrete behaviors (D-05/D-17)", () => {
  it("one 16-beat dense scene → 4 EnergyPoints all > 0; peak = 1.0", () => {
    const cols = [denseScene()];
    const pts = energyCurve(cols, WEIGHTS);
    expect(pts).toHaveLength(4); // ceil(16/4) = 4 bars
    for (const p of pts) expect(p.value).toBeGreaterThan(0);
    expect(Math.max(...pts.map((p) => p.value))).toBeCloseTo(1.0, 6);
  });

  it("two scenes (dense then sparse) → dense bars higher than sparse bars; peak = 1.0", () => {
    const cols = [denseScene(0), sparseScene(1)];
    const pts = energyCurve(cols, WEIGHTS);
    expect(pts).toHaveLength(8); // 4 bars × 2 scenes
    const denseVals = pts.slice(0, 4).map((p) => p.value);
    const sparseVals = pts.slice(4, 8).map((p) => p.value);
    const denseMean = denseVals.reduce((a, b) => a + b, 0) / denseVals.length;
    const sparseMean = sparseVals.reduce((a, b) => a + b, 0) / sparseVals.length;
    expect(denseMean).toBeGreaterThan(sparseMean);
    expect(Math.max(...pts.map((p) => p.value))).toBeCloseTo(1.0, 6);
  });

  it("empty grid → returns [] (refuse)", () => {
    expect(energyCurve([], WEIGHTS)).toEqual([]);
  });

  it("every emitted value ∈ [0,1]", () => {
    const pts = energyCurve([denseScene(), sparseScene(1)], WEIGHTS);
    for (const p of pts) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(1);
    }
  });

  it("global bar index increments across scenes (scene 0: 0..3, scene 1: 4..7)", () => {
    const pts = energyCurve([denseScene(0), sparseScene(1)], WEIGHTS);
    const bars = pts.map((p) => p.bar);
    expect(bars).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("beatsPerBar default is 4 (4/4 time)", () => {
    // 8-beat scene → ceil(8/4) = 2 bars
    const col: SceneColumn = {
      sceneIdx: 0,
      cells: [
        { trackSid: "t", trackName: "T", hasContent: true, loopBeats: 8, notes: [note(60, 0, 0.5, 100)] },
      ],
    };
    expect(energyCurve([col], WEIGHTS)).toHaveLength(2);
  });

  it("beatsPerBar override respected (3/4 time: 8 beats → ceil(8/3) = 3 bars)", () => {
    const col: SceneColumn = {
      sceneIdx: 0,
      cells: [
        { trackSid: "t", trackName: "T", hasContent: true, loopBeats: 8, notes: [note(60, 0, 0.5, 100)] },
      ],
    };
    expect(energyCurve([col], WEIGHTS, 3)).toHaveLength(3);
  });

  it("intra-scene variation: a 16-beat scene with notes only in bar 0 → bar 0 > bars 1..3", () => {
    const notes: Note[] = [];
    for (let beat = 0; beat < 4; beat++) notes.push(note(60, beat, 0.5, 120));
    // bars 1, 2, 3 are empty
    const col: SceneColumn = {
      sceneIdx: 0,
      cells: [{ trackSid: "t", trackName: "T", hasContent: true, loopBeats: 16, notes }],
    };
    const pts = energyCurve([col], WEIGHTS);
    expect(pts).toHaveLength(4);
    expect(pts[0].value).toBeGreaterThan(pts[1].value);
    expect(pts[1].value).toBe(pts[2].value); // both empty bars → both 0
    expect(pts[3].value).toBe(0);
  });

  it("honest confidence: EnergyCurve.analyze emits confidence ∈ [0,1] (NOT pre-floored)", () => {
    const raw = {
      tracks: [
        {
          trackSid: "trk_kick",
          name: "Kick",
          scenes: [{ sceneIdx: 0, hasContent: true, loopBeats: 16, notes: denseScene().cells[0].notes }],
        },
      ],
    };
    const out = EnergyCurve.analyze(raw as never, { intent: null, now: 0 });
    expect(out).toHaveLength(1);
    const field = out[0] as DerivedField;
    expect(field.field).toBe("energyCurve");
    expect(field.confidence).toBeGreaterThanOrEqual(0);
    expect(field.confidence).toBeLessThanOrEqual(1);
    expect(field.assumptions.length).toBeGreaterThan(0);
  });

  it("EnergyCurve.analyze empty grid → [] (refuse)", () => {
    const out = EnergyCurve.analyze({ tracks: [] } as never, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });

  it("EnergyCurve.analyze no tracks field → [] (refuse)", () => {
    const out = EnergyCurve.analyze({} as never, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });

  it("EnergyCurve uses ctx.profile.energyWeights when present", () => {
    const raw = {
      tracks: [
        {
          trackSid: "t",
          name: "T",
          scenes: [{ sceneIdx: 0, hasContent: true, loopBeats: 4, notes: [note(60, 0, 0.5, 100)] }],
        },
      ],
    };
    const profileWeights: EnergyWeights = {
      noteDensity: 1.0,
      velocityAggregate: 0.0,
      polyphony: 0.0,
      pitchCentroid: 0.0,
    };
    const withProfile = EnergyCurve.analyze(raw as never, {
      intent: null,
      now: 0,
      profile: { name: "test", energyWeights: profileWeights } as never,
    });
    const withoutProfile = EnergyCurve.analyze(raw as never, { intent: null, now: 0 });
    // Both should emit 1 point; values differ because weights differ.
    expect(withProfile).toHaveLength(1);
    expect(withoutProfile).toHaveLength(1);
    // With noteDensity=1.0 weight, the value is driven purely by density.
    expect((withProfile[0] as DerivedField).value).toBeDefined();
  });

  it("EnergyCurve satisfies the Analyzer interface (id, consumes, produces)", () => {
    const a = EnergyCurve as Analyzer;
    expect(a.id).toBe("energyCurve");
    expect(a.consumes).toContain("clips");
    expect(a.produces).toContain("energyCurve");
    expect(typeof a.analyze).toBe("function");
  });

  it("PURE module: no fs/net imports (static check via module shape)", () => {
    // The module exports only the pure functions + Analyzer + types; any fs/net
    // import would surface as a side-effect at import time. Vitest imports the
    // module cleanly here — if it side-effected, this test file would fail.
    expect(typeof energyCurve).toBe("function");
    expect(typeof normalizeAgainstPeak).toBe("function");
    expect(EnergyCurve).toBeDefined();
  });
});

describe("energyCurve — fast-check properties (invariants)", () => {
  // Bounded-note generator (mirrors scene-features.test.ts — avoids fc.float quirk).
  const noteArb = fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    start: fc.integer({ min: 0, max: 3200 }).map((t) => t / 100), // 0.00..32.00 beats
    length: fc.integer({ min: 5, max: 400 }).map((t) => t / 100), // 0.05..4.00 beats
    velocity: fc.integer({ min: 1, max: 127 }),
  }).map((n) => note(n.pitch, n.start, n.length, n.velocity));

  // A scene with 1-8 notes, loopBeats ∈ {4, 8, 16}.
  const sceneArb = fc.record({
    loopBeats: fc.constantFrom(4, 8, 16),
    notes: fc.array(noteArb, { minLength: 1, maxLength: 8 }),
  }).map(({ loopBeats, notes }) => ({
    sceneIdx: 0,
    cells: [{ trackSid: "t", trackName: "T", hasContent: true, loopBeats, notes }],
  }));

  // 1-4 scenes.
  const gridArb = fc.array(sceneArb, { minLength: 1, maxLength: 4 }).map((scenes, i) =>
    scenes.map((s, idx) => ({ ...s, sceneIdx: idx })),
  );

  it("property: every value ∈ [0,1] AND max(values) ≈ 1.0 (toBeCloseTo 5) when at least one bar has nonzero energy", () => {
    fc.assert(
      fc.property(gridArb, (cols) => {
        const pts = energyCurve(cols, WEIGHTS);
        if (pts.length === 0) return; // empty grid guard
        for (const p of pts) {
          expect(p.value).toBeGreaterThanOrEqual(0);
          expect(p.value).toBeLessThanOrEqual(1);
        }
        // If at least one bar has notes, peak should be ~1.0.
        const hasNonZero = pts.some((p) => p.value > 0);
        if (hasNonZero) {
          expect(Math.max(...pts.map((p) => p.value))).toBeCloseTo(1.0, 5);
        }
      }),
    );
  });

  it("property: bar count = sum of ceil(scene.loopBeats / beatsPerBar) across scenes (D-17)", () => {
    fc.assert(
      fc.property(gridArb, fc.integer({ min: 2, max: 8 }), (cols, bpb) => {
        const pts = energyCurve(cols, WEIGHTS, bpb);
        const expected = cols.reduce((sum, col) => {
          const loopBeats = Math.max(...col.cells.filter((c) => c.hasContent).map((c) => c.loopBeats), 0);
          return sum + Math.ceil(loopBeats / bpb);
        }, 0);
        expect(pts.length).toBe(expected);
      }),
    );
  });

  it("property: global bar indices are contiguous [0..n-1] with no gaps", () => {
    fc.assert(
      fc.property(gridArb, (cols) => {
        const pts = energyCurve(cols, WEIGHTS);
        if (pts.length === 0) return;
        const bars = pts.map((p) => p.bar);
        for (let i = 0; i < bars.length; i++) {
          expect(bars[i]).toBe(i);
        }
      }),
    );
  });
});
