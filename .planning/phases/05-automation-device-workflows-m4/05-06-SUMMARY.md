---
phase: 05-automation-device-workflows-m4
plan: 06
subsystem: automation
tags: [automation, bridge, parameter-writer, apply-patch, bitwig, trust-spine, prior-capture]

# Dependency graph
requires:
  - phase: 05-02-live-probe
    provides: the 2026-08-22 live-probe write semantics (§3 Observed fields + execute-semantics consequence row) — the BINDING spec for the writer
  - phase: 05-03-device-identity
    provides: cursorDevice plumbing through start/runLoop/handle + the Observers remote-page/parameter-window wiring
  - phase: 05-05-automation-write-contract
    provides: the three automation op kinds + AutomationScope wire field names; the capturedPriorValue daemon contract (prior_unavailable refusal); the write-arm pre-flight gate that makes bridge-side transport gating unnecessary
provides:
  - ParameterWriter interface (capture/touch/setValue) in PullHandlers — the NoteStepWriter sibling, recording-writer-testable without a Bitwig host
  - applyOps dispatch for set_parameter_value / automation_points / remove_automation_points — discriminant-only, per-op try/catch failed-count discipline extended (not replaced)
  - capturedPriorValue in the apply.patch response — captured on the first automation op BEFORE any write, for the 05-05 journal freeze (D-05-07 / Pitfall 11)
  - cursorDeviceParameterWriter — paramSource-selected surface: remote_page via the Observers-retained init page (live-proven), device_parameter via the deprecated-allow getParameter window (honest per-op degrade; Java-side behavior flagged for 05-10)
  - PullHandlersAutomationTest — 10-test recording-writer dispatch suite (no Mockito, no Bitwig host)
affects: [05-08-target-resolution, 05-10-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable-write-surface siblings: NoteStepWriter (notes) + ParameterWriter (automation) — one applyOps switch, discriminant-only dispatch, per-op try/catch failed-count discipline for BOTH surfaces"
    - "Prior-capture-on-first-automation-op: capture() strictly precedes touch/setValue; capturedPriorValue rides the response only when an automation op ran (note-patch responses byte-identical)"
    - "Probe-supersedes-plan implementation: transport gating RETIRED bridge-side (§3 2026-08-22 — write-arm is the daemon-side gate); remove_automation_points refuses honestly (removal_surface_unverified) because the probe verified writes only"
    - "Scope-carries-the-target: ops carry values only; the patch's single AutomationScope (payload.scope) carries paramIndex/paramSource — absent scope + automation op = honest per-op failure, never a silent no-op"

key-files:
  created:
    - bridge/src/test/java/com/bwbrain/bridge/PullHandlersAutomationTest.java
  modified:
    - bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java
    - bridge/src/main/java/com/bwbrain/bridge/Observers.java

key-decisions:
  - "remote_page is the writer's live-proven surface via the Observers-retained init-created page — NOT a per-apply createCursorRemoteControlsPage (unverified post-init creation + page accumulation); device_parameter keeps the deprecated-allow getParameter window with honest per-op degrade (05-10 UAT arbitrates the Java host behavior)"
  - "remove_automation_points refuses per-op with removal_surface_unverified (never silent, never a pretend write) — the probe verified writes only; D-05-06 probe-pins-refuse-rest"
  - "No transport-state gating or reporting bridge-side: §3 consequence row pins instant write under write-arm (playing OR stopped); the 05-05 daemon pre-flight owns automation_write_disabled before dispatch"
  - "capturedPriorValue present only when an automation op captured (note patches byte-identical to Phase 3); a carried prior never masks a partial failure (daemon checks failed>0 first → apply_failed)"
  - "Legacy 4-arg applyOps overload retained (delegates with null writer) so the Phase-3 note path + ApplyPatchTest stay byte-identical"

patterns-established:
  - "Second injectable writer seam in applyOps: dispatch breadth follows the PrimitiveOp union; the invariant is discriminant-only dispatch, never transform intent (the retired '3-case forever' count updated in-code)"
  - "Structural source-scan test pattern: JUnit reads the main source to pin 'no .path(\"transformIntent\") read' (grep-level assertion in-suite) + behavioral mirror"

requirements-completed: [AUTO-03]

# Metrics
duration: 6min
completed: 2026-08-23
status: complete
---

# Phase 5 Plan 06: Bridge Automation Execution (ParameterWriter) Summary

**applyOps dispatches the three automation op kinds through an injectable ParameterWriter (touch→set→touch(false) per the 2026-08-22 probe), captures the prior value before any write for the 05-05 journal freeze, and refuses unverified removals honestly — all inside the same apply.patch mutation path as notes.**

## Performance

- **Duration:** 6 min (continuation of the 05 wave; started 2026-08-23T15:00:27Z, completed 2026-08-23T15:06:17Z)
- **Started:** 2026-08-23T15:00:27Z
- **Completed:** 2026-08-23T15:06:17Z
- **Tasks:** 2 (each TDD: RED → GREEN)
- **Files modified:** 3 (2 main sources + 1 test file)

## Accomplishments
- **ParameterWriter seam (Task 1):** `interface ParameterWriter { capture/touch/setValue }` — the NoteStepWriter sibling; `applyOps` extended to a 6-arg form (parameterWriter + the scope's single paramIndex) with the legacy 4-arg note-only overload delegating through. Prior captured on the FIRST automation op strictly before any write; response carries `capturedPriorValue` (daemon contract: absent ⇒ prior_unavailable, never a guessed inverse).
- **Doc-pinned execute semantics (Task 1):** set_parameter_value → touch(true)/setValue(exact normalized value)/touch(false); automation_points → the same per-point sequence in ascending beat order (writer owns temporal ordering); remove_automation_points → honest per-op refusal `removal_surface_unverified` (probe verified writes only). No transport gating bridge-side — write-arm is the 05-05 daemon pre-flight; §3 consequence row cited in the interface javadoc.
- **Recording-writer suite (Task 2):** 10 JUnit tests pin ordering, prior capture, failure counting, mixed-patch discriminant dispatch, the no-transformIntent structural invariant, empty-ops validation ordering, and pure construction — no Mockito, no Bitwig host. Full bridge suite green; deprecation + artifact gates pass.

## Task Commits

Each task was committed atomically (TDD: RED → GREEN per task):

1. **Task 1: ParameterWriter seam + automation dispatch in applyOps + prior capture in the response** — `84cd44c` (test/RED: 3 core tests, compile-fail on the absent seam), `0f6e1c3` (feat/GREEN)
2. **Task 2: PullHandlersAutomationTest — recording-writer dispatch suite** — `56f6b2c` (test; behaviors 1–10, 10/10 green — the 03.1-P04 "tests land second" precedent, no separate RED applicable against Task 1's implementation)

**Plan metadata:** (docs commit — below)

## Files Created/Modified
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` — ParameterWriter interface + cursorDeviceParameterWriter (paramSource-selected surface) + the three automation applyOps cases + capturedPriorValue in the response + discriminant-only invariant comments
- `bridge/src/main/java/com/bwbrain/bridge/Observers.java` — retains the init-created CursorRemoteControlsPage (volatile ref + package-private getRemotePage) so the writer resolves the live-proven surface without post-init page creation
- `bridge/src/test/java/com/bwbrain/bridge/PullHandlersAutomationTest.java` — 10-test recording-writer dispatch suite

## Decisions Made
- **remote_page via the retained init page** — the live-proven write surface (Surge XT M1–M8) is the Observers page created at init; a per-apply `createCursorRemoteControlsPage` would exercise an unverified post-init creation path and accumulate pages across a session.
- **device_parameter keeps the deprecated-allow window** — the 05-05 schema pins it as a source; the JS API hard-throws it (§4 A2) and the Java host behavior is flagged for the 05-10 UAT; every call sits inside the per-op try/catch so either outcome degrades honestly to a named failure.
- **Ops carry no target; the scope does** — `handleApplyPatch` reads `payload.scope.{paramIndex, paramSource}` (edit.schema.json payload is additionalProperties:true); until 05-08 threads the scope through the daemon's wire send, an automation op without a scope fails honestly per-op (`parameter_writer_unavailable`/index-throw), never a silent no-op.
- **Note-patch responses unchanged** — `capturedPriorValue` is present only when an automation op captured, so the Phase-3 note path (and ApplyPatchTest) stays byte-identical.

## Deviations from Plan

### Documented deviation path (binding probe input)

**1. Writer surface per the 05-02 live probe — plan prose superseded**
- **Found during:** Task 1 (writer implementation)
- **Issue:** The plan artifact specified a `cursorDevice.getParameter(int)`-backed writer; the binding probe input (docs §3/§4, 2026-08-22) pins remote-page knob Parameters as the ONLY live-proven write surface, with getParameter(int) JS-NEGATED and the Java-side behavior unverified until 05-10.
- **Fix:** `cursorDeviceParameterWriter` selects the surface by the scope's `paramSource` — `remote_page` → the Observers-retained page knobs (live-proven); `device_parameter` → the deprecated-allow getParameter window with honest per-op degrade. `transport_stopped`-style gating was never added (write-arm is the daemon-side gate per the same probe).
- **Files modified:** bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java
- **Verification:** Full bridge suite green; deprecation gate exit 0 (deprecated-allow marker on the getParameter call site); Tests 1–10 pin the dispatch.
- **Committed in:** 0f6e1c3

### Auto-fixed Issues

**2. [Rule 3 - Blocking] Retain the init-created remote page in Observers**
- **Found during:** Task 1 (writer needed the live-proven page handle)
- **Issue:** PullHandlers had no reachable handle to the CursorRemoteControlsPage (Observers created it locally in `wireRemotePage`); the plan's files_modified listed only PullHandlers.java, but without the handle the writer would have to create a page per apply — an unverified post-init creation path that also accumulates pages in a long-lived host.
- **Fix:** Additive change to Observers.java: `volatile CursorRemoteControlsPage remotePageRef` assigned in `wireRemotePage` (init) + package-private `getRemotePage()`. Purely additive; no observer rewiring.
- **Files modified:** bridge/src/main/java/com/bwbrain/bridge/Observers.java
- **Verification:** Full bridge suite green (Observers tests untouched); artifact gate passes.
- **Committed in:** 0f6e1c3

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking: unreachable live-proven surface handle) + 1 documented probe-supersession path (instructed by the binding probe input)
**Impact on plan:** No scope creep — the Observers change is 3 additive lines + getter in service of the plan's own live-honor must-have; the surface selection is the doc-mandated implementation.

## Issues Encountered
- One test-index miscount in Task 2's ascending-beat assertion (setValue at calls 2/5/8, asserted 2/6/10) — fixed before commit; not an implementation issue.
- The daemon's current wire send (`boot.ts` applyPatchOverBridge: `{undoLabel, operations}`) does not yet include the patch scope — the bridge reads `payload.scope` when present and automation ops fail honestly per-op until 05-08 threads it through. Recorded for 05-08 (see deferred-items.md).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The bridge write loop is closed end-to-end at the dispatch level: schema-validated automation ops → ParameterWriter touch/set → capturedPriorValue back for the journal freeze.
- 05-08 (curve shapes + automation.propose) owns threading the AutomationScope through the daemon's applyPatchOverBridge wire send so the bridge receives the single target; until then automation applies fail honestly at the bridge.
- 05-10 UAT owns the live checks: Java-side getParameter(int) behavior (graceful vs throw), real knob writes on the arranger lane, and revert behavior (remove ops refuse honestly — revert of an automation entry will surface apply_failed until a verified removal surface exists).

## Self-Check: PASSED

- All 3 key files exist on disk (verified `[ -f ]`)
- All 3 task commits present in git log (84cd44c, 0f6e1c3, 56f6b2c)
- Acceptance greps: `interface ParameterWriter` == 1; `capturedPriorValue` == 5; each automation op literal == 1 in dispatch; `AutomatableParameter` == 0 in main sources
- PullHandlersAutomationTest: 10 test methods, 10/10 green; full bridge suite green; `mvn package` + check-bridge-artifact.mjs PASSED; check-deprecated-bridge.mjs exit 0

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-23*
