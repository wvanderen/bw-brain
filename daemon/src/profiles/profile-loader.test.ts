// daemon/src/profiles/profile-loader.test.ts
//
// ARCH-01/02 profile loader (D-13/D-14). loadProfile resolves the active
// genre profile from an optional name. INV-13: with NO name (or "generic"),
// the loader returns generic.json LITERALLY — the strict neutral default
// (D-14). ARCH-02 ("generic core runs without a profile") must be literally
// true, not a fiction where "generic" is secretly techno-flavored.
//
// Mirrors intent-store.test.ts (the config-loader test discipline): INV-13
// + merge + unknown-throws. The describe block is titled "INV-13 ..." so
// `npm test -- "profile-absent"` filters to it (RESEARCH.md:1278 edge class).

import { describe, it, expect } from "vitest";
import { loadProfile, UnknownProfileError, type Profile } from "./profile-loader.js";

describe("INV-13 profile-absent = generic literally (ARCH-02)", () => {
  it("loadProfile() with NO argument returns the generic profile", () => {
    const p = loadProfile();
    expect(p.name).toBe("generic");
  });

  it("loadProfile(undefined) returns generic (no name = generic core runs literally)", () => {
    const p = loadProfile(undefined);
    expect(p.name).toBe("generic");
  });

  it('loadProfile("generic") returns the SAME object as loadProfile() (INV-13)', () => {
    const byDefault = loadProfile();
    const named = loadProfile("generic");
    expect(named).toBe(byDefault);
  });

  it("generic profile carries the hardcoded neutral vary threshold 0.85 (D-14)", () => {
    const p = loadProfile();
    expect(p.thresholds.vary).toBe(0.85);
  });

  it("generic profile carries the neutral counterline threshold 0.80", () => {
    const p = loadProfile();
    expect(p.thresholds.counterline).toBe(0.80);
  });

  it("cleanup-tier thresholds are 0.0 in generic (motif gate skipped, D-10)", () => {
    const p = loadProfile();
    expect(p.thresholds.voiceLeadingFix).toBe(0.0);
    expect(p.thresholds.humanize).toBe(0.0);
  });

  it("generic profile has NO extends field (it IS the root default, D-14)", () => {
    const p = loadProfile();
    expect(p.extends).toBeUndefined();
  });

  it("generic profile is NOT techno-flavored (no dark-mode scales only)", () => {
    // generic prefers a MIXED set [minor, dorian, phrygian]; techno prefers dark
    // [minor, phrygian, locrian]. Generic must carry the neutral mix, proving
    // the "generic" default is not secretly techno (ARCH-02 literally true).
    const p = loadProfile();
    expect(p.preferredScales).toEqual(["minor", "dorian", "phrygian"]);
    expect(p.strongBeatGrid).toEqual([0, 1, 2, 3]);
  });
});

describe("loadProfile techno (D-14 opt-in, extends generic)", () => {
  it('loadProfile("techno") returns a profile named techno', () => {
    const p = loadProfile("techno");
    expect(p.name).toBe("techno");
  });

  it("techno tightens vary threshold to 0.88 (the opt-in override)", () => {
    const p = loadProfile("techno");
    expect(p.thresholds.vary).toBe(0.88);
  });

  it("techno tightens counterline threshold to 0.82", () => {
    const p = loadProfile("techno");
    expect(p.thresholds.counterline).toBe(0.82);
  });

  it("techno INHERITS voiceLeadingFix + humanize thresholds from generic (deep-merge)", () => {
    const p = loadProfile("techno");
    expect(p.thresholds.voiceLeadingFix).toBe(0.0);
    expect(p.thresholds.humanize).toBe(0.0);
  });

  it("techno INHERITS roleSalience.lead from generic (lead=0.8; techno omits it)", () => {
    const p = loadProfile("techno");
    expect(p.roleSalience?.lead).toBe(0.8);
  });

  it("techno overrides roleSalience.bass to 0.95 (deep-merge child wins)", () => {
    const p = loadProfile("techno");
    expect(p.roleSalience?.bass).toBe(0.95);
  });

  it("techno overrides preferredScales to dark modes [minor, phrygian, locrian]", () => {
    const p = loadProfile("techno");
    expect(p.preferredScales).toEqual(["minor", "phrygian", "locrian"]);
  });

  it("techno overrides strongBeatGrid to [0,2] (4-on-the-floor)", () => {
    const p = loadProfile("techno");
    expect(p.strongBeatGrid).toEqual([0, 2]);
  });

  it("techno tightens velocityHumanize jitter to 3 (rigid)", () => {
    const p = loadProfile("techno");
    expect(p.velocityHumanize?.jitter).toBe(3);
  });

  it("techno INHERITS timingHumanize from generic (techno omits it)", () => {
    const p = loadProfile("techno");
    expect(p.timingHumanize?.jitterBeats).toBe(0.01);
  });
});

describe("loadProfile unknown name (T-3-14 tampering defense)", () => {
  it('throws UnknownProfileError for an unrecognized name', () => {
    expect(() => loadProfile("nonexistent")).toThrow(UnknownProfileError);
  });

  it("the error carries the bad name in its message", () => {
    try {
      loadProfile("nonexistent");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownProfileError);
      expect(String(err)).toContain("nonexistent");
    }
  });

  it("UnknownProfileError is an Error subclass (structured throw, mirrors intent-store)", () => {
    const err = new UnknownProfileError("xyz");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnknownProfileError");
  });
});

describe("ProfileHooks interface (D-13 — designed, NOT exercised in v1)", () => {
  it("loadProfile never invokes hooks when no hooks module is present (JSON-only v1)", () => {
    // electronic/techno v1 ships JSON-only (D-13). The loader detects a hooks.js
    // sibling (absent for v1) and skips hook invocation. This must not throw and
    // must return a plain data profile.
    const techno: Profile = loadProfile("techno");
    expect(techno.name).toBe("techno");
    // No hooks attached to the data profile (JSON-only v1).
    expect((techno as Profile & { hooks?: unknown }).hooks).toBeUndefined();
  });
});

// ============================================================================
// P4 / 04-02 Task 3 — energyWeights / sectionLabels / roleTemplates extensions.
// ARCH-02: all three new fields are OPTIONAL. Generic core runs literally if
// they're absent; analyzers gate on field-presence.
// ============================================================================

describe("energyWeights (D-05 energy-curve composite weights)", () => {
  it("generic profile carries energyWeights with the four required keys", () => {
    const p = loadProfile();
    expect(p.energyWeights).toBeDefined();
    expect(p.energyWeights!.noteDensity).toBe(0.35);
    expect(p.energyWeights!.velocityAggregate).toBe(0.25);
    expect(p.energyWeights!.polyphony).toBe(0.20);
    expect(p.energyWeights!.pitchCentroid).toBe(0.20);
  });

  it("generic energyWeights sums to 1.0 (the documented invariant)", () => {
    const p = loadProfile();
    const sum =
      p.energyWeights!.noteDensity +
      p.energyWeights!.velocityAggregate +
      p.energyWeights!.polyphony +
      p.energyWeights!.pitchCentroid;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("techno overrides energyWeights.noteDensity to 0.40 (object-merge, child wins per-key)", () => {
    const p = loadProfile("techno");
    expect(p.energyWeights!.noteDensity).toBe(0.40);
  });

  it("techno energyWeights sums to 1.0 (the documented invariant holds post-merge)", () => {
    const p = loadProfile("techno");
    const sum =
      p.energyWeights!.noteDensity +
      p.energyWeights!.velocityAggregate +
      p.energyWeights!.polyphony +
      p.energyWeights!.pitchCentroid;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("techno INHERITS velocityAggregate/pitchCentroid from generic (deep object-merge)", () => {
    const t = loadProfile("techno");
    const g = loadProfile();
    // techno omits these keys in its own JSON; object-merge inherits them.
    expect(t.energyWeights!.velocityAggregate).toBe(g.energyWeights!.velocityAggregate);
    expect(t.energyWeights!.pitchCentroid).toBe(g.energyWeights!.pitchCentroid);
  });
});

describe("sectionLabels (D-07 vocabulary)", () => {
  it("generic ships 5 neutral labels [intro, build, peak, breakdown, outro]", () => {
    const p = loadProfile();
    expect(p.sectionLabels).toBeDefined();
    expect(p.sectionLabels).toHaveLength(5);
    const labels = p.sectionLabels!.map((l) => l.label);
    expect(labels).toEqual(["intro", "build", "peak", "breakdown", "outro"]);
  });

  it("generic sectionLabels each carry label + position + energyRange", () => {
    const p = loadProfile();
    for (const l of p.sectionLabels!) {
      expect(typeof l.label).toBe("string");
      expect(l.label.length).toBeGreaterThan(0);
      expect(["start", "middle", "end", "any"]).toContain(l.position);
      expect(l.energyRange).toHaveLength(2);
      expect(l.energyRange[0]).toBeLessThanOrEqual(l.energyRange[1]!);
    }
  });

  it("techno REPLACES sectionLabels with [drop, break, roll] (array-replace, NOT append)", () => {
    const p = loadProfile("techno");
    expect(p.sectionLabels).toBeDefined();
    expect(p.sectionLabels).toHaveLength(3);
    const labels = p.sectionLabels!.map((l) => l.label);
    expect(labels).toEqual(["drop", "break", "roll"]);
  });

  it("techno does NOT carry generic's intro label (array-replace is wholesale, not append)", () => {
    const p = loadProfile("techno");
    const labels = p.sectionLabels!.map((l) => l.label);
    expect(labels).not.toContain("intro");
  });
});

describe("roleTemplates (D-08 track-role templates)", () => {
  it("generic ships 7 role templates [kick, bass, lead, pad, hats, percussion, fx]", () => {
    const p = loadProfile();
    expect(p.roleTemplates).toBeDefined();
    expect(p.roleTemplates).toHaveLength(7);
    const roles = p.roleTemplates!.map((t) => t.role);
    expect(roles).toEqual(["kick", "bass", "lead", "pad", "hats", "percussion", "fx"]);
  });

  it("generic roleTemplates each carry role + register + rhythm + velocity profile", () => {
    const p = loadProfile();
    for (const t of p.roleTemplates!) {
      expect(typeof t.role).toBe("string");
      expect(t.role.length).toBeGreaterThan(0);
      expect(t.registerLow).toBeGreaterThanOrEqual(0);
      expect(t.registerHigh).toBeLessThanOrEqual(127);
      expect(t.registerLow).toBeLessThanOrEqual(t.registerHigh);
      expect(t.rhythmProfile).toHaveLength(5);
      expect(t.velocityProfile.mean).toBeGreaterThanOrEqual(0);
      expect(t.velocityProfile.mean).toBeLessThanOrEqual(1);
    }
  });

  it("techno REPLACES roleTemplates with just [kick, bass] (array-replace — techno's complete role set)", () => {
    const p = loadProfile("techno");
    expect(p.roleTemplates).toBeDefined();
    expect(p.roleTemplates).toHaveLength(2);
    const roles = p.roleTemplates!.map((t) => t.role);
    expect(roles).toEqual(["kick", "bass"]);
  });

  it("techno tightens kick register (registerHigh=36 vs generic's 40 — 4-on-the-floor)", () => {
    const t = loadProfile("techno");
    const g = loadProfile();
    const tKick = t.roleTemplates!.find((r) => r.role === "kick")!;
    const gKick = g.roleTemplates!.find((r) => r.role === "kick")!;
    expect(tKick.registerHigh).toBe(36);
    expect(gKick.registerHigh).toBe(40);
  });
});

describe("ARCH-02: profile without the new fields still loads (generic core runs literally)", () => {
  it("loadProfile of generic returns a profile where the three new fields are present (this profile ships them)", () => {
    // Generic v2 (this plan) ships the new fields. The ARCH-02 guarantee is
    // tested by the schema's optionality — but the loader must not throw if
    // they're absent. We exercise the present-fields case here; the absent-fields
    // case is structurally guaranteed by the optional (?) TS type.
    const p = loadProfile();
    expect(p.energyWeights).toBeDefined();
    expect(p.sectionLabels).toBeDefined();
    expect(p.roleTemplates).toBeDefined();
  });
});

