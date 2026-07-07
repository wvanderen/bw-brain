// daemon/src/transforms/track-role-classifier.ts
//
// P4 / 04-04 Task 2 — ARRANGE-05 track-role classification.
//
// Per-track MIDI-feature aggregation + genre-profile template matching (D-08).
// The classifier aggregates each track's notes across its hasContent cells into
// three feature vectors (register distribution, rhythm pattern, velocity
// profile), then scores each role template via weighted cosine similarity
// (D-18) with register-window masking (the key novelty — a kick template only
// "sees" notes in C1-E1). The argmax above `template.minConfidence` (default
// 0.5) wins; below threshold → role:"unknown" (refuse — RESEARCH Pitfall 4).
//
// Weights default to `[0.4, 0.4, 0.2]` over `[register-masked, rhythmProfile,
// velocityProfile-3vector]` (D-18). Register + rhythm dominate; velocity is
// secondary. The velocity 3-vector is `[mean, variance, sqrt(variance)]` — a
// small-variance track matches a tight template best.
//
// Plugs into analyzer-registry.ts D-08 framework (produces "trackRoles") as
// the role classifier. The wrapper mirrors SectionDetector/RepetitionReport
// shape: type-only back-import (no cycle), defensive grid extraction,
// refuse-on-empty, honest confidence (mean across tracks — NOT pre-floored;
// runAll owns the 0.5 floor). The persistence to roles.json happens in Plan
// 04-05's query-server handler — this analyzer emits the classification; Plan
// 05 writes it.
//
// Source: RESEARCH.md §Code Examples lines 793-827 (classifyTrackRole shape) +
// §D-18 (weighted cosine over register-masked + rhythm + velocity) + §D-09
// (single role + alternatives shape) + §PATTERNS.md §track-role-classifier.ts
// (lines 345-353).
//
// PURE module: no fs/net imports. Mirrors motif-signature.ts + scene-features.ts
// discipline (documented interfaces, @example JSDoc, NO side effects).

import type { Note } from "../cli/diff-logic.js";
import type { SceneColumn } from "./scene-features.js";
import { cosineAffinity } from "./self-similarity.js";
import type {
  Analyzer,
  AnalyzeContext,
  DerivedField,
  RawState,
} from "../state/analyzer-registry.js";

/**
 * D-08 role template. Generic profile ships 7 (kick/bass/lead/pad/hats/
 * percussion/fx); techno replaces with 2 tighter kick/bass (array-replace).
 */
export interface RoleTemplate {
  role: string;
  /** MIDI pitch floor of the register window (e.g. 24 = C1). */
  registerLow: number;
  /** MIDI pitch ceiling of the register window (e.g. 40 = E2). */
  registerHigh: number;
  /** 5-bin IOI histogram (normalized to sum ~1.0). */
  rhythmProfile: [number, number, number, number, number];
  /** Velocity moments (mean/variance ∈ [0,1] after /127 scaling). */
  velocityProfile: { mean: number; variance: number };
  /** Refuse threshold (default 0.5 inherited when absent). */
  minConfidence?: number;
}

/**
 * Aggregated per-track features for role matching. Computed by
 * `aggregateTrackFeatures` from the track's notes across all hasContent cells.
 */
export interface TrackFeatures {
  trackSid: string;
  /** 128-bin MIDI pitch histogram (velocity-weighted, normalized to sum=1). */
  registerDistribution: number[];
  /** 5-bin IOI histogram (normalized to sum=1 for ≥2 notes). */
  rhythmPattern: number[];
  /** Velocity moments (velocity / 127 scaling → ∈ [0,1]). */
  velocityProfile: { mean: number; variance: number };
}

/**
 * D-09 single-role classification per track. `role` is the best-match above
 * threshold OR "unknown" (refuse). `alternatives` are the top-3 runners-up
 * (sorted desc) for debuggability.
 */
export interface RoleClassification {
  trackSid: string;
  /** Best-match role above minConfidence, or "unknown" (refuse). */
  role: string;
  /** Honest ∈ [0,1] (NOT pre-floored — Pitfall 4). Equal to the best template score. */
  confidence: number;
  /** Top-3 runners-up (sorted desc by score). */
  alternatives: Array<{ role: string; score: number }>;
  /** Present only when role="unknown" — surfaces the refuse reason. */
  assumption?: string;
}

/** IOI bucket edges in beats; 5 buckets result from 4 edges (mirrors motif-signature). */
const IOI_BUCKETS = [0.25, 0.5, 1.0, 2.0];

/** Default D-18 weights over [register-masked, rhythm, velocity-3vector]. */
const DEFAULT_WEIGHTS: [number, number, number] = [0.4, 0.4, 0.2];

/** Default refuse threshold when a template lacks minConfidence. */
const DEFAULT_MIN_CONFIDENCE = 0.5;

/**
 * Aggregate a track's MIDI features across its hasContent cells. Pure.
 *
 * Gathers every note from cells where `(cell.trackSid === trackSid &&
 * cell.hasContent)` across all scene columns. Computes:
 *   - registerDistribution: 128-bin velocity-weighted pitch histogram (sum=1).
 *   - rhythmPattern: 5-bin IOI histogram (sum=1 for ≥2 notes).
 *   - velocityProfile: {mean, variance} over velocity/127.
 *
 * @returns null when the track has zero hasContent cells (RESEARCH Open
 *   Question 4 — filtered, NOT classified as unknown). The caller skips null
 *   results.
 *
 * @example
 * const feat = aggregateTrackFeatures("trk_kick", columns);
 * if (feat) classifyTrackRole(feat, templates);
 */
export function aggregateTrackFeatures(
  trackSid: string,
  columns: SceneColumn[],
): TrackFeatures | null {
  // Gather all notes from this track's hasContent cells across scenes.
  const notes: Note[] = [];
  for (const col of columns) {
    for (const cell of col.cells) {
      if (cell.trackSid === trackSid && cell.hasContent) {
        for (const n of cell.notes) notes.push(n);
      }
    }
  }
  if (notes.length === 0) return null; // RESEARCH OQ4 — filtered, not classified

  // --- registerDistribution: 128-bin velocity-weighted pitch histogram. ---
  const regRaw = new Array(128).fill(0);
  for (const n of notes) {
    if (n.pitch >= 0 && n.pitch < 128) regRaw[n.pitch] += n.velocity;
  }
  const regSum = regRaw.reduce((a, b) => a + b, 0) || 1; // guard
  const registerDistribution = regRaw.map((v) => v / regSum);

  // --- rhythmPattern: 5-bin IOI histogram (mirrors motif-signature.ts:88-100). ---
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const rhythmRaw = new Array(5).fill(0);
  for (let i = 1; i < sorted.length; i++) {
    const ioi = sorted[i].start - sorted[i - 1].start;
    const bucket =
      ioi <= IOI_BUCKETS[0] ? 0
      : ioi <= IOI_BUCKETS[1] ? 1
      : ioi <= IOI_BUCKETS[2] ? 2
      : ioi <= IOI_BUCKETS[3] ? 3
      : 4;
    rhythmRaw[bucket]++;
  }
  const rhythmSum = rhythmRaw.reduce((a, b) => a + b, 0) || 1; // guard (single-note)
  const rhythmPattern = rhythmRaw.map((v) => v / rhythmSum);

  // --- velocityProfile: {mean, variance} over velocity/127. ---
  const velScaled = notes.map((n) => n.velocity / 127);
  const mean = velScaled.reduce((a, b) => a + b, 0) / velScaled.length;
  const variance =
    velScaled.reduce((s, v) => s + (v - mean) ** 2, 0) / velScaled.length;

  return {
    trackSid,
    registerDistribution,
    rhythmPattern,
    velocityProfile: { mean, variance },
  };
}

/**
 * Classify a track's role via weighted-cosine template matching (D-08/D-18).
 * Pure.
 *
 * For each template:
 *   1. Register-masked scoring: zero out `features.registerDistribution` bins
 *      outside `[registerLow, registerHigh]`; renormalize; compute cosine
 *      against a uniform-in-window reference (a track with notes spread evenly
 *      in the window scores highest). The mask is the key novelty — a kick
 *      template only "sees" notes in C1-E1.
 *   2. Rhythm scoring: cosine between `features.rhythmPattern` and
 *      `template.rhythmProfile` (both 5-bin normalized).
 *   3. Velocity scoring: cosine over the 3-vector `[mean, variance,
 *      sqrt(variance)]` between features and template.
 *   Weighted sum → score ∈ [0,1].
 *
 * Sort templates desc by score. `bestScore = scores[0]`. If
 * `bestScore ≥ template.minConfidence` (default 0.5) → role = bestTemplate.role.
 * Else → role = "unknown" (refuse — Pitfall 4) with an assumption field.
 *
 * @param features - the track's aggregated features.
 * @param templates - the genre-profile role templates (may be empty).
 * @param weights - optional override for `[register, rhythm, velocity]` weights.
 * @returns RoleClassification with honest confidence ∈ [0,1].
 *
 * @example
 * const feat = aggregateTrackFeatures("trk_kick", cols)!;
 * const result = classifyTrackRole(feat, genericTemplates);
 * // result.role === "kick"; result.confidence > 0.5; alternatives sorted desc.
 */
export function classifyTrackRole(
  features: TrackFeatures,
  templates: RoleTemplate[],
  weights: [number, number, number] = DEFAULT_WEIGHTS,
): RoleClassification {
  const trackSid = features.trackSid;

  // No templates → cannot classify → unknown.
  if (templates.length === 0) {
    return {
      trackSid,
      role: "unknown",
      confidence: 0,
      alternatives: [],
      assumption: "no templates provided (minConfidence unreachable)",
    };
  }

  // Score every template.
  const scored = templates.map((tpl) => ({
    role: tpl.role,
    score: scoreTemplate(features, tpl, weights),
    minConfidence: tpl.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
  }));

  // Sort desc by score.
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const alternatives = scored.slice(1, 4).map((s) => ({ role: s.role, score: s.score }));

  // Honest argmax: best wins iff score ≥ its minConfidence.
  if (best.score >= best.minConfidence) {
    return {
      trackSid,
      role: best.role,
      confidence: best.score,
      alternatives,
    };
  }

  // Refuse — no template cleared its minConfidence.
  return {
    trackSid,
    role: "unknown",
    confidence: best.score,
    alternatives,
    assumption: `no template cleared minConfidence (best ${best.role}=${best.score.toFixed(3)} < ${best.minConfidence})`,
  };
}

/**
 * Score one template against the track features via weighted cosine (D-18).
 *
 * - Register-masked cosine: zero out bins outside [registerLow, registerHigh];
 *   renormalize the masked distribution to sum=1; cosine against a uniform
 *   reference in the same window.
 * - Rhythm cosine: cosineAffinity(features.rhythmPattern, template.rhythmProfile).
 * - Velocity cosine: cosineAffinity over the 3-vector [mean, variance, sqrt(variance)].
 *
 * Returns the weighted sum ∈ [0,1] (cosineAffinity is non-negative).
 */
function scoreTemplate(
  features: TrackFeatures,
  tpl: RoleTemplate,
  weights: [number, number, number],
): number {
  // --- Register-masked cosine. ---
  const regScore = registerMaskedCosine(
    features.registerDistribution,
    tpl.registerLow,
    tpl.registerHigh,
  );

  // --- Rhythm cosine (5-bin). ---
  const rhythmScore = cosineAffinity(
    features.rhythmPattern,
    [...tpl.rhythmProfile],
  );

  // --- Velocity cosine (3-vector: mean, variance, sqrt(variance)). ---
  const fVec = [
    features.velocityProfile.mean,
    features.velocityProfile.variance,
    Math.sqrt(features.velocityProfile.variance),
  ];
  const tVec = [
    tpl.velocityProfile.mean,
    tpl.velocityProfile.variance,
    Math.sqrt(tpl.velocityProfile.variance),
  ];
  const velScore = cosineAffinity(fVec, tVec);

  return weights[0] * regScore + weights[1] * rhythmScore + weights[2] * velScore;
}

/**
 * Register-window-masked cosine (D-18 key novelty). Pure.
 *
 * Zero out every bin of `distribution` outside `[low, high]`, renormalize the
 * masked slice to sum=1, then compute cosine affinity against a uniform
 * reference (every in-window bin = 1/windowSize). A track with notes spread
 * evenly inside the window scores highest; a track with notes outside the
 * window scores ~0 (the masked slice is all-zeros → cosineAffinity zero-guard).
 *
 * Returns 0 when no notes fall in the window (the zero-magnitude guard kicks
 * in — the track is dissimilar to this template's register).
 */
function registerMaskedCosine(
  distribution: number[],
  low: number,
  high: number,
): number {
  const lo = Math.max(0, Math.floor(low));
  const hi = Math.min(127, Math.ceil(high));
  const windowSize = hi - lo + 1;
  if (windowSize <= 0) return 0;

  // Mask: keep only bins in [lo, hi].
  const masked = distribution.slice(lo, hi + 1);
  const maskedSum = masked.reduce((a, b) => a + b, 0);
  if (maskedSum === 0) return 0; // no notes in window → zero-magnitude → 0

  // Renormalize the masked slice.
  const maskedNorm = masked.map((v) => v / maskedSum);

  // Uniform reference in the same window (every bin = 1/windowSize).
  const uniform = new Array(windowSize).fill(1 / windowSize);

  return cosineAffinity(maskedNorm, uniform);
}

/**
 * D-08 analyzer-plugin: track-role classifier. id "trackRoles", consumes
 * ["clips"] (the launcher-grid snapshot mirror), produces ["trackRoles"].
 * Pure (never mutates raw).
 *
 * Defensively extracts the launcher grid from `raw.tracks`, aggregates each
 * track's features, classifies against `ctx.profile.roleTemplates` (ARCH-02 —
 * empty-array fallback when absent → all tracks "unknown"), and collects into
 * a `Record<trackSid, RoleClassification>`.
 *
 * Tracks with zero hasContent cells are filtered (RESEARCH Open Question 4 —
 * not classified). If no tracks classify → returns [] (refuse). Confidence =
 * mean across classified tracks (honest ∈ [0,1] — NOT pre-floored).
 */
export const TrackRoleClassifier: Analyzer = {
  id: "trackRoles",
  consumes: ["clips"],
  produces: ["trackRoles"],
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const { columns, trackSids } = extractSceneColumnsAndTrackSids(raw);
    if (columns.length === 0 || trackSids.length === 0) return [];

    const templates = ctx.profile?.roleTemplates ?? [];
    const profileName = ctx.profile?.name ?? "generic";

    const classifications: Record<string, RoleClassification> = {};
    let confidenceSum = 0;
    let count = 0;

    for (const sid of trackSids) {
      const feat = aggregateTrackFeatures(sid, columns);
      if (feat === null) continue; // filtered — zero hasContent cells
      const cls = classifyTrackRole(feat, templates);
      classifications[sid] = cls;
      confidenceSum += cls.confidence;
      count++;
    }

    if (count === 0) return []; // no tracks classified → refuse

    const meanConfidence = confidenceSum / count;
    return [
      {
        field: "trackRoles",
        value: classifications,
        confidence: meanConfidence,
        assumptions: [
          {
            claim: `classified ${count} track(s) via weighted-cosine template matching (register-masked + rhythm + velocity)`,
            confidence: 1.0,
            source: "default",
          },
          {
            claim: `role templates from profile: ${profileName} (${templates.length} templates)`,
            confidence: 1.0,
            source: "config",
          },
        ],
      },
    ];
  },
};

/**
 * Defensively extract the launcher grid from raw.tracks into SceneColumn[] +
 * the deduplicated trackSid list.
 *
 * Mirrors section-detector.ts / energy-curve.ts extractSceneColumns (kept
 * duplicated for module independence). Also collects the ordered unique
 * trackSid list so the analyzer can iterate tracks (not scenes).
 *
 * Returns empty columns/trackSids when no tracks or no scenes are present.
 */
function extractSceneColumnsAndTrackSids(
  raw: RawState,
): { columns: SceneColumn[]; trackSids: string[] } {
  const tracks = (raw as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { columns: [], trackSids: [] };
  }

  // Determine the scene count from the first track carrying a scenes array.
  let sceneCount = 0;
  for (const t of tracks) {
    if (t && typeof t === "object") {
      const scenes = (t as { scenes?: unknown }).scenes;
      if (Array.isArray(scenes)) {
        sceneCount = Math.max(sceneCount, scenes.length);
        break;
      }
    }
  }
  if (sceneCount === 0) return { columns: [], trackSids: [] };

  const columns: SceneColumn[] = [];
  const trackSids: string[] = [];
  for (let s = 0; s < sceneCount; s++) {
    const cells: SceneColumn["cells"] = [];
    for (const t of tracks) {
      if (!t || typeof t !== "object") continue;
      const track = t as { trackSid?: string; name?: string; scenes?: unknown[] };
      const sid = typeof track.trackSid === "string" ? track.trackSid : "";
      if (s === 0 && sid && !trackSids.includes(sid)) trackSids.push(sid);
      const scene = track.scenes?.[s];
      if (!scene || typeof scene !== "object") continue;
      const cell = scene as {
        hasContent?: boolean;
        notes?: unknown;
        loopBeats?: number;
      };
      const hasContent = cell.hasContent === true;
      const notes: Note[] = Array.isArray(cell.notes)
        ? (cell.notes as Note[]).filter(isNote)
        : [];
      const loopBeats = typeof cell.loopBeats === "number" ? cell.loopBeats : 0;
      cells.push({
        trackSid: sid,
        trackName: typeof track.name === "string" ? track.name : "",
        hasContent,
        notes,
        loopBeats,
      });
    }
    columns.push({ sceneIdx: s, cells });
  }
  return { columns, trackSids };
}

/** Runtime guard for Note-shaped entries (mirrors motif-signature.ts:206-214). */
function isNote(v: unknown): v is Note {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as Note).pitch === "number" &&
    typeof (v as Note).start === "number" &&
    typeof (v as Note).length === "number" &&
    typeof (v as Note).velocity === "number"
  );
}
