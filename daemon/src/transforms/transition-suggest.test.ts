// daemon/src/transforms/transition-suggest.test.ts
//
// P4 / 04-05 Task 1 — unit tests for the pure advisory transition-suggest
// generator (ARRANGE-04 / D-10). D-10 invariant: outputs are ADVISORY
// observations — NO patchId, NO operations[], NO risk field (Pitfall 5).
//
// Mirrors the harmonic-detect.test.ts discipline: pure-function unit tests +
// the refuse-returns-empty contract (empty inputs → []).

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  suggestTransitions,
  type TransitionObservation,
} from "./transition-suggest.js";
import type { SectionSummary } from "./section-detector.js";
import type { RepetitionCluster } from "./repetition-report.js";
import type { EnergyPoint } from "./energy-curve.js";

const MODULE_PATH = dirname(fileURLToPath(import.meta.url));

/** Helper: build a SectionSummary with sensible defaults. */
function section(
  start: number,
  end: number,
  label: string,
  energy: number,
  confidence = 0.8,
): SectionSummary {
  return { startScene: start, endScene: end, label, energy, avgSimilarity: 0.7, confidence };
}

describe("suggestTransitions — D-10 advisory generator", () => {
  // -------------------------------------------------------------------------
  // Energy-drop detection
  // -------------------------------------------------------------------------

  it("emits an energy_drop observation when adjacent sections drop by > threshold", () => {
    const sections = [
      section(0, 3, "intro", 0.9),
      section(4, 7, "break", 0.3),
    ];
    const obs = suggestTransitions(sections, [], []);
    const drops = obs.filter((o) => o.kind === "energy_drop");
    expect(drops).toHaveLength(1);
    const d = drops[0];
    expect(d.from).toMatchObject({ scene: 0, label: "intro", energy: 0.9 });
    expect(d.to).toMatchObject({ scene: 4, label: "break", energy: 0.3 });
    expect(d.delta).toBeCloseTo(0.6, 5);
    expect(d.assumptions.length).toBeGreaterThan(0);
    expect(d.manualHint).toBeTruthy();
  });

  it("does NOT emit energy_drop when the delta is below the threshold", () => {
    const sections = [
      section(0, 3, "intro", 0.6),
      section(4, 7, "build", 0.5), // delta 0.1 < 0.4 threshold
    ];
    const obs = suggestTransitions(sections, [], []);
    expect(obs.filter((o) => o.kind === "energy_drop")).toHaveLength(0);
  });

  it("emits an energy_drop for a sharp rise too (|delta| > threshold)", () => {
    const sections = [
      section(0, 3, "break", 0.2),
      section(4, 7, "drop", 0.8), // delta = -0.6, |delta| > 0.4
    ];
    const obs = suggestTransitions(sections, [], []);
    expect(obs.filter((o) => o.kind === "energy_drop")).toHaveLength(1);
  });

  it("honors a custom energy-drop threshold via opts", () => {
    const sections = [
      section(0, 3, "a", 0.6),
      section(4, 7, "b", 0.45), // delta 0.15
    ];
    // Default threshold 0.4 → no drop; threshold 0.1 → drop.
    expect(suggestTransitions(sections, [], []).filter((o) => o.kind === "energy_drop")).toHaveLength(0);
    expect(
      suggestTransitions(sections, [], [], { energyDropThreshold: 0.1 }).filter(
        (o) => o.kind === "energy_drop",
      ),
    ).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Repetition-gap detection
  // -------------------------------------------------------------------------

  it("emits a repetition_gap for a scene not in any repetition cluster", () => {
    const sections = [section(0, 3, "intro", 0.5), section(4, 7, "drop", 0.9)];
    const repetition: RepetitionCluster[] = [
      { group: [0, 4], similarity: 0.9, matchedOn: ["density"] },
    ];
    // Scene 5 is within a labeled section (4..7) and NOT in the cluster.
    const obs = suggestTransitions(sections, [], repetition, {
      sceneCount: 8,
      repetitionThreshold: 0.7,
    });
    const gaps = obs.filter((o) => o.kind === "repetition_gap");
    expect(gaps.length).toBeGreaterThan(0);
    const g = gaps[0];
    expect(typeof g.scene).toBe("number");
    expect(g.assumptions.length).toBeGreaterThan(0);
    // The assumption surfaces the repetition threshold (Pitfall 8 — snap-stale defense).
    expect(g.assumptions.some((a) => /threshold/i.test(a.claim))).toBe(true);
    expect(g.manualHint).toBeTruthy();
  });

  it("does NOT emit repetition_gap when every scene is in a cluster", () => {
    const sections = [section(0, 1, "a", 0.5)];
    const repetition: RepetitionCluster[] = [
      { group: [0, 1], similarity: 0.95, matchedOn: ["density"] },
    ];
    const obs = suggestTransitions(sections, [], repetition, { sceneCount: 2 });
    expect(obs.filter((o) => o.kind === "repetition_gap")).toHaveLength(0);
  });

  it("caps repetition_gap emissions at the top 3 most isolated scenes", () => {
    // 10 scenes, none in a cluster, all within one big section.
    const sections = [section(0, 9, "all", 0.5)];
    const obs = suggestTransitions(sections, [], [], { sceneCount: 10 });
    expect(obs.filter((o) => o.kind === "repetition_gap").length).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Empty / refuse cases
  // -------------------------------------------------------------------------

  it("returns [] for empty sections + energy + repetition", () => {
    expect(suggestTransitions([], [], [])).toEqual([]);
  });

  it("returns [] for a single section (no adjacent pair to compare)", () => {
    expect(suggestTransitions([section(0, 3, "solo", 0.9)], [], [])).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // D-10 invariant — NO patch fields (Pitfall 5)
  // -------------------------------------------------------------------------

  it("output objects carry NO patchId / operations / risk keys (D-10 advisory-only)", () => {
    const sections = [
      section(0, 3, "intro", 0.9),
      section(4, 7, "break", 0.3),
    ];
    const obs = suggestTransitions(sections, [], [], { sceneCount: 8, repetitionThreshold: 0.7 });
    for (const o of obs) {
      expect(o).not.toHaveProperty("patchId");
      expect(o).not.toHaveProperty("operations");
      expect(o).not.toHaveProperty("risk");
    }
  });

  it("module source does NOT import from ../patch/* (Pitfall 5 warning sign)", async () => {
    const src = await readFile(join(MODULE_PATH, "transition-suggest.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']\.\.\/patch\//);
    expect(src).not.toMatch(/patchId/);
    expect(src).not.toMatch(/applyPatch/);
  });

  // -------------------------------------------------------------------------
  // Assumptions[] discipline (UX-06)
  // -------------------------------------------------------------------------

  it("every observation carries a non-empty assumptions[] array", () => {
    const sections = [
      section(0, 3, "intro", 0.9),
      section(4, 7, "break", 0.3),
    ];
    const obs = suggestTransitions(sections, [], [], { sceneCount: 8 });
    expect(obs.length).toBeGreaterThan(0);
    for (const o of obs) {
      expect(o.assumptions.length).toBeGreaterThan(0);
    }
  });
});
