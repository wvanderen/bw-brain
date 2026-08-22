// bridge/src/test/java/com/bwbrain/bridge/BankSyncWaitTest.java
//
// Phase 4 Plan 04.3-06 (04.3 gap closure / DEFECT A bridge half) — JUnit
// coverage for the pure BankSyncWait decision logic. The seam takes injected
// suppliers + sleeper, so this test drives recording fakes with a FAKE CLOCK
// (every sleep(ms) advances the clock + counts a call — zero wall-clock time,
// the suite finishes in milliseconds). Mirrors the LauncherGridWalkerTest
// convention: no Mockito, no Bitwig host, plain assertTrue/assertEquals with
// message strings.
//
// Coverage (per the plan's <acceptance_criteria> — the four decision exits):
//   (a) threshold-met — observedCount already at minExpectedObservations
//       returns 0 waited and never sleeps
//   (b) quiet-settle — one observation at t0, clock advanced past settle,
//       returns after the settle check without hitting the cap
//   (c) zero-observation — no observations ever arrive, the wait runs to the
//       full maxWaitMs cap and returns (honest proceed)
//   (d) busy-bank — observations keep arriving so the quiet condition never
//       holds, the cap bounds the wait
package com.bwbrain.bridge;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BankSyncWaitTest {

    // === Recording fakes (mirror LauncherGridWalkerTest's hand-rolled style) ===

    /**
     * Fake clock + recording sleeper: the sleeper advances the fake clock by
     * the slept amount and counts calls — zero real Thread.sleep, so the
     * whole suite runs in milliseconds while exercising the real poll loop.
     */
    static final class FakeClock {
        long now;
        int sleepCalls;

        FakeClock(final long start) { this.now = start; }

        long nowMs() { return now; }

        final BankSyncWait.Sleeper sleeper = ms -> {
            now += ms;
            sleepCalls++;
        };
    }

    // === Tests ===

    @Test
    void thresholdMetReturnsImmediatelyWithoutSleeping() {
        // (a) Every registered bank observer has fired at least once — the
        // full-population early return. Zero waited, zero sleeps.
        final FakeClock clock = new FakeClock(1_000L);
        final long waited = BankSyncWait.awaitSettled(
                clock::nowMs,
                () -> 152,        // 8 track names + 16 scene names + 128 hasContent
                () -> 1_000L,     // last observation at the clock start
                152,              // minExpectedObservations
                BankSyncWait.BANK_SYNC_SETTLE_MS,
                BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                clock.sleeper);
        assertEquals(0L, waited, "threshold met → returns 0 waited");
        assertEquals(0, clock.sleepCalls, "threshold met → never sleeps");
    }

    @Test
    void lifetimeThresholdDoesNotBypassRequestRelativeQuietSettle() {
        // Live UAT DEFECT G: after init the cumulative counter was already
        // above 152, so a later project-tab-switch pull returned immediately
        // while hasContent callbacks were still changing. Production now
        // anchors the threshold to observationsAtRequest + 152. With a
        // lifetime count of 300 and a request-relative target of 452, this
        // request must honor the 250ms quiet window.
        final FakeClock clock = new FakeClock(1_000L);
        final int observationsAtRequest = 300;
        final long waited = BankSyncWait.awaitSettled(
                clock::nowMs,
                () -> observationsAtRequest,
                () -> 1_000L,
                observationsAtRequest + 152,
                BankSyncWait.BANK_SYNC_SETTLE_MS,
                BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                clock.sleeper);
        assertEquals(BankSyncWait.BANK_SYNC_SETTLE_MS, waited,
                "a prior lifetime count above 152 must not bypass this request's quiet window");
        assertEquals(5, clock.sleepCalls,
                "request-relative settle waits five 50ms polls before walking the switched project");
    }

    @Test
    void quietSettleReturnsAfterBurstGoesQuiet() {
        // (b) One observation at t0=1000 (the clock start), then the bank
        // goes quiet. The loop polls in 50ms increments until 250ms of quiet
        // have elapsed, then returns — WITHOUT hitting the 5000ms cap.
        final FakeClock clock = new FakeClock(1_000L);
        final long waited = BankSyncWait.awaitSettled(
                clock::nowMs,
                () -> 16,         // some observations arrived, below threshold
                () -> 1_000L,     // the single observation at t0
                152,
                BankSyncWait.BANK_SYNC_SETTLE_MS,
                BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                clock.sleeper);
        assertEquals(BankSyncWait.BANK_SYNC_SETTLE_MS, waited,
                "quiet-settle returns after exactly settleMs of quiet (250ms at 50ms poll granularity)");
        assertEquals(5, clock.sleepCalls,
                "250ms of quiet at 50ms polls = 5 sleeps — returns at the settle check, never hits the cap");
        assertTrue(waited < BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                "quiet-settle exit must beat the cap");
    }

    @Test
    void oldObservationTimestampStillPaysRequestLocalSettleWindow() {
        // A prior project's last callback is already long-quiet when this
        // request starts. It must not make the new request return at t=0;
        // Bitwig may not have begun publishing the project-switch burst yet.
        final FakeClock clock = new FakeClock(10_000L);
        final long waited = BankSyncWait.awaitSettled(
                clock::nowMs,
                () -> 300,
                () -> 1_000L,
                452,
                BankSyncWait.BANK_SYNC_SETTLE_MS,
                BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                clock.sleeper);
        assertEquals(BankSyncWait.BANK_SYNC_SETTLE_MS, waited,
                "an old prior-project timestamp cannot bypass this request's minimum settle window");
        assertEquals(5, clock.sleepCalls);
    }

    @Test
    void zeroObservationRunsToFullCapAndReturnsHonestly() {
        // (c) No observation EVER arrives (lastObservationAtMs stays 0 — the
        // quiet condition can never fire). The wait runs to the full
        // maxWaitMs cap and returns anyway: honest proceed-on-expiry, never a
        // hang, never a throw. The incomplete grid is refused downstream by
        // the daemon write gate (Plan 04.3-07) — layered defense.
        final FakeClock clock = new FakeClock(1_000L);
        final long waited = BankSyncWait.awaitSettled(
                clock::nowMs,
                () -> 0,          // zero observations, forever
                () -> 0L,         // lastObservationAt 0 = none fired yet
                152,
                BankSyncWait.BANK_SYNC_SETTLE_MS,
                BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                clock.sleeper);
        assertEquals(BankSyncWait.BANK_SYNC_MAX_WAIT_MS, waited,
                "zero observations → the full 5000ms cap, then honest proceed");
        assertEquals(100, clock.sleepCalls,
                "5000ms cap at 50ms polls = 100 fake sleeps (zero wall-clock time)");
    }

    @Test
    void busyBankNeverQuietIsBoundedByCap() {
        // (d) The bank keeps firing: every poll sees a fresh observation
        // (10ms ago — inside the 250ms settle window), so the quiet condition
        // NEVER holds and the threshold is never met. Only the cap bounds
        // the wait (T-04.3-17: a pull can never hang on never-settling banks).
        final FakeClock clock = new FakeClock(1_000L);
        final long waited = BankSyncWait.awaitSettled(
                clock::nowMs,
                () -> 16,                  // below threshold the whole time
                () -> clock.now - 10L,     // an observation 10ms ago, always fresh
                152,
                BankSyncWait.BANK_SYNC_SETTLE_MS,
                BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                clock.sleeper);
        assertEquals(BankSyncWait.BANK_SYNC_MAX_WAIT_MS, waited,
                "busy bank → quiet never holds → the cap bounds the wait");
        assertEquals(100, clock.sleepCalls,
                "cap reached after 100 polls of 50ms (busy bank keeps the loop alive the whole way)");
        assertTrue(clock.now - 1_000L >= BankSyncWait.BANK_SYNC_MAX_WAIT_MS,
                "the fake clock advanced the full budget — no real time passed");
    }
}
