---
phase: 03-reversible-midi-patching-m2
plan: 05
subsystem: ui
tags: [pi-skills, ux-02, vary, apply, diff, skill-md, contract-tests, vitest, d-15, d-04, d-09, manual-uat, bitwig, checkpoint]

# Dependency graph
requires:
  - phase: 03-reversible-midi-patching-m2
    provides: Plan 02 bw-edit preview/apply/revert CLI + D-04 flags (--confirm/--force/--allow-below-bar); Plan 04 bw-midi vary (3 A/B/C candidates with motifSimilarity + refused near-miss tag)
  - phase: 02-read-only-context-foundation-m1
    provides: pi-pack/skills/analyze/SKILL.md (the canonical skill-doc analog — frontmatter + source comment + title + intent + Steps + Hard rules)
provides:
  - "pi-pack/skills/vary/SKILL.md — UX-02 /vary skill: runs `bw-midi vary --json`, renders 3 A/B/C candidates as ONE-line summaries (label + transform + risk + motif-similarity + patchId); refused candidates render the REFUSED visibility shape; NO inline diffs (D-15)"
  - "pi-pack/skills/apply/SKILL.md — UX-02 /apply <patchId> skill: runs `bw-edit apply` with risk-appropriate flags (med/high → --confirm; below-bar → --allow-below-bar --confirm, D-09); refuses unknown patchId without preview (T-3-23); points at `bw-edit revert` (D-03)"
  - "pi-pack/skills/diff/SKILL.md — UX-02 /diff <patchId> skill: runs `bw-edit preview`, renders the StateDiff pane on-demand (added/removed/changed + scope + motif score + boundary cleared)"
  - "pi-pack/skills/{vary,apply,diff}/skill.test.ts — structural contract tests (frontmatter shape + requires.bins + bw-* command reference + D-15/D-04/D-09 hard-rule invariants + T-3-22 no-wire-protocol guard)"
  - "daemon/vitest.config.ts — include extended with ../pi-pack/skills/**/*.test.ts (BLOCKER-02 defense against vacuous false-green)"
affects: [live-uat, end-of-phase-uat, m1-m5-checkpoints, phase-03-completion, future-pi-skills]

# Tech tracking
tech-stack:
  added: []  # no new deps — skills are markdown; tests reuse vitest + node:fs only
  patterns:
    - "Pi skill-doc shape (mirror analyze/SKILL.md): YAML frontmatter (name/description/user-invocable/metadata.openclaw.requires.bins) → source comment → title → 1-paragraph intent → ## Steps → ## Hard rules. Each skill shells to a bw-* CLI only (D-12 P2 — CLI is the stable interface, never the wire protocol)."
    - "Structural skill contract test: parse the flat YAML frontmatter inline (no yaml dep — metadata is a JSON literal), assert name/user-invocable/requires.bins + the body references the right bw-* command + the Hard rules carry the load-bearing invariant (D-15/D-04/D-09) + no wire-protocol leakage (T-3-22). Located via `new URL('./SKILL.md', import.meta.url)` so cwd-independent."
    - "BLOCKER-02 anti-false-green defense: external vitest test paths MUST be listed in the daemon/vitest.config.ts `include` glob — vitest 4.x's CLI filter does NOT override include, so `npm test -- skill` would exit 0 vacuously ('No test files found') without the glob entry. The acceptance discriminator `Test Files\s+[1-9][0-9]*\s+(passed|done)` (under NO_COLOR to strip ANSI) proves the tests RAN vs vacuous green."

key-files:
  created:
    - pi-pack/skills/vary/SKILL.md
    - pi-pack/skills/apply/SKILL.md
    - pi-pack/skills/diff/SKILL.md
    - pi-pack/skills/vary/skill.test.ts
    - pi-pack/skills/apply/skill.test.ts
    - pi-pack/skills/diff/skill.test.ts
  modified:
    - daemon/vitest.config.ts
    - docs/bitwig-capabilities.md

key-decisions:
  - "BLOCKER-02 vitest-include defense (the load-bearing test-infra fix): the skill contract tests live at pi-pack/skills/*/skill.test.ts, OUTSIDE daemon/vitest.config.ts's include glob. vitest 4.x's `-- skill` CLI filter does NOT override `include` — without the glob entry the 3 contract tests would NEVER RUN and `npm test -- skill` would exit 0 vacuously ('No test files found'), a false green exactly the Nyquist Dimension 8a failure mode. Extended include to `[..., '../pi-pack/skills/**/*.test.ts']` mirroring the 02-05 ../fixtures precedent. Proven by the discriminator `Test Files 3 passed (3)` + `Tests 22 passed (22)` (under NO_COLOR for clean rg match)."
  - "No yaml dependency for the contract tests: the skill-doc frontmatter is flat (name/description/user-invocable scalars + metadata as a JSON object literal). A 12-line inline parser (regex for scalars, JSON.parse for the metadata brace-literal) handles it without adding js-yaml to the daemon devDeps. Keeps the contract test zero-dep + matches the 'no new deps' plan stance."
  - "Plan status is pending-uat (NOT complete): Task 1 (the autonomous Pi skills + contract tests) is done + committed, but Task 2 is the M1–M5 human-verify checkpoint (live Bitwig + human ears + Pi interaction) and is BLOCKING. UX-02 is implemented but not yet verified; the requirement is not marked complete until M2/M3/M5 producer-confirm + M4 grid-lock finding recorded. The phase is not yet complete."

patterns-established:
  - "Pattern: Pi skill contract test (structural — frontmatter + CLI shell target + hard-rule invariants + no-wire-protocol guard). The live UX feel is the manual checkpoint; the contract test pins the load-bearing structure any refactor must preserve."
  - "Pattern: external vitest test paths listed explicitly in daemon/vitest.config.ts include (../fixtures 02-05, ../pi-pack/skills 03-05). vitest 4.x include is the ELIGIBILITY gate; CLI filters do not override it."

requirements-completed: []  # UX-02 IMPLEMENTED (Task 1) but NOT verified — pending Task 2 manual UAT (M2/M3/M4/M5). Do not mark complete until the human-verify checkpoint passes.

# Metrics
duration: 6 min
completed: 2026-06-30
status: pending-uat  # Task 1 complete + committed; Task 2 (M1–M5 manual UAT) is a blocking human-verify checkpoint — NOT auto-passed
---

# Phase 3 Plan 05: Pi /vary + /apply + /diff Skills (UX-02) + End-of-Phase Manual UAT Summary

**Three Pi skills (/vary D-15 one-line summaries, /apply D-04/D-09 flag handling, /diff on-demand StateDiff pane) shelling to the bw-* CLI only — with BLOCKER-02 vitest-include defense proven (3 contract tests RUN, not vacuously green); end-of-phase M1–M5 manual UAT left as a blocking human-verify checkpoint (live Bitwig + human ears)**

## Performance

- **Duration:** ~6 min (Task 1 autonomous work)
- **Started:** 2026-06-30T22:41:41Z
- **Completed:** 2026-06-30T22:48:17Z (Task 1; Task 2 pending human)
- **Tasks:** 1 of 2 complete (Task 2 is a blocking human-verify checkpoint)
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- **UX-02 /vary skill shipped (D-15)**: `pi-pack/skills/vary/SKILL.md` runs `bw-midi vary --json` and renders the 3 A/B/C candidates each as ONE summary line — `[label] vary/<variant> | risk: <risk> | motif: <score> | <one-line description> → pt_<id>`. Refused candidates render the REFUSED visibility shape (`REFUSED (motif X < threshold) | near-miss available via --allow-below-bar`). NO inline diffs (the picking signal is motif-similarity, not note detail). Points the producer at `apply A` / `/apply pt_<id>` + `/diff pt_<id>`.
- **UX-02 /apply skill shipped (D-04/D-09)**: `pi-pack/skills/apply/SKILL.md` runs `bw-edit apply <patchId>` with risk-appropriate flags (low: none; med/high: `--confirm`; below-bar override: `--allow-below-bar --confirm` — D-09 reclassifies as HIGH + still confirmed). Prints `{ok, appliedOps, patchId, undoLabel}` or the structured failure. REFUSES an unknown patchId without a prior `/vary` or preview (T-3-23). Points at `bw-edit revert <patchId>` (D-03 daemon-authoritative journal).
- **UX-02 /diff skill shipped (on-demand pane)**: `pi-pack/skills/diff/SKILL.md` runs `bw-edit preview <patchId>` and renders the StateDiff pane (added/removed/changed counts + scope + motif score + the boundary cleared). Points the producer at `/apply pt_<id> --confirm`. The pane is ON-DEMAND only — `/vary` never inlines it (D-15).
- **BLOCKER-02 vitest-include defense shipped + PROVEN**: `daemon/vitest.config.ts` `include` extended with `'../pi-pack/skills/**/*.test.ts'`. Without this entry, the 3 contract tests would NEVER RUN and `npm test -- skill` would exit 0 vacuously. Proven by the discriminator: `Test Files 3 passed (3)` + `Tests 22 passed (22)` under `NO_COLOR=1` (strips ANSI so the `Test Files\s+[1-9]\s+(passed|done)` rg matches).
- **3 structural contract tests green (22 assertions)**: each skill.test.ts parses its sibling SKILL.md frontmatter, asserts name/user-invocable/requires.bins, the body references the right `bw-*` command, the Hard rules carry the load-bearing invariant (D-15 for vary, D-04/D-09 for apply), and the body does NOT leak the daemon wire protocol (`127.0.0.1:7878` / `json-lines` / `apply.patch` — T-3-22). Located cwd-independent via `new URL("./SKILL.md", import.meta.url)`.
- **docs/bitwig-capabilities.md §1/§2 recording slots marked**: clearly-labelled PENDING slots for the M1 (native undo step-count, NON-BLOCKING) + M4 (NoteStep.start grid-locked vs free-beat, BLOCKING) live-probe findings. NO observed values fabricated (D-02 — observed Bitwig behavior is the deliverable); the human verifier records them when running the checkpoints.

## Task Commits

Each task was committed atomically (Task 1 TDD: RED test → GREEN feat):

1. **Task 1 RED: failing skill contract tests + vitest include** — `e3e6af4` (test) — vitest.config.ts include extended (BLOCKER-02) + 3 skill.test.ts (all FAIL with ENOENT — SKILL.md absent).
2. **Task 1 GREEN: Pi /vary + /apply + /diff SKILL.md** — `eb91898` (feat) — 3 SKILL.md mirroring analyze/SKILL.md; 22 contract assertions green; full suite 491 green.
3. **Task 2 docs prep: M1/M4 manual-gate recording slots** — `4edf805` (docs) — clearly-marked PENDING slots in capabilities §1/§2 (no observations fabricated).

**Task 2 (M1–M5 manual UAT): NOT EXECUTED — blocking human-verify checkpoint.** Returned as `## CHECKPOINT REACHED` for the orchestrator/user to perform the live-Bitwig + human-ear verification. See "Task 2 / Manual UAT" below.

**Plan metadata:** (pending — STATE/ROADMAP commit below)

_TDD gate compliance: Task 1 ships test(03-05) RED `e3e6af4` → feat(03-05) GREEN `eb91898` ✓. Task 2 is a human gate (no code cycle)._

## Files Created/Modified

**Three Pi skills (UX-02 — markdown skill docs):**
- `pi-pack/skills/vary/SKILL.md` — /vary: `bw-midi vary --json` → 3 A/B/C one-line summaries; D-15 no inline diffs; refused visibility shape.
- `pi-pack/skills/apply/SKILL.md` — /apply <patchId>: `bw-edit apply` with D-04/D-09 flags; refuses unknown patchId; points at revert.
- `pi-pack/skills/diff/SKILL.md` — /diff <patchId>: `bw-edit preview` → on-demand StateDiff pane; motif score + boundary.

**Contract tests (structural — the live UX feel is the manual checkpoint M2):**
- `pi-pack/skills/vary/skill.test.ts` (7 assertions), `pi-pack/skills/apply/skill.test.ts` (8), `pi-pack/skills/diff/skill.test.ts` (7) — frontmatter + CLI shell target + hard-rule invariants + T-3-22 no-wire-protocol guard. Zero-dep inline YAML parser (metadata is a JSON literal).

**Test infra (BLOCKER-02 defense):**
- `daemon/vitest.config.ts` — `include` extended with `'../pi-pack/skills/**/*.test.ts'` + comment documenting the false-green hazard.

**Manual-gate recording slots (no observations fabricated):**
- `docs/bitwig-capabilities.md` §1 (M1 undo step-count) + §2 (M4 NoteStep.start grid-lock) — PENDING slots marked for the human verifier.

## Decisions Made
- **BLOCKER-02 vitest-include defense (the load-bearing test-infra fix):** the skill contract tests live at `pi-pack/skills/*/skill.test.ts`, OUTSIDE `daemon/vitest.config.ts`'s include glob. vitest 4.x's `-- skill` CLI filter does NOT override `include`; without the glob entry the 3 contract tests would NEVER RUN and `npm test -- skill` would exit 0 vacuously ("No test files found"), a false green exactly the Nyquist Dimension 8a failure mode. Extended include to `["src/**/*.test.ts", "../fixtures/**/*.test.ts", "../pi-pack/skills/**/*.test.ts"]`, mirroring the 02-05 `../fixtures` precedent already documented in the config comment. Proven by the discriminator `Test Files 3 passed (3)` (under `NO_COLOR=1` to strip ANSI so the rg matches). This is the single most important infra decision of the plan — without it, every downstream "tests pass" claim is suspect.
- **No yaml dependency for the contract tests:** the skill-doc frontmatter is flat (name/description/user-invocable scalars + metadata as a JSON object literal with quoted keys). A 12-line inline parser (regex for scalars, `JSON.parse` for the metadata brace-literal) handles it without adding `js-yaml` to the daemon devDeps. Keeps the contract test zero-dep + matches the plan's "no new deps" stance + avoids a package-manager install (RULE 3 exclusion territory).
- **Plan status is `pending-uat`, NOT `complete`:** Task 1 (the autonomous Pi skills + contract tests) is done + committed, but Task 2 is the M1–M5 human-verify checkpoint (live Bitwig + human ears + Pi interaction) and is BLOCKING. UX-02 is implemented but NOT verified; the requirement is NOT marked complete (requirements-completed: []) until M2/M3/M5 producer-confirm + M4 grid-lock finding recorded. The phase is not yet complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Skill hard-rule self-tripped the T-3-22 wire-protocol leakage guard**
- **Found during:** Task 1 GREEN (first run: 19/22 passed, 3 failed)
- **Issue:** The Hard rule in each SKILL.md originally read "Never teach the producer (or emit) the daemon **JSON-Lines** wire protocol." The T-3-22 contract test (correctly) asserts the body must NOT contain "json-lines" (case-insensitive) — so the skill's own prohibition tripped the leakage guard. The intent (don't teach Pi the wire protocol) was correct; the wording collided with the blunt-instrument test.
- **Fix:** Reworded the Hard rule in all 3 skills to "Never teach the producer (or emit) the daemon wire protocol" — dropped the literal "JSON-Lines" qualifier. The concrete-leakage checks (`127.0.0.1:7878`, `apply.patch`) still guard the actual wire-protocol surface; naming "JSON-Lines" in a prohibition was never required for correctness.
- **Files modified:** pi-pack/skills/vary/SKILL.md, pi-pack/skills/apply/SKILL.md, pi-pack/skills/diff/SKILL.md
- **Verification:** `npm test -- skill` → `Test Files 3 passed (3)`, `Tests 22 passed (22)`.
- **Committed in:** eb91898 (Task 1 GREEN — fix applied before the GREEN commit landed)

**2. [Rule 3 - Blocking] Acceptance-criterion rg discriminator failed under vitest's ANSI-colored TTY output**
- **Found during:** Task 1 GREEN (AC7 verification)
- **Issue:** The plan's AC7 discriminator `npm test -- skill 2>&1 | rg 'Test Files\s+[1-9][0-9]*\s+(passed|done)'` returned exit 1 even though the tests ran. vitest 4.x emits ANSI color codes (`\e[2m`, `\e[32m`, etc.) when piped, so between "Test Files" and "3" there are escape sequences that `\s+` (whitespace-only) does not match — a false AC failure, NOT a false green.
- **Fix:** Run under `NO_COLOR=1` (vitest respects it to emit plain text). The plain output `Test Files  3 passed (3)` matches the rg pattern cleanly (RG_EXIT=0). This is an environment/verification artifact, not a test or skill defect — the BLOCKER-02 proof (tests RUN vs vacuous green) is fully established by the `3 passed (3)` line either way.
- **Verification:** `NO_COLOR=1 npm test -- skill 2>&1 | rg 'Test Files\s+[1-9][0-9]*\s+(passed|done)'` → exit 0, prints `Test Files  3 passed (3)`.
- **Committed in:** N/A (no source change — the NO_COLOR prefix is the AC invocation convention; documented here for the verifier).

---

**Total deviations:** 2 auto-fixed (1 Rule-1 wording bug, 1 Rule-3 verification-environment artifact)
**Impact on plan:** Both auto-fixes were minor. The Rule-1 fix is a wording tightening that preserves the T-3-22 guard's intent. The Rule-3 fix is a verification-invocation convention (NO_COLOR), not a source change. No scope creep — every Task-1 deliverable shipped + all 7 acceptance criteria pass (AC7 under the documented NO_COLOR convention).

## Task 2 / Manual UAT (BLOCKING — pending human)

**Task 2 is a `checkpoint:human-verify` gate. Per the autonomous:false plan frontmatter + the executor task_strategy directive, it was NOT auto-passed.** The M1–M5 checkpoints require live Bitwig behavior, human-ear musicality, and Pi UX legibility that no automated test can reach (the contract tests pin the skill-doc STRUCTURE; the live feel is the manual gate). Returned to the orchestrator/user as `## CHECKPOINT REACHED` with the full M1–M5 checklist.

The autonomous docs-prep piece was done (commit `4edf805`): clearly-labelled PENDING recording slots marked in `docs/bitwig-capabilities.md` §1 (M1) + §2 (M4). NO observed values fabricated (D-02).

## Issues Encountered
- **vitest 4.x ANSI + the rg discriminator (see Deviation 2):** the AC7 rg pattern needs `NO_COLOR=1` to match vitest's piped output. Not a defect — a verification-invocation convention. Documented so the verifier + future executors run AC7 correctly.

## Threat Flags

None — the new surface (3 Pi skill docs shelling to the bw-* CLI) is fully covered by the plan's `<threat_model>` register:
- **T-3-22 (skill teaches Pi the wire protocol): MITIGATED** — each SKILL.md shells to `bw-midi`/`bw-edit` only; the contract test asserts `requires.bins` + the `bw-*` command reference + the absence of `127.0.0.1:7878`/`json-lines`/`apply.patch` in the body. No JSON-Lines wire detail in any skill.
- **T-3-23 (apply without preview): MITIGATED** — /apply Hard rule refuses an unknown patchId without a prior `/vary` or preview; the daemon candidate-store also returns `candidate_not_found` (Plan 02).
- **T-3-24 (skill omits risk/assumptions): MITIGATED** — UX-06: every candidate line + every apply result carries risk + assumptions; the contract test asserts the Hard rules mention D-15/D-04/D-09.
- **T-3-SC (package legitimacy): N/A** — no package installs; skills are markdown + the CLI already installed in Plans 01–04. The zero-dep inline YAML parser avoids even a `js-yaml` devDep addition.

No unmodeled threat surface introduced.

## User Setup Required
None — no external service configuration required. The skills shell out to the `bw-*` CLI already shipped in Plans 01–04. The Task 2 manual UAT requires: Bitwig Studio 6.0.6 + the rebuilt `.bwextension` (for M1/M4), the daemon running (`cd daemon && npm start`) + the Pi client (for M2/M3/M5), and the producer's ears.

## Next Phase Readiness
- **Task 1 (Pi UX layer) is READY:** the producer can run `/vary` → pick → `/apply` → `/diff` entirely from Pi once Task 2 UAT passes. The skills shell to the CLI shipped in Plans 02/04; the contract tests pin the load-bearing structure.
- **Task 2 (M1–M5 manual UAT) is the closing gate for Phase 3.** Until M2/M3/M5 are producer-confirmed + M4 grid-lock finding recorded (and M1 finding recorded as non-blocking caveat), Phase 3 is NOT complete. UX-02 is implemented but not verified (requirements-completed: []).
- **If M4 finds NoteStep.start is grid-locked:** flag to the planner — the bridge write path changes (size `createLauncherCursorClip` gridWidth to the shortest note, OR quantize patch-op `start` to the grid). This is a potential follow-up plan before Phase 3 is marked complete.
- **BLOCKER-02 (vitest false-green) CLOSED:** the skill contract tests are proven to RUN (not vacuously skipped). The discriminator holds under `NO_COLOR=1`.

## TDD Gate Compliance
- ✅ Task 1: `test(03-05)` RED `e3e6af4` → `feat(03-05)` GREEN `eb91898`
- ⏸ Task 2: human-verify checkpoint (no TDD cycle — the M1–M5 UAT is the gate; returned as `## CHECKPOINT REACHED`).
- Plan-level gate: the autonomous task (Task 1) has a test commit before a feat commit ✓.

---
*Phase: 03-reversible-midi-patching-m2*
*Task 1 completed: 2026-06-30 — Task 2 (M1–M5 manual UAT) PENDING HUMAN*

## Self-Check: PASSED

- All 8 Task-1 key-files exist on disk (3 SKILL.md + 3 skill.test.ts created; vitest.config.ts + bitwig-capabilities.md modified). ✅
- All 3 task commit hashes present in `git log` (e3e6af4 RED, eb91898 GREEN, 4edf805 docs-prep). ✅
- SUMMARY.md exists at `.planning/phases/03-reversible-midi-patching-m2/03-05-SUMMARY.md`. ✅
- `cd daemon && NO_COLOR=1 npm test -- skill` → `Test Files 3 passed (3)`, `Tests 22 passed (22)` (contract tests RUN, not vacuous green — BLOCKER-02 proven). ✅
- BLOCKER-02 discriminator: `NO_COLOR=1 npm test -- skill 2>&1 | rg 'Test Files\s+[1-9][0-9]*\s+(passed|done)'` → exit 0. ✅
- Full daemon suite: 491 tests green (469 baseline + 22 new skill tests, no regressions). ✅
- T-3-22 no-wire-protocol guard: all 3 skill bodies verified free of `127.0.0.1:7878` / `json-lines` / `apply.patch`. ✅
- Task 2 (M1–M5 manual UAT): NOT auto-passed — returned as `## CHECKPOINT REACHED`. docs/bitwig-capabilities.md §1/§2 PENDING slots marked (no observations fabricated). ✅
