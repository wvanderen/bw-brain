// daemon/src/transforms/vary.test.ts
//
// MIDI-02 vary — A/B/C motif-preserving variants (creative tier, D-08/D-09/D-10).
//
// INV-7: every candidate is EITHER motifSimilarity>=threshold OR status:"refused"
//        (NO THIRD STATE — a below-bar candidate that applied silently is a bug).
// INV-10 (integration, vary-side half): a refused candidate is stamped
//        risk:"high" AND status:"refused" at BIRTH (RESEARCH.md:880 + D-09).
//        The daemon-side half (handleMidiVary classifyRisk re-validation) is
//        pinned by midi.test.ts in Task 2.
// INV-11: a below-threshold creative candidate's DEFAULT path refuses +
//        surfaces the near-miss score; applying requires --allow-below-bar
//        AND --confirm (the apply-path gate is enforced in Plan 02; vary TAGS).
// Pitfall 1: exactly-at-threshold ACCEPTS (>=, not >); 0.84999 REFUSES.
//
// TDD RED: authored BEFORE vary.ts exists. The import fails → all tests error
// (RED). GREEN lands vary.ts and the assertions hold.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { vary, type VaryCandidate } from "./vary.js";
import { motifSignature, motifSimilarity } from "./motif-signature.js";
import { loadProfile } from "../profiles/profile-loader.js";
import { arbNoteSet } from "../patch/arb.js";
import type { Note } from "../cli/diff-logic.js";

/** Note builder mirroring motif-signature.test.ts (key minted by real shape). */
function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** A clear C-major arpeggio motif — vary should keep its variants ABOVE bar. */
function cMajorMotif(): Note[] {
  return [
    note(60, 0.0),
    note(64, 0.5),
    note(67, 1.0),
    note(72, 1.5),
    note(67, 2.0),
    note(64, 2.5),
    note(60, 3.0),
    note(62, 3.5),
  ];
}

/** A generic profile clone with an overridden vary threshold (for boundary tests). */
function profileWith(varyThreshold: number) {
  const p = loadProfile();
  return { ...p, thresholds: { ...p.thresholds, vary: varyThreshold } };
}

const HARMONIC_C_MAJOR = { key: "C", mode: "major" as const };

describe("vary MIDI-02 — shape (3 A/B/C candidates)", () => {
  it("returns exactly 3 candidates labelled A, B, C", () => {
    const out = vary(cMajorMotif(), undefined, loadProfile(), HARMONIC_C_MAJOR);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.label).sort()).toEqual(["A", "B", "C"]);
  });

  it("every candidate carries a description, risk, and a finite motifSimilarity", () => {
    const out = vary(cMajorMotif(), undefined, loadProfile(), HARMONIC_C_MAJOR);
    for (const c of out) {
      expect(c.description.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(c.risk);
      expect(Number.isFinite(c.motifSimilarity)).toBe(true);
      expect(c.motifSimilarity).toBeGreaterThanOrEqual(0);
      expect(c.motifSimilarity).toBeLessThanOrEqual(1);
    }
  });
});

describe("INV-7 motif-preservation gate (creative tier — no third state)", () => {
  it("every candidate is EITHER accepted(sim>=threshold) OR refused(status:refused AND risk:high)", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const profile = loadProfile();
        const threshold = profile.thresholds.vary;
        const candidates = vary(source, undefined, profile, undefined);
        for (const c of candidates) {
          const accepted = c.status === undefined && c.motifSimilarity >= threshold;
          const refused = c.status === "refused" && c.risk === "high";
          if (!(accepted || refused)) return false; // a third state — bug
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it("a REFUSED candidate always carries empty operations (no applicable patch)", () => {
    // Note: an ACCEPTED candidate MAY carry empty operations — an identity
    // variant (e.g. variant B when no harmonic center is supplied, or a clip
    // where no transform fires) legitimately accepts with sim≈1.0 and no diff.
    // The load-bearing invariant is the refused → empty-ops direction (a refused
    // candidate must never carry ops the producer could apply without
    // --allow-below-bar).
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const profile = loadProfile();
        const candidates = vary(source, undefined, profile, undefined);
        for (const c of candidates) {
          if (c.status === "refused" && c.operations.length !== 0) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe("INV-10 integration — refused candidate born risk:high (D-09 audit-trail floor)", () => {
  it("a below-bar candidate self-declares risk:high AND status:refused at birth (the vary-side floor)", () => {
    // Empty source → motif signature degenerates → every variant scores below
    // the generic 0.85 bar → all 3 refuse. This is the deterministic below-bar
    // trigger (a degenerate clip cannot preserve a motif it does not have).
    const out = vary([], undefined, loadProfile(), undefined);
    expect(out).toHaveLength(3);
    for (const c of out) {
      expect(c.status).toBe("refused");
      expect(c.risk).toBe("high"); // D-09: belowBar RECLASSIFIES as HIGH at birth
      expect(c.operations).toEqual([]);
      expect(c.motifSimilarity).toBeLessThan(loadProfile().thresholds.vary);
    }
  });

  it("an accepted candidate never carries risk:high from vary alone (creative medium floor)", () => {
    // With a permissive threshold, all variants of a clear motif accept; none
    // should be born risk:high (high is reserved for the refused below-bar path).
    const out = vary(cMajorMotif(), undefined, profileWith(0.0), HARMONIC_C_MAJOR);
    for (const c of out) {
      if (c.status === undefined) {
        expect(c.risk).not.toBe("high");
      }
    }
  });
});

describe("INV-11 — below-bar default refuses + surfaces near-miss score (D-08)", () => {
  it("a refused candidate carries status:refused + its near-miss motifSimilarity (visibility, not applicable)", () => {
    const out = vary([], undefined, loadProfile(), undefined);
    for (const c of out) {
      expect(c.status).toBe("refused");
      expect(Number.isFinite(c.motifSimilarity)).toBe(true);
    }
  });
});

describe("Pitfall 1 — exactly-at-threshold boundary (>=, not >)", () => {
  it("sim===threshold ACCEPTS; sim a hair below REFUSES", () => {
    const source = cMajorMotif();
    // 1. Run with threshold 0 → variant A accepts; capture its real similarity.
    const candidates0 = vary(source, undefined, profileWith(0.0), HARMONIC_C_MAJOR);
    const a0 = candidates0.find((c) => c.label === "A")!;
    expect(a0.status).toBeUndefined();
    const aSim = a0.motifSimilarity;
    expect(aSim).toBeLessThan(1.0); // A genuinely displaced something

    // 2. threshold === aSim → A still accepts (the >= boundary).
    const atEq = vary(source, undefined, profileWith(aSim), HARMONIC_C_MAJOR).find(
      (c) => c.label === "A",
    )!;
    expect(atEq.status).toBeUndefined();
    expect(atEq.risk).not.toBe("high");

    // 3. threshold = aSim + 1e-9 → A refuses (just below the bar).
    const justAbove = vary(source, undefined, profileWith(aSim + 1e-9), HARMONIC_C_MAJOR).find(
      (c) => c.label === "A",
    )!;
    expect(justAbove.status).toBe("refused");
    expect(justAbove.risk).toBe("high");
  });
});

describe("Held-out representative clips — signature discriminates (RESEARCH.md:1257)", () => {
  it("a clear motif keeps at least one variant above the 0.85 bar", () => {
    const out = vary(cMajorMotif(), undefined, loadProfile(), HARMONIC_C_MAJOR);
    const accepted = out.filter((c) => c.status === undefined);
    expect(accepted.length).toBeGreaterThan(0);
    for (const c of accepted) {
      expect(c.motifSimilarity).toBeGreaterThanOrEqual(loadProfile().thresholds.vary);
    }
  });

  it("a pitch-scrambled clip scores below the vary bar against the original motif", () => {
    // The signature must DISCRIMINATE: a random pitch scramble should not clear
    // 0.85 against a clear motif. (Direct signature check — vary is designed to
    // preserve motif, so we verify the gate MEANS something by showing a
    // scramble fails it.)
    const orig = motifSignature(cMajorMotif());
    const scrambled: Note[] = [
      note(49, 0.0),
      note(11, 0.5),
      note(98, 1.0),
      note(3, 1.5),
      note(71, 2.0),
      note(40, 2.5),
      note(127, 3.0),
      note(22, 3.5),
    ];
    const sim = motifSimilarity(orig, motifSignature(scrambled));
    expect(sim).toBeLessThan(loadProfile().thresholds.vary);
  });
});

describe("Pitfall 2 — vary never emits a pitch change as update_note_field", () => {
  it("every update_note_field op has before.key === after.key", () => {
    const out = vary(cMajorMotif(), undefined, profileWith(0.0), HARMONIC_C_MAJOR);
    for (const c of out) {
      for (const op of c.operations) {
        if (op.op === "update_note_field") {
          expect(op.before.key).toBe(op.after.key); // identity-stable
        }
      }
    }
  });
});

describe("region-aware vary (D-11)", () => {
  it("vary with a region produces well-formed candidates (3 labels, INV-7 holds)", () => {
    const region = { start: 0, end: 2 };
    const out = vary(cMajorMotif(), region, loadProfile(), HARMONIC_C_MAJOR);
    expect(out).toHaveLength(3);
    const threshold = loadProfile().thresholds.vary;
    for (const c of out) {
      const ok = (c.status === undefined && c.motifSimilarity >= threshold) ||
        (c.status === "refused" && c.risk === "high");
      expect(ok).toBe(true);
    }
  });
});

/** Compile-time exhaustiveness: VaryCandidate label is exactly A|B|C. */
function _typeCheck(c: VaryCandidate): "A" | "B" | "C" {
  return c.label;
}
void _typeCheck;
