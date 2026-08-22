// daemon/src/transforms/macro-suggest.test.ts
//
// Phase 5 / 05-07 Task 1 — unit tests for the pure advisory macro/XY
// suggestion generator (AUTO-02, D-05-09/D-05-10/D-05-11/D-05-12).
//
// D-05-09 INVARIANT (the transition-suggest.ts:11-18 discipline copied in
// spirit): outputs are ADVISORY ONLY — NO patchId, NO operations[], NO risk
// field; the module MUST NOT import from ../patch/*. The structural test
// asserts both the import surface AND the serialized key surface (T-05-19).
//
// Mirrors transition-suggest.test.ts (pure-function unit tests + the
// refuse-returns-empty contract) + automation-salience.test.ts (the
// SalienceEntry fixtures this transform consumes).

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  macroSuggest,
  type MacroSuggestion,
  type SalienceEntry,
  type MacroSuggestContext,
} from "./macro-suggest.js";
import type { Profile } from "../gen/profile.js";

const MODULE_PATH = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Fixtures (automation-salience.ts RankedSalienceParam shape + optional
// context strings the op path attaches).
// ============================================================================

let entrySeq = 0;

/** Build a SalienceEntry with sensible defaults (paramKey required). */
function entry(over: Partial<SalienceEntry> & { paramKey: string }): SalienceEntry {
  entrySeq += 1;
  return {
    deviceKey: "dev_0123456789abcdef",
    paramIndex: entrySeq,
    source: "device_parameter",
    movementCount: 12,
    valueRange: 0.4,
    lastValue: 0.5,
    salience: 0.5,
    ...over,
  };
}

/** A macro (remote_page) knob entry. */
function macroEntry(paramKey: string, salience: number, name?: string): SalienceEntry {
  return entry({ paramKey, salience, source: "remote_page", ...(name !== undefined ? { paramName: name } : {}) });
}

/** A plain device parameter entry. */
function deviceEntry(paramKey: string, salience: number, name?: string): SalienceEntry {
  return entry({ paramKey, salience, ...(name !== undefined ? { paramName: name } : {}) });
}

/** Six distinct entries — the ranking/ordering fixture (Tests 2/3/6/7/8). */
function sixEntries(): SalienceEntry[] {
  return [
    macroEntry("remote_page:1", 0.95, "Macro 1"),
    deviceEntry("device_parameter:4", 0.9, "Cutoff"),
    deviceEntry("device_parameter:7", 0.85, "Resonance"),
    macroEntry("remote_page:2", 0.8, "Macro 2"),
    deviceEntry("device_parameter:9", 0.7, "Drive"),
    deviceEntry("device_parameter:11", 0.6, "Release"),
  ];
}

/** Seventeen entries with strictly descending salience (Tests 5/6). */
function seventeenEntries(): SalienceEntry[] {
  const out: SalienceEntry[] = [];
  for (let i = 0; i < 17; i++) {
    const salience = Number((0.97 - i * 0.01).toFixed(3));
    out.push(
      i % 3 === 0
        ? macroEntry(`remote_page:${i}`, salience, `Macro ${i}`)
        : deviceEntry(`device_parameter:${i}`, salience, `Param ${i}`),
    );
  }
  return out;
}

/** The six shape names (D-05-13 fixed vocabulary). */
const SHAPES = ["ramp_up", "ramp_down", "dip_recover", "rise_fall", "slow_cycle", "hold_then_move"] as const;

function uniformShapes() {
  const shapeBias: Record<string, number> = {};
  for (const s of SHAPES) shapeBias[s] = 1.0;
  return { shapeBias, depthRange: [0.0, 1.0] as [number, number], rateRange: [0.125, 4] as [number, number] };
}

/** A techno-style bias: slow_cycle favored, dip_recover disfavored (techno.json). */
function technoShapes() {
  const shapeBias: Record<string, number> = {
    ramp_up: 0.8,
    ramp_down: 0.8,
    dip_recover: 0.6,
    rise_fall: 1.2,
    slow_cycle: 1.5,
    hold_then_move: 1.0,
  };
  return { shapeBias, depthRange: [0.2, 0.9] as [number, number], rateRange: [0.125, 2] as [number, number] };
}

function profileWith(shapes: unknown, name: string): Profile {
  return { name, automationShapes: shapes } as unknown as Profile;
}

/** First param identity of a suggestion (its strongest member). */
function firstKey(s: MacroSuggestion): string {
  return s.params[0]!.paramKey;
}

// ============================================================================
// Test 1 — structural advisory invariant (D-05-09 / T-05-19).
// ============================================================================

describe("macroSuggest — D-05-09 advisory invariant (structural)", () => {
  it("module source does NOT import from ../patch/* (and no fs/net — pure module)", async () => {
    const src = await readFile(join(MODULE_PATH, "macro-suggest.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']\.\.\/patch\//);
    expect(src).not.toMatch(/import\s+.*applyPatch/);
    expect(src).not.toMatch(/from\s+["']node:(fs|net|http|dns)/);
  });

  it("serialized suggestions carry NO patchId / operations / risk keys (recursive)", () => {
    const result = macroSuggest(sixEntries());
    expect(result.suggestions.length).toBeGreaterThan(0);
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (v !== null && typeof v === "object") {
        const o = v as Record<string, unknown>;
        expect(o).not.toHaveProperty("patchId");
        expect(o).not.toHaveProperty("operations");
        expect(o).not.toHaveProperty("risk");
        Object.values(o).forEach(walk);
      }
    };
    walk(result);
    const json = JSON.stringify(result);
    expect(json).not.toContain('"patchId"');
    expect(json).not.toContain('"operations"');
    expect(json).not.toContain('"risk"');
  });
});

// ============================================================================
// Test 2 + 3 — evidence, alternatives, assumptions, ranking (D-05-11 / SC#2).
// ============================================================================

describe("macroSuggest — evidence lines + alternatives + ranking", () => {
  it("every suggestion carries ≥ 1 alternative and ≥ 1 assumption (D-05-11)", () => {
    const result = macroSuggest(sixEntries());
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      expect(s.alternatives.length).toBeGreaterThanOrEqual(1);
      expect(s.assumptions.length).toBeGreaterThanOrEqual(1);
      for (const a of s.assumptions) {
        expect(a.claim.length).toBeGreaterThan(0);
        expect(a.confidence).toBeGreaterThanOrEqual(0);
        expect(a.confidence).toBeLessThanOrEqual(1);
        expect(["selection", "intent", "config", "default"]).toContain(a.source);
      }
      // Evidence line: identity + device + movementCount + role/energy context.
      for (const ev of s.evidence) {
        expect(ev.identity.length).toBeGreaterThan(0);
        expect(ev.device.length).toBeGreaterThan(0);
        expect(ev.movementCount).toBeGreaterThanOrEqual(0);
        expect(ev.roleEnergyContext.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns a RANKED list (salience desc) — the top suggestion never appears alone (SC#2)", () => {
    const result = macroSuggest(sixEntries());
    const list = result.suggestions;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2); // a LIST, never a lone best target
    for (let i = 1; i < list.length; i++) {
      // params[0] is each suggestion's strongest member — non-increasing salience.
      expect(list[i - 1]!.params[0]!.salience).toBeGreaterThanOrEqual(list[i]!.params[0]!.salience);
    }
    // Disambiguation duty: the top suggestion names what else deserved the slot.
    expect(list[0]!.alternatives.length).toBeGreaterThanOrEqual(1);
    // Deterministic: identical inputs → identical output.
    expect(macroSuggest(sixEntries())).toEqual(result);
  });
});

// ============================================================================
// Tests 4 + 5 — XY pairing v1 (D-05-12: both top-16, no name collision).
// ============================================================================

describe("macroSuggest — XY pairing v1 (D-05-12)", () => {
  it("≥ 2 qualifying params in the top 16 → at least one xy_pair with distinct names", () => {
    const result = macroSuggest(sixEntries());
    const pairs = result.suggestions.filter((s) => s.kind === "xy_pair");
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    for (const p of pairs) {
      expect(p.params).toHaveLength(2);
      const [a, b] = p.params;
      expect(a!.paramKey).not.toBe(b!.paramKey);
      // No name collision: when both carry names they must differ.
      if (a!.paramName !== undefined && b!.paramName !== undefined) {
        expect(a!.paramName).not.toBe(b!.paramName);
      }
    }
  });

  it("params OUTSIDE the top 16 never form an XY pair", () => {
    const obs = seventeenEntries();
    const result = macroSuggest(obs);
    // The expected top-16 identity set, computed independently in the test.
    const top16 = new Set([...obs].sort((a, b) => b.salience - a.salience).slice(0, 16).map((e) => e.paramKey));
    const pairs = result.suggestions.filter((s) => s.kind === "xy_pair");
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    for (const p of pairs) {
      for (const param of p.params) {
        expect(top16.has(param.paramKey)).toBe(true);
      }
    }
  });

  it("same-named params never pair (no name collision rule)", () => {
    const obs = [
      macroEntry("remote_page:1", 0.95, "Same Name"),
      deviceEntry("device_parameter:4", 0.9, "Same Name"),
      deviceEntry("device_parameter:7", 0.85, "Other"),
    ];
    const result = macroSuggest(obs);
    for (const p of result.suggestions.filter((s) => s.kind === "xy_pair")) {
      const [a, b] = p.params;
      expect(a!.paramName === b!.paramName).toBe(false);
    }
    // The collision must not suppress pairing entirely — "Other" still qualifies.
    expect(result.suggestions.filter((s) => s.kind === "xy_pair").length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Test 6 — topN cap (bounded drawer, default 8).
// ============================================================================

describe("macroSuggest — topN cap", () => {
  it("caps output at the default 8 and honors ctx.topN overrides", () => {
    const obs = seventeenEntries();
    expect(macroSuggest(obs).suggestions).toHaveLength(8);
    expect(macroSuggest(obs, { topN: 3 }).suggestions).toHaveLength(3);
    expect(macroSuggest(obs, { topN: 100 }).suggestions.length).toBeLessThanOrEqual(17);
  });
});

// ============================================================================
// Test 7 — ARCH-02 enhance-never-gate shape bias.
// ============================================================================

describe("macroSuggest — automationShapes bias (ARCH-02)", () => {
  it("no-profile and uniform (generic-style) profile runs are IDENTICAL", () => {
    const obs = sixEntries();
    const noProfile = macroSuggest(obs);
    const generic = macroSuggest(obs, { profile: profileWith(uniformShapes(), "generic") });
    expect(generic).toEqual(noProfile); // uniform weights = literally no bias
  });

  it("a techno-style bias may shift ordering (never gate) and stays deterministic", () => {
    // A slow_cycle-dominant param (wide range, mid last) slightly below a
    // ramp_up-dominant one (ends high): the bias flips their order.
    const obs: SalienceEntry[] = [
      deviceEntry("device_parameter:1", 0.91, "Riser"), // lastValue 0.9 → ramp_up-dominant
      entry({
        paramKey: "device_parameter:2",
        salience: 0.9,
        paramName: "Sweep",
        movementCount: 40,
        valueRange: 0.8,
        lastValue: 0.5, // wide range ending mid → slow_cycle-dominant
      }),
      deviceEntry("device_parameter:3", 0.5, "Other"),
      deviceEntry("device_parameter:4", 0.4, "Filler"),
    ];
    const unbiased = macroSuggest(obs);
    expect(firstKey(unbiased.suggestions[0]!)).toBe("device_parameter:1");

    const biased = macroSuggest(obs, { profile: profileWith(technoShapes(), "techno") });
    expect(firstKey(biased.suggestions[0]!)).toBe("device_parameter:2"); // shifted
    // Still a ranked list, still deterministic, never gated (no refusals).
    expect(biased.suggestions.length).toBe(unbiased.suggestions.length);
    expect(macroSuggest(obs, { profile: profileWith(technoShapes(), "techno") })).toEqual(biased);
  });
});

// ============================================================================
// Test 8 — D-05-03 ordering inherited: macro (remote_page) sources first.
// ============================================================================

describe("macroSuggest — macro-first ordering (D-05-03)", () => {
  it("remote_page sources rank ahead of equally-salient device params", () => {
    const obs = [
      deviceEntry("device_parameter:4", 0.9, "Cutoff"),
      macroEntry("remote_page:1", 0.9, "Macro 1"),
      deviceEntry("device_parameter:7", 0.5, "Resonance"),
    ];
    const result = macroSuggest(obs);
    expect(firstKey(result.suggestions[0]!)).toBe("remote_page:1");
  });
});

// ============================================================================
// Test 9 — refuse honestly on thin evidence (no synthesized filler).
// ============================================================================

describe("macroSuggest — thin evidence refusal", () => {
  it("0 and 1 observations → empty suggestions + honest manualHint, no filler", () => {
    for (const obs of [[], [macroEntry("remote_page:1", 0.95, "Macro 1")]] as SalienceEntry[][]) {
      const result = macroSuggest(obs);
      expect(result.suggestions).toEqual([]);
      expect(result.manualHint.length).toBeGreaterThan(0);
      // Honest: names the manual wiring + what to do, not a fabricated ranking.
      expect(result.manualHint).toMatch(/hand/i);
    }
  });
});

// ============================================================================
// pulledAt honesty suffix (transition-suggest :73-76/:113 pattern).
// ============================================================================

describe("macroSuggest — pulledAt honesty", () => {
  it("ctx.pulledAt renders the visible-freshness suffix in hints + assumptions", () => {
    const ctx: MacroSuggestContext = { pulledAt: "2026-08-22T12:00:00.000Z" };
    const result = macroSuggest(sixEntries(), ctx);
    expect(result.suggestions.length).toBeGreaterThan(0);
    const claims = result.suggestions.flatMap((s) => [...s.assumptions.map((a) => a.claim), s.manualHint]).join(" ");
    expect(claims).toContain("2026-08-22T12:00:00.000Z");
  });
});
