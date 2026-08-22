---
phase: 05-automation-device-workflows-m4
plan: 04
subsystem: automation-analytics
tags: [salience, analyzer, snapshot, ajv, cli, automation, bitwig]

# Dependency graph
requires:
  - phase: 05-01
    provides: parameter.changed protocol event + bounded per-param movement fold (state.parameters, 512-cap)
  - phase: 05-03
    provides: bridge parameter observers emitting deviceKey/source, deviceSid dev_ fingerprint, get.project_meta
provides:
  - AutomationSalience analyzer (M4_ANALYZERS) — pure ranked per-parameter salience from observed movement + role/energy priors
  - salience-snapshot.ts durable store (04.3 invariants: ENOENT→null, throw-with-path, validate-before-persist, bounded ≤512)
  - automation.inspect daemon op + refreshSalienceSnapshot + assembleDeviceReviewEvidence (05-09 peer seam; snapshot_invalid union)
  - live bw-automation inspect CLI (stub retired)
affects: [05-05, 05-07, 05-08, 05-09, 05-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pseudo-RawState analysis sidecar (automationPriors) — energy-curve raw.tracks open-typed defensive-read precedent"
    - "snapshot store clone discipline (arrangement-snapshot → roles-store → salience-snapshot)"
    - "MEM-02 op allowlist extension (arrange.refresh durable-write class)"

key-files:
  created:
    - daemon/src/transforms/automation-salience.ts
    - daemon/src/transforms/automation-salience.test.ts
    - daemon/src/state/salience-snapshot.ts
    - daemon/src/state/salience-snapshot.test.ts
    - daemon/src/cli/commands/automation.test.ts
  modified:
    - daemon/src/state/analyzer-registry.ts
    - daemon/src/query/query-server.ts
    - schemas/cli-query/query.schema.json
    - daemon/src/gen/query.ts
    - daemon/src/cli/commands/automation.ts
    - daemon/src/cli/cli.test.ts
    - daemon/src/store/boundary.ts
    - daemon/src/store/boundary.test.ts
    - daemon/src/runtime/boot.ts
    - daemon/src/state/analyzer-registry.test.ts

key-decisions:
  - "Salience log-count normalized against the 512 fold cap — plan sketch constants saturated and broke the pinned macro-first test (A8 tunable, structure kept)"
  - "Priors via the documented automationPriors sidecar: roles.json role confidence + arrangement energyCurve mean (honest proxy — fold has no per-section spread)"
  - "AUTO-01 stays unchecked until 05-10 live UAT (code-complete end-to-end; 05-03 precedent)"
  - "Single snapshot tracks[] entry keyed by selection-at-refresh trackSid; arrange keeps M3 byte-identical"

patterns-established:
  - "Ranked-list read surface: flat params[] sorted salience desc (SC#2 — never a single best param)"
  - "Connected-bootstrap refresh: missing snapshot + connected → analyze + persist (subsequent disconnected reads are stale-but-readable)"

requirements-completed: []  # AUTO-01 code-complete; live UAT pending 05-10 (05-03 precedent)

# Metrics
duration: 14min
completed: 2026-08-22
status: complete
---

# Phase 5 Plan 04: Automation Salience Analyzer, Snapshot & inspect CLI Summary

**AUTO-01 end-to-end in code: a pure macro-first salience analyzer over the 05-01/05-03 observed-movement fold (roles/energy priors via a documented sidecar), persisted through the 04.3-hardened snapshot pattern (freshness + pulledAt + snapshot_invalid), served by the new automation.inspect op and the now-live bw-automation inspect CLI.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-22T20:51:46Z
- **Completed:** 2026-08-22T21:06:34Z
- **Tasks:** 3 (all TDD: test→feat pairs)
- **Files modified:** 15 (6 created + 9 modified, excl. SUMMARY)

## Accomplishments
- Pure `automationSalience(obs, priors)` scoring + `AutomationSalience` Analyzer (refuse-on-empty, assumptions[] citing config/default prior sources) registered as `M4_ANALYZERS` (M3 + exactly one addition)
- `salience-snapshot.ts` store cloning all four arrangement-snapshot invariants + bounded aggregates only (≤512 params, no event streams — T-05-09/10/11 mitigations implemented as planned)
- `refreshSalienceSnapshot` (refuse-empty-up-front, schema-gated save) + `assembleDeviceReviewEvidence` (refusal|no-snapshot|evidence union with snapshot_invalid — the 05-09 peer seam) + `automation.inspect` op with full D-05-04 freshness semantics
- `bw-automation` stub retired: live inspect thin shell (query/--refresh/--explain/printConnectionError); MEM-02 allowlist + boot wiring keep the trust spine and production path intact

## Task Commits

Each task was committed atomically (TDD pairs):

1. **Task 1: automation-salience pure transform + M4 registration** — `8916ab0` (test) + `967d3cd` (feat)
2. **Task 2: salience-snapshot store (D-05-04 clone)** — `cff475d` (test) + `e8d0e06` (feat)
3. **Task 3: automation.inspect op + refresh + evidence + CLI** — `616203e` (test) + `06da06b` (feat)

**Plan metadata:** this commit (docs)

## Files Created/Modified
- `daemon/src/transforms/automation-salience.ts` — pure score fn + ranker + Analyzer plugin (macro-first D-05-03, priors sidecar, refuse-on-empty)
- `daemon/src/transforms/automation-salience.test.ts` — behavior tests 1-6 incl. two fast-check properties + structural purity
- `daemon/src/state/salience-snapshot.ts` — inline Ajv2020 schema, load/save with all four 04.3 invariants
- `daemon/src/state/salience-snapshot.test.ts` — 13 store tests (incl. 513-param cap + no-format-keywords)
- `daemon/src/state/analyzer-registry.ts` (+ test) — M4_ANALYZERS spread, AUTO-01 comment
- `daemon/src/query/query-server.ts` — refreshSalienceSnapshot, resolveSaliencePriors, assembleDeviceReviewEvidence, handleAutomationInspect, dispatch + LIVE_OPS
- `schemas/cli-query/query.schema.json` (+ `daemon/src/gen/query.ts` regen) — op enum += automation.inspect
- `daemon/src/cli/commands/automation.ts` (+ new automation.test.ts) — live inspect shell + 17 contract/behavior tests
- `daemon/src/cli/cli.test.ts` — stub test updated to live multicall contract
- `daemon/src/store/boundary.ts` (+ test) — MEM-02 allowlist += automation.inspect
- `daemon/src/runtime/boot.ts` — DEFAULT_SALIENCE_SNAPSHOT_PATH + BootOptions + query-server dep wiring

## Decisions Made
- Formula normalization (see Deviation 1): log1p(count)/log1p(512) keeps every base ∈ [0,1] pre-multiplier so macro-first ordering survives at every evidence level; weights (0.6+0.4L macro; 0.4L+0.35R+0.25V device) are the A8 tunable knobs
- Prior channel: `automationPriors` sidecar on the pseudo-RawState the refresh builds — the codebase's documented open-typed defensive-read pattern (energy-curve raw.tracks); roleSalience = roles.json classified-track role confidence; energyAtMovement = mean of derived energyCurve (fold stores no per-section movement spread — honest available signal, disclosed in assumptions)
- Snapshot attribution: one tracks[] entry keyed by the selection-at-refresh trackSid ("unknown" when unattributed) — the fold keys params by device, not track; disclosed via assumptions
- arrange.* surfaces keep running M3_ANALYZERS (byte-identical wire payloads); the salience refresh invokes AutomationSalience directly
- Connected inspect with no snapshot bootstraps (analyze + persist) so later disconnected reads are stale-but-readable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Salience formula constants saturated, breaking the plan's own pinned Test 1**
- **Found during:** Task 1 (RED phase analysis)
- **Issue:** The plan's literal sketch (`base_macro = 1.0 + 0.5·log1p(mc)`, `base_device = 0.4·log1p(mc) + …`) both exceed 1.0 at movementCount ≈ 20 (log1p(20) ≈ 3.04), so after the mandatory [0,1] clamp (Test 6) a macro knob and a device param TIE at 1.0 — Test 1 (macro strictly outscores device at count 20) is unsatisfiable as written
- **Fix:** Normalized the log term against the 05-01 fold cap (L = log1p(mc)/log1p(512) ∈ [0,1]) with rebalanced weights (macro 0.6+0.4L; device 0.4L+0.35R+0.25V). Structure preserved exactly: macro boost + log-scaled count + value range + variance proxy + prior multiplier (absent → 0.5) + clamp + toFixed(3). Header documents the deviation + A8 tunability
- **Files modified:** daemon/src/transforms/automation-salience.ts
- **Verification:** Tests 1-6 green incl. both fast-check properties (macro-first asserted explicitly at count 20)
- **Committed in:** 967d3cd

**2. [Rule 2 - Missing critical] boot.ts wiring for salienceSnapshotPath**
- **Found during:** Task 3
- **Issue:** The plan's files_modified omitted boot.ts, leaving `deps.salienceSnapshotPath` unwired — automation.inspect would return not_implemented in production, contradicting the plan's "AUTO-01 complete end-to-end" done-criterion
- **Fix:** Added DEFAULT_SALIENCE_SNAPSHOT_PATH (.bw-brain/salience-snapshot.json), a BootOptions field, and the startQueryServer dep (arrangementSnapshotPath precedent)
- **Files modified:** daemon/src/runtime/boot.ts
- **Verification:** Full daemon suite green (boot tests + 910/910)
- **Committed in:** 06da06b

**3. [Rule 1 - Bug] cli.test.ts pinned the removed bw-automation stub**
- **Found during:** Task 3 (full-suite run)
- **Issue:** "bw-automation → not_implemented JSON, availableFrom M4, exit 0" asserted the stub behavior this plan removes
- **Fix:** Replaced with the live no-subcommand help contract (bw-arrange precedent: exit 1, help mentions inspect + salience); header comment updated
- **Files modified:** daemon/src/cli/cli.test.ts
- **Verification:** cli.test.ts green
- **Committed in:** 06da06b

**4. [Rule 3 - Blocking] MEM-02 boundary allowlist rejected the new op**
- **Found during:** Task 3 (full-suite run)
- **Issue:** daemon/src/store/boundary.ts pins the cli-query op enum (allowlist gate); automation.inspect failed "no ephemeral-write op"
- **Fix:** Allowlisted automation.inspect with the arrange.refresh rationale (atomic daemon-mediated durable snapshot write — no CLI-side ephemeral write; MEM-02 holds); boundary.test.ts enum expectation updated
- **Files modified:** daemon/src/store/boundary.ts, daemon/src/store/boundary.test.ts
- **Verification:** boundary tests green; full suite 910/910
- **Committed in:** 06da06b

---

**Total deviations:** 4 auto-fixed (1 missing critical, 2 bugs, 1 blocking)
**Impact on plan:** All fixes necessary for the plan's own pinned tests and end-to-end claim. No scope creep — boot/boundary/cli-test touches are the minimal seams every new op already touches.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Threat Surface (T-05-09/10/11 mitigations)
All three salience threat-register rows implemented as planned: validate-before-load/persist with snapshot_invalid refusal + bounded ≤512 (T-05-09/11, tested), aggregates-only snapshot with additionalProperties:false refusing event-stream shapes (T-05-10, tested). Zero new packages (T-05-SC). No new security surface beyond the plan's threat model.

## Next Phase Readiness
- 05-05 (scope/targeting) can consume RankedSalienceParam + the fold's deviceKey (= deviceSid) identity chain
- 05-07 extends assembleDeviceReviewEvidence with macros (structurally optional + absent-tolerant test already pins the seam)
- 05-08 curve consumers get M4_ANALYZERS + the pure salience fns
- 05-09 action-dispatch consumes assembleDeviceReviewEvidence via boot injection (snapshot_invalid union ready)
- 05-10 live UAT: real knob turns → bw-automation inspect ranking (AUTO-01 acceptance; deferred manual smoke per plan)

## Self-Check: PASSED

All 6 created files exist on disk; all 6 task commits (3 TDD pairs) verified in git log; full daemon suite 73 files / 910 tests green; gen-types regen additive (gen/query.ts only); acceptance greps from all three tasks re-run and passing.

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-22*
