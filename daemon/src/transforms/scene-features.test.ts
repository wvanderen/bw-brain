// daemon/src/transforms/scene-features.test.ts
//
// P4 / 04-02 Task 1 — per-scene feature vector (D-04 input).
// INVARIANT: every field is FINITE for any non-empty column (no NaN — divide-by-zero
// guarded exactly like motif-signature.ts:80). Empty columns return `normalized: []`
// (the caller refuses upstream — emit honest confidence, never fabricate).
//
// Mirrors motif-signature.test.ts (pure-fn discipline) + fast-check property tests
// for the L2-normalization invariant.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sceneFeatureVector, type SceneColumn } from "./scene-features.js";
import type { Note } from "../cli/diff-logic.js";

/** Note builder mirroring diff-logic.test.ts helper. */
function note(pitch: number, start: number, length = 0.5, velocity = 100, key?: string): Note {
  return { key: key ?? `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** A column with one kick + one lead (the canonical two-track non-trivial case). */
function kickAndLeadColumn(): SceneColumn {
  return {
    sceneIdx: 0,
    cells: [
      {
        trackSid: "trk_kick",
        trackName: "Kick",
        hasContent: true,
        loopBeats: 16,
        notes: [note(36, 0.0, 0.25, 100), note(36, 4.0, 0.25, 100)], // C1 4-on-the-floor
      },
      {
        trackSid: "trk_lead",
        trackName: "Lead",
        hasContent: true,
        loopBeats: 16,
        notes: [note(72, 0.5, 0.5, 80), note(76, 1.0, 0.5, 80)], // C5 + E5
      },
      { trackSid: "trk_empty", trackName: "Empty", hasContent: false, loopBeats: 0, notes: [] },
    ],
  };
}

describe("sceneFeatureVector — concrete-shape sanity (D-04)", () => {
  it("non-empty column: every field is finite (no NaN, no Infinity)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(Number.isFinite(v.noteDensity)).toBe(true);
    expect(Number.isFinite(v.velocityAggregate)).toBe(true);
    expect(Number.isFinite(v.activeTrackCount)).toBe(true);
    expect(Number.isFinite(v.lengthBeats)).toBe(true);
    expect(Number.isFinite(v.pitchCentroid)).toBe(true);
    expect(Number.isFinite(v.polyphony)).toBe(true);
    for (const b of v.pcp) expect(Number.isFinite(b)).toBe(true);
  });

  it("non-empty column: noteDensity > 0 (real notes exist)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.noteDensity).toBeGreaterThan(0);
  });

  it("non-empty column: pcp is length 12", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.pcp).toHaveLength(12);
  });

  it("non-empty column: pcp[0] > 0 (C is present — kick C1 + lead C5)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.pcp[0]).toBeGreaterThan(0);
  });

  it("non-empty column: pcp[4] > 0 (E present — lead E5)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.pcp[4]).toBeGreaterThan(0);
  });

  it("non-empty column: pcp sums to ~1.0 (normalized)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    const sum = v.pcp.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("non-empty column: activeTrackCount = 2 (kick + lead; empty excluded)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.activeTrackCount).toBe(2);
  });

  it("non-empty column: lengthBeats = 16 (max loopBeats across active cells)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.lengthBeats).toBe(16);
  });

  it("non-empty column: pitchCentroid ∈ [36, 76] (between lowest C1=36 and highest E5=76)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.pitchCentroid).toBeGreaterThanOrEqual(36);
    expect(v.pitchCentroid).toBeLessThanOrEqual(76);
  });

  it("non-empty column: velocityAggregate ∈ (0, 1] (mean velocity / 127)", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.velocityAggregate).toBeGreaterThan(0);
    expect(v.velocityAggregate).toBeLessThanOrEqual(1);
  });

  it("non-empty column: polyphony ≥ 1", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.polyphony).toBeGreaterThanOrEqual(1);
  });

  it("non-empty column: normalized is non-empty + L2-unit-length", () => {
    const v = sceneFeatureVector(kickAndLeadColumn());
    expect(v.normalized.length).toBeGreaterThan(0);
    const mag = Math.sqrt(v.normalized.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1.0, 6);
  });

  it("determinism: same input → same output (byte-equal across calls)", () => {
    const a = sceneFeatureVector(kickAndLeadColumn());
    const b = sceneFeatureVector(kickAndLeadColumn());
    expect(a).toEqual(b);
  });
});

describe("sceneFeatureVector — empty / edge guards (no NaN, no crash)", () => {
  it("empty column (all hasContent=false) → normalized: [] (caller refuses upstream)", () => {
    const empty: SceneColumn = {
      sceneIdx: 0,
      cells: [{ trackSid: "t", trackName: "T", hasContent: false, loopBeats: 0, notes: [] }],
    };
    const v = sceneFeatureVector(empty);
    expect(v.normalized).toEqual([]);
    expect(v.activeTrackCount).toBe(0);
    expect(v.noteDensity).toBe(0);
    expect(Number.isFinite(v.noteDensity)).toBe(true);
  });

  it("column with no cells at all → normalized: [] (zero-division guarded)", () => {
    const v = sceneFeatureVector({ sceneIdx: 0, cells: [] });
    expect(v.normalized).toEqual([]);
    expect(Number.isFinite(v.noteDensity)).toBe(true);
  });

  it("active cell with zero notes → does not crash (edge case, NaN guard)", () => {
    const col: SceneColumn = {
      sceneIdx: 0,
      cells: [{ trackSid: "t", trackName: "T", hasContent: true, loopBeats: 4, notes: [] }],
    };
    const v = sceneFeatureVector(col);
    // hasContent=true but no notes — noteDensity=0; normalized should still be L2-unit-length.
    expect(v.activeTrackCount).toBe(1);
    expect(v.noteDensity).toBe(0);
    expect(Number.isFinite(v.noteDensity)).toBe(true);
  });
});

describe("sceneFeatureVector — fast-check properties (invariants)", () => {
  // A bounded-note generator that stays in MIDI range + reasonable beats.
  const noteArb = fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    start: fc.float({ min: 0, max: 32, noNaN: true }),
    length: fc.float({ min: 0.05, max: 4, noNaN: true }),
    velocity: fc.integer({ min: 1, max: 127 }),
  }).map((n) => note(n.pitch, Number(n.start.toFixed(4)), Number(n.length.toFixed(4)), n.velocity));

  const columnArb = fc.array(noteArb, { minLength: 1, maxLength: 12 }).map((notes) => ({
    sceneIdx: 0,
    cells: [
      { trackSid: "t", trackName: "T", hasContent: true, loopBeats: 16, notes },
    ],
  }));

  it("property: every scalar field is FINITE (no NaN/Infinity) for any non-empty column", () => {
    fc.assert(
      fc.property(columnArb, (col) => {
        const v = sceneFeatureVector(col);
        expect(Number.isFinite(v.noteDensity)).toBe(true);
        expect(Number.isFinite(v.velocityAggregate)).toBe(true);
        expect(Number.isFinite(v.lengthBeats)).toBe(true);
        expect(Number.isFinite(v.pitchCentroid)).toBe(true);
        expect(Number.isFinite(v.polyphony)).toBe(true);
        for (const b of v.pcp) expect(Number.isFinite(b)).toBe(true);
      }),
    );
  });

  it("property: pcp has length 12 + sums to ~1.0 for any non-empty column", () => {
    fc.assert(
      fc.property(columnArb, (col) => {
        const v = sceneFeatureVector(col);
        expect(v.pcp).toHaveLength(12);
        const sum = v.pcp.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      }),
    );
  });

  it("property: normalized is L2-unit-length for any non-empty column", () => {
    fc.assert(
      fc.property(columnArb, (col) => {
        const v = sceneFeatureVector(col);
        expect(v.normalized.length).toBeGreaterThan(0);
        const mag = Math.sqrt(v.normalized.reduce((s, x) => s + x * x, 0));
        expect(mag).toBeCloseTo(1.0, 5);
      }),
    );
  });
});
