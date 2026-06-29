// daemon/src/runtime/dispatcher.ts
//
// The onMessage branch the daemon's reader invokes per validated envelope
// (02-07 Task 2 step 3). Three branches:
//   - "hello"             : handshake negotiation (forward-compatible — the
//                           current bridge does NOT emit hello; BridgeExtension
//                           .startConnector opens the socket + starts writer/
//                           pull threads but sends no hello — verified). This
//                           branch is exercised by the smoke test's fake bridge
//                           + a future bridge that does send hello.
//   - "response"          : route to the correlator's pending get.* request.
//   - the 5 event types   : PURE fold into the current RawState via foldEvent
//                           (Task 1) + watchdog.onBridgeMessage + onSnapshot
//                           hook (boot's DEBOUNCED persistence — Pitfall 3:
//                           never sync disk I/O on the data path).
//
// The handler NEVER does sync disk I/O. The reader already drained heavy work
// off the transport's data event via queueMicrotask (Pitfall 3); the
// dispatcher body is O(1) per envelope (a shallow spread + a Map lookup) +
// persistence is debounced 1s in boot.ts.
//
// The handler NEVER throws (a thrown exception would kill the reader's
// microtask drain; wrap any risky branch in try/catch + log).
//
// CRITICAL FINDING (handshake.ts read_first): the current bridge does NOT
// emit hello. The reconnect trigger is "TCP accept + get.project_summary
// response" (handled in boot.ts's refreshSnapshot() via the correlator), NOT
// "hello arrived." The hello branch is wired for forward compatibility +
// exercised only by the smoke test's fake bridge.

import type { StaleWatchdog } from "../state/stale-watchdog.js";
import type { RequestCorrelator } from "../protocol/correlator.js";
import type { Transport } from "../transport/transport.js";
import type { RawState, StableIdMap } from "../state/reconcile.js";
import { foldEvent, type FoldContext } from "../ingest/fold-event.js";
import { negotiateVersion } from "../protocol/handshake.js";

/** A summary-track entry from the last get.project_summary response. */
export interface SummaryTrack {
  slot: number;
  name: string;
}

/**
 * Dependencies injected by boot.ts. Getters (`correlator`, `getState`,
 * `setState`, `summaryTracks`, `setSummaryTracks`) are THUNKS so the
 * dispatcher always sees the current correlator instance (boot swaps the
 * correlator on bridge disconnect — the boot owns the `let correlator`
 * slot; this thunk reads it lazily).
 */
export interface DispatcherDeps {
  /** The watchdog — onBridgeMessage on every envelope, onBridgeDisconnect fires from boot. */
  watchdog: StaleWatchdog;
  /** Lazy thunk returning the CURRENT correlator (boot may swap it on disconnect). */
  correlator: () => RequestCorrelator;
  /** The TCP transport (for sending hello.response). */
  tcpTransport: Transport;
  /** Returns the current RawState, or null before the first snapshot lands. */
  getState: () => RawState | null;
  /** Sets the current RawState (called after a fold). */
  setState: (s: RawState | null) => void;
  /** The persisted StableIdMap (read by the fold's slot -> sid resolution). */
  stableIds: StableIdMap;
  /** Returns the last get.project_summary tracks[] (for slot -> name lookup). */
  summaryTracks: () => SummaryTrack[];
  /** Sets summaryTracks (called by boot when a get.project_summary response lands). */
  setSummaryTracks: (t: SummaryTrack[]) => void;
  /**
   * Hook invoked after a successful event fold (the boot's DEBOUNCED
   * persistence runs here — NOT a sync disk write; Pitfall 3).
   */
  onSnapshot: (s: RawState) => void;
  /** The daemon's protocol version (OUR_VERSION from boot.ts). */
  bootVersion: string;
}

/**
 * Construct the onMessage handler the reader invokes per validated envelope.
 *
 * The returned function:
 *  - branches on envelope.type,
 *  - NEVER throws (risky branches wrapped in try/catch + log),
 *  - NEVER does sync disk I/O (persistence is debounced in boot via onSnapshot).
 *
 * @example
 * const dispatch = createDispatcher(deps);
 * createReader(tcpTransport, dispatch);
 */
export function createDispatcher(deps: DispatcherDeps): (msg: unknown) => void {
  return (msg: unknown): void => {
    const envelope = msg as { type?: string; id?: string; payload?: Record<string, unknown> };
    const type = envelope?.type;

    try {
      switch (type) {
        case "hello":
          handleHello(deps, envelope);
          deps.watchdog.onBridgeMessage();
          return;

        case "response":
          // Route to the correlator's pending get.* request. The snapshot/
          // reconcile logic lives in boot's `await correlator.send(...)`
          // continuation — NOT here — because reconcile + persist are async
          // + must not block the dispatcher's microtask.
          deps.correlator().resolve(envelope.id ?? "", envelope.payload ?? {});
          deps.watchdog.onBridgeMessage();
          return;

        case "selection.changed":
        case "track.name_changed":
        case "clip.name_changed":
        case "device.name_changed":
        case "transport.changed":
          handleEvent(deps, envelope);
          return;

        default:
          // Unknown type — the reader's envelope Ajv gate makes this
          // unreachable in practice. Log + drop defensively.
          console.error(`[dispatcher] unknown envelope type ${type ?? "<missing>"}; dropping`);
          return;
      }
    } catch (e) {
      // The handler NEVER throws — a thrown exception would kill the reader's
      // microtask drain. Log + swallow.
      console.error("[dispatcher] onMessage handler threw (swallowed):", (e as Error).message);
    }
  };
}

/** hello branch: negotiateVersion -> hello.response on ok, log + drop on mismatch. */
function handleHello(deps: DispatcherDeps, envelope: { payload?: Record<string, unknown> }): void {
  const theirVersion = typeof envelope.payload?.version === "string" ? envelope.payload.version : "";
  const r = negotiateVersion(theirVersion, deps.bootVersion);
  if (r.ok) {
    try {
      deps.tcpTransport.send({
        version: "1.0",
        type: "hello.response",
        ok: true,
        payload: { serverVersion: r.serverVersion },
      });
    } catch (e) {
      // No connected socket (the loop is racy) — log + drop, do NOT crash.
      console.error("[dispatcher] hello.response send failed:", (e as Error).message);
    }
  } else {
    // Version mismatch — log the peer's declared version + drop the message.
    // M1: no per-socket-close hook; we log + continue (do NOT crash).
    console.error(
      `[dispatcher] hello version mismatch: peer=${theirVersion} us=${deps.bootVersion}; dropping`,
    );
  }
}

/** Event fold branch: fold into current state, setState, watchdog, onSnapshot. */
function handleEvent(deps: DispatcherDeps, envelope: { type?: string; payload?: Record<string, unknown> }): void {
  const cur = deps.getState();
  if (cur === null) {
    // No baseline to fold into yet — the snapshot pull is pending. Log +
    // return (an event arrived before the first get.project_summary response).
    console.error(`[dispatcher] ${envelope.type} arrived before first snapshot; dropping`);
    return;
  }
  const ctx: FoldContext = {
    summaryTracks: deps.summaryTracks(),
    stableIds: deps.stableIds,
  };
  const next = foldEvent(cur, { type: envelope.type ?? "", payload: envelope.payload }, ctx);
  deps.setState(next);
  deps.watchdog.onBridgeMessage();
  // The onSnapshot hook is the boot's DEBOUNCED persistence entry point
  // (1s setTimeout in boot.ts — NOT a sync disk write; Pitfall 3).
  deps.onSnapshot(next);
}
