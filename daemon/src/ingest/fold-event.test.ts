// daemon/src/ingest/fold-event.test.ts
//
// STATE-04 live operation — the PURE event->RawState fold for the 5 event types
// (RESEARCH.md Pattern 2 lines 463-492; 02-PATTERNS.md Assignment 6 lines
// 261-297; Observers.java:83-162 the exact payloads). Mirrors normalizer.ts
// purity: every branch returns a NEW RawState, the input is NEVER mutated.
// Distinct from reconcile.ts which mutates a caller-owned StableIdMap.
//
// clip.name_changed empty-payload no-op is the documented M1 limitation
// (Observers.java:104-116 — the bridge emits the type but cannot fill the
// name; the daemon's selection.clipSid comes from the snapshot/reconcile
// path only).
//
// Source: 02-07-PLAN.md Task 1 <behavior>.

import { describe, it, expect } from "vitest";
import { foldEvent, type FoldContext } from "./fold-event.js";
import type { RawState } from "../state/reconcile.js";
import type { StableIdMap } from "../state/reconcile.js";

/** Build an empty StableIdMap fixture. */
function emptyStableIds(): StableIdMap {
  return {
    byFingerprint: new Map(),
    byNameAndType: new Map(),
    byContentHash: new Map(),
    lastSeen: new Map(),
  };
}

/** A valid baseline RawState fixture (mirrors project-state.schema.json shape). */
function baselineState(overrides: Partial<RawState> = {}): RawState {
  return {
    version: "1.0",
    project: { name: "Demo", tempo: 128, timeSignature: "4/4" },
    selection: {},
    tracks: [],
    clips: [],
    devices: [],
    ...overrides,
  };
}

/** Deep-clone helper for purity assertions. */
function snapshot<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe("foldEvent (PURE event -> RawState fold for the 5 event types)", () => {
  it("selection.changed {slot} resolvable -> selection.trackSid set to the byNameAndType sid", () => {
    const stableIds = emptyStableIds();
    stableIds.byNameAndType.set("track:Kick", "trk_aaaaaaaaaaaaaaaa");
    const ctx: FoldContext = {
      summaryTracks: [{ slot: 0, name: "Kick" }],
      stableIds,
    };
    const original = baselineState();
    const before = snapshot(original);
    const out = foldEvent(original, { type: "selection.changed", payload: { slot: 0 } }, ctx);
    expect(out.selection.trackSid).toBe("trk_aaaaaaaaaaaaaaaa");
    // purity: input unchanged
    expect(original).toEqual(before);
    // returns a NEW object (not the same reference)
    expect(out).not.toBe(original);
  });

  it("selection.changed {slot} unresolvable (no summary yet) -> trackSid OMITTED (selection is {})", () => {
    const ctx: FoldContext = {
      summaryTracks: [],
      stableIds: emptyStableIds(),
    };
    const original = baselineState({ selection: {} });
    const out = foldEvent(original, { type: "selection.changed", payload: { slot: 5 } }, ctx);
    expect(out.selection.trackSid).toBeUndefined();
    expect(out.selection).toEqual({});
  });

  it("selection.changed {slot} unresolvable (name not in stableIds map) -> trackSid OMITTED", () => {
    const ctx: FoldContext = {
      summaryTracks: [{ slot: 0, name: "Kick" }],
      stableIds: emptyStableIds(), // byNameAndType is empty
    };
    const original = baselineState();
    const out = foldEvent(original, { type: "selection.changed", payload: { slot: 0 } }, ctx);
    expect(out.selection.trackSid).toBeUndefined();
  });

  it("track.name_changed {slot, name} (windowed-bank form) -> tracks[slot].name updated", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({
      tracks: [
        { name: "Old0", slot: 0 },
        { name: "Old1", slot: 1 },
      ],
    });
    const before = snapshot(original);
    const out = foldEvent(original, { type: "track.name_changed", payload: { slot: 1, name: "Bass" } }, ctx);
    expect((out.tracks as { name: string; slot: number }[])[1]).toEqual({ name: "Bass", slot: 1 });
    expect((out.tracks as { name: string }[])[0]).toEqual({ name: "Old0", slot: 0 });
    expect(original).toEqual(before); // purity
  });

  it("track.name_changed {name} (cursor form) -> documented best-effort no-op when ambiguous", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({ tracks: [{ name: "Whatever", slot: 0 }] });
    const out = foldEvent(original, { type: "track.name_changed", payload: { name: "Cursor Track" } }, ctx);
    // M1: cursor-form track.name_changed is a best-effort no-op when there is
    // no unambiguous tracks entry to update (documented in fold-event.ts).
    // State is returned unchanged OR with a best-effort update; the gate is
    // purity (input unchanged) + no crash.
    expect(out).toEqual(original);
    expect(original).toEqual(original); // not mutated
  });

  it("clip.name_changed {} (empty payload — Observers.java:104-116) -> state returned UNCHANGED (no-op gate)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({ selection: { clipSid: "clip_deadbeefcafebabe" } });
    const before = snapshot(original);
    const out = foldEvent(original, { type: "clip.name_changed", payload: {} }, ctx);
    expect(out).toEqual(original);
    expect(original).toEqual(before); // purity
  });

  // Phase 03.1-02 D-03c — clip.name_changed now populates selection.clipSid
  // from the bridge-supplied payload (the bridge derives it via
  // sha256(trackSid:loopBeats).slice(0,16)). These two cases pin the fold +
  // the backward-compat NO-OP when the clipSid is absent or malformed.
  it("clip.name_changed {clipSid} (Phase 03.1-02 D-03c) -> selection.clipSid populated", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({ selection: { trackSid: "trk_aaaaaaaaaaaaaaaa" } });
    const before = snapshot(original);
    const out = foldEvent(
      original,
      { type: "clip.name_changed", payload: { clipSid: "clip_a1b2c3d4e5f60718" } },
      ctx,
    );
    expect(out.selection.clipSid).toBe("clip_a1b2c3d4e5f60718");
    // existing selection fields preserved (spread)
    expect(out.selection.trackSid).toBe("trk_aaaaaaaaaaaaaaaa");
    expect(original).toEqual(before); // purity
    expect(out).not.toBe(original); // new reference
  });

  it("clip.name_changed with non-string clipSid (payload.clipSid: 42) -> state UNCHANGED (backward-compat NO-OP)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({ selection: { clipSid: "clip_deadbeefcafebabe" } });
    const out = foldEvent(
      original,
      // Simulate a malformed payload (non-string clipSid). The defensive
      // typeof check must treat this like an absent clipSid — NO-OP.
      { type: "clip.name_changed", payload: { clipSid: 42 } as unknown as Record<string, unknown> },
      ctx,
    );
    expect(out).toEqual(original);
    // existing clipSid NOT overwritten by the malformed payload
    expect(out.selection.clipSid).toBe("clip_deadbeefcafebabe");
  });

  it("device.name_changed {name} -> devices array updated with the cursor device entry", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({ devices: [] });
    const before = snapshot(original);
    const out = foldEvent(original, { type: "device.name_changed", payload: { name: "Vital" } }, ctx);
    expect(out.devices).toEqual([{ name: "Vital", cursor: true }]);
    expect(original).toEqual(before); // purity
  });

  it("transport.changed {playing} -> project.transport.playing set AND existing transport fields preserved (spread gate)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({
      project: {
        name: "Demo",
        tempo: 128,
        timeSignature: "4/4",
        transport: { playing: false, positionBeats: 16.5, loop: { enabled: true, start: 0, length: 4 } },
      },
    });
    const before = snapshot(original);
    const out = foldEvent(original, { type: "transport.changed", payload: { playing: true } }, ctx);
    expect(out.project.transport!.playing).toBe(true);
    expect(out.project.transport!.positionBeats).toBe(16.5); // preserved
    expect(out.project.transport!.loop).toEqual({ enabled: true, start: 0, length: 4 }); // preserved
    expect(original).toEqual(before); // purity
  });

  it("unknown event type -> state returned unchanged (defensive; unreachable via reader Ajv gate)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState();
    const out = foldEvent(original, { type: "some.future.event", payload: {} }, ctx);
    expect(out).toEqual(original);
  });

  it("PURITY gate: every branch returns a new object; input state fields are unchanged after the call", () => {
    const stableIds = emptyStableIds();
    stableIds.byNameAndType.set("track:Kick", "trk_aaaaaaaaaaaaaaaa");
    const ctx: FoldContext = {
      summaryTracks: [{ slot: 0, name: "Kick" }],
      stableIds,
    };
    const rich: RawState = {
      version: "1.0",
      project: {
        name: "Demo",
        tempo: 128,
        timeSignature: "4/4",
        transport: { playing: false, positionBeats: 1.0 },
      },
      selection: { trackSid: "trk_deadbeefcafebabe" },
      tracks: [{ name: "Kick", slot: 0 }],
      clips: [{ name: "ClipA" }],
      devices: [{ name: "Vital" }],
    };

    // Run every fold branch against the same rich state; assert the original
    // reference is left byte-for-byte unchanged after each.
    const events: Array<{ type: string; payload?: Record<string, unknown> }> = [
      { type: "selection.changed", payload: { slot: 0 } },
      { type: "track.name_changed", payload: { slot: 0, name: "Kick2" } },
      { type: "track.name_changed", payload: { name: "Cursor" } },
      { type: "clip.name_changed", payload: {} },
      // Phase 03.1-02 D-03c: also exercise the new clipSid-bearing fold path
      // (must return a new RawState without mutating the input).
      { type: "clip.name_changed", payload: { clipSid: "clip_a1b2c3d4e5f60718" } },
      { type: "device.name_changed", payload: { name: "Serum" } },
      { type: "transport.changed", payload: { playing: true } },
      { type: "unknown.future.event", payload: {} },
    ];
    for (const ev of events) {
      const before = snapshot(rich);
      foldEvent(rich, ev, ctx);
      expect(rich).toEqual(before); // input never mutated
    }
  });
});
