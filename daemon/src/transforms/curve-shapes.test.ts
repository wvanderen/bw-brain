// daemon/src/transforms/curve-shapes.test.ts
//
// Phase 5 / 05-08 Task 1 — the six bounded musical automation shapes
// (D-05-13 vocabulary / D-05-14 hard bounds), property-tested.
//
// Layers (the inverse-ops.test.ts discipline — curated characterization PLUS
// fast-check properties, numRuns 500):
//   1. PROPERTY (D-05-14 bounds): for arbitrary in-contract CurveSpec + any of
//      the six shapes: values ∈ [0,1], points ≤ 64, beats strictly ascending,
//      last beat within the region (≤ startBeat + lengthBars·beatsPerBar + ε).
//   2. CHARACTERIZATION: the musical names mean something — ramp_up monotone
//      up, ramp_down monotone down, dip_recover single dip + recovery,
//      rise_fall interior peak, slow_cycle ≥ 1 full period scaled by rate,
//      hold_then_move constant-prefix-then-move.
//   3. depth scales excursion; 16-bar boundary; determinism.
//   4. defaultShapeOrder ARCH-02 both halves (no/generic profile → literal
//      default order; techno bias reorders).
//   5. D-05-16 payoff: 7/4 region extents.
//   6. Refuse-not-clamp: out-of-contract specs THROW (never silently clamped).
//   7. PURITY structural: no fs/net imports, no ../patch/* imports (the
//      macro-suggest.test.ts import-surface assertion).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCurve,
  defaultShapeOrder,
  DEFAULT_SHAPE_ORDER,
  CurveSpecError,
  type ShapeName,
  type CurveSpec,
} from "./curve-shapes.js";
import { loadProfile } from "../profiles/profile-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- arbitraries (bounds mirror the D-05-14 contract, inclusive edges) -------

const SHAPES: readonly ShapeName[] = [
  "ramp_up",
  "ramp_down",
  "dip_recover",
  "rise_fall",
  "slow_cycle",
  "hold_then_move",
] as const;

const arbShape = fc.constantFrom(...SHAPES);
const arbDepth = fc.float({ min: 0, max: 1, noNaN: true });
const arbRate = fc.float({ min: 0.001, max: 4, noNaN: true });
const arbLengthBars = fc.float({ min: 1, max: 16, noNaN: true });
const arbStartBeat = fc.float({ min: 0, max: 128, noNaN: true });
const arbSpec = fc.record({
  shape: arbShape,
  depth: arbDepth,
  rate: arbRate,
  lengthBars: arbLengthBars,
  startBeat: arbStartBeat,
});
const arbBeatsPerBar = fc.constantFrom(3, 4, 5, 6, 7);

const EPS = 1e-6;

/** Sign sequence of the discrete derivative, zeros collapsed (dip counting). */
function signSequence(values: number[], tolerance = 1e-9): string {
  let out = "";
  for (let i = 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d > tolerance) out += "+";
    else if (d < -tolerance) out += "-";
  }
  return out.replace(/\++/g, "+").replace(/-+/g, "-");
}

describe("curve-shapes — property (D-05-14 hard bounds)", () => {
  it("Test 1: arbitrary spec → values ∈ [0,1], ≤ 64 points, strictly ascending beats, region-contained (numRuns: 500)", () => {
    fc.assert(
      fc.property(arbSpec, arbBeatsPerBar, (spec, beatsPerBar) => {
        const pts = buildCurve(spec, beatsPerBar);
        expect(pts.length).toBeGreaterThanOrEqual(2);
        expect(pts.length).toBeLessThanOrEqual(64);
        for (const p of pts) {
          expect(p.value).toBeGreaterThanOrEqual(0);
          expect(p.value).toBeLessThanOrEqual(1);
        }
        for (let i = 1; i < pts.length; i++) {
          expect(pts[i]!.beat).toBeGreaterThan(pts[i - 1]!.beat);
        }
        const regionEnd = spec.startBeat + spec.lengthBars * beatsPerBar;
        expect(pts[0]!.beat).toBeGreaterThanOrEqual(spec.startBeat - EPS);
        expect(pts[pts.length - 1]!.beat).toBeLessThanOrEqual(regionEnd + EPS);
      }),
      { numRuns: 500 },
    );
  });
});

describe("curve-shapes — characterization (the musical names mean something)", () => {
  it("Test 2a: ramp_up is monotonic non-decreasing", () => {
    const pts = buildCurve({ shape: "ramp_up", depth: 0.8, rate: 1, lengthBars: 4, startBeat: 0 }, 4);
    expect(signSequence(pts.map((p) => p.value))).toMatch(/^\+*$/);
  });

  it("Test 2b: ramp_down is monotonic non-increasing", () => {
    const pts = buildCurve({ shape: "ramp_down", depth: 0.8, rate: 1, lengthBars: 4, startBeat: 0 }, 4);
    expect(signSequence(pts.map((p) => p.value))).toMatch(/^\-*$/);
  });

  it("Test 2c: dip_recover starts and ends near the same value with a SINGLE dip (one −→+ transition)", () => {
    const pts = buildCurve({ shape: "dip_recover", depth: 1, rate: 1, lengthBars: 4, startBeat: 0 }, 4);
    const values = pts.map((p) => p.value);
    expect(Math.abs(values[values.length - 1]! - values[0]!)).toBeLessThan(0.05);
    const signs = signSequence(values);
    expect(signs).toMatch(/^-\+$/); // down exactly once, then up — a single dip
    const min = Math.min(...values);
    expect(min).toBeLessThan(values[0]! - 0.3); // it actually dips
  });

  it("Test 2d: rise_fall peaks in the interior", () => {
    const pts = buildCurve({ shape: "rise_fall", depth: 1, rate: 1, lengthBars: 4, startBeat: 0 }, 4);
    const values = pts.map((p) => p.value);
    const maxIdx = values.indexOf(Math.max(...values));
    expect(maxIdx).toBeGreaterThan(0);
    expect(maxIdx).toBeLessThan(values.length - 1);
    expect(Math.max(...values)).toBeGreaterThan(values[0]! + 0.3);
    expect(Math.max(...values)).toBeGreaterThan(values[values.length - 1]! + 0.3);
  });

  it("Test 2e: slow_cycle oscillates ≥ 1 full period scaled by rate (rate 1 × 2 bars → 2 periods)", () => {
    const pts = buildCurve({ shape: "slow_cycle", depth: 1, rate: 1, lengthBars: 2, startBeat: 0 }, 4);
    const values = pts.map((p) => p.value);
    // ≥ 2 local maxima for 2 full sine periods
    let maxima = 0;
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i]! >= values[i - 1]! && values[i]! > values[i + 1]! && values[i]! > 0.9) maxima++;
    }
    expect(maxima).toBeGreaterThanOrEqual(2);
    expect(Math.max(...values)).toBeGreaterThan(0.95);
    expect(Math.min(...values)).toBeLessThan(0.05);
  });

  it("Test 2f: hold_then_move is constant for a leading fraction then moves", () => {
    const pts = buildCurve({ shape: "hold_then_move", depth: 0.9, rate: 1, lengthBars: 4, startBeat: 0 }, 4);
    const values = pts.map((p) => p.value);
    let held = 0;
    while (held < values.length && Math.abs(values[held]! - values[0]!) < 1e-9) held++;
    expect(held).toBeGreaterThanOrEqual(Math.floor(values.length * 0.3)); // a real leading hold
    expect(Math.abs(values[values.length - 1]! - values[0]!)).toBeGreaterThan(0.3); // then it moves
  });

  it("Test 3: depth scales the excursion (depth 0.2 range < depth 0.9 range, same shape)", () => {
    const base = { shape: "rise_fall" as const, rate: 1, lengthBars: 4, startBeat: 0 };
    const r09 = buildCurve({ ...base, depth: 0.9 }, 4).map((p) => p.value);
    const r02 = buildCurve({ ...base, depth: 0.2 }, 4).map((p) => p.value);
    const range09 = Math.max(...r09) - Math.min(...r09);
    const range02 = Math.max(...r02) - Math.min(...r02);
    expect(range02).toBeLessThan(range09);
    expect(range09).toBeGreaterThan(0.8); // ≈ 0.9 (peak sampled near t=0.5)
    expect(range02).toBeLessThan(0.3); // ≈ 0.2
  });

  it("Test 4: lengthBars 16 at 4/4 with maxPoints 64 stays within bounds (the boundary case)", () => {
    const pts = buildCurve({ shape: "slow_cycle", depth: 1, rate: 0.25, lengthBars: 16, startBeat: 0 }, 4, 64);
    expect(pts.length).toBeLessThanOrEqual(64);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[pts.length - 1]!.beat).toBeLessThanOrEqual(0 + 16 * 4 + EPS); // ≤ 64 beats
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.beat).toBeGreaterThan(pts[i - 1]!.beat);
    }
  });

  it("Test 5: buildCurve is deterministic (same spec → deep-equal output)", () => {
    const spec: CurveSpec = { shape: "dip_recover", depth: 0.55, rate: 0.5, lengthBars: 3, startBeat: 4 };
    expect(buildCurve(spec, 4)).toStrictEqual(buildCurve(spec, 4));
    expect(buildCurve(spec, 7)).toStrictEqual(buildCurve(spec, 7));
  });

  it("Test 7: beatsPerBar from a 7/4 signature produces correct region extents (D-05-16 payoff)", () => {
    const pts = buildCurve({ shape: "ramp_up", depth: 1, rate: 1, lengthBars: 2, startBeat: 7 }, 7);
    expect(pts[0]!.beat).toBeCloseTo(7, 9);
    expect(pts[pts.length - 1]!.beat).toBeCloseTo(7 + 2 * 7, 9); // exactly 21
    expect(pts[pts.length - 1]!.beat).toBeLessThanOrEqual(7 + 2 * 7 + EPS);
  });
});

describe("defaultShapeOrder (ARCH-02 enhance-never-gate, both halves)", () => {
  it("Test 6a: no profile → the literal default order (D-05-13 canonical)", () => {
    expect(defaultShapeOrder()).toStrictEqual([...DEFAULT_SHAPE_ORDER]);
    expect(DEFAULT_SHAPE_ORDER).toStrictEqual([
      "ramp_up",
      "ramp_down",
      "dip_recover",
      "rise_fall",
      "slow_cycle",
      "hold_then_move",
    ]);
  });

  it("Test 6b: generic profile (uniform 1.0 bias) → literal default order — the generic core runs literally", () => {
    expect(defaultShapeOrder(loadProfile("generic"))).toStrictEqual([...DEFAULT_SHAPE_ORDER]);
  });

  it("Test 6c: techno bias reorders (bias desc, stable default-order tie-break)", () => {
    const order = defaultShapeOrder(loadProfile("techno"));
    expect(order).toStrictEqual(["slow_cycle", "rise_fall", "hold_then_move", "ramp_up", "ramp_down", "dip_recover"]);
    // still a permutation of the fixed six
    expect([...order].sort()).toStrictEqual([...SHAPES].sort());
  });
});

describe("refuse-not-clamp (D-05-14 hard bounds — out-of-contract spec throws)", () => {
  const ok = { shape: "ramp_up" as const, depth: 0.5, rate: 1, lengthBars: 4, startBeat: 0 };

  it("depth outside [0,1] throws CurveSpecError naming the field (no silent clamp)", () => {
    for (const depth of [1.5, -0.1]) {
      expect(() => buildCurve({ ...ok, depth }, 4)).toThrow(CurveSpecError);
      try {
        buildCurve({ ...ok, depth }, 4);
      } catch (e) {
        expect((e as Error).message).toMatch(/depth/);
      }
    }
  });

  it("rate ≤ 0 (or non-finite) throws CurveSpecError", () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildCurve({ ...ok, rate }, 4)).toThrow(CurveSpecError);
    }
  });

  it("lengthBars outside [1,16] throws CurveSpecError (the 17-bar case)", () => {
    for (const lengthBars of [0.5, 0, 17, 100]) {
      expect(() => buildCurve({ ...ok, lengthBars }, 4)).toThrow(CurveSpecError);
      try {
        buildCurve({ ...ok, lengthBars }, 4);
      } catch (e) {
        expect((e as Error).message).toMatch(/lengthBars/);
      }
    }
  });

  it("negative startBeat / bad beatsPerBar / sub-2 maxPoints throw CurveSpecError", () => {
    expect(() => buildCurve({ ...ok, startBeat: -1 }, 4)).toThrow(CurveSpecError);
    for (const bpb of [0, -4, Number.NaN]) {
      expect(() => buildCurve(ok, bpb)).toThrow(CurveSpecError);
    }
    expect(() => buildCurve(ok, 4, 1)).toThrow(CurveSpecError);
  });

  it("boundary values are ACCEPTED (inclusive edges — refuse-not-clamp never over-refuses)", () => {
    expect(buildCurve({ ...ok, depth: 0 }, 4).length).toBeGreaterThan(0);
    expect(buildCurve({ ...ok, depth: 1 }, 4).length).toBeGreaterThan(0);
    expect(buildCurve({ ...ok, lengthBars: 1 }, 4).length).toBeGreaterThan(0);
    expect(buildCurve({ ...ok, lengthBars: 16 }, 4).length).toBeGreaterThan(0);
    expect(buildCurve({ ...ok, startBeat: 0 }, 4).length).toBeGreaterThan(0);
  });
});

describe("purity (the vary.ts discipline — construction only, minting lives in the daemon)", () => {
  it("structural: no node:fs/node:net imports, no ../patch/* imports", () => {
    const source = fs.readFileSync(path.join(__dirname, "curve-shapes.ts"), "utf8");
    expect(source).not.toMatch(/node:fs/);
    expect(source).not.toMatch(/node:net/);
    expect(source).not.toMatch(/\.\.\/patch\//);
    expect(source).toMatch(/buildCurve/);
    expect(source).toMatch(/D-05-13/);
    expect(source).toMatch(/D-05-14/);
  });
});
