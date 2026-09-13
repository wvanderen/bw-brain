---
phase: 05-automation-device-workflows-m4
plan: 05
subsystem: automation
tags: [automation, patch-schema, risk-classifier, named-refusals, journal, trust-spine, bitwig]

# Dependency graph
requires:
  - phase: 05-01-automation-observation
    provides: parameter.changed observation spine + state.transport.automationWrite folds (the gates' data sources)
  - phase: 05-02-live-probe
    provides: the evidence-derived refusal vocabulary table (2026-08-22) the gates implement
  - phase: 05-03-device-identity
    provides: dev_+16-hex deviceSid fingerprint (the wrong_device_targeted compare's equivalence pin)
provides:
  - AutomationScope + three automation op kinds in patch.schema.json with D-05-14 bounds (≤64 points, 1..16 bars, 0..127 paramIndex, [0,1] values, single target by construction)
  - buildAutomationInverse(ops, priorValue) — the author-aware frozen inverse (D-05-07)
  - automationPreFlight named-refusal gate ladder (wrong_device_targeted, automation_write_disabled, ambiguous_target, automation_override_active) shared by both apply surfaces
  - prior_unavailable honesty gate + automationBinding journal stamping (deviceSid, paramIndex, paramSource, priorValue)
  - Automation ops classify medium risk (D-05-10) — confirmation gate covers automation exactly as notes
affects: [05-06-bridge-execution, 05-08-target-resolution, 05-10-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared pure gate helpers (automationPreFlight/automationApplyFields) exported from edit-service.ts and consumed by BOTH apply surfaces — one refusal vocabulary, no surface drift"
    - "Probe-supersedes-plan vocabulary: transport_stopped retired with a dated note in-code; the operative gate is write-arm (automation_write_disabled)"
    - "Prior honesty: refuse prior_unavailable and journal nothing when the bridge omits capturedPriorValue — never a guessed inverse"
    - "Legacy caveated-not-refused journal policy extended from clipSid to automationBinding (assumptions surfaced, recovery path preserved)"

key-files:
  created: []
  modified:
    - schemas/patch.schema.json
    - daemon/src/gen/patch.ts
    - daemon/src/patch/patch-schema.ts
    - daemon/src/patch/inverse-ops.ts
    - daemon/src/sessions/pi-tools.ts
    - daemon/src/patch/risk-classifier.ts
    - daemon/src/runtime/edit-service.ts
    - daemon/src/patch/patch-history.ts
    - daemon/src/query/query-server.ts

key-decisions:
  - "Write-arm is the operative pre-flight gate, not transport play state (2026-08-22 live probe supersedes the plan's transport-gate prose; transport_stopped retired in-code)"
  - "Unobserved write-arm fold treated as unarmed → automation_write_disabled (cannot confirm armed = refuse; never risk a silent envelope no-op)"
  - "Launcher-armed-only applies refuse ambiguous_target (launcher/clip lane UNVERIFIED live; D-05-06 probe-pins-refuse-rest)"
  - "automation_override_active implemented as a refusal per the plan truth; the 05-02 table marks it a consistency signal with precedence owned by 05-05"
  - "Peer-surface (query-server) apply/revert handlers extended with the same gate helpers — Rule 2: gates on only one surface would leave T-05-13/14 unmitigated"
  - "Automation revert entries carry no automationBinding (their prior would be the post-apply envelope value, which async readback says we do not hold)"

patterns-established:
  - "Named-refusal gate ladder order: identity → write-arm → lane → override → confirmation; every refusal carries details.hint"
  - "Scope discrimination at apply/revert entry points via isAutomationScope — clip paths byte-identical"

requirements-completed: [AUTO-03]

# Metrics
duration: 16min (Task 3 + closeout continuation session; Tasks 1–2 landed 2026-08-22 in a prior session)
completed: 2026-08-23
status: complete
---

# Phase 5 Plan 05: Automation Write Contract + Daemon Spine Summary

**Bounded single-parameter automation patches are first-class trust-spine citizens: schema-bounded (D-05-14), author-aware invertible (D-05-07), medium-risk confirmable (D-05-10), refused by name before any bridge round-trip per the 2026-08-22 live-probe vocabulary, and journaled with a frozen prior-value binding.**

## Performance

- **Duration:** Tasks 1–2 on 2026-08-22 (prior executor session); Task 3 + closeout 16 min on 2026-08-23 (continuation session)
- **Started:** 2026-08-22 (4d07942)
- **Completed:** 2026-08-23T14:49Z (a860212)
- **Tasks:** 3/3 (each TDD: RED + GREEN commits)
- **Files modified:** 12 source + test files (+ query-server.ts via deviation)

## Accomplishments
- **Patch contract (Task 1):** AutomationScope sibling + three op kinds in patch.schema.json; every D-05-14 bound schema-checkable (65 points / 17 bars / second target unrepresentable); scope↔op pairing in validatePatchOrThrow; cross-plan equivalence pin (deviceKey ≡ deviceSid) stated in-schema.
- **Author-aware inverse + Pi surface (Task 2):** buildAutomationInverse removes exactly the authored points and restores priorValue LAST; per-op inverseOp throws honestly for automation kinds; PREVIEW_EDIT_PARAMETERS widened (bounded, tool list still closed).
- **Risk + gates + journal (Task 3):** automation ops floor at medium by op kind (never self-declared); the named-refusal ladder fires from folded state before any bridge round-trip; prior_unavailable honesty; automationBinding stamped with the frozen inverse (INV-14); legacy entries caveated-not-refused; D-05-08 immediate dispatch (structural no-timer test).
- Full daemon suite green at every task boundary: 991/991 after Task 2, **1014/1014** after Task 3 (+23 tests).

## Task Commits

Each task was committed atomically (TDD: RED → GREEN per task):

1. **Task 1: patch.schema.json automation ops + AutomationScope + D-05-14 bounds + gen-types + scope↔op pairing** — `4d07942` (test/RED), `2986a4b` (feat/GREEN)
2. **Task 2: author-aware inverse + Pi tool surface extension (D-05-07)** — `ba529c5` (test/RED), `bdef50a` (feat/GREEN)
3. **Task 3: medium-risk classification + edit-service named-refusal gates + journal automationBinding (D-05-05/06/07/08/10)** — `b115eec` (test/RED), `a860212` (feat/GREEN)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `schemas/patch.schema.json` + `daemon/src/gen/patch.ts` — AutomationScope, three op $defs, D-05-14 bounds, equivalence pin, regenerated types (Tasks 1)
- `daemon/src/patch/patch-schema.ts` — scope↔op pairing rule + isAutomationScope export (Task 1)
- `daemon/src/patch/inverse-ops.ts` — AutomationOp union, buildAutomationInverse (Task 2)
- `daemon/src/sessions/pi-tools.ts` — PREVIEW_EDIT_PARAMETERS automation surface (Task 2)
- `daemon/src/patch/risk-classifier.ts` — automation→medium floor (Task 3)
- `daemon/src/runtime/edit-service.ts` — automationPreFlight + automationApplyFields exports, applyAutomation, revertAutomation (Task 3)
- `daemon/src/patch/patch-history.ts` — optional automationBinding field + caveated-legacy policy (Task 3)
- `daemon/src/query/query-server.ts` — peer-surface apply/revert symmetry (Task 3, Rule 2 deviation)

## Decisions Made
- **Write-arm gate, not transport** — implemented exactly per docs/bitwig-capabilities.md §3 (dated 2026-08-22): `automation_write_disabled` is the operative pre-flight; `transport_stopped` retired with an in-code dated note (armed+stopped writes points, latch; unarmed is a silent no-op at ANY transport state).
- **Unobserved write-arm = refuse** — when the fold has never delivered `automationWrite`, the daemon cannot confirm armed → `automation_write_disabled` with `writeArmState: "unobserved"` in details.
- **Transport-gate internal order pinned:** automation_write_disabled → ambiguous_target (launcher lane) → automation_override_active; identity gates precede all of them (plan Test 2's documented ladder).
- **Revert-side device compare** — automation entries compare scope.deviceSid vs live selection.deviceSid (mismatch refuses wrong_device_targeted; unverifiable or missing binding → caveated proceed, assumptions surfaced).
- **Revert entries omit automationBinding** — their true prior is the post-apply envelope value, which the probe's async-readback evidence says the daemon does not hold; a revert-of-the-revert walks the caveated path rather than a guessed prior.

## Deviations from Plan

### Documented deviation path (binding probe input)

**1. Vocabulary supersession — transport gate → write-arm gate**
- **Found during:** Task 3
- **Issue:** Plan prose anticipated `transport_stopped` when "automationWrite shows not playing"; the 05-02 live probe (docs §3, 2026-08-22) RETIRED transport as a gate — write-arm is operative.
- **Fix:** Gates keyed on `state.project.transport.automationWrite` arm booleans; `transport_stopped` appears in edit-service.ts only as the dated retirement note (satisfying the acceptance grep honestly). The launcher variant of clip-targeted refusal is `ambiguous_target` per the vocabulary table.
- **Files modified:** daemon/src/runtime/edit-service.ts, daemon/src/query/query-server.ts
- **Verification:** Tests 2–4 assert the write-arm vocabulary; full suite 1014/1014.
- **Committed in:** a860212

### Auto-fixed Issues

**2. [Rule 2 - Missing Critical] Peer-surface apply/revert path needed the same gates**
- **Found during:** Task 3 (edit-service gate implementation)
- **Issue:** query-server.ts hosts a SECOND live apply/revert path (the peer/CLI query surface) duplicating the clip gate ladder. Gates on only EditService would let automation candidates apply through the peer surface with no named refusals — T-05-13/14 mitigations incomplete.
- **Fix:** Extended query-server.ts handleEditApply/handleEditRevert with the SAME pure helpers (automationPreFlight, automationApplyFields) — lockstep vocabulary, prior freeze, automationBinding stamping, and revert device compare. File was not in the plan's task list.
- **Files modified:** daemon/src/query/query-server.ts (+108 lines)
- **Verification:** Full suite 1014/1014; targeted tsc confirms no new type errors in touched files; approval-store.ts + proposal-dispatch.ts untouched (RB-04 verified via git diff --stat across all plan commits).
- **Committed in:** a860212

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical) + 1 documented supersession path (instructed by the binding probe input)
**Impact on plan:** No scope creep — the query-server extension is the same trust-spine guarantee applied to the surface the plan's threat model already covers; the vocabulary supersession is the doc-mandated implementation.

## Issues Encountered
None — the plan's three tasks each landed as RED→GREEN pairs with the full suite green at every boundary (991/991 → 1014/1014). Deferred observations (preview diff is note-only; selection.deviceSid not yet folded by ingest; pre-existing tsc errors in untouched test files) are recorded in `deferred-items.md`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The daemon spine is complete for 05-06 (bridge execution): the apply path expects `capturedPriorValue` on automation bridge responses (prior_unavailable otherwise) and the bridge dispatches only on op discriminants.
- 05-08's target resolution relies on the in-schema deviceKey ≡ deviceSid equivalence pin (landed Task 1).
- selection.deviceSid must be folded from device.name_changed payloads (05-03 bridge already emits it) for wrong_device_targeted to compare live — until then applies fail closed as ambiguous_target (deferred-items.md).

## Self-Check: PASSED

- All 9 key modified files exist on disk (verified `[ -f ]`)
- All 6 task commits present in git log (4d07942, 2986a4b, ba529c5, bdef50a, b115eec, a860212)
- Acceptance greps: wrong_device_targeted=4, transport_stopped=1 (retirement note), ambiguous_target=4, prior_unavailable=3 in edit-service.ts; automationBinding=1 in patch-history.ts
- Full daemon suite 1014/1014 green after Task 3 GREEN
- RB-04: approval-store.ts + proposal-dispatch.ts untouched across 4d07942^..HEAD

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-23*
