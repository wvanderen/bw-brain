// daemon/src/transforms/humanize.test.ts
//
// MIDI-05 humanize — velocity/timing humanization (cleanup tier, D-10).
// Emits update_note_field ops: gaussian velocity ±jitter (clamp 1-127), start
// ±jitterBeats (clamp ≥0); KEY STABLE (identity unchanged).
//
// INV-8: cleanup tier NEVER refuses on motif grounds (D-10 — a refusing
//        humanize is a bug, not a feature).
// Identity-stable: every update_note_field op has before.key === after.key
//        (velocity/start mutate; pitch+quantized-start identity unchanged).
//
// TDD RED: authored BEFORE humanize.ts exists. The import fails → RED.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { humanize } from "./humanize.js";
import { loadProfile } from "../profiles/profile-loader.js";
import { arbNoteSet } from "../patch/arb.js";
import type { Note } from "../cli/diff-logic.js";

function note(pitch: number, start: number, length = 0.5, velocity = 100): Note {
  return { key: `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

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

describe("humanize MIDI-05 — shape", () => {
  it("returns {operations, risk}", () => {
    const out = humanize(cMajorMotif(), loadProfile());
    expect(Array.isArray(out.operations)).toBe(true);
    expect(out.risk).toBe("low");
  });
});

describe("INV-8 — cleanup tier NEVER refuses on motif grounds (D-10)", () => {
  it("result never carries status:refused", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = humanize(source, loadProfile());
        return (out as { status?: string }).status === undefined;
      }),
      { numRuns: 200 },
    );
  });

  it("an empty clip produces empty ops (never refuses)", () => {
    const out = humanize([], loadProfile());
    expect((out as { status?: string }).status).toBeUndefined();
    expect(out.operations).toEqual([]);
  });
});

describe("humanize emits update_note_field ops only (no add/remove)", () => {
  it("every op is update_note_field", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = humanize(source, loadProfile());
        return out.operations.every((op) => op.op === "update_note_field");
      }),
      { numRuns: 200 },
    );
  });
});

describe("identity-stable (Pitfall 2) — before.key === after.key", () => {
  it("every update_note_field op keeps before.key === after.key", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = humanize(source, loadProfile());
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

  it("humanize never changes pitch (before.pitch === after.pitch)", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = humanize(source, loadProfile());
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
});

describe("humanize clamps velocity to [1, 127]", () => {
  it("every after.velocity ∈ [1,127] (jitter clamped)", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = humanize(source, loadProfile());
        for (const op of out.operations) {
          if (op.op === "update_note_field") {
            if (op.after.velocity < 1 || op.after.velocity > 127) return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it("humanize on a max-velocity clip keeps velocity ≤ 127 (no overflow)", () => {
    const loud: Note[] = [note(60, 0.0, 0.5, 127), note(64, 0.5, 0.5, 127)];
    const out = humanize(loud, loadProfile());
    for (const op of out.operations) {
      if (op.op === "update_note_field") {
        expect(op.after.velocity).toBeLessThanOrEqual(127);
        expect(op.after.velocity).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("humanize on a min-velocity clip keeps velocity ≥ 1 (no underflow)", () => {
    const quiet: Note[] = [note(60, 0.0, 0.5, 1), note(64, 0.5, 0.5, 1)];
    const out = humanize(quiet, loadProfile());
    for (const op of out.operations) {
      if (op.op === "update_note_field") {
        expect(op.after.velocity).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("humanize clamps start ≥ 0 (timing jitter)", () => {
  it("every after.start ≥ 0", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        const out = humanize(source, loadProfile());
        for (const op of out.operations) {
          if (op.op === "update_note_field") {
            if (op.after.start < 0) return false;
          }
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it("humanize on a clip starting at 0 never produces a negative start", () => {
    const startsAtZero: Note[] = [note(60, 0.0), note(62, 0.5)];
    const out = humanize(startsAtZero, loadProfile());
    for (const op of out.operations) {
      if (op.op === "update_note_field") {
        expect(op.after.start).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("humanize self-declares risk low (cleanup tier, D-07)", () => {
  it("result.risk === 'low' regardless of input", () => {
    fc.assert(
      fc.property(arbNoteSet, (source) => {
        return humanize(source, loadProfile()).risk === "low";
      }),
      { numRuns: 100 },
    );
  });
});
