// daemon/src/transforms/transition-suggest.ts
//
// P4 / 04-05 Task 1 — ARRANGE-04 transition-suggest (D-10 ADVISORY ONLY).
//
// Consumes the outputs of section-detector + energy-curve + repetition-report
// and emits STRUCTURED OBSERVATIONS about arrangement weak spots: energy drops
// between adjacent sections + repetition gaps (scenes not in any repetition
// cluster). Each observation carries assumptions[] (UX-06) + a manualHint the
// producer acts on in Bitwig directly.
//
// D-10 INVARIANT (Pitfall 5): this module is PURELY ADVISORY. It carries NO
// patchId, NO operations[], NO risk field. The patch model (P3 D-01) is single
// cursor-clip scoped; project-level arrangement advice is a category error to
// force into a clip patch. The producer edits Bitwig manually based on the hint.
//
// PURE module: no fs/net imports. Mirrors harmonic-detect.ts:17-18 discipline
// (the refuse-returns-null analog → here "refuse" = return []). This module
// MUST NOT import from ../patch/* (the test asserts this structurally).

import type { Assumption } from "../state/analyzer-registry.js";
import type { SectionSummary } from "./section-detector.js";
import type { RepetitionCluster } from "./repetition-report.js";
import type { EnergyPoint } from "./energy-curve.js";

/** The default |delta| above which an energy drop between adjacent sections is flagged. */
const DEFAULT_ENERGY_DROP_THRESHOLD = 0.4;

/** The default cap on repetition-gap emissions (avoid spamming for every ungrouped scene). */
const DEFAULT_MAX_REPETITION_GAPS = 3;

/**
 * A D-10 advisory observation. NO patch fields (patchId/operations/risk are
 * FORBIDDEN — the test asserts their absence structurally).
 *
 * - `kind:"energy_drop"` — adjacent sections whose energy delta exceeds the
 *   threshold. `from`/`to`/`delta` are populated.
 * - `kind:"repetition_gap"` — a scene within a labeled section that is not in
 *   any repetition cluster. `scene` is populated; `from`/`to`/`delta` absent.
 *
 * `assumptions[]` (UX-06 — never empty) discloses the signals behind the
 * observation, including the repetition threshold + the energy provenance.
 * `manualHint` is a short producer-actionable string.
 */
export interface TransitionObservation {
  kind: "energy_drop" | "repetition_gap";
  /** energy_drop only: the higher-energy section (the one the drop is FROM). */
  from?: { scene: number; label: string; energy: number };
  /** energy_drop only: the lower-energy section (the one the drop lands ON). */
  to?: { scene: number; label: string; energy: number };
  /** energy_drop only: from.energy - to.energy (always > 0 when emitted). */
  delta?: number;
  /** repetition_gap only: the scene index that is not in any repetition cluster. */
  scene?: number;
  /** UX-06 — never empty. */
  assumptions: Assumption[];
  /** A short producer-actionable hint (never a patch operation). */
  manualHint: string;
}

/** Options for {@link suggestTransitions}. All optional (sensible defaults). */
export interface SuggestTransitionsOptions {
  /** |delta| above which an energy drop is flagged (default 0.4). */
  energyDropThreshold?: number;
  /**
   * The total scene count for repetition-gap enumeration. When absent, the
   * max endScene across sections + 1 is used (best-effort).
   */
  sceneCount?: number;
  /** The repetition similarity threshold the producer's profile uses (for the assumption claim). */
  repetitionThreshold?: number;
  /** The profile name surfaced in assumptions (default "generic"). */
  profileName?: string;
  /** ISO timestamp of the snapshot these inputs came from (Pitfall 8 — snap-stale defense). */
  pulledAt?: string;
  /** Cap on repetition-gap emissions (default 3). */
  maxRepetitionGaps?: number;
}

/**
 * Generate advisory transition observations from arrangement analysis outputs.
 *
 * D-10 (Pitfall 5): the returned objects are ADVISORY ONLY — they carry NO
 * patchId / operations / risk. The producer reads the `manualHint` and edits
 * Bitwig manually. This module MUST NOT import from `../patch/*`.
 *
 * Energy-drop detection: for each pair of adjacent sections (i, i+1), compute
 * delta = section[i].energy - section[i+1].energy. If |delta| > threshold,
 * emit `{kind:"energy_drop", from:{...section[i]}, to:{...section[i+1]}, delta}`.
 *
 * Repetition-gap detection: for each scene within a labeled section that is NOT
 * in any repetition cluster, emit `{kind:"repetition_gap", scene}`. Capped at
 * `maxRepetitionGaps` (default 3) to avoid spamming — only the first few
 * isolated scenes surface.
 *
 * Pure over its inputs. Empty sections/energy/repetition → [].
 *
 * @example
 * suggestTransitions(sections, energyCurve, repetition);
 * // -> [{kind:"energy_drop", from:{scene:0,label:"intro",energy:0.9}, to:{scene:4,label:"break",energy:0.3}, delta:0.6, assumptions:[...], manualHint:"..."}]
 */
export function suggestTransitions(
  sections: SectionSummary[],
  _energy: EnergyPoint[],
  repetition: RepetitionCluster[],
  opts: SuggestTransitionsOptions = {},
): TransitionObservation[] {
  if (sections.length === 0) return [];

  const threshold = opts.energyDropThreshold ?? DEFAULT_ENERGY_DROP_THRESHOLD;
  const profileName = opts.profileName ?? "generic";
  const repThreshold = opts.repetitionThreshold ?? 0.7;
  const maxGaps = opts.maxRepetitionGaps ?? DEFAULT_MAX_REPETITION_GAPS;
  const pulledAtSuffix = opts.pulledAt ? ` (snapshot pulled ${opts.pulledAt})` : "";

  const observations: TransitionObservation[] = [];

  // --- Energy-drop detection (adjacent section pairs) ---
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    const delta = a.energy - b.energy;
    if (Math.abs(delta) > threshold) {
      // Orient from/to so `from` is always the higher-energy section.
      const fromIsA = delta > 0;
      const from = fromIsA ? a : b;
      const to = fromIsA ? b : a;
      observations.push({
        kind: "energy_drop",
        from: { scene: from.startScene, label: from.label, energy: from.energy },
        to: { scene: to.startScene, label: to.label, energy: to.energy },
        delta: Math.abs(delta),
        assumptions: [
          {
            claim: `energy delta ${Math.abs(delta).toFixed(2)} between "${from.label}" (${from.energy.toFixed(2)}) and "${to.label}" (${to.energy.toFixed(2)}) exceeds threshold ${threshold}`,
            confidence: 1.0,
            source: "default",
          },
          {
            claim: `derived from per-scene energy composite${pulledAtSuffix}`,
            confidence: 1.0,
            source: "default",
          },
        ],
        manualHint: `consider a transition riser/filler clip between "${from.label}" and "${to.label}"`,
      });
    }
  }

  // --- Repetition-gap detection (scenes not in any cluster, within labeled sections) ---
  const sceneCount =
    opts.sceneCount ?? Math.max(...sections.map((s) => s.endScene)) + 1;
  // Build the set of scenes that ARE in some repetition cluster.
  const clustered = new Set<number>();
  for (const cluster of repetition) {
    for (const scene of cluster.group) clustered.add(scene);
  }
  // Enumerate scenes within labeled sections that are NOT clustered.
  const gapScenes: number[] = [];
  for (const section of sections) {
    for (let s = section.startScene; s <= section.endScene; s++) {
      if (s >= sceneCount) break;
      if (!clustered.has(s)) gapScenes.push(s);
    }
    if (gapScenes.length >= maxGaps) break;
  }
  for (const scene of gapScenes.slice(0, maxGaps)) {
    observations.push({
      kind: "repetition_gap",
      scene,
      assumptions: [
        {
          claim: `scene ${scene} is not in any repetition cluster (threshold ${repThreshold}, profile ${profileName})`,
          confidence: 1.0,
          source: "config",
        },
        {
          claim: `derived from repetition analysis${pulledAtSuffix}`,
          confidence: 1.0,
          source: "default",
        },
      ],
      manualHint: `scene ${scene} may benefit from variation or a recurring element`,
    });
  }

  return observations;
}
