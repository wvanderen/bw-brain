// daemon/src/transforms/repetition-report.ts
//
// P4 / 04-03 Task 2 — ARRANGE-02 repetition report.
//
// The graph-cut twin of section-detector: the SAME Plan 02 self-similarity
// matrix, cut via union-find (transitive closure over high-affinity scene
// pairs) instead of contiguous agglomerative. Grouped repetition clusters
// (D-06/D-15): sets of scenes that are musically similar, each with a
// similarity score + the feature dimensions that matched.
//
// Singleton groups are FILTERED — "scene 3 is similar to itself" is not a
// repetition (the critical D-15 invariant). Below-threshold → no clusters
// (refuse rather than guess — the recurring stance, encoded in runAll).
//
// PURE module: no fs/net imports. Mirrors section-detector.ts +
// motif-signature.ts discipline (documented interfaces, @example JSDoc, type-
// only back-import from analyzer-registry — no cycle).
//
// Source: RESEARCH.md §Pattern 2 (lines 352-358) + §Code Examples (lines
// 734-756) + §D-15 (union-find above profile threshold) + §Pitfall 4.

import type { Profile } from "../gen/profile.js";
import type { Note } from "../cli/diff-logic.js";
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
 * A grouped repetition cluster: a set of musically-similar scenes.
 *
 * - `group`: sceneIdx values in the cluster (always ≥ 2 — singletons filtered).
 * - `similarity`: mean pairwise cosine affinity within the group. ∈ [0, 1].
 * - `matchedOn`: feature dimensions that drove the similarity (e.g.
 *   `["pcp", "density"]`). Empty when the driving dimensions are ambiguous.
 *
 * @example
 * { group: [0, 4, 8], similarity: 0.91, matchedOn: ["density", "pcp"] }
 */
export interface RepetitionCluster {
  group: number[];
  similarity: number;
  matchedOn: string[];
}

/**
 * Default repetition threshold (D-15). Scene pairs at or above this cosine
 * affinity are unioned into the same cluster. Profile-sourced override:
 * `ctx.profile.repetitionThreshold` (not yet on the Profile type — Plan 04-02
 * extended energyWeights/sectionLabels/roleTemplates but not this field; the
 * Analyzer wrapper casts locally and falls back to this default).
 */
const DEFAULT_REPETITION_THRESHOLD = 0.7;

/**
 * Union-find (disjoint-set) transitive closure over scene pairs where cosine
 * affinity ≥ `threshold`. PURE.
 *
 * Algorithm (D-15):
 *   1. Initialize parent[i] = i for every scene.
 *   2. For every pair (i, j) where sim[i][j] ≥ threshold: union(i, j).
 *   3. Group scenes by root.
 *   4. FILTER singleton groups (a group of one is NOT a repetition).
 *   5. For each cluster: compute mean pairwise similarity + matchedOn (the
 *      feature dimensions whose per-dimension products drove the similarity).
 *
 * Transitive closure: A~B and B~C ⇒ A,B,C grouped, even when A≁C directly.
 * This is the property that makes union-find the right tool (per-scene
 * nearest-neighbor misses transitive families).
 *
 * @param features - the per-scene feature vectors (for matchedOn computation).
 * @param sim - the n×n cosine-affinity matrix from selfSimilarityMatrix.
 * @param threshold - cosine affinity floor for unioning a pair.
 * @returns RepetitionCluster[] (singleton groups already filtered). `[]` when
 *   no pairs clear the threshold or when n < 2.
 *
 * @example
 * const sim = selfSimilarityMatrix(features);
 * const clusters = repetitionClusters(features, sim, 0.7);
 * // clusters[0].group.length >= 2 (singletons never appear)
 */
export function repetitionClusters(
  features: SceneFeatureVector[],
  sim: number[][],
  threshold: number,
): RepetitionCluster[] {
  const n = features.length;
  if (n < 2) return []; // can't have repetition with < 2 scenes

  // Union-Find: Int32Array parent with path compression.
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    // Path compression: point every node on the path directly at the root.
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };

  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Union every pair at or above threshold. sim is symmetric; iterate i < j.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sim[i] && typeof sim[i][j] === "number" && sim[i][j] >= threshold) {
        union(i, j);
      }
    }
  }

  // Group scene indices by root.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root);
    if (arr) arr.push(i);
    else groups.set(root, [i]);
  }

  // Build clusters: filter singletons, compute similarity + matchedOn.
  const clusters: RepetitionCluster[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue; // singleton — NOT a repetition
    const similarity = meanPairwiseSimilarity(group, sim);
    const matchedOn = computeMatchedOn(features, group);
    clusters.push({ group: [...group], similarity, matchedOn });
  }
  return clusters;
}

/**
 * Mean pairwise cosine affinity within a group. For a 2-scene group, this is
 * sim[a][b]. For larger groups, the mean of sim[i][j] over all i<j in the group.
 */
function meanPairwiseSimilarity(group: number[], sim: number[][]): number {
  if (group.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let x = 0; x < group.length; x++) {
    for (let y = x + 1; y < group.length; y++) {
      const i = group[x];
      const j = group[y];
      if (sim[i] && typeof sim[i][j] === "number") {
        sum += sim[i][j];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * The feature dimensions that drove the similarity within a cluster.
 *
 * The normalized feature vector layout (from scene-features.ts) is:
 *   [0]      noteDensity
 *   [1..12]  pcp (12 bins)
 *   [13]     velocityAggregate
 *   [14]     activeTrackCount
 *   [15]     lengthBeats / 16
 *   [16]     pitchCentroid / 127
 *   [17]     polyphony / 16
 *
 * For each band, compute the mean per-dimension product (u[k] * v[k]) across
 * all pairs in the group. A band is "matched" when its mean product exceeds
 * the overall mean product across ALL dimensions — i.e. that band contributed
 * above-average to the dot product that drove the similarity.
 *
 * Returns the matched band names. Empty when the vectors are empty or all
 * bands contribute uniformly (ambiguous).
 */
function computeMatchedOn(features: SceneFeatureVector[], group: number[]): string[] {
  if (group.length < 2) return [];
  const dims = features[group[0]]?.normalized.length ?? 0;
  if (dims === 0) return [];

  // Accumulate per-dimension products across all pairs.
  const products = new Array(dims).fill(0);
  let pairCount = 0;
  for (let x = 0; x < group.length; x++) {
    const fx = features[group[x]].normalized;
    if (fx.length !== dims) return []; // mismatched lengths — ambiguous
    for (let y = x + 1; y < group.length; y++) {
      const fy = features[group[y]].normalized;
      if (fy.length !== dims) return [];
      for (let k = 0; k < dims; k++) products[k] += fx[k] * fy[k];
      pairCount++;
    }
  }
  if (pairCount === 0) return [];

  const meanProducts = products.map((p) => p / pairCount);
  const overallMean = meanProducts.reduce((s, p) => s + p, 0) / dims;

  // Named bands mapping to the normalized-vector layout.
  const bands: Array<{ name: string; start: number; end: number }> = [
    { name: "density", start: 0, end: 1 },
    { name: "pcp", start: 1, end: 13 },
    { name: "velocity", start: 13, end: 14 },
    { name: "activeTracks", start: 14, end: 15 },
    { name: "length", start: 15, end: 16 },
    { name: "pitchCentroid", start: 16, end: 17 },
    { name: "polyphony", start: 17, end: 18 },
  ];

  const matchedOn: string[] = [];
  for (const band of bands) {
    if (band.end > dims) continue; // vector shorter than this band's range
    let sum = 0;
    const span = band.end - band.start;
    for (let k = band.start; k < band.end; k++) sum += meanProducts[k];
    const bandMean = span > 0 ? sum / span : 0;
    // A band "matched" when its mean product is positive AND at least the
    // overall mean (it contributed above-average to the dot product).
    if (bandMean > 0 && bandMean >= overallMean) {
      matchedOn.push(band.name);
    }
  }
  return matchedOn;
}

// ---------------------------------------------------------------------------
// RepetitionReport — Analyzer plugin (D-08)
// ---------------------------------------------------------------------------

/**
 * D-08 analyzer-plugin: repetition detection. id "repetition", consumes
 * ["clips"] (the launcher-grid snapshot mirror), produces ["repetition"].
 * Pure (never mutates raw).
 *
 * Defensively extracts the launcher grid from `raw.tracks`. When the grid is
 * absent, has < 2 scenes, or yields no clusters → returns [] (refuse — no
 * repetition found is honest, NOT a guess).
 *
 * Threshold: profile-sourced via `ctx.profile.repetitionThreshold` (default
 * 0.7 — D-15). The Profile type does not yet carry `repetitionThreshold`
 * (Plan 04-02 added energyWeights/sectionLabels/roleTemplates but not this
 * field); the wrapper casts locally and falls back. Future profile extension
 * can add the field without touching this analyzer.
 *
 * Confidence = mean cluster similarity (honest ∈ [0,1]; NOT pre-floored —
 * Pitfall 4). runAll drops < 0.5.
 */
export const RepetitionReport: Analyzer = {
  id: "repetition",
  consumes: ["clips"],
  produces: ["repetition"],
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const columns = extractSceneColumns(raw);
    if (columns.length < 2) return []; // can't repeat with < 2 scenes — refuse
    const features = columns.map(sceneFeatureVector);
    const sim = selfSimilarityMatrix(features);
    // Profile-sourced threshold (ARCH-02 fallback to 0.7 generic). The cast
    // documents the missing Profile field; the ?? default honors ARCH-02
    // (generic core runs literally without the field).
    const profileThreshold = (ctx.profile as (Profile & { repetitionThreshold?: number }) | undefined)?.repetitionThreshold;
    const threshold = profileThreshold ?? DEFAULT_REPETITION_THRESHOLD;
    const clusters = repetitionClusters(features, sim, threshold);
    if (clusters.length === 0) return []; // no repetition found — honest refuse
    const meanSim = clusters.reduce((s, c) => s + c.similarity, 0) / clusters.length;
    return [
      {
        field: "repetition",
        value: clusters,
        confidence: meanSim,
        assumptions: [
          {
            claim: `derived from ${features.length} scenes via union-find transitive closure (threshold ${threshold.toFixed(2)})`,
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

// ---------------------------------------------------------------------------
// Grid extraction helper (mirrors section-detector.ts — kept duplicated so
// each analyzer module stays self-contained per the plan's pure-module stance)
// ---------------------------------------------------------------------------

/**
 * Defensively extract the launcher grid from raw.tracks into SceneColumn[].
 * Mirrors section-detector.ts:extractSceneColumns — track-major → scene-major
 * pivot. Returns `[]` when no tracks or no scenes are present.
 */
function extractSceneColumns(raw: RawState): SceneColumn[] {
  const tracks = (raw as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks) || tracks.length === 0) return [];

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
      const cell = scene as { hasContent?: boolean; notes?: unknown; loopBeats?: number };
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
