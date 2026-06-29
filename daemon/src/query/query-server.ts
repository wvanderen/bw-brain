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
import querySchema from "../../../schemas/cli-query/query.schema.json" with { type: "json" };
import resultSchema from "../../../schemas/cli-query/result.schema.json" with { type: "json" };
import { LineBuffer } from "../protocol/line-buffer.js";
import type { Transport } from "../transport/transport.js";
import type { StaleWatchdog } from "../state/stale-watchdog.js";
import type { RawState } from "../state/reconcile.js";
import type { ProjectIntent } from "../gen/intent.js";
import type { Assumption } from "../state/analyzer-registry.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(querySchema);
ajv.addSchema(resultSchema);
const validateQuery = ajv.getSchema(querySchema.$id)!;

/** The 5 live M1 ops the daemon serves with ok:true + payload. */
const LIVE_OPS = new Set([
  "focus.export",
  "project.summary",
  "project.region",
  "midi.inspect",
  "device.inspect",
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
