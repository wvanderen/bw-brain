// daemon/src/cli/diff-logic.test.ts
//
// SC#1 round-trip property test for the pure bw-diff logic.
//
// SC#1 (ROADMAP.md Phase 2): "bw-diff round-trips 100%". Made executable here as
// a pure-function property: for every synthetic raw-state pair (a, b),
//   computeStateDiff(applyDiff(a, computeStateDiff(a, b)), b)
// is EMPTY across notesAdded/notesRemoved/notesChanged — the diff→apply cycle is
// lossless. This mirrors the seeded-RNG property-test pattern in
// protocol/line-buffer.test.ts (reproducible fixtures, explicit edge cases).
//
// Note identity is BY KEY + content (set semantics), NOT array position: a
// reordered note list is NOT a change — this is the musically-correct definition
// (note order in the JSON array is presentation, not identity). The "reordered"
// fixture proves reorder → empty diff.
//
// ESM + NodeNext: .js import extensions (AGENTS.md convention; tsconfig.json
// _comment HARD RULE). diff-logic.ts is a PURE module (no I/O) — mirrors the
// handshake.ts pure-function pattern.
import { describe, it, expect } from "vitest";
import {
  computeStateDiff,
  applyDiff,
  type Note,
  type RawState,
} from "./diff-logic.js";

/** Build a note with a stable key. */
function note(
  key: string,
  pitch: number,
  start: number,
  length: number,
  velocity: number,
): Note {
  return { key, pitch, start, length, velocity };
}

/** Canonicalize a notes array by key for order-independent deep comparison. */
function sortByKey(notes: Note[] | undefined): Note[] {
  return [...(notes ?? [])].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}

/** Order-independent deep equality of two raw-states' note sets (SC#1 semantics). */
function notesEqualSet(a: RawState, b: RawState): boolean {
  const xa = sortByKey(a.notes);
  const xb = sortByKey(b.notes);
  return JSON.stringify(xa) === JSON.stringify(xb);
}

/** Assert the round-trip is lossless: applyDiff∘computeStateDiff yields b's notes. */
function assertRoundTrip(a: RawState, b: RawState): void {
  const diff = computeStateDiff(a, b);
  const reconstructed = applyDiff(a, diff);
  // SC#1 100% bar: reconstructing from the diff reproduces b's note set exactly.
  expect(notesEqualSet(reconstructed, b)).toBe(true);
  // The residual diff (reconstructed vs b) is EMPTY — lossless round-trip.
  const residual = computeStateDiff(reconstructed, b);
  expect(residual.notesAdded.length).toBe(0);
  expect(residual.notesRemoved.length).toBe(0);
  expect(residual.notesChanged.length).toBe(0);
}

describe("bw-diff pure logic — SC#1 round-trip property", () => {
  it("empty ↔ empty diff is empty", () => {
    const a: RawState = { notes: [] };
    const b: RawState = { notes: [] };
    const diff = computeStateDiff(a, b);
    expect(diff.notesAdded).toEqual([]);
    expect(diff.notesRemoved).toEqual([]);
    expect(diff.notesChanged).toEqual([]);
    assertRoundTrip(a, b);
  });

  it("single-note add: a empty, b has one note", () => {
    const a: RawState = { notes: [] };
    const b: RawState = { notes: [note("n1", 60, 0, 0.5, 100)] };
    const diff = computeStateDiff(a, b);
    expect(diff.notesAdded).toEqual([note("n1", 60, 0, 0.5, 100)]);
    expect(diff.notesRemoved).toEqual([]);
    expect(diff.notesChanged).toEqual([]);
    assertRoundTrip(a, b);
  });

  it("single-note remove: a has one note, b empty", () => {
    const a: RawState = { notes: [note("n1", 60, 0, 0.5, 100)] };
    const b: RawState = { notes: [] };
    const diff = computeStateDiff(a, b);
    expect(diff.notesAdded).toEqual([]);
    expect(diff.notesRemoved).toEqual([note("n1", 60, 0, 0.5, 100)]);
    expect(diff.notesChanged).toEqual([]);
    assertRoundTrip(a, b);
  });

  it("multi-note mix: one kept, one changed, one removed, one added", () => {
    const a: RawState = {
      notes: [
        note("keep", 60, 0, 0.5, 100),
        note("change", 64, 1, 0.5, 100),
        note("remove", 67, 2, 0.5, 100),
      ],
    };
    const b: RawState = {
      notes: [
        note("keep", 60, 0, 0.5, 100),
        note("change", 64, 1, 0.5, 110), // velocity bumped
        note("add", 72, 3, 0.5, 100),
      ],
    };
    const diff = computeStateDiff(a, b);
    expect(diff.notesAdded.map((n) => n.key)).toEqual(["add"]);
    expect(diff.notesRemoved.map((n) => n.key)).toEqual(["remove"]);
    expect(diff.notesChanged.map((c) => c.after.key)).toEqual(["change"]);
    expect(diff.notesChanged[0]?.after.velocity).toBe(110);
    assertRoundTrip(a, b);
  });

  it("reordered notes: same notes different order → empty diff (order is not identity)", () => {
    const a: RawState = {
      notes: [note("n1", 60, 0, 0.5, 100), note("n2", 64, 1, 0.5, 100)],
    };
    const b: RawState = {
      notes: [note("n2", 64, 1, 0.5, 100), note("n1", 60, 0, 0.5, 100)],
    };
    const diff = computeStateDiff(a, b);
    expect(diff.notesAdded).toEqual([]);
    expect(diff.notesRemoved).toEqual([]);
    expect(diff.notesChanged).toEqual([]);
    // Round-trip holds even though array order differs — note SET is identical.
    const reconstructed = applyDiff(a, diff);
    expect(notesEqualSet(reconstructed, b)).toBe(true);
  });

  it("velocity-only change: same key, different velocity → notesChanged", () => {
    const a: RawState = { notes: [note("n1", 60, 0, 0.5, 100)] };
    const b: RawState = { notes: [note("n1", 60, 0, 0.5, 127)] };
    const diff = computeStateDiff(a, b);
    expect(diff.notesChanged.length).toBe(1);
    expect(diff.notesChanged[0]?.before.velocity).toBe(100);
    expect(diff.notesChanged[0]?.after.velocity).toBe(127);
    expect(diff.notesAdded).toEqual([]);
    expect(diff.notesRemoved).toEqual([]);
    assertRoundTrip(a, b);
  });

  it("pitch/start/length change: same key, different content → notesChanged", () => {
    const a: RawState = { notes: [note("n1", 60, 0, 0.5, 100)] };
    const b: RawState = { notes: [note("n1", 62, 0.25, 0.25, 100)] };
    const diff = computeStateDiff(a, b);
    expect(diff.notesChanged.length).toBe(1);
    expect(diff.notesChanged[0]?.after.pitch).toBe(62);
    expect(diff.notesChanged[0]?.after.start).toBe(0.25);
    expect(diff.notesChanged[0]?.after.length).toBe(0.25);
    assertRoundTrip(a, b);
  });
});

describe("bw-diff pure logic — automation + scope reporting", () => {
  it("automationTouched reports parameter names whose values differ", () => {
    const a: RawState = {
      notes: [],
      automation: { cutoff: 0.5, resonance: 0.2, gain: 0.8 },
    };
    const b: RawState = {
      notes: [],
      automation: { cutoff: 0.9, resonance: 0.2, gain: 0.8 },
    };
    const diff = computeStateDiff(a, b);
    expect(diff.automationTouched.sort()).toEqual(["cutoff"]);
  });

  it("automationTouched is empty when automation maps are equal", () => {
    const a: RawState = { notes: [], automation: { cutoff: 0.5 } };
    const b: RawState = { notes: [], automation: { cutoff: 0.5 } };
    expect(computeStateDiff(a, b).automationTouched).toEqual([]);
  });

  it("automationTouched handles keys present only on one side", () => {
    const a: RawState = { notes: [], automation: { cutoff: 0.5 } };
    const b: RawState = { notes: [], automation: { cutoff: 0.5, drive: 0.3 } };
    const diff = computeStateDiff(a, b);
    expect(diff.automationTouched.sort()).toEqual(["drive"]);
  });

  it("scopeTrackSids is the union of both sides' scope", () => {
    const a: RawState = { notes: [], scopeTrackSids: ["trk_a1", "trk_a2"] };
    const b: RawState = { notes: [], scopeTrackSids: ["trk_a2", "trk_b1"] };
    const diff = computeStateDiff(a, b);
    expect(diff.scopeTrackSids.sort()).toEqual(["trk_a1", "trk_a2", "trk_b1"]);
  });

  it("scopeTrackSids is empty when both sides are empty/absent", () => {
    const a: RawState = { notes: [] };
    const b: RawState = { notes: [] };
    expect(computeStateDiff(a, b).scopeTrackSids).toEqual([]);
  });
});

describe("bw-diff pure logic — purity (no side effects)", () => {
  it("computeStateDiff does not mutate its inputs", () => {
    const a: RawState = { notes: [note("n1", 60, 0, 0.5, 100)] };
    const b: RawState = { notes: [note("n2", 64, 1, 0.5, 100)] };
    const aSnapshot = JSON.parse(JSON.stringify(a));
    const bSnapshot = JSON.parse(JSON.stringify(b));
    computeStateDiff(a, b);
    expect(a).toEqual(aSnapshot);
    expect(b).toEqual(bSnapshot);
  });

  it("applyDiff does not mutate its base input", () => {
    const a: RawState = { notes: [note("n1", 60, 0, 0.5, 100)] };
    const b: RawState = { notes: [note("n1", 60, 0, 0.5, 127)] };
    const aSnapshot = JSON.parse(JSON.stringify(a));
    const diff = computeStateDiff(a, b);
    applyDiff(a, diff);
    expect(a).toEqual(aSnapshot);
  });
});
