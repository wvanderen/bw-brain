// daemon/src/profiles/profile-schema.test.ts
//
// Phase 5 (05-01 Task 2) — the optional `automationShapes` bias field
// (D-05-13, ARCH-02 enhance-never-gate). This file Ajv-compiles
// schemas/profile.schema.json (the first direct test-time validation of the
// profile contract — the loader itself trusts the shipped JSON) and pins:
//
//   1. A profile WITHOUT automationShapes validates (generic core runs
//      literally — ARCH-02 optionality is a schema-level guarantee).
//   2. techno.json WITH automationShapes {shapeBias, depthRange, rateRange}
//      validates (the additive example).
//   3. An unknown extra property inside automationShapes is REJECTED
//      (additionalProperties false inside the field).
//   4. shapeBias keys are EXACTLY the six shape names (ramp_up, ramp_down,
//      dip_recover, rise_fall, slow_cycle, hold_then_move), each ≥ 0.
//   5. loadProfile returns the profile JSON LITERALLY — no default
//      automationShapes injection at load time (defaults resolve at the
//      consumer via ctx.profile?.automationShapes ?? DEFAULT, 05-08's
//      concern; INV-13 discipline).
//
// Mirrors schemas.test.ts discipline: Ajv2020 (draft 2020-12), valid example
// + counter-example per frozen bound.

import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import profileSchema from "../../../schemas/profile.schema.json" with { type: "json" };
import genericJson from "./generic.json" with { type: "json" };
import technoJson from "./techno.json" with { type: "json" };
import { loadProfile } from "./profile-loader.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(profileSchema);
const validateProfile = ajv.getSchema(profileSchema.$id)!;

/** A minimal schema-valid profile (name + thresholds only — nothing else). */
function minimalProfile(): Record<string, unknown> {
  return {
    name: "synthetic",
    thresholds: { vary: 0.85, counterline: 0.8, voiceLeadingFix: 0.0, humanize: 0.0 },
  };
}

/** The six musically-named automation shapes (D-05-13 fixed shape set). */
const SIX_SHAPES = ["ramp_up", "ramp_down", "dip_recover", "rise_fall", "slow_cycle", "hold_then_move"] as const;

/** A complete, valid automationShapes block. */
function validAutomationShapes(): Record<string, unknown> {
  const shapeBias: Record<string, number> = {};
  for (const s of SIX_SHAPES) shapeBias[s] = 1.0;
  return { shapeBias, depthRange: [0.0, 1.0], rateRange: [0.125, 4] };
}

describe("profile.schema.json automationShapes (D-05-13 optional bias field)", () => {
  it("Test 1: a profile WITHOUT automationShapes validates (generic core runs literally — ARCH-02)", () => {
    const ok = validateProfile(minimalProfile());
    expect(ok, JSON.stringify(validateProfile.errors)).toBe(true);
  });

  it("Test 2: a profile WITH a complete automationShapes {shapeBias, depthRange, rateRange} validates", () => {
    const ok = validateProfile({ ...minimalProfile(), automationShapes: validAutomationShapes() });
    expect(ok, JSON.stringify(validateProfile.errors)).toBe(true);
  });

  it("Test 2b: the resolved techno profile (extends generic, deep-merged) validates against the profile schema", () => {
    // techno.json is authored PARTIAL by design (omits thresholds inherited
    // from generic — see profile-loader.ts), so the SCHEMA check targets the
    // RESOLVED profile the loader hands to consumers.
    const ok = validateProfile(loadProfile("techno"));
    expect(ok, JSON.stringify(validateProfile.errors)).toBe(true);
  });

  it("Test 2c: the shipped generic.json validates against the profile schema", () => {
    const ok = validateProfile(genericJson);
    expect(ok, JSON.stringify(validateProfile.errors)).toBe(true);
  });

  it("Test 3: an unknown extra property inside automationShapes is REJECTED (additionalProperties false)", () => {
    const bad = { ...validAutomationShapes(), bogusKnob: true };
    const ok = validateProfile({ ...minimalProfile(), automationShapes: bad });
    expect(ok).toBe(false);
  });

  it("Test 3b: automationShapes missing a required member (no rateRange) is REJECTED", () => {
    const { rateRange: _drop, ...bad } = validAutomationShapes() as Record<string, unknown>;
    const ok = validateProfile({ ...minimalProfile(), automationShapes: bad });
    expect(ok).toBe(false);
  });

  it("Test 4: shapeBias with exactly the six shape names (each ≥ 0) validates", () => {
    const shapes = validAutomationShapes();
    expect(Object.keys((shapes.shapeBias as Record<string, number>)).sort()).toEqual([...SIX_SHAPES].sort());
    const ok = validateProfile({ ...minimalProfile(), automationShapes: shapes });
    expect(ok).toBe(true);
  });

  it("Test 4b: shapeBias MISSING one of the six shape names is REJECTED", () => {
    const shapes = validAutomationShapes();
    const shapeBias = { ...(shapes.shapeBias as Record<string, number>) };
    delete shapeBias.slow_cycle;
    const ok = validateProfile({ ...minimalProfile(), automationShapes: { ...shapes, shapeBias } });
    expect(ok).toBe(false);
  });

  it("Test 4c: shapeBias with an UNKNOWN shape name is REJECTED", () => {
    const shapes = validAutomationShapes();
    const shapeBias = { ...(shapes.shapeBias as Record<string, number>), random_squiggle: 1.0 };
    const ok = validateProfile({ ...minimalProfile(), automationShapes: { ...shapes, shapeBias } });
    expect(ok).toBe(false);
  });

  it("Test 4d: shapeBias with a NEGATIVE bias value is REJECTED (minimum 0)", () => {
    const shapes = validAutomationShapes();
    const shapeBias = { ...(shapes.shapeBias as Record<string, number>), rise_fall: -0.5 };
    const ok = validateProfile({ ...minimalProfile(), automationShapes: { ...shapes, shapeBias } });
    expect(ok).toBe(false);
  });

  it("depthRange must be exactly 2 numbers within [0,1]", () => {
    const base = validAutomationShapes();
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, depthRange: [0.2] } })).toBe(false);
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, depthRange: [0.2, 0.9, 1.0] } })).toBe(false);
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, depthRange: [-0.1, 0.9] } })).toBe(false);
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, depthRange: [0.2, 1.5] } })).toBe(false);
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, depthRange: [0.2, 0.9] } })).toBe(true);
  });

  it("rateRange must be exactly 2 non-negative numbers", () => {
    const base = validAutomationShapes();
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, rateRange: [0.125] } })).toBe(false);
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, rateRange: [-1, 4] } })).toBe(false);
    expect(validateProfile({ ...minimalProfile(), automationShapes: { ...base, rateRange: [0.125, 4] } })).toBe(true);
  });
});

describe("Test 5: loadProfile returns the profile JSON LITERALLY (no automationShapes injection at load)", () => {
  it("loadProfile() returns generic.json's automationShapes block verbatim (no loader-injected defaults)", () => {
    const p = loadProfile();
    expect(p.automationShapes).toEqual(genericJson.automationShapes);
  });

  it('loadProfile("techno") returns techno.json\'s automationShapes block verbatim', () => {
    const p = loadProfile("techno");
    expect(p.automationShapes).toEqual(technoJson.automationShapes);
  });

  it("generic automationShapes is NEUTRAL (uniform shapeBias — no hidden genre flavor, INV-13)", () => {
    const bias = loadProfile().automationShapes!.shapeBias;
    const values = Object.values(bias);
    for (const v of values) expect(v).toBe(values[0]); // uniform
    expect(values[0]).toBeGreaterThan(0);
  });

  it("techno automationShapes BIASES (non-uniform shapeBias — the D-05-13 opt-in example)", () => {
    const bias = loadProfile("techno").automationShapes!.shapeBias;
    expect(bias.slow_cycle).toBeGreaterThan(bias.dip_recover);
    expect(bias.rise_fall).toBeGreaterThan(bias.dip_recover);
  });
});
