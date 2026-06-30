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
