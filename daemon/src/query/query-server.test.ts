// daemon/src/query/query-server.test.ts
//
// D-07 daemon-local UDS query-server (RESEARCH.md Pattern 3; 02-PATTERNS.md
// Assignment 12 lines 420-438). Speaks the cli-query contract: validates
// inbound queries against cli-query/query.schema.json, dispatches on op, and
// emits results shaped per cli-query/result.schema.json. EVERY result carries
// stateFreshness (SC#3 surfacing) + assumptions[] on derived-field results
// (UX-06). Unknown ops return the not_implemented arm; malformed queries
// return invalid_query.
//
// The test injects a FAKE transport (captures sent messages) + a FAKE watchdog
// (returns live/stale/disconnected on demand) + a fixture RawState, so the
// op-dispatch + schema-validity are exercised without real socket I/O (uds.test
// covers the transport layer end-to-end).

import { describe, it, expect } from "vitest";
import { startQueryServer, safeSendErr, type QueryServerDeps } from "./query-server.js";
import { CandidateStore } from "../patch/candidate-store.js";
import { PatchHistory, type PatchHistoryEntry } from "../patch/patch-history.js";
import type { StaleWatchdog } from "../state/stale-watchdog.js";
import type { RawState } from "../state/reconcile.js";
import type { ProjectIntent } from "../gen/intent.js";
import type { Transport } from "../transport/transport.js";
import type { Note } from "../cli/diff-logic.js";
import type { Patch } from "../gen/patch.js";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

/** Fake transport: captures the registered handler + every sent message. */
interface CapturingTransport extends Transport {
  sent: object[];
  handler: (chunk: unknown) => void;
  onMessage(handler: (chunk: unknown) => void): void;
  send(msg: object): void;
  close(): void;
}

function makeCapturingTransport(): CapturingTransport {
  const t: CapturingTransport = {
    sent: [],
    handler: () => {},
    onMessage(handler) {
      t.handler = handler;
    },
    send(msg) {
      t.sent.push(msg);
    },
    close() {},
  };
  return t;
}

/** Fake watchdog: returns a controllable freshness on tick(). */
function makeFakeWatchdog(freshness: "live" | "stale" | "disconnected"): StaleWatchdog {
  return {
    tick() {
      return freshness;
    },
  } as unknown as StaleWatchdog;
}

function fixtureRaw(): RawState {
  return {
    version: "1.0",
    project: {
      name: "Demo Project",
      tempo: 130,
      timeSignature: "4/4",
      keySignature: "A minor",
      transport: { playing: true, positionBeats: 16.5 },
    },
    selection: {
      trackSid: "trk_0123456789abcdef",
      clipSid: "clip_0123456789abcdef",
      region: { start: 0, end: 16 },
    },
    clips: [{ clipSid: "clip_0123456789abcdef", notes: [] }],
    devices: [{ deviceSid: "dev_0123456789abcdef", name: "Serum" }],
  };
}

function fixtureIntent(): ProjectIntent {
  return {
    version: "1.0",
    projectIntent: { summary: "techno track, dark" },
  };
}

/** Drive one query through the server; return the (single) sent result. */
function drive(deps: QueryServerDeps, queryLine: string): Record<string, unknown> {
  const transport = deps.transport as CapturingTransport;
  transport.sent.length = 0;
  transport.handler(queryLine);
  expect(transport.sent).toHaveLength(1);
  return transport.sent[0] as Record<string, unknown>;
}

function makeDeps(opts: {
  freshness?: "live" | "stale" | "disconnected";
  state?: RawState | null;
  intent?: ProjectIntent | null;
}): { deps: QueryServerDeps; transport: CapturingTransport } {
  const transport = makeCapturingTransport();
  const deps: QueryServerDeps = {
    transport,
    watchdog: makeFakeWatchdog(opts.freshness ?? "live"),
    getState: () => opts.state === undefined ? fixtureRaw() : opts.state,
    getIntent: () => opts.intent === undefined ? fixtureIntent() : opts.intent,
  };
  startQueryServer(deps);
  return { deps, transport };
}

describe("query-server (D-07 cli-query op dispatch + SC#3 surfacing)", () => {
  it("focus.export -> ok:true, payload is the focus view, assumptions non-empty, stateFreshness from watchdog", () => {
    const { deps } = makeDeps({ freshness: "live" });
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "focus.export" }) + "\n");
    expect(res.ok).toBe(true);
    expect(res.stateFreshness).toBe("live");
    expect(res.type).toBe("result");
    expect(res.version).toBe("1.0");
    expect(res.payload).toBeDefined();
    expect((res.assumptions as unknown[]).length).toBeGreaterThan(0);
  });

  it("project.summary -> ok:true with project metadata", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "project.summary" }) + "\n");
    expect(res.ok).toBe(true);
    const payload = res.payload as { name: string; tempo: number };
    expect(payload.name).toBe("Demo Project");
    expect(payload.tempo).toBe(130);
  });

  it("project.region -> ok:true with the selection region", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "project.region" }) + "\n");
    expect(res.ok).toBe(true);
    const payload = res.payload as { start: number; end: number };
    expect(payload.start).toBe(0);
    expect(payload.end).toBe(16);
  });

  it("midi.inspect -> ok:true with clips", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.inspect" }) + "\n");
    expect(res.ok).toBe(true);
    const payload = res.payload as { clips: unknown[] };
    expect(payload.clips.length).toBe(1);
  });

  it("device.inspect -> ok:true with devices", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "device.inspect" }) + "\n");
    expect(res.ok).toBe(true);
    const payload = res.payload as { devices: unknown[] };
    expect(payload.devices.length).toBe(1);
  });

  it("unknown op -> ok:false, error:'not_implemented', availableFrom present", () => {
    const { deps } = makeDeps({});
    // 'unknown' is not in the op enum; the schema validator rejects it first as
    // invalid_query. To exercise the not_implemented arm, we send an op that
    // parses but has no handler — use 'diff' (in enum, client-side only in M1
    // so the daemon has no live handler body).
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "diff" }) + "\n");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("not_implemented");
    expect(res.availableFrom).toBeDefined();
    expect(res.stateFreshness).toBe("live");
  });

  it("malformed query (missing op) -> ok:false, error:'invalid_query'", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query" }) + "\n");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid_query");
    expect(res.stateFreshness).toBeDefined();
  });

  it("non-JSON line -> ok:false, error:'invalid_query'", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, "this is not json\n");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid_query");
  });

  it("watchdog returns 'stale' -> response stateFreshness:'stale' (SC#3 surfacing)", () => {
    const { deps } = makeDeps({ freshness: "stale" });
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "focus.export" }) + "\n");
    expect(res.stateFreshness).toBe("stale");
  });

  it("watchdog returns 'disconnected' -> response stateFreshness:'disconnected'", () => {
    const { deps } = makeDeps({ freshness: "disconnected" });
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "focus.export" }) + "\n");
    expect(res.stateFreshness).toBe("disconnected");
  });

  it("getState() returns null -> ok:true, no payload data, assumptions carry 'bridge not connected'", () => {
    const { deps } = makeDeps({ state: null, freshness: "disconnected" });
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "focus.export" }) + "\n");
    expect(res.ok).toBe(true);
    expect(res.stateFreshness).toBe("disconnected");
    // payload is omitted when the bridge is not connected (no state to serve).
    const assumptions = res.assumptions as Array<{ claim: string }>;
    expect(assumptions.some((a) => a.claim.toLowerCase().includes("bridge") || a.claim.toLowerCase().includes("not connected"))).toBe(true);
  });

  it("EVERY ok:true result carries a non-empty assumptions[] array (UX-06)", () => {
    const { deps } = makeDeps({});
    const ops = ["focus.export", "project.summary", "project.region", "midi.inspect", "device.inspect"];
    for (const op of ops) {
      const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op }) + "\n");
      expect(res.ok, op).toBe(true);
      expect((res.assumptions as unknown[]).length, op).toBeGreaterThan(0);
    }
  });

  it("EVERY result (ok:true and ok:false) carries stateFreshness (SC#3 required field)", () => {
    const { deps } = makeDeps({});
    const live = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "focus.export" }) + "\n");
    expect(live.stateFreshness).toBeDefined();
    const bad = drive(deps, JSON.stringify({ version: "1.0", type: "query" }) + "\n");
    expect(bad.stateFreshness).toBeDefined();
    const stub = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "diff" }) + "\n");
    expect(stub.stateFreshness).toBeDefined();
  });

  it("ok:false result does NOT carry a payload (result.schema.json allOf gate)", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query" }) + "\n");
    expect(res.ok).toBe(false);
    expect(res.payload).toBeUndefined();
  });

  it("ok:true result does NOT carry error or availableFrom (result.schema.json allOf gate)", () => {
    const { deps } = makeDeps({});
    const res = drive(deps, JSON.stringify({ version: "1.0", type: "query", op: "focus.export" }) + "\n");
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.availableFrom).toBeUndefined();
  });
});

// ============================================================================
// Phase 3 Plan 03-04 Task 2 — midi.vary / counterline / voice_leading_fix /
// humanize dispatch (D-05/D-07/D-12). These tests pin the BLOCKER-01 INV-10
// integration: handleMidiVary RE-VALIDATES risk via classifyRisk({belowBar:
// status==="refused"}) BEFORE candidateStore.mint, so a refused candidate is
// stored + journaled with risk:"high" AND belowBar:true (audit-trail integrity).
// The CLI contract (midi.test.ts) cannot introspect the candidate store; these
// dispatch tests can (Rule 2 — the INV-10 integration assertion is required
// critical functionality for the trust spine).
// ============================================================================

/** A clip fixture carrying a clear C-major motif as the selected clip's notes. */
function fixtureClipWithNotes(notes: Note[]): RawState {
  return {
    ...fixtureRaw(),
    clips: notes,
  };
}

function cMajorMotifNotes(): Note[] {
  return [
    { key: "n:60:0.0000", pitch: 60, start: 0.0, length: 0.5, velocity: 100 },
    { key: "n:64:0.5000", pitch: 64, start: 0.5, length: 0.5, velocity: 100 },
    { key: "n:67:1.0000", pitch: 67, start: 1.0, length: 0.5, velocity: 100 },
    { key: "n:72:1.5000", pitch: 72, start: 1.5, length: 0.5, velocity: 100 },
    { key: "n:67:2.0000", pitch: 67, start: 2.0, length: 0.5, velocity: 100 },
    { key: "n:64:2.5000", pitch: 64, start: 2.5, length: 0.5, velocity: 100 },
    { key: "n:60:3.0000", pitch: 60, start: 3.0, length: 0.5, velocity: 100 },
    { key: "n:62:3.5000", pitch: 62, start: 3.5, length: 0.5, velocity: 100 },
  ];
}

/** Build deps that wire a REAL CandidateStore so midi.* dispatch can mint + we can introspect. */
function makeMidiDeps(opts: {
  state?: RawState | null;
  intent?: ProjectIntent | null;
  candidateStore?: CandidateStore;
}): { deps: QueryServerDeps; transport: CapturingTransport; store: CandidateStore } {
  const transport = makeCapturingTransport();
  const store = opts.candidateStore ?? new CandidateStore();
  const deps: QueryServerDeps = {
    transport,
    watchdog: makeFakeWatchdog("live"),
    getState: () => opts.state === undefined ? fixtureClipWithNotes(cMajorMotifNotes()) : opts.state,
    getIntent: () => opts.intent === undefined ? fixtureIntent() : opts.intent,
    candidateStore: store,
  };
  startQueryServer(deps);
  return { deps, transport, store };
}

/** Drive an ASYNC op through the server (await microtask drain for fire-and-forget handlers). */
async function driveAsync(deps: QueryServerDeps, queryLine: string): Promise<Record<string, unknown>> {
  const transport = deps.transport as CapturingTransport;
  transport.sent.length = 0;
  transport.handler(queryLine);
  // midi.* handlers are async (they pull live clip notes); drain microtasks so
  // the async continuation's transport.send lands before we assert.
  await new Promise((r) => setImmediate(r));
  expect(transport.sent).toHaveLength(1);
  return transport.sent[0] as Record<string, unknown>;
}

describe("midi.vary dispatch (MIDI-02, BLOCKER-01 INV-10 integration)", () => {
  it("returns 3 candidates each with a minted patchId + risk + motifSimilarity", async () => {
    const { deps } = makeMidiDeps({});
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.vary" }) + "\n");
    expect(res.ok).toBe(true);
    const candidates = (res.payload as { candidates: Array<{ patchId: string; risk: string; motifSimilarity: number }> }).candidates;
    expect(candidates).toHaveLength(3);
    for (const c of candidates) {
      expect(c.patchId).toMatch(/^pt_/);
      expect(["low", "medium", "high"]).toContain(c.risk);
      expect(Number.isFinite(c.motifSimilarity)).toBe(true);
    }
  });

  it("INV-10 integration: a refused candidate is STORED with risk:'high' AND belowBar:true (D-09 audit-trail floor)", async () => {
    // Force a refused candidate by feeding an EMPTY clip (no motif → below bar).
    const { deps, store } = makeMidiDeps({ state: fixtureClipWithNotes([]) });
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.vary" }) + "\n");
    expect(res.ok).toBe(true);
    const candidates = res.payload as { candidates: Array<{ patchId: string; risk: string; status?: string; motifSimilarity: number }> };
    // At least one refused candidate is returned + stored.
    const refused = candidates.candidates.find((c) => c.status === "refused");
    expect(refused).toBeDefined();
    expect(refused!.risk).toBe("high"); // the daemon re-validated via classifyRisk({belowBar:true})
    // The STORED patch (candidate store) carries belowBar:true + risk:high — the
    // audit-trail floor. patch-history.jsonl can NEVER record this as medium.
    const stored = store.get(refused!.patchId);
    expect(stored).toBeDefined();
    expect(stored!.risk).toBe("high");
    expect(stored!.belowBar).toBe(true);
  });

  it("an accepted candidate is stored with belowBar absent/false (the default path)", async () => {
    const { deps, store } = makeMidiDeps({});
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.vary" }) + "\n");
    const candidates = res.payload as { candidates: Array<{ patchId: string; status?: string }> };
    const accepted = candidates.candidates.find((c) => c.status === undefined);
    expect(accepted).toBeDefined();
    const stored = store.get(accepted!.patchId);
    expect(stored).toBeDefined();
    expect(stored!.belowBar ?? false).toBe(false);
  });

  it("D-12 inferred-harmony disclosure: blank intent.harmonicCenter -> assumptions[] carries 'harmonicCenter: inferred'", async () => {
    // intent with NO harmonicCenter → the daemon infers + discloses (Pitfall 6).
    const intent: ProjectIntent = { version: "1.0", projectIntent: { summary: "techno" } };
    const { deps } = makeMidiDeps({ intent });
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.vary" }) + "\n");
    const claims = (res.assumptions as Array<{ claim: string }>).map((a) => a.claim);
    expect(claims.some((c) => c.includes("harmonicCenter: inferred") || c.includes("harmonicCenter: could not infer"))).toBe(true);
  });

  it("D-12 authored harmonic: intent.harmonicCenter present -> no inference assumption", async () => {
    const intent: ProjectIntent = {
      version: "1.0",
      projectIntent: { summary: "techno", harmonicCenter: { key: "A", mode: "minor" } },
    };
    const { deps } = makeMidiDeps({ intent });
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.vary" }) + "\n");
    const claims = (res.assumptions as Array<{ claim: string }>).map((a) => a.claim);
    expect(claims.some((c) => c.includes("harmonicCenter: inferred"))).toBe(false);
  });
});

describe("midi.counterline / voice_leading_fix / humanize dispatch (MIDI-03/04/05)", () => {
  it("midi.counterline -> one candidate patchId (creative tier)", async () => {
    const intent: ProjectIntent = {
      version: "1.0",
      projectIntent: { summary: "x", harmonicCenter: { key: "C", mode: "major" } },
    };
    const { deps, store } = makeMidiDeps({ intent });
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.counterline" }) + "\n");
    expect(res.ok).toBe(true);
    const payload = res.payload as { patchId: string; risk: string };
    expect(payload.patchId).toMatch(/^pt_/);
    // The candidate is minted into the store (the producer applies via bw-edit).
    expect(store.get(payload.patchId)).toBeDefined();
  });

  it("midi.voice_leading_fix -> one low-risk candidate (cleanup tier)", async () => {
    const { deps } = makeMidiDeps({});
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.voice_leading_fix" }) + "\n");
    expect(res.ok).toBe(true);
    const payload = res.payload as { patchId: string; risk: string };
    expect(payload.patchId).toMatch(/^pt_/);
    expect(payload.risk).toBe("low");
  });

  it("midi.humanize -> one low-risk candidate (cleanup tier)", async () => {
    const { deps } = makeMidiDeps({});
    const res = await driveAsync(deps, JSON.stringify({ version: "1.0", type: "query", op: "midi.humanize" }) + "\n");
    expect(res.ok).toBe(true);
    const payload = res.payload as { patchId: string; risk: string };
    expect(payload.patchId).toMatch(/^pt_/);
    expect(payload.risk).toBe("low");
  });
});

// ============================================================================
// Phase 03.1 Plan 03 Task 1 — D-04/05/06 plumbing tests (RED).
//   safeSendErr(details?) extension (D-06, Pitfall 8 — single function),
//   candidateStore.mint stamps previewClipSid (D-04),
//   patch-history PatchHistoryEntry carries additive clipSid? (D-05).
// ============================================================================

describe("safeSendErr details extension (D-06, Pitfall 8)", () => {
  it("safeSendErrWithDetails: details arg appends expectedClipSid/actualClipSid/hint INSTEAD OF availableFrom", () => {
    const transport = makeCapturingTransport();
    safeSendErr(transport, "live", "wrong_clip_targeted", {
      expectedClipSid: "clip_aaa1111122223333",
      actualClipSid: "clip_bbb2222233334444",
      hint: "re-select the clip you previewed (or re-preview)",
    });
    expect(transport.sent).toHaveLength(1);
    const sent = transport.sent[0] as Record<string, unknown>;
    expect(sent.ok).toBe(false);
    expect(sent.error).toBe("wrong_clip_targeted");
    expect(sent.stateFreshness).toBe("live");
    expect(sent.expectedClipSid).toBe("clip_aaa1111122223333");
    expect(sent.actualClipSid).toBe("clip_bbb2222233334444");
    expect(sent.hint).toBe("re-select the clip you previewed (or re-preview)");
    // When details is provided, availableFrom:"M2" MUST NOT appear (Pitfall 8 —
    // the details REPLACE the availableFrom field, not append to it).
    expect(sent.availableFrom).toBeUndefined();
  });

  it("safeSendErrBackwardCompat: no details arg still sends availableFrom:'M2' (existing callers unchanged)", () => {
    const transport = makeCapturingTransport();
    safeSendErr(transport, "live", "candidate_not_found");
    expect(transport.sent).toHaveLength(1);
    const sent = transport.sent[0] as Record<string, unknown>;
    expect(sent.ok).toBe(false);
    expect(sent.error).toBe("candidate_not_found");
    expect(sent.availableFrom).toBe("M2");
    // No detail fields spill when details is absent.
    expect(sent.expectedClipSid).toBeUndefined();
    expect(sent.actualClipSid).toBeUndefined();
    expect(sent.hint).toBeUndefined();
  });

  it("safeSendErr: stale freshness rides through; details still spread", () => {
    const transport = makeCapturingTransport();
    safeSendErr(transport, "stale", "wrong_clip_targeted", {
      expectedClipSid: "clip_ccc3333344445555",
      actualClipSid: "clip_ddd4444455556666",
      hint: "re-select",
    });
    const sent = transport.sent[0] as Record<string, unknown>;
    expect(sent.stateFreshness).toBe("stale");
    expect(sent.expectedClipSid).toBe("clip_ccc3333344445555");
  });
});

describe("candidateStore.mint stamps previewClipSid (D-04)", () => {
  it("candidateStoreMintStampsPreviewClipSid: the second mint arg appears on the stored Patch", () => {
    const store = new CandidateStore();
    const minted = store.mint(
      {
        scope: { clipSid: "clip_aaa1111122223333" },
        operations: [{ op: "add_note", note: { key: "n:60:0", pitch: 60, start: 0, length: 0.5, velocity: 100 } }],
        rationale: "test",
        reversibility: "self-inverse",
        risk: "low",
      },
      "clip_preview_aaa1111122223333",
    );
    expect(minted.patchId).toMatch(/^pt_/);
    // previewClipSid stamped at mint time — D-04 plumbing.
    expect((minted as Patch & { previewClipSid?: string }).previewClipSid).toBe("clip_preview_aaa1111122223333");
    // The store round-trips the field (LRU refresh preserves it).
    const got = store.get(minted.patchId);
    expect(got).toBeDefined();
    expect((got as Patch & { previewClipSid?: string }).previewClipSid).toBe("clip_preview_aaa1111122223333");
  });
});

describe("patch-history PatchHistoryEntry carries additive clipSid (D-05)", () => {
  it("patchHistoryEntryCarriesClipSid: entry with clipSid round-trips through append + find", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bw-brain-ph-"));
    const journalPath = path.join(dir, "patch-history.jsonl");
    try {
      const hist = new PatchHistory(journalPath);
      const entry: PatchHistoryEntry = {
        patchId: "pt_test_clipSid_roundtrip",
        scope: { clipSid: "clip_aaa1111122223333" },
        operations: [{ op: "add_note", note: { key: "n:60:0", pitch: 60, start: 0, length: 0.5, velocity: 100 } }],
        rationale: "test",
        reversibility: "self-inverse",
        risk: "low",
        inverseOperations: [{ op: "remove_note", note: { key: "n:60:0", pitch: 60, start: 0, length: 0.5, velocity: 100 } }],
        appliedAt: Date.now(),
        stateHashBefore: "clip:test",
        // D-05: additive field, stamped at apply time.
        clipSid: "clip_aaa1111122223333",
      };
      await hist.append(entry);
      const found = await hist.find("pt_test_clipSid_roundtrip");
      expect(found).not.toBeNull();
      expect(found!.clipSid).toBe("clip_aaa1111122223333");
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("patchHistoryEntryWithoutClipSid: pre-fix entry (no clipSid) round-trips with clipSid undefined", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bw-brain-ph-"));
    const journalPath = path.join(dir, "patch-history.jsonl");
    try {
      const hist = new PatchHistory(journalPath);
      const entry: PatchHistoryEntry = {
        patchId: "pt_test_prefix_no_clipsid",
        scope: { clipSid: "" },
        operations: [{ op: "add_note", note: { key: "n:60:0", pitch: 60, start: 0, length: 0.5, velocity: 100 } }],
        rationale: "pre-fix",
        reversibility: "self-inverse",
        risk: "low",
        inverseOperations: [{ op: "remove_note", note: { key: "n:60:0", pitch: 60, start: 0, length: 0.5, velocity: 100 } }],
        appliedAt: Date.now(),
        stateHashBefore: "clip:pre-fix",
        // clipSid intentionally absent (pre-fix journal entry).
      };
      await hist.append(entry);
      const found = await hist.find("pt_test_prefix_no_clipsid");
      expect(found).not.toBeNull();
      expect(found!.clipSid).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
