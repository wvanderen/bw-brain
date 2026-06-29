// daemon/src/protocol/correlator.ts
//
// RequestCorrelator — the daemon's get.* request/response-by-id primitive.
// Wraps a Transport so the daemon can `await correlator.send("get.project_summary")`
// and have the dispatcher route the matching response back via
// `correlator.resolve(id, payload)`. Owns a Map<id, {resolve, reject, timer}>
// + arms a setTimeout per request.
//
// RESEARCH.md Pattern 3 (lines 300-308 / 551-604): the bridge's PullHandlers
// thread responds synchronously from the Bitwig controller-thread snapshot
// cache — sub-100ms on loopback. The 3s timeout is a 30x safety margin + it
// bounds the CLI's worst-case wait. Cited as Pattern 3 "the bridge must
// respond promptly."
//
// MINOR 4 FIX: send() wraps transport.send() in try/catch.
// TcpServerTransport.send (tcp.ts:88-92) throws synchronously when
// sockets.size===0 ("no connected client"). Without the catch, the
// {resolve, reject, timer} entry would leak with a dangling 3s timer.
// On throw: clearTimeout + pending.delete + reject the promise with the
// underlying error. The catch MUST NOT re-throw — the promise rejection is
// the only signal the caller sees.
//
// NOT pure (owns a Map + timers) but mirrors handshake.ts's documented-
// interface + defensive discipline. Outstanding() is exposed for tests +
// the smoke test's shutdown verification.

import { randomUUID } from "node:crypto";
import type { Transport } from "../transport/transport.js";

/** The default response timeout (RESEARCH.md Pattern 3 — bridge responds promptly). */
export const DEFAULT_CORRELATOR_TIMEOUT_MS = 3_000;

/** Options for {@link RequestCorrelator}. */
export interface CorrelatorOptions {
  /** Override the response timeout (default {@link DEFAULT_CORRELATOR_TIMEOUT_MS}). */
  timeoutMs?: number;
}

/** A pending request entry: the promise settle pair + the armed timeout timer. */
interface PendingEntry {
  resolve: (payload: object) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Request/response correlator for the bridge's `get.*` pull path.
 *
 * Lifecycle:
 *  - send(type, payload?) -> Promise<object>: registers a pending entry,
 *    arms the timeout, then calls transport.send. Resolves when the
 *    dispatcher calls resolve(id, payload) with the matching id; rejects
 *    on timeout or transport-thrown error.
 *  - resolve(id, payload): called by the dispatcher on a `response`
 *    envelope; looks up the pending entry by id.
 *  - outstanding(): number of pending entries (tests + smoke).
 *  - close(): reject ALL pending with `Error("correlator closed")` +
 *    clear every timer (called by boot.ts on shutdown + on bridge
 *    disconnect before re-constructing a fresh correlator).
 *
 * @example
 * const correlator = new RequestCorrelator(tcpTransport);
 * const response = await correlator.send("get.project_summary");
 * // dispatcher.ts: correlator.resolve(msg.id, msg.payload);
 */
export class RequestCorrelator {
  readonly timeout: number;
  private readonly transport: Transport;
  private readonly pending = new Map<string, PendingEntry>();

  constructor(transport: Transport, opts: CorrelatorOptions = {}) {
    this.transport = transport;
    this.timeout = opts.timeoutMs ?? DEFAULT_CORRELATOR_TIMEOUT_MS;
  }

  /**
   * Send a `get.*` request over the transport and await the matching response.
   *
   * Generates a fresh uuid, registers the pending entry, arms the timeout
   * timer, THEN calls `transport.send`. If `transport.send` throws
   * synchronously (e.g. TcpServerTransport.send at tcp.ts:88-92 throws when
   * sockets.size===0), the entry is cleaned up + the promise rejects with the
   * underlying error — the entry MUST NOT leak with a dangling 3s timer
   * (Minor 4 fix).
   *
   * @param type    - the request type (e.g. "get.project_summary").
   * @param payload - optional request payload (default `{}`).
   * @returns the response payload, or rejects on timeout / transport error.
   */
  send(type: string, payload: object = {}): Promise<object> {
    const id = randomUUID();
    return new Promise<object>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`bridge ${type} timed out after ${this.timeout}ms`));
        }
      }, this.timeout);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.transport.send({ version: "1.0", type, id, payload });
      } catch (e) {
        // Minor 4 fix: transport.send() threw synchronously (e.g.
        // TcpServerTransport has no connected sockets). Clear the timer +
        // delete the pending entry so it does not leak with a dangling 3s
        // timer. The promise rejection is the only signal the caller sees
        // (the catch MUST NOT re-throw).
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  /**
   * Resolve a pending request by id. Called by the dispatcher on a
   * `response` envelope.
   *
   * If the id is unknown (late/unsolicited response — T-2-07-R), log and
   * drop: NEVER throw, NEVER mutate state. The dispatcher's microtask drain
   * must not be killed by a stray response.
   */
  resolve(id: string, payload: object): void {
    const entry = this.pending.get(id);
    if (!entry) {
      // Unsolicited / late / duplicate response — log + drop (T-2-07-R).
      console.error(`[correlator] unsolicited response for unknown id ${id}; dropping`);
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve(payload);
  }

  /** Number of pending requests (tests + smoke). */
  outstanding(): number {
    return this.pending.size;
  }

  /**
   * Reject ALL pending requests with `Error("correlator closed")` + clear
   * every timer. Called by boot.ts on graceful shutdown AND on bridge
   * disconnect (before constructing a fresh correlator over the same
   * transport). Guarantees no pending get.* request outlives the
   * correlator (T-2-07-E).
   */
  close(): void {
    const err = new Error("correlator closed");
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}
