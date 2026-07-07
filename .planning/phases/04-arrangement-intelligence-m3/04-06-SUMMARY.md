---
phase: 04-arrangement-intelligence-m3
plan: 06
subsystem: ui
tags: [pi-skill, review, ascii-timeline, energy-sparkline, d-11, d-10, advisory-only, freshness-gate, pulledAt, contract-test, BLOCKER-02]

# Dependency graph
requires:
  - phase: 04-arrangement-intelligence-m3 (Plan 04-05)
    provides: bw-arrange review multicall (the aggregate CLI this skill shells to — emits sections/energyCurve/repetition/transitionObservations/pulledAt/stateFreshness JSON)
  - phase: 02-read-only-context-foundation-m1 (Plan 02-05)
    provides: Pi skill + contract-test discipline (shell-to-CLI + assumptions[] on every line + BLOCKER-02 vitest-include glob)
  - phase: 03-reversible-midi-patching-m2 (Plan 03-05)
    provides: vary/apply/diff SKILL.md + skill.test.ts pattern (parseSkillDoc minimal YAML parser + D-10 freshness gate verbatim text)
provides:
  - Pi /review skill (UX-03 / D-11) — shells to bw-arrange review --json, renders ASCII section timeline + unicode energy sparkline + repetition clusters + transition observations
  - skill.test.ts structural contract test (11 assertions — frontmatter + body; BLOCKER-02 vitest-include honored; NON-VACUOUS)
affects: [Phase 5 (automation salience reads roles.json + arrangement-snapshot.json — /review surfaces both); end-of-phase UAT (live Bitwig + human review of the full chain probe → snapshot → analyzers → CLI → /review rendering)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pi skill shells to CLI (D-12 P2) — /review is the 5th sibling in the {analyze, vary, apply, diff, review} skill set; all share the parseSkillDoc frontmatter parser + D-10 freshness gate verbatim text
    - Hand-rolled unicode block-char sparkline (▁▂▃▄▅▆▇█) — research rejected ascii-chart/sparkly npm packages (a 10-line renderer is trivially correct; libraries add bundle + a legitimacy gate)
    - pulledAt-as-assumption on every output line (Pitfall 8 — snap-stale defense; the producer always knows how stale the analysis is)

key-files:
  created:
    - pi-pack/skills/review/SKILL.md (101 lines — frontmatter + Steps + Hard rules + Freshness gate; ASCII timeline + sparkline + clusters + transitions rendering instructions)
    - pi-pack/skills/review/skill.test.ts (124 lines — 11 structural assertions; parseSkillDoc minimal YAML frontmatter parser copied verbatim from vary/skill.test.ts)

key-decisions:
  - "Prohibition prose must NOT enumerate the forbidden wire-protocol tokens verbatim — the D-10 source-grep problem from 04-05 (deviation #2) recurs whenever a Hard rule says 'no X, no Y, no Z' and the contract test regex-negates X/Y/Z. Rephrased to describe the patch envelope / TCP endpoint conceptually; the structural test (no literal tokens) is still the runtime guarantee."
  - "Sparkline rendered as hand-rolled unicode block chars (research §Pitfall — rejected ascii-chart/sparkly packages). Eight steps (▁▂▃▄▅▆▇█) map 0-1 → indices 0-7; one char per scene for the sparkline, the timeline row repeats per-scene for visual weight."
  - "pulledAt surfaced as an assumption on EVERY output line group (State, Timeline, Sparkline, Clusters, Transitions) — Pitfall 8 is not just 'pulledAt appears somewhere'; it's 'the producer always sees how stale the analysis is at every claim'."

patterns-established:
  - "/review completes the 5-sibling Pi skill set — the shell-to-CLI + assumptions[] + Hard rules + D-10 freshness gate shape is now the canonical pattern for any future read-side skill (e.g. a hypothetical Phase 5 /automate-salience skill would follow it)."
  - "ASCII timeline + unicode sparkline is the producer-legible arrangement critique format — no TUI framework dependency, renders in every terminal Pi supports."

requirements-completed: [UX-03]

# Metrics
duration: 2min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 06: Pi /review Skill (UX-03 / D-11) Summary

**Pi /review skill shells to `bw-arrange review --json` and renders an ASCII section timeline + unicode ▁▂▃▄▅▆▇█ energy sparkline + repetition clusters + transition observations — pulledAt assumption on every line, D-10 freshness gate (live+stale trustworthy, disconnected=refuse), transitions ADVISORY (producer acts manually in Bitwig); 11 structural contract assertions pass under the BLOCKER-02 vitest-include glob.**

## Performance

- **Duration:** 2 min (1 TDD cycle RED → GREEN)
- **Started:** 2026-07-07T00:38:55Z
- **Completed:** 2026-07-07T00:41:20Z
- **Tasks:** 1/1 (`tdd="true"`)
- **Files created:** 2
- **Full daemon suite:** 693 tests pass (was 682 in 04-05; +11 new from this plan's contract test; all prior tests green — no regression)

## Accomplishments

- **Pi /review skill lands (UX-03).** `pi-pack/skills/review/SKILL.md` (101 lines) completes the 5-sibling skill set {analyze, vary, apply, diff, review}. It shells to `bw-arrange review --json` via the OpenClaw exec tool (D-12 P2 — Pi wraps the CLI; never teaches Pi the wire protocol).
- **ASCII rendering instructions.** The Steps spell out the exact text-block shape from research §Pi /review rendering (lines 900-922): State line (section label + freshness), Timeline (scene-numbered with per-scene mini-bars), Energy sparkline (unicode ▁▂▃▄▅▆▇█ one char per scene), Repetition clusters (group/similarity/matchedOn), Transition observations (scene→scene with energy delta + manual hint). The sparkline is hand-rolled — research rejected ascii-chart/sparkly packages.
- **pulledAt on every output line group (Pitfall 8).** The snapshot's pulledAt ISO timestamp is surfaced as an assumption at the State, Timeline, Sparkline, Clusters, AND Transitions line groups — the producer always knows how stale the analysis is at every claim.
- **D-10 freshness gate copied verbatim from /vary.** `live` AND `stale` are BOTH trustworthy (daemon pulls fresh state per call); `disconnected` = HARD REFUSAL (refuse rather than guess from a stale snapshot when the bridge is down).
- **D-10 advisory discipline enforced.** Transition observations are ADVISORY — the Hard rules forbid auto-apply, forbid routing through the patch envelope, forbid minting a patchId for a transition. The producer acts manually in Bitwig (the patch model is single cursor-clip scoped, P3 D-01; project-level advice is a category error to force into a clip patch).
- **11-test structural contract passes (NON-VACUOUS).** `skill.test.ts` parses SKILL.md frontmatter (name/user-invokable/requires bw-arrange) + asserts body invariants (bw-arrange review ref / Hard rules / no wire protocol T-3-22 / D-10 freshness gate / pulledAt / advisory transitions / Pitfall 7 no-invented-labels). Runs under the BLOCKER-02 vitest-include glob — `npm test -- --run ../pi-pack/skills/review/skill.test.ts` returns Test Files 1 passed (11 tests), not vacuous 0.

## Task Commits

1. **Task 1 RED: failing contract test** — `2bea093` (test)
2. **Task 1 GREEN: implement SKILL.md** — `1cb4953` (feat)

**Plan metadata:** (this SUMMARY commit — `docs(04-06)`)

## Files Created/Modified

- `pi-pack/skills/review/SKILL.md` — NEW (101 lines). Frontmatter (name=review, user-invocable, metadata.openclaw.requires.bins=[bw-arrange]); Steps (run `bw-arrange review --json`; optional `bw-arrange current-section --json`; render ASCII timeline + sparkline + clusters + transitions text block with assumptions[] on every line group; follow-ups: refresh / per-signal --explain / advisory-act-manually); Hard rules (pulledAt grounding / shell to bw-arrange ONLY / transitions ADVISORY / no invented labels); Freshness gate (copied verbatim from /vary).
- `pi-pack/skills/review/skill.test.ts` — NEW (124 lines). 11 structural assertions under vitest. `parseSkillDoc` minimal YAML frontmatter parser (copied verbatim from vary/skill.test.ts — no yaml dependency). Assertions: name=review / user-invocable / requires bw-arrange bin / body contains bw-arrange review / Hard rules present / NO wire protocol (127.0.0.1:7878, json-lines, apply.patch — T-3-22) / live+stale trustworthy + disconnected=refuse (D-10) / stale NOT framed untrustworthy (regression guard) / pulledAt present (Pitfall 8) / advisory|manual (D-10) / invent|unknown|below-threshold|guess (Pitfall 7).

## Decisions Made

1. **Prohibition prose must not enumerate forbidden tokens verbatim.** The first GREEN attempt tripped the contract test's regex negation twice: the Hard rule bullet said "no `127.0.0.1:7878`, no `json-lines`, no `apply.patch`" (explaining T-3-22) AND "NEVER route through `apply.patch`" (explaining D-10). Rephrased both to describe the patch envelope / TCP endpoint / line-delimited JSON envelope conceptually. The structural test (no literal forbidden tokens in the body) is still the runtime guarantee — same scoping discipline as 04-05 deviation #2.
2. **Sparkline is hand-rolled unicode block chars.** Eight steps (▁▂▃▄▅▆▇█) map the 0-1 normalized energy to indices 0-7. Research §Pitfall rejected ascii-chart/sparkly npm packages (a 10-line renderer is trivially correct; the libraries add bundle + a legitimacy gate).
3. **pulledAt on every output line group, not just once.** Pitfall 8 is "the producer always knows how stale the analysis is" — that means pulledAt appears as an assumption at the State, Timeline, Sparkline, Clusters, AND Transitions line groups, not just at the top. The Hard rules make this explicit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prohibition prose tripped the wire-protocol regex negation**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** The Hard rule explaining T-3-22 enumerated the forbidden tokens verbatim ("no `127.0.0.1:7878`, no `json-lines`, no `apply.patch`"); the contract test's `expect(body).not.toMatch(/127\.0\.0\.1:7878/)` etc. caught them in the documentation prose. Same pattern as 04-05 deviation #2 (D-10 source grep matching comment text).
- **Fix:** Rephrased the Hard rule to describe the daemon's TCP endpoint / line-delimited JSON envelope / patch envelope conceptually — no literal forbidden tokens. A second occurrence in the D-10 advisory bullet ("NEVER route through `apply.patch`") required the same rephrase ("NEVER route through the daemon's patch envelope"). The structural test (no literal forbidden tokens) remains the runtime guarantee.
- **Files modified:** pi-pack/skills/review/SKILL.md (2 Hard rule bullets rephrased)
- **Verification:** All 11 contract assertions pass; grep `127\.0\.0\.1:7878|json-lines|apply\.patch` on SKILL.md returns 0 matches.
- **Committed in:** `1cb4953` (Task 1 GREEN)

---

**Total deviations:** 1 auto-fixed (1 bug — prohibition prose vs regex negation, same D-10 source-grep discipline as 04-05 #2)
**Impact on plan:** Auto-fix necessary for the contract test to pass. No scope creep — the T-3-22 invariant (no wire protocol in the skill body) is enforced exactly as specified; only the prose describing the prohibition changed.

## Issues Encountered

None beyond the 1 auto-fix above. The TDD RED → GREEN cycle completed cleanly after the prose rephrase. No daemon-side changes (the skill is pure documentation + a structural test); the full 693-test daemon suite confirms no regression.

## User Setup Required

None — no external service configuration required. The /review skill is a text artifact consumed by the Pi/OpenClaw runtime; it shells to `bw-arrange` which is part of the existing daemon CLI. End-of-phase UAT (live Bitwig + human review) validates the full chain.

## Next Phase Readiness

- **UX-03 complete at the skill layer.** The /review skill + its contract test land. The vertical slice (probe → snapshot → analyzers → CLI → /review rendering) is wired end-to-end; the end-of-phase UAT validates it live.
- **Phase 5 readiness.** `/review` surfaces `roles.json` (ARRANGE-05) and the arrangement snapshot's derived block — both are the gates Phase 5 automation salience reads. The skill pattern (shell-to-CLI + assumptions[] + D-10 freshness gate) is the template for any future read-side skill.
- **No blockers.** All acceptance criteria met; full daemon suite green (693 tests). D-10 advisory discipline + D-10 freshness gate + Pitfall 8 pulledAt + Pitfall 7 no-invented-labels + T-3-22 no-wire-protocol all enforced in the SKILL.md and asserted by the contract test.

## Self-Check: PASSED

- **Files created:** `pi-pack/skills/review/SKILL.md` (101 lines ≥ 50 min_lines ✓) + `pi-pack/skills/review/skill.test.ts` (124 lines ≥ 40 min_lines ✓) — both exist on disk.
- **Commits:** RED `2bea093` + GREEN `1cb4953` — both present (verified via `git log --oneline --grep="04-06"`).
- **must_haves.artifacts:** SKILL.md contains "bw-arrange review" (4 occurrences ✓); skill.test.ts contains "describe" (✓).
- **must_haves.key_links:** SKILL.md → arrange.ts via "bw-arrange review" Steps invocation (pattern confirmed).
- **Contract test NON-VACUOUS:** `npm test -- --run ../pi-pack/skills/review/skill.test.ts` → Test Files 1 passed (11 tests). BLOCKER-02 honored.
- **Plan-level `<verification>`:** full daemon suite `npm test -- --run` → 693 pass (49 test files); SKILL.md grep for wire-protocol tokens → 0 matches; D-10 freshness language present; pulledAt present.

## TDD Gate Compliance

Task 1 (`tdd="true"`) shipped the mandatory RED → GREEN commit sequence:

| Task | RED commit | GREEN commit | REFACTOR | Status |
|------|-----------|--------------|----------|--------|
| 1 (Pi /review SKILL.md + contract test) | `2bea093` ✓ | `1cb4953` ✓ | — (not needed — SKILL.md is already minimal and clean) | Pass |

No gate violations. The RED commit's test failed for the right reason (ENOENT on SKILL.md — the module under contract didn't exist yet). The GREEN commit's tests passed after minimal-to-pass implementation + 1 prose rephrase (documented as deviation #1). No REFACTOR commit — the SKILL.md is documentation; the GREEN implementation is already clean.

## Threat Mitigation Verification

The plan's `<threat_model>` assigned `mitigate` dispositions to 4 threats. All 4 mitigations are present in the SKILL.md + asserted by the contract test:

| Threat | Mitigation in SKILL.md | Contract test assertion |
|--------|------------------------|------------------------|
| T-04-20 (Tampering — skill auto-applies a transition) | Hard rule: "Transition observations are ADVISORY — NEVER auto-apply, NEVER route through the daemon's patch envelope, NEVER mint a patchId" | `expect(body).toMatch(/advisory\|manual/i)` ✓ |
| T-04-21 (Info Disclosure — skill teaches wire protocol) | Hard rule: "Shell to bw-arrange ONLY. NEVER teach the producer (or emit) the daemon wire protocol" | `expect(body).not.toMatch(/127\.0\.0\.1:7878/)` + `not.toContain("json-lines")` + `not.toMatch(/\bapply\.patch\b/)` ✓ |
| T-04-22 (Spoofing — stale snapshot presented as live) | pulledAt assumption on every output line group + Freshness gate: disconnected = HARD REFUSAL | `expect(body.toLowerCase()).toContain("pulledat")` + `expect(body).toMatch(/stale.*trustworthy\|trustworthy.*stale/i)` + `/disconnected.*refus\|refus.*disconnected/i` ✓ |
| T-04-23 (Repudiation — skill invents section labels) | Hard rule: "DO NOT invent section labels the daemon didn't return (Pitfall 7) — below-threshold = unknown or omitted, NEVER guessed" | `expect(body.toLowerCase()).toMatch(/invent\|unknown\|below.threshold\|guess/)` ✓ |

---

*Phase: 04-arrangement-intelligence-m3*
*Plan: 06*
*Completed: 2026-07-07*
