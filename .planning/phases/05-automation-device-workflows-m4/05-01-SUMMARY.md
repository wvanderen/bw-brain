---
phase: 05-automation-device-workflows-m4
plan: 01
subsystem: protocol
tags: [json-schema, ajv, event-folding, bounded-aggregates, genre-profiles, bitwig]

# Dependency graph
requires:
  - phase: 02-read-only-context-foundation-m1
    provides: 5-event observational protocol set, Ajv-at-boundary reader, fold-event ingest spine
  - phase: 03.1-gap-closure-clip-identity-scope-apply-pre-flight-bridge-auto
    provides: dispatcher event-switch + fold timestamp plumbing extended here
provides:
  - parameter.changed protocol event type + payload contract (AUTO-01 observation spine)
  - get.project_meta request enum member (D-05-16)
  - transport.changed automationWrite payload (D-05-05 refusal vocabulary carrier)
  - bounded per-parameter movement-aggregate fold (512-cap, epsilon 1e-4) in state.parameters
  - optional profile automationShapes bias field with neutral-generic + biased-techno examples
affects: [05-03 bridge emitter wave, 05-05 patch schema + refusal gate, 05-08 curve generation, 05-automation salience analyzer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema-first enum extension: event.schema.json enum + reader OBSERVATIONAL_EVENT_TYPES + dispatcher case + fold branch land in ONE commit (Pitfall 1 equality contract)"
    - "Bounded aggregate fold: composite-key map, scalar-only entries, hard cap with lowest-lastMovedAt eviction — never an event log (Pitfall 5 / T-05-01/03)"
    - "ARCH-02 optional bias field: schema-optional, required-when-present, consumer defaults via ?? DEFAULT, loader never injects"

key-files:
  created:
    - daemon/src/profiles/profile-schema.test.ts
  modified:
    - schemas/protocol/event.schema.json
    - schemas/protocol/request.schema.json
    - schemas/project-state.schema.json
    - schemas/profile.schema.json
    - daemon/src/protocol/reader.ts
    - daemon/src/runtime/dispatcher.ts
    - daemon/src/ingest/fold-event.ts
    - daemon/src/profiles/generic.json
    - daemon/src/profiles/techno.json
    - daemon/src/gen/event.ts
    - daemon/src/gen/request.ts
    - daemon/src/gen/envelope.ts
    - daemon/src/gen/project-state.ts
    - daemon/src/gen/profile.ts

key-decisions:
  - "parameter aggregates keyed by composite `deviceKey:source:paramIndex`; first observation counts movementCount 0 (no prior to differ from); a movement = delta > 1e-4; lastMovedAt advances only on movement and drives lowest-lastMovedAt eviction"
  - "transport.changed now folds playing AND/OR automationWrite independently (write-state observers fire without play changes); malformed automationWrite is a defensive no-op"
  - "generic.json ships a NEUTRAL automationShapes block — mirroring the energyWeights presence precedent (present in both shipped profiles) while schema optionality keeps absence valid (absent-safe proven by synthetic-profile test)"
  - "fold signature gained optional `timestamp` (dispatcher passes envelope.timestamp) — the aggregates' lastMovedAt clock; no other call-site changes"

patterns-established:
  - "Pitfall 1 extension protocol now proven twice: schema enum + reader set + dispatcher switch + fold branch in one atomic commit"
  - "Daemon-folded RawState fields get matching project-state.schema.json properties in the same commit (schema's 'every RawState is valid' contract)"

requirements-completed: [AUTO-01, AUTO-04]

# Metrics
duration: 10min
completed: 2026-08-22
status: complete
---

# Phase 5 Plan 1: Protocol & Profile Schema Extensions (ahead-of-emitter) Summary

**parameter.changed event + get.project_meta request + transport automationWrite payload land in the frozen protocol schemas, the daemon folds parameter movement into 512-capped per-param aggregates, and the optional profile automationShapes bias field ships neutral-generic + biased-techno**

## Performance

- **Duration:** ~10 min (TDD: 2 tasks × RED→GREEN)
- **Started:** 2026-08-22T20:14:39Z
- **Completed:** 2026-08-22T20:24:07Z
- **Tasks:** 2
- **Files modified:** 16 (10 production + 5 regen + 1 new test file; plus 2 existing test files extended)

## Accomplishments
- Protocol contracts accept the Phase 5 bridge surface BEFORE any emitter change (schema-first, Pitfall 8): the daemon's Ajv-boundary reader would reject parameter.changed / get.project_meta lines without this plan — 05-03's bridge wave is unblocked
- parameter.changed folds into bounded per-parameter movement aggregates (movementCount with 1e-4 epsilon, lastValue/min/max, lastMovedAt) — never an event log; 512-entry cap with lowest-lastMovedAt eviction (D-05-01/D-05-02, T-05-01/02/03 mitigations)
- transport.changed carries the D-05-05 refusal vocabulary (automationWrite: arranger/launcher write, overrideActive, writeMode latch|touch|write) and folds verbatim — the 05-05 refusal gate now has its state vocabulary
- Optional profile automationShapes bias field (ARCH-02 enhance-never-gate): schema-optional with exactly-six shapeBias keys, neutral block in generic, slow_cycle/rise_fall bias in techno
- Pitfall 1 equality contract extended in lockstep: schema enum ↔ OBSERVATIONAL_EVENT_TYPES ↔ dispatcher switch ↔ fold branch all in the GREEN commit, equality tests green

## Task Commits

Each task was committed atomically (TDD):

1. **Task 1: Protocol schemas — parameter.changed, get.project_meta, transport automation-write** — RED `479db57` (test) → GREEN `4164296` (feat)
2. **Task 2: Profile automationShapes bias field + profile JSONs** — RED `b320454` (test) → GREEN `663f5ff` (feat)

## Files Created/Modified
- `schemas/protocol/event.schema.json` — parameter.changed enum member + payload fields (deviceKey/paramIndex/paramName?/source/value [0,1]) + transport.changed automationWrite object
- `schemas/protocol/request.schema.json` — get.project_meta enum member (D-05-16)
- `schemas/project-state.schema.json` — additive parameters bounded-aggregate map (maxProperties 512) + transport.automationWrite (fold output stays schema-valid)
- `schemas/profile.schema.json` — optional automationShapes {shapeBias, depthRange, rateRange} copying the energyWeights pattern
- `daemon/src/protocol/reader.ts` — OBSERVATIONAL_EVENT_TYPES += parameter.changed
- `daemon/src/runtime/dispatcher.ts` — parameter.changed case + envelope timestamp pass-through
- `daemon/src/ingest/fold-event.ts` — parameter.changed aggregate fold branch + transport automationWrite passthrough (+ MOVEMENT_EPSILON/PARAM_AGGREGATE_CAP exports)
- `daemon/src/profiles/generic.json` / `techno.json` — neutral / biased automationShapes blocks
- `daemon/src/gen/{event,request,envelope,project-state,profile}.ts` — regenerated types
- `daemon/src/ingest/fold-event.test.ts`, `daemon/src/protocol/schemas.test.ts` — extended; `daemon/src/profiles/profile-schema.test.ts` — new

## Decisions Made
- **Aggregate semantics:** first observation of a param creates the entry with movementCount 0 (no prior value to differ from); a movement counts only when delta > 1e-4; lastMovedAt advances only on movement, making eviction "stalest first"
- **generic.json presence:** the plan's "mirror the energyWeights presence precedent" was resolved against the actual files — energyWeights ships in BOTH generic and techno, so generic carries a NEUTRAL automationShapes (uniform bias 1.0, full ranges); ARCH-02 absence-safety remains a schema-level guarantee (proven by the synthetic no-field profile test) and consumers default via `ctx.profile?.automationShapes ?? DEFAULT` (05-08)
- **depthRange/rateRange min≤max ordering:** documented in the schema description, NOT enforced (Ajv 2020-12 lacks cross-item constraints — same stance as the energyWeights sum=1.0 precedent); rate units = cycles/bar
- **patch.schema.json untouched** (05-05 owns the automation-op extension — schema-accepts-but-runtime-refuses interim state avoided, per the plan's scoping note)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] project-state.schema.json additive extension (parameters map + transport.automationWrite)**
- **Found during:** Task 1 (parameter.changed fold)
- **Issue:** The plan's artifact requires the fold to maintain `state.parameters` and `transport.automationWrite`, but RawState = generated ProjectState (additionalProperties: false, no such fields) — the fold could not typecheck and the schema's own contract ("every RawState the daemon holds is valid against this schema") would be violated
- **Fix:** Added the optional top-level `parameters` bounded map (maxProperties 512 mirroring the fold cap, scalar-only aggregate entries) and `transport.automationWrite` to project-state.schema.json; regenerated gen/project-state.ts in the same commit
- **Files modified:** schemas/project-state.schema.json, daemon/src/gen/project-state.ts
- **Verification:** full daemon suite green (843 → 859 tests); snapshots without the fields stay valid (fields optional)
- **Committed in:** 4164296 (Task 1 GREEN)

**2. [Rule 3 - Blocking] dispatcher.ts parameter.changed case + timestamp pass-through**
- **Found during:** Task 1 (reader/fold wiring)
- **Issue:** The dispatcher switch enumerates event types (lines 111-114) — without a `case "parameter.changed"` the dispatcher would log "unknown envelope type" and DROP the event before the fold ever runs (Pitfall 1's sibling, not covered by the schemas.test.ts equality gate); additionally the fold needs the envelope's timestamp as the lastMovedAt clock
- **Fix:** Added the case; handleEvent now passes envelope.timestamp through to foldEvent (signature gained optional timestamp)
- **Files modified:** daemon/src/runtime/dispatcher.ts, daemon/src/ingest/fold-event.ts
- **Verification:** dispatcher unaffected paths covered by existing boot/dispatcher tests; full suite green
- **Committed in:** 4164296 (Task 1 GREEN)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes are required for the plan's own artifacts to function (the fold must be reachable and its output schema-valid). Purely additive; no scope creep.

## Issues Encountered
None - both tasks landed clean RED→GREEN on the first implementation pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 05-03 (bridge emitter wave) can emit parameter.changed / handle get.project_meta without daemon rejection — the protocol surface is frozen and test-pinned
- 05-02+ salience analyzers consume `state.parameters` aggregates (bounded, movement-semantic)
- 05-05 refusal gate consumes `state.project.transport.automationWrite` (D-05-05 vocabulary: transport_stopped / automation_write_disabled / automation_override_active)
- 05-08 curve generation consumes `ctx.profile?.automationShapes ?? DEFAULT` with the six-shape vocabulary pinned in the schema

## Self-Check: PASSED

All key-files exist on disk; all 4 task commits verified in git log; full daemon suite green (69 files / 859 tests); gen-types idempotent (re-run produces no diff).

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-22*
