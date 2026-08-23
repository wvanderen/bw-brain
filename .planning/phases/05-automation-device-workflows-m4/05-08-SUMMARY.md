---
phase: 05-automation-device-workflows-m4
plan: 08
subsystem: automation
tags: [automation-curves, bitwig, patch-pipeline, fast-check, cli, candidate-store]

# Dependency graph
requires:
  - phase: 05-automation-device-workflows-m4/05-04
    provides: salience snapshot + loadSalienceForRead shared freshness path + automation.inspect
  - phase: 05-automation-device-workflows-m4/05-05
    provides: AutomationScope patch contract, scope↔op pairing, medium-risk automation classification, named-refusal gates, automationBinding journal
  - phase: 05-automation-device-workflows-m4/06 (05-06)
    provides: bridge ParameterWriter + applyOps automation dispatch + capturedPriorValue capture
provides:
  - curve-shapes pure transform (six D-05-13 shapes, D-05-14 hard bounds, property-tested)
  - automation.propose op (salience-designated target → bounded medium-risk candidate, construction only)
  - bw-automation propose CLI subcommand (AUTO-03 CLI surface complete: inspect + propose)
affects: [05-automation-device-workflows-m4/05-10, CLAP device-workspace drawer (05-09), future apply-path gap-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "refuse-not-clamp spec guards (CurveSpecError with field-naming messages → named refusals)"
    - "digest-sans-patchId (canonical sorted-key JSON sha256 — identical constructions digest identically, Pitfall 5)"
    - "region-relative point rebasing (buildCurve absolute beats → AutomationPoint region-relative beats)"

key-files:
  created:
    - daemon/src/transforms/curve-shapes.ts
    - daemon/src/transforms/curve-shapes.test.ts
  modified:
    - daemon/src/query/query-server.ts
    - schemas/cli-query/query.schema.json
    - daemon/src/cli/commands/automation.ts
    - daemon/src/cli/commands/automation.test.ts
    - daemon/src/store/boundary.ts
    - daemon/src/store/boundary.test.ts

key-decisions:
  - "transformIntent OMITTED from automation proposals — the Phase-3 enum is frozen this plan; audit metadata rides in rationale/undoLabel/curve block"
  - "reversibility declared manual-inverse with an author-aware-inverse assumption (capturedPriorValue journal, D-05-07) — not a structural self-inverse"
  - "Preview signal lives in the propose result (curve.points summary), not patch-resolve — previewPatch stays note-only for automation (deferred honestly)"
  - "AUTO-03 stays UNCHECKED (05-06's premature check reverted): code-complete end-to-end but live approve→apply→revert is 05-10 UAT — the 05-03/05-04/05-09 discipline"
  - "MEM-02 boundary allowlist extended with automation.propose (same ephemeral-candidate class as midi.vary)"

patterns-established:
  - "Mint-path preamble analog: watchdog gate → candidateStore gate → loadSalienceForRead shared evidence read (no forked freshness semantics)"
  - "Honest-absence unobserved-target assumption (T-05-23): explicit fallback discloses absence, never synthesizes evidence"

requirements-completed: []  # AUTO-03 code-complete but deliberately unchecked pending 05-10 live UAT (see Decisions)

# Metrics
duration: 18 min
completed: 2026-08-23
status: complete
---

# Phase 5 Plan 08: Curve Shapes + automation.propose Summary

**Six bounded musical automation shapes (property-tested pure transform) + the automation.propose op and bw-automation propose CLI minting salience-grounded medium-risk candidates through the untouched existing authority spine (AUTO-03 end-to-end in code)**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-23T15:36:28Z
- **Completed:** 2026-08-23T15:54:35Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- `curve-shapes.ts` — the D-05-13 six-shape vocabulary (ramp up/down eased, dip_recover cosine single dip, rise_fall sine arch, slow_cycle sine at rate·lengthBars periods, hold_then_move half-hold then eased move) under the D-05-14 hard bounds: ≤ 64 points, region ≤ 16 bars, values ∈ [0,1]; refuse-not-clamp `CurveSpecError` guards on every bound; `defaultShapeOrder(profile)` with ARCH-02 literal-default for absent/uniform bias
- `automation.propose` op — designates a target from the salience list via the 05-05 equivalence pin (deviceKey ≡ deviceSid, source ≔ paramSource) or an explicit unobserved browsable fallback (honest-absence assumption); evidence flows into rationale + assumptions (D-05-15); beatsPerBar from project timeSignature (D-05-16); buildCurve → patch assembly (AutomationScope + automation_points, mandatory undoLabel, manual-inverse + author-aware-inverse disclosure) → validatePatchOrThrow → classifyRisk (medium, D-05-10) → candidateStore.mint; sha256 digest sans patchId; named refusals throughout (state_disconnected / not_implemented / invalid_query / unknown_param / no_snapshot / invalid_curve_spec / invalid_patch / snapshot_invalid)
- `bw-automation propose` — thin-shell CLI with shape/depth/rate/length-bars/start-bar overrides, explicit-fallback flags, `printResultOrDisconnect` for named refusals, and `--help` documenting the bw-edit `apply <patchId> --confirm` preview→confirm→revert flow (construction, not authority — RB-04)
- Quiet-start verified structurally: no publish/approval/scheduler code on the propose path; approval/apply/revert ride the existing spine with approval-store.ts / proposal-dispatch.ts / edit-service.ts untouched (verified via git diff vs plan baseline)

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1: curve-shapes pure transform** — RED `4bb233d` (test) → GREEN `7a15345` (feat) — 20/20 tests
2. **Task 2: automation.propose op + CLI** — RED `0b38dc2` (test) → GREEN `854038a` (feat) — 30/30 automation tests, 1047/1047 full suite

**Plan metadata:** (this commit)

## Files Created/Modified
- `daemon/src/transforms/curve-shapes.ts` — created: six shape generators + CurveSpec + CurveSpecError + defaultShapeOrder (pure)
- `daemon/src/transforms/curve-shapes.test.ts` — created: numRuns-500 property + characterization + bounds-refusal + purity structural tests
- `daemon/src/query/query-server.ts` — automation.propose dispatch + handleAutomationPropose + beatsPerBarFromTimeSig + canonicalJson digest + parseExplicitTarget
- `schemas/cli-query/query.schema.json` — op enum += automation.propose + result-row description
- `daemon/src/cli/commands/automation.ts` — propose subcommand + printResultOrDisconnect + preview/apply flow help
- `daemon/src/cli/commands/automation.test.ts` — Tests 1-8 + refusal ladder + digest stability + CLI contract
- `daemon/src/store/boundary.ts` — MEM-02 allowlist += automation.propose (Rule 3 deviation)
- `daemon/src/store/boundary.test.ts` — expected enum extended

## Decisions Made
- **transformIntent omitted** from the assembled patch: the schema's name enum is the frozen Phase-3 catalog (vary/counterline/voice-leading-fix/humanize/manual) and this plan freezes patch.schema.json; shape/depth/rate/profile ride in the rationale + undoLabel + the propose result's curve block (the bridge never reads transformIntent — Pitfall 7)
- **reversibility = "manual-inverse"** with an explicit author-aware-inverse assumption: automation revert replays the bridge-captured prior value from the journal (D-05-07 automationBinding), which is not a structural self-inverse
- **Preview = the propose result's curve.points summary** (pointCount/valueMin/valueMax/beatSpanBeats + points) rather than extending patch-resolve.ts — outside this plan's file list; the edit.preview note-only gap for automation ops remains documented in deferred-items
- **Default curve params from profile midpoints**: depth = depthRange midpoint (0.5 generic), rate = rateRange midpoint, shape = defaultShapeOrder(profile)[0] — ARCH-02 enhance-never-gate; unbiased literal defaults profileless
- **AUTO-03 left unchecked** — 05-06's premature check reverted; code-complete end-to-end (propose → preview → confirm → apply → journal/revert paths all live) but live Bitwig exercise is 05-10 UAT per the plan's own verification block

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] MEM-02 boundary allowlist + test extended with automation.propose**
- **Found during:** Task 2 (schema enum extension)
- **Issue:** Adding automation.propose to query.schema.json's op enum trips the store/boundary.ts ALLOWED_QUERY_OPS gate (structural test pins the enum to the allowlist) — boundary.ts was not in the plan's file list
- **Fix:** Allowlisted automation.propose as the same daemon-mediated ephemeral-candidate class as midi.vary (no durable write until the existing edit.apply spine runs); extended the pinned expected-enum test
- **Files modified:** daemon/src/store/boundary.ts, daemon/src/store/boundary.test.ts
- **Verification:** full suite 1047/1047 (boundary tests green)
- **Committed in:** 854038a (Task 2 GREEN)

**2. [Rule 1 - Bug] Test-harness fixes during GREEN**
- **Found during:** Task 2 (RED→GREEN iteration)
- **Issue:** (a) fast-check 4.x rejects 0.001 as a 32-bit float bound (Task 1 arb); (b) structural no-publish regex matched my own comment prose ("proposal.publish"); (c) Test 3 validated the stored candidate envelope (Patch + previewClipSid stamp) directly against additionalProperties:false
- **Fix:** (a) exact power-of-two bound 1/1024; (b) reworded the comment to prose without the dotted call form; (c) validate the Patch portion after destructuring the D-04 mint stamp
- **Files modified:** curve-shapes.test.ts, query-server.ts (comment), automation.test.ts
- **Verification:** 30/30 automation tests, 1047/1047 full suite
- **Committed in:** 7a15345 / 854038a

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 1 test-harness)
**Impact on plan:** Both necessary for the op to ship behind the existing gates. No scope creep — boundary.ts extension is the mechanically required companion of the schema enum the plan itself mandates.

## Issues Encountered
- The explicit-target branch initially used `var snap` across branches — refactored to a single `let snap` declaration before first run (caught during implementation, never committed broken)
- Pre-existing tsc errors in unrelated files (edit.test.ts, midi.test.ts, arb.ts, profile-loader.ts, boot.test.ts, project-session-manager.test.ts, energy-curve.test.ts) — out of scope; verified all 05-08-touched files are type-clean via targeted tsc filtering

## User Setup Required
None - no external service configuration required.

## Threat Surface

All three mitigations from the plan's threat register implemented and test-pinned:
- **T-05-21 (bounds tampering):** handler-side target/curve validation + buildCurve refuse-not-clamp + validatePatchOrThrow before mint (Test 4 + refusal ladder)
- **T-05-22 (propose→apply without confirmation):** construction-only op; medium risk confirmed by classifyRisk assertion; apply confirmation lives in the untouched spine (structural quiet-start test)
- **T-05-23 (fabricated evidence):** unobserved fallback carries the honest-absence assumption; rationale matched /unobserved/i (Test 2)

## Known Stubs
None - every surfaced field is wired to real construction. (Deferred gaps — apply-wire scope threading and patch-resolve automation diffs — are logged in the phase deferred-items.md, not stubs in this plan's code.)

## Next Phase Readiness
- AUTO-03 complete in code end-to-end: curve-shapes (property-tested) + propose op + CLI; the CLAP drawer (05-09) can now back its "inspectable bounded automation proposals" with real candidates
- 05-10 UAT owns: live knob-turn → inspect → propose → approve → apply → revert against real Bitwig; it will also trip the deferred apply-wire scope threading (boot.ts applyPatchOverBridge must send payload.scope — bridge half forward-compatible)
- Remaining phase plans: 05-10 (end-of-phase UAT)

## Self-Check: PASSED

All 8 created/modified files exist on disk; all 4 task commits (4bb233d, 7a15345, 0b38dc2, 854038a) verified in git log; plan-level verification re-run green (full daemon suite 1047/1047).
