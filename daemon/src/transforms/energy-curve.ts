// daemon/src/transforms/energy-curve.ts
//
// P4 / 04-04 Task 1 — ARRANGE-03 energy curve.
//
// Per-bar weighted composite energy (D-05) normalized against the project's
// own peak (D-16). The bar grid is per-bar WITHIN the launched sequence
// (D-17): scenes-in-index-order, each scene contributing
// `ceil(scene.loopBeats / beatsPerBar)` bars. Each bar's composite is derived
// from THAT bar's filtered notes (genuine intra-scene energy variation — a
// 16-beat scene yields 4 distinct points, not one stepped value).
//
// The composite is `w1·noteDensity + w2·velocityAggregate + w3·polyphony +
// w4·pitchCentroid` where the weights come from `ctx.profile.energyWeights`
// (ARCH-01/ARCH-02 — generic core runs literally without a profile via the
// {0.35, 0.25, 0.20, 0.20} fallback). Normalization is linear division by
// `Math.max(raws, 1e-9)` — the project-relative peak (D-16). Every emitted
// value is ∈ [0,1] with the loudest bar = 1.0 exactly.
//
// Plugs into analyzer-registry.ts D-08 framework (produces "energyCurve") as
// the energy analyzer. Mirrors the SectionDetector wrapper shape
// (section-detector.ts:280-326): type-only back-import from analyzer-registry
// (no cycle), defensive grid extraction from raw.tracks, refuse-on-empty,
// honest confidence (NOT pre-floored — Pitfall 4; runAll owns the 0.5 floor).
//
// Source: RESEARCH.md §Code Examples lines 770-789 (energyCurve +
// normalizeAgainstPeak shapes) + §D-16 (linear-against-peak) + §D-17 (per-bar
// within launched sequence) + §Pitfall 4 (no pre-floor) + §PATTERNS.md
// §energy-curve.ts (lines 335-342).
//
// PURE module: no fs/net imports. Mirrors motif-signature.ts + scene-features.ts
// discipline (documented interfaces, @example JSDoc, NO side effects).

import type { Note } from "../cli/diff-logic.js";
import type { SceneColumn } from "./scene-features.js";
import type {
  Analyzer,
  AnalyzeContext,
  DerivedField,
  RawState,
} from "../state/analyzer-registry.js";

/**
 * D-05 energy composite weights. The four weights SHOULD sum to ~1.0 (the
 * profile loader emits a console.warn at load if the sum deviates > 0.01 from
 * 1.0 — ARCH-02 "enhance never gate"; the analyzer consumes them as-authored).
 */
export interface EnergyWeights {
  noteDensity: number;
  velocityAggregate: number;
  polyphony: number;
  /** Velocity-weighted mean pitch (scaled to [0,1] via /127). */
  pitchCentroid: number;
}

/** A single per-bar energy point. `value` ∈ [0,1] with the project peak = 1.0. */
export interface EnergyPoint {
  /** Global bar index across the launched sequence (contiguous [0..n-1]). */
  bar: number;
  /** Normalized energy ∈ [0,1] (1.0 = the project's own peak bar). */
  value: number;
}

/**
 * ARCH-02 fallback weights (generic-profile defaults — used when
 * `ctx.profile.energyWeights` is absent so the generic core runs literally
 * without a profile). Sum = 1.0.
 */
export const DEFAULT_ENERGY_WEIGHTS: EnergyWeights = {
  noteDensity: 0.35,
  velocityAggregate: 0.25,
  polyphony: 0.20,
  pitchCentroid: 0.20,
};

/** Default beats per bar (4/4 time). The daemon may override via ctx. */
const DEFAULT_BEATS_PER_BAR = 4;

/**
 * Linear normalization against the project's own peak (D-16). Pure.
 *
 * Divides every value by `Math.max(...values, 1e-9)`. The 1e-9 floor guards
 * divide-by-zero (mirrors motif-signature.ts:80 `|| 1` discipline) so an
 * all-zero input yields all-zeros (NOT NaN). The max entry normalizes to
 * exactly 1.0; every other entry is its ratio to the peak.
 *
 * @example
 * normalizeAgainstPeak([3, 1, 2]); // [1.0, 0.333..., 0.666...]
 * normalizeAgainstPeak([0, 0, 0]); // [0, 0, 0] (zero-guard)
 */
export function normalizeAgainstPeak(values: number[]): number[] {
  if (values.length === 0) return [];
  const peak = Math.max(...values, 1e-9); // D-16 zero-guard
  return values.map((v) => v / peak);
}

/**
 * Per-bar weighted composite energy curve (D-05/D-17). Pure.
 *
 * For each scene in index order:
 *   1. Determine the scene's loop length = `max(loopBeats)` across active cells
 *      (0 if the scene has no active cells → contributes 0 bars).
 *   2. Bar count = `ceil(loopBeats / beatsPerBar)`.
 *   3. For each bar `b`: filter the scene's active cells' notes to those whose
 *      `start` ∈ `[b·beatsPerBar, (b+1)·beatsPerBar)`, then derive the four
 *      signals fresh from THAT bar's notes (NOT the scene aggregate):
 *        - noteDensity = barNotes.length / beatsPerBar
 *        - velocityAggregate = mean(barNotes.velocity) / 127
 *        - polyphony = max simultaneous notes at any single start time in the bar
 *        - pitchCentroid = velocity-weighted mean pitch / 127
 *      Weighted sum → raw bar energy. Empty bars → 0.
 *   4. Global bar index increments across scenes in order.
 *
 * After all scenes: `normalizeAgainstPeak` the collected raws; emit
 * `{bar, value}` points. Peak bar = 1.0 exactly; every value ∈ [0,1].
 *
 * @param columns - the scene-major grid (one SceneColumn per scene index).
 * @param weights - the four D-05 composite weights (sum ~1.0).
 * @param beatsPerBar - default 4 (4/4 time).
 * @returns EnergyPoint[] with contiguous global bar indices. `[]` for empty
 *   input or an all-empty grid.
 *
 * @example
 * const pts = energyCurve([denseScene, sparseScene], weights);
 * // pts.length === 8 (4 bars × 2 scenes); peak === 1.0; dense bars > sparse.
 */
export function energyCurve(
  columns: SceneColumn[],
  weights: EnergyWeights,
  beatsPerBar: number = DEFAULT_BEATS_PER_BAR,
): EnergyPoint[] {
  if (columns.length === 0) return [];
  const bpb = Math.max(1, beatsPerBar); // guard against 0/negative

  const raws: number[] = [];
  let globalBar = 0;

  for (const col of columns) {
    const activeCells = col.cells.filter((c) => c.hasContent);
    if (activeCells.length === 0) continue; // no active cells → 0 bars (D-17)

    const loopBeats = Math.max(...activeCells.map((c) => c.loopBeats), 0);
    const barCount = Math.ceil(loopBeats / bpb);

    for (let b = 0; b < barCount; b++) {
      const barStart = b * bpb;
      const barEnd = (b + 1) * bpb;
      // Collect notes from all active cells whose start ∈ [barStart, barEnd).
      const barNotes: Note[] = [];
      for (const cell of activeCells) {
        for (const n of cell.notes) {
          if (n.start >= barStart && n.start < barEnd) barNotes.push(n);
        }
      }
      raws.push(rawBarEnergy(barNotes, weights, bpb));
      globalBar++;
    }
  }

  if (raws.length === 0) return [];
  const normalized = normalizeAgainstPeak(raws);
  return normalized.map((value, i) => ({ bar: i, value }));
}

/**
 * Compute the raw (pre-normalization) weighted composite for one bar's notes.
 * Pure. Empty notes → 0 (the gap is visible post-normalization as a 0 value).
 *
 * The four signals (D-05):
 *   - noteDensity: barNotes.length / beatsPerBar (notes per beat-of-bar)
 *   - velocityAggregate: mean(velocity) / 127 (∈ [0,1])
 *   - polyphony: max simultaneous notes at any single start time
 *     (scaled by /16 to bring into ~[0,1] range — mirrors scene-features.ts
 *     polyphony scaling)
 *   - pitchCentroid: velocity-weighted mean pitch / 127 (∈ [0,1])
 *
 * noteDensity is NOT pre-scaled (it can exceed 1 for very dense bars); the
 * weighted composite still normalizes against peak afterward, so the final
 * value is ∈ [0,1]. This matches D-05's "weighted multi-signal composite"
 * framing — density contributes proportionally.
 */
function rawBarEnergy(notes: Note[], w: EnergyWeights, beatsPerBar: number): number {
  if (notes.length === 0) return 0;

  // --- noteDensity: notes per beat-of-bar. ---
  const noteDensity = notes.length / beatsPerBar;

  // --- velocityAggregate: mean velocity / 127. ---
  const velocityAggregate =
    notes.reduce((s, n) => s + n.velocity, 0) / notes.length / 127;

  // --- polyphony: max simultaneous notes at any single start time (scaled). ---
  const byStart = new Map<number, number>();
  for (const n of notes) {
    const bucket = Math.round(n.start * 100) / 100; // merge quantization jitter
    byStart.set(bucket, (byStart.get(bucket) ?? 0) + 1);
  }
  const polyphony = Math.max(...byStart.values(), 1) / 16; // scale to ~[0,1]

  // --- pitchCentroid: velocity-weighted mean pitch / 127. ---
  const velSum = notes.reduce((s, n) => s + n.velocity, 0);
  const pitchCentroid =
    velSum > 0
      ? notes.reduce((s, n) => s + n.pitch * n.velocity, 0) / velSum / 127
      : 0;

  return (
    w.noteDensity * noteDensity +
    w.velocityAggregate * velocityAggregate +
    w.polyphony * polyphony +
    w.pitchCentroid * pitchCentroid
  );
}

/**
 * D-08 analyzer-plugin: energy curve. id "energyCurve", consumes ["clips"]
 * (the launcher-grid snapshot mirror), produces ["energyCurve"]. Pure (never
 * mutates raw).
 *
 * Defensively extracts the launcher grid from `raw.tracks` (the snapshot
 * mirror's track-major layout, pivoted into scene-major SceneColumn[] — the
 * same extraction SectionDetector uses). When the grid is absent or empty →
 * returns [] (refuse — no guess).
 *
 * Confidence is honest 1.0 (energy is deterministic from features — the
 * composite + normalization have no inferential step). runAll never drops it
 * (1.0 ≥ 0.5). The assumptions[] surfaces the weight source (profile vs
 * default) so a downstream consumer knows which weights produced the curve.
 */
export const EnergyCurve: Analyzer = {
  id: "energyCurve",
  consumes: ["clips"],
  produces: ["energyCurve"],
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const columns = extractSceneColumns(raw);
    if (columns.length === 0) return []; // refuse — no grid, no guess

    const weights = ctx.profile?.energyWeights ?? DEFAULT_ENERGY_WEIGHTS;
    const profileName = ctx.profile?.name ?? "generic";

    const points = energyCurve(columns, weights);
    if (points.length === 0) return [];

    return [
      {
        field: "energyCurve",
        value: points,
        confidence: 1.0, // deterministic from features — honest 1.0
        assumptions: [
          {
            claim: "weighted composite (noteDensity + velocity + polyphony + pitchCentroid) normalized against project peak",
            confidence: 1.0,
            source: "default",
          },
          {
            claim: `weights from profile: ${profileName}`,
            confidence: 1.0,
            source: "config",
          },
        ],
      },
    ];
  },
};

/**
 * Defensively extract the launcher grid from raw.tracks into SceneColumn[].
 *
 * Duplicated from section-detector.ts (extractSceneColumns) to preserve module
 * independence per the plan's pure-module stance. `raw.tracks` is open-typed
 * (`{}[]`); at runtime the arrangement snapshot mirror carries
 * `{trackSid, name, scenes: [{sceneIdx, hasContent, notes, loopBeats}]}` per
 * track. This helper pivots the track-major layout into the scene-major
 * SceneColumn[] that energyCurve consumes.
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
