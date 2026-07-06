---
phase: 04-arrangement-intelligence-m3
plan: 03
subsystem: daemon
tags: [section-detector, repetition-report, agglomerative-clustering, union-find, analyzer-plugin, cosine-affinity, fast-check, refuse-below-threshold]

# Dependency graph
requires:
  - phase: 04-arrangement-intelligence-m3 (Plan 04-02)
    provides: sceneFeatureVector + selfSimilarityMatrix + cosineAffinity (the shared substrate both analyzers consume); Profile type with sectionLabels/energyWeights/roleTemplates
provides:
  - SectionDetector Analyzer (id="sections") — emits labeled contiguous sections via cosine-affinity agglomerative clustering
  - agglomerativeBoundaries(features, sim, opts?) pure helper — Ward-style adjacent-only merges (D-14)
  - labelSections(boundaries, features, profile?) pure helper — genre-profile labeling (D-07); below-threshold → "unknown"
  - RepetitionReport Analyzer (id="repetition") — emits grouped repetition clusters via union-find transitive closure
  - repetitionClusters(features, sim, threshold) pure helper — D-15 union-find + singleton filter
  - SceneBoundary + SectionSummary + RepetitionCluster interfaces
  - DerivedFieldName += "repetition" (D-21 — additive type member)
  - AnalyzeContext += optional profile?: Profile (Plan 04-05 wires loadProfile)
affects: [04-04 (track-role classifier — same Analyzer shape, same ctx.profile pattern), 04-05 (registers M3_ANALYZERS + wires loadProfile into ctx + bw-arrange CLI), 04-06 (Pi /review reads snapshot.derived.sections + .repetition)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Contiguous agglomerative clustering (Ward-style adjacent-only merges with mean cross-pair affinity) — adapts librosa.segment.agglomerative to discrete scenes
    - Union-find (disjoint-set with path compression) for transitive-closure repetition grouping — O(n²α(n))
    - Per-dimension product bands for matchedOn attribution (density/pcp/velocity/activeTracks/length/pitchCentroid/polyphony)
    - Defensive track-major → scene-major grid pivot (extractSceneColumns) — duplicated across the two analyzers to preserve module independence

key-files:
  created:
    - daemon/src/transforms/section-detector.ts (415 lines — SectionDetector + agglomerativeBoundaries + labelSections + extractSceneColumns)
    - daemon/src/transforms/section-detector.test.ts (19 tests — concrete behaviors + fast-check contiguity/maxSections properties)
    - daemon/src/transforms/repetition-report.ts (361 lines — RepetitionReport + repetitionClusters + computeMatchedOn + extractSceneColumns)
    - daemon/src/transforms/repetition-report.test.ts (15 tests — concrete behaviors + fast-check disjointness/no-singleton/co-clustering property)
  modified:
    - daemon/src/state/analyzer-registry.ts (+21 lines — "repetition" added to DerivedFieldName (D-21); optional profile?: Profile added to AnalyzeContext; type-only Profile import)

key-decisions:
  - "maxSections is a CEILING not a TARGET — identical scenes collapse to a single section even when below maxSections (the merge loop continues while affinity ≥ minSim)"
  - "Energy proxy in labelSections is mean velocityAggregate (single-signal, ∈ [0,1]); the full D-05 weighted composite lands in Plan 04-04's energy-curve analyzer"
  - "Section position thresholds: relativePos ≤ 0.33 = start; ≥ 0.67 = end; else middle (the generic/techno profiles' sectionLabels use these positions)"
  - "matchedOn: a band is 'matched' when its mean per-dimension product ≥ the overall mean product across all 18 normalized-vector dimensions — above-average contribution to the dot product"
  - "ctx.profile.repetitionThreshold is cast locally (Profile type doesn't carry the field yet — Plan 04-02 added energyWeights/sectionLabels/roleTemplates but not this); the ?? 0.7 fallback honors ARCH-02"
  - "extractSceneColumns is duplicated across section-detector.ts and repetition-report.ts (~40 lines each) to preserve module independence per the plan's pure-module stance"

patterns-established:
  - "Matrix-pair analyzers: two analyzers consume the SAME selfSimilarityMatrix (Plan 02) — one cuts it contiguously (sections), one graph-wise (repetition). The matrix is computed once per analyzer; no forked pipeline"
  - "Refuse-below-threshold is mechanical: analyzers emit honest confidence ∈ [0,1]; runAll drops < 0.5. The grep for Math.max(0.5,...) in transforms/ is the T-04-10 code-review checklist"
  - "Analyzer wrapper shape (mirrors MotifSignatureAnalyzer): type-only back-import from analyzer-registry → no cycle; defensive grid extraction from raw.tracks; refuse-on-empty; assumptions[] on every DerivedField"

requirements-completed: [ARRANGE-01, ARRANGE-02]

# Metrics
duration: 9min
completed: 2026-07-06
status: complete
---

# Phase 4 Plan 03: Section Detector + Repetition Report (the matrix pair) Summary

**Two Analyzer plugins that consume Plan 02's selfSimilarityMatrix — SectionDetector cuts it contiguously (Ward-style agglomerative, D-14) and RepetitionReport cuts it graph-wise (union-find transitive closure, D-15) — both emitting honest confidence with assumptions[] and refusing below threshold (runAll owns the 0.5 floor).**

## Performance

- **Duration:** 9 min (2 TDD cycles, both RED → GREEN; no REFACTOR needed)
- **Started:** 2026-07-06T23:48:48Z
- **Completed:** 2026-07-06T23:57:54Z
- **Tasks:** 2/2 (both `tdd="true"`)
- **Files modified:** 5 (4 created, 1 modified)
- **Tests added:** 34 (19 section-detector + 15 repetition-report)
- **Full daemon suite:** 621 tests pass (was 587 pre-plan; +34 from this plan)

## Accomplishments

- **SectionDetector lands as Analyzer id="sections".** Contiguous agglomerative clustering (D-14) merges adjacent scene clusters by highest mean cross-pair cosine affinity; stops at maxSections ceiling or when best merge drops below minSimilarity (0.6). Boundaries tile [0, n-1] with no gaps/overlaps (pinned by fast-check property).
- **RepetitionReport lands as Analyzer id="repetition".** Union-find (path-compressed disjoint-set) over scene pairs where sim ≥ threshold (default 0.7); transitive closure groups A~B, B~C even when A≁C; singleton groups filtered (a group of one is NOT a repetition — D-15 critical invariant). matchedOn attributes the driving feature dimensions.
- **Both inherit the runAll gate for free.** Honest confidence ∈ [0,1] (NOT pre-floored — Pitfall 4 / T-04-10 mitigation verified by grep: no `Math.max(0.5,...)` in either file). assumptions[] on every DerivedField (UX-06).
- **Wave 3 parallel-safe.** The only shared-file edit (analyzer-registry.ts) is purely additive: `"repetition"` joins the DerivedFieldName union (D-21) + optional `profile?: Profile` joins AnalyzeContext. Existing 15 analyzer-registry tests still pass unchanged.

## Task Commits

Each task shipped via TDD (RED test → GREEN feat):

1. **Task 1 RED: section-detector failing tests** — `66322a9` (test)
2. **Task 1 GREEN: SectionDetector + agglomerativeBoundaries + labelSections + analyzer-registry extension** — `7438e7a` (feat)
3. **Task 2 RED: repetition-report failing tests** — `9e1432a` (test)
4. **Task 2 GREEN: RepetitionReport + repetitionClusters (union-find)** — `4118fae` (feat)

**Plan metadata:** (this SUMMARY commit — `docs(04-03)`)

## Files Created/Modified

- `daemon/src/transforms/section-detector.ts` — PURE module. `agglomerativeBoundaries` (contiguous Ward-style merge with maxSections ceiling + minSim floor), `labelSections` (genre-profile match on energy+position; below-threshold → "unknown"), `SectionDetector` Analyzer (defensive grid extraction, refuse-on-empty, min-confidence DerivedField). 415 lines.
- `daemon/src/transforms/section-detector.test.ts` — 19 tests: identical/paired/single/empty boundaries, contiguity, maxSections, intro/drop/unknown labels, honest confidence, refuse-on-empty, purity, assumptions[] shape, fast-check contiguity + maxSections + confidence-bounds properties.
- `daemon/src/transforms/repetition-report.ts` — PURE module. `repetitionClusters` (union-find + path compression + singleton filter + matchedOn per-dimension product bands), `RepetitionReport` Analyzer (refuse on <2 scenes, profile-sourced threshold with ARCH-02 fallback). 361 lines.
- `daemon/src/transforms/repetition-report.test.ts` — 15 tests: two-pair/all-identical/all-dissimilar/transitive-closure clusters, matchedOn pcp attribution, singleton filter, refuse-on-empty/single, purity, assumptions[], fast-check disjointness + co-clustering + no-singleton property.
- `daemon/src/state/analyzer-registry.ts` — Additive: `"repetition"` added to `DerivedFieldName` (D-21); optional `profile?: Profile` added to `AnalyzeContext`; type-only `Profile` import. Existing 15 tests unchanged.

## Decisions Made

1. **maxSections is a ceiling, not a target.** The merge loop continues while affinity ≥ minSim, even below maxSections. Identical scenes collapse to a single section (test: 4 identical → [0,3]). This matches the librosa.segment.agglomerative semantics (merge until variance increases beyond threshold).
2. **Energy proxy = mean velocityAggregate.** The full D-05 weighted composite (noteDensity + velocity + polyphony + pitchCentroid, weights from profile.energyWeights, normalized against project peak) lands in Plan 04-04's energy-curve analyzer. Using velocityAggregate here is a faithful single-signal proxy that lets labelSections match against profile.sectionLabels energyRange windows.
3. **Position thresholds: ≤0.33 = start, ≥0.67 = end, else middle.** Maps cleanly to the generic (intro=start, peak=middle, outro=end) and techno (drop=middle, break/roll=any) sectionLabels positions.
4. **matchedOn = bands whose mean per-dimension product ≥ overall mean.** A band "matched" when it contributed above-average to the dot product driving the cosine affinity. The 18-dim normalized vector is grouped into 7 named bands (density/pcp/velocity/activeTracks/length/pitchCentroid/polyphony).
5. **ctx.profile.repetitionThreshold cast locally.** Plan 04-02 extended the Profile type with energyWeights/sectionLabels/roleTemplates but not repetitionThreshold. The Analyzer wrapper casts `ctx.profile as Profile & { repetitionThreshold?: number }` and falls back to 0.7 (ARCH-02 — generic core runs literally without the field). A future profile extension can add the field without touching this analyzer.
6. **extractSceneColumns duplicated.** The ~40-line track-major → scene-major grid pivot appears in both section-detector.ts and repetition-report.ts. Kept duplicated (not extracted to a shared helper) to preserve module independence per the plan's pure-module stance — each analyzer is self-contained.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DerivedFieldName missing "repetition"**
- **Found during:** Task 2 GREEN phase (RepetitionReport `produces: ["repetition"]` wouldn't typecheck)
- **Issue:** The plan specifies RepetitionReport produces `"repetition"`, but the `DerivedFieldName` union in analyzer-registry.ts (Plan 02 era) only had sections/trackRoles/motifs/energyCurve/automationSalience/intent. PATTERNS.md assigns the `"repetition"` addition to Plan 04-05, but 04-03 ships FIRST (Wave 3 vs Wave 5) — the type must exist for RepetitionReport to compile.
- **Fix:** Added `"repetition"` to the `DerivedFieldName` union (one-line additive type member per D-21). Did NOT add `M3_ANALYZERS` (that stays Plan 04-05's job — nothing in 04-03 needs it).
- **Files modified:** daemon/src/state/analyzer-registry.ts
- **Verification:** Existing 15 analyzer-registry tests pass unchanged; the new `produces: ["repetition"]` typechecks.
- **Committed in:** `7438e7a` (Task 1 GREEN — the deviation landed with the first analyzer that needed the AnalyzeContext.profile field)

**2. [Rule 3 - Blocking] AnalyzeContext missing `profile` field**
- **Found during:** Task 1 GREEN phase (SectionDetector reads `ctx.profile.sectionLabels`; ctx had no profile)
- **Issue:** The plan explicitly specifies `ctx.profile.sectionLabels` / `ctx.profile.repetitionThreshold` (5+ references), but `AnalyzeContext` only carried `intent` + `now`. No runtime code currently constructs AnalyzeContext (the registry exists but isn't wired into the runtime — that's Plan 04-05's job).
- **Fix:** Added optional `profile?: Profile` to `AnalyzeContext` (purely additive — type-only `Profile` import, no cycle). Plan 04-05's boot.ts/query-server wiring will populate it via `loadProfile(ctx.intent?.projectIntent.profile)`. Until then the field is `undefined` and analyzers use ARCH-02 fallbacks (labelSections → "unknown", repetition threshold → 0.7).
- **Files modified:** daemon/src/state/analyzer-registry.ts
- **Verification:** Existing 15 analyzer-registry tests pass unchanged (profile is optional — `{ intent, now }` literals still typecheck).
- **Committed in:** `7438e7a` (Task 1 GREEN)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking type-system gaps the plan requires but Wave 1 didn't ship)
**Impact on plan:** Both deviations are purely additive (one type-member + one optional field). Zero scope creep — the analyzer contracts (id/consumes/produces, refuse-on-empty, honest confidence, assumptions[]) are exactly as specified. Plan 04-05 will see both additions already present and skip its corresponding edit steps.

## Issues Encountered

None beyond the two auto-fixes above. Both TDD cycles completed cleanly: RED failed for the right reason (module not found), GREEN passed after minimal-to-pass implementation.

## User Setup Required

None — no external service configuration required. All work is daemon-internal TypeScript.

## Next Phase Readiness

- **Wave 3 sibling (Plan 04-04) unblocked.** The track-role classifier + energy-curve analyzer can follow the same Analyzer shape + `ctx.profile` pattern. If 04-04 also adds `profile?: Profile` to AnalyzeContext, the orchestrator's sequential merge resolves trivially (same line, same content).
- **Plan 04-05 (integration) ready.** Registers `M3_ANALYZERS = [...M2_ANALYZERS, SectionDetector, RepetitionReport, EnergyCurve, TrackRoleClassifier]`, wires `loadProfile(intent?.projectIntent.profile)` into the AnalyzeContext construction site, replaces the M1 `bw-arrange` stub with the 6-subcommand multicall. The `"repetition"` DerivedFieldName + `ctx.profile` field are already present (04-05 skips those edit steps).
- **Plan 04-06 (Pi /review) ready.** The CLI reads `snapshot.derived.sections` + `snapshot.derived.repetition` — the SectionSummary and RepetitionCluster shapes match the arrangement-snapshot schema's `derived` block (Plan 02).
- **No blockers.** All acceptance criteria met; full daemon suite green (621 tests).

## Self-Check: PASSED

- **Files created:** All 4 new files exist on disk (section-detector.ts/test, repetition-report.ts/test) — verified via `wc -l` (415/407/361/345 lines).
- **Files modified:** analyzer-registry.ts carries the two additive changes (`"repetition"` in DerivedFieldName, `profile?: Profile` in AnalyzeContext) — verified via `git diff --stat a0b653b..HEAD`.
- **Commits:** All 4 task commits present in git log (`66322a9`, `7438e7a`, `9e1432a`, `4118fae`) — verified via `git log --oneline --grep="04-03"`.
- **min_lines:** section-detector.ts 415≥80; repetition-report.ts 361≥60 — both exceed the `must_haves.artifacts.min_lines` floors.
- **Exports:** All `must_haves.artifacts.exports` present (SectionDetector/agglomerativeBoundaries/labelSections; RepetitionReport/repetitionClusters; plus SceneBoundary/SectionSummary/RepetitionCluster interfaces).
- **T-04-10 mitigation:** `grep -rn "Math.max(0.5" daemon/src/transforms/{section-detector,repetition-report}.ts` → CLEAN (no pre-flooring).
- **Plan-level `<verification>`:** the 3 named test files pass (section-detector 19 + repetition-report 15 + analyzer-registry 15 = 49 tests); full daemon suite 621 tests pass.

## TDD Gate Compliance

Both tasks (`tdd="true"`) shipped the mandatory RED → GREEN commit sequence:

| Task | RED commit | GREEN commit | REFACTOR | Status |
|------|-----------|--------------|----------|--------|
| 1 (section-detector) | `66322a9` ✓ | `7438e7a` ✓ | — (not needed) | Pass |
| 2 (repetition-report) | `9e1432a` ✓ | `4118fae` ✓ | — (not needed) | Pass |

No gate violations. Each RED commit's tests failed for the right reason (module-not-found, before any implementation existed). Each GREEN commit's tests passed after minimal-to-pass implementation.

---

*Phase: 04-arrangement-intelligence-m3*
*Plan: 03*
*Completed: 2026-07-06*
