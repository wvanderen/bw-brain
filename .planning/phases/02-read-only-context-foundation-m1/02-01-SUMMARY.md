---
phase: 02-read-only-context-foundation-m1
plan: 01
subsystem: api
tags: [json-schema, json-schema-2020-12, ajv, codegen, wire-contract, bitwig-bridge, cli-query, backpressure]

# Dependency graph
requires:
  - phase: 01-schema-ipc-spike
    provides: "The 6 frozen protocol schemas (envelope/event/request/response/edit/handshake), the Ajv 2020-12 compile-once reader spine, the $id-aware gen-types.mjs codegen, the OBSERVATIONAL_EVENT_TYPES backpressure classifier"
provides:
  - "schemas/project-state.schema.json — STATE-01 raw project-state contract (the daemon's RawState shape; Plans 03/04 normalize/query against it)"
  - "schemas/intent.schema.json — STATE-03 user-authored projectIntent contract (summary/constraints/targets)"
  - "schemas/cli-query/query.schema.json — D-07 daemon-local CLI query op+payload contract (6 ops)"
  - "schemas/cli-query/result.schema.json — D-07 daemon-local CLI result contract (stateFreshness required, assumptions[] plumbing, ok:false not_implemented arm)"
  - "Extended event.schema.json type enum (5 observational events) for the Plan 02 bridge to emit"
  - "Extended request.schema.json type enum (3 get.* requests) for the Plan 02 bridge pull handlers"
  - "Multi-dir gen-types.mjs (scans protocol/ + schemas/ + cli-query/) — the codegen every later schema drop reuses"
  - "Pitfall-1 equality gate unit test (reader OBSERVATIONAL_EVENT_TYPES === event enum) — build fails on drift"
affects: [02-02, 02-03a, 02-03b, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional-shape allOf if/then on result.schema.json mirrors handshake.schema.json — ok:false requires error+availableFrom AND forbids payload (trust-spine at schema level)"
    - "Pitfall-1 equality gate: a unit test asserts a runtime set (OBSERVATIONAL_EVENT_TYPES) equals a schema enum, so the build fails on drift between the two sources of truth"
    - "Multi-directory codegen: SCHEMA_DIRS array replaces single SCHEMA_DIR; basename-collision guard prevents silent overwrites; ENOENT-tolerant so a missing root on a fresh checkout doesn't crash"
    - "Fingerprint-pattern trust-spine: selection.*Sid fields carry ^(trk|clip|dev)_[0-9a-f]{16}$ so a bare Bitwig slot index is structurally invalid as identity"

key-files:
  created:
    - "schemas/project-state.schema.json"
    - "schemas/intent.schema.json"
    - "schemas/cli-query/query.schema.json"
    - "schemas/cli-query/result.schema.json"
    - "daemon/src/gen/project-state.ts"
    - "daemon/src/gen/intent.ts"
    - "daemon/src/gen/query.ts"
    - "daemon/src/gen/result.ts"
  modified:
    - "schemas/protocol/event.schema.json"
    - "schemas/protocol/request.schema.json"
    - "scripts/gen-types.mjs"
    - "daemon/src/protocol/reader.ts"
    - "daemon/src/protocol/schemas.test.ts"
    - "daemon/src/gen/envelope.ts"
    - "daemon/src/gen/event.ts"
    - "daemon/src/gen/request.ts"

key-decisions:
  - "selection.trackSid/clipSid/deviceSid all carry the COMBINED pattern ^(trk|clip|dev)_[0-9a-f]{16}$ (per the plan action text + acceptance criterion), not per-field-specific patterns. The combined pattern still fully defends Pitfall 2 (a bare slot index like 'trk_5' is rejected) — the behavior test confirms it."
  - "result.schema.json ok:false arm requires BOTH error AND availableFrom (per plan acceptance criterion). M1's only ok:false results are the 3 stubs, all of which carry availableFrom; if a future genuine-error case needs availableFrom optional, that's a future schema evolution."
  - "OBSERVATIONAL_EVENT_TYPES changed from `const` to `export const` so the Pitfall-1 equality gate test can import it. This is the minimal additive change required by the plan's own Task 2 instruction ('imports ... reader.ts's OBSERVATIONAL_EVENT_TYPES'); the spine (isObservationalEvent/queue/createReader) is untouched."

patterns-established:
  - "Pattern: every new schema drops into gen-types.mjs automatically once it lives under schemas/, schemas/protocol/, or schemas/cli-query/ — no codegen edits needed for future schema additions"
  - "Pattern: Pitfall-1-style equality gates — when a runtime constant must mirror a schema enum, a unit test asserts equality so drift fails the build"
  - "Pattern: D-07 contract separation — cli-query schemas live under their own schemas/cli-query/ root, NOT under schemas/protocol/, so bridge-protocol changes cannot silently break CLI consumers (Pitfall 3)"

requirements-completed: [STATE-01, STATE-03, CLI-01, BRIDGE-03, UX-06]

# Metrics
duration: 9 min
completed: 2026-06-27
status: complete
---

# Phase 02 Plan 01: Contract Foundation Summary

**4 new JSON Schema 2020-12 wire contracts (project-state, intent, cli-query/{query,result}) + extended event/request enums for the bridge's 5-event/3-request Phase-2 surface + multi-dir codegen + the Pitfall-1 backpressure equality gate — frozen before any producer/consumer in Plans 02/03/04/05 is built.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-27T13:54Z (baseline test run)
- **Completed:** 2026-06-27T19:03Z
- **Tasks:** 2
- **Files modified:** 16 (8 created, 8 modified)

## Accomplishments
- Froze the 4 new wire contracts every later plan in this phase speaks: `project-state.schema.json` (STATE-01), `intent.schema.json` (STATE-03), `cli-query/query.schema.json` (D-07), `cli-query/result.schema.json` (D-07 + UX-06 + the not_implemented arm).
- Extended `event.schema.json` to the 5-event observational set and `request.schema.json` to the 3-request pull set so the Plan 02 bridge can emit the full Phase-2 surface; the 4 frozen siblings (envelope/response/edit/handshake) are byte-identical.
- Made the codegen multi-directory (`SCHEMA_DIRS` array over `schemas/protocol/`, `schemas/`, `schemas/cli-query/`) — future schema drops need no codegen edits.
- Established the Pitfall-1 equality gate: a unit test asserts the reader's `OBSERVATIONAL_EVENT_TYPES` equals `event.schema.json`'s type enum, so the build fails if the runtime backpressure classifier drifts from the schema (T-2-01-T mitigation).
- Trust-spine enforced at the schema level throughout: `selection.*Sid` fingerprint regex (T-2-01-E / Pitfall 2), `assumptions[].source` enum (UX-06), `stateFreshness` required on every CLI result (T-2-01-I / SC#3), `ok:false` arm requires error+availableFrom AND forbids payload (T-2-01-S), `automation.maxItems:0` reserves the slot empty (D-04).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author 4 new JSON Schemas + extend event/request enums** — `ba3077f` (feat)
2. **Task 2: Extend gen-types.mjs + reader OBSERVATIONAL_EVENT_TYPES + schema round-trip tests** — `c0545e8` (feat)

## Files Created/Modified
- `schemas/project-state.schema.json` — STATE-01 raw-state contract; selection.*Sid fingerprint pattern (Pitfall 2); automation maxItems 0 (D-04).
- `schemas/intent.schema.json` — STATE-03 user-authored projectIntent; summary required + minLength 1.
- `schemas/cli-query/query.schema.json` — D-07 CLI query contract; op enum = 5 live + diff (D-05).
- `schemas/cli-query/result.schema.json` — D-07 CLI result contract; stateFreshness required (SC#3); allOf if/then ok:false arm (T-2-01-S); assumptions[] {claim,confidence,source} (UX-06).
- `schemas/protocol/event.schema.json` — type enum extended to 5 observational events; $comment updated noting Phase-2 freeze + Pitfall-1 link.
- `schemas/protocol/request.schema.json` — type enum extended with get.selected_device_chain + get.project_summary.
- `scripts/gen-types.mjs` — SCHEMA_DIR → SCHEMA_DIRS (3 dirs); basename-collision guard; ENOENT-tolerant.
- `daemon/src/protocol/reader.ts` — OBSERVATIONAL_EVENT_TYPES extended to 5 members; `const` → `export const`; Pitfall-1 comment. Spine untouched.
- `daemon/src/protocol/schemas.test.ts` — 30 new test cases: 4 round-trip suites + extended enum counter-examples + Pitfall-1 equality gate (3 sub-tests).
- `daemon/src/gen/{project-state,intent,query,result}.ts` — NEW generated types.
- `daemon/src/gen/{envelope,event,request}.ts` — regenerated (discriminated union + enums widened).

## Decisions Made
- **Combined Sid pattern:** `selection.trackSid/clipSid/deviceSid` all carry `^(trk|clip|dev)_[0-9a-f]{16}$` (the plan's action text + acceptance criterion specify this). The combined pattern fully defends Pitfall 2 — verified by the behavior test (`trk_5` is rejected). Per-field-specific patterns would be marginally stricter semantically but the plan is explicit and the defense goal is met.
- **result `ok:false` requires both `error` AND `availableFrom`:** per the plan's acceptance criterion. M1's only ok:false results are the 3 stubs (`bw-arrange`/`bw-automation`/`bw-edit`), all of which carry `availableFrom`. If a future genuine-error case needs `availableFrom` optional, that's a later schema evolution.
- **`export const OBSERVATIONAL_EVENT_TYPES`:** the constant changed from module-private to exported so the plan's Pitfall-1 equality gate test can import it. This is the minimal additive change enabling the plan's own Task 2 test instruction; the spine (`isObservationalEvent`, bounded queue, Ajv compile block, `createReader` signature) is byte-identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Exported `OBSERVATIONAL_EVENT_TYPES` from reader.ts**
- **Found during:** Task 2 (extending schemas.test.ts with the Pitfall-1 equality gate)
- **Issue:** The plan's Task 2 action explicitly says "imports event.schema.json's type enum AND reader.ts's OBSERVATIONAL_EVENT_TYPES and asserts the two sets are equal." But the constant was module-private (`const`, no `export`) — it could not be imported by the test. The Pitfall-1 gate (a T-2-01-T mitigation in the plan's own threat model) could not exist without the export.
- **Fix:** Changed `const OBSERVATIONAL_EVENT_TYPES` to `export const OBSERVATIONAL_EVENT_TYPES`. One keyword added; no other reader.ts change.
- **Files modified:** daemon/src/protocol/reader.ts
- **Verification:** The 3 Pitfall-1 equality sub-tests pass; `git diff` confirms `isObservationalEvent`, the bounded queue, the Ajv compile block, and `createReader` are untouched (the AC7 "spine protected" intent holds).
- **Committed in:** c0545e8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical enabler).
**Impact on plan:** The export is the necessary enabler for the plan's own Pitfall-1 test instruction — not scope creep. The reader spine stays protected.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required. This plan is pure contract/codegen/test work; no servers, no env vars, no dashboards.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: mitigated | schemas/project-state.schema.json | T-2-01-E (Elevation via slot-index spoofing) — mitigated by the `^(trk\|clip\|dev)_[0-9a-f]{16}$` fingerprint pattern on selection.*Sid (Pitfall 2 defense). Behavior-verified. |
| threat_flag: mitigated | schemas/cli-query/result.schema.json | T-2-01-S (Spoofing via fake stub success) — mitigated by the allOf if/then ok:false arm requiring error+availableFrom AND forbidding payload. Behavior-verified. |
| threat_flag: mitigated | daemon/src/protocol/reader.ts + schemas/protocol/event.schema.json | T-2-01-T (Tampering via enum/set drift) — mitigated by the Pitfall-1 equality gate unit test (build fails on drift). |
| threat_flag: mitigated | schemas/cli-query/result.schema.json | T-2-01-I (Information disclosure via silent stale-as-live) — mitigated by stateFreshness REQUIRED on every result (SC#3). |
| threat_flag: mitigated | daemon/src/protocol/reader.ts | T-2-02-D (DoS via new event types under flood) — mitigated by adding all 4 new event types to OBSERVATIONAL_EVENT_TYPES so they get drop-oldest backpressure. |

All 5 threats in the plan's `<threat_model>` register carry their `mitigate` disposition and are behavior-verified by the new test suite.

## Self-Check: PASSED

**Created files exist on disk:**
- FOUND: schemas/project-state.schema.json
- FOUND: schemas/intent.schema.json
- FOUND: schemas/cli-query/query.schema.json
- FOUND: schemas/cli-query/result.schema.json
- FOUND: daemon/src/gen/project-state.ts
- FOUND: daemon/src/gen/intent.ts
- FOUND: daemon/src/gen/query.ts
- FOUND: daemon/src/gen/result.ts

**Commits exist:**
- FOUND: ba3077f (feat(02-01): freeze project-state/intent/cli-query contracts + extend event/request enums)
- FOUND: c0545e8 (feat(02-01): multi-dir codegen + extend reader observational set + Pitfall-1 gate)

**Plan-level `<verification>` commands re-run:**
- `cd daemon && npm run gen:types` → exits 0, idempotent (re-run produces no diff). PASS.
- `cd daemon && npx vitest run src/protocol/schemas.test.ts` → 52/52 tests pass (22 Phase-1 + 30 Phase-2). PASS.
- `cd daemon && npx tsc --noEmit` → exit 0 (NodeNext strict). PASS.
- `git diff --quiet schemas/protocol/{envelope,response,edit,handshake}.schema.json` → no diff (frozen schemas untouched). PASS.

**Acceptance criteria:** all 7 Task-1 criteria + all 7 Task-2 criteria verified inline before each commit.

## TDD Gate Compliance

Task 1 is marked `tdd="true"`. For declarative JSON Schema contracts the canonical RED/GREEN split is awkward (the schema IS the executable spec), so the discipline was honored as follows:
- The `<behavior>` block (18 good/bad fixtures across the 4 new schemas + extended enums) was verified inline via an Ajv script BEFORE the Task 1 commit — every counter-example rejected, every good example accepted (RED→GREEN demonstration).
- The canonical round-trip test suite landed in Task 2 (per the plan's explicit Task 2 ownership of `schemas.test.ts` extensions) — 30 test cases that permanently encode the `<behavior>` assertions.

Gate commits in `git log --oneline --grep="02-01"`:
- `feat(02-01)` × 2 (the schema authoring + the codegen/reader/test extension).

No `test(02-01)` RED-gate commit exists because the test suite and the schema contracts are split across Task 1 (schemas) and Task 2 (tests) by the plan's own design — the schemas cannot be exercised by the test file until both tasks land. This is the plan's structure, not a TDD discipline violation; the inline Ajv verification served as the RED→GREEN gate during Task 1 execution. Flagged here for transparency per the TDD gate-enforcement reference.

## Next Phase Readiness
- The contract foundation is frozen. Plans 02 (bridge), 03a/03b (daemon ingest/state), 04 (CLI), 05 (Pi `/analyze`) can now import the schemas + generated types without re-negotiating shapes.
- `daemon/src/gen/{project-state,intent,query,result}.ts` are ready for Plans 03/04/05 to import.
- The Pitfall-1 equality gate means any future event-enum extension (Phase 3+) will surface a build failure if the reader's set isn't extended in lockstep — the drift hazard is now permanently guarded.
- The multi-dir codegen means future schema drops (e.g. patch.schema.json in Phase 3) need no `gen-types.mjs` edits as long as they land under one of the three scanned roots.

---
*Phase: 02-read-only-context-foundation-m1*
*Completed: 2026-06-27*
