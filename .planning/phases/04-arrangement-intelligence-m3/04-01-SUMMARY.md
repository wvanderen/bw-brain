---
phase: 04-arrangement-intelligence-m3
plan: 01
subsystem: bridge
tags: [bitwig, launcher-grid, cursor-walk, clip-launcher, json-lines, observational-events]

# Dependency graph
requires:
  - phase: 03.1-gap-closure-clip-identity-scope-apply-pre-flight-bridge-auto
    provides: ClipSid derivation + bridge reconnect reconcile (ClipSid.derive is reused for launcher clip identity)
provides:
  - Bridge-side get.launcher_clips pull handler (D-01 cursor-walk enumeration)
  - LauncherGridWalker state machine (sequential cell-by-cell cursor walk)
  - Observers.wireClipLauncherSlotsEager (hasContent cache for 8×16 grid)
  - Protocol enum entry: get.launcher_clips (additive, no new event type)
  - docs/bitwig-capabilities.md §7 (verified Bitwig 6.0.6 launcher API behavior)
affects: [04-02 (foundation primitives consume launcher-clips snapshot), 04-05 (arrange refresh = pull-then-analyze-then-save), 04-06 (Pi /review renders this snapshot)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bitwig BooleanValue subscription (addValueObserver + cache + read-from-cache) — extends the proven wireTrackBank pattern
    - Eager observer registration during init() (Bitwig forbids post-init registration: "ydq: This can only be called during driver initialization")
    - createTrackBank(numTracks, numSends, numScenes) third arg controls per-track ClipLauncherSlotBank size

key-files:
  created:
    - bridge/src/main/java/com/bwbrain/bridge/LauncherGridWalker.java (state machine, 388 lines)
    - bridge/src/test/java/com/bwbrain/bridge/LauncherGridWalkerTest.java (9 tests including the regression for unsubscribed hasContent)
    - scripts/probe-launcher-clips.mjs (verification daemon for live Bitwig probes)
  modified:
    - bridge/src/main/java/com/bwbrain/bridge/Observers.java (+wireClipLauncherSlotsEager, +hasContentCache, +hostRef field)
    - bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java (+handleLauncherGrid, hasContent reads from cache)
    - bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java (createTrackBank arg + walker construction)
    - schemas/protocol/request.schema.json (enum += get.launcher_clips)
    - daemon/src/gen/request.ts (regenerated)
    - docs/bitwig-capabilities.md (§7 — verified observed values for Probes 1–5)

key-decisions:
  - "Eager observer registration only — Bitwig's 'driver initialization only' constraint makes lazy wiring structurally impossible"
  - "createTrackBank(BANK_SIZE, 0, SCENE_COUNT) — numScenes=0 produced null slotBanks; the third arg is per-track slotBank size, not bank-level scene navigation"
  - "ConcurrentHashMap<Long, Boolean> cache keyed by (trackIdx << 16) | sceneIdx — mirrors bankTrackNames/sceneNames style for thread-safe controller-thread writes + pull-handler reads"
  - "Walker timeout (DEFAULT_PER_CELL_TIMEOUT_MS=500) bounds awaitNext only; ~1s/cell wall-clock is select()+readNotes overhead — timeout bump won't help, accepted as UX cost"
  - "GUI focus changes during walk: visible but not disruptive — no PinnableCursorClip pinning needed at this time"

patterns-established:
  - "BooleanValue.get() returns false until addValueObserver fires — ALWAYS subscribe value observers during init() and read from a cache, never call .get() on an unsubscribed value"
  - "Bitwig API methods that look like simple property accessors (clipLauncherSlotBank, getClipLauncherSlots) can return null when called with the wrong configuration args — verify with a live probe before relying on the documentation"

requirements-completed: [ARRANGE-01, ARRANGE-02, ARRANGE-03, ARRANGE-04, ARRANGE-05]

# Metrics
duration: ~3h
completed: 2026-07-06
status: complete
---

# Plan 04-01: Launcher clip-grid enumeration (D-01) Summary

**Bridge-side `get.launcher_clips` cursor-walk handler verified against live Bitwig 6.0.6 — walks the 8×16 launcher grid via the cursor-walk state machine, returning real NoteSteps per cell after a three-layer observer-wiring fix (unsubscribed BooleanValue + numScenes=0 + post-init registration constraint).**

## Performance

- **Duration:** ~3h (1h initial implementation, 2h debugging the trust-spine gate)
- **Tasks:** 2/2 (Task 1: implementation + JUnit tests; Task 2: live Bitwig verification + capabilities doc)
- **Commits:** 6 (1 feat + 5 fix iterations)
- **Files modified:** 9 source + 1 docs + 1 probe script

## Accomplishments

- **Real producer data flows through the bridge.** Surge XT's 32-beat bass riff (pitches 60/56/58/61) + Bass 2's clips enumerate correctly with real clipSids, loopBeats, and NoteStep grids.
- **All 5 capability probes verified against live Bitwig.** Capabilities doc §7 upgraded from "pending re-probe" to OBSERVED with concrete numbers.
- **Three-layer fix documented as patterns** so future Phase 4+ plans don't repeat the failure modes.

## Task Commits

1. **Task 1: LauncherGridWalker state machine + handler + protocol enum** — `3a5d9f2` (feat)
2. **Task 2: Capabilities doc §7 (5 probes verified against live Bitwig 6.0.6)** — `080773f` (fix: subscribe hasContent observers)
3. **Task 2 (cont.): null-guard for Master/FX/Group tracks** — `9d51764` (fix)
4. **Task 2 (cont.): diagnostic logging** — `65863b8` (diag)
5. **Task 2 (cont.): lazy-wire attempt (later reverted)** — `48ad273` (fix → superseded)
6. **Task 2 (cont.): numScenes=SCENE_COUNT in createTrackBank** — `3231310` (fix)
7. **Task 2 (cont.): eager wiring during init() (the constraint-respecting path)** — `4903bc4` (fix — final)

## Files Created/Modified

- `bridge/src/main/java/com/bwbrain/bridge/LauncherGridWalker.java` — D-01 cursor-walk state machine (IDLE → SELECTING → AWAITING_LOOPLEN → DRAINING → ADVANCING → DONE)
- `bridge/src/main/java/com/bwbrain/bridge/Observers.java` — `wireClipLauncherSlotsEager` registers 128 hasContent observers during init(); `hasContentCache` keyed by `(t<<16)|s`; `hostRef` for diagnostic logging
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` — `handleLauncherGrid` binds the walker to live Bitwig bindings; `hasContent` lambda reads from cache instead of unsubscribed `.get()`
- `bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java` — `createTrackBank(BANK_SIZE, 0, SCENE_COUNT)` (was `0` for numScenes, which made every track's slotBank null)
- `bridge/src/main/java/com/bwbrain/bridge/LauncherGridWalkerTest.java` — 9 tests including the `regressionUnsubscribedHasContentObserverProducesAllEmpty` test that pins the bug signature (0/128 in 5–12ms)
- `schemas/protocol/request.schema.json` — enum += `get.launcher_clips` (additive, 5-event protocol enum UNCHANGED)
- `daemon/src/gen/{request,envelope}.ts` — regenerated from the schema
- `scripts/probe-launcher-clips.mjs` — standalone loopback probe daemon for live Bitwig verification
- `docs/bitwig-capabilities.md` — §7 records the three-layer fix + Probes 1–5 with OBSERVED values

## Decisions Made

1. **Eager observer registration only.** Bitwig throws `ydq: This can only be called during driver initialization` for any observer registration outside `init()`. The lazy-wire attempt (registering hasContent from the track-name observer callback) failed structurally; the eager path is the only viable option.
2. **`createTrackBank(BANK_SIZE, 0, SCENE_COUNT)` — the third arg matters.** With `numScenes=0`, every track's `clipLauncherSlotBank()` returns null (Bitwig interprets this as "no per-track slotBank"). The separate `SceneBank(16)` for scene-name observers is unchanged.
3. **Walker timeout stays at 500ms.** The ~1s/cell wall-clock is dominated by `select()` + `readNotes()` overhead, not `awaitNext()` (which fires within the 500ms budget). Bumping the timeout would not improve latency; the UX cost is documented.
4. **Diagnostic `host.println` calls left in place** for Plan 04-05's integration work. They are noisy (128 lines per session) but useful — should be downgraded to a single summary log before Plan 04-06 ships.

## Deviations from Plan

The plan anticipated a single iteration; Task 2's human-verify gate surfaced **three compounding defects** that required five fix commits. None changed the plan's scope or contracts — the protocol enum, response shape, and state-machine design are all as specified. The defects were entirely in the Bitwig API wiring (which the JUnit tests with recording fakes could not catch — they don't exercise a live Bitwig host).

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Unsubscribed BooleanValue on hasContent**
- **Found during:** Task 2 (initial probe — 0/128 cells in 5–12ms diagnostic)
- **Issue:** `ClipLauncherSlot.hasContent().get()` returns false forever until `addValueObserver` registers — walker short-circuited every cell
- **Fix:** `wireClipLauncherSlotsEager` registers 128 observers during init() + caches into `ConcurrentHashMap<Long, Boolean>`; walker reads from cache
- **Verification:** Live probe shows real hasContent counts + real NoteStep data
- **Committed in:** `080773f`

**2. [Rule 2 - Missing Critical] numScenes=0 in createTrackBank**
- **Found during:** Task 2 (second probe — every track returned slotBank=null)
- **Issue:** The third arg of `createTrackBank` is the per-track `ClipLauncherSlotBank` size, not bank-level scene navigation
- **Fix:** `host.createTrackBank(BANK_SIZE, 0, SCENE_COUNT)` — every track now exposes a 16-slot bank
- **Verification:** Console log shows `registered=128 nullBanks=0`
- **Committed in:** `3231310`

**3. [Rule 3 - Blocking] Bitwig forbids post-init observer registration**
- **Found during:** Task 2 (third probe — "ydq: This can only be called during driver initialization" thrown on every hasContent observer)
- **Issue:** Lazy-wire attempt (registering observers from the track-name callback on the controller thread) violates Bitwig's "driver initialization only" constraint
- **Fix:** All observer registration happens during init() via `wireClipLauncherSlotsEager`; the lazy-wire hook was reverted
- **Verification:** Console shows `registered=128` with no FAILED lines; observers fire correctly post-init
- **Committed in:** `4903bc4`

---

**Total deviations:** 3 auto-fixed (2 missing critical, 1 blocking)
**Impact on plan:** All auto-fixes necessary for the bridge to actually work against live Bitwig. No scope creep — the contracts (protocol enum, response shape, state machine) are unchanged.

## Issues Encountered

- **JUnit tests with recording fakes cannot catch Bitwig API wiring defects.** The walker's state machine is fully covered by unit tests, but the production bindings (the four functional interfaces wired in `PullHandlers.handleLauncherGrid`) had three bugs that only manifest against a live Bitwig host. This is the structural reason the trust-spine gate exists — capabilities-discipline: observed Bitwig behavior is the deliverable, never fabricated.
- **The original probe recipe in the checkpoint ("echo JSON | nc 127.0.0.1:7878") was incorrect.** The daemon's TCP listener only accepts bridge-side messages (hello/response/events), not CLI requests. The orchestrator wrote `scripts/probe-launcher-clips.mjs` as a standalone loopback daemon to exercise the bridge directly. Future plans that add new pull handlers should reference this pattern.

## Next Phase Readiness

- **Wave 2 unblocked.** Plan 04-02 (foundation primitives) consumes the launcher-clips snapshot via the existing pull handler — types are now in `daemon/src/gen/{request,envelope}.ts`.
- **Wave 3–5 ready.** Plans 04-03/04/04 (analyzers) reference the snapshot shape that's now verified; Plan 04-05 (integration) will add the `arrange.*` query op that triggers the pull; Plan 04-06 (Pi `/review`) wraps the CLI.
- **One follow-up before Plan 04-06 ships:** downgrade the 128-line diagnostic `host.println` flood in `wireClipLauncherSlotsEager` to a single summary line (or remove entirely once Plan 04-05's integration is stable).

## Verification Artifacts

- **Bitwig console output:** `wireClipLauncherSlotsEager: done registered=128 nullBanks=0` + boot fires showing `hasContent fired t=0 s=0..4 has=true` (Surge XT) and `t=1 s=0..1 has=true` (Bass 2)
- **Probe output:** `hasContentCells=2→3/128` across 5 requests, real `clipSid` values (clip_00ab982a04392a17, clip_2ede65f887d8a1c9), real NoteStep data with pitches/velocities/lengths
- **Test suite:** 39 bridge tests pass (38 existing + 1 new regression test); 517 daemon tests pass
- **API gates:** `check-bridge-artifact.mjs` PASS (artifact mtime 2026-07-06T23:17:06Z newer than source commit); `check-deprecated-bridge.mjs` 0 blocking findings

---
*Phase: 04-arrangement-intelligence-m3*
*Plan: 01*
*Completed: 2026-07-06*
