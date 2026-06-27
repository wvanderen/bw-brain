---
phase: 02-read-only-context-foundation-m1
plan: 03a
subsystem: state
tags: [state-04, fingerprint, reconcile, atomic-write, state-cache, posix-rename, sha256, sc3, mem-01, pure-functions, property-tests, trust-spine]

# Dependency graph
requires:
  - phase: 02-read-only-context-foundation-m1 (plan 01)
    provides: "schemas/project-state.schema.json + daemon/src/gen/project-state.ts — the STATE-01 RawState contract these primitives normalize against; the selection.*Sid ^(trk|clip|dev)_[0-9a-f]{16}$ pattern mintSid produces"
provides:
  - "daemon/src/state/fingerprint.ts — fingerprint(input): 16-hex stableId + mintSid(type, input): prefixed sid (STATE-04 identity synthesis, pure)"
  - "daemon/src/state/reconcile.ts — reconcile(observed, persisted, now): matched/reassigned/new/vanished buckets with 3-stage fuzzy fallback (fingerprint > name+type > content-hash); emptyStableIdMap(); StableIdMap + ReconcileResult interfaces"
  - "daemon/src/store/atomic-write.ts — atomicWriteJson(path, data): POSIX temp+rename (MEM-01/SC#3 crash-safe, temp in dirname(dest) — Pitfall 4 defense)"
  - "daemon/src/store/state-cache.ts — loadOrInit(path) + save(path, payload): durable wrapper delegating to atomicWriteJson; StateCachePayload + emptyStateCache"
affects: [02-03b, 02-04, 02-05, 03, 05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-stage fuzzy reconcile fallback (fingerprint exact > name+type survives reorder > content-hash survives rename with size-1 disambiguation) — the SC#3 stable-ID-survives-reorder trust spine"
    - "POSIX temp+rename atomic write with temp = join(dirname(dest), ...) (Pitfall 4 cross-filesystem defense) — every durable write in the daemon flows through this single primitive"
    - "Canonical JSON fingerprint (insertion-sorted keys n/t/nb/ch) sha256-truncated to 16 hex chars — matches project-state.schema.json selection.*Sid body pattern"
    - "Injected `now: number` on reconcile() (not Date.now()) so the held-out reconnect property tests are deterministic across runs"

key-files:
  created:
    - "daemon/src/state/fingerprint.ts"
    - "daemon/src/state/fingerprint.test.ts"
    - "daemon/src/state/reconcile.ts"
    - "daemon/src/state/reconcile.test.ts"
    - "daemon/src/store/atomic-write.ts"
    - "daemon/src/store/atomic-write.test.ts"
    - "daemon/src/store/state-cache.ts"
    - "daemon/src/store/state-cache.test.ts"
  modified: []

key-decisions:
  - "Added a THIRD reconcile fallback (content-hash, byContentHash index) beyond the plan's two (fingerprint + name+type). The plan's <behavior> test 4 explicitly requires 'renaming Kick → Kick Main with unchanged note content reassigns via content-hash match' but the plan's reconcile <action> text only specifies fingerprint + name+type lookup. Name+type cannot catch a rename (track:Kick Main is a new key). The content-hash fallback (size-1 disambiguation: only reassign if exactly one persisted sid shares the contentHash) is the minimal addition that satisfies the stated behavior. byContentHash: Map<string, Set<string>> added to StableIdMap (the Set handles two-clips-identical-notes ambiguity by refusing to guess). Documented as a Rule 2 deviation (auto-add missing critical functionality required for the stated behavior)."
  - "RawState aliased as `type RawState = ProjectState` from ../gen/project-state.js. The plan said 'Import RawState type from ../../gen/project-state.js' but (a) the gen file exports `ProjectState`, not `RawState` (the schema's own $comment calls it 'the RawState shape'), and (b) the path from daemon/src/state/ is ../gen/ (one level up to src/), not ../../gen/ (which would resolve outside src/). The alias honors the plan's intent (use the Plan-01-generated type) while fixing the two mechanical errors."
  - "state-cache.ts flattens the StableIdMap's Maps to tuple arrays in StateCachePayload (JSON has no Map literal). The caller (02-03b) converts between the in-memory Map-based StableIdMap and the on-disk tuple-array representation. This keeps the pure primitive (reconcile.ts) Map-native and the durable payload JSON-serializable."
  - "atomic-write.ts import path fixed: dirname/basename sourced from node:path (their real home), NOT node:fs/promises. The RESEARCH.md canonical excerpt (lines 1172-1186, transcribed verbatim per PATTERNS.md Assignment 10) imports them from node:fs/promises — a bug (those are not named exports of fs/promises). RESEARCH.md's own Pattern-4 version (line 501) confirms node:path. Rule 1 fix, documented in the file header."

patterns-established:
  - "Pattern: every held-out SC#3 property test (20-track reorder, N-parallel atomic write, fingerprint determinism) lives next to its pure primitive and is the un-fakeable bar the implementation must clear — no hand-wave can make these green"
  - "Pattern: reconcile's three-stage fuzzy fallback is the canonical 'stable identity survives drift' design — exact > semantic > content, with explicit ambiguity refusal (content-hash size>1 → mint new rather than guess)"
  - "Pattern: injected `now` (not Date.now()) on any time-aware pure function — makes reconnect/reconcile property tests deterministic"

requirements-completed: [STATE-04, MEM-01]

# Metrics
duration: 14 min
completed: 2026-06-27
status: complete
---

# Phase 02 Plan 03a: STATE-04 Trust-Spine Primitives Summary

**Four pure STATE-04/MEM-01 primitives — fingerprint (sha256 name+type+neighbors+contentHash→16hex), reconcile (3-stage fuzzy fallback surviving a 20-track reorder with 20/20 sids), atomicWriteJson (POSIX temp+rename), state-cache wrapper — with their 3 SC#3 held-out property tests green, locking the trust spine before 02-03b's stateful consumers build on it.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-27T19:50:17Z
- **Completed:** 2026-06-27T20:05:01Z
- **Tasks:** 1 (TDD: RED → GREEN, no REFACTOR needed)
- **Files created:** 8 (4 source + 4 test)

## Accomplishments
- Shipped the four STATE-04 trust-spine primitives as PURE functions with zero hidden I/O (fingerprint + reconcile touch no sockets/files/clocks; atomicWriteJson + state-cache.save touch only the local durable path). The stateful layer in 02-03b consumes these unchanged.
- The 3 SC#3 held-out property tests pass: (1) 20-track reorder on reconnect — 20/20 sids survive via the name+type fuzzy fallback (held-out bar was >=18); (2) N=20 parallel atomicWriteJson calls — final file parses + deep-equals exactly one input (no half-written merge); (3) fingerprint determinism + distinctness across all four components.
- reconcile's three-stage fuzzy fallback (fingerprint exact > name+type survives reorder > content-hash survives rename) correctly handles the rename-with-stable-content case the plan's <behavior> requires — all sid survival tested via matched+reassigned, not just matched counts (neighbor cascades on add/remove are real and the implementation handles them).
- `tsc --noEmit` clean under NodeNext strict; full daemon suite 94/94 (no Phase 1 regressions).

## Task Commits

Each task was committed atomically. This was a single-task TDD plan (RED → GREEN):

1. **Task 1 RED: SC#3 held-out property tests (4 test files, all failing — imports resolve to non-existent modules)** — `5819a66` (test)
2. **Task 1 GREEN: 4 pure primitive implementations + 1 test-fixture fix (29/29 green)** — `3c4263b` (feat)

**Plan metadata:** `pending` (docs commit — see Final Commit below; committed by the sequential executor after this SUMMARY).

_No REFACTOR phase — the GREEN implementation is already minimal and direct (no duplication, no premature abstraction)._

## Files Created/Modified
- `daemon/src/state/fingerprint.ts` — `fingerprint(input)` → sha256(canonical-json)[0:16]; `mintSid(type, input)` → `^(trk|clip|dev)_[0-9a-f]{16}$`; `FingerprintInput` interface. Pure (only import: `createHash` from node:crypto).
- `daemon/src/state/fingerprint.test.ts` — 12 tests: determinism, 16-hex shape, distinctness per component (neighbors/contentHash/name/type), neighbor-order significance, mintSid patterns.
- `daemon/src/state/reconcile.ts` — `reconcile(observed, persisted, now)` → matched/reassigned/new/vanished with 3-stage fuzzy fallback; `emptyStableIdMap()`; `StableIdMap` (byFingerprint + byNameAndType + byContentHash + lastSeen), `ReconcileResult`, `ObservedObject` interfaces. Pure over `observed`; mutates caller-owned `persisted`.
- `daemon/src/state/reconcile.test.ts` — 7 tests: the SC#3 held-out 20-track property suite (initial → unchanged → REORDER >=18/20 → RENAME via content-hash → NEW → VANISHED) + purity-over-observed.
- `daemon/src/store/atomic-write.ts` — `atomicWriteJson(path, data)`: POSIX temp+rename; temp = `join(dirname(dest), ...)` (Pitfall 4 defense); `mkdir(dir, {recursive:true})` auto-creates `.bw-brain/`.
- `daemon/src/store/atomic-write.test.ts` — 5 tests: SC#3 N=20-parallel held-out (final file parses + deep-equals one input), sequential last-writer-wins, mkdir-on-absent, no-stray-temp, 2-space pretty-print.
- `daemon/src/store/state-cache.ts` — `loadOrInit(path)` (empty default on ENOENT, throws on corruption), `save(path, payload)` (delegates to atomicWriteJson, stamps savedAt), `StateCachePayload` (Maps flattened to tuple arrays), `emptyStateCache()`.
- `daemon/src/store/state-cache.test.ts` — 5 tests: loadOrInit-on-missing, save+loadOrInit round-trip, .bw-brain/ creation, valid-JSON-on-disk, last-writer-wins.

## Decisions Made
- **Added a third reconcile fallback (content-hash).** The plan's `<behavior>` test 4 requires "rename Kick → Kick Main with unchanged note content reassigns via content-hash match," but the plan's reconcile `<action>` text specifies only fingerprint + name+type lookup. Name+type cannot catch a rename (`track:Kick Main` is a new key). Added `byContentHash: Map<string, Set<string>>` to `StableIdMap` and a third fallback stage: when fingerprint + name+type both miss, look up byContentHash; if exactly ONE sid shares the contentHash → reassign; if multiple share it (ambiguous — two clips with identical notes) → mint new (refuse to guess). The Set handles the ambiguity; the size-1 check is the disambiguator. This is the minimal addition that makes the stated behavior work. Rule 2 deviation (auto-add missing critical functionality).
- **`RawState = ProjectState` alias + path correction.** The plan said import `RawState` from `../../gen/project-state.js`. Two mechanical issues: the gen file exports `ProjectState` (not `RawState` — the schema's own `$comment` calls it "the RawState shape"), and from `daemon/src/state/` the correct path is `../gen/` (one level up to `src/`), not `../../gen/` (which would resolve outside `src/`). Used `type RawState = ProjectState` to honor the intent while fixing both.
- **state-cache flattens Maps to tuple arrays.** The in-memory `StableIdMap` (reconcile.ts) uses real `Map` objects; the on-disk `StateCachePayload` (state-cache.ts) flattens them to `Array<[string, string]>` / `Array<[string, number]>` because JSON has no Map literal. The caller (02-03b) converts at the boundary. This keeps the pure primitive Map-native and the durable payload JSON-clean.
- **atomic-write.ts import path fix.** The RESEARCH.md canonical excerpt (lines 1172-1186, transcribed verbatim per PATTERNS.md Assignment 10) imports `dirname`/`basename` from `node:fs/promises` — a bug (those are not named exports of fs/promises; they live on `node:path`). RESEARCH.md's own Pattern-4 version (line 501) confirms `node:path`. Fixed inline (Rule 1) and documented in the file header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] atomic-write.ts import path (dirname/basename from node:path, not fs/promises)**
- **Found during:** Task 1 GREEN (first vitest run — `TypeError: dirname is not a function`)
- **Issue:** The RESEARCH.md canonical excerpt transcribed verbatim per PATTERNS.md Assignment 10 imports `dirname, basename` from `node:fs/promises`. They are not named exports of fs/promises — they live on `node:path`. Every atomicWriteJson call crashed at `const dir = dirname(path)`.
- **Fix:** Sourced `dirname, basename` from `node:path` (alongside the existing `join` import). Left `writeFile, rename, mkdir` on `node:fs/promises`. Updated the file header to note the deviation from the verbatim transcription.
- **Files modified:** daemon/src/store/atomic-write.ts
- **Verification:** 12 previously-failing tests (3 atomic-write + 3 state-cache that depend on it + cascading) now pass; `tsc --noEmit` exit 0.
- **Committed in:** 3c4263b (Task 1 GREEN commit)

**2. [Rule 2 - Missing Critical] Third reconcile fallback (content-hash match for rename survival)**
- **Found during:** Task 1 RED (writing test 4 — the rename case)
- **Issue:** The plan's `<behavior>` block requires "renaming a track from Kick to Kick Main with unchanged note content reassigns via content-hash match." But the plan's reconcile `<action>` text specifies only two lookups: fingerprint exact + name+type fuzzy. Name+type cannot catch a rename (`track:Kick Main` is a brand-new key; the old `track:Kick` key does not match). Without a content-hash index, a rename with stable content would mint a NEW sid — violating the stated behavior and losing project memory across renames.
- **Fix:** Added `byContentHash: Map<string, Set<string>>` to `StableIdMap` and a third fallback stage in reconcile(): when fingerprint + name+type both miss, consult byContentHash; if exactly one persisted sid shares the contentHash → reassign (rebind fingerprint + name); if the bucket is empty or has >1 sid (ambiguous) → mint new. The Set + size-1 check is the disambiguator for the two-clips-identical-notes case. Populated by `registerNew`; content-hash reassigns also call `rebindName` to keep byNameAndType consistent.
- **Files modified:** daemon/src/state/reconcile.ts (the StableIdMap shape, registerNew/reconcile logic)
- **Verification:** Test 4 (rename) passes — Kick's sid survives via the content-hash path (reason: "content-hash"). Test 3 (reorder) still passes — name+type catches the neighbor cascade. No new sid minted on rename.
- **Committed in:** 3c4263b (Task 1 GREEN commit)

**3. [Rule 1 - Bug] reconcile.test.ts fixture + assertion bugs (3 failing tests)**
- **Found during:** Task 1 GREEN (second vitest run — 3 reconcile tests failed)
- **Issue:** Three test-fixture bugs, all in reconcile.test.ts (the implementation was correct — Test 3 reorder passed, proving the fuzzy paths work):
  (a) `buildTrackState` tied `contentHash` to the name (`ch_${name}`), so renaming Kick → Kick Main changed the contentHash too — defeating the "stable content" intent of test 4. The content-hash fallback never fired.
  (b) Tests 5 (new track) and 6 (vanished) asserted exact `matched` counts, but adding/removing a track changes the NEIGHBORS of adjacent tracks → those tracks get name+type-reassigned, not fingerprint-matched. The assertions missed the `reassigned` survivors.
- **Fix:** (a) Added an optional `contentHashOf` parameter to `buildTrackState`; the rename test passes an override preserving Kick's contentHash (`ch_Kick`) across the rename. (b) Reworked tests 5 + 6 to assert sid SURVIVAL via `matched + reassigned` (not just `matched`) and to check the original-sid set is preserved.
- **Files modified:** daemon/src/state/reconcile.test.ts (buildTrackState helper + tests 4, 5, 6 assertions)
- **Verification:** All 7 reconcile tests pass; the implementation is unchanged (the bugs were in the test fixtures, not the code).
- **Committed in:** 3c4263b (Task 1 GREEN commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs — atomic-write import + test fixtures; 1 Rule 2 missing-critical — content-hash fallback).
**Impact on plan:** All three are necessary for the plan's own stated behavior to hold — the content-hash fallback is required by `<behavior>` test 4, the import fix is required for any code to run, and the test-fixture fixes correctly encode the intended semantics. No scope creep; the public surface (fingerprint, mintSid, reconcile, atomicWriteJson, loadOrInit, save) matches the plan exactly, with `byContentHash` as the one additive field necessary for the rename case.

## Issues Encountered
None beyond the three deviations above (all resolved inline).

## User Setup Required
None — no external service configuration required. This plan is pure TypeScript primitive + test work; no servers, no env vars, no dashboards.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: mitigated | daemon/src/store/atomic-write.ts | T-2-03a-T (Tampering via crash-mid-write) — mitigated by POSIX temp+rename (temp in dirname(dest) — Pitfall 4 defense). The held-out N=20-parallel property test in atomic-write.test.ts proves no half-written file escapes under contention. |
| threat_flag: mitigated | daemon/src/state/reconcile.ts | T-2-03a-E (Elevation/sid-corruption on reorder) — mitigated by the 3-stage fuzzy fallback (fingerprint > name+type > content-hash); never trusts a slot index. The held-out 20-track-reorder property test in reconcile.test.ts proves 20/20 sids survive (>=18 bar). |
| threat_flag: mitigated | daemon/src/state/fingerprint.ts | Pitfall 2 (slot-index spoofing) — mitigated by sha256-content-addressed 16-hex fingerprint + mintSid's `^(trk\|clip\|dev)_[0-9a-f]{16}$` prefix; a bare Bitwig slot index like "trk_5" can never match a minted sid. |

Both threats in the plan's `<threat_model>` register (T-2-03a-T, T-2-03a-E) carry their `mitigate` disposition and are behavior-verified by the held-out test suite.

## Self-Check: PASSED

**Created files exist on disk:**
- FOUND: daemon/src/state/fingerprint.ts
- FOUND: daemon/src/state/fingerprint.test.ts
- FOUND: daemon/src/state/reconcile.ts
- FOUND: daemon/src/state/reconcile.test.ts
- FOUND: daemon/src/store/atomic-write.ts
- FOUND: daemon/src/store/atomic-write.test.ts
- FOUND: daemon/src/store/state-cache.ts
- FOUND: daemon/src/store/state-cache.test.ts

**Commits exist:**
- FOUND: 5819a66 (test(02-03a): add SC#3 held-out property tests for STATE-04 trust-spine primitives) — RED gate
- FOUND: 3c4263b (feat(02-03a): implement STATE-04 trust-spine pure primitives) — GREEN gate

**Plan-level `<verification>` commands re-run:**
- `cd daemon && npx vitest run src/state/fingerprint.test.ts src/state/reconcile.test.ts src/store/atomic-write.test.ts src/store/state-cache.test.ts` → 29/29 tests pass. PASS.
- The 3 SC#3 held-out property tests pass: 20-track reorder (20/20 sids survive, >=18 bar), N=20-parallel atomic write (final file parses + deep-equals one input), deterministic fingerprint (same input → same id; differing components → differing ids). PASS.
- `cd daemon && npx tsc --noEmit` → exit 0 (NodeNext strict). PASS.

**TDD gate sequence:** RED (`test(02-03a)` @ 5819a66) precedes GREEN (`feat(02-03a)` @ 3c4263b). No REFACTOR commit — the GREEN implementation is minimal and direct.

## TDD Gate Compliance

Task 1 is marked `tdd="true"`. Gate sequence honored:
- **RED gate** (`5819a66`): all 4 test files written first; vitest run confirmed they fail (RED) because the source modules did not exist yet — the tests fail for the right reason (import resolution), not for a test bug.
- **GREEN gate** (`3c4263b`): the 4 source implementations landed; all 29 tests pass; `tsc --noEmit` clean.
- **REFACTOR gate:** skipped — no commit. The GREEN implementation is already minimal: no duplication, no premature abstraction, helpers (fingerprintInputOf, nameKey, registerNew, rebindFingerprint, rebindName, observedObjects) are each single-purpose. A REFACTOR commit with no behavior change would be noise.

Gate commits in `git log --oneline --grep="02-03a"`:
- `test(02-03a)` @ 5819a66 (RED)
- `feat(02-03a)` @ 3c4263b (GREEN)

## Next Phase Readiness
- The 4 trust-spine primitives are proven and frozen. Plan 02-03b (the stateful layer: stale-watchdog + analyzer-registry + intent-store + normalizer + UDS query-server) imports these unchanged — `reconcile()` from `../state/reconcile.js`, `atomicWriteJson()` from `./atomic-write.js`, `loadOrInit`/`save` from `./state-cache.js`.
- The 3-stage fuzzy fallback (fingerprint > name+type > content-hash) is the reconcile contract 02-03b's ingest path relies on; the held-out test pins the bar at >=18/20 sids surviving a reorder (currently 20/20).
- `byContentHash` on `StableIdMap` is the one additive field vs the plan's literal type definition — 02-03b must round-trip it through `StateCachePayload.stableIds.byContentHash` (tuple-array form) when persisting.
- The `now: number` injection on reconcile() means 02-03b's caller controls the clock — the stale-watchdog's `Date.now()` feeds in directly, keeping the pure primitive deterministic.

---
*Phase: 02-read-only-context-foundation-m1*
*Completed: 2026-06-27*
