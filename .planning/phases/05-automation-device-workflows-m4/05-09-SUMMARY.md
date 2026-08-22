---
phase: 05-automation-device-workflows-m4
plan: 09
subsystem: ui
tags: [clap, juce, peers, action-dispatch, conversation-chunk, salience, macro-suggest, vitest, ctest]

# Dependency graph
requires:
  - phase: 05-automation-device-workflows-m4 (05-04)
    provides: assembleDeviceReviewEvidence + salience snapshot store + refreshSalienceSnapshot (chain + ranked salience + pulledAt + refusal union)
  - phase: 05-automation-device-workflows-m4 (05-07)
    provides: macroSuggest single source + macros field on the device-review evidence
  - phase: 04.3-clap-first-product-rebaseline-and-roadmap-reconciliation
    provides: arrangementReview UiAction precedent, proposal drawer (kind-agnostic), conversation.chunk render path, reviewArrangement boot-injection seam
provides:
  - deviceReview UiAction end-to-end (Kind member, factory, peer encode, devices_ hosted button)
  - deterministic device.review peer branch (status-running → refusal-or-chunks → analysis.complete, zero Pi)
  - renderDeviceReview bounded-text module (chain/native-VST markers, ranked sparkline salience, macro opportunities with alternatives, pulledAt honesty, propose-via hint)
  - createDeviceReviewDependency boot wiring (refusal ladder + refresh from live folds + chain pull with folded fallback + macros via single source)
affects: [05-10 (end-of-phase UAT — live drawer row set U10), automation propose/apply plans consuming the drawer surface]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "additive-member UiAction extension (factory + encode case copied point-for-point; generic ConversationChunkReceived reducer reused with zero new state shapes)"
    - "deterministic peer-review branch template (arrangement.review ladder copied verbatim — optional dep, not_implemented refusal, 65,536 chunk cap)"
    - "bounded-text render module (512-char chunk packing at line boundaries, per-group pulledAt assumptions line, sparkline salience bars)"

key-files:
  created:
    - daemon/src/transforms/device-review-render.ts
    - daemon/src/transforms/device-review-render.test.ts
    - daemon/src/runtime/boot-device.test.ts
  modified:
    - clap/src/model/UiState.h
    - clap/src/model/UiState.cpp
    - clap/src/PluginEditor.cpp
    - clap/src/PluginEditor.h
    - clap/tests/editor_state_test.cpp
    - daemon/src/peers/action-dispatch.ts
    - daemon/src/peers/action-dispatch.test.ts
    - daemon/src/runtime/boot.ts
    - daemon/src/query/query-server.ts

key-decisions:
  - "deviceReview rides the generic ConversationChunkReceived reducer — no new reducer case; bounds (requestId/sequence/512) already live in reducePeerMessage validation; device-review-N tokens use their own atomic sequence"
  - "createDeviceReviewDependency mirrors createArrangementReviewDependency exactly — NO connected-bootstrap; the devices_ button hardwires refresh=true so a missing snapshot refreshes from the live parameter folds or renders the honest hint"
  - "Chain summary comes from the existing get.selected_device_chain pull gated on live+cursor (handleDeviceInspect semantics) with the folded devices cache as honest fallback"
  - "buildMacroSuggestions exported from query-server so boot populates evidence.macros via the macroSuggest single source (drawer populated identically to the CLI op)"
  - "UX-04 stays unchecked in REQUIREMENTS.md — code-complete end-to-end but live-unverified until 05-10 UAT (05-03/05-04 precedent)"

patterns-established:
  - "Additive review-action pattern: Kind member + factory + encode case + hosted button + boot-injected optional dependency + render module = the repeatable recipe for any future bounded review surface"
  - "Advisory render purity is structural: no ../patch/* imports + stringified input/output token assertion (extends the T-04.3-06 test shape)"

requirements-completed: []  # UX-04 code-complete; live drawer UAT pending 05-10 (05-04 precedent)

# Metrics
duration: 10min
completed: 2026-08-22
status: complete
---

# Phase 5 Plan 09: CLAP Device Workspace (deviceReview drawer) Summary

**deviceReview end-to-end: a hosted Devices button enqueues a deviceReview UiAction whose deterministic zero-Pi peer branch renders chain summary, ranked sparkline salience, and macro opportunities into the bounded drawer — approval authority untouched.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-22T21:20:04Z
- **Completed:** 2026-08-22T21:30:45Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Hosted `Devices` button in the CLAP editor enqueues `UiAction::deviceReview` from the confirmed scope snapshot (the `review_` precedent verbatim); `device.review` peer wire encodes scope + refresh and fails closed on invalid peer ids
- Deterministic `device.review` dispatch branch streams ranked evidence as bounded `conversation.chunk` texts (≤512 each, sequences 0..N-1, 65,536 total cap) inside the existing analysis.status/analysis.complete bracketing — the Pi analyze dependency is never invoked (structural test)
- Drawer text carries the full UX-04 surface: device chain with native/VST markers, ranked parameter targets with sparkline salience bars + movement/range evidence (never a lone unexplained best — SC#2), macro/XY opportunities with alternatives + assumptions + manual hints (D-05-11), pulledAt freshness on every group, and the propose-via hint pointing at `bw-automation propose` / the assistant
- Automation proposals ride the EXISTING proposal/approval drawer path byte-identically (RB-04 verified by diff); the drawer clamp (360–620 px) and ProposalView are untouched

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: deviceReview UiAction + devices_ button + reducer cases** — `e6ffeed` (test) + `eb52ca4` (feat)
2. **Task 2: renderDeviceReview module + device.review branch + boot wiring** — `f6d76c7` (test) + `2f1b7bf` (feat)

**Plan metadata:** `see final docs commit`

## Verification Results

- `cmake --build clap/build && ctest --test-dir clap/build` — **9/9 tests passed** (including the new deviceReview golden-wire, chunk append/reset, and bounds fail-closed cases)
- `npm --prefix daemon test` — **77 files / 965 tests passed** (44 new: 14 render, 5 dispatch, 11+14 boot-device; existing suites unaffected)
- `npx tsc --noEmit` — zero errors in touched files (pre-existing errors in untouched files remain, out of scope)
- Acceptance greps: `device.review` ×1 + `renderDeviceReview` ×3 in action-dispatch.ts; `deviceReview` ×2 in boot.ts; `deviceReview` ×1 in UiState.h, ×5 in UiState.cpp; `devices_` ×2 in PluginEditor.cpp; drawer clamp byte-identical; ProposalView struct untouched; proposal/approval branches byte-identical vs pre-task diff

## Files Created/Modified

- `clap/src/model/UiState.h` — `deviceReview` Kind member + factory declaration (additive)
- `clap/src/model/UiState.cpp` — factory with own `deviceReviewSequence` + `device.review` encode case (arrangementReview copied point-for-point)
- `clap/src/PluginEditor.h` / `clap/src/PluginEditor.cpp` — `Devices` button (construction, onClick enqueue, components array, resized() action row)
- `clap/tests/editor_state_test.cpp` — deviceReview golden wire + chunk discipline + bounds + hosted-action/non-parameter cases
- `daemon/src/transforms/device-review-render.ts` — renderDeviceReview + renderDeviceReviewHint (bounded, pure, advisory)
- `daemon/src/transforms/device-review-render.test.ts` — 14 render/purity tests
- `daemon/src/peers/action-dispatch.ts` — optional `deviceReview` dep + deterministic `device.review` branch
- `daemon/src/peers/action-dispatch.test.ts` — 5 dispatch ladder + zero-Pi structural tests
- `daemon/src/runtime/boot.ts` — `createDeviceReviewDependency` + production injection
- `daemon/src/runtime/boot-device.test.ts` — dependency refusal ladder + chain fallback + wiring/disconnected-boot tests
- `daemon/src/query/query-server.ts` — `buildMacroSuggestions` exported (additive)

## Decisions Made

- Generic reducer reuse (no new state shapes) — the arrangementReview reducer precedent IS the generic ConversationChunkReceived machinery; only factory + encode were additive
- No connected-bootstrap in the peer dependency (the button always refreshes; a missing snapshot refreshes from live folds or renders the honest hint) — mirrors `createArrangementReviewDependency`, not `loadSalienceForRead`'s CLI bootstrap
- Separate `device-review-N` token sequence so arrangement + device requestIds never collide on the chunk bookkeeping
- UX-04 requirement stays Pending until the 05-10 live UAT (code-complete is not live-verified — the 05-03/05-04 discipline)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported `buildMacroSuggestions` from query-server.ts**
- **Found during:** Task 2 (boot wiring)
- **Issue:** The plan pins evidence.macros "populated IDENTICALLY to the device.macros_suggest op (same macroSuggest single source)" via the caller invoking buildMacroSuggestions — but the function was module-private, so boot.ts could not call it without forking the logic
- **Fix:** Added the `export` keyword (additive; zero behavior change) with the javadoc noting the boot consumer
- **Files modified:** daemon/src/query/query-server.ts
- **Verification:** boot-device test asserts macros populated with ≥1 alternative from a real saved snapshot; full suite 965/965
- **Committed in:** 2f1b7bf (Task 2 commit)

**2. [Rule 3 - Blocking] Created `boot-device.test.ts` (omitted from files_modified)**
- **Found during:** Task 2 RED
- **Issue:** Behavior Test 7 demands boot-side assertions (production non-null injection + disconnected-path boot), but the plan's files list named only boot.ts for the runtime — with no existing boot test file covering dependency factories generically
- **Fix:** Created daemon/src/runtime/boot-device.test.ts mirroring boot-arrangement.test.ts (04.3-02 precedent) — dependency unit tests + structural wiring assertion + no-bridge boot integration
- **Files modified:** daemon/src/runtime/boot-device.test.ts
- **Verification:** 11 tests green; disconnected boot integration passes with the device wiring present
- **Committed in:** f6d76c7 + 2f1b7bf

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were mechanical enablements of exactly-specified behavior; no scope creep, no contract changes.

## Issues Encountered

- Three RED-phase test-fixture iterations on the render tests (stale pulledAt assumption in the null fixture; oversized-list entries outranking the pinned fixture entry; `toContain` + `stringMatching` asymmetric matcher not applying in vitest 4 — replaced with a direct regex `.some()`). All were bugs in the new tests, not the implementation; resolved within the RED→GREEN cycle.
- Pre-existing `tsc --noEmit` errors in untouched files (edit.test.ts/midi.test.ts gen module resolution, arb.ts fast-check typing, profile-loader tuple cast, boot.test.ts socket void) — out of scope per the scope boundary; the daemon test suite (which type-transpiles without typecheck) is fully green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UX-04 is code-complete: button → action → evidence → chunks → drawer all wired; the live drawer check rides the 05-10 UAT row set (U10 exercises ProposalView rendering an automation proposal live — no live observation was fabricated here)
- All upstream seams held: assembleDeviceReviewEvidence (05-04) and macroSuggest (05-07) consumed unmodified except the additive export
- Blockers: none

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-22*

## Self-Check: PASSED

- All 3 created files exist on disk
- All 4 task commits (e6ffeed, eb52ca4, f6d76c7, 2f1b7bf) present in git log
- ctest 9/9 green; daemon suite 965/965 green; acceptance greps all pass
