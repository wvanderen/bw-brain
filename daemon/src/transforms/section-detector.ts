// daemon/src/transforms/section-detector.ts
//
// P4 / 04-03 Task 1 — ARRANGE-01 section detection.
//
// Two cuts of the Plan 02 self-similarity matrix land in this file:
//   - agglomerativeBoundaries: contiguous (scene-index-constrained) agglomerative
//     clustering — the direct adaptation of librosa.segment.agglomerative
//     (temporally-constrained Ward) to discrete scenes. "Temporal axis" becomes
//     the scene-index axis; Ward's "minimize within-cluster variance" maps to
//     "merge the adjacent pair with the highest mean cross-affinity."
//   - labelSections: maps each boundary to a genre-profile label via
//     position + energy heuristics (D-07). Below-threshold → "unknown"
//     (refuse — Pitfall 7).
//
// Both are PURE (no fs/net imports). The Analyzer wrapper (SectionDetector)
// copies the MotifSignatureAnalyzer shape (motif-signature.ts:170-193): a
// type-only back-import from analyzer-registry (no cycle), defensive grid
// extraction from raw, refuse-on-empty, honest confidence (NOT pre-floored —
// Pitfall 4; runAll owns the 0.5 floor).
//
// Source: RESEARCH.md §Pattern 2 (lines 326-358) + §Code Examples (lines
// 706-732) + §D-14 (contiguous agglomerative) + §Pitfall 4 (do NOT pre-floor).

import type { Note } from "../cli/diff-logic.js";
import type { Profile } from "../gen/profile.js";
import type { SceneColumn, SceneFeatureVector } from "./scene-features.js";
import { sceneFeatureVector } from "./scene-features.js";
import { selfSimilarityMatrix } from "./self-similarity.js";
import type {
  Analyzer,
  AnalyzeContext,
  DerivedField,
  RawState,
} from "../state/analyzer-registry.js";

/**
 * A contiguous run of scenes forming one section. Covers [startScene, endScene]
 * inclusive. Boundaries tile [0, n-1] with no gaps or overlaps (the contiguity
 * invariant pinned by the fast-check property test).
 */
export interface SceneBoundary {
  startScene: number;
  endScene: number;
}

/**
 * A labeled section: boundary + genre-profile label + honest statistics.
 *
 * - `label`: the genre-profile label (intro/build/peak/...; techno:
 *   drop/break/roll). "unknown" when no profile label matches (refuse — Pitfall 7).
 * - `avgSimilarity`: mean intra-section cosine affinity. ∈ [0, 1].
 * - `energy`: mean per-scene energy proxy (∈ [0,1]; currently mean
 *   velocityAggregate — the full D-05 composite lands in Plan 04-04).
 * - `confidence`: honest ∈ [0,1] (NOT pre-floored — Pitfall 4). Equal to
 *   `avgSimilarity` for multi-scene sections; 1.0 for single-scene sections
 *   (trivially self-similar). runAll drops < 0.5.
 */
export interface SectionSummary {
  startScene: number;
  endScene: number;
  label: string;
  avgSimilarity: number;
  energy: number;
  confidence: number;
}

/** Default merge floor (D-14). Pairs below this affinity do NOT merge. */
const DEFAULT_MIN_SIMILARITY = 0.6;
/** Default section ceiling. Forced-merging stops here even above the floor. */
const DEFAULT_MAX_SECTIONS = 8;

/**
 * Contiguous agglomerative clustering (D-14). PURE.
 *
 * Starts with N single-scene clusters. Iteratively merges the ADJACENT pair
 * (only clusters sharing a scene boundary) with the highest mean cross-pair
 * cosine affinity. Stops when:
 *   (a) the best merge affinity drops below `minSimilarity` AND the cluster
 *       count is already ≤ `maxSections` (within budget — don't force), OR
 *   (b) only one cluster remains.
 *
 * If affinity stays high, merging continues BELOW maxSections (maxSections is
 * a ceiling, not a target — identical scenes collapse to a single section).
 *
 * @param features - the per-scene feature vectors (length n; the scene count).
 * @param sim - the n×n cosine-affinity matrix from selfSimilarityMatrix.
 * @param opts.maxSections - ceiling on emitted sections (default 8).
 * @param opts.minSimilarity - merge floor (default 0.6 — D-14).
 * @returns SceneBoundary[] tiling [0, n-1] with no gaps/overlaps. `[]` for
 *   empty input. `[{0, 0}]` for a single scene.
 *
 * @example
 * const features = columns.map(sceneFeatureVector);
 * const sim = selfSimilarityMatrix(features);
 * const boundaries = agglomerativeBoundaries(features, sim);
 * // boundaries[0].startScene === 0; boundaries[last].endScene === n-1.
 */
export function agglomerativeBoundaries(
  features: SceneFeatureVector[],
  sim: number[][],
  opts: { maxSections?: number; minSimilarity?: number } = {},
): SceneBoundary[] {
  const n = features.length;
  if (n === 0) return [];
  if (n === 1) return [{ startScene: 0, endScene: 0 }];

  const maxSections = Math.max(1, opts.maxSections ?? DEFAULT_MAX_SECTIONS);
  const minSim = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;

  // Initialize: each scene is its own cluster.
  let clusters: SceneBoundary[] = [];
  for (let i = 0; i < n; i++) clusters.push({ startScene: i, endScene: i });

  // Iteratively merge the best adjacent pair.
  while (clusters.length > 1) {
    const merge = findBestAdjacentMerge(clusters, sim);
    if (merge === null) break;
    // Stop if the best merge is below floor AND we're within the budget.
    if (merge.affinity < minSim && clusters.length <= maxSections) break;
    clusters = applyMerge(clusters, merge.idx);
  }

  return clusters;
}

/**
 * Find the adjacent cluster pair with the highest mean cross-affinity. The
 * "mean cross-affinity" between cluster A=[a0,a1] and B=[b0,b1] is the average
 * of sim[x][y] over all x in A, y in B. This is the Ward-style "minimize
 * within-cluster variance" objective in cosine-affinity form.
 *
 * Structural analog: harmonic-detect.ts:99-116 (argmax-over-rotations loop).
 */
function findBestAdjacentMerge(
  clusters: SceneBoundary[],
  sim: number[][],
): { idx: number; affinity: number } | null {
  if (clusters.length < 2) return null;
  let bestIdx = -1;
  let bestAff = -Infinity;
  for (let i = 0; i < clusters.length - 1; i++) {
    const a = clusters[i];
    const b = clusters[i + 1];
    let sum = 0;
    let count = 0;
    for (let x = a.startScene; x <= a.endScene; x++) {
      for (let y = b.startScene; y <= b.endScene; y++) {
        if (sim[x] && typeof sim[x][y] === "number") {
          sum += sim[x][y];
          count++;
        }
      }
    }
    const aff = count > 0 ? sum / count : 0;
    if (aff > bestAff) {
      bestAff = aff;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return { idx: bestIdx, affinity: bestAff };
}

/** Merge clusters[idx] + clusters[idx+1] into a single boundary. Pure. */
function applyMerge(clusters: SceneBoundary[], idx: number): SceneBoundary[] {
  const a = clusters[idx];
  const b = clusters[idx + 1];
  const merged: SceneBoundary = { startScene: a.startScene, endScene: b.endScene };
  return [...clusters.slice(0, idx), merged, ...clusters.slice(idx + 2)];
}

/**
 * Label each boundary via the genre profile (D-07). PURE.
 *
 * For each section:
 *   1. Compute mean per-scene energy (currently mean velocityAggregate ∈ [0,1];
 *      the full D-05 weighted composite lands in Plan 04-04).
 *   2. Compute position (start/middle/end) from the section's scene center
 *      relative to the total scene count.
 *   3. Find the first profile.sectionLabels entry whose energyRange contains
 *      the section energy AND whose position matches ("any" always matches).
 *   4. No profile / no match → label "unknown" (refuse — Pitfall 7).
 *
 * Confidence = avgSimilarity (honest ∈ [0,1]; NOT pre-floored — Pitfall 4).
 * For single-scene sections, avgSimilarity = 1.0 (trivially self-similar).
 *
 * @example
 * const sections = labelSections(boundaries, features, loadProfile("techno"));
 */
export function labelSections(
  boundaries: SceneBoundary[],
  features: SceneFeatureVector[],
  profile: Profile | undefined,
): SectionSummary[] {
  const n = features.length;
  // Compute the sim matrix once for the whole call so avgSimilarity is honest
  // (NOT stubbed). O(n²) where n is the scene count (O(10²)) — acceptable for
  // the analyzer path. The Analyzer wrapper reuses the sim it already built
  // for agglomerativeBoundaries via the internal labelSectionsImpl variant.
  const sim = selfSimilarityMatrix(features);
  return boundaries.map((b) => {
    const avgSim = meanIntraSectionSimFromMatrix(b, sim);
    const energy = meanSectionEnergy(b, features);
    const position = sectionPosition(b, n);
    const label = matchLabel(energy, position, profile);
    return {
      startScene: b.startScene,
      endScene: b.endScene,
      label,
      avgSimilarity: avgSim,
      energy,
      confidence: avgSim,
    };
  });
}

/**
 * Mean per-scene energy across a section. Currently mean velocityAggregate
 * (∈ [0,1] — the most energy-like single signal already on SceneFeatureVector).
 * The full D-05 weighted composite (noteDensity + velocity + polyphony +
 * pitchCentroid, weights from profile.energyWeights, normalized against project
 * peak) lands in Plan 04-04's energy-curve analyzer. Using velocityAggregate
 * here is a faithful single-signal proxy that lets labelSections match against
 * profile.sectionLabels energyRange windows.
 */
function meanSectionEnergy(b: SceneBoundary, features: SceneFeatureVector[]): number {
  let sum = 0;
  let count = 0;
  for (let i = b.startScene; i <= b.endScene; i++) {
    if (i < features.length) {
      sum += features[i].velocityAggregate;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Section position relative to the total scene count.
 *   - relativePos ∈ [0, 1] = sectionCenter / (n-1) for n > 1; 0 for n ≤ 1.
 *   - "start" when relativePos ≤ 0.33; "end" when ≥ 0.67; else "middle".
 */
function sectionPosition(
  b: SceneBoundary,
  n: number,
): "start" | "middle" | "end" {
  if (n <= 1) return "start";
  const center = (b.startScene + b.endScene) / 2;
  const relativePos = center / (n - 1);
  if (relativePos <= 0.33) return "start";
  if (relativePos >= 0.67) return "end";
  return "middle";
}

/**
 * Find the first profile.sectionLabels entry matching (energy, position).
 * A label matches when: energyRange[0] ≤ energy ≤ energyRange[1] AND
 * (label.position === "any" OR label.position === position). Below-threshold
 * OR no profile → "unknown" (refuse — Pitfall 7).
 */
function matchLabel(
  energy: number,
  position: "start" | "middle" | "end",
  profile: Profile | undefined,
): string {
  if (!profile?.sectionLabels) return "unknown";
  for (const lbl of profile.sectionLabels) {
    const [lo, hi] = lbl.energyRange;
    if (energy >= lo && energy <= hi && (lbl.position === "any" || lbl.position === position)) {
      return lbl.label;
    }
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// SectionDetector — Analyzer plugin (D-08)
// ---------------------------------------------------------------------------

/**
 * D-08 analyzer-plugin: section detection. id "sections", consumes ["clips"]
 * (the launcher-grid snapshot mirror), produces ["sections"]. Pure (never
 * mutates raw).
 *
 * Defensively extracts the launcher grid from `raw.tracks` (the snapshot
 * mirror's track-major layout). When the grid is absent or empty → returns []
 * (refuse — no guess, consistent with the "below-threshold = refuse rather
 * than guess" stance).
 *
 * Confidence = min section confidence (honest ∈ [0,1]; NOT pre-floored —
 * Pitfall 4). runAll drops the whole field if any section is below 0.5.
 */
export const SectionDetector: Analyzer = {
  id: "sections",
  consumes: ["clips"],
  produces: ["sections"],
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const columns = extractSceneColumns(raw);
    if (columns.length === 0) return []; // refuse — no grid, no guess
    const features = columns.map(sceneFeatureVector);
    const sim = selfSimilarityMatrix(features);
    const boundaries = agglomerativeBoundaries(features, sim);
    const sections = labelSections(boundaries, features, ctx.profile);
    if (sections.length === 0) return [];
    const minConf = sections.reduce((m, s) => Math.min(m, s.confidence), 1);
    return [
      {
        field: "sections",
        value: sections,
        confidence: minConf,
        assumptions: [
          {
            claim: `derived from ${features.length} scenes via cosine-affinity agglomerative clustering`,
            confidence: 1.0,
            source: "default",
          },
          {
            claim: `profile: ${ctx.profile?.name ?? "generic"}`,
            confidence: 1.0,
            source: "config",
          },
        ],
      },
    ];
  },
};

/**
 * Mean pairwise sim[i][j] (i<j) within the section. Single-scene → 1.0.
 * Uses the pre-threaded sim matrix (honest — no stubbing).
 */
function meanIntraSectionSimFromMatrix(b: SceneBoundary, sim: number[][]): number {
  if (b.endScene === b.startScene) return 1.0;
  let sum = 0;
  let count = 0;
  for (let x = b.startScene; x <= b.endScene; x++) {
    for (let y = x + 1; y <= b.endScene; y++) {
      if (sim[x] && typeof sim[x][y] === "number") {
        sum += sim[x][y];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 1.0;
}

/**
 * Defensively extract the launcher grid from raw.tracks into SceneColumn[].
 *
 * `raw.tracks` is open-typed (`{}[]`); at runtime the arrangement snapshot
 * mirror carries `{trackSid, name, scenes: [{sceneIdx, hasContent, notes,
 * loopBeats}]}` per track. This helper pivots the track-major layout into the
 * scene-major SceneColumn[] that sceneFeatureVector consumes.
 *
 * Returns `[]` when no tracks or no scenes are present (caller refuses).
 */
function extractSceneColumns(raw: RawState): SceneColumn[] {
  const tracks = (raw as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return [];

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
  if (sceneCount === 0) return [];

  const columns: SceneColumn[] = [];
  for (let s = 0; s < sceneCount; s++) {
    const cells: SceneColumn["cells"] = [];
    for (const t of tracks) {
      if (!t || typeof t !== "object") continue;
      const track = t as { trackSid?: string; name?: string; scenes?: unknown[] };
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
        trackSid: typeof track.trackSid === "string" ? track.trackSid : "",
        trackName: typeof track.name === "string" ? track.name : "",
        hasContent,
        notes,
        loopBeats,
      });
    }
    columns.push({ sceneIdx: s, cells });
  }
  return columns;
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
