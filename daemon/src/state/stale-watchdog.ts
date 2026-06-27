// daemon/src/state/stale-watchdog.ts
//
// StaleWatchdog — the SC#3 freshness state machine (RESEARCH.md Pattern 2
// lines 513-543; 02-PATTERNS.md Assignment 7 lines 300-330). Consumes the
// SC#3 truth shipped by 02-03a (atomic state-cache + stable fingerprint map
// exist BELOW this layer) and surfaces stateFreshness live|stale|disconnected
// on every CLI result via tick(). The daemon's query-server (02-03b Task 2)
// calls tick() on every result so staleness surfaces to every CLI consumer.
//
// PITFALL 6 three-state discipline (RESEARCH.md lines 828-833): "stale" and
// "disconnected" are DISTINCT states and must NOT collapse:
//   - live         = bridge recently observed (< STALE_THRESHOLD_MS ago)
//   - stale        = bridge silent past STALE_THRESHOLD_MS (was alive, may resume)
//   - disconnected = bridge socket torn down (full re-fingerprint on reconnect)
// A watchdog that treats "stale" as "disconnected" breaks the reconcile path:
// stale KEEPS the stable-id map; disconnected triggers a full re-fingerprint.
//
// assertFresh() is the M2 EDIT GATE (SC#3 "refusing edits when bridge is
// silent"). M1 has NO edits (no apply.patch handler until Phase 3) so
// assertFresh() is unreachable on a live path in M1 — but the method EXISTS
// for D-08 plumbing and the Phase-3 edit handler will call it before apply.
// What M1 DOES surface: tick() drives the stateFreshness field on every result.

/**
 * The three freshness states (RESEARCH.md Pattern 2 line 520).
 * "stale" and "disconnected" are deliberately distinct (Pitfall 6).
 */
export type Freshness = "live" | "stale" | "disconnected";

/**
 * Bridge silence past this threshold marks the state stale.
 * RESEARCH.md line 517: 5 seconds.
 */
export const STALE_THRESHOLD_MS = 5_000;

/**
 * Vanished objects are kept in the stable-id map for this grace window before
 * expiry (RESEARCH.md line 518: 60 seconds). The caller (reconcile path) owns
 * the expiry; this constant is exported so the watchdog + reconcile share one
 * source of truth for the grace window.
 */
export const RECONNECT_GRACE_MS = 60_000;

/**
 * SC#3 freshness state machine. Mirrors the stateful-class shape of
 * {@link TcpServerTransport} (PATTERNS.md Assignment 7): private readonly
 * fields, explicit lifecycle methods, defensive throws on invariant violation.
 *
 * The clock (`Date.now()`) is read live — the watchdog is a STATEFUL class by
 * design (unlike the pure 02-03a primitives). Determinism for tests is via
 * `vi.useFakeTimers()` + `vi.setSystemTime()`, not injected `now`.
 */
export class StaleWatchdog {
  private lastBridgeAt: number = Date.now();
  private freshness: Freshness = "disconnected";

  /** Bridge sent a message — mark live + stamp the time. */
  onBridgeMessage(): void {
    this.lastBridgeAt = Date.now();
    this.freshness = "live";
  }

  /** Bridge socket torn down — mark disconnected (triggers full re-fingerprint on reconnect). */
  onBridgeDisconnect(): void {
    this.freshness = "disconnected";
  }

  /**
   * Read + advance the freshness state. Idempotent within a state. Callers
   * (the query-server) invoke this on every result so SC#3 staleness surfaces
   * to every CLI consumer.
   */
  tick(): Freshness {
    if (this.freshness === "disconnected") {
      return "disconnected";
    }
    if (Date.now() - this.lastBridgeAt > STALE_THRESHOLD_MS) {
      this.freshness = "stale";
    }
    return this.freshness;
  }

  /**
   * SC#3 enforcement point — the M2 EDIT GATE. Throws when freshness is not
   * "live". Phase 3's apply.patch handler MUST call this before applying any
   * edit; M1 has no edits so this is unreachable on a live path. The method
   * exists for D-08 plumbing from day one.
   */
  assertFresh(): void {
    if (this.freshness !== "live") {
      throw new Error(
        `refuse edit: state freshness is ${this.freshness} (bridge silent/disconnected)`,
      );
    }
  }
}
