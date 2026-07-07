---
phase: 04-arrangement-intelligence-m3
plan: 04
subsystem: daemon
tags: [energy-curve, track-role-classifier, analyzer-plugin, weighted-cosine, register-masking, fast-check, refuse-below-threshold, arch-02-fallback]

# Dependency graph
requires:
  - phase: 04-arrangement-intelligence-m3 (Plan 04-02)
    provides: sceneFeatureVector + SceneColumn + cosineAffinity (self-similarity.ts — reused by registerMaskedCosine) + Profile type with energyWeights/roleTemplates
  - phase: 02-foundation (motif-signature.ts — Analyzer-plugin pattern + PCP/IOI/density primitives)
    provides: MotifSignatureAnalyzer shape (id/consumes/produces/analyze/assumptions[]) + the IOI-bucket histogram + divide-by-zero guards
provides:
  - EnergyCurve Analyzer (id="energyCurve") — emits per-bar {bar, value} normalized against project peak
  - energyCurve(columns, weights, beatsPerBar?) pure helper — per-bar weighted composite (D-05/D-17)
  - normalizeAgainstPeak(values) pure helper — linear / max(values, 1e-9) (D-16 zero-guard)
  - EnergyPoint + EnergyWeights + DEFAULT_ENERGY_WEIGHTS interfaces/constants
  - TrackRoleClassifier Analyzer (id="trackRoles") — emits per-track RoleClassification
  - classifyTrackRole(features, templates, weights?) pure helper — weighted-cosine template matching (D-08/D-18)
  - aggregateTrackFeatures(trackSid, columns) pure helper — 128-bin register + 5-bin IOI + velocity moments; null when zero hasContent cells (RESEARCH OQ4)
  - RoleTemplate + TrackFeatures + RoleClassification interfaces
affects: [04-05 (registers M3_ANALYZERS += EnergyCurve + TrackRoleClassifier; wires loadProfile into ctx; persists trackRoles to roles.json), 04-06 (Pi /review reads snapshot.derived.energyCurve + .trackRoles)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Per-bar composite re-derivation: energy is computed fresh per bar from THAT bar's filtered notes (genuine intra-scene variation — a 16-beat scene yields 4 distinct points, not one stepped value)
    - Register-window masking via zero-out + renormalize + cosine-against-uniform-in-window: a kick template only "sees" notes in C1-E1 (the D-08/D-18 key novelty)
    - Velocity 3-vector [mean, variance, sqrt(variance)] for cosine matching against template moments
    - ARCH-02 fallback discipline: both analyzers consume ctx.profile.energyWeights / .roleTemplates with literal-generic defaults ({0.35,0.25,0.20,0.20} / []) so the core runs without a profile
    - extractSceneColumns duplicated across section-detector/repetition-report/energy-curve/track-role-classifier (~40 lines each) — preserves module independence per the pure-module stance

key-files:
  created:
    - daemon/src/transforms/energy-curve.ts (335 lines — EnergyCurve + energyCurve + normalizeAgainstPeak + extractSceneColumns)
    - daemon/src/transforms/energy-curve.test.ts (311 lines — 23 tests: concrete behaviors + edge guards + fast-check properties)
    - daemon/src/transforms/track-role-classifier.ts (472 lines — TrackRoleClassifier + classifyTrackRole + aggregateTrackFeatures + registerMaskedCosine)
    - daemon/src/transforms/track-role-classifier.test.ts (346 lines — 24 tests: concrete behaviors + edge guards + fast-check properties)
  modified: []

key-decisions:
  - "Energy confidence is honest 1.0 (the composite + normalization is deterministic from features — no inferential step); runAll never drops it (1.0 ≥ 0.5). This differs from SectionDetector/RepetitionReport whose confidence reflects similarity strength."
  - "Per-bar noteDensity is notes/beatsPerBar (NOT pre-scaled to [0,1]); dense bars can exceed 1.0 raw, but normalizeAgainstPeak brings the final value into [0,1] with peak=1.0. Matches D-05 'weighted composite' framing — density contributes proportionally."
  - "polyphony is scaled by /16 (mirrors scene-features.ts polyphony scaling) to bring into ~[0,1] range; pitchCentroid is velocity-weighted mean pitch / 127 (∈ [0,1]); velocityAggregate is mean velocity / 127 (∈ [0,1])."
  - "Empty scenes (no active cells) contribute 0 bars (loopBeats=0 → ceil(0/bpb)=0). The property test pins this exactly. The 'empty scenes contribute zero-value points' prose in the plan refers to BARS within an active scene that happen to have no notes — those bars get value 0 (the gap is visible post-normalization)."
  - "registerMaskedCosine: zero out bins outside [low, high], renormalize masked slice to sum=1, cosine against uniform-in-window reference (1/windowSize per bin). No notes in window → masked sum=0 → return 0 (zero-magnitude guard — the track is dissimilar to this template's register)."
  - "TrackRoleClassifier confidence = mean across classified tracks (honest ∈ [0,1]; NOT pre-floored). If even one track scores < 0.5 the mean drops; runAll may drop the whole field. This is the honest behavior — the analyzer doesn't inflate."
  - "Tracks with zero hasContent cells return null from aggregateTrackFeatures and are SKIPPED (not classified as 'unknown'). RESEARCH Open Question 4 — a track with no clips has no role to classify; classifying it 'unknown' would conflate 'no data' with 'below-threshold data'."
  - "Velocity 3-vector is [mean, variance, sqrt(variance)] — the sqrt(variance) gives the standard deviation, making the vector sensitive to both central tendency and spread (a tight template matches a tight track)."

patterns-established:
  - "Per-bar re-derivation pattern: when a feature is defined per-bar (D-17), re-derive the signals from THAT bar's filtered notes — do not reuse the scene-aggregate feature vector. This delivers genuine intra-scene variation."
  - "Register-window masking pattern: cosineAffinity(distribution[mask], uniform-in-window) is the canonical 'does this track live in this register?' test. Reusable for any register-scoped template matching."
  - "ARCH-02 fallback at the Analyzer boundary: `ctx.profile.field ?? DEFAULT` — the generic core runs literally without a profile; the profile enhances, never gates. Both analyzers follow this exactly."

requirements-completed: [ARRANGE-03, ARRANGE-05]

# Metrics
duration: 8min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 04: Energy Curve + Track Role Classifier (the composite pair) Summary

**Two Analyzer plugins that consume Plan 02's scene/clip primitives — EnergyCurve emits a per-bar weighted composite (noteDensity + velocity + polyphony + pitchCentroid, D-05) normalized against project peak (D-16), and TrackRoleClassifier labels tracks via weighted-cosine template matching (D-08/D-18) with register-window masking — both emitting honest confidence with assumptions[] and refusing below threshold.**

## Performance

- **Duration:** 8 min (2 TDD cycles, both RED → GREEN; no REFACTOR needed)
- **Started:** 2026-07-07T00:03:58Z
- **Completed:** 2026-07-07T00:11:31Z
- **Tasks:** 2/2 (both `tdd="true"`)
- **Files modified:** 4 (4 created, 0 modified — analyzer-registry.ts was already extended by Plan 04-03 with the `profile?: Profile` field + `"repetition"` type member; energyCurve/trackRoles DerivedFieldName slots were already reserved)
- **Tests added:** 47 (23 energy-curve + 24 track-role-classifier)
- **Full daemon suite:** 668 tests pass (was 621 pre-plan; +47 from this plan)

## Accomplishments

- **EnergyCurve lands as Analyzer id="energyCurve".** Per-bar weighted composite (D-05) re-deriving the four signals (noteDensity, velocityAggregate, polyphony, pitchCentroid) from each bar's filtered notes — genuine intra-scene variation. Linear normalization against project peak (D-16) guarantees every value ∈ [0,1] with the loudest bar = 1.0 exactly. Pinned by fast-check property tests (bounds + peak + bar-count + contiguity).
- **TrackRoleClassifier lands as Analyzer id="trackRoles".** Weighted-cosine template matching (D-18) over [register-masked, rhythm, velocity-3vector] with the register-window masking novelty (D-08): a kick template only "sees" notes in C1-E1. Below minConfidence → role:"unknown" (refuse — Pitfall 4) with an assumption field; alternatives sorted desc for debuggability. Tracks with zero hasContent cells are FILTERED (RESEARCH OQ4 — not classified).
- **Both inherit the runAll gate for free.** Honest confidence ∈ [0,1] (NOT pre-floored — verified by grep: no `Math.max(0.5,...)` in either file; T-04-12 mitigation). assumptions[] on every DerivedField (UX-06). ARCH-02 fallback (DEFAULT_ENERGY_WEIGHTS / empty templates) so the generic core runs literally without a profile.
- **Zero shared-file edits.** Plan 04-03 already added `profile?: Profile` to AnalyzeContext + `"repetition"` to DerivedFieldName; the `energyCurve`/`trackRoles` slots were reserved from M1. This plan is purely additive new files — no merge-conflict surface with the parallel Plan 04-03 sibling.

## Task Commits

Each task shipped via TDD (RED test → GREEN feat):

1. **Task 1 RED: energy-curve failing tests** — `c3114de` (test)
2. **Task 1 GREEN: EnergyCurve + energyCurve + normalizeAgainstPeak** — `ed8ed29` (feat)
3. **Task 2 RED: track-role-classifier failing tests** — `1b99d01` (test)
4. **Task 2 GREEN: TrackRoleClassifier + classifyTrackRole + aggregateTrackFeatures** — `c4458b1` (feat)

**Plan metadata:** (this SUMMARY commit — `docs(04-04)`)

## Files Created/Modified

- `daemon/src/transforms/energy-curve.ts` — PURE module (335 lines). `normalizeAgainstPeak` (linear / max(values, 1e-9) — D-16 zero-guard), `energyCurve(columns, weights, beatsPerBar?)` (per-bar composite re-derived per bar — D-17), `EnergyCurve` Analyzer (id="energyCurve", ARCH-02 fallback weights, honest confidence 1.0, assumptions[] on weight source). Defensive `extractSceneColumns` duplicated from section-detector.
- `daemon/src/transforms/energy-curve.test.ts` — 23 tests (311 lines): normalizeAgainstPeak sanity + zero-guard + empty/single; energyCurve concrete behaviors (dense/sparse/empty/intra-scene-variation/beatsPerBar); EnergyCurve Analyzer wrapper (interface + confidence + assumptions + profile weights + refuse-on-empty); fast-check properties (values ∈ [0,1] + peak ≈ 1.0 + bar count = Σ ceil(loopBeats/bpb) + contiguous bar indices).
- `daemon/src/transforms/track-role-classifier.ts` — PURE module (472 lines). `aggregateTrackFeatures` (128-bin register + 5-bin IOI + velocity {mean,variance}; null when zero hasContent cells — RESEARCH OQ4), `classifyTrackRole` (weighted cosine [0.4,0.4,0.2] over register-masked + rhythm + velocity-3vector; argmax above minConfidence wins; else "unknown" with assumption), `registerMaskedCosine` (zero-out + renormalize + cosine-against-uniform-in-window — D-08 novelty), `TrackRoleClassifier` Analyzer (id="trackRoles", mean confidence, profile templates with ARCH-02 fallback).
- `daemon/src/transforms/track-role-classifier.test.ts` — 24 tests (346 lines): aggregateTrackFeatures sanity + null-when-empty; classifyTrackRole concrete behaviors (kick match, spread→unknown, register-masking, alternatives sorted, argmax, custom weights, empty templates, unknown assumption); TrackRoleClassifier Analyzer wrapper (interface + per-track classification + filter-empty + profile templates + honest confidence); fast-check properties (confidence ∈ [0,1], argmax, sorted, unknown-threshold).

## Decisions Made

1. **Energy confidence is honest 1.0.** The weighted composite + linear normalization is a deterministic function of the notes — no inferential step, no threshold judgment. Confidence 1.0 is honest (energy IS the composite; nothing is being guessed). This differs from SectionDetector (confidence = intra-section similarity) and RepetitionReport (confidence = cluster similarity). runAll never drops a deterministic field (1.0 ≥ 0.5).
2. **Per-bar noteDensity is not pre-scaled.** Raw noteDensity = notes/beatsPerBar can exceed 1.0 for very dense bars, but `normalizeAgainstPeak` brings the final value into [0,1] with peak=1.0. Pre-scaling noteDensity would compress the density signal's dynamic range; letting it ride raw + normalizing at the end preserves proportional variation. Matches D-05's "weighted composite" framing.
3. **Empty scenes contribute 0 bars.** A scene with no active cells has loopBeats=0 → ceil(0/bpb)=0 → 0 bars. The property test pins this exactly. The plan's prose "empty scenes contribute zero-value points" refers to BARS within an active scene that have no notes (e.g. bar 3 of a 16-beat scene where all notes are in bars 0-1) — those bars get value 0, visible post-normalization.
4. **Register-window masking via cosine-against-uniform.** Zero out bins outside [low,high], renormalize the masked slice, then cosine against a uniform-in-window reference (1/windowSize per bin). A track with notes spread evenly inside the window scores highest; a track with notes outside scores ~0 (the zero-magnitude guard kicks in). This is the D-08 novelty — the kick template genuinely only "sees" C1-E1.
5. **Velocity 3-vector = [mean, variance, sqrt(variance)].** The sqrt(variance) = standard deviation makes the vector sensitive to both central tendency and spread. A tight template (low variance) matches a tight track; a loose template (high variance, e.g. fx) matches loose tracks. cosineAffinity over this 3-vector is the velocity signal.
6. **Tracks with zero hasContent cells are FILTERED, not classified "unknown".** RESEARCH Open Question 4: a track with no clips has no role to classify. Calling it "unknown" would conflate "no data" with "below-threshold data". The analyzer skips null results from `aggregateTrackFeatures`; only tracks with ≥1 hasContent cell get a RoleClassification.
7. **No shared-file edits.** Plan 04-03 already added the `profile?: Profile` field to AnalyzeContext + `"repetition"` to DerivedFieldName. The `energyCurve`/`trackRoles` slots were reserved from M1 (analyzer-registry.ts:42-48). This plan is purely additive new files — zero merge-conflict surface with the parallel Plan 04-03 sibling in Wave 3.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both TDD cycles completed cleanly: RED failed for the right reason (module-not-found), GREEN passed after minimal-to-pass implementation. No auto-fixes needed.

## User Setup Required

None — no external service configuration required. All work is daemon-internal TypeScript.

## Next Phase Readiness

- **Plan 04-05 (integration) ready.** Registers `M3_ANALYZERS = [...M2_ANALYZERS, SectionDetector, RepetitionReport, EnergyCurve, TrackRoleClassifier]`. The `ctx.profile` field + all four DerivedFieldName slots are already present (04-03 + M1 reservations). The query-server `arrange.energy_curve` / `arrange.track_roles` handlers will call `runAll` and read `derived.energyCurve` / `derived.trackRoles`. Plan 04-05 persists `trackRoles` to `roles.json` via the Plan 02 `saveRoles` atomic store.
- **Plan 04-06 (Pi /review) ready.** The CLI reads `snapshot.derived.energyCurve` (Array<{bar, value}>) for the ASCII sparkline + `snapshot.derived.trackRoles` (Record<trackSid, RoleClassification>) for the role summary. The EnergyPoint + RoleClassification shapes match the arrangement-snapshot schema's `derived` block (Plan 02).
- **No blockers.** All acceptance criteria met; full daemon suite green (668 tests). Both analyzers are PURE modules with no fs/net imports, defensive grid extraction, and ARCH-02 fallbacks.

## Self-Check: PASSED

- **Files created:** All 4 new files exist on disk (energy-curve.ts/test, track-role-classifier.ts/test) — verified via `wc -l` (335/311/472/346 lines).
- **Commits:** All 4 task commits present in git log (`c3114de`, `ed8ed29`, `1b99d01`, `c4458b1`) — verified via `git log --oneline --grep="04-04"`.
- **min_lines:** energy-curve.ts 335≥60; track-role-classifier.ts 472≥80 — both exceed the `must_haves.artifacts.min_lines` floors.
- **Exports:** All `must_haves.artifacts.exports` present (EnergyCurve/energyCurve/normalizeAgainstPeak; TrackRoleClassifier/classifyTrackRole; plus aggregateTrackFeatures + EnergyPoint/EnergyWeights/RoleTemplate/TrackFeatures/RoleClassification interfaces).
- **key_links:** energy-curve.ts imports `SceneColumn` from scene-features.js (Plan 02); track-role-classifier.ts imports `SceneColumn` from scene-features.js + `cosineAffinity` from self-similarity.js (Plan 02) + reads `ctx.profile.roleTemplates` (Plan 02 profile extension).
- **T-04-12 mitigation (role mislabeling):** `grep -rn "Math.max(0.5" daemon/src/transforms/{energy-curve,track-role-classifier}.ts` → CLEAN (no pre-flooring; refuse-below-threshold is mechanical via runAll). Below-threshold roles emit "unknown" with an `assumption` field surfacing the refuse reason — debuggability preserved.
- **T-04-14 mitigation (NaN normalization):** `normalizeAgainstPeak` uses `Math.max(...values, 1e-9)` zero-guard; fast-check property asserts all values ∈ [0,1] finite for any non-empty column.
- **Plan-level `<verification>`:** the 3 named test files pass (energy-curve 23 + track-role-classifier 24 + analyzer-registry 15 = 62 tests); full daemon suite 668 tests pass.

## TDD Gate Compliance

Both tasks (`tdd="true"`) shipped the mandatory RED → GREEN commit sequence:

| Task | RED commit | GREEN commit | REFACTOR | Status |
|------|-----------|--------------|----------|--------|
| 1 (energy-curve) | `c3114de` ✓ | `ed8ed29` ✓ | — (not needed) | Pass |
| 2 (track-role-classifier) | `1b99d01` ✓ | `c4458b1` ✓ | — (not needed) | Pass |

No gate violations. Each RED commit's tests failed for the right reason (module-not-found, before any implementation existed). Each GREEN commit's tests passed after minimal-to-pass implementation.

---

*Phase: 04-arrangement-intelligence-m3*
*Plan: 04*
*Completed: 2026-07-07*
