---
phase: 05-automation-device-workflows-m4
plan: "03"
subsystem: bridge
tags: [bitwig, extension-api, observers, coalescing, device-chain, project-meta, junit, vitest]

# Dependency graph
requires:
  - phase: 05-automation-device-workflows-m4 (05-01)
    provides: parameter.changed event schema + get.project_meta request enum + transport automationWrite payload + daemon fold
provides:
  - get.project_meta bridge handler + boot-time project-meta pull (real tempo/timeSignature on connect — M1 tempo=120 hole closed, D-05-16)
  - Eager device-chain cache (DeviceBank 16), fixed 0..127 parameter window, 8-knob remote page, automation-write state observers (D-05-01/02/03)
  - Per-param last-value-wins coalescing with bounded 100ms flush emitting parameter.changed (deviceKey = deviceSid fingerprint)
  - Real get.selected_device_chain response: devices + bounded parameters + retained pages (A1-NEGATED stub replaced, AUTO-04 code-complete)
  - cursorDevice plumbed into the PullHandlers dispatch (Pitfall 3 groundwork for the 05-06 write wave)
affects: [05-04 salience/CLI wave, 05-05 automation patch scope, 05-06 write wave, 05-08, end-of-phase live UAT + A2 probe]

# Tech tracking
tech-stack:
  added: []  # zero new packages (T-05-SC accept)
  patterns:
    - "Testable nested observation cores (ParameterCoalescer/AutomationWriteEmitter) behind an injected line sink — the NoteStepWriter injectable-seam precedent applied to observers"
    - "deviceSid fingerprint = dev_ + sha256(track:device:position).slice(0,16) — parameter.changed deviceKey IS the AutomationScope deviceSid (05-05 pin)"
    - "Deprecated-surface isolation: per-index try/catch registration + deprecated-allow marker when the locked API surface has no non-deprecated replacement (documented, probe-arbitrated)"

key-files:
  created:
    - bridge/src/test/java/com/bwbrain/bridge/PullHandlersProjectMetaTest.java
    - bridge/src/test/java/com/bwbrain/bridge/ObserversCoalescingTest.java
    - bridge/src/test/java/com/bwbrain/bridge/PullHandlersDeviceChainTest.java
    - daemon/src/runtime/boot.test.ts
  modified:
    - bridge/src/main/java/com/bwbrain/bridge/Observers.java
    - bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java
    - bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java
    - bridge/src/test/java/com/bwbrain/bridge/BridgeExtensionReconnectTest.java
    - daemon/src/runtime/boot.ts

key-decisions:
  - "Device.getParameter(int) is @Deprecated in extension-api:21 (official deprecated-list; javadoc replacement getRemoteControls() does not exist in the jar) — the locked D-05-03 surface is kept behind per-index try/catch graceful degradation + a deprecated-allow marker; the PENDING live A2 probe (05-02) arbitrates whether the window survives live or the surface flips to page-based"
  - "isClipLauncherAutomationWriteEnabled() flagged by the HTML deprecated-list but NOT annotated in the jar (javap -v verified) — allowlisted as a javadoc artifact; the schema-required launcherWriteEnabled field has no other surface"
  - "AUTO-01/AUTO-04 left unchecked in REQUIREMENTS.md: this plan is code-complete but live-unverified (A2 probe + end-of-phase UAT pending), honoring the a212070 deferral and the honest-verdict discipline"

patterns-established:
  - "ParameterCoalescer: per-key last-value-wins coalescing with first-observation caching and epsilon suppression (1e-4) on the controller thread; bounded flush-thread drain via outbox.offer only"
  - "AutomationWriteEmitter: full 4-field snapshot push on every change (consumers never see a partial automationWrite object), per-field skipFirstFire"
  - "foldProjectMeta: defensive boot fold (malformed tempo/timeSignature rejected, DEFAULT_PROJECT never fabricated, failed pull never blocks boot)"

requirements-completed: []  # AUTO-01/AUTO-04 intentionally deferred — see key-decisions

# Metrics
duration: 15min
completed: 2026-08-22
status: complete
---

# Phase 5 Plan 03: Bridge Read Wave — project meta, device-chain enumeration, parameter observers Summary

**get.project_meta closes the M1 tempo=120 hole; the A1-NEGATED empty-pages stub is replaced by real DeviceBank + bounded getParameter-window + remote-page observation with per-param last-value-wins coalescing emitting parameter.changed (deviceKey = deviceSid fingerprint); cursorDevice is plumbed into the dispatch for the 05-06 write wave.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-22T20:34:17Z
- **Completed:** 2026-08-22T20:49:35Z
- **Tasks:** 3 (all TDD: RED→GREEN commit pairs)
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments
- **D-05-16 closed:** pull-only Transport.tempo()/timeSignature() caches → pure buildProjectMetaResponse → dispatch case; daemon boot/reconnect pulls get.project_meta best-effort (D-03d secondary-pull discipline) and folds real tempo/timeSignature into project state — DEFAULT_PROJECT survives only as the disconnected fallback (boot.test.ts proves both the 137.0/"7/4" fold and the never-fabricated 120/"4/4" fallback across the correlator timeout).
- **D-05-01/02/03 observation spine:** eager init()-registered device chain (createDeviceBank(16) name/isPlugin/position pull-only caches), fixed 0..127 cursorDevice parameter window (exists/name/value observers), one CursorRemoteControlsPage(0) with 8 macro knobs, transport automation-write observers (arranger/launcher write, override, writeMode) pushing transport.changed automationWrite with skipFirstFire — all over fixed proxies (Pitfall 7), zero computation in callbacks beyond cache writes (T-05-08), outbox.offer only.
- **Coalescing (Pitfall 5 / T-05-06):** ParameterCoalescer folds control-rate fires per key (last-value-wins, epsilon 1e-4, movement counters); a bounded 100ms flush thread offers one parameter.changed per moved key with the deviceKey computed on the flush thread (callbacks never hash).
- **AUTO-04 code-complete:** handleSelectedDeviceChain assembles devices (deviceSid/name/isPlugin/position, phantom-tail trim) + bounded parameters (device_parameter + remote_page sources, exists()-terminated) + retained pages; the 2026-06-29 A1-NEGATED finding history is cited where the stub lived.
- **Pitfall 3 groundwork:** cursorDevice threads BridgeExtension.init → startConnector → runConnectorCycle → PullHandlers.start/handle; applyOps stays note-only until 05-06; reconnect null-safety preserved (extra null threaded, 3/3 tests green).

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1: get.project_meta handler + boot pull** — `4869b3d` (test/RED) → `5e715d0` (feat/GREEN)
2. **Task 2: eager observers with coalescing** — `a1abf6e` (test/RED) → `1e88826` (feat/GREEN)
3. **Task 3: real device-chain response + cursorDevice plumbing** — `d0e493e` (test/RED) → `2011cd1` (feat/GREEN)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `bridge/src/main/java/com/bwbrain/bridge/Observers.java` — transport meta caches; device-chain/parameter-window/remote-page/automation-write wiring; ParameterCoalescer + AutomationWriteEmitter nested cores; deriveDeviceSid; cache getters
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` — buildProjectMetaResponse + dispatch case; DeviceView/ParamView records; buildDeviceChainResponse(devices, parameters, pages); handleSelectedDeviceChain rewrite; cursorDevice in start/handle signatures
- `bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java` — cursorDevice threading through startConnector/runConnectorCycle
- `daemon/src/runtime/boot.ts` — foldProjectMeta + connect-path meta pull; M1-limitation header updated to CLOSED
- `bridge/src/test/java/com/bwbrain/bridge/PullHandlersProjectMetaTest.java` — exact serialization, purity, honest defaults (3 tests)
- `bridge/src/test/java/com/bwbrain/bridge/ObserversCoalescingTest.java` — coalescing/epsilon/source/automationWrite behaviors + structural Pitfall-7 scan + deviceSid fingerprint (6 tests)
- `bridge/src/test/java/com/bwbrain/bridge/PullHandlersDeviceChainTest.java` — fabricated-cache assembly, walk termination, pages compat, null-cursorDevice (4 tests)
- `daemon/src/runtime/boot.test.ts` — foldProjectMeta pure guards + fake-bridge integration (7 tests)
- `bridge/src/test/java/com/bwbrain/bridge/BridgeExtensionReconnectTest.java` — extra null threaded (signature update only)

## Decisions Made
- Deprecated `Device.getParameter(int)` kept per locked D-05-03 with graceful per-index degradation + allowlisted marker (no non-deprecated direct-enumeration exists in extension-api:21; replacement `getRemoteControls()` absent from the jar — javap-verified 2026-08-22). The PENDING A2 live probe (05-02, capabilities §"Parameter indexing probe") arbitrates; if the host rejects the call live, the window degrades to empty and the surface flips to page-based in a follow-up.
- `isClipLauncherAutomationWriteEnabled` allowlisted as an HTML-vs-jar javadoc artifact (jar carries no @Deprecated on the value accessor; only the add*Observer convenience form is deprecated in both).
- Requirements AUTO-01/AUTO-04 NOT marked complete (see key-decisions): code-complete ≠ live-verified while the A2 probe and end-of-phase UAT are pending.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Device.getParameter(int) deprecation discovery**
- **Found during:** Task 2 (pre-implementation javap surface pinning)
- **Issue:** The plan's locked A1-NEGATED fallback surface (`cursorDevice.getParameter(i)`, D-05-03) is `@Deprecated` in extension-api:21 per the official deprecated-list.html — and Bitwig 6.x enforces deprecation-as-error at runtime (capabilities §4, the Phase-2 getTrack incident). The javadoc-recommended replacement (`getRemoteControls().getRemoteControlInSlot(i)`) does not exist in the jar (A1-NEGATED, javap-verified). RESEARCH §Code Examples verified the method EXISTS but missed the deprecation flag — the exact javap-vs-deprecation gap the repo's gate was built to close.
- **Fix:** Kept the locked surface (no approach switch — that decision belongs to the pending live probe, not an autonomous flip): per-index try/catch registration (wireClipLauncherSlotsEager defensive precedent) so a host rejection degrades the window to unbound instead of aborting init(); honest `// deprecated-allow:` marker with the full rationale; deprecation finding + probe dependency documented in the wireParameterWindow javadoc.
- **Files modified:** bridge/src/main/java/com/bwbrain/bridge/Observers.java
- **Verification:** deprecated-bridge gate PASSED (0 blocking, markers echoed with reasons); full mvn suite green
- **Committed in:** 1e88826 (part of Task 2 commit)

**2. [Rule 3 - Blocking] isClipLauncherAutomationWriteEnabled HTML-vs-jar conflict**
- **Found during:** Task 2 (deprecation gate run)
- **Issue:** The gate's HTML deprecated-list flags the value accessor; javap -v against extension-api-21 shows NO @Deprecated on it (only the addIsWritingClipLauncherAutomationObserver convenience form is deprecated in both sources). The schema-required launcherWriteEnabled field (D-05-05) has no other surface.
- **Fix:** Allowlisted with the jar-verification rationale in the marker; observer wired via the non-deprecated Value-level addValueObserver pattern used throughout the file.
- **Files modified:** bridge/src/main/java/com/bwbrain/bridge/Observers.java
- **Verification:** deprecated-bridge gate PASSED; AutomationWriteEmitter behavior tests green
- **Committed in:** 1e88826 (part of Task 2 commit)

**3. [Rule 3 - Blocking] Task 2 behavior tests needed a home beyond files_modified**
- **Found during:** Task 2 RED authoring
- **Issue:** The plan lists only PullHandlersProjectMetaTest + PullHandlersDeviceChainTest as new test files, but Task 2's behaviors (coalescing, epsilon, sources, automationWrite, structural wiring) target Observers, not PullHandlers.
- **Fix:** Created ObserversCoalescingTest.java (per-class test convention: LineJsonTest/OutboxTest/ClipSidTest precedent); observation logic extracted into testable nested cores so the test needs no Bitwig host.
- **Files modified:** bridge/src/test/java/com/bwbrain/bridge/ObserversCoalescingTest.java (new)
- **Verification:** 6/6 green
- **Committed in:** a1abf6e + 1e88826

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** No scope creep — all three unblock the plan's own required work. The deprecation findings are new static-analysis evidence (not live observations) recorded for the pending A2 probe; no plan mechanism changed.

## Issues Encountered
- Vitest 4 removed the `it(name, fn, options)` overload — new boot.test.ts integration tests use the `it(name, {timeout}, fn)` form (caught during Task 1 GREEN, fixed inline).
- Three javadoc lines initially matched the deprecation gate's receiver patterns (`cursorDevice.getParameter(`, `Device.getParameter(` as doc text) — reworded so only real call sites carry markers (gate stays honest).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 05-04 (salience analyzer + CLI) consumes the parameter.changed fold (05-01) fed by this plan's emitters; cache getters + deviceKey vocabulary are stable contracts.
- 05-05 (automation patch scope): the AutomationScope deviceSid MUST equal Observers.deriveDeviceSid output — the equivalence is pinned by PullHandlersDeviceChainTest + ObserversCoalescingTest.
- 05-06 (write wave): cursorDevice is in dispatch scope; applyOps remains note-only as planned.
- **Open live question (owned by 05-02's PENDING probe):** whether the deprecated getParameter window survives live-host instrumentation. If the probe proves it dies, the parameter window degrades to empty (devices + pages still populate) and the observation surface needs a page-based follow-up — flagged here so the end-of-phase UAT checks it first.

## Self-Check: PASSED

- Created files exist: PullHandlersProjectMetaTest.java, ObserversCoalescingTest.java, PullHandlersDeviceChainTest.java, boot.test.ts — FOUND
- Commits 4869b3d/5e715d0/a1abf6e/1e88826/d0e493e/2011cd1 present in git log — FOUND
- Plan verification re-run: mvn bridge suite green (65+ tests incl. 16 new), daemon suite 866/866, check-bridge-artifact PASSED, deprecated-bridge gate PASSED

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-22*
