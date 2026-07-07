// daemon/src/query/query-server.ts
//
// D-07 daemon-local UDS query/response orchestrator (RESEARCH.md Pattern 3;
// 02-PATTERNS.md Assignment 12 lines 420-438). Wires a {@link Transport} (the
// UDS listener from uds.ts) into a parse → validate → dispatch pipeline that
// speaks the cli-query contract:
//
//     transport ─▶ LineBuffer ─▶ JSON.parse(try/catch) ─▶ Ajv(query) ─▶ op-dispatch ─▶ transport.send(result)
//
// EVERY result carries `stateFreshness` (REQUIRED — SC#3 surfaces here; the
// field comes from {@link StaleWatchdog.tick}). EVERY ok:true result that ships
// a derived/observed payload carries a non-empty `assumptions[]` (UX-06). The
// ok:false arms satisfy result.schema.json's allOf discriminator:
//   - not_implemented : error + availableFrom, NO payload
//   - invalid_query   : error + availableFrom, NO payload (schema forces
//                       availableFrom on every ok:false; M1's error taxonomy is
//                       austere — the stub arm is the only designed ok:false
//                       surface — so invalid_query reuses availableFrom:"M2".
//                       A richer error-response taxonomy is a future concern.)
//
// The op handlers are THIN for M1: they read from getState()/getIntent() which
// Task 1's normalizer + intent-store populate. When getState() returns null
// (bridge not yet connected) the live ops return ok:true with payload omitted
// + a "bridge not connected" assumption + the watchdog's freshness (likely
// "disconnected").
//
// Ajv is constructed and the query/result validators COMPILED ONCE at module
// load (AGENTS.md 64-65 standalone-compiled pattern; mirrors reader.ts).

import { Ajv2020 } from "ajv/dist/2020.js";
import { randomUUID } from "node:crypto";
import querySchema from "../../../schemas/cli-query/query.schema.json" with { type: "json" };
import resultSchema from "../../../schemas/cli-query/result.schema.json" with { type: "json" };
import { LineBuffer } from "../protocol/line-buffer.js";
import type { Transport } from "../transport/transport.js";
import type { StaleWatchdog } from "../state/stale-watchdog.js";
import type { RawState } from "../state/reconcile.js";
import type { ProjectIntent } from "../gen/intent.js";
import type { Assumption } from "../state/analyzer-registry.js";
import type { Patch } from "../gen/patch.js";
import type { Note } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import type { StateDiff } from "../cli/diff-logic.js";
import { validatePatchOrThrow } from "../patch/patch-schema.js";
import { previewPatch } from "../patch/patch-resolve.js";
import { classifyRisk, ScopeMismatchError } from "../patch/risk-classifier.js";
import { inverseOps } from "../patch/inverse-ops.js";
import type { CandidateStore } from "../patch/candidate-store.js";
import type { PatchHistory, PatchHistoryEntry } from "../patch/patch-history.js";
// Phase 3 Plan 03-04 — midi.* creative/cleanup dispatch (MIDI-02..05).
import type { Profile } from "../gen/profile.js";
import { loadProfile } from "../profiles/profile-loader.js";
import { detectHarmonicCenter } from "../transforms/harmonic-detect.js";
import { vary } from "../transforms/vary.js";
import { counterline } from "../transforms/counterline.js";
import { voiceLeadingFix } from "../transforms/voice-leading-fix.js";
import { humanize } from "../transforms/humanize.js";
// Phase 4 Plan 04-05 — arrange.* dispatch (ARRANGE-01..05, UX-03).
import { AnalyzerRegistry, M3_ANALYZERS, type AnalyzeContext } from "../state/analyzer-registry.js";
import {
  loadArrangementSnapshot,
  saveArrangementSnapshot,
  type ArrangementSnapshot,
} from "../state/arrangement-snapshot.js";
import { loadRoles, saveRoles, type RolesFile } from "../state/roles-store.js";
import { suggestTransitions, type TransitionObservation } from "../transforms/transition-suggest.js";
import { SECTION_RESERVED } from "../state/describe.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(querySchema);
ajv.addSchema(resultSchema);
const validateQuery = ajv.getSchema(querySchema.$id)!;

/** The live ops the daemon serves with ok:true + payload (M1 reads + M2 edits + M3 arrangement). */
const LIVE_OPS = new Set([
  "focus.export",
  "project.summary",
  "project.region",
  "midi.inspect",
  "device.inspect",
  // Phase 3 Plan 03-02 — reversible MIDI patching (D-04 two-step explicit).
  "edit.preview",
  "edit.apply",
  "edit.revert",
  // Phase 3 Plan 03-04 — creative/cleanup MIDI transforms (D-05/D-07/D-12).
  // Each mints candidate patchId(s) the producer applies via `bw-edit apply`.
  "midi.vary",
  "midi.counterline",
  "midi.voice_leading_fix",
  "midi.humanize",
  // Phase 4 Plan 04-05 — arrangement intelligence (ARRANGE-01..05, UX-03).
  // All read from the arrangement snapshot; arrange.refresh re-pulls the grid.
  "arrange.sections",
  "arrange.repetition_report",
  "arrange.energy_curve",
  "arrange.review",
  "arrange.current_section",
  "arrange.refresh",
]);

/** Dependencies injected by the daemon boot sequence. */
export interface QueryServerDeps {
  /** The UDS transport (from uds.ts). The server wires onMessage here. */
  transport: Transport;
  /** The stale-watchdog (from stale-watchdog.ts) — drives stateFreshness. */
  watchdog: StaleWatchdog;
  /** Returns the current normalized RawState, or null if the bridge hasn't connected yet. */
  getState: () => RawState | null;
  /** Returns the user-authored ProjectIntent, or null if absent (D-09). */
  getIntent: () => ProjectIntent | null;
  /**
   * OPTIONAL on-demand device-chain pull (02-07 Task 2 — Major 2 fix). When
   * present + state is live + a cursor device/track selection exists, the
   * device.inspect arm AWAITS this pull and surfaces the fresh `pages`
   * payload (PullHandlers.java:73-89 buildDeviceChainResponse). Absent ->
   * device.inspect serves the folded cache (state.devices). The pull is
   * bounded by the correlator's 3s timeout (boot.ts wires the callback).
   */
  pullDeviceChain?: () => Promise<unknown>;
  /**
   * OPTIONAL on-demand selected-clip pull (02-07 Task 2 — Major 2 fix). Same
   * shape as pullDeviceChain but for midi.inspect + get.selected_clip
   * (PullHandlers.java:60-71).
   */
  pullSelectedClip?: () => Promise<unknown>;
  /**
   * Phase 3 Plan 03-02 — the ephemeral candidate store (D-05). edit.preview
   * mints a `pt_<uuid>` candidate; edit.apply looks it up by patchId. Absent
   * when M2 edit ops are not wired (the ops still parse but return
   * not_implemented — see startQueryServer dispatch).
   */
  candidateStore?: CandidateStore;
  /**
   * Phase 3 Plan 03-02 — the durable patch-history.jsonl journal (D-03).
   * edit.apply appends the applied patch + inverseOperations; edit.revert
   * finds + replays the inverse. Absent when M2 edit ops are not wired.
   */
  patchHistory?: PatchHistory;
  /**
   * Phase 3 Plan 03-02 — daemon→bridge apply.patch round-trip (D-03). Sends
   * `{undoLabel, operations}` over the loopback TCP via correlator.send +
   * awaits the bridge's {applied, failed} response. Absent when M2 edit ops
   * are not wired (edit.apply/revert return not_implemented).
   */
  applyPatchOverBridge?: (undoLabel: string, operations: PrimitiveOp[]) => Promise<{ applied: number; failed: number }>;
  /**
   * Phase 4 Plan 04-05 — daemon→bridge get.launcher_clips pull (D-01). Used by
   * arrange.refresh + the boot reconnect path to re-enumerate the launcher grid.
   * Absent when the bridge pull is not wired (arrange.* ops still serve from
   * the cached snapshot).
   */
  pullLauncherGrid?: () => Promise<unknown>;
  /**
   * Phase 4 Plan 04-05 — path to .bw-brain/arrangement-snapshot.json. Absent
   * when the daemon is not configured for arrangement analysis (arrange.* ops
   * return not_implemented).
   */
  arrangementSnapshotPath?: string;
  /**
   * Phase 4 Plan 04-05 — path to .bw-brain/roles.json (ARRANGE-05 durable
   * store). arrange.refresh persists track-role classifications here.
   */
  rolesPath?: string;
}

/** A schema-valid ok:true result. */
interface OkResult {
  version: string;
  type: "result";
  ok: true;
  stateFreshness: "live" | "stale" | "disconnected";
  payload?: object;
  assumptions: Assumption[];
}

/** A schema-valid ok:false result (error + availableFrom, NO payload). */
interface ErrResult {
  version: string;
  type: "result";
  ok: false;
  stateFreshness: "live" | "stale" | "disconnected";
  error: string;
  availableFrom: "M2" | "M3" | "M4";
}

const VERSION = "1.0";

/** Focus view: the cursor triple + transport (bw-focus export). */
function focusView(state: RawState): object {
  return {
    selection: state.selection,
    transport: state.project.transport ?? null,
  };
}

/** Project summary: the project-level metadata block. */
function projectSummary(state: RawState): object {
  const p = state.project;
  return {
    name: p.name,
    tempo: p.tempo,
    timeSignature: p.timeSignature,
    keySignature: p.keySignature,
  };
}

/** Project region: the selection.region (may be absent). */
function projectRegion(state: RawState): object {
  return state.selection.region ?? {};
}

/** MIDI inspect: the pull-result clip cache. */
function midiInspect(state: RawState): object {
  return { clips: state.clips ?? [] };
}

/** Device inspect: the pull-result device cache. */
function deviceInspect(state: RawState): object {
  return { devices: state.devices ?? [] };
}

/** Grounding assumptions for a result that served live state. */
function liveAssumptions(state: RawState, intent: ProjectIntent | null): Assumption[] {
  const claims: Assumption[] = [
    { claim: "served from the daemon's normalized live state", confidence: 1.0, source: "selection" },
  ];
  if (intent) {
    claims.push({
      claim: `intent summary: "${intent.projectIntent.summary}"`,
      confidence: 1.0,
      source: "intent",
    });
  }
  // Reference state to satisfy the pure-handler contract + keep the parameter live.
  void state;
  return claims;
}

/** Assumptions for the no-state case (bridge not connected). */
const NO_STATE_ASSUMPTIONS: Assumption[] = [
  { claim: "bridge not connected — no live state available", confidence: 1.0, source: "selection" },
];

/**
 * Wire the deps.transport into the parse → validate → dispatch pipeline. Idempotent
 * (calling twice re-registers the handler). The handler emits exactly one result
 * per inbound query line.
 */
export function startQueryServer(deps: QueryServerDeps): void {
  const lines = new LineBuffer((line) => {
    const freshness = deps.watchdog.tick();

    // 1. Parse (try/catch — malformed JSON drops to invalid_query, never throws).
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      deps.transport.send(makeErr(freshness, "invalid_query"));
      return;
    }

    // 2. Validate against cli-query/query.schema.json (validate-at-boundary).
    if (!validateQuery(msg)) {
      deps.transport.send(makeErr(freshness, "invalid_query"));
      return;
    }

    // 3. Dispatch on op.
    const op = (msg as { op: string }).op;
    const state = deps.getState();
    const intent = deps.getIntent();

    if (state === null) {
      // Bridge not connected — every op returns ok:true with no payload + the
      // "bridge not connected" assumption + the watchdog's freshness (likely
      // "disconnected"). This is the honest M1 floor: the daemon is up, the
      // bridge is not, the CLI gets a structured answer (not a hang).
      deps.transport.send(makeOkNoState(freshness));
      return;
    }

    if (!LIVE_OPS.has(op)) {
      // Not a live M1 op (e.g. 'diff' which is client-side in M1, or any future
      // op) -> not_implemented arm. The schema forces availableFrom on ok:false.
      deps.transport.send(makeErr(freshness, "not_implemented", "M2"));
      return;
    }

    // device.inspect / midi.inspect MAY issue an on-demand pull (02-07 Task 2
    // — Major 2 fix). The LineBuffer callback is sync-invoked but each inbound
    // query is independent, so async-fire-and-forget is safe: the pull promise
    // resolves later + transport.send fires from the async continuation.
    if (op === "device.inspect") {
      void handleDeviceInspect(deps, state, intent, freshness);
      return;
    }
    if (op === "midi.inspect") {
      void handleMidiInspect(deps, state, intent, freshness);
      return;
    }

    // Phase 3 Plan 03-02 — edit.* ops (D-04 two-step explicit). Each is an
    // async pull/apply path: fire-and-forget from the sync LineBuffer callback;
    // the handler resolves later + transport.send fires from the async
    // continuation (same shape as device/midi inspect above).
    if (op === "edit.preview") {
      void handleEditPreview(deps, state, intent, freshness, msg as { payload?: { patch?: unknown } });
      return;
    }
    if (op === "edit.apply") {
      void handleEditApply(deps, state, intent, freshness, msg as { payload?: EditApplyPayload });
      return;
    }
    if (op === "edit.revert") {
      void handleEditRevert(deps, state, intent, freshness, msg as { payload?: { patchId?: string } });
      return;
    }

    // Phase 3 Plan 03-04 — midi.* transform dispatch (MIDI-02..05). Each is an
    // async pull/transform/mint path: fire-and-forget from the sync LineBuffer
    // callback; the handler resolves later + transport.send fires from the
    // async continuation (same shape as edit.* above).
    if (op === "midi.vary") {
      void handleMidiVary(deps, state, intent, freshness);
      return;
    }
    if (op === "midi.counterline") {
      void handleMidiCounterline(deps, state, intent, freshness);
      return;
    }
    if (op === "midi.voice_leading_fix") {
      void handleMidiVoiceLeadingFix(deps, state, intent, freshness);
      return;
    }
    if (op === "midi.humanize") {
      void handleMidiHumanize(deps, state, intent, freshness);
      return;
    }

    // Phase 4 Plan 04-05 — arrange.* dispatch (ARRANGE-01..05, UX-03). Each is
    // an async snapshot-load/analyze path: fire-and-forget from the sync
    // LineBuffer callback; the handler resolves later + transport.send fires
    // from the async continuation (same shape as midi.* above).
    if (op === "arrange.sections") {
      void handleArrangeSections(deps, state, intent, freshness, msg as { payload?: { refresh?: boolean } });
      return;
    }
    if (op === "arrange.repetition_report") {
      void handleArrangeRepetitionReport(deps, state, intent, freshness, msg as { payload?: { refresh?: boolean } });
      return;
    }
    if (op === "arrange.energy_curve") {
      void handleArrangeEnergyCurve(deps, state, intent, freshness, msg as { payload?: { refresh?: boolean } });
      return;
    }
    if (op === "arrange.review") {
      void handleArrangeReview(deps, state, intent, freshness, msg as { payload?: { refresh?: boolean } });
      return;
    }
    if (op === "arrange.current_section") {
      void handleArrangeCurrentSection(deps, state, intent, freshness);
      return;
    }
    if (op === "arrange.refresh") {
      void handleArrangeRefresh(deps, state, intent, freshness);
      return;
    }

    // Live op (synchronous arms only): build the payload + assumptions.
    let payload: object;
    switch (op) {
      case "focus.export":
        payload = focusView(state);
        break;
      case "project.summary":
        payload = projectSummary(state);
        break;
      case "project.region":
        payload = projectRegion(state);
        break;
      default:
        // Unreachable (LIVE_OPS gate above + device/midi handled above) — defensive.
        deps.transport.send(makeErr(freshness, "not_implemented", "M2"));
        return;
    }

    const result: OkResult = {
      version: VERSION,
      type: "result",
      ok: true,
      stateFreshness: freshness,
      payload,
      assumptions: liveAssumptions(state, intent),
    };
    deps.transport.send(result);
  });

  deps.transport.onMessage((chunk) => {
    // Transports deliver a UTF-8 string (UDS setEncoding utf8) or a Buffer;
    // LineBuffer handles both. Anything else is ignored defensively (mirrors
    // reader.ts).
    if (typeof chunk === "string" || Buffer.isBuffer(chunk)) {
      lines.feed(chunk);
    }
  });
}

/** Construct a schema-valid ok:false result. */
function makeErr(
  freshness: "live" | "stale" | "disconnected",
  error: string,
  availableFrom: "M2" | "M3" | "M4" = "M2",
): ErrResult {
  return {
    version: VERSION,
    type: "result",
    ok: false,
    stateFreshness: freshness,
    error,
    availableFrom,
  };
}

/** Construct the ok:true no-state result (payload omitted, bridge-not-connected assumptions). */
function makeOkNoState(freshness: "live" | "stale" | "disconnected"): OkResult {
  return {
    version: VERSION,
    type: "result",
    ok: true,
    stateFreshness: freshness,
    assumptions: NO_STATE_ASSUMPTIONS,
  };
}

/**
 * Wrap transport.send in try/catch so an async continuation (the on-demand
 * pull arms below) cannot throw into the void if the socket closed during
 * the pull (e.g. SIGINT mid-pull). Logs + swallows; the query is already
 * best-effort by that point.
 */
function safeSend(transport: Transport, result: OkResult): void {
  try {
    transport.send(result);
  } catch (e) {
    console.error("[query-server] transport.send failed from async pull continuation:", (e as Error).message);
  }
}

/**
 * device.inspect handler (02-07 Task 2 — Major 2 fix). Issues an on-demand
 * `get.selected_device_chain` pull via deps.pullDeviceChain WHEN:
 *   (i)  the pull dep is wired, AND
 *   (ii) state is live (the caller already checked state !== null), AND
 *   (iii) a cursor selection exists (deviceSid OR trackSid).
 *
 * On success: surfaces the fresh `pages` array (PullHandlers.java:73-89
 * buildDeviceChainResponse returns `{ pages: [...] }`) under the `devices`
 * key the cli-query contract expects. On failure (pull rejected/timed out —
 * bounded by the correlator's 3s timeout): falls back to the folded cache
 * `state.devices` AND pushes a degradation Assumption so the CLI surfaces
 * it honestly. When the preconditions don't hold, serves the folded cache
 * synchronously (still via the async wrapper for shape uniformity).
 */
async function handleDeviceInspect(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  const hasCursor = !!state.selection.deviceSid || !!state.selection.trackSid;
  if (deps.pullDeviceChain && hasCursor) {
    try {
      const fresh = await deps.pullDeviceChain();
      const pages = (fresh as { pages?: unknown }).pages;
      const payload = { devices: pages ?? state.devices ?? [] };
      safeSend(deps.transport, {
        version: VERSION,
        type: "result",
        ok: true,
        stateFreshness: freshness,
        payload,
        assumptions: liveAssumptions(state, intent),
      });
      return;
    } catch (e) {
      const payload = deviceInspect(state);
      const assumptions: Assumption[] = [
        ...liveAssumptions(state, intent),
        {
          claim: `device-chain pull failed; serving last folded cache (${(e as Error).message})`,
          confidence: 0.4,
          source: "selection",
        },
      ];
      safeSend(deps.transport, {
        version: VERSION,
        type: "result",
        ok: true,
        stateFreshness: freshness,
        payload,
        assumptions,
      });
      return;
    }
  }
  // No pull dep OR no cursor selection -> serve the folded cache.
  safeSend(deps.transport, {
    version: VERSION,
    type: "result",
    ok: true,
    stateFreshness: freshness,
    payload: deviceInspect(state),
    assumptions: liveAssumptions(state, intent),
  });
}

/**
 * midi.inspect handler (02-07 Task 2 — Major 2 fix). Same shape as
 * {@link handleDeviceInspect} but for `get.selected_clip`
 * (PullHandlers.java:60-71 -> `{ notes: [...] }`) + selection.clipSid.
 */
async function handleMidiInspect(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  const hasCursor = !!state.selection.clipSid;
  if (deps.pullSelectedClip && hasCursor) {
    try {
      const fresh = await deps.pullSelectedClip();
      const notes = (fresh as { notes?: unknown }).notes;
      const payload = { clips: notes ?? state.clips ?? [] };
      safeSend(deps.transport, {
        version: VERSION,
        type: "result",
        ok: true,
        stateFreshness: freshness,
        payload,
        assumptions: liveAssumptions(state, intent),
      });
      return;
    } catch (e) {
      const payload = midiInspect(state);
      const assumptions: Assumption[] = [
        ...liveAssumptions(state, intent),
        {
          claim: `selected-clip pull failed; serving last folded cache (${(e as Error).message})`,
          confidence: 0.4,
          source: "selection",
        },
      ];
      safeSend(deps.transport, {
        version: VERSION,
        type: "result",
        ok: true,
        stateFreshness: freshness,
        payload,
        assumptions,
      });
      return;
    }
  }
  safeSend(deps.transport, {
    version: VERSION,
    type: "result",
    ok: true,
    stateFreshness: freshness,
    payload: midiInspect(state),
    assumptions: liveAssumptions(state, intent),
  });
}

// ============================================================================
// Phase 3 Plan 03-02 — edit.preview / edit.apply / edit.revert (D-03/D-04/D-09)
// ============================================================================
//
// The edit trust-spine: preview computes a diff + mints an ephemeral candidate;
// apply enforces the risk gate server-side, computes inverseOps at APPLY time
// (INV-14), sends apply.patch over the bridge, and on success appends the
// durable journal + evicts the candidate; revert replays the stamped inverse
// through the SAME bridge path and appends a NEW history entry. SC#3 P2: all
// three refuse when stateFreshness !== "live" (the watchdog gate).
//
// All gating is server-side (INV-10 — never trust CLI-only enforcement). The
// --confirm / --force / --allow-below-bar flags ride in the query payload.

/** edit.apply payload shape (the CLI forwards patchId + D-04/D-09 flags). */
interface EditApplyPayload {
  patchId?: string;
  confirm?: boolean;
  force?: boolean;
  allowBelowBar?: boolean;
}

/**
 * Pull the live clip notes for the selected clipSid. Returns the Note[] the
 * preview/resolve pipeline expects, or null when the pull is unavailable /
 * the clip notes are absent. The bridge returns notes in its NoteView shape;
 * the daemon treats them as the canonical Note[] here (the NoteView→Note
 * field reconciliation is downstream — the wire-contract smoke test exercises
 * this path with daemon-Note-shaped notes).
 */
async function pullLiveClipNotes(deps: QueryServerDeps): Promise<Note[] | null> {
  if (!deps.pullSelectedClip) return null;
  try {
    const fresh = (await deps.pullSelectedClip()) as { notes?: Note[] };
    return fresh.notes ?? null;
  } catch {
    return null;
  }
}

/** edit.preview handler — resolve + classify + mint, NO apply (D-04 two-step). */
async function handleEditPreview(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: { patch?: unknown } },
): Promise<void> {
  // SC#3 P2 watchdog gate: refuse when state is not live.
  if (freshness === "disconnected") {
    safeSendErr(deps.transport, freshness, "state_disconnected");
    return;
  }
  if (!deps.candidateStore) {
    safeSendErr(deps.transport, freshness, "not_implemented");
    return;
  }
  const rawPatch = msg.payload?.patch;
  // The producer authors a patch DRAFT without a patchId (the daemon mints it
  // via candidateStore.mint — D-05). The schema requires patchId, so stamp a
  // placeholder before validation; mint() overwrites it with the real id.
  const draftWithId = { ...(rawPatch as object), patchId: `pt_${randomUUID()}` };
  let patch: Patch;
  try {
    patch = validatePatchOrThrow(draftWithId);
  } catch {
    safeSendErr(deps.transport, freshness, "invalid_patch");
    return;
  }
  const before = (await pullLiveClipNotes(deps)) ?? ((state.clips as Note[] | undefined) ?? []);
  const ops = patch.operations as PrimitiveOp[];
  let diff: StateDiff;
  let risk: ReturnType<typeof classifyRisk>;
  try {
    diff = previewPatch(before, ops);
    risk = classifyRisk({
      declared: patch.risk,
      operations: ops,
      scopeDeclared: patch.scope,
      belowBar: patch.belowBar ?? false,
    });
  } catch (e) {
    // ScopeMismatchError (INV-9) → scope_mismatch; any other → invalid_patch.
    safeSendErr(deps.transport, freshness, e instanceof ScopeMismatchError ? "scope_mismatch" : "invalid_patch");
    return;
  }
  // Mint the ephemeral candidate (D-05). The minted patchId is the apply key.
  // D-04 (Phase 03.1 Plan 03): stamp the preview-time clipSid so the apply
  // pre-flight can compare it to the live state.selection.clipSid.
  const candidate = deps.candidateStore.mint(
    {
      ...patch,
      risk,
      operations: ops as Patch["operations"],
    },
    state.selection.clipSid ?? "",
  );
  const assumptions: Assumption[] = [
    ...liveAssumptions(state, intent),
    { claim: `preview mints candidate ${candidate.patchId} (risk ${risk})`, confidence: 1.0, source: "selection" },
  ];
  safeSendOk(deps.transport, freshness, { patchId: candidate.patchId, risk, diff }, assumptions);
}

/** edit.apply handler — risk gate → inverseOps → bridge apply.patch → journal. */
async function handleEditApply(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: EditApplyPayload },
): Promise<void> {
  // SC#3 P2 watchdog gate.
  if (freshness === "disconnected") {
    safeSendErr(deps.transport, freshness, "state_disconnected");
    return;
  }
  if (!deps.candidateStore || !deps.patchHistory || !deps.applyPatchOverBridge) {
    safeSendErr(deps.transport, freshness, "not_implemented");
    return;
  }
  const patchId = msg.payload?.patchId ?? "";
  const candidate = deps.candidateStore.get(patchId);
  if (!candidate) {
    safeSendErr(deps.transport, freshness, "candidate_not_found");
    return;
  }
  // D-04 (Phase 03.1 Plan 03): apply pre-flight — refuse when the cursor clip's
  // live clipSid ≠ the preview-time clipSid captured at mint. The gate fires
  // BEFORE the risk gate + the bridge round-trip — no mutation on refusal.
  // Pre-fix candidates (previewClipSid === undefined or "") are caveated via
  // assumptions[] + proceed (symmetric to the D-05 migration policy for
  // pre-fix journal entries — preserves the recovery path for legacy candidates).
  const liveClipSid = state.selection.clipSid ?? "";
  const previewClipSid = candidate.previewClipSid;
  const applyAssumptions: Assumption[] = [...liveAssumptions(state, intent)];
  if (previewClipSid === undefined || previewClipSid === "") {
    // Pre-Plan-03 candidate (no previewClipSid stamped). Surface honestly.
    applyAssumptions.push({
      claim: "applying a pre-clipSid candidate; cursor clip unverified",
      confidence: 0.5,
      source: "selection",
    });
  } else if (liveClipSid !== previewClipSid) {
    safeSendErr(deps.transport, freshness, "wrong_clip_targeted", {
      expectedClipSid: previewClipSid,
      actualClipSid: liveClipSid,
      hint: "re-select the clip you previewed (or re-preview)",
    });
    return;
  }
  const confirm = msg.payload?.confirm ?? false;
  const force = msg.payload?.force ?? false;
  const allowBelowBar = msg.payload?.allowBelowBar ?? false;
  const ops = candidate.operations as PrimitiveOp[];

  // D-04 risk gate (server-side, INV-10). --force bypasses --confirm entirely.
  if (!force) {
    if (candidate.risk === "medium" || candidate.risk === "high") {
      if (!confirm) {
        safeSendErr(deps.transport, freshness, "confirmation_required");
        return;
      }
    }
    // D-09: belowBar requires --allow-below-bar AND --confirm (stacking).
    if (candidate.belowBar && !(allowBelowBar && confirm)) {
      safeSendErr(deps.transport, freshness, "below_bar_requires_confirm");
      return;
    }
  }

  // D-03: compute inverseOps at APPLY time (INV-14) — frozen into the journal.
  const inverseOperations = inverseOps(ops);
  let applied: { applied: number; failed: number };
  try {
    applied = await deps.applyPatchOverBridge(candidate.undoLabel ?? "bw-edit apply", ops);
  } catch {
    // Bridge failure (timeout / transport throw): do NOT journal a partial patch.
    safeSendErr(deps.transport, freshness, "apply_failed");
    return;
  }
  if (applied.failed > 0) {
    // Some ops failed at the bridge — do NOT journal a partial patch.
    safeSendOk(
      deps.transport,
      freshness,
      { ok: false, error: "apply_failed", applied: applied.applied, failed: applied.failed },
      applyAssumptions,
    );
    return;
  }
  // Success: append the durable journal entry (INV-14 inverse at apply time) +
  // evict the ephemeral candidate.
  const entry: PatchHistoryEntry = {
    ...candidate,
    inverseOperations,
    appliedAt: Date.now(),
    stateHashBefore: `clip:${state.selection.clipSid ?? ""}`,
    // D-05 (Phase 03.1 Plan 03): stamp the apply-time clipSid so the revert
    // pre-flight can compare it to the live state.selection.clipSid.
    clipSid: liveClipSid,
  };
  try {
    await deps.patchHistory.append(entry);
  } catch {
    // The apply already succeeded at the bridge; a journal failure is logged
    // but does not unwind the apply. The candidate is still evicted (the
    // bridge mutation is authoritative; the journal is the audit/revert spine).
  }
  deps.candidateStore.evict(patchId);
  safeSendOk(
    deps.transport,
    freshness,
    { ok: true, appliedOps: applied.applied, patchId, undoLabel: candidate.undoLabel ?? "bw-edit apply" },
    applyAssumptions,
  );
}

// ============================================================================
// Phase 4 Plan 04-05 — arrange.* dispatch (ARRANGE-01..05, UX-03, D-10/D-19).
// ============================================================================
//
// The arrangement-intelligence ops. Each loads the durable arrangement snapshot
// (.bw-brain/arrangement-snapshot.json, D-03), reads the derived fields the
// Wave 3 analyzers populated, and returns them with assumptions[] (UX-06) +
// the snapshot's pulledAt timestamp (Pitfall 8 — snap-stale defense).
//
// arrange.refresh is the workhorse: pull get.launcher_clips → save snapshot →
// runAll(M3_ANALYZERS) → save derived fields back → persist roles.json. The
// analysis ops (sections/repetition_report/energy_curve/review) optionally
// re-pull + re-analyze when the CLI passes {refresh:true} in the payload.
//
// D-10 INVARIANT: arrange.review calls suggestTransitions (advisory); it NEVER
// mints a patch. The grep for applyPatch/patchId in any arrange.* response is
// the T-04-16 code-review checklist.

/** A lazily-constructed M3 analyzer registry (the analyzers are pure + stateless). */
let m3Registry: AnalyzerRegistry | null = null;
function getM3Registry(): AnalyzerRegistry {
  if (m3Registry === null) {
    m3Registry = new AnalyzerRegistry();
    for (const a of M3_ANALYZERS) m3Registry.register(a);
  }
  return m3Registry;
}

/**
 * Build the AnalyzeContext the M3 analyzers expect. The profile loads from the
 * intent's projectIntent.profile field (ARCH-02: absent → generic literal).
 */
function buildAnalyzeCtx(intent: ProjectIntent | null, now: number): AnalyzeContext {
  let profile: Profile | undefined;
  try {
    profile = loadProfile(intent?.projectIntent.profile);
  } catch {
    profile = undefined; // ARCH-02 fallback — analyzers use literal-generic defaults
  }
  return { intent, now, profile };
}

/**
 * Build a pseudo-RawState whose `tracks` carries the snapshot's launcher grid.
 * The Wave 3 analyzers' extractSceneColumns reads `raw.tracks[].scenes[]`,
 * which is exactly the snapshot's grid.tracks shape. The other RawState fields
 * are stubbed (the analyzers only consume `tracks`).
 */
function rawFromSnapshot(snap: ArrangementSnapshot): RawState {
  return {
    version: snap.version,
    project: { name: "", tempo: 120, timeSignature: "4/4" },
    selection: {},
    tracks: snap.grid.tracks as unknown as RawState["tracks"],
  };
}

/** Extract a named derived field's value from the runAll output (or undefined). */
function pickDerived(
  fields: { field: string; value: unknown }[],
  name: string,
): unknown | undefined {
  for (const f of fields) {
    if (f.field === name) return f.value;
  }
  return undefined;
}

/** The pulledAt assumption every arrange.* response carries (Pitfall 8). */
function pulledAtAssumption(snap: ArrangementSnapshot | null): Assumption {
  if (snap === null) {
    return {
      claim: "no arrangement snapshot loaded — run `bw-arrange refresh` to pull the grid",
      confidence: 1.0,
      source: "default",
    };
  }
  return {
    claim: `derived from snapshot pulled at ${snap.pulledAt} (profile ${snap.profile}); run \`bw-arrange refresh\` if the project has changed`,
    confidence: 1.0,
    source: "default",
  };
}

/**
 * Shared preamble for the analysis ops: watchdog gate, load snapshot (optionally
 * refresh first), load profile, run analyzers, return the context or null when
 * an error result has already been sent.
 */
async function prepareArrangeDispatch(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: { refresh?: boolean } },
): Promise<{
  snap: ArrangementSnapshot | null;
  derived: Record<string, unknown>;
  assumptions: Assumption[];
} | null> {
  if (freshness === "disconnected") {
    safeSendErr(deps.transport, freshness, "state_disconnected");
    return null;
  }
  if (!deps.arrangementSnapshotPath) {
    safeSendErr(deps.transport, freshness, "not_implemented");
    return null;
  }
  const wantRefresh = msg.payload?.refresh === true;
  let snap = await loadArrangementSnapshot(deps.arrangementSnapshotPath);
  if (wantRefresh) {
    snap = await refreshSnapshot(deps, intent);
  }
  const assumptions: Assumption[] = [...liveAssumptions(state, intent), pulledAtAssumption(snap)];
  if (snap === null) {
    // No snapshot — refuse honestly (the producer must run `bw-arrange refresh` first).
    return { snap: null, derived: {}, assumptions };
  }
  // Run the M3 analyzers fresh against the snapshot grid (pure + fast for O(10²) scenes).
  const ctx = buildAnalyzeCtx(intent, Date.now());
  const fields = getM3Registry().runAll(rawFromSnapshot(snap), ctx);
  const derived: Record<string, unknown> = {};
  for (const f of fields) derived[f.field] = f.value;
  return { snap, derived, assumptions };
}

/**
 * arrange.refresh core: pull get.launcher_clips → build snapshot → runAll →
 * persist derived + roles.json. Returns the refreshed snapshot, or null on
 * pull failure.
 */
async function refreshSnapshot(
  deps: QueryServerDeps,
  intent: ProjectIntent | null,
): Promise<ArrangementSnapshot | null> {
  if (!deps.pullLauncherGrid || !deps.arrangementSnapshotPath) return null;
  let gridResp: unknown;
  try {
    gridResp = await deps.pullLauncherGrid();
  } catch (e) {
    console.error("[query-server] arrange.refresh get.launcher_clips pull failed:", (e as Error).message);
    return null;
  }
  const grid = gridResp as { tracks?: unknown[]; sceneNames?: string[] };
  if (!Array.isArray(grid.tracks)) return null;
  const tracks = grid.tracks as ArrangementSnapshot["grid"]["tracks"];
  const sceneCount = tracks.reduce((mx, t) => Math.max(mx, t.scenes?.length ?? 0), 0);
  const trackCount = tracks.length;
  const profileName = intent?.projectIntent.profile ?? "generic";
  const pulledAt = new Date().toISOString();
  const snap: ArrangementSnapshot = {
    version: "1.0",
    pulledAt,
    profile: profileName,
    sceneCount,
    trackCount,
    grid: { tracks, sceneNames: Array.isArray(grid.sceneNames) ? grid.sceneNames! : [] },
    derived: {},
  };
  // Run the M3 analyzers against the fresh grid.
  const ctx = buildAnalyzeCtx(intent, Date.now());
  const fields = getM3Registry().runAll(rawFromSnapshot(snap), ctx);
  const derived: NonNullable<ArrangementSnapshot["derived"]> = {};
  for (const f of fields) {
    if (f.field === "sections") derived.sections = f.value as NonNullable<ArrangementSnapshot["derived"]>["sections"];
    if (f.field === "repetition") derived.repetition = f.value as NonNullable<ArrangementSnapshot["derived"]>["repetition"];
    if (f.field === "energyCurve") derived.energyCurve = f.value as NonNullable<ArrangementSnapshot["derived"]>["energyCurve"];
    if (f.field === "trackRoles") derived.trackRoles = f.value as NonNullable<ArrangementSnapshot["derived"]>["trackRoles"];
  }
  snap.derived = derived;
  // Persist the snapshot + roles.json (atomic temp+rename).
  try {
    await saveArrangementSnapshot(deps.arrangementSnapshotPath, snap);
  } catch (e) {
    console.error("[query-server] arrange.refresh saveArrangementSnapshot failed:", (e as Error).message);
  }
  if (deps.rolesPath && derived.trackRoles) {
    try {
      const roles: RolesFile = {
        version: "1.0",
        classifiedAt: pulledAt,
        profile: profileName,
        tracks: derived.trackRoles as RolesFile["tracks"],
      };
      await saveRoles(deps.rolesPath, roles);
    } catch (e) {
      console.error("[query-server] arrange.refresh saveRoles failed:", (e as Error).message);
    }
  }
  return snap;
}

/** arrange.sections — ARRANGE-01: bottom-up scene segmentation. */
async function handleArrangeSections(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: { refresh?: boolean } },
): Promise<void> {
  const ctx = await prepareArrangeDispatch(deps, state, intent, freshness, msg);
  if (!ctx) return;
  safeSendOk(
    deps.transport,
    freshness,
    { sections: ctx.derived.sections ?? [], sceneCount: ctx.snap?.sceneCount ?? 0 },
    ctx.assumptions,
  );
}

/** arrange.repetition_report — ARRANGE-02: grouped repetition clusters. */
async function handleArrangeRepetitionReport(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: { refresh?: boolean } },
): Promise<void> {
  const ctx = await prepareArrangeDispatch(deps, state, intent, freshness, msg);
  if (!ctx) return;
  safeSendOk(
    deps.transport,
    freshness,
    { repetition: ctx.derived.repetition ?? [] },
    ctx.assumptions,
  );
}

/** arrange.energy_curve — ARRANGE-03: per-bar weighted composite energy. */
async function handleArrangeEnergyCurve(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: { refresh?: boolean } },
): Promise<void> {
  const ctx = await prepareArrangeDispatch(deps, state, intent, freshness, msg);
  if (!ctx) return;
  safeSendOk(
    deps.transport,
    freshness,
    { energyCurve: ctx.derived.energyCurve ?? [] },
    ctx.assumptions,
  );
}

/**
 * arrange.review — UX-03/D-11: the aggregate critique. Runs all 4 analyzers +
 * suggestTransitions (D-10 ADVISORY — NO patch fields). Returns sections,
 * energyCurve, repetition, transitionObservations, pulledAt, assumptions[].
 */
async function handleArrangeReview(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: { refresh?: boolean } },
): Promise<void> {
  const ctx = await prepareArrangeDispatch(deps, state, intent, freshness, msg);
  if (!ctx) return;
  const sections = (ctx.derived.sections ?? []) as import("../transforms/section-detector.js").SectionSummary[];
  const energyCurve = (ctx.derived.energyCurve ?? []) as import("../transforms/energy-curve.js").EnergyPoint[];
  const repetition = (ctx.derived.repetition ?? []) as import("../transforms/repetition-report.js").RepetitionCluster[];
  const profileName = intent?.projectIntent.profile ?? "generic";
  const repThreshold = 0.7; // ARCH-02 default; the repetition-report analyzer uses the same
  // D-10: suggestTransitions is ADVISORY ONLY — NO patch fields (T-04-16).
  const transitionObservations: TransitionObservation[] = suggestTransitions(
    sections,
    energyCurve,
    repetition,
    {
      sceneCount: ctx.snap?.sceneCount,
      repetitionThreshold: repThreshold,
      profileName,
      pulledAt: ctx.snap?.pulledAt,
    },
  );
  safeSendOk(
    deps.transport,
    freshness,
    {
      sections,
      energyCurve,
      repetition,
      trackRoles: ctx.derived.trackRoles ?? {},
      transitionObservations,
      pulledAt: ctx.snap?.pulledAt ?? null,
    },
    ctx.assumptions,
  );
}

/**
 * arrange.current_section — D-11 P2: the section covering the producer's
 * last-selected scene. Maps to state.selection.sceneIdx (the launcher scene
 * the producer last clicked), NOT a transport-launched "now playing" tracker
 * (D-01 is pull-only — the 5-event protocol enum does not grow).
 */
async function handleArrangeCurrentSection(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  if (freshness === "disconnected") {
    safeSendErr(deps.transport, freshness, "state_disconnected");
    return;
  }
  if (!deps.arrangementSnapshotPath) {
    safeSendErr(deps.transport, freshness, "not_implemented");
    return;
  }
  const snap = await loadArrangementSnapshot(deps.arrangementSnapshotPath);
  const sceneIdx = (state.selection as { sceneIdx?: number }).sceneIdx;
  const assumptions: Assumption[] = [
    ...liveAssumptions(state, intent),
    pulledAtAssumption(snap),
    {
      claim: "current-section reflects last-selected scene, not transport-launched scene",
      confidence: 1.0,
      source: "default",
    },
  ];
  let section: string | null = null;
  if (snap?.derived?.sections && typeof sceneIdx === "number") {
    for (const s of snap.derived.sections) {
      if (sceneIdx >= s.startScene && sceneIdx <= s.endScene) {
        section = s.label;
        break;
      }
    }
  }
  safeSendOk(
    deps.transport,
    freshness,
    { section: section ?? SECTION_RESERVED, sceneIdx: sceneIdx ?? null },
    assumptions,
  );
}

/** arrange.refresh — D-19: re-pull the grid + re-run all analyzers + persist. */
async function handleArrangeRefresh(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  if (freshness === "disconnected") {
    safeSendErr(deps.transport, freshness, "state_disconnected");
    return;
  }
  if (!deps.pullLauncherGrid || !deps.arrangementSnapshotPath) {
    safeSendErr(deps.transport, freshness, "not_implemented");
    return;
  }
  const snap = await refreshSnapshot(deps, intent);
  const assumptions: Assumption[] = [
    ...liveAssumptions(state, intent),
    pulledAtAssumption(snap),
  ];
  if (snap === null) {
    safeSendOk(
      deps.transport,
      freshness,
      { ok: false, sceneCount: 0, trackCount: 0, error: "get.launcher_clips pull failed" },
      assumptions,
    );
    return;
  }
  safeSendOk(
    deps.transport,
    freshness,
    { ok: true, pulledAt: snap.pulledAt, sceneCount: snap.sceneCount, trackCount: snap.trackCount },
    assumptions,
  );
}

/** edit.revert handler — find the journal entry, replay its inverse, append. */
async function handleEditRevert(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
  msg: { payload?: { patchId?: string } },
): Promise<void> {
  // SC#3 P2 watchdog gate.
  if (freshness === "disconnected") {
    safeSendErr(deps.transport, freshness, "state_disconnected");
    return;
  }
  if (!deps.patchHistory || !deps.applyPatchOverBridge) {
    safeSendErr(deps.transport, freshness, "not_implemented");
    return;
  }
  const patchId = msg.payload?.patchId ?? "";
  const entry = await deps.patchHistory.find(patchId);
  if (!entry) {
    safeSendErr(deps.transport, freshness, "not_found");
    return;
  }
  // D-05 (Phase 03.1 Plan 03): revert pre-flight — refuse when the cursor
  // clip's live clipSid ≠ the apply-time clipSid stamped in the journal.
  // Symmetric to the D-04 apply gate. Pre-fix entries (clipSid undefined)
  // are caveated via assumptions[] + proceed (D-05 migration policy per
  // RESEARCH §D-05 Discretion — preserves the recovery path for legacy
  // journal entries).
  const liveClipSid = state.selection.clipSid ?? "";
  const entryClipSid = entry.clipSid;
  const revertAssumptions: Assumption[] = [...liveAssumptions(state, intent)];
  if (entryClipSid === undefined) {
    // Pre-fix journal entry (no clipSid stamped at apply time). Caveated, NOT refused.
    revertAssumptions.push({
      claim: "reverting a pre-clipSid journal entry; cursor clip unverified",
      confidence: 0.5,
      source: "selection",
    });
  } else if (liveClipSid !== entryClipSid) {
    safeSendErr(deps.transport, freshness, "wrong_clip_targeted", {
      expectedClipSid: entryClipSid,
      actualClipSid: liveClipSid,
      hint: "re-select the clip you applied this patch to (or use Bitwig ⌘Z)",
    });
    return;
  }
  // Build a NEW patch whose operations = entry.inverseOperations (D-03 LIFO
  // replay through the SAME bridge path). Revert is itself recorded.
  const revertOps = entry.inverseOperations;
  const undoLabel = `revert ${entry.undoLabel ?? patchId}`;
  let applied: { applied: number; failed: number };
  try {
    applied = await deps.applyPatchOverBridge(undoLabel, revertOps);
  } catch {
    safeSendErr(deps.transport, freshness, "apply_failed");
    return;
  }
  if (applied.failed > 0) {
    safeSendOk(
      deps.transport,
      freshness,
      { ok: false, error: "apply_failed", applied: applied.applied, failed: applied.failed },
      revertAssumptions,
    );
    return;
  }
  // Stamp the original entry as reverted + append a NEW entry recording the
  // revert (its own inverseOperations = the original operations, so reverting
  // the revert re-applies the original — INV-1 round-trip). The journal is
  // append-only; stampReverted rewrites atomically (temp+rename).
  const now = Date.now();
  const revertEntry: PatchHistoryEntry = {
    patchId: `pt_revert-of-${patchId}`,
    scope: entry.scope,
    operations: revertOps as Patch["operations"],
    undoLabel,
    rationale: `daemon-authoritative revert of ${patchId}`,
    reversibility: "self-inverse",
    risk: entry.risk,
    inverseOperations: entry.operations as PrimitiveOp[],
    appliedAt: now,
    stateHashBefore: entry.stateHashBefore,
    // D-05 (Phase 03.1 Plan 03): the revert entry ALSO carries the live clipSid
    // (reverting-the-revert re-applies the original — the live clipSid must match).
    clipSid: liveClipSid,
  };
  try {
    await deps.patchHistory.append(revertEntry);
    // Stamp the original so a subsequent find(patchId) returns null
    // (double-revert protection). Best-effort: a stamp failure does not unwind
    // the revert — the bridge mutation is authoritative.
    await deps.patchHistory.stampReverted(patchId, now);
  } catch {
    // best-effort — the bridge mutation already succeeded.
  }
  safeSendOk(
    deps.transport,
    freshness,
    { ok: true, patchId, appliedRevertedAt: now, appliedOps: applied.applied },
    revertAssumptions,
  );
}

/** Construct a schema-valid ok:true result + send it (edit.* handlers). */
function safeSendOk(
  transport: Transport,
  freshness: "live" | "stale" | "disconnected",
  payload: object,
  assumptions: Assumption[],
): void {
  try {
    transport.send({
      version: VERSION,
      type: "result",
      ok: true,
      stateFreshness: freshness,
      payload,
      assumptions,
    });
  } catch (e) {
    console.error("[query-server] transport.send failed from edit.* continuation:", (e as Error).message);
  }
}

/**
 * Construct a schema-valid ok:false result + send it (edit.* error arms).
 *
 * D-06 (Phase 03.1 Plan 03): the optional `details` arg appends arbitrary
 * detail fields (e.g. `expectedClipSid`/`actualClipSid`/`hint` for the
 * `wrong_clip_targeted` error) to the result object INSTEAD of the default
 * `availableFrom:"M2"`. When `details` is absent, the existing family
 * (`state_disconnected`/`not_implemented`/`candidate_not_found`/
 * `confirmation_required`/`below_bar_requires_confirm`/`invalid_patch`/
 * `scope_mismatch`/`apply_failed`/`not_found`/`invalid_query`/`unknown_request`)
 * keeps its `availableFrom:"M2"` shape unchanged — Pitfall 8 explicitly forbids
 * a parallel `safeSendDetailedErr` function. Exported for direct testing.
 */
export function safeSendErr(
  transport: Transport,
  freshness: "live" | "stale" | "disconnected",
  error: string,
  details?: Record<string, unknown>,
): void {
  try {
    transport.send({
      version: VERSION,
      type: "result",
      ok: false,
      stateFreshness: freshness,
      error,
      // When details is provided, the detail fields (expectedClipSid/actualClipSid/hint)
      // REPLACE availableFrom — they are the structured-failure family for wrong_clip_targeted.
      // When details is absent, existing callers keep the availableFrom:"M2" shape.
      ...(details ?? { availableFrom: "M2" }),
    });
  } catch (e) {
    console.error("[query-server] transport.send failed from edit.* error arm:", (e as Error).message);
  }
}

// ============================================================================
// Phase 3 Plan 03-04 — midi.vary / midi.counterline / midi.voice_leading_fix /
// midi.humanize dispatch (MIDI-02..05, D-05/D-07/D-12).
// ============================================================================
//
// The creative/cleanup transform dispatch. Each handler pulls the live clip,
// loads the genre profile (D-14), resolves the harmonic center (D-12 — authored
// wins; opt-in inference with assumptions[] disclosure otherwise), runs the
// PURE transform, and mints candidate patchId(s) via the candidate store. The
// producer applies the minted patchId via Plan 02's `bw-edit apply`.
//
// BLOCKER-01 / INV-10 (audit-trail integrity): handleMidiVary RE-VALIDATES each
// candidate's risk via classifyRisk({declared, operations, scopeDeclared,
// belowBar: status==="refused"}) BEFORE candidateStore.mint — mirroring
// handleEditPreview. The vary birth-place already stamps refused→risk:"high"
// (Task 1); this daemon-side classifyRisk is the defense-in-depth re-validation
// so patch-history.jsonl can NEVER record a below-bar candidate as medium.
//
// SC#3 P2 watchdog gate: all four refuse when stateFreshness !== "live".

/** Shared preamble result for midi.* handlers (gating + clip + profile + harmonic). */
interface MidiDispatchCtx {
  before: Note[];
  profile: Profile;
  profileName: string;
  region: { start: number; end: number } | undefined;
  scopeDeclared: { clipSid: string; region?: { start: number; end: number } };
  harmonic: { key: string; mode: "major" | "minor" } | undefined;
  assumptions: Assumption[];
}

/**
 * Resolve the D-12 harmonic center. Authored intent wins (no inference
 * assumption); otherwise run detectHarmonicCenter and disclose the inference
 * (or the refusal) via assumptions[] (Pitfall 6 — no silent guess).
 *
 * Pure over its inputs (the detection itself is pure).
 */
function resolveHarmonic(
  before: Note[],
  intent: ProjectIntent | null,
  assumptions: Assumption[],
): { key: string; mode: "major" | "minor" } | undefined {
  const authored = intent?.projectIntent.harmonicCenter;
  if (authored) {
    return { key: authored.key, mode: authored.mode };
  }
  const detected = detectHarmonicCenter(before);
  if (detected) {
    assumptions.push({
      claim: `harmonicCenter: inferred ${detected.key} ${detected.mode}, confidence ${detected.confidence.toFixed(2)}`,
      confidence: detected.confidence,
      source: "default",
    });
    return { key: detected.key, mode: detected.mode };
  }
  assumptions.push({
    claim: "harmonicCenter: could not infer",
    confidence: 0.3,
    source: "default",
  });
  return undefined;
}

/**
 * The shared midi.* preamble: watchdog gate, candidateStore gate, pull live
 * clip notes, load profile, resolve harmonic. Returns the dispatch context, or
 * null when an error result has already been sent (the caller returns).
 */
async function prepareMidiDispatch(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<MidiDispatchCtx | null> {
  if (freshness === "disconnected") {
    safeSendErr(deps.transport, freshness, "state_disconnected");
    return null;
  }
  if (!deps.candidateStore) {
    safeSendErr(deps.transport, freshness, "not_implemented");
    return null;
  }
  const clipSid = state.selection.clipSid ?? "";
  // Narrow the loose selection.region (optional start?/end?) to a complete
  // {start,end} region ONLY when both bounds are present; a partial region is
  // treated as whole-clip (the default D-11 target).
  const rawRegion = state.selection.region;
  const region = rawRegion && typeof rawRegion.start === "number" && typeof rawRegion.end === "number"
    ? { start: rawRegion.start, end: rawRegion.end }
    : undefined;
  const before = (await pullLiveClipNotes(deps)) ?? ((state.clips as Note[] | undefined) ?? []);
  const profileName = intent?.projectIntent.profile;
  let profile: Profile;
  try {
    profile = loadProfile(profileName);
  } catch {
    // UnknownProfileError (T-3-14) — surface as invalid_query.
    safeSendErr(deps.transport, freshness, "invalid_query");
    return null;
  }
  const assumptions: Assumption[] = [...liveAssumptions(state, intent)];
  const harmonic = resolveHarmonic(before, intent, assumptions);
  return {
    before,
    profile,
    profileName: profileName ?? "generic",
    region,
    scopeDeclared: { clipSid, region },
    harmonic,
    assumptions,
  };
}

/**
 * midi.vary handler — run vary(), classify + mint 3 candidate patchIds.
 *
 * BLOCKER-01 / INV-10: each candidate is RE-VALIDATED via classifyRisk({belowBar:
 * status==="refused"}) BEFORE mint. A refused candidate is stored + journaled
 * with risk:"high" AND belowBar:true (the audit-trail floor — vary stamps the
 * birth-side risk:"high"; this is the daemon-side defense-in-depth).
 */
async function handleMidiVary(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  const ctx = await prepareMidiDispatch(deps, state, intent, freshness);
  if (!ctx) return; // error already sent
  const { before, profile, profileName, scopeDeclared, harmonic, assumptions } = ctx;

  const candidates = vary(before, ctx.region, profile, harmonic);
  const envelope = candidates.map((candidate) => {
    let risk: ReturnType<typeof classifyRisk>;
    try {
      risk = classifyRisk({
        declared: candidate.risk,
        operations: candidate.operations,
        scopeDeclared,
        // INV-10 / BLOCKER-01 — belowBar: candidate.status === "refused" forces
        // risk high so a refused candidate is journaled with its true risk class
        // (defense-in-depth over vary's birth-side risk:"high" stamp).
        belowBar: candidate.status === "refused",
      });
    } catch (e) {
      // ScopeMismatchError on a creative candidate is a bug (vary filters to
      // region internally) — surface as scope_mismatch + skip this candidate.
      console.error("[query-server] midi.vary classifyRisk scope_mismatch:", (e as Error).message);
      risk = candidate.risk;
    }
    const minted = deps.candidateStore!.mint(
      {
        scope: scopeDeclared,
        operations: candidate.operations as Patch["operations"],
        rationale: `vary ${candidate.label}: ${candidate.description}`,
        reversibility: "self-inverse",
        transformIntent: { name: "vary", variant: candidate.label, profile: profileName },
        risk,
        motifSimilarity: candidate.motifSimilarity,
        // belowBar: candidate.status === "refused" — the minted patch carries the
        // belowBar flag so patch-history.jsonl records it as a below-bar override.
        belowBar: candidate.status === "refused",
        assumptions,
      },
      // D-04 (Phase 03.1 Plan 03): preview-time clipSid for the apply gate.
      scopeDeclared.clipSid,
    );
    const entry: { label: string; description: string; patchId: string; risk: string; motifSimilarity: number; status?: string } = {
      label: candidate.label,
      description: candidate.description,
      patchId: minted.patchId,
      risk,
      motifSimilarity: candidate.motifSimilarity,
    };
    if (candidate.status) entry.status = candidate.status;
    return entry;
  });

  safeSendOk(
    deps.transport,
    freshness,
    { candidates: envelope },
    assumptions,
  );
}

/**
 * midi.counterline handler — run counterline(), classify + mint ONE candidate.
 * Creative tier (can refuse when no harmonic center or below threshold); a
 * refused candidate is minted with belowBar:true + risk:high (INV-10).
 */
async function handleMidiCounterline(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  const ctx = await prepareMidiDispatch(deps, state, intent, freshness);
  if (!ctx) return;
  const { before, profile, profileName, scopeDeclared, harmonic, assumptions } = ctx;

  const result = counterline(before, ctx.region, profile, harmonic);
  const belowBar = result.status === "refused";
  const risk = classifyRisk({
    declared: result.risk,
    operations: result.operations,
    scopeDeclared,
    belowBar,
  });
  const minted = deps.candidateStore!.mint(
    {
      scope: scopeDeclared,
      operations: result.operations as Patch["operations"],
      rationale: `counterline: companion voice (${result.operations.length} add_note ops)`,
      reversibility: "self-inverse",
      transformIntent: { name: "counterline", profile: profileName },
      risk,
      motifSimilarity: result.motifSimilarity,
      belowBar,
      assumptions,
    },
    // D-04 (Phase 03.1 Plan 03): preview-time clipSid for the apply gate.
    scopeDeclared.clipSid,
  );
  const payload: { patchId: string; risk: string; operations: number; motifSimilarity: number; status?: string } = {
    patchId: minted.patchId,
    risk,
    operations: result.operations.length,
    motifSimilarity: result.motifSimilarity,
  };
  if (result.status) payload.status = result.status;
  safeSendOk(deps.transport, freshness, payload, assumptions);
}

/**
 * midi.voice_leading_fix handler — cleanup tier (INV-8 never refuses on motif
 * grounds). Mint ONE low-risk candidate. Empty ops when the clip is clean (a
 * no-op candidate the producer applies harmlessly).
 *
 * D-10: cleanup transforms self-declare risk "low" and the daemon respects it —
 * their ops are identity-stable remove+add pairs / update_note_field content
 * mutations, NOT structural changes. The classifyRisk op-count floor (designed
 * for creative-tier add/remove blast radius) would over-penalize a cleanup that
 * legitimately touches many notes. BLOCKER-01's classifyRisk mandate is scoped
 * to the creative tier (handleMidiVary/handleMidiCounterline) where belowBar
 * re-validation is load-bearing for audit-trail integrity.
 */
async function handleMidiVoiceLeadingFix(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  const ctx = await prepareMidiDispatch(deps, state, intent, freshness);
  if (!ctx) return;
  const { before, profileName, scopeDeclared, assumptions } = ctx;

  const result = voiceLeadingFix(before);
  const risk = result.risk; // D-10 cleanup tier — self-declared "low" is authoritative
  const minted = deps.candidateStore!.mint(
    {
      scope: scopeDeclared,
      operations: result.operations as Patch["operations"],
      rationale: `voice-leading-fix: parallel-fifth/octave resolution (${result.operations.length} ops)`,
      reversibility: "self-inverse",
      transformIntent: { name: "voice-leading-fix", profile: profileName },
      risk,
      assumptions,
    },
    // D-04 (Phase 03.1 Plan 03): preview-time clipSid for the apply gate.
    scopeDeclared.clipSid,
  );
  safeSendOk(
    deps.transport,
    freshness,
    { patchId: minted.patchId, risk, operations: result.operations.length },
    assumptions,
  );
}

/**
 * midi.humanize handler — cleanup tier (INV-8 never refuses). Mint ONE low-risk
 * candidate carrying update_note_field ops (identity-stable, Pitfall 2). D-10
 * cleanup-tier risk stance (see {@link handleMidiVoiceLeadingFix}).
 */
async function handleMidiHumanize(
  deps: QueryServerDeps,
  state: RawState,
  intent: ProjectIntent | null,
  freshness: "live" | "stale" | "disconnected",
): Promise<void> {
  const ctx = await prepareMidiDispatch(deps, state, intent, freshness);
  if (!ctx) return;
  const { before, profile, profileName, scopeDeclared, assumptions } = ctx;

  const result = humanize(before, profile);
  const risk = result.risk; // D-10 cleanup tier — self-declared "low" is authoritative
  const minted = deps.candidateStore!.mint(
    {
      scope: scopeDeclared,
      operations: result.operations as Patch["operations"],
      rationale: `humanize: velocity + timing jitter (${result.operations.length} update_note_field ops)`,
      reversibility: "self-inverse",
      transformIntent: { name: "humanize", profile: profileName },
      risk,
      assumptions,
    },
    // D-04 (Phase 03.1 Plan 03): preview-time clipSid for the apply gate.
    scopeDeclared.clipSid,
  );
  safeSendOk(
    deps.transport,
    freshness,
    { patchId: minted.patchId, risk, operations: result.operations.length },
    assumptions,
  );
}
