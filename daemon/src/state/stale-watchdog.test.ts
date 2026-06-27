// daemon/src/state/stale-watchdog.test.ts
//
// SC#3 stale-watchdog transition suite (RESEARCH.md Pattern 2 lines 513-543;
// 02-PATTERNS.md Assignment 7 lines 300-330). Exercises EVERY freshness
// transition + the assertFresh() edit-gate. The watchdog consumes the SC#3
// truth (atomic state-cache + stable fingerprint map exist below it in 02-03a)
// and surfaces stateFreshness live|stale|disconnected on every CLI result.
//
// Three-state discipline per RESEARCH.md Pitfall 6 lines 828-833: "stale" and
// "disconnected" are DISTINCT (stale = bridge was alive recently, may resume;
// disconnected = socket torn down). Both must be reachable + assertable.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StaleWatchdog, STALE_THRESHOLD_MS, RECONNECT_GRACE_MS } from "./stale-watchdog.js";

describe("StaleWatchdog (SC#3 freshness state machine)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts disconnected", () => {
    const w = new StaleWatchdog();
    expect(w.tick()).toBe("disconnected");
  });

  it("onBridgeMessage -> live", () => {
    const w = new StaleWatchdog();
    w.onBridgeMessage();
    expect(w.tick()).toBe("live");
  });

  it("5s+ of silence -> stale (STALE_THRESHOLD_MS boundary)", () => {
    const w = new StaleWatchdog();
    w.onBridgeMessage();
    expect(w.tick()).toBe("live");
    // Advance JUST past the threshold.
    vi.advanceTimersByTime(STALE_THRESHOLD_MS + 1);
    expect(w.tick()).toBe("stale");
  });

  it("below STALE_THRESHOLD_MS stays live", () => {
    const w = new StaleWatchdog();
    w.onBridgeMessage();
    vi.advanceTimersByTime(STALE_THRESHOLD_MS - 1);
    expect(w.tick()).toBe("live");
  });

  it("onBridgeDisconnect -> disconnected (from live)", () => {
    const w = new StaleWatchdog();
    w.onBridgeMessage();
    expect(w.tick()).toBe("live");
    w.onBridgeDisconnect();
    expect(w.tick()).toBe("disconnected");
  });

  it("onBridgeDisconnect -> disconnected (from stale)", () => {
    const w = new StaleWatchdog();
    w.onBridgeMessage();
    vi.advanceTimersByTime(STALE_THRESHOLD_MS + 1);
    expect(w.tick()).toBe("stale");
    w.onBridgeDisconnect();
    expect(w.tick()).toBe("disconnected");
  });

  it("reconnect + first message -> live (from disconnected)", () => {
    const w = new StaleWatchdog();
    w.onBridgeMessage();
    w.onBridgeDisconnect();
    expect(w.tick()).toBe("disconnected");
    // Reconnect: a fresh bridge message flips straight back to live.
    w.onBridgeMessage();
    expect(w.tick()).toBe("live");
  });

  it("stale does NOT spontaneously become disconnected (Pitfall 6 three-state discipline)", () => {
    const w = new StaleWatchdog();
    w.onBridgeMessage();
    vi.advanceTimersByTime(STALE_THRESHOLD_MS + 1);
    expect(w.tick()).toBe("stale");
    // Stale persists — only onBridgeDisconnect reaches disconnected.
    vi.advanceTimersByTime(RECONNECT_GRACE_MS);
    expect(w.tick()).toBe("stale");
  });

  it("tick() is idempotent within a state (no spontaneous transitions)", () => {
    const w = new StaleWatchdog();
    expect(w.tick()).toBe("disconnected");
    expect(w.tick()).toBe("disconnected");
  });

  describe("assertFresh() — the M2 edit gate", () => {
    it("does NOT throw when freshness is live", () => {
      const w = new StaleWatchdog();
      w.onBridgeMessage();
      expect(() => w.assertFresh()).not.toThrow();
    });

    it("throws when freshness is stale", () => {
      const w = new StaleWatchdog();
      w.onBridgeMessage();
      vi.advanceTimersByTime(STALE_THRESHOLD_MS + 1);
      expect(w.tick()).toBe("stale");
      expect(() => w.assertFresh()).toThrow(/refuse edit/);
    });

    it("throws when freshness is disconnected", () => {
      const w = new StaleWatchdog();
      expect(w.tick()).toBe("disconnected");
      expect(() => w.assertFresh()).toThrow(/refuse edit/);
    });

    it("error message names the offending freshness state", () => {
      const w = new StaleWatchdog();
      w.onBridgeMessage();
      vi.advanceTimersByTime(STALE_THRESHOLD_MS + 1);
      // tick() transitions the stored freshness live -> stale; assertFresh()
      // checks that stored field (it does not recompute).
      expect(w.tick()).toBe("stale");
      let caught: unknown;
      try {
        w.assertFresh();
      } catch (err) {
        caught = err;
      }
      expect(String(caught)).toContain("stale");
    });
  });

  it("STALE_THRESHOLD_MS is 5 seconds (RESEARCH.md line 517)", () => {
    expect(STALE_THRESHOLD_MS).toBe(5_000);
  });

  it("RECONNECT_GRACE_MS is 60 seconds (RESEARCH.md line 518)", () => {
    expect(RECONNECT_GRACE_MS).toBe(60_000);
  });
});
