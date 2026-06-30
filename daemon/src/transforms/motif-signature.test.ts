// daemon/src/transforms/motif-signature.test.ts
//
// MIDI-01 motif signature (PCP + IOI histogram + density) + similarity.
// INV-6 sanity: motifSimilarity(sig, sig) === 1.0; symmetry sim(a,b)===sim(b,a);
// empty/single-note clips do NOT NaN (Number.isFinite on every field).
//
// Mirrors diff-logic.test.ts (pure-fn test discipline) + analyzer-registry
// assertion shape. Region-aware computation (D-11) is exercised here.

import { describe, it, expect } from "vitest";
import {
  motifSignature,
  motifSimilarity,
  MotifSignatureAnalyzer,
  type MotifSignature,
} from "./motif-signature.js";
import type { Note } from "../cli/diff-logic.js";

/** Note builder mirroring diff-logic.test.ts helper (key minted by the real noteKey). */
function note(pitch: number, start: number, length = 0.5, velocity = 100, key?: string): Note {
  return { key: key ?? `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** A small tonal clip (C-major-ish) for non-trivial signature comparisons. */
function cMajorClip(): Note[] {
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

/** A different clip (A-minor pentatonic) for similarity comparisons. */
function aMinorClip(): Note[] {
  return [
    note(57, 0.0),
    note(60, 0.5),
    note(62, 1.0),
    note(64, 1.5),
    note(67, 2.0),
    note(64, 2.5),
    note(62, 3.0),
    note(60, 3.5),
  ];
}

describe("INV-6 motif signature sanity (MIDI-01)", () => {
  it("motifSimilarity(sig, sig) === 1.0 (within float epsilon)", () => {
    const sig = motifSignature(cMajorClip());
    const self = motifSimilarity(sig, sig);
    expect(self).toBeCloseTo(1.0, 9);
  });

  it("self-similarity holds for the A-minor clip too", () => {
    const sig = motifSignature(aMinorClip());
    expect(motifSimilarity(sig, sig)).toBeCloseTo(1.0, 9);
  });

  it("symmetry: sim(a, b) === sim(b, a)", () => {
    const a = motifSignature(cMajorClip());
    const b = motifSignature(aMinorClip());
    expect(motifSimilarity(a, b)).toBeCloseTo(motifSimilarity(b, a), 9);
  });

  it("similarity is bounded in [0, 1]", () => {
    const a = motifSignature(cMajorClip());
    const b = motifSignature(aMinorClip());
    const s = motifSimilarity(a, b);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("motifSignature empty + single-note edges (no NaN — T-3-16 DoS defense)", () => {
  it("motifSignature([]) returns finite fields on EVERY field (no NaN, no Infinity)", () => {
    const sig = motifSignature([]);
    expect(sig.pcp).toHaveLength(12);
    expect(sig.rhythm).toHaveLength(5);
    for (const v of sig.pcp) expect(Number.isFinite(v)).toBe(true);
    for (const v of sig.rhythm) expect(Number.isFinite(v)).toBe(true);
    expect(Number.isFinite(sig.density)).toBe(true);
  });

  it("motifSignature([]) has pcp summing to 0 (all-zero, divide-by-zero guarded)", () => {
    const sig = motifSignature([]);
    const sum = sig.pcp.reduce((a, b) => a + b, 0);
    expect(sum).toBe(0); // all zeros, no NaN
  });

  it("motifSignature of a single note has finite density (no NaN)", () => {
    const sig = motifSignature([note(60, 0)]);
    expect(Number.isFinite(sig.density)).toBe(true);
    expect(sig.pcp).toHaveLength(12);
    for (const v of sig.pcp) expect(Number.isFinite(v)).toBe(true);
  });

  it("motifSimilarity on two empty signatures is finite (no NaN)", () => {
    const empty: MotifSignature = motifSignature([]);
    expect(Number.isFinite(motifSimilarity(empty, empty))).toBe(true);
  });
});

describe("motifSignature PCP weighting (velocity x length)", () => {
  it("PCP is a 12-bin normalized vector summing to ~1.0 for a non-empty clip", () => {
    const sig = motifSignature(cMajorClip());
    const sum = sig.pcp.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("PCP weight for a note scales with velocity x length (louder+longer dominates)", () => {
    // One short quiet C, one long loud G (pitch 67 = class 7).
    const dominated = motifSignature([
      note(60, 0.0, 0.0625, 10), // quiet + short
      note(67, 1.0, 4.0, 127), // loud + long
    ]);
    // pitch class 7 (G) must dominate pitch class 0 (C).
    expect(dominated.pcp[7]).toBeGreaterThan(dominated.pcp[0]);
  });
});

describe("motifSignature rhythm histogram + density", () => {
  it("rhythm is a 5-bucket normalized vector summing to ~1.0 (multi-note clip)", () => {
    const sig = motifSignature(cMajorClip());
    const sum = sig.rhythm.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("density = notes / span (more notes in the same span -> higher density)", () => {
    const sparse = motifSignature([note(60, 0), note(60, 4)]); // 2 notes over 4 beats
    const dense = motifSignature([note(60, 0), note(60, 0.5), note(60, 1.0), note(60, 1.5)]); // 4 notes over 1.5 beats
    expect(dense.density).toBeGreaterThan(sparse.density);
  });
});

describe("motifSignature region-aware computation (D-11)", () => {
  it("rhythm + density computed over [region.start, region.end); PCP includes 1-beat context", () => {
    // Three notes at 0, 2, 4. Region {0, 2}: only the note at 0 is in [0,2).
    const notes = [note(60, 0), note(64, 2), note(67, 4)];
    const whole = motifSignature(notes);
    const region = motifSignature(notes, { start: 0, end: 2 });

    // Density over the region reflects ONLY the in-region note(s), so it differs
    // from the whole-clip density.
    expect(region.density).not.toBeCloseTo(whole.density, 6);
    expect(Number.isFinite(region.density)).toBe(true);

    // Rhythm over a single in-region note has no IOI pairs -> all-zero histogram.
    const rhythmSum = region.rhythm.reduce((a, b) => a + b, 0);
    expect(rhythmSum).toBe(0);
  });

  it("region PCP includes 1-bead-of-context notes (harmonic continuity, D-11)", () => {
    // region {0,2}: in-region = [0,2); PCP context = [-1, 3) (1 beat each side).
    //  - note at 0 (pitch 60/class 0): in-region
    //  - note at 2.5 (pitch 62/class 2): OUT of region (2.5 >= 2) but IN PCP
    //    context (2.5 < region.end + 1 = 3)
    //  - note at 4 (pitch 67/class 7): outside both region and context (4 >= 3)
    const notes = [
      note(60, 0), // in region
      note(62, 2.5), // 1-beat context below region.end
      note(67, 4), // outside context
    ];
    const region = motifSignature(notes, { start: 0, end: 2 });
    // pitch class 0 (C, in-region) and 2 (D, context) present in PCP;
    // pitch class 7 (G, outside the 1-beat context window) absent.
    expect(region.pcp[0]).toBeGreaterThan(0);
    expect(region.pcp[2]).toBeGreaterThan(0);
    expect(region.pcp[7]).toBe(0);
  });

  it("omitting regionBeats computes over the whole clip (equivalent to no filter)", () => {
    const notes = cMajorClip();
    const noRegion = motifSignature(notes);
    const explicit = motifSignature(notes, { start: -Infinity, end: Infinity });
    // -Infinity..Infinity includes everything -> same as no filter.
    expect(noRegion.pcp).toEqual(explicit.pcp);
    expect(noRegion.rhythm).toEqual(explicit.rhythm);
    expect(noRegion.density).toBeCloseTo(explicit.density, 9);
  });
});

describe("MotifSignatureAnalyzer plugin (D-08 analyzer-registry)", () => {
  it('id is "motifs", consumes ["clips"], produces ["motifs"]', () => {
    expect(MotifSignatureAnalyzer.id).toBe("motifs");
    expect(MotifSignatureAnalyzer.consumes).toEqual(["clips"]);
    expect(MotifSignatureAnalyzer.produces).toEqual(["motifs"]);
  });

  it("analyze() is pure: never mutates the raw state", () => {
    const raw = {
      version: "1.0",
      project: { name: "T", tempo: 120, timeSignature: "4/4" },
      selection: {},
      clips: cMajorClip(),
    } as unknown as Parameters<typeof MotifSignatureAnalyzer.analyze>[0];
    const snapshot = JSON.parse(JSON.stringify(raw));
    MotifSignatureAnalyzer.analyze(raw, { intent: null, now: 0 });
    expect(raw).toEqual(snapshot);
  });

  it("analyze() computes a signature DerivedField with confidence 1.0 + an assumption", () => {
    const raw = {
      version: "1.0",
      project: { name: "T", tempo: 120, timeSignature: "4/4" },
      selection: {},
      clips: cMajorClip(),
    } as unknown as Parameters<typeof MotifSignatureAnalyzer.analyze>[0];
    const out = MotifSignatureAnalyzer.analyze(raw, { intent: null, now: 0 });
    expect(out).toHaveLength(1);
    const f = out[0];
    expect(f.field).toBe("motifs");
    expect(f.confidence).toBe(1.0);
    expect(f.assumptions.length).toBeGreaterThan(0);
    const sig = f.value as MotifSignature;
    expect(sig.pcp).toHaveLength(12);
    expect(sig.rhythm).toHaveLength(5);
    expect(Number.isFinite(sig.density)).toBe(true);
  });

  it("analyze() refuses (returns []) when no clip notes are available (no guess)", () => {
    const raw = {
      version: "1.0",
      project: { name: "T", tempo: 120, timeSignature: "4/4" },
      selection: {},
      clips: [], // no notes
    } as unknown as Parameters<typeof MotifSignatureAnalyzer.analyze>[0];
    const out = MotifSignatureAnalyzer.analyze(raw, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });
});
