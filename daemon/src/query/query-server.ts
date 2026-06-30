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

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(querySchema);
ajv.addSchema(resultSchema);
const validateQuery = ajv.getSchema(querySchema.$id)!;

/** The live ops the daemon serves with ok:true + payload (M1 reads + M2 edits). */
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
  if (freshness !== "live") {
    safeSendErr(deps.transport, freshness, "state_stale");
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
  const candidate = deps.candidateStore.mint({
    ...patch,
    risk,
    operations: ops as Patch["operations"],
  });
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
  if (freshness !== "live") {
    safeSendErr(deps.transport, freshness, "state_stale");
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
      liveAssumptions(state, intent),
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
    liveAssumptions(state, intent),
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
  if (freshness !== "live") {
    safeSendErr(deps.transport, freshness, "state_stale");
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
      liveAssumptions(state, intent),
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
    liveAssumptions(state, intent),
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

/** Construct a schema-valid ok:false result + send it (edit.* error arms). */
function safeSendErr(
  transport: Transport,
  freshness: "live" | "stale" | "disconnected",
  error: string,
): void {
  try {
    transport.send({
      version: VERSION,
      type: "result",
      ok: false,
      stateFreshness: freshness,
      error,
      // result.schema.json forces availableFrom on ok:false; M2 edits are live.
      availableFrom: "M2",
    });
  } catch (e) {
    console.error("[query-server] transport.send failed from edit.* error arm:", (e as Error).message);
  }
}
