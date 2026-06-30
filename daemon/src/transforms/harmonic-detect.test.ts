// daemon/src/transforms/harmonic-detect.test.ts
//
// D-12 harmonic-center detection (hand-rolled Krumhansl-Schmuckler — tonal
// CANNOT detect, only materialize). INV-12: detectHarmonicCenter returns null
// when best K-S correlation < 0.5 (no silent guess). Held-out key fixtures
// assert correct tonic+mode on clips with known ground-truth keys.
//
// The held-out discipline (RESEARCH.md:1253-1261): the K-S algorithm + the
// confidence thresholds are public-domain MIR standards, NOT tuned-to-pass
// heuristics. The ground-truth clips below (C-major scale, A-minor pentatonic)
// assert what the STANDARD algorithm must produce, independent of tuning.

import { describe, it, expect } from "vitest";
import { detectHarmonicCenter, materializeScale, type HarmonicDetection } from "./harmonic-detect.js";
import type { Note } from "../cli/diff-logic.js";

/** Note builder mirroring diff-logic.test.ts helper. */
function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/**
 * Held-out fixture: C-major scale across two octaves (clear C-major center).
 * Pitch classes: C D E F G A B (0,2,4,5,7,9,11) — strongly major.
 */
function cMajorScaleClip(): Note[] {
  const pitches = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 83, 84];
  return pitches.map((p, i) => note(p, i * 0.5));
}

/**
 * Held-out fixture: A-minor pentatonic across two octaves (clear A-minor center).
 * Pitch classes: A C D E G (9, 0, 2, 4, 7) — strongly A minor.
 */
function aMinorPentatonicClip(): Note[] {
  const pitches = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
  return pitches.map((p, i) => note(p, i * 0.5));
}

/**
 * Held-out fixture: a maximally ambiguous chromatic clip (one note per pitch
 * class, equal weight) -> uniform PCP -> K-S correlation ~0 -> REFUSE (null).
 */
function chromaticUniformClip(): Note[] {
  // 12 pitch classes 60..71, equal velocity + length -> uniform PCP.
  return Array.from({ length: 12 }, (_, i) => note(60 + i, i * 0.25));
}

describe("INV-12 harmonic detection refuses below bar (D-12 — no silent guess)", () => {
  it("returns null when notes.length < 4 (below minimum density)", () => {
    expect(detectHarmonicCenter([note(60, 0), note(62, 1)])).toBeNull();
    expect(detectHarmonicCenter([note(60, 0), note(62, 1), note(64, 2)])).toBeNull();
  });

  it("returns null for an empty clip", () => {
    expect(detectHarmonicCenter([])).toBeNull();
  });

  it("returns null for a maximally-ambiguous (uniform-chromatic) clip (r < 0.5)", () => {
    // Uniform PCP -> zero variance -> Pearson r = 0 for every rotation -> refuse.
    const result = detectHarmonicCenter(chromaticUniformClip());
    expect(result).toBeNull();
  });
});

describe("detectHarmonicCenter held-out key fixtures (ground-truth assertions)", () => {
  it("detects C major on the C-major-scale clip", () => {
    const det = detectHarmonicCenter(cMajorScaleClip());
    expect(det).not.toBeNull();
    expect(det!.key).toBe("C");
    expect(det!.mode).toBe("major");
  });

  it("detects A minor on the A-minor-pentatonic clip", () => {
    const det = detectHarmonicCenter(aMinorPentatonicClip());
    expect(det).not.toBeNull();
    expect(det!.key).toBe("A");
    expect(det!.mode).toBe("minor");
  });

  it("the C-major detection confidence is in the documented range", () => {
    const det = detectHarmonicCenter(cMajorScaleClip())!;
    // K-S over a clean scale run yields a strong correlation -> 0.75 or 0.9.
    expect(det.confidence).toBeGreaterThanOrEqual(0.6);
    expect(det.confidence).toBeLessThanOrEqual(1.0);
  });

  it("the A-minor detection confidence is in the documented range", () => {
    const det = detectHarmonicCenter(aMinorPentatonicClip())!;
    expect(det.confidence).toBeGreaterThanOrEqual(0.6);
    expect(det.confidence).toBeLessThanOrEqual(1.0);
  });
});

describe("correlation -> confidence mapping (RESEARCH.md:808-812)", () => {
  it("a strong tonal clip yields confidence 0.9 (r > 0.85) or 0.75 (r > 0.7)", () => {
    // C-major across two octaves is a textbook-strong center.
    const det = detectHarmonicCenter(cMajorScaleClip())!;
    expect([0.9, 0.75]).toContain(det.confidence);
  });

  it("detectHarmonicCenter never returns a confidence below 0.6 (would be null instead)", () => {
    const det = detectHarmonicCenter(cMajorScaleClip())!;
    expect(det.confidence).toBeGreaterThanOrEqual(0.6);
  });
});

describe("detectHarmonicCenter purity", () => {
  it("does not mutate the input note array", () => {
    const notes = cMajorScaleClip();
    const snapshot = JSON.parse(JSON.stringify(notes));
    detectHarmonicCenter(notes);
    expect(notes).toEqual(snapshot);
  });
});

describe("materializeScale (tonal LOOKUP — D-12 downstream materialization)", () => {
  it("materializes a detected major scale via tonal Key.majorKey", () => {
    const scale = materializeScale({ key: "C", mode: "major", confidence: 0.9 });
    // C major scale: C D E F G A B
    expect(scale).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
  });

  it("materializes a detected minor scale via tonal Key.minorKey (natural)", () => {
    const scale = materializeScale({ key: "A", mode: "minor", confidence: 0.9 });
    // A natural minor: A B C D E F G
    expect(scale).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("a round-trip: detect then materialize yields an in-key scale", () => {
    const det: HarmonicDetection = detectHarmonicCenter(cMajorScaleClip())!;
    const scale = materializeScale(det);
    expect(scale.length).toBe(7);
    expect(scale[0]).toBe(det.key);
  });
});
