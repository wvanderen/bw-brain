// daemon/src/transforms/arrangement-review-render.test.ts
//
// 04.3 / 04.3-02 Task 1 — tests for the CLAP-native arrangement review render
// module (RB-03 / RB-05 / UX-03 daemon half). The module adapts the
// pi-pack /review SKILL.md step-3 text-block layout into bounded
// conversation.chunk texts (≤512 each, frozen ConversationChunk contract).
//
// Invariants under test (mirrors the plan behavior list + T-04.3-06/T-04-16):
//   - group order State → Timeline → Energy sparkline → Repetition clusters →
//     Transition observations (ADVISORY), one char per scene sparkline
//   - every chunk ≤512; oversized groups split at LINE boundaries (no
//     mid-word split unless a single line exceeds 512)
//   - every group's assumptions line carries pulledAt; null pulledAt renders
//     an explicit no-snapshot honesty marker (never a fabricated timestamp)
//   - empty dimensions render explicit honest placeholders
//   - determinism + the advisory structural guarantee (NO patch tokens in
//     stringified inputs/outputs) + purity (no fs/net/sessions/pi/patch/peers
//     imports)

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SectionSummary } from "./section-detector.js";
import type { EnergyPoint } from "./energy-curve.js";
import type { RepetitionCluster } from "./repetition-report.js";
import type { TransitionObservation } from "./transition-suggest.js";
import {
  MAX_CHUNK_CHARS,
  renderArrangementReview,
  renderArrangementReviewHint,
  type ArrangementReviewRenderInput,
} from "./arrangement-review-render.js";

const MODULE_PATH = dirname(fileURLToPath(import.meta.url));
const PULLED_AT = "2026-08-21T10:00:00.000Z";

const section = (startScene: number, endScene: number, label: string, energy: number): SectionSummary =>
  ({ startScene, endScene, label, avgSimilarity: 0.8, energy, confidence: 0.9 });

const dropObservation: TransitionObservation = {
  kind: "energy_drop",
  from: { scene: 2, label: "drop", energy: 0.9 },
  to: { scene: 0, label: "intro", energy: 0.3 },
  delta: 0.6,
  assumptions: [{ claim: "energy delta 0.60 between sections exceeds threshold 0.4", confidence: 1.0, source: "default" }],
  manualHint: 'consider a transition riser/filler clip between "drop" and "intro"',
};

const gapObservation: TransitionObservation = {
  kind: "repetition_gap",
  scene: 1,
  assumptions: [{ claim: "scene 1 is not in any repetition cluster (threshold 0.7, profile generic)", confidence: 1.0, source: "config" }],
  manualHint: "scene 1 may benefit from variation or a recurring element",
};

const fullInput = (): ArrangementReviewRenderInput => ({
  sections: [section(0, 1, "intro", 0.3), section(2, 3, "drop", 0.9)],
  energyCurve: [{ bar: 0, value: 0.2 }, { bar: 1, value: 0.4 }, { bar: 2, value: 0.9 }, { bar: 3, value: 1 }] as EnergyPoint[],
  repetition: [{ group: [0, 2], similarity: 0.82, matchedOn: ["density", "velocity"] }] as RepetitionCluster[],
  trackRoles: { "track:1": { role: "bass", confidence: 0.9, alternatives: [{ role: "pad", score: 0.4 }] } },
  transitionObservations: [dropObservation, gapObservation],
  pulledAt: PULLED_AT,
  assumptions: [{ claim: `derived from snapshot pulled at ${PULLED_AT}`, confidence: 1.0, source: "default" }],
  currentSection: "intro",
  freshness: "live",
});

describe("renderArrangementReview (04.3-02 bounded text render)", () => {
  it("renders the SKILL.md groups in order with every chunk ≤512 and pulledAt on every group", () => {
    const chunks = renderArrangementReview(fullInput());
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    const joined = chunks.join("\n");
    const state = joined.indexOf("State:");
    const timeline = joined.indexOf("Timeline (4 scenes):");
    const energy = joined.indexOf("Energy sparkline (per-scene aggregate, 0-1 against project peak):");
    const repetition = joined.indexOf("Repetition clusters:");
    const transitions = joined.indexOf("Transition observations (ADVISORY");
    expect(state).toBeGreaterThanOrEqual(0);
    expect(timeline).toBeGreaterThan(state);
    expect(energy).toBeGreaterThan(timeline);
    expect(repetition).toBeGreaterThan(energy);
    expect(transitions).toBeGreaterThan(repetition);
    // Five groups (State/Timeline/Energy/Repetition/Transitions) each close with
    // an assumptions line carrying the pulledAt value (Pitfall 5 honesty).
    expect(joined.split(PULLED_AT).length - 1).toBeGreaterThanOrEqual(5);
  });

  it("surfaces the fifth dimension (track roles) inside the State group", () => {
    const joined = renderArrangementReview(fullInput()).join("\n");
    expect(joined).toContain("Section: intro");
    expect(joined).toContain("Freshness: live");
    expect(joined).toContain("Track roles:");
    expect(joined).toContain("track:1=bass");
  });

  it("splits an oversized group at line boundaries into contiguous ≤512 chunks preserving order", () => {
    const repetition: RepetitionCluster[] = [];
    for (let i = 0; i < 40; i++) repetition.push({ group: [i, (i + 5) % 40], similarity: 0.8, matchedOn: ["density", "velocity"] });
    const input = fullInput();
    input.repetition = repetition;
    const chunks = renderArrangementReview(input);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    const lines = chunks.join("\n").split("\n");
    const first = lines.findIndex((l) => l.includes("scenes [0, 5]"));
    const last = lines.findIndex((l) => l.includes("scenes [39, 4]"));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
    // Line integrity: every rendered cluster line is a COMPLETE line (no mid-line cut).
    expect(lines).toContain("  - scenes [0, 5] (intro, drop) similarity=0.80 matchedOn=[density, velocity]");
  });

  it("renders an explicit no-snapshot honesty marker when pulledAt is null", () => {
    const input = fullInput();
    input.pulledAt = null;
    input.currentSection = null;
    const joined = renderArrangementReview(input).join("\n");
    expect(joined).toContain("NO ARRANGEMENT SNAPSHOT");
    expect(joined).not.toContain(`pulled at ${PULLED_AT}`);
  });

  it("renders disconnected freshness visibly when reading the durable snapshot", () => {
    const input = fullInput();
    input.freshness = "disconnected";
    const joined = renderArrangementReview(input).join("\n");
    expect(joined).toContain("Freshness: disconnected");
    expect(joined).toContain(PULLED_AT);
  });

  it("maps per-scene energy 0-1 onto the eight unicode block steps, one char per scene", () => {
    const stepped = fullInput();
    stepped.sections = [section(0, 0, "a", 0), section(1, 1, "b", 0.5), section(2, 2, "c", 1)];
    const steppedLines = renderArrangementReview(stepped).join("\n").split("\n");
    expect(steppedLines).toContain("  ▁ ▄ █");
    // One char per scene: the 4-scene input renders four sparkline tokens.
    const fourSceneLines = renderArrangementReview(fullInput()).join("\n").split("\n");
    const spark = fourSceneLines.find((l) => /^[ ▁▂▃▄▅▆▇█]+$/.test(l) && l.trim().length === 4);
    expect(spark, JSON.stringify(fourSceneLines)).toBeDefined();
  });

  it("renders honest placeholders for empty dimensions instead of silently omitting them", () => {
    const input = fullInput();
    input.sections = [];
    input.repetition = [];
    input.transitionObservations = [];
    input.trackRoles = {};
    input.energyCurve = [];
    const joined = renderArrangementReview(input).join("\n");
    expect(joined).toContain("no sections detected");
    expect(joined).toContain("no per-scene energy");
    expect(joined).toContain("no repetition clusters detected");
    expect(joined).toContain("no transition observations");
    expect(joined).toContain("no track roles classified");
  });

  it("is deterministic for identical input", () => {
    expect(renderArrangementReview(fullInput())).toEqual(renderArrangementReview(fullInput()));
  });

  it("stringified inputs and outputs contain no patch identifier or operations-list tokens (T-04-16 extension)", () => {
    const input = fullInput();
    const chunks = renderArrangementReview(input);
    expect(JSON.stringify([input, chunks])).not.toMatch(/patchId|inverseOperations|applyPatch|"operations"/);
  });

  it("module imports nothing from fs/net/sessions/pi/patch/peers (purity)", async () => {
    const src = await readFile(join(MODULE_PATH, "arrangement-review-render.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']node:fs/);
    expect(src).not.toMatch(/from\s+["']node:net/);
    expect(src).not.toMatch(/from\s+["']\.\.\/patch\//);
    expect(src).not.toMatch(/from\s+["']\.\.\/sessions\//);
    expect(src).not.toMatch(/from\s+["']\.\.\/peers\//);
  });
});

describe("renderArrangementReviewHint (no-snapshot path)", () => {
  it("is a short honest hint that names refresh — never fabricated evidence", () => {
    const hint = renderArrangementReviewHint();
    expect(hint.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(hint).toMatch(/refresh/);
    expect(hint).toMatch(/no arrangement snapshot/i);
  });
});
