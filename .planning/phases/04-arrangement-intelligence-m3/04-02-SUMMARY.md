---
phase: 04-arrangement-intelligence-m3
plan: 02
subsystem: daemon
tags: [scene-features, self-similarity, arrangement-snapshot, roles-store, profile-extension, fast-check, ajv, atomic-write]

# Dependency graph
requires:
  - phase: 04-arrangement-intelligence-m3 (Plan 04-01)
    provides: get.launcher_clips pull handler + launcher-clips snapshot shape consumed by arrangement-snapshot.ts
  - phase: 02-foundation (intent-store, atomic-write, motif-signature)
    provides: atomic validated read pattern + atomicWriteJson POSIX temp+rename + PCP/density/cosine primitives
provides:
  - sceneFeatureVector(column) + SceneFeatureVector + SceneColumn — pure per-scene feature extraction (PCP, density, polyphony, pitchCentroid, L2-normalized vector)
  - selfSimilarityMatrix(features) + cosineAffinity(u,v) — pure n×n symmetric cosine-affinity matrix (diagonal=1, entries ∈ [0,1])
  - loadArrangementSnapshot / saveArrangementSnapshot + ArrangementSnapshot — atomic store for .bw-brain/arrangement-snapshot.json
  - loadRoles / saveRoles + RolesFile — atomic store for .bw-brain/roles.json (mirrors arrangement-snapshot)
  - profile.schema.json += energyWeights / sectionLabels / roleTemplates (optional, additive — ARCH-02)
  - generic.json + techno.json extended with the three new fields (neutral + techno-specific vocabularies)
  - profile-loader mergeProfiles extended (object-merge energyWeights; array-replace labels/templates) + energyWeights sum-check warning
  - gen/profile.ts regenerated with the three new optional fields
affects: [04-03 (section-detector consumes sceneFeatureVector + selfSimilarityMatrix + ctx.profile.sectionLabels), 04-04 (track-role classifier consumes ctx.profile.roleTemplates + writes roles.json), 04-05 (boot.ts wires the refresh path: pull-then-analyze-then-saveArrangementSnapshot), 04-06 (Pi /review reads arrangement-snapshot.derived)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure-module feature extraction (extends motif-signature.ts PCP+density primitives to per-scene column aggregation)
    - Inline daemon-internal JSON Schema (D-13 — NOT under schemas/; the snapshot+roles never cross the wire)
    - fast-check property tests for matrix invariants (symmetry + diagonal=1 + [0,1] bounds for N=1..50)
    - Profile-deep-merge extension: object-spread for energyWeights (per-key override), array-replace for sectionLabels/roleTemplates (child's array is complete)
    - energyWeights sum-check: console.warn at load if sum deviates > 0.01 from 1.0 (ARCH-02 — enhance never gate)

key-files:
  created:
    - daemon/src/transforms/scene-features.ts (190 lines — pure per-scene feature vector)
    - daemon/src/transforms/scene-features.test.ts (19 tests — concrete + fast-check properties)
    - daemon/src/transforms/self-similarity.ts (104 lines — pure n×n cosine-affinity matrix)
    - daemon/src/transforms/self-similarity.test.ts (13 tests — symmetry + diagonal + bounds)
    - daemon/src/state/arrangement-snapshot.ts (264 lines — atomic store + inline schema)
    - daemon/src/state/arrangement-snapshot.test.ts (12 tests — ENOENT/round-trip/atomic)
    - daemon/src/state/roles-store.ts (141 lines — atomic store + inline schema)
    - daemon/src/state/roles-store.test.ts (12 tests — ENOENT/round-trip/atomic)
  modified:
    - schemas/profile.schema.json (+energyWeights +sectionLabels +roleTemplates optional blocks)
    - daemon/src/profiles/generic.json (+3 fields: 4 weights / 5 labels / 7 roles)
    - daemon/src/profiles/techno.json (+3 fields: 4 weights / 3 labels / 2 roles)
    - daemon/src/profiles/profile-loader.ts (mergeProfiles += 3-field merge + loadProfile += energyWeights sum-check warning)
    - daemon/src/profiles/profile-loader.test.ts (+14 tests for the new fields)
    - daemon/src/gen/profile.ts (regenerated — 3 new optional fields)

key-decisions:
  - "cosineAffinity zero-magnitude → 0 (NOT 0.5). The spec said 'zero-magnitude → 0' which takes precedence over the (cos+1)/2 remap; an empty/zero vector is dissimilar to everything (the matrix sets the diagonal to 1.0 explicitly so self-similarity still holds)"
  - "polyphony initial value 0 (NOT 1) so an empty column produces normalized=[] (all-zeros raw vector → mag=0 → empty normalized). An active cell with zero notes still produces a non-empty normalized (unit vector along activeTrackCount axis — the honest encoding for 'a cell exists but is silent')"
  - "Techno roleTemplates carries ONLY kick+bass (array-replace, NOT append to generic's 7). RESEARCH.md line 1088 shows techno adds tighter kick/bass; the array-replace semantics mean techno's roleTemplates is the complete techno set. Documented in the schema description"
  - "Inline daemon-internal schemas for arrangement-snapshot + roles (D-13). NOT under schemas/ — that dir is the cross-language wire contract; these files never cross the wire. No format: keywords (AGENTS.md — addFormats NOT used)"
  - "energyWeights sum-check is a console.warn, NOT a throw (ARCH-02 'enhance never gate'). Analyzers consume the weights as-authored; the daemon surfaces drift so a profile author notices during development"
  - "fast-check fc.float requires 32-bit-float constraints; switched to fc.integer + scale (/100) for note start/length generators to avoid the constraint quirk"

patterns-established:
  - "Pure-module discipline extended: scene-features.ts + self-similarity.ts carry the same 'PURE module: no fs/net imports' header as motif-signature.ts and reuse its PCP/density/cosine primitives verbatim"
  - "Atomic-store mirror pattern: arrangement-snapshot.ts and roles-store.ts are STRUCTURALLY IDENTICAL (same imports, same ENOENT→null, same Ajv compile-once, same atomicWriteJson save). Future daemon-internal durable files should copy this template"
  - "Profile deep-merge extension contract: object-valued fields merge per-key (child wins); arrays/scalars replace wholesale. Documented in mergeProfiles — adding a new object-valued profile field means one line in the spread"

requirements-completed: [ARRANGE-01, ARRANGE-02, ARRANGE-03, ARRANGE-05]

# Metrics
duration: 11min
completed: 2026-07-06
status: complete
---

# Phase 4 Plan 02: Foundation primitives + atomic stores + profile extensions Summary

**Pure per-scene feature vector + n×n cosine-affinity self-similarity matrix + two atomic validated stores (arrangement-snapshot.json + roles.json) + profile schema extended with energyWeights/sectionLabels/roleTemplates — all property-tested, ARCH-02-additive, ready for Wave 3 analyzers (Plans 03/04) to consume.**

## Performance

- **Duration:** 11 min (3 TDD cycles, all RED → GREEN; no REFACTOR needed)
- **Started:** 2026-07-06T23:28:04Z
- **Completed:** 2026-07-06T23:39:11Z
- **Tasks:** 3/3 (all `tdd="true"`)
- **Files modified:** 13 (8 created, 5 modified)
- **Tests added:** 92 (19 scene-features + 13 self-similarity + 12 arrangement-snapshot + 12 roles-store + 14 profile-loader new + 22 profile-loader existing still pass)
- **Full daemon suite:** 587 tests pass (was 517 pre-plan; +70 from this plan's new tests)

## Accomplishments

- **Pure feature-extraction primitives landed.** `sceneFeatureVector` + `selfSimilarityMatrix` are PURE modules (no fs/net imports) that Wave 3 analyzers (Plans 03/04) import directly. All invariants pinned by fast-check property tests (PCP normalization, L2 unit-length, matrix symmetry + diagonal=1 + entries ∈ [0,1] for N=1..50).
- **Atomic durable stores landed.** `arrangement-snapshot.json` + `roles.json` round-trip save→load→deep-equal; ENOENT→null (no inference); atomic POSIX temp+rename (T-04-06 tampering defense); inline daemon-internal Ajv schemas (D-13 — never cross the wire).
- **Profile schema extended additively (ARCH-02).** Three new OPTIONAL fields: `energyWeights` (object-merge), `sectionLabels` (array-replace), `roleTemplates` (array-replace). Generic core runs literally without them; techno opts in with tighter values. `gen/profile.ts` regenerated; the `ctx.profile.energyWeights` / `.sectionLabels` / `.roleTemplates` types now exist for Wave 3 analyzers.
- **TDD discipline: every task shipped RED → GREEN.** 6 atomic commits (3 test + 3 feat). No REFACTOR phase needed — implementations were minimal-to-pass.

## Task Commits

Each task was committed atomically via TDD (RED test → GREEN feat):

1. **Task 1 RED: scene-features + self-similarity failing tests** — `e189dd9` (test)
2. **Task 1 GREEN: scene-features + self-similarity pure primitives** — `3ad1e40` (feat)
3. **Task 2 RED: arrangement-snapshot + roles-store failing tests** — `cfe70f7` (test)
4. **Task 2 GREEN: arrangement-snapshot + roles atomic stores** — `91a109f` (feat)
5. **Task 3 RED: profile energyWeights/sectionLabels/roleTemplates failing tests** — `448072a` (test)
6. **Task 3 GREEN: profile schema/data/loader extension + regen** — `b3a2390` (feat)

**Plan metadata:** (this SUMMARY commit — `docs(04-02)`)

## Files Created/Modified

- `daemon/src/transforms/scene-features.ts` — Pure per-scene feature vector: PCP (12-bin velocity×length weighted), noteDensity, velocityAggregate, activeTrackCount, lengthBeats, pitchCentroid, polyphony, L2-normalized concatenation. Empty column → `normalized: []` (caller refuses upstream).
- `daemon/src/transforms/scene-features.test.ts` — 19 tests: concrete-shape sanity + empty/edge guards + fast-check properties (PCP sum=1, L2 unit-length, finite fields).
- `daemon/src/transforms/self-similarity.ts` — Pure `cosineAffinity(u,v) ∈ [0,1]` (cosine remapped; zero-magnitude → 0) + `selfSimilarityMatrix(features)` n×n symmetric matrix with diagonal=1.0.
- `daemon/src/transforms/self-similarity.test.ts` — 13 tests: cosine helper sanity + matrix shape/symmetry/diagonal + fast-check property (N=1..50).
- `daemon/src/state/arrangement-snapshot.ts` — Atomic load (ENOENT→null, Ajv-at-boundary, parse error throws with path) + save (atomicWriteJson POSIX temp+rename). Inline daemon-internal schema (`urn:bw-brain:arrangement-snapshot`).
- `daemon/src/state/arrangement-snapshot.test.ts` — 12 tests: ENOENT/valid/invalid/missing-field/schema-boundary/optional-derived/nested-dir + atomic round-trip/no-temp-file/auto-mkdir/overwrite/pretty-print.
- `daemon/src/state/roles-store.ts` — Mirrors arrangement-snapshot exactly (same atomic+validated discipline). Inline schema (`urn:bw-brain:roles`).
- `daemon/src/state/roles-store.test.ts` — 12 tests: same coverage shape as arrangement-snapshot.
- `schemas/profile.schema.json` — Three new OPTIONAL property blocks: energyWeights (4 required number keys, sum-to-1.0 documented), sectionLabels (label/position/energyRange), roleTemplates (role/register/rhythm/velocity/minConfidence?).
- `daemon/src/profiles/generic.json` — + energyWeights `{0.35,0.25,0.20,0.20}` (sums to 1.0); + 5 sectionLabels (intro/build/peak/breakdown/outro); + 7 roleTemplates (kick/bass/lead/pad/hats/percussion/fx with full register/rhythm/velocity profiles).
- `daemon/src/profiles/techno.json` — + energyWeights `{0.40,0.25,0.15,0.20}` (sums to 1.0); + 3 sectionLabels (drop/break/roll — array-replace); + 2 roleTemplates (kick/bass with tighter register windows — array-replace).
- `daemon/src/profiles/profile-loader.ts` — `mergeProfiles` += energyWeights object-spread + sectionLabels/roleTemplates array-replace; `loadProfile` += `warnIfEnergyWeightsOffSum` advisory check (ARCH-02 — enhance never gate).
- `daemon/src/profiles/profile-loader.test.ts` — + 14 tests covering the three new fields + their merge semantics + ARCH-02 optionality.
- `daemon/src/gen/profile.ts` — Regenerated via `node scripts/gen-types.mjs`; carries the three new optional typed fields.

## Decisions Made

1. **cosineAffinity zero-magnitude → 0, not 0.5.** The PLAN spec said "zero-magnitude → 0" but the (cos+1)/2 remap maps cosine=0 to 0.5. I treated the spec's "→ 0" as authoritative (an empty/zero vector is dissimilar to everything). The matrix sets the diagonal to 1.0 explicitly so self-similarity still holds for empty scenes.
2. **polyphony reduce initial value 0, not 1.** With initial=1, an empty column produced a non-empty normalized (unit vector along polyphony axis) — violating the "empty column → normalized=[]" contract. Initial=0 makes the raw vector all-zeros → mag=0 → empty normalized.
3. **Techno roleTemplates carries ONLY kick+bass.** RESEARCH.md line 1088 shows techno adds tighter kick/bass; the array-replace semantics mean techno's roleTemplates is the complete techno set (NOT appended to generic's 7). Documented in the schema description.
4. **Inline daemon-internal schemas (D-13).** `arrangement-snapshot` + `roles` schemas live INLINE in their TS files (`urn:bw-brain:arrangement-snapshot` / `urn:bw-brain:roles`), NOT under `schemas/`. That dir is the cross-language wire contract; these files never cross the wire.
5. **energyWeights sum-check is a console.warn, not a throw.** ARCH-02 "enhance never gate" — analyzers consume the weights as-authored; the daemon surfaces drift so a profile author notices during development.
6. **fast-check `fc.float` 32-bit constraint workaround.** Used `fc.integer + scale (/100)` for note start/length generators instead of `fc.float` (which requires 32-bit-float constraints and rejected `0.1`/`2` literals).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cosineAffinity zero-magnitude returned 0.5 instead of 0**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** The spec said "zero-magnitude → 0" but my initial implementation remapped cosine=0 through `(0+1)/2 = 0.5`. The test `cosineAffinity([0,0,0], [1,2,3]) → 0` failed (got 0.5).
- **Fix:** Added an explicit `if (magU === 0 || magV === 0) return 0;` BEFORE the remap, so zero-magnitude short-circuits to 0.
- **Files modified:** daemon/src/transforms/self-similarity.ts
- **Verification:** All cosine tests pass; fast-check property (cosineAffinity ∈ [0,1] for nonzero vectors) holds.
- **Committed in:** `3ad1e40` (Task 1 GREEN)

**2. [Rule 1 - Bug] Empty column produced non-empty `normalized` (polyphony default=1)**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** `activeCells.reduce((peak, c) => {...}, 1)` had initial value 1 — with empty activeCells, polyphony=1 leaked into the raw vector, giving mag>0 and a non-empty normalized (unit vector along polyphony axis). This violated the "empty column → normalized=[]" contract.
- **Fix:** Changed initial value to 0. With empty activeCells, polyphony=0; raw vector is all-zeros; mag=0; normalized=[].
- **Files modified:** daemon/src/transforms/scene-features.ts
- **Verification:** `sceneFeatureVector({sceneIdx:0, cells:[]}).normalized === []` test passes.
- **Committed in:** `3ad1e40` (Task 1 GREEN)

**3. [Rule 3 - Blocking] fast-check `fc.float` rejected non-32-bit-float constraints**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** `fc.float({ min: 0, max: 32, ... })` threw "fc.float constraints.min must be a 32-bit float" — the literals `0`/`8`/`0.1`/`2` are doubles, not 32-bit floats.
- **Fix:** Switched note start/length generators to `fc.integer({min:0, max:3200}).map(t => t/100)` (integer beats × 100, scaled back). Same coverage, no constraint quirk.
- **Files modified:** daemon/src/transforms/scene-features.test.ts, daemon/src/transforms/self-similarity.test.ts
- **Verification:** Property tests run cleanly; matrix symmetry invariant holds for N=1..50.
- **Committed in:** `3ad1e40` (Task 1 GREEN)

---

**Total deviations:** 3 auto-fixed (2 bugs in implementation matching spec, 1 test-framework constraint workaround)
**Impact on plan:** All auto-fixes necessary for the spec'd invariants to hold. No scope creep — the contracts (PCP/density/cosine shapes, empty-scene guards, [0,1] bounds) are unchanged.

## Issues Encountered

None beyond the three auto-fixes above. All three TDD cycles completed cleanly after the fixes.

## User Setup Required

None — no external service configuration required. All work is daemon-internal TypeScript + JSON.

## Next Phase Readiness

- **Wave 3 unblocked.** Plans 04-03 (section-detector) and 04-04 (track-role classifier) can now import `sceneFeatureVector` + `selfSimilarityMatrix` from `daemon/src/transforms/`, read/write `arrangement-snapshot.json` + `roles.json` via the atomic stores, and consume `ctx.profile.energyWeights` / `.sectionLabels` / `.roleTemplates` (types exist in `gen/profile.ts`).
- **Plan 04-05 (integration) ready.** boot.ts will wire the refresh path: pull via `get.launcher_clips` → save via `saveArrangementSnapshot` → run analyzers → write `derived` fields back. The stores' ENOENT→null semantics make "first run with no snapshot" a valid state.
- **Plan 04-06 (Pi `/review`) ready.** The CLI reads `arrangement-snapshot.derived` (sections/repetition/energyCurve/trackRoles) — the snapshot schema's optional `derived` field is the rendering contract.
- **No blockers.** All acceptance criteria met; full daemon suite green (587 tests).

## Self-Check: PASSED

- **Files created:** All 8 new files exist on disk (scene-features.ts/test, self-similarity.ts/test, arrangement-snapshot.ts/test, roles-store.ts/test) — verified via `ls`.
- **Files modified:** All 5 modified files carry the new content (profile.schema.json, generic.json, techno.json, profile-loader.ts, profile-loader.test.ts, gen/profile.ts) — verified via `git diff --stat`.
- **Commits:** All 6 task commits present in git log (`e189dd9`, `3ad1e40`, `cfe70f7`, `91a109f`, `448072a`, `b3a2390`) — verified via `git log --oneline`.
- **min_lines:** All artifact files meet or exceed the `must_haves.artifacts.min_lines` floor (scene-features 190≥50, self-similarity 104≥30, arrangement-snapshot 264≥60, roles-store 141≥50).
- **Exports:** All `must_haves.artifacts.exports` present (sceneFeatureVector/SceneFeatureVector/SceneColumn, selfSimilarityMatrix/cosineAffinity, loadArrangementSnapshot/saveArrangementSnapshot/ArrangementSnapshot, loadRoles/saveRoles/RolesFile).
- **Schema validation:** Merged generic + techno profiles both validate against the extended `profile.schema.json` (verified via tsx + Ajv2020).
- **Plan-level `<verification>`:** `npm test -- --run` (full daemon suite) = 587 tests pass; the 5 plan-specific test files = 92 tests pass.

## TDD Gate Compliance

All three tasks (`tdd="true"`) shipped the mandatory RED → GREEN commit sequence:

| Task | RED commit | GREEN commit | REFACTOR | Status |
|------|-----------|--------------|----------|--------|
| 1 (scene-features + self-similarity) | `e189dd9` ✓ | `3ad1e40` ✓ | — (not needed) | Pass |
| 2 (arrangement-snapshot + roles-store) | `cfe70f7` ✓ | `91a109f` ✓ | — (not needed) | Pass |
| 3 (profile extension) | `448072a` ✓ | `b3a2390` ✓ | — (not needed) | Pass |

No gate violations. Each RED commit's tests failed for the right reason (module-not-found, before any implementation existed). Each GREEN commit's tests passed after minimal-to-pass implementation.

---
*Phase: 04-arrangement-intelligence-m3*
*Plan: 02*
*Completed: 2026-07-06*
