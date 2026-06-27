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

    // Live op: build the payload + assumptions.
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
      case "midi.inspect":
        payload = midiInspect(state);
        break;
      case "device.inspect":
        payload = deviceInspect(state);
        break;
      default:
        // Unreachable (LIVE_OPS gate above) — defensive not_implemented.
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
