// daemon/src/state/reconcile.test.ts
//
// SC#3 STATE-04 reconcile held-out property test (RESEARCH.md §Validation row
// STATE-04 (reconcile — SC#3 critical) line 1393; 02-03a-PLAN.md Task 1
// <behavior> tests 1-6; Shared Pattern H — seeded-RNG property + unit cases).
//
// This is the HELD-OUT test that proves the trust spine: a 20-track project
// reorders, renames, gains, and loses tracks on bridge reconnect, and the
// stable IDs survive. RESEARCH.md §Assumptions A5 line 1334-1338 pins this as
// the bar: "ship the documented reconcile + a held-out fixture test simulating
// a 20-track reorder; tune the fuzzy fallback after observing real behavior."
// The held-out bar is >=18 of 20 sids survive the reorder (the plan's
// acceptance criterion).
//
// reconcile() is PURE over (observed, persisted, now) — no I/O. The caller
// (02-03b ingest path) owns persistence. These tests mutate the persisted map
// in place across rounds to simulate reconnect cycles.
import { describe, it, expect } from "vitest";
import {
  reconcile,
  emptyStableIdMap,
  ObservedObject,
} from "./reconcile.js";
import type { ProjectState } from "../gen/project-state.js";

/** Build a synthetic N-track RawState. Each track has a distinct name, a
 *  stable contentHash, and neighbors = [prev name, next name] (sorted).
 *  `contentHashOf` defaults to `ch_${name}` but the rename test overrides it
 *  so a rename can preserve the contentHash (the "stable content" case). */
function buildTrackState(
  trackNames: string[],
  opts?: { contentHashOf?: (name: string) => string },
): ProjectState {
  const contentHashOf = opts?.contentHashOf ?? ((name) => `ch_${name}`);
  const tracks: ObservedObject[] = trackNames.map((name, i) => {
    const prev = i > 0 ? trackNames[i - 1] : "";
    const next = i < trackNames.length - 1 ? trackNames[i + 1] : "";
    const neighbors = [prev, next].filter((n) => n.length > 0).sort();
    return {
      name,
      type: "track" as const,
      neighbors,
      // contentHash is stable per identity — unchanged across reorder/rename
      // when the caller preserves it via contentHashOf.
      contentHash: contentHashOf(name),
    };
  });
  return {
    version: "1.0",
    project: { name: "Test", tempo: 130, timeSignature: "4/4" },
    selection: {},
    tracks,
  };
}

const NAMES_20 = [
  "Kick", "Bass", "Lead", "Pad", "Snare",
  "Hats", "Clap", "Ride", "Tom", "Perc",
  "Pluck", "Stab", "Chord", "Arp", "FX",
  "Vocal", "Guitar", "Piano", "Strings", "Sub",
];

describe("reconcile (SC#3 STATE-04 — held-out 20-track property test)", () => {
  it("Test 1: reconcile(state, emptyMap) → 20 new sids", () => {
    const state = buildTrackState(NAMES_20);
    const persisted = emptyStableIdMap();
    const result = reconcile(state, persisted, 1000);
    expect(result.new).toHaveLength(20);
    expect(result.matched).toHaveLength(0);
    expect(result.reassigned).toHaveLength(0);
    expect(result.vanished).toHaveLength(0);
    // All 20 sids minted + registered.
    expect(persisted.byFingerprint.size).toBe(20);
    expect(persisted.byNameAndType.size).toBe(20);
    expect(persisted.lastSeen.size).toBe(20);
    // Every new sid matches the project-state Sid pattern.
    for (const { sid } of result.new) {
      expect(sid).toMatch(/^trk_[0-9a-f]{16}$/);
    }
  });

  it("Test 2: reconcile(state, persisted) with unchanged state → 20 matched, 0 new", () => {
    const state = buildTrackState(NAMES_20);
    const persisted = emptyStableIdMap();
    reconcile(state, persisted, 1000); // populate

    const result = reconcile(state, persisted, 2000);
    expect(result.matched).toHaveLength(20);
    expect(result.new).toHaveLength(0);
    expect(result.reassigned).toHaveLength(0);
    expect(result.vanished).toHaveLength(0);
  });

  it("Test 3 (SC#3 CRITICAL — REORDER): reversing track order keeps >=18/20 sids alive", () => {
    const state = buildTrackState(NAMES_20);
    const persisted = emptyStableIdMap();
    const first = reconcile(state, persisted, 1000);
    const originalSids = new Set(first.new.map((e) => e.sid));
    expect(originalSids.size).toBe(20);

    // Reverse the track order — every interior track's neighbor pair changes,
    // so every interior fingerprint changes. The name+type fuzzy fallback must
    // catch them. This is the held-out SC#3 bar.
    const reordered = buildTrackState([...NAMES_20].reverse());
    const result = reconcile(reordered, persisted, 2000);

    const survived = new Set<string>();
    for (const e of result.matched) survived.add(e.sid);
    for (const e of result.reassigned) survived.add(e.sid);
    for (const e of result.new) survived.delete(e.sid); // new sids don't count as survivors

    let survivorsFromOriginal = 0;
    for (const sid of survived) if (originalSids.has(sid)) survivorsFromOriginal++;
    // The held-out bar (02-03a-PLAN.md acceptance criterion).
    expect(survivorsFromOriginal).toBeGreaterThanOrEqual(18);
    // With distinct names + name+type fuzzy fallback, all 20 should survive.
    expect(result.new).toHaveLength(0);
  });

  it("Test 4 (RENAME + stable content): renaming 'Kick' → 'Kick Main' reassigns the same sid via content-hash match", () => {
    const state = buildTrackState(NAMES_20);
    const persisted = emptyStableIdMap();
    const first = reconcile(state, persisted, 1000);
    const kickSid = first.new.find((e) => e.obj.name === "Kick")!.sid;

    // Rename Kick → Kick Main. contentHash preserved (ch_Kick stays) — this is
    // the "stable content" case. The rename changes the name → fingerprint
    // changes; name+type `track:Kick Main` is new → the content-hash fallback
    // must catch it (byContentHash[ch_Kick] = {kickSid}, size 1 → reassign).
    //
    // Note: Bass (index 1) has Kick as a neighbor, so renaming Kick also
    // changes Bass's neighbors → Bass's fingerprint changes → Bass is
    // name+type-reassigned. That cascade is expected and correct (Bass's sid
    // survives via the name+type fuzzy path).
    const renamedNames = NAMES_20.map((n) => (n === "Kick" ? "Kick Main" : n));
    const renamed = buildTrackState(renamedNames, {
      contentHashOf: (name) => (name === "Kick Main" ? "ch_Kick" : `ch_${name}`),
    });
    const result = reconcile(renamed, persisted, 2000);

    // The Kick sid survives via content-hash reassignment.
    const reassignedKick = result.reassigned.find((e) => e.sid === kickSid);
    expect(reassignedKick).toBeDefined();
    expect(reassignedKick!.reason).toBe("content-hash");
    expect(reassignedKick!.obj.name).toBe("Kick Main");
    // No new sid was minted for the rename.
    const newForKick = result.new.find((e) => e.obj.name === "Kick Main");
    expect(newForKick).toBeUndefined();
    // Bass's sid also survives (via name+type — its neighbors changed because
    // Kick was renamed). The other 18 tracks matched by fingerprint.
    expect(result.new).toHaveLength(0);
    expect(result.matched.length + result.reassigned.length).toBe(20);
  });

  it("Test 5 (NEW track): adding a 21st track → all 20 originals survive + 1 new", () => {
    const state = buildTrackState(NAMES_20);
    const persisted = emptyStableIdMap();
    const first = reconcile(state, persisted, 1000);
    const originalSids = new Set(first.new.map((e) => e.sid));

    const withExtra = buildTrackState([...NAMES_20, "New Perc"]);
    const result = reconcile(withExtra, persisted, 2000);
    // Exactly one new sid minted (New Perc).
    expect(result.new).toHaveLength(1);
    expect(result.new[0].obj.name).toBe("New Perc");
    expect(result.new[0].sid).toMatch(/^trk_[0-9a-f]{16}$/);
    expect(result.vanished).toHaveLength(0);
    // All 20 original sids survive — matched or reassigned. Sub (was last, now
    // has New Perc as next-neighbor) gets name+type-reassigned; the rest match.
    const survived = new Set<string>();
    for (const e of result.matched) survived.add(e.sid);
    for (const e of result.reassigned) survived.add(e.sid);
    for (const sid of originalSids) expect(survived.has(sid)).toBe(true);
    expect(result.matched.length + result.reassigned.length).toBe(20);
  });

  it("Test 6 (VANISHED): removing 2 tracks → 2 vanished entries", () => {
    const state = buildTrackState(NAMES_20);
    const persisted = emptyStableIdMap();
    const first = reconcile(state, persisted, 1000);
    const removedSids = new Set(
      first.new.filter((e) => e.obj.name === "Kick" || e.obj.name === "Bass").map((e) => e.sid),
    );
    expect(removedSids.size).toBe(2);

    const trimmed = buildTrackState(NAMES_20.filter((n) => n !== "Kick" && n !== "Bass"));
    const result = reconcile(trimmed, persisted, 2000);
    // Exactly 2 vanished entries — the removed Kick + Bass sids.
    expect(result.vanished).toHaveLength(2);
    expect(result.new).toHaveLength(0);
    const vanishedSids = new Set(result.vanished.map((v) => v.sid));
    for (const sid of removedSids) expect(vanishedSids.has(sid)).toBe(true);
    // The 18 remaining tracks all survive — matched or reassigned. Lead (was
    // at index 2 with neighbors [Bass, Pad]; Bass removed → neighbors [Pad])
    // gets name+type-reassigned; the rest match.
    expect(result.matched.length + result.reassigned.length).toBe(18);
  });

  it("does not mutate the caller's observed state (purity over observed)", () => {
    const state = buildTrackState(NAMES_20);
    const snapshot = JSON.parse(JSON.stringify(state));
    const persisted = emptyStableIdMap();
    reconcile(state, persisted, 1000);
    // The observed RawState is unchanged — reconcile reads but does not write it.
    expect(state).toEqual(snapshot);
  });
});
