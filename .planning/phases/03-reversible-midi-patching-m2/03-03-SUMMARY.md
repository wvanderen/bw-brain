---
phase: 03-reversible-midi-patching-m2
plan: 03
subsystem: musical-knowledge
tags: [midi, motif-signature, harmonic-detect, krumhansl-schmuckler, genre-profiles, tonal, analyzer-registry, trust-spine]

# Dependency graph
requires:
  - phase: 03-reversible-midi-patching-m2
    provides: Plan 01 profile.schema.json (gen Profile type) + tonal@6.4.3 installed; Plan 01/02 analyzer-registry D-08 framework (M1 ships IntentAnalyzer)
provides:
  - "daemon/src/profiles/generic.json — D-14 hardcoded neutral defaults (vary:0.85, NO extends, NO techno flavor)"
  - "daemon/src/profiles/techno.json — D-14 opt-in profile (extends:generic, vary:0.88, dark modes, 4-on-the-floor)"
  - "daemon/src/profiles/profile-loader.ts — D-13/D-14 loader: loadProfile() generic literally (INV-13), techno deep-merged, UnknownProfileError on unknown"
  - "daemon/src/transforms/motif-signature.ts — MIDI-01 motif signature (PCP+IOI+density) + similarity + MotifSignatureAnalyzer plugin (D-08 first addition)"
  - "daemon/src/transforms/harmonic-detect.ts — D-12 hand-rolled Krumhansl-Schmuckler key detection (tonal can't detect); INV-12 refuse below r=0.5; materializeScale via tonal LOOKUP"
  - "daemon/src/state/analyzer-registry.ts — M2_ANALYZERS = M1 + MotifSignatureAnalyzer (exactly TWO; MIDI-01 plugs into D-08)"
  - "INV-6, INV-12, INV-13 proven green by unit tests"
affects: [03-04, 03-05, transforms (vary/counterline/voice-leading-fix/humanize), live-uat]

# Tech tracking
tech-stack:
  added: []  # tonal@6.4.3 already installed in Plan 01
  patterns:
    - "Hand-rolled Krumhansl-Schmuckler (tonal Key.majorKey/minorKey are LOOKUP-only — no Key.detect; the ONE piece of musical reasoning tonal cannot do)"
    - "Pitch-class profile weighted by velocity × length (MIDI-trivial chroma — no STFT, each note's pitch is known)"
    - "Region-aware motif signature (D-11): rhythm/density over strict [start,end); PCP includes 1-beat-of-context for harmonic continuity"
    - "Partial-then-merged profile typing: raw techno.json omits inherited fields (voiceLeadingFix/humanize); loader deep-merges over generic so the resolved profile is always complete"
    - "Analyzer plugin that refuses when no data (MotifSignatureAnalyzer returns [] when clips carry no notes — no guess, consistent with below-threshold refuse)"
    - "Held-out ground-truth fixtures for key detection (C-major scale, A-minor pentatonic) asserting what the public-domain K-S standard must produce, independent of threshold tuning"

key-files:
  created:
    - daemon/src/profiles/generic.json
    - daemon/src/profiles/techno.json
    - daemon/src/profiles/profile-loader.ts
    - daemon/src/profiles/profile-loader.test.ts
    - daemon/src/transforms/motif-signature.ts
    - daemon/src/transforms/motif-signature.test.ts
    - daemon/src/transforms/harmonic-detect.ts
    - daemon/src/transforms/harmonic-detect.test.ts
  modified:
    - daemon/src/state/analyzer-registry.ts
    - daemon/src/state/analyzer-registry.test.ts

key-decisions:
  - "Analyzer-registry M2 wiring deferred from Task 1 to Task 2 (plan-sanctioned): MotifSignatureAnalyzer lives in motif-signature.ts (Task 2), so the registry import can only resolve after Task 2 lands. The plan explicitly permitted 'add the import + registration in Task 2's commit.' Task 1 ships profiles + loader (independent, green alone); Task 2 ships motif + harmonic + the registry wiring."
  - "Held-out harmonic fixtures authored inline (Plan 01 created the empty fixtures/harmonic-centers/ dir but never populated it). The K-S algorithm + confidence thresholds are public-domain MIR standards, not tuned-to-pass heuristics; the inline ground-truth clips (C-major scale, A-minor pentatonic) assert what the STANDARD must produce, satisfying the held-out discipline in spirit."
  - "Profile partial-merge typed via cast-through-unknown on techno: the raw techno.json omits voiceLeadingFix/humanize (inherited from generic via merge), so it does not satisfy the full Profile type until merged. The data invariant (generic authored complete, techno extends generic) guarantees the merged result is complete; the cast documents this."
  - "MotifSignatureAnalyzer refuses (returns []) when clips carry no Note-shaped data: the registry's ProjectState.clips is open-typed ({}[]), so the analyzer defensively extracts Note-shaped entries. No data -> no field -> no guess (the below-threshold refuse stance at the analyzer level)."

patterns-established:
  - "Pattern: hand-rolled MIR algorithm where tonal cannot help (K-S key detection) — public-domain reference profiles + Pearson correlation, refuse below a confidence floor"
  - "Pattern: analyzer plugin that defensively extracts its input from open-typed raw state (clips as Note[] fallback, mirroring the daemon midi-inspect path) and refuses when absent"
  - "Pattern: genre profile as partial JSON + loader deep-merge (child overrides per-key on object fields, replaces arrays/scalars) — lets profiles stay declarative + DRY over the generic base"

requirements-completed: [MIDI-01, ARCH-01, ARCH-02]

# Metrics
duration: 88 min
completed: 2026-06-30
status: complete
---

# Phase 3 Plan 03: Musical-Knowledge Foundation Summary

**Genre profiles (generic.json + techno.json, ARCH-01/02) + motif signature analyzer (MIDI-01) + hand-rolled Krumhansl-Schmuckler harmonic-center detection (D-12) — the musical-reasoning foundation the M2 transforms lean on, all pure, all registered in the D-08 analyzer framework**

## Performance

- **Duration:** ~88 min
- **Started:** 2026-06-30T16:34:03Z
- **Completed:** 2026-06-30T18:02:48Z
- **Tasks:** 2
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments
- **ARCH-01/02 profiles + loader shipped**: `generic.json` (hardcoded neutral defaults: vary:0.85, counterline:0.80, cleanup-tier 0.0, NO `extends`, NO techno flavor) + `techno.json` (opt-in, `extends:generic`, vary:0.88, dark modes `[minor, phrygian, locrian]`, 4-on-the-floor `[0,2]`). `profile-loader.ts` resolves generic literally when no name (INV-13), deep-merges techno over generic (child wins per-key on thresholds/roleSalience; replaces arrays/scalars), and throws `UnknownProfileError` on an unrecognized name (T-3-14 tampering defense).
- **MIDI-01 motif signature shipped**: `motif-signature.ts` computes PCP (velocity×length-weighted 12-bin) + 5-bucket IOI rhythm histogram + density; `motifSimilarity = 0.6·cosine(PCP) + 0.4·histogramIntersection(rhythm)`. Region-aware (D-11): rhythm/density over strict `[start,end)`; PCP includes 1-beat-of-context for harmonic continuity. INV-6 sanity proven (self-similarity=1.0, symmetry, no NaN on empty/single-note clips via `|| 1` divide guards).
- **D-12 harmonic detection shipped (hand-rolled K-S)**: `harmonic-detect.ts` correlates the clip PCP against all 24 Krumhansl-Kessler reference profiles (public-domain templates), picks the best tonic+mode, maps correlation r→confidence, and **REFUSES (returns null) when r<0.5** (INV-12, no silent guess) or notes<4. `materializeScale` uses tonal `Key.majorKey/minorKey` (LOOKUP-only — tonal cannot detect) to materialize the detected scale for downstream counterline/voice-leading.
- **M2 analyzer registry shipped**: `analyzer-registry.ts` M2_ANALYZERS = M1 + MotifSignatureAnalyzer (exactly TWO analyzers; MIDI-01 is the FIRST addition to the D-08 framework). The analyzer plugin defensively extracts Note-shaped clip data and refuses (returns []) when absent.
- **INV-6, INV-12, INV-13 all GREEN**: 57 new tests (22 profile-loader + 19 motif-signature + 13 harmonic-detect + 3 new M2 analyzer-registry); full suite 412 passing (355 baseline + 57 new, no regressions).

## Task Commits

Each task followed TDD: RED test commit → GREEN feat commit.

1. **Task 1 RED: failing profile-loader tests** — `f3a452e` (test) — INV-13 generic-literal + techno-merge + unknown-throws + ProfileHooks designed-not-exercised (module absent → import fails).
2. **Task 1 GREEN: profiles + loader** — `9d89dd4` (feat) — generic.json/techno.json + profile-loader.ts (22 tests green).
3. **Task 2 RED: failing motif/harmonic/M2 tests** — `b5db941` (test) — INV-6 sanity + region edges + analyzer plugin; INV-12 refuse-below-bar + held-out C-major/A-minor fixtures; M2 exactly-two-analyzers (modules absent → import fails).
4. **Task 2 GREEN: motif + harmonic + M2 registry** — `be4111b` (feat) — motif-signature.ts/harmonic-detect.ts + analyzer-registry M2 (47 tests green).

**Plan metadata:** (pending — STATE/ROADMAP commit below)

_TDD gate compliance: each task ships test(03-03) RED → feat(03-03) GREEN ✓._

## Files Created/Modified

**Profiles (ARCH-01/02):**
- `daemon/src/profiles/generic.json` — neutral defaults (D-14): thresholds {vary:0.85, counterline:0.80, voiceLeadingFix:0.0, humanize:0.0}, velocityHumanize jitter:5, timingHumanize jitterBeats:0.01, roleSalience (kick/bass/lead/pad/hats/percussion/fx), preferredScales [minor, dorian, phrygian], strongBeatGrid [0,1,2,3]. NO extends.
- `daemon/src/profiles/techno.json` — opt-in (extends:generic): thresholds {vary:0.88, counterline:0.82}, velocityHumanize jitter:3, preferredScales [minor, phrygian, locrian], strongBeatGrid [0,2], roleSalience {kick:1.0, bass:0.95, hats:0.5}.
- `daemon/src/profiles/profile-loader.ts` — `loadProfile()` (generic literally, INV-13), `loadProfile("techno")` (deep-merged), `UnknownProfileError` on unknown, `ProfileHooks` interface (designed-not-exercised, D-13 JSON-only v1), `mergeProfiles` (per-key object merge + array/scalar replace).

**Transforms (MIDI-01 + D-12):**
- `daemon/src/transforms/motif-signature.ts` — `MotifSignature` (pcp[12], rhythm[5], density), `motifSignature(notes, regionBeats?)` (region-aware D-11), `motifSimilarity(a,b)` (0.6·cosine + 0.4·hist-intersection), `MotifSignatureAnalyzer` plugin (id "motifs"). All pure; consumes Note from diff-logic (no redefine).
- `daemon/src/transforms/harmonic-detect.ts` — `HarmonicDetection` (key, mode, confidence), `detectHarmonicCenter(notes)` (K-S hand-rolled; null below r=0.5 or notes<4), `materializeScale(det)` (tonal LOOKUP), KS_MAJOR/KS_MINOR profiles, `correlate` (Pearson r with zero-variance guard), `rotate`.

**Registry (M1 → M2):**
- `daemon/src/state/analyzer-registry.ts` — added `M2_ANALYZERS = [...M1_ANALYZERS, MotifSignatureAnalyzer]` (exactly two analyzers; MIDI-01 first addition to D-08 framework).

**Tests (57 new):**
- `profile-loader.test.ts` (22), `motif-signature.test.ts` (19), `harmonic-detect.test.ts` (13), `analyzer-registry.test.ts` (+3 M2 assertions, 12→15).

## Decisions Made
- **Registry M2 wiring deferred to Task 2 (plan-sanctioned):** the analyzer-registry.ts import of MotifSignatureAnalyzer can only resolve after motif-signature.ts (Task 2) exists. The plan explicitly permitted this split ("add the import + registration in Task 2's commit"). Task 1 therefore ships profiles + loader (fully independent and green alone); Task 2 ships motif + harmonic + the registry wiring. This keeps each task's commit compilable + green at its boundary.
- **Held-out harmonic fixtures authored inline:** Plan 01 created the empty `fixtures/harmonic-centers/` directory but never populated it. The K-S algorithm + confidence thresholds are public-domain MIR standards (Krumhansl-Kessler profiles, 1990), not tuned-to-pass heuristics, so inline ground-truth clips (C-major scale, A-minor pentatonic, uniform-chromatic) asserting what the STANDARD must produce satisfies the held-out discipline in spirit (the fixtures are not tuned to a heuristic threshold — they assert the algorithm's well-known behavior on textbook tonal material).
- **Profile partial-merge typed via cast-through-unknown:** raw techno.json intentionally omits inherited fields (voiceLeadingFix/humanize) so the merge can be tested (the test asserts techno INHERITS them from generic). The gen `Profile` type requires all four thresholds, so techno does not satisfy it standalone; the loader deep-merges over generic and the merged result is complete. The `as unknown as Profile` cast on the raw techno import documents this data invariant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Analyzer-registry M2 import could not resolve in Task 1 (cross-task dependency)**
- **Found during:** Task 1 design
- **Issue:** Task 1's files list includes analyzer-registry.ts + test, but M2_ANALYZERS imports MotifSignatureAnalyzer from `../transforms/motif-signature.js` (a Task 2 module). Committing the registry change in Task 1 would break compilation until Task 2 lands.
- **Fix:** Deferred the registry M2 wiring (M2_ANALYZERS + MotifSignatureAnalyzer import + the test update to expect two analyzers) to Task 2's GREEN commit. The plan explicitly sanctioned this ("OR add the import + registration in Task 2's commit"). Task 1 ships profiles + loader (independent, green); Task 2 ships motif + harmonic + the registry wiring that depends on them. The plan-end AC (`rg 'M2_ANALYZERS|MotifSignatureAnalyzer' analyzer-registry.ts` + two-analyzers test) is satisfied by the end of the plan.
- **Files modified:** analyzer-registry.ts, analyzer-registry.test.ts (both in Task 2 commit be4111b)
- **Verification:** `npm test -- analyzer-registry` 15 tests green (M2 ships exactly TWO analyzers).
- **Committed in:** be4111b (Task 2 GREEN)

**2. [Rule 1 - Bug] K-S rotation was inverted (tonic landed on the wrong pitch class)**
- **Found during:** Task 2 GREEN (held-out A-minor fixture detected Eb instead of A)
- **Issue:** `rotate(profile, rot)[i] = profile[(i+rot) % 12]`, so rotating by `rot` placed the profile's tonic weight (index 0) on pitch class `(12-rot) % 12`, NOT `rot`. The C-major fixture passed by coincidence (rot=0 is its own inverse mod 12), but the A-minor fixture (tonic class 9) detected class 3 (Eb) — the inverted tonic.
- **Fix:** Added `const shift = (12 - rot) % 12` and rotate by `shift` so the profile's tonic weight lands on class `rot`. Now `bestTonic = rot` is the real tonic class. Documented the rotation semantics inline (a note of class `q` sits `(q-rot) mod 12` semitones above the tonic). Both held-out fixtures now detect correctly (C→C major, A→A minor).
- **Files modified:** daemon/src/transforms/harmonic-detect.ts
- **Verification:** held-out C-major + A-minor fixtures pass; `npm test -- harmonic-detect` 13 tests green.
- **Committed in:** be4111b (Task 2 GREEN)

**3. [Rule 1 - Bug] TypeScript type errors in new files (vitest/esbuild strips types without full checking)**
- **Found during:** Task 2 GREEN (`tsc --noEmit` after the test suite passed)
- **Issue:** Three type errors in my new files: (a) `profile-loader.test.ts` imported `type Profile` but the loader did not re-export it; (b) `profile-loader.ts` cast the partial techno.json to `Profile` directly (overlap check failed — techno omits voiceLeadingFix/humanize); (c) mergeProfiles' spreads over optional fields produced too-loose types; (d) `harmonic-detect.ts materializeScale` returned tonal's `readonly string[]` where the signature was `string[]`.
- **Fix:** (a) re-export `type { Profile }` from profile-loader.ts; (b) cast techno via `as unknown as Profile` (partial-until-merged, documented data invariant); (c) cast the mergeProfiles result `as Profile` (merge guarantees completeness); (d) spread tonal's readonly scale into a fresh mutable array (`[...Key.majorKey(k).scale]`). All four new files are now `tsc`-clean.
- **Files modified:** daemon/src/profiles/profile-loader.ts, daemon/src/transforms/harmonic-detect.ts
- **Verification:** `tsc --noEmit` reports zero errors in any 03-03 file (the only remaining errors are pre-existing in Plans 01/02 files — see Deferred).
- **Committed in:** be4111b (Task 2 GREEN)

---

**Total deviations:** 3 auto-fixed (1 Rule-3 blocking, 2 Rule-1 bugs)
**Impact on plan:** All auto-fixes were direct required consequences of the plan's design (cross-task dependency, algorithm correctness, type correctness). No scope creep — every plan deliverable shipped + all acceptance criteria pass (1 with a documented literalness note below).

### Acceptance-Criteria Literalness Notes
- **Task 1 AC** (`cd daemon && npm test -- "profile-absent"` green): vitest 4.x treats positional CLI args as a FILE-PATH filter (picomatch), not a test-name filter. The file is `profile-loader.test.ts`, so `npm test -- "profile-absent"` finds no files. The INV-13 behavior IS green and reachable two ways: `npm test -- profile-loader` (file filter, runs all 22 tests incl. the INV-13 block) or `npm test -- -t "INV-13"` (test-name pattern, runs the 8 INV-13 tests). This is the same class of literalness issue Plan 01 documented for the single-quote import AC; the INV-13 invariant is fully covered.

## Issues Encountered
- **Pre-existing TypeScript errors in Plans 01/02 files:** `tsc --noEmit` surfaces two errors NOT introduced by this plan — `src/cli/commands/edit.test.ts:26` (TS2307 stale `gen/result.js` import, Plan 02) and `src/patch/arb.ts:55` (TS2322 fast-check readonly-array type, Plan 01). vitest strips types so the suite passes; `tsc` is stricter. These are out of scope per the SCOPE BOUNDARY rule and are logged to `deferred-items.md` for a future Plans 01/02 cleanup pass.

## Threat Flags

None — the new surface (profile name → loader, clip notes → motif/harmonic analyzers) is fully covered by the plan's `<threat_model>` register (T-3-14 unknown-profile-name → UnknownProfileError; T-3-15 silent harmonic inference → INV-12 refuse-below-bar + opt-in inference with assumptions[]; T-3-16 motif NaN on empty → INV-6 divide guards + empty-clip fixture; T-3-17 genre-hardcoding → INV-13 + D-14 generic.json literally-true test). No unmodeled threat surface introduced.

## User Setup Required
None — no external service configuration required. tonal@6.4.3 was installed in Plan 01 and is the only runtime dep used (LOOKUP-only for scale materialization). All modules are pure (no fs/net in transforms or loader).

## Next Phase Readiness
- **Ready for Plan 03-04** (MIDI transforms — vary/counterline/voice-leading-fix/humanize): the musical-reasoning foundation is in place. Transforms will call `motifSignature`/`motifSimilarity` for the preserve-motif gate (D-08/D-10), `detectHarmonicCenter` for the inferred-harmony fallback (D-12, opt-in + disclosed), and `loadProfile` for per-transform thresholds (D-13/D-14). The creative tier (vary/counterline) refuses below the profile threshold; the cleanup tier (voice-leading-fix/humanize) skips the motif gate (threshold 0.0).
- **Ready for Plan 03-05** (Pi /vary + /apply + /diff skills + live UAT): the motif-similarity score is available for the /vary summary lines (D-15 picking signal).
- **Live UAT still required (M1–M5):** the K-S detection thresholds (r>0.85→0.9, etc.) and the motif thresholds (vary:0.85 generic, 0.88 techno) are public-domain/RESEARCH-sourced defaults; live UAT against real Bitwig clips will confirm they hold on the producer's actual material (a candidate that refuses on a real clip is the expected refuse-below-bar behavior, not a bug — D-08).
- **No blockers.** INV-6, INV-12, INV-13 all green; the musical-reasoning foundation is pure, tested, and registered in the D-08 framework.

## TDD Gate Compliance
- ✅ Task 1: `test(03-03)` RED `f3a452e` → `feat(03-03)` GREEN `9d89dd4`
- ✅ Task 2: `test(03-03)` RED `b5db941` → `feat(03-03)` GREEN `be4111b`
- Plan-level gate: every task has a test commit before a feat commit ✓.

---
*Phase: 03-reversible-midi-patching-m2*
*Completed: 2026-06-30*

## Self-Check: PASSED

- All 8 key-files.created exist on disk (generic.json, techno.json, profile-loader.ts, motif-signature.ts, harmonic-detect.ts + 3 test files). ✅
- Both modified files updated (analyzer-registry.ts M2, analyzer-registry.test.ts two-analyzers). ✅
- All 4 task commit hashes present in `git log` (f3a452e, 9d89dd4, b5db941, be4111b). ✅
- SUMMARY.md exists at `.planning/phases/03-reversible-midi-patching-m2/03-03-SUMMARY.md`. ✅
- `cd daemon && npm test -- motif-signature` exits 0 (19 tests, INV-6 green). ✅
- `cd daemon && npm test -- harmonic-detect` exits 0 (13 tests, INV-12 + held-out fixtures green). ✅
- `cd daemon && npm test -- profile-loader` exits 0 (22 tests, INV-13 green). ✅
- `cd daemon && npm test -- analyzer-registry` exits 0 (15 tests, M2 two-analyzers green). ✅
- Full daemon suite: 412 tests green (355 baseline + 57 new, no regressions). ✅
- `tsc --noEmit` clean on all 03-03 files (2 pre-existing errors in Plans 01/02 files logged to deferred-items.md). ✅
