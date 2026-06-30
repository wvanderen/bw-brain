// daemon/src/transforms/counterline.test.ts
//
// MIDI-03 counterline — companion voice in the SAME clip (creative tier, D-12).
// Emits add_note ops (a third/fifth BELOW strong-beat source notes), pitch drawn
// from the harmonic-center scale.
//
// INV-7: result is EITHER motifSimilarity>=threshold(counterline 0.80) OR
//        status:"refused" (NO THIRD STATE).
// D-02: writes into the SAME clip (companion add_notes; no new track/clip scope).
//
// TDD RED: authored BEFORE counterline.ts exists. The import fails → RED.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { counterline } from "./counterline.js";
import { loadProfile } from "../profiles/profile-loader.js";
import { arbNoteSet } from "../patch/arb.js";
import { materializeScale, type HarmonicDetection } from "./harmonic-detect.js";
import { Note as TonalNote } from "tonal";
import type { Note } from "../cli/diff-logic.js";

function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** A clear C-major motif with notes on the strong beats (0,1,2,3). */
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

const HARMONIC_C_MAJOR = { key: "C", mode: "major" as const };
const HARMONIC_A_MINOR = { key: "A", mode: "minor" as const };

/** Pitch-class set of a detected scale (via tonal Note.chroma). */
function scalePcs(det: HarmonicDetection): Set<number> {
  return new Set(materializeScale(det).map((n) => TonalNote.chroma(n)));
}

describe("counterline MIDI-03 — shape", () => {
  it("returns {operations, motifSimilarity, risk} (+ optional status)", () => {
    const out = counterline(cMajorMotif(), undefined, loadProfile(), HARMONIC_C_MAJOR);
    expect(Number.isFinite(out.motifSimilarity)).toBe(true);
    expect(Array.isArray(out.operations)).toBe(true);
    expect(["low", "medium", "high"]).toContain(out.risk);
  });

  it("every op is an add_note (companion voice — D-02 same clip)", () => {
    const out = counterline(cMajorMotif(), undefined, loadProfile(), HARMONIC_C_MAJOR);
    for (const op of out.operations) {
      expect(op.op).toBe("add_note");
    }
  });
});

describe("counterline MIDI-03 — chord-tone conformity (D-12 harmonic scale)", () => {
  it("companion pitches are members of the C-major scale", () => {
    const out = counterline(cMajorMotif(), undefined, loadProfile(), HARMONIC_C_MAJOR);
    const allowed = scalePcs({ key: "C", mode: "major", confidence: 0.9 });
    for (const op of out.operations) {
      if (op.op === "add_note") {
        expect(allowed.has(TonalNote.chroma(`${op.note.pitch}`))).toBe(true);
      }
    }
  });

  it("companion notes land BELOW their same-beat source (a third/fifth under)", () => {
    const src = cMajorMotif();
    const out = counterline(src, undefined, loadProfile(), HARMONIC_C_MAJOR);
    for (const op of out.operations) {
      if (op.op === "add_note") {
        const sameBeatSource = src.filter((n) => Math.abs(n.start - op.note.start) < 0.001);
        if (sameBeatSource.length > 0) {
          const top = Math.max(...sameBeatSource.map((n) => n.pitch));
          expect(op.note.pitch).toBeLessThanOrEqual(top);
        }
      }
    }
  });
});

describe("INV-7 — counterline is refuse-or-pass (no third state)", () => {
  it("result is EITHER accepted(ops non-empty, sim>=threshold) OR refused(status:refused)", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const profile = loadProfile();
        const threshold = profile.thresholds.counterline;
        const out = counterline(source, undefined, profile, HARMONIC_C_MAJOR);
        const accepted = out.status === undefined && out.motifSimilarity >= threshold;
        const refused = out.status === "refused";
        return accepted || refused;
      }),
      { numRuns: 150 },
    );
  });

  it("a refused counterline carries status:refused + the near-miss score + empty ops", () => {
    // Empty source → no strong beats → degenerate signature → below bar → refuse.
    const out = counterline([], undefined, loadProfile(), HARMONIC_C_MAJOR);
    expect(out.status).toBe("refused");
    expect(Number.isFinite(out.motifSimilarity)).toBe(true);
    expect(out.operations).toEqual([]);
  });
});

describe("counterline self-declares risk medium (creative tier, D-07)", () => {
  it("an accepted counterline carries risk medium (adds notes)", () => {
    const out = counterline(cMajorMotif(), undefined, loadProfile(), HARMONIC_C_MAJOR);
    if (out.status === undefined) {
      expect(out.risk).toBe("medium");
    }
  });

  it("a refused counterline carries risk high (below-bar floor, D-09)", () => {
    const out = counterline([], undefined, loadProfile(), HARMONIC_C_MAJOR);
    expect(out.status).toBe("refused");
    expect(out.risk).toBe("high");
  });
});

describe("counterline harmonic-aware (D-12)", () => {
  it("counterline over A-minor produces A-minor scale-conformant companions", () => {
    const out = counterline(cMajorMotif(), undefined, loadProfile(), HARMONIC_A_MINOR);
    const allowed = scalePcs({ key: "A", mode: "minor", confidence: 0.9 });
    for (const op of out.operations) {
      if (op.op === "add_note") {
        expect(allowed.has(TonalNote.chroma(`${op.note.pitch}`))).toBe(true);
      }
    }
  });
});
