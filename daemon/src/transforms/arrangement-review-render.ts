// daemon/src/transforms/arrangement-review-render.ts
//
// 04.3 / 04.3-02 Task 1 — CLAP-native arrangement review render (RB-03 /
// RB-05 / UX-03 daemon half). Adapts the pi-pack /review SKILL.md step-3
// producer-visible text-block layout into bounded conversation.chunk texts:
// every emitted string is ≤512 chars (the frozen ConversationChunk text
// bound) and groups render in the SKILL.md order — State / Timeline /
// Energy sparkline / Repetition clusters / Transition observations.
//
// ADVISORY INVARIANT (T-04.3-06, extends T-04-16): this module renders
// OBSERVATIONS ONLY. It carries NO patchId, NO operations[], NO risk field.
// Escalation to mutation stays on the explicit Analyze → preview_edit →
// create_proposal → approval → controller apply.patch spine; the producer
// acts on transition observations manually in Bitwig (D-10).
//
// FRESHNESS HONESTY (T-04.3-05, Pitfall 5): every group closes with an
// assumptions line carrying the pulledAt value of the evidence it rendered.
// A null pulledAt renders an explicit NO ARRANGEMENT SNAPSHOT marker — never
// a fabricated timestamp and never silent omission. Empty dimensions render
// explicit honest placeholders.
//
// PURE module: no fs/net imports, no Pi/session imports, no patch-module
// imports, no peer-runtime imports. Snapshot loading stays at the wiring
// layer (boot.ts); the dispatcher (action-dispatch.ts) assigns sequence
// numbers — this module only produces ordered chunk texts.

import type { Assumption } from "../state/analyzer-registry.js";
import type { SectionSummary } from "./section-detector.js";
import type { EnergyPoint } from "./energy-curve.js";
import type { RepetitionCluster } from "./repetition-report.js";
import type { TransitionObservation } from "./transition-suggest.js";

/** Hard cap per rendered chunk — mirrors ConversationChunk text maxLength. */
export const MAX_CHUNK_CHARS = 512;

/** The eight unicode block steps 0–1 maps onto (one char per scene). */
const SPARK_STEPS = "▁▂▃▄▅▆▇█";

/** Explicit honesty marker rendered in place of a timestamp when pulledAt is null. */
const NO_SNAPSHOT_MARKER = "NO ARRANGEMENT SNAPSHOT";

/** A classified track role from the arrangement evidence (fifth dimension). */
export interface ArrangementReviewTrackRole {
  role: string;
  confidence: number;
  alternatives?: Array<{ role: string; score: number }>;
}

/**
 * The five-dimension arrangement review evidence model (the exact payload
 * shape `bw-arrange review --json` ships and the shared evidence builder in
 * query-server.ts assembles) plus optional presentation labels.
 */
export interface ArrangementReviewRenderInput {
  sections: SectionSummary[];
  energyCurve: EnergyPoint[];
  repetition: RepetitionCluster[];
  trackRoles: Record<string, ArrangementReviewTrackRole>;
  transitionObservations: TransitionObservation[];
  /** ISO timestamp of the snapshot the evidence came from; null = no snapshot. */
  pulledAt: string | null;
  /** Evidence-level grounding claims (UX-06) rendered in the State group. */
  assumptions: Assumption[];
  /** Optional current-section label for the State line (from last-selected scene). */
  currentSection?: string | null;
  /** Optional freshness label surfaced on the State line (never silent). */
  freshness?: "live" | "stale" | "disconnected";
}

/** Map a 0–1 energy value onto one of the eight block steps. */
function energyChar(value: number): string {
  const step = Math.max(0, Math.min(SPARK_STEPS.length - 1, Math.floor(value * SPARK_STEPS.length)));
  return SPARK_STEPS[step]!;
}

/** Total scene count implied by the section coverage (max endScene + 1). */
function sceneCountOf(sections: SectionSummary[]): number {
  return sections.reduce((max, s) => Math.max(max, s.endScene), -1) + 1;
}

/** The section covering a scene, or undefined for an uncovered gap. */
function sectionFor(sections: SectionSummary[], scene: number): SectionSummary | undefined {
  return sections.find((s) => scene >= s.startScene && scene <= s.endScene);
}

/** A scene's label — "—" (never a guess) when no section covers it (Pitfall 7). */
function labelFor(sections: SectionSummary[], scene: number): string {
  return sectionFor(sections, scene)?.label ?? "—";
}

/** Per-scene energy char — "·" marks an uncovered gap (no data, no guess). */
function sceneChar(sections: SectionSummary[], scene: number): string {
  const section = sectionFor(sections, scene);
  return section ? energyChar(section.energy) : "·";
}

/** The assumptions line every group closes with (pulledAt or the honesty marker). */
function assumptionsLine(pulledAt: string | null): string {
  return pulledAt === null
    ? `assumptions: ${NO_SNAPSHOT_MARKER} (no pulledAt) — request a review with refresh to pull the grid`
    : `assumptions: derived from snapshot pulled at ${pulledAt}`;
}

/** Cap the rendered track-role entries so the State group stays bounded. */
const MAX_TRACK_ROLE_ENTRIES = 8;

/**
 * Build the five ordered groups as line arrays (SKILL.md step-3 layout).
 * Each group's final line is the pulledAt assumptions line.
 */
function buildGroups(input: ArrangementReviewRenderInput): string[][] {
  const pulled = assumptionsLine(input.pulledAt);
  const sceneCount = sceneCountOf(input.sections);

  // --- Group 1: State (incl. the fifth dimension — track roles) ---
  const state: string[] = [
    "State:",
    `  Section: ${input.currentSection ?? "—"}   Freshness: ${input.freshness ?? "unspecified"}`,
  ];
  const roleKeys = Object.keys(input.trackRoles);
  state.push(
    roleKeys.length === 0
      ? "  Track roles: (no track roles classified)"
      : `  Track roles: ${roleKeys
          .slice(0, MAX_TRACK_ROLE_ENTRIES)
          .map((k) => `${k}=${input.trackRoles[k]!.role}(${input.trackRoles[k]!.confidence.toFixed(2)})`)
          .join(" ")}`,
  );
  for (const assumption of input.assumptions) state.push(`  - ${assumption.claim}`);
  state.push(pulled);

  // --- Group 2: Timeline (per-scene labels + mini-bar row) ---
  const timeline: string[] = [`Timeline (${sceneCount} scenes):`];
  if (input.sections.length === 0) {
    timeline.push("  (no sections detected — labels below the analyzer confidence gate are omitted rather than guessed)");
  } else {
    const labels: string[] = [];
    const bars: string[] = [];
    for (let scene = 0; scene < sceneCount; scene++) {
      labels.push(`${scene}:${labelFor(input.sections, scene)}`);
      bars.push(sceneChar(input.sections, scene).repeat(2));
    }
    timeline.push(`  ${labels.join("   ")}`);
    timeline.push(`  ${bars.join("  ")}`);
  }
  timeline.push(pulled);

  // --- Group 3: Energy sparkline (one char per scene) + curve stats ---
  const energy: string[] = ["Energy sparkline (per-scene aggregate, 0-1 against project peak):"];
  if (input.sections.length === 0) {
    energy.push("  (no per-scene energy — no sections detected)");
  } else {
    const chars: string[] = [];
    for (let scene = 0; scene < sceneCount; scene++) chars.push(sceneChar(input.sections, scene));
    energy.push(`  ${chars.join(" ")}`);
  }
  const peak = input.energyCurve.reduce((max, p) => Math.max(max, p.value), 0);
  energy.push(`  energy curve: ${input.energyCurve.length} bars, peak ${peak.toFixed(2)}`);
  energy.push(pulled);

  // --- Group 4: Repetition clusters ---
  const repetition: string[] = ["Repetition clusters:"];
  if (input.repetition.length === 0) {
    repetition.push("  (no repetition clusters detected above the profile threshold)");
  }
  for (const cluster of input.repetition) {
    const labels = cluster.group.map((scene) => labelFor(input.sections, scene)).join(", ");
    repetition.push(
      `  - scenes [${cluster.group.join(", ")}] (${labels}) similarity=${cluster.similarity.toFixed(2)} matchedOn=[${cluster.matchedOn.join(", ")}]`,
    );
  }
  repetition.push(pulled);

  // --- Group 5: Transition observations (ADVISORY — D-10) ---
  const transitions: string[] = ["Transition observations (ADVISORY — act manually in Bitwig):"];
  if (input.transitionObservations.length === 0) {
    transitions.push("  (no transition observations — adjacent-section energy deltas within threshold and no ungrouped scenes surfaced)");
  }
  for (const observation of input.transitionObservations) {
    if (observation.kind === "energy_drop" && observation.from && observation.to) {
      transitions.push(
        `  - scene ${observation.from.scene}→${observation.to.scene} (${observation.from.label} → ${observation.to.label}): energy drop ${observation.from.energy.toFixed(2)} → ${observation.to.energy.toFixed(2)} — ${observation.manualHint}`,
      );
    } else if (observation.kind === "repetition_gap" && typeof observation.scene === "number") {
      transitions.push(`  - scene ${observation.scene} is ungrouped — ${observation.manualHint}`);
    }
    const claim = observation.assumptions[0]?.claim;
    if (claim) transitions.push(`    assumptions: ${claim}`);
  }
  transitions.push(pulled);

  return [state, timeline, energy, repetition, transitions];
}

/**
 * Pack a group's lines into contiguous chunks, each ≤{@link MAX_CHUNK_CHARS}.
 * Splits happen at LINE boundaries; only a single line longer than the cap is
 * hard-cut at the cap (documented exception — bounded output wins).
 */
function chunkGroup(lines: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  const flush = (): void => {
    if (current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      length = 0;
    }
  };
  for (const original of lines) {
    let line = original;
    while (line.length > MAX_CHUNK_CHARS) {
      flush();
      chunks.push(line.slice(0, MAX_CHUNK_CHARS));
      line = line.slice(MAX_CHUNK_CHARS);
    }
    if (line.length === 0) continue;
    const separator = current.length > 0 ? 1 : 0;
    if (length + separator + line.length > MAX_CHUNK_CHARS) flush();
    current.push(line);
    length += (current.length > 1 ? 1 : 0) + line.length;
  }
  flush();
  return chunks;
}

/**
 * Render the five-dimension arrangement review evidence into ordered chunk
 * texts for conversation.chunk emission. Pure and deterministic: identical
 * input → identical output. The dispatcher assigns sequence numbers.
 *
 * @example
 * const texts = renderArrangementReview(evidence); // string[] each ≤512
 */
export function renderArrangementReview(input: ArrangementReviewRenderInput): string[] {
  return buildGroups(input).flatMap((group) => chunkGroup(group));
}

/**
 * The honest no-snapshot hint (dispatched as a single bounded chunk when the
 * daemon has no arrangement snapshot and no refresh was requested): names the
 * remedy, fabricates nothing.
 */
export function renderArrangementReviewHint(): string {
  return "No arrangement snapshot loaded — request an arrangement review with refresh enabled to pull the launcher grid and build the analysis.";
}
