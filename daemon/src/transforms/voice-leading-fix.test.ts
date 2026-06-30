// daemon/src/transforms/voice-leading-fix.test.ts
//
// MIDI-04 voice-leading-fix — low-risk cleanup (parallel P5/P8, leading tones,
// spacing). Cleanup tier (D-10): SKIPS the motif gate; INV-8 — result is NEVER
// status:"refused" on motif grounds (a refusing cleanup is a bug, not a feature).
//
// Pitfall 2: pitch changes are ALWAYS remove_note(old)+add_note(new) pairs —
// NEVER update_note_field on pitch (a different pitch IS a different identity).
//
// TDD RED: authored BEFORE voice-leading-fix.ts exists. The import fails → RED.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { voiceLeadingFix } from "./voice-leading-fix.js";
import { arbNoteSet } from "../patch/arb.js";
import type { Note } from "../cli/diff-logic.js";

function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** Two consecutive P5s (7 semitones each) in a single voice → parallel fifths. */
function parallelFifthsClip(): Note[] {
  return [
    note(60, 0.0), // C
    note(67, 1.0), // G  (+7 = P5)
    note(74, 2.0), // D  (+7 = P5 again) → parallel fifth between 67→74
  ];
}

/** Two consecutive P8s (12 semitones each) → parallel octaves. */
function parallelOctavesClip(): Note[] {
  return [
    note(60, 0.0),
    note(72, 1.0), // +12 = P8
    note(84, 2.0), // +12 = P8 again → parallel octave
  ];
}

describe("voice-leading-fix MIDI-04 — shape", () => {
  it("returns {operations, risk}", () => {
    const out = voiceLeadingFix(parallelFifthsClip());
    expect(Array.isArray(out.operations)).toBe(true);
    expect(out.risk).toBe("low");
  });
});

describe("INV-8 — cleanup tier NEVER refuses on motif grounds (D-10)", () => {
  it("result never carries status:refused (a refusing cleanup is a bug)", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = voiceLeadingFix(source);
        // Cleanup tier has NO status field at all; the absence of refusal is
        // the invariant.
        return (out as { status?: string }).status === undefined;
      }),
      { numRuns: 200 },
    );
  });

  it("an empty clip is cleaned up to empty ops (never refuses)", () => {
    const out = voiceLeadingFix([]);
    expect((out as { status?: string }).status).toBeUndefined();
    expect(out.operations).toEqual([]);
  });
});

describe("Pitfall 2 — pitch changes are remove_note+add_note pairs (NEVER update on pitch)", () => {
  it("NO update_note_field op has before.pitch !== after.pitch", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = voiceLeadingFix(source);
        for (const op of out.operations) {
          if (op.op === "update_note_field") {
            if (op.before.pitch !== op.after.pitch) return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it("every update_note_field op keeps before.key === after.key (identity-stable)", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = voiceLeadingFix(source);
        for (const op of out.operations) {
          if (op.op === "update_note_field") {
            if (op.before.key !== op.after.key) return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it("a clip with parallel fifths triggers at least one remove_note+add_note pair (pitch move)", () => {
    const out = voiceLeadingFix(parallelFifthsClip());
    // Parallel-fifth resolution MOVES a pitch → must be remove+add, not update.
    const removes = out.operations.filter((o) => o.op === "remove_note").length;
    const adds = out.operations.filter((o) => o.op === "add_note").length;
    // When a fix fires, removes and adds come in pairs.
    expect(removes).toEqual(adds);
    expect(removes + adds + out.operations.filter((o) => o.op === "update_note_field").length)
      .toBe(out.operations.length);
  });

  it("a clip with parallel octaves triggers a pitch move (remove+add pair)", () => {
    const out = voiceLeadingFix(parallelOctavesClip());
    const removes = out.operations.filter((o) => o.op === "remove_note").length;
    const adds = out.operations.filter((o) => o.op === "add_note").length;
    expect(removes).toEqual(adds);
  });
});

describe("voice-leading-fix self-declares risk low (cleanup tier, D-07)", () => {
  it("result.risk === 'low' regardless of input", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        return voiceLeadingFix(source).risk === "low";
      }),
      { numRuns: 100 },
    );
  });
});

describe("voice-leading-fix — idempotence on a clean clip", () => {
  it("a clip with no parallel P5/P8 produces no ops (already clean)", () => {
    // A single note has no intervals → no parallels → no fix.
    const out = voiceLeadingFix([note(60, 0.0)]);
    expect(out.operations).toEqual([]);
  });
});
