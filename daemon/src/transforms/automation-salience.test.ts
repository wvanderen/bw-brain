// daemon/src/transforms/automation-salience.test.ts
//
// Phase 5 / 05-04 Task 1 — AUTO-01 automation-salience analyzer (D-05-01/D-05-03).
//
// Behavior contract (05-04-PLAN):
//   1. remote_page (macro/page) source OUTRANKS device_parameter at equal
//      movementCount — explicit intent beats inference (D-05-03).
//   2. salience is monotonically non-decreasing in valueRange (movementCount
//      fixed) — property test.
//   3. movementCount 0 (never moved) still scores, but below any observation
//      with movementCount ≥ 3 and comparable range.
//   4. role/energy priors boost scores WITHOUT changing macro-vs-non-macro
//      rank order.
//   5. Analyzer plugin refuses on empty folded parameters ([] — no data, no
//      guess) and emits a DerivedField with non-empty assumptions[] otherwise.
//   6. every score ∈ [0,1] — property test.
//
// Mirrors energy-curve.test.ts (pure-fn discipline + fast-check properties +
// Analyzer plugin assertions).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFile } from "node:fs/promises";
import {
  automationSalience,
  AutomationSalience,
  type ParamObservation,
  type SaliencePriors,
  type RankedSalienceParam,
} from "./automation-salience.js";
import type { Analyzer, DerivedField } from "../state/analyzer-registry.js";

/** Observation builder (the 05-01 folded aggregate shape — 8 bounded scalars). */
function obs(partial: Partial<ParamObservation> = {}): ParamObservation {
  return {
    deviceKey: "dev_0123456789abcdef",
    paramIndex: 0,
    source: "device_parameter",
    movementCount: 10,
    lastValue: 0.5,
    minValue: 0.2,
    maxValue: 0.8,
    lastMovedAt: 1_000,
    ...partial,
  };
}

describe("automationSalience — pure score function (D-05-01/D-05-03)", () => {
  it("Test 1: remote_page source with movementCount 20 OUTSCORES device_parameter with movementCount 20 (macro-first, D-05-03)", () => {
    const macro = obs({ source: "remote_page", movementCount: 20 });
    const device = obs({ source: "device_parameter", movementCount: 20 });
    const macroScore = automationSalience(macro);
    const deviceScore = automationSalience(device);
    expect(macroScore).toBeGreaterThan(deviceScore);
  });

  it("Test 2 (property): salience is monotonically non-decreasing in valueRange at fixed movementCount", () => {
    // Construction: lastValue pinned at the observed-range MIDPOINT (variance
    // proxy maximal + constant across the pair) with a small vs a strictly
    // larger half-width. Constraints keep min ≥ 0 / max ≤ 1 so the range is
    // honest (last ∈ [0.30,0.70], w ≤ 0.25).
    const lastArb = fc.integer({ min: 30, max: 70 }).map((v) => v / 100);
    const wSmallArb = fc.integer({ min: 5, max: 20 }).map((v) => v / 100);
    const wBigArb = fc.integer({ min: 21, max: 25 }).map((v) => v / 100);
    const mcArb = fc.integer({ min: 0, max: 400 });
    fc.assert(
      fc.property(lastArb, wSmallArb, wBigArb, mcArb, (last, w1, w2, mc) => {
        const smaller = obs({
          movementCount: mc,
          lastValue: last,
          minValue: last - w1,
          maxValue: last + w1,
        });
        const larger = obs({
          movementCount: mc,
          lastValue: last,
          minValue: last - w2,
          maxValue: last + w2,
        });
        expect(larger.maxValue - larger.minValue).toBeGreaterThan(smaller.maxValue - smaller.minValue);
        expect(automationSalience(larger)).toBeGreaterThanOrEqual(automationSalience(smaller));
      }),
    );
  });

  it("Test 3: movementCount 0 still scores but BELOW movementCount 3 with comparable range", () => {
    const never = obs({ movementCount: 0 });
    const barely = obs({ movementCount: 3 });
    const neverScore = automationSalience(never);
    expect(neverScore).toBeGreaterThan(0);
    expect(neverScore).toBeLessThan(automationSalience(barely));
  });

  it("Test 4: high priors boost scores without changing macro-vs-device rank order", () => {
    const high: SaliencePriors = { roleSalience: 1.0, energyAtMovement: 1.0 };
    const macro = obs({ source: "remote_page", movementCount: 5, minValue: 0.4, maxValue: 0.6, lastValue: 0.5 });
    const device = obs({ source: "device_parameter", movementCount: 5, minValue: 0.4, maxValue: 0.6, lastValue: 0.5 });
    const mAbsent = automationSalience(macro);
    const dAbsent = automationSalience(device);
    const mHigh = automationSalience(macro, high);
    const dHigh = automationSalience(device, high);
    // Priors boost both (multiplier 1.4 > the absent-prior default 1.2).
    expect(mHigh).toBeGreaterThan(mAbsent);
    expect(dHigh).toBeGreaterThan(dAbsent);
    // ... and never flip the macro-first rank order (D-05-03).
    expect(mAbsent).toBeGreaterThan(dAbsent);
    expect(mHigh).toBeGreaterThan(dHigh);
  });

  it("Test 6 (property): every score ∈ [0,1] and finite (clamped)", () => {
    const valueArb = fc.integer({ min: 0, max: 100 }).map((v) => v / 100);
    const obsArb = fc
      .record({
        mc: fc.integer({ min: 0, max: 600 }),
        a: valueArb,
        b: valueArb,
        last: valueArb,
        source: fc.constantFrom("device_parameter" as const, "remote_page" as const),
      })
      .map(({ mc, a, b, last, source }) =>
        obs({ movementCount: mc, source, minValue: Math.min(a, b), maxValue: Math.max(a, b), lastValue: last }),
      );
    const priorsArb = fc.option(
      fc.record({ roleSalience: valueArb, energyAtMovement: valueArb }),
      { nil: undefined },
    );
    fc.assert(
      fc.property(obsArb, priorsArb, (o, p) => {
        const s = automationSalience(o, p);
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("AutomationSalience — Analyzer plugin (D-08 shape)", () => {
  it("Test 5: analyze() on EMPTY folded parameters returns [] (refuse — no data, no guess)", () => {
    expect(AutomationSalience.analyze({} as never, { intent: null, now: 0 })).toEqual([]);
    expect(AutomationSalience.analyze({ parameters: {} } as never, { intent: null, now: 0 })).toEqual([]);
  });

  it("Test 5: analyze() on populated parameters returns a DerivedField with non-empty assumptions[]", () => {
    const raw = {
      parameters: {
        "dev_0123456789abcdef:remote_page:0": obs({ source: "remote_page", paramIndex: 0 }),
        "dev_0123456789abcdef:device_parameter:1": obs({ source: "device_parameter", paramIndex: 1, paramName: "Cutoff" }),
      },
    };
    const out = AutomationSalience.analyze(raw as never, { intent: null, now: 0 });
    expect(out).toHaveLength(1);
    const field = out[0] as DerivedField;
    expect(field.field).toBe("automationSalience");
    expect(field.confidence).toBe(1.0);
    expect(field.assumptions.length).toBeGreaterThan(0);
    // The value is the RANKED list — sorted by salience desc, macro first.
    const ranked = field.value as RankedSalienceParam[];
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.source).toBe("remote_page");
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.salience).toBeGreaterThanOrEqual(ranked[i]!.salience);
    }
    for (const p of ranked) {
      expect(p.salience).toBeGreaterThanOrEqual(0);
      expect(p.salience).toBeLessThanOrEqual(1);
    }
  });

  it("absent priors are disclosed with source 'default' (honest fallback, UX-06)", () => {
    const raw = { parameters: { "d:device_parameter:0": obs() } };
    const out = AutomationSalience.analyze(raw as never, { intent: null, now: 0 });
    const claims = (out[0] as DerivedField).assumptions.map((a) => a.source);
    expect(claims).toContain("default");
  });

  it("present priors (the documented automationPriors sidecar) are cited with source 'config'", () => {
    const raw = {
      parameters: { "d:device_parameter:0": obs() },
      automationPriors: { roleSalience: 0.9, energyAtMovement: 0.8 },
    };
    const out = AutomationSalience.analyze(raw as never, { intent: null, now: 0 });
    const assumptions = (out[0] as DerivedField).assumptions;
    expect(assumptions.some((a) => a.source === "config")).toBe(true);
    // And the absent-prior default claim is NOT present when priors are supplied.
    expect(assumptions.every((a) => a.claim.includes("defaulted") === false || a.source === "config")).toBe(true);
  });

  it("satisfies the Analyzer interface (id, consumes, produces)", () => {
    const a = AutomationSalience as Analyzer;
    expect(a.id).toBe("automationSalience");
    expect(a.consumes).toContain("parameters");
    expect(a.produces).toContain("automationSalience");
    expect(typeof a.analyze).toBe("function");
  });

  it("never mutates the raw state (analyze is pure)", () => {
    const raw = { parameters: { "d:device_parameter:0": obs() } };
    const snapshot = JSON.parse(JSON.stringify(raw));
    AutomationSalience.analyze(raw as never, { intent: null, now: 0 });
    expect(raw).toEqual(snapshot);
  });

  it("structural purity: the module source imports NOTHING from node:fs / node:net / ../patch/*", async () => {
    const source = await readFile(new URL("./automation-salience.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+"node:fs/);
    expect(source).not.toMatch(/from\s+"node:net/);
    expect(source).not.toMatch(/from\s+"\.\.\/patch\//);
  });
});
