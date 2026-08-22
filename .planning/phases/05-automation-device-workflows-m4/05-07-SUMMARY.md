---
phase: 05-automation-device-workflows-m4
plan: 07
subsystem: automation
tags: [bitwig, advisory, macros, xy-pair, salience, cli, vitest, ajv]

# Dependency graph
requires:
  - phase: 05-04
    provides: automation-salience analyzer, salience-snapshot store (D-05-04 freshness semantics), automation.inspect op, assembleDeviceReviewEvidence seam
provides:
  - Pure advisory macroSuggest transform (D-05-09 zero-mutation surface; evidence + assumptions + >=1 alternative per suggestion)
  - device.macros_suggest daemon op reusing the 05-04 snapshot freshness path (single source — loadSalienceForRead)
  - bw-device macros-suggest CLI subcommand (arrange.ts thin shell)
  - assembleDeviceReviewEvidence macros drawer field for 05-09
affects: [05-09 device-review peer path + drawer render, 05-10 end-of-phase UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Advisory transform returning {suggestions, manualHint} — the empty path stays honest (thin evidence names the hand-action, never a filler ranking)"
    - "Uniform shapeBias = literally no bias: ARCH-02 identity enforced by computing bias only when weights are non-uniform (assumption set reflects what was actually applied)"
    - "loadSalienceForRead: one shared snapshot-read/freshness helper serving multiple ops (refactor-over-fork — automation.inspect moved onto it in the same task)"
    - "Pairing yields to disambiguation: an XY pair is only emitted when a third candidate remains to name as the alternative (>=1 alternative outranks pairing, D-05-11 > D-05-12)"

key-files:
  created:
    - daemon/src/transforms/macro-suggest.ts
    - daemon/src/transforms/macro-suggest.test.ts
    - daemon/src/cli/commands/device.test.ts
  modified:
    - daemon/src/query/query-server.ts
    - schemas/cli-query/query.schema.json
    - daemon/src/gen/query.ts
    - daemon/src/cli/commands/device.ts
    - daemon/src/store/boundary.ts
    - daemon/src/cli/commands/automation.test.ts

key-decisions:
  - "macroSuggest returns {suggestions, manualHint} rather than a bare array — Test 9's honest-manualHint-bearing empty path lives on the transform, not just the op envelope"
  - "XY pairing requires >=3 ranked entries: a pair that would consume the whole list leaves no alternative candidate, and the >=1-alternative invariant (D-05-11) outranks pairing (D-05-12)"
  - "Uniform automationShapes weights = no bias applied and no bias ASSUMED claimed — generic-profile runs stay byte-identical to profileless runs (ARCH-02 literal)"
  - "Op profile resolved from the snapshot's own profile field (provenance honesty); unknown profile degrades to unbiased ordering with a logged warning, never a refusal"
  - "MEM-02 ALLOWED_QUERY_OPS extended in the same task — the boundary gate forces the read-only class of every new op to be explicit"

patterns-established:
  - "Advisory suggestion shape: {kind, params, evidence[], assumptions[], alternatives[], manualHint} — no patch keys anywhere, structurally asserted on module source + serialized wire"
  - "Shared snapshot-read helper ({refused:true}|{refused:false,snap}) so sibling ops reuse freshness semantics without forking"

requirements-completed: [AUTO-02]

# Metrics
duration: 10min
completed: 2026-08-22
status: complete
---

# Phase 5 Plan 07: Macro/XY Advisory Suggestions Summary

**Advisory macro/XY-pair suggestion engine over 05-04 salience evidence — pure macroSuggest transform (evidence + assumptions + ≥1 alternative per suggestion, D-05-11), XY v1 both-top-16/no-name-collision pairing (D-05-12), device.macros_suggest op reusing the 05-04 freshness path, and the bw-device macros-suggest thin shell (AUTO-02 complete, D-05-09 zero mutation surface)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-22T21:08:03Z
- **Completed:** 2026-08-22T21:18:32Z
- **Tasks:** 2
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments
- Pure advisory `macroSuggest(observations, ctx)` transform: ranked macro + XY suggestions from salience entries, every suggestion carrying an evidence line (identity/device/movementCount/role-energy context), non-empty assumptions[] (UX-06), ≥1 alternative (SC#2 disambiguation), and a hand-wiring manualHint
- `device.macros_suggest` daemon op + `bw-device macros-suggest` CLI subcommand — AUTO-02 end-to-end (evidence → advisory ranking → op → CLI), with the 05-04 snapshot freshness semantics extracted into `loadSalienceForRead` and REUSED (inspect refactored onto the same helper — single source, no fork)
- `assembleDeviceReviewEvidence` extended with the `macros` drawer field (defaults [], populated identically via `buildMacroSuggestions`) ready for 05-09's peer path

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1: macro-suggest pure advisory transform** - `a99f7a6` (test) + `c2ae596` (feat)
2. **Task 2: device.macros_suggest op + bw-device macros-suggest subcommand** - `144d65a` (test) + `95c7157` (feat)

## Files Created/Modified
- `daemon/src/transforms/macro-suggest.ts` - Pure advisory transform: ranking (salience desc, D-05-03 macro-first tie-break), XY v1 greedy pairing (both top-16, no name collision, maxXyPairs 2), topN cap (default 8), ARCH-02 shape-bias ordering (uniform = identity), pulledAt honesty suffix, thin-evidence honest refusal
- `daemon/src/transforms/macro-suggest.test.ts` - 13 tests: structural no-patch invariant (source + recursive serialized keys), D-05-11 evidence/alternatives/assumptions, SC#2 ranked-list, D-05-12 pairing rules + top-16 exclusion + name-collision, topN cap, ARCH-02 bias identity + techno shift, D-05-03 macro-first, thin-evidence refusal, pulledAt suffix
- `daemon/src/query/query-server.ts` - `loadSalienceForRead` shared helper (extracted from inspect's freshness ladder), `buildMacroSuggestions` (snapshot-profile provenance, unknown-profile degrade), `handleDeviceMacrosSuggest`, `assembleDeviceReviewEvidence` macros field, LIVE_OPS + dispatch arm
- `schemas/cli-query/query.schema.json` - op enum += device.macros_suggest + result-row description + $comment note
- `daemon/src/gen/query.ts` - regenerated from the schema (gen:types)
- `daemon/src/cli/commands/device.ts` - macros-suggest subcommand (arrange.ts thin shell: query, --refresh, --explain, printConnectionError); inspect untouched
- `daemon/src/store/boundary.ts` - MEM-02 ALLOWED_QUERY_OPS += device.macros_suggest (read-only advisory class)
- `daemon/src/cli/commands/device.test.ts` - Op tests 1-4 (snapshot serve, bootstrap, refusals, stale-but-readable, macros evidence field) + CLI tests 5-6 (thin shell, explain, disconnected envelope, inspect regression verbatim)
- `daemon/src/cli/commands/automation.test.ts` - 05-04's optional-absent macros assertion flipped to present-defaults-empty (the anticipated 05-07 extension landing)

## Decisions Made
- `macroSuggest` returns `{suggestions, manualHint}` instead of a bare `MacroSuggestion[]`: Test 9 requires the empty path to stay manualHint-bearing (honest refusal text naming the hand-action) — a bare array could not carry it; the op spreads both fields
- XY pairing requires ≥3 ranked entries and yields when no third candidate would remain: the ≥1-alternative invariant (D-05-11) structurally outranks pairing (D-05-12) — a pair that consumed the whole list would be a lone unexplained best target, exactly what SC#2 forbids
- Bias is computed only when shapeBias weights are non-uniform, and the assumption set reflects what was ACTUALLY applied (uniform weights → the no-bias "default"-source claim): claiming "biased by profile" under uniform weights would be a false claim and would break ARCH-02's profileless ≡ generic identity
- The op resolves the profile from the snapshot's own `profile` field (provenance honesty — the snapshot records which profile fed the ranking); an unknown name degrades to unbiased ordering with a logged error, never a refusal (ARCH-02 enhance-never-gate)
- MEM-02's `ALLOWED_QUERY_OPS` (production allowlist in boundary.ts) extended in the same task as the schema enum — the boundary gate exists precisely to force that decision to be explicit; device.macros_suggest is the same read-only class as automation.inspect (its --refresh shares the inspect refresh path, an atomic daemon-mediated durable write)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] MEM-02 boundary allowlist required the new op**
- **Found during:** Task 2 (full-suite verification)
- **Issue:** Adding `device.macros_suggest` to the schema enum tripped `checkMemoryBoundary` — the real-schema gate test failed because the production allowlist (`daemon/src/store/boundary.ts` `ALLOWED_QUERY_OPS`) does not admit the op by default
- **Fix:** Added `device.macros_suggest` to `ALLOWED_QUERY_OPS` with the read-only-class justification comment (the boundary.test.ts enum-sanity extension was already in the RED commit)
- **Files modified:** daemon/src/store/boundary.ts
- **Verification:** Full daemon suite 935/935 green including both boundary tests
- **Committed in:** 95c7157 (part of Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The boundary extension is the gate working as designed (an allowlist catches novel ops by default); no scope creep — the op is read-only advisory, MEM-02 holds.

## Issues Encountered
- GREEN iteration on Task 1: the first implementation claimed "ordering biased by profile" whenever automationShapes was present, which was factually false under uniform weights and broke the ARCH-02 identity test — fixed by computing bias (and its assumption) only for non-uniform weights before commit. No other issues; both TDD cycles went RED → GREEN cleanly.

## User Setup Required

None - no external service configuration required.

## Threat Model Disposition

- T-05-19 (advisory output smuggling mutation fields): mitigated — structural tests assert no `../patch/*` imports and no patchId/operations/risk keys recursively on the serialized surface (module + op wire)
- T-05-20 (movement-history disclosure): mitigated — evidence lines carry aggregate counts + bounded context strings only (snapshot discipline inherited)
- T-05-SC (package installs): accepted/avoided — zero new packages (no dependency changes in any commit)

## Next Phase Readiness
- AUTO-02 is code-complete end-to-end (salience evidence → advisory ranking → device.macros_suggest → bw-device macros-suggest); live-unverified until the 05-10 end-of-phase UAT (real knob turns → macros-suggest output), per the 05-03/05-04 live-verification discipline
- 05-09's device-review drawer can consume `assembleDeviceReviewEvidence` with `macros` populated via `buildMacroSuggestions` (the single source — drawer and CLI surfaces stay identical)
- Visual drawer verification deferred to 05-09/05-10 as planned

## Self-Check: PASSED

- Created files exist: daemon/src/transforms/macro-suggest.ts ✓, daemon/src/transforms/macro-suggest.test.ts ✓, daemon/src/cli/commands/device.test.ts ✓
- Commits exist: a99f7a6 ✓, c2ae596 ✓, 144d65a ✓, 95c7157 ✓ (git log --grep 05-07)
- Plan verification: npm --prefix daemon test → 935/935 tests, 75/75 files green
- Acceptance greps: device.macros_suggest in query-server.ts (7), query.schema.json (3), device.ts (1); macros field in assembleDeviceReviewEvidence return; grep '../patch/' macro-suggest.ts == 0

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-22*
