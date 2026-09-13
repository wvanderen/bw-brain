// bridge/src/main/java/com/bwbrain/bridge/BankSyncWait.java
//
// Phase 4 Plan 04.3-06 (04.3 gap closure / DEFECT A bridge half) — the pure
// bounded bank-sync settle wait that gates the get.launcher_clips cursor walk.
//
// DEFECT A ROOT CAUSE (2026-08-21 live UAT; diagnosis in git history,
// .planning/phases/04.3-...-reconciliation/04.3-UAT.md; decision in
// docs/adr/0007-confidence-gated-labels.md
// Findings): the FIRST get.launcher_clips pull after connect completed fast
// against UNSYNCED TrackBank/SceneBank/ClipLauncherSlotBank caches — the walk
// read empty trackSids (tracks 4-7) and all 128 cells hasContent:false, and
// that empty grid was persisted as truth into arrangement-snapshot.json.
// Later pulls DID read populated banks (slow but good) but exceeded the
// daemon's 3000ms pull timeout, so the correlator dropped their late
// responses. The bridge handed the daemon an empty grid FAST instead of a
// populated grid bounded-slow — this seam fixes the timing at the source:
// settle BEFORE the walk, never after.
//
// DECISION RULE (mirrored case-for-case in BankSyncWaitTest):
//   1. THRESHOLD — observedCount >= minExpectedObservations → return 0
//      immediately. The production caller makes this request-relative:
//      observations-at-request + one full population (track names + scene
//      names + their hasContent matrix). A lifetime cumulative count
//      can therefore never bypass settling a later project-tab switch.
//   2. QUIET — this request has waited at least settleMs, at least one
//      observation has arrived in the controller lifetime, AND
//      now - lastObservationAtMs >= settleMs → return. The request-local
//      minimum prevents an old timestamp from a previous project making a
//      new project-switch pull return before its callback burst begins.
//   3. CAP — neither condition met within maxWaitMs → return anyway. HONEST
//      proceed-on-expiry: an incomplete grid is answered as-is and refused
//      downstream by the daemon write gate from Plan 04.3-07 (layered
//      defense), so expiry degrades visibly rather than silently — and the
//      pull can never hang on never-settling banks (T-04.3-17).
//
// Pure static seam: every environmental input (clock, counters, sleeper) is
// injected so BankSyncWaitTest drives recording fakes with a fake clock — no
// Bitwig host, no Mockito, zero wall-clock sleeping. Mirrors the
// LauncherGridWalker utility shape (package-private final class, private
// constructor, static-only) and its DEFAULT_PER_CELL_TIMEOUT_MS budget-style
// constant precedent.
package com.bwbrain.bridge;

import java.util.function.IntSupplier;
import java.util.function.LongSupplier;

/**
 * Bounded bank-sync settle wait (04.3 gap closure / DEFECT A). Package-private
 * utility; the only production caller is
 * {@link PullHandlers#handleLauncherGrid}, which awaits settle BEFORE the
 * cursor walk reads the observer caches.
 */
final class BankSyncWait {

    /**
     * Quiet window after the population burst: 250ms with no bank
     * observations = the banks have settled.
     */
    static final long BANK_SYNC_SETTLE_MS = 250L;

    /**
     * Hard cap on the whole settle wait so a pull can NEVER hang on
     * never-settling banks (T-04.3-17). On expiry the walk proceeds honestly
     * into the daemon-side refuse-to-persist gate (Plan 04.3-07).
     */
    static final long BANK_SYNC_MAX_WAIT_MS = 5000L;

    /** Poll granularity inside the wait loop (fake-clock-swappable in tests). */
    static final long BANK_SYNC_POLL_MS = 50L;

    private BankSyncWait() {}

    /**
     * Injectable sleeper seam. Declares {@code throws InterruptedException}
     * (which {@code java.util.function.LongConsumer} cannot) so production
     * binds the method reference {@code Thread::sleep} DIRECTLY —
     * LongConsumer's no-throws {@code accept(long)} is incompatible with
     * {@code Thread.sleep(long)}'s checked exception and would not compile.
     * Tests bind a fake-clock-advancing recorder (zero wall-clock time).
     */
    @FunctionalInterface
    interface Sleeper {
        void sleep(long ms) throws InterruptedException;
    }

    /**
     * Block until the bank-observation stream has settled, bounded by
     * {@code maxWaitMs}. See the class header for the three-exit decision
     * rule (threshold OR quiet, capped).
     *
     * @param nowMs                  injectable clock (production:
     *                               {@code System::currentTimeMillis}).
     * @param observedCount          total bank observations so far
     *                               (production: {@code Observers::getBankObservationCount}).
     * @param lastObservationAtMs    wall-clock ms of the latest observation, 0
     *                               when none has fired (production:
     *                               {@code Observers::getLastBankObservationAt}).
     * @param minExpectedObservations request-relative threshold for the
     *                               full-population early return (production:
     *                               count-at-request + the caller's full bank
     *                               population size).
     * @param settleMs               quiet window (production:
     *                               {@link #BANK_SYNC_SETTLE_MS}).
     * @param maxWaitMs              hard cap (production:
     *                               {@link #BANK_SYNC_MAX_WAIT_MS}).
     * @param sleeperMs              poll sleeper (production:
     *                               {@code Thread::sleep}).
     * @return total milliseconds actually waited: 0 when already settled
     *         (threshold met or long-quiet), {@code <= maxWaitMs} otherwise.
     *         On interruption: restores the interrupt flag and returns the
     *         wait so far — honest proceed, never hang, never throw into the
     *         void (the surrounding dispatch stays total, Pitfall 8).
     */
    static long awaitSettled(final LongSupplier nowMs,
                             final IntSupplier observedCount,
                             final LongSupplier lastObservationAtMs,
                             final int minExpectedObservations,
                             final long settleMs,
                             final long maxWaitMs,
                             final Sleeper sleeperMs) {
        final long start = nowMs.getAsLong();
        // Exit 1 — THRESHOLD: full population, zero wait, zero sleeps.
        if (observedCount.getAsInt() >= minExpectedObservations) {
            return 0L;
        }
        while (true) {
            final long now = nowMs.getAsLong();
            final long waited = now - start;
            // Exit 3 — CAP: honest proceed-on-expiry (bounded by maxWaitMs).
            if (waited >= maxWaitMs) {
                return waited;
            }
            // Exit 2 — QUIET: at least one observation arrived and the burst
            // has gone quiet for settleMs. lastObservationAtMs == 0 means no
            // observation yet — quiet cannot fire, only threshold or cap can.
            final long last = lastObservationAtMs.getAsLong();
            if (waited >= settleMs && last > 0L && (now - last) >= settleMs) {
                return waited;
            }
            try {
                sleeperMs.sleep(BANK_SYNC_POLL_MS);
            } catch (final InterruptedException ie) {
                Thread.currentThread().interrupt();
                return waited;
            }
        }
    }
}
