// daemon/src/transforms/curve-shapes.ts
//
// Phase 5 / 05-08 Task 1 — the fixed six-shape automation vocabulary
// (D-05-13) under the D-05-14 hard bounds: ≤ 64 points, region ≤ 16 bars,
// values ∈ [0,1]. The vocabulary AUTO-03's automation.propose op builds
// candidates from — construction only, never authority.
//
// PURE module (the vary.ts:28-31 discipline): no fs/net. Minting happens in
// the daemon dispatch (Task 2 handleAutomationPropose), NOT here.
//
// Don't-Hand-Roll EXEMPTION (deliberate): the shape generators below ARE the
// product — the musical meaning of "dip and recover" is exactly this math.
// Hand-rolled by design, property-tested (curve-shapes.test.ts) instead of
// delegated to a curve library.
//
// D-05-14 REFUSE-NOT-CLAMP: an out-of-contract CurveSpec (depth outside
// [0,1], rate ≤ 0, lengthBars outside [1,16], negative startBeat, bad
// beatsPerBar/maxPoints) THROWS {@link CurveSpecError} with a named message
// naming the offending field — the caller surfaces it as a named refusal.
// NEVER a silent clamp of an out-of-contract request.
//
// ARCH-02 (enhance-never-gate): {@link defaultShapeOrder} biases shape
// ordering from the profile's automationShapes.shapeBias ONLY when present;
// uniform weights (generic) or an absent block return the literal default
// order — the generic core runs literally.

import type { Profile } from "../gen/profile.js";

/** The fixed six-shape automation vocabulary (D-05-13 — closed set). */
export type ShapeName =
  | "ramp_up"
  | "ramp_down"
  | "dip_recover"
  | "rise_fall"
  | "slow_cycle"
  | "hold_then_move";

/**
 * One automation curve construction request. All fields are REQUIRED and
 * bounded (D-05-14): depth ∈ [0,1] (excursion scaling), rate > 0 (cycles per
 * bar — drives slow_cycle's period count; the five single-gesture shapes
 * validate-and-carry it on the uniform parameter surface), lengthBars ∈
 * [1,16], startBeat ≥ 0 (absolute, region start).
 */
export interface CurveSpec {
  shape: ShapeName;
  /** Excursion depth ∈ [0,1] — scales the curve's range around its center. */
  depth: number;
  /** Cycle rate > 0 in cycles/bar (e.g. 0.125 = one cycle per 8 bars). */
  rate: number;
  /** Region length in bars ∈ [1,16] (D-05-14 hard bound). */
  lengthBars: number;
  /** Absolute region start beat ≥ 0 (startBar · beatsPerBar at the op layer). */
  startBeat: number;
}

/** One generated automation point: an absolute beat + a normalized value. */
export interface CurvePoint {
  beat: number;
  value: number;
}

/**
 * Thrown by {@link buildCurve} on an out-of-contract spec (D-05-14
 * refuse-not-clamp). The message names the offending field so the caller can
 * surface a precise named refusal — never a silent clamp.
 */
export class CurveSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurveSpecError";
  }
}

/**
 * The canonical D-05-13 shape order — also the default `defaultShapeOrder`
 * result for a profileless / uniform-bias run (ARCH-02 literal).
 */
export const DEFAULT_SHAPE_ORDER: readonly ShapeName[] = [
  "ramp_up",
  "ramp_down",
  "dip_recover",
  "rise_fall",
  "slow_cycle",
  "hold_then_move",
] as const;

/** Default resampling resolution: 4 points per beat (16th-note grid). */
const POINTS_PER_BEAT = 4;

/** The D-05-14 point-count ceiling (patch.schema.json automation_points maxItems). */
export const MAX_CURVE_POINTS = 64;

/** Numeric tolerance for float comparisons (region containment, monotonicity). */
const EPS = 1e-9;

/** Clamp into [0,1] (normalizeAgainstPeak discipline — defensive float guard). */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Smoothstep easing (3t² − 2t³) — monotonic, musical ramp interpolation. */
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Refuse-not-clamp spec validation (D-05-14). Throws {@link CurveSpecError}. */
function assertSpec(spec: CurveSpec, beatsPerBar: number, maxPoints: number): void {
  const { shape, depth, rate, lengthBars, startBeat } = spec;
  if (!DEFAULT_SHAPE_ORDER.includes(shape)) {
    throw new CurveSpecError(
      `curve spec invalid: shape '${String(shape)}' is not one of the fixed six (D-05-13) — refusing, not clamping`,
    );
  }
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) {
    throw new CurveSpecError(
      `curve spec invalid: depth must be within [0,1] (got ${String(depth)}) — refusing, not clamping (D-05-14)`,
    );
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new CurveSpecError(
      `curve spec invalid: rate must be > 0 (got ${String(rate)}) — refusing, not clamping (D-05-14)`,
    );
  }
  if (!Number.isFinite(lengthBars) || lengthBars < 1 || lengthBars > 16) {
    throw new CurveSpecError(
      `curve spec invalid: lengthBars must be within [1,16] (got ${String(lengthBars)}) — refusing, not clamping (D-05-14)`,
    );
  }
  if (!Number.isFinite(startBeat) || startBeat < 0) {
    throw new CurveSpecError(
      `curve spec invalid: startBeat must be ≥ 0 (got ${String(startBeat)}) — refusing, not clamping`,
    );
  }
  if (!Number.isFinite(beatsPerBar) || beatsPerBar <= 0) {
    throw new CurveSpecError(
      `curve spec invalid: beatsPerBar must be > 0 (got ${String(beatsPerBar)}) — refusing, not clamping`,
    );
  }
  if (!Number.isFinite(maxPoints) || maxPoints < 2) {
    throw new CurveSpecError(
      `curve spec invalid: maxPoints must be ≥ 2 (got ${String(maxPoints)}) — refusing, not clamping (D-05-14)`,
    );
  }
}

/**
 * The normalized base curve s(t) ∈ [0,1] for each shape, t ∈ [0,1] the region
 * fraction, `cycles` = rate · lengthBars (the slow_cycle period count).
 *
 * @example
 * baseValue("rise_fall", 0.5, 4); // ≈ 1.0 — the interior peak
 */
function baseValue(shape: ShapeName, t: number, cycles: number): number {
  switch (shape) {
    // @example ramp_up — eased rise from low to high across the region.
    case "ramp_up":
      return easeInOut(t);
    // @example ramp_down — eased fall from high to low.
    case "ramp_down":
      return 1 - easeInOut(t);
    // @example dip_recover — cosine dip: starts/ends high, ONE interior valley.
    case "dip_recover":
      return 0.5 + 0.5 * Math.cos(2 * Math.PI * t);
    // @example rise_fall — sine arch: rises from low, peaks interior, returns low.
    case "rise_fall":
      return Math.sin(Math.PI * t);
    // @example slow_cycle — sine cycle generator; `cycles` full periods over
    // the region (rate cycles/bar × lengthBars bars — e.g. rate 0.125 over 8
    // bars = exactly one slow cycle).
    case "slow_cycle":
      return 0.5 + 0.5 * Math.sin(2 * Math.PI * cycles * t);
    // @example hold_then_move — holds the start value for the leading half of
    // the region, then eases to the end value.
    case "hold_then_move":
      return t < 0.5 ? 0 : easeInOut((t - 0.5) / 0.5);
  }
}

/**
 * Generate the bounded automation point list for a {@link CurveSpec}. Pure +
 * deterministic (same spec → deep-equal output).
 *
 * Resolution: 4 points per beat resampled down to ≤ `maxPoints` (D-05-14
 * ceiling 64). Beats ascend strictly from `spec.startBeat` to exactly
 * `startBeat + lengthBars · beatsPerBar`; values are depth-scaled around the
 * 0.5 center (excursion = depth · base range) and clamped into [0,1]
 * (defensive float guard — the math already stays in range).
 *
 * @param spec        - the construction request (validated; throws on violation).
 * @param beatsPerBar - project meter (D-05-16 payoff: 7/4 → 7). Default 4.
 * @param maxPoints   - point ceiling (default 64, the schema maxItems).
 * @returns ascending {@link CurvePoint}[] — absolute beats, values ∈ [0,1].
 * @throws {CurveSpecError} when the spec is out of contract (refuse-not-clamp).
 *
 * @example
 * buildCurve({ shape: "ramp_up", depth: 0.8, rate: 1, lengthBars: 4, startBeat: 0 }, 4);
 * // => [{beat: 0, ...}, ... {beat: 16, ...}] — eased rise, ≤ 64 points
 */
export function buildCurve(
  spec: CurveSpec,
  beatsPerBar: number = 4,
  maxPoints: number = MAX_CURVE_POINTS,
): CurvePoint[] {
  assertSpec(spec, beatsPerBar, maxPoints);
  const totalBeats = spec.lengthBars * beatsPerBar;
  const n = Math.max(2, Math.min(maxPoints, Math.round(totalBeats * POINTS_PER_BEAT)));
  const cycles = spec.rate * spec.lengthBars;
  const pts: CurvePoint[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1); // region fraction; n ≥ 2 so f spans [0,1] strictly ascending
    const s = baseValue(spec.shape, f, cycles);
    const value = clamp01(0.5 + (s - 0.5) * spec.depth);
    pts.push({ beat: spec.startBeat + f * totalBeats, value });
  }
  return pts;
}

/**
 * The D-05-13 shape order for a run: biased by the profile's
 * automationShapes.shapeBias when present (bias desc, stable tie-break by the
 * canonical order), the literal {@link DEFAULT_SHAPE_ORDER} otherwise.
 *
 * ARCH-02 both halves: an ABSENT block and a UNIFORM block (generic — all
 * weights equal) both return the literal default order byte-identically; a
 * biased block (techno) ENHANCES the ordering without ever refusing. Unknown
 * shape names in a hand-edited bias degrade to the default weight (1.0),
 * never a crash.
 *
 * @param profile - optional genre profile (the `ctx.profile?.automationShapes
 *                  ?? DEFAULT` pattern — generic runs literally).
 * @returns the six shape names in preference order (a permutation).
 *
 * @example
 * defaultShapeOrder(); // ["ramp_up", ..., "hold_then_move"] — literal
 * defaultShapeOrder(loadProfile("techno")); // slow_cycle first (1.5 bias)
 */
export function defaultShapeOrder(profile?: Profile): ShapeName[] {
  const bias = profile?.automationShapes?.shapeBias;
  if (bias === undefined) return [...DEFAULT_SHAPE_ORDER];
  const weight = (name: ShapeName): number => {
    const w = (bias as unknown as Record<string, unknown>)[name];
    return typeof w === "number" && Number.isFinite(w) ? w : 1.0;
  };
  return [...DEFAULT_SHAPE_ORDER].sort((a, b) => {
    const d = weight(b) - weight(a); // bias desc
    if (d !== 0) return d;
    return DEFAULT_SHAPE_ORDER.indexOf(a) - DEFAULT_SHAPE_ORDER.indexOf(b); // stable
  });
}
