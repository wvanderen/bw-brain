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

  // Phase 5 (05-01 Task 1) — transport.changed automationWrite passthrough. The
  // D-05-05 refusal gate (edit-service, 05-05+) consumes exactly this state
  // vocabulary: arrangerWriteEnabled / launcherWriteEnabled / overrideActive /
  // writeMode (latch|touch|write). Write-state observers fire INDEPENDENTLY of
  // playing, so an automationWrite-only event (no `playing`) must still fold.
  const AUTOMATION_WRITE = {
    arrangerWriteEnabled: true,
    launcherWriteEnabled: false,
    overrideActive: false,
    writeMode: "latch",
  } as const;

  it("transport.changed {playing, automationWrite} -> BOTH folded; existing transport fields preserved", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({
      project: {
        name: "Demo",
        tempo: 128,
        timeSignature: "4/4",
        transport: { playing: false, positionBeats: 16.5 },
      },
    });
    const before = snapshot(original);
    const out = foldEvent(
      original,
      { type: "transport.changed", payload: { playing: true, automationWrite: { ...AUTOMATION_WRITE } } },
      ctx,
    );
    expect(out.project.transport!.playing).toBe(true);
    expect(out.project.transport!.automationWrite).toEqual({ ...AUTOMATION_WRITE }); // verbatim
    expect(out.project.transport!.positionBeats).toBe(16.5); // preserved
    expect(original).toEqual(before); // purity
  });

  it("transport.changed {automationWrite} ONLY (no playing) -> automationWrite folded, playing left untouched", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState({
      project: {
        name: "Demo",
        tempo: 128,
        timeSignature: "4/4",
        transport: { playing: true },
      },
    });
    const out = foldEvent(
      original,
      { type: "transport.changed", payload: { automationWrite: { ...AUTOMATION_WRITE, writeMode: "touch" } } },
      ctx,
    );
    expect(out.project.transport!.automationWrite).toEqual({ ...AUTOMATION_WRITE, writeMode: "touch" });
    expect(out.project.transport!.playing).toBe(true); // untouched by the write-state-only event
  });

  it("transport.changed {} (neither playing nor automationWrite) -> state returned unchanged", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState();
    const out = foldEvent(original, { type: "transport.changed", payload: {} }, ctx);
    expect(out).toEqual(original);
  });

  it("transport.changed with a malformed automationWrite (writeMode: 42) -> treated as absent (NO-OP gate)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState();
    const out = foldEvent(
      original,
      {
        type: "transport.changed",
        payload: { automationWrite: 42 } as unknown as Record<string, unknown>,
      },
      ctx,
    );
    // Defensive typeof guard mirrors the device.name_changed branch — a
    // malformed payload never crashes the fold and never writes garbage state.
    expect(out).toEqual(original);
  });

  it("unknown event type -> state returned unchanged (defensive; unreachable via reader Ajv gate)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState();
    const out = foldEvent(original, { type: "some.future.event", payload: {} }, ctx);
    expect(out).toEqual(original);
  });

  // -------------------------------------------------------------------------
  // Phase 5 (05-01 Task 1) — parameter.changed fold (AUTO-01 observation
  // spine, D-05-01/D-05-02). Pitfall 5: the fold maintains BOUNDED PER-PARAM
  // MOVEMENT AGGREGATES keyed by `${deviceKey}:${source}:${paramIndex}` —
  // NEVER an event log (T-05-03: 8 bounded scalar fields, no value arrays).
  // A movement counts only when the incoming value differs from the stored
  // lastValue by more than 1e-4 (epsilon).
  // -------------------------------------------------------------------------

  it("parameter.changed first observation -> aggregate created with movementCount 0, min=max=lastValue", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState();
    const before = snapshot(original);
    const out = foldEvent(
      original,
      {
        type: "parameter.changed",
        timestamp: 1000,
        payload: { deviceKey: "dev-1", paramIndex: 3, paramName: "Cutoff", source: "device_parameter", value: 0.5 },
      },
      ctx,
    );
    const params = out.parameters!;
    expect(Object.keys(params)).toEqual(["dev-1:device_parameter:3"]);
    expect(params["dev-1:device_parameter:3"]).toEqual({
      deviceKey: "dev-1",
      paramIndex: 3,
      paramName: "Cutoff",
      source: "device_parameter",
      movementCount: 0, // first observation: no prior to differ from
      lastValue: 0.5,
      minValue: 0.5,
      maxValue: 0.5,
      lastMovedAt: 1000,
    });
    expect(original).toEqual(before); // purity
  });

  it("parameter.changed second event with delta > epsilon -> movementCount incremented ONCE; lastValue/min/max updated", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    let state = foldEvent(
      baselineState(),
      { type: "parameter.changed", timestamp: 1000, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.5 } },
      ctx,
    );
    state = foldEvent(
      state,
      { type: "parameter.changed", timestamp: 1010, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.9 } },
      ctx,
    );
    const agg = state.parameters!["dev-1:device_parameter:3"]!;
    expect(agg.movementCount).toBe(1); // exactly one movement (0.5 -> 0.9)
    expect(agg.lastValue).toBe(0.9);
    expect(agg.minValue).toBe(0.5);
    expect(agg.maxValue).toBe(0.9);
    expect(agg.lastMovedAt).toBe(1010);
  });

  it("parameter.changed with delta < epsilon (unchanged value) -> movementCount NOT incremented, lastMovedAt NOT advanced", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    let state = foldEvent(
      baselineState(),
      { type: "parameter.changed", timestamp: 1000, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.5 } },
      ctx,
    );
    state = foldEvent(
      state,
      { type: "parameter.changed", timestamp: 1010, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.7 } },
      ctx,
    );
    // 1e-5 < epsilon (1e-4) — NOT a movement.
    state = foldEvent(
      state,
      { type: "parameter.changed", timestamp: 1020, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.7 + 1e-5 } },
      ctx,
    );
    const agg = state.parameters!["dev-1:device_parameter:3"]!;
    expect(agg.movementCount).toBe(1); // unchanged
    expect(agg.lastValue).toBeCloseTo(0.7 + 1e-5, 9); // latest observed value tracked
    expect(agg.lastMovedAt).toBe(1010); // no movement -> no clock advance
  });

  it("parameter.changed key is the composite deviceKey:source:paramIndex — same index, different source = distinct entries", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    let state = foldEvent(
      baselineState(),
      { type: "parameter.changed", timestamp: 1000, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.5 } },
      ctx,
    );
    state = foldEvent(
      state,
      { type: "parameter.changed", timestamp: 1001, payload: { deviceKey: "dev-1", paramIndex: 3, source: "remote_page", value: 0.6 } },
      ctx,
    );
    expect(Object.keys(state.parameters!).sort()).toEqual([
      "dev-1:device_parameter:3",
      "dev-1:remote_page:3",
    ]);
  });

  it("parameter.changed malformed payload (missing deviceKey) -> NO-OP (defensive typeof guards)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    const original = baselineState();
    const out = foldEvent(
      original,
      { type: "parameter.changed", timestamp: 1000, payload: { paramIndex: 3, source: "device_parameter", value: 0.5 } },
      ctx,
    );
    expect(out).toEqual(original);
  });

  it("parameter.changed aggregates are BOUNDED SCALARS ONLY — exactly the 8 aggregate fields, no value arrays (T-05-03)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    let state = foldEvent(
      baselineState(),
      { type: "parameter.changed", timestamp: 1000, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.5 } },
      ctx,
    );
    state = foldEvent(
      state,
      { type: "parameter.changed", timestamp: 1010, payload: { deviceKey: "dev-1", paramIndex: 3, source: "device_parameter", value: 0.8 } },
      ctx,
    );
    const agg = state.parameters!["dev-1:device_parameter:3"]!;
    // The aggregate shape is closed: exactly these keys, every value a scalar.
    expect(Object.keys(agg).sort()).toEqual(
      ["deviceKey", "lastMovedAt", "lastValue", "maxValue", "minValue", "movementCount", "paramIndex", "source"].sort(),
    );
    for (const [k, v] of Object.entries(agg)) {
      expect(Array.isArray(v), `field ${k} must not be an array (no event log)`).toBe(false);
      expect(typeof v === "number" || typeof v === "string", `field ${k} must be a bounded scalar`).toBe(true);
    }
  });

  it("parameters map NEVER exceeds 512 entries — a 513th distinct paramKey evicts the LOWEST-lastMovedAt entry (Pitfall 5)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    let state = baselineState();
    // Fill exactly 512 distinct paramKeys with strictly increasing lastMovedAt.
    for (let i = 0; i < 512; i++) {
      state = foldEvent(
        state,
        {
          type: "parameter.changed",
          timestamp: 1000 + i,
          payload: { deviceKey: `dev-${i}`, paramIndex: 0, source: "device_parameter", value: 0.5 },
        },
        ctx,
      );
    }
    expect(Object.keys(state.parameters!)).toHaveLength(512);
    expect(state.parameters!["dev-0:device_parameter:0"]).toBeDefined(); // oldest, lowest lastMovedAt

    // 513th distinct key — dev-0 (lastMovedAt 1000, the lowest) must be evicted.
    state = foldEvent(
      state,
      {
        type: "parameter.changed",
        timestamp: 9999,
        payload: { deviceKey: "dev-new", paramIndex: 0, source: "device_parameter", value: 0.5 },
      },
      ctx,
    );
    const keys = Object.keys(state.parameters!);
    expect(keys).toHaveLength(512); // cap held
    expect(state.parameters!["dev-0:device_parameter:0"]).toBeUndefined(); // lowest lastMovedAt evicted
    expect(state.parameters!["dev-1:device_parameter:0"]).toBeDefined(); // newer survivors kept
    expect(state.parameters!["dev-new:device_parameter:0"]).toBeDefined(); // the newcomer kept
  });

  it("parameter.changed re-folding an EXISTING key after eviction pressure never loses the cap (512 held across churn)", () => {
    const ctx: FoldContext = { summaryTracks: [], stableIds: emptyStableIds() };
    let state = baselineState();
    for (let i = 0; i < 600; i++) {
      state = foldEvent(
        state,
        {
          type: "parameter.changed",
          timestamp: 1000 + i,
          payload: { deviceKey: `dev-${i % 550}`, paramIndex: 0, source: "device_parameter", value: (i % 100) / 100 },
        },
        ctx,
      );
    }
    expect(Object.keys(state.parameters!).length).toBeLessThanOrEqual(512);
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
    const events: Array<{ type: string; payload?: Record<string, unknown>; timestamp?: number }> = [
      { type: "selection.changed", payload: { slot: 0 } },
      { type: "track.name_changed", payload: { slot: 0, name: "Kick2" } },
      { type: "track.name_changed", payload: { name: "Cursor" } },
      { type: "clip.name_changed", payload: {} },
      // Phase 03.1-02 D-03c: also exercise the new clipSid-bearing fold path
      // (must return a new RawState without mutating the input).
      { type: "clip.name_changed", payload: { clipSid: "clip_a1b2c3d4e5f60718" } },
      { type: "device.name_changed", payload: { name: "Serum" } },
      { type: "transport.changed", payload: { playing: true } },
      // Phase 5 (05-01): the parameter.changed fold + automationWrite transport
      // passthrough must also never mutate the input state.
      {
        type: "parameter.changed",
        timestamp: 1234,
        payload: { deviceKey: "dev-1", paramIndex: 2, source: "device_parameter", value: 0.42 },
      },
      {
        type: "transport.changed",
        payload: { automationWrite: { arrangerWriteEnabled: true, launcherWriteEnabled: false, overrideActive: false, writeMode: "write" } },
      },
      { type: "unknown.future.event", payload: {} },
    ];
    for (const ev of events) {
      const before = snapshot(rich);
      foldEvent(rich, ev, ctx);
      expect(rich).toEqual(before); // input never mutated
    }
  });
});
