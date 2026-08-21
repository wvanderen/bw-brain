---
status: testing
phase: 04-arrangement-intelligence-m3
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-06-SUMMARY.md]
mode: mvp
goal: "The assistant delivers genuinely useful project-level arrangement critique — sections, repetition, energy, transitions, and track roles — as observation/suggestion only (Bitwig's API cannot edit the arranger, so edits route through launcher clips or remain advisory)."
started: 2026-07-07T01:32:01Z
updated: 2026-07-07T01:32:01Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running daemon + Bitwig bridge. Start Bitwig (with a project that has
  launcher clips), load the bridge controller script, then start the daemon
  (`npm start` in daemon/). The daemon boots without errors, the bridge connects
  (console shows `wireClipLauncherSlotsEager: done registered=128 nullBanks=0`),
  and a primary query returns live data (e.g. `bw-arrange review` does not error
  with a connection failure). No silent startup failures or missing-env errors.
awaiting: user response

## Tests

### Section A — User-Flow Walk-Through (runs first; stop on first failure)

### 1. Cold Start Smoke Test
expected: Kill any running daemon + Bitwig bridge. Start Bitwig (with a project that has launcher clips), load the bridge controller script, then start the daemon. Daemon boots without errors, the bridge connects (Bitwig console shows `wireClipLauncherSlotsEager: done registered=128 nullBanks=0`), and a primary query returns live data instead of a connection error.
result: [pending]

### 2. Refresh the Arrangement Snapshot
expected: Run `bw-arrange refresh`. It re-pulls the launcher grid from Bitwig, runs all 4 M3 analyzers (sections, repetition, energyCurve, trackRoles), and saves `.bw-brain/arrangement-snapshot.json` + `.bw-brain/roles.json`. Output indicates success (a JSON status / no error).
result: [pending]

### 3. View the Full Arrangement Review
expected: Run `bw-arrange review`. It aggregates sections + energyCurve + repetition + trackRoles + transitionObservations into one JSON payload, carrying a `pulledAt` timestamp. This is the single command that delivers "arrangement critique."
result: [pending]

### 4. View Current Section
expected: Run `bw-arrange current-section`. It reports which section label (e.g. intro/build/peak) covers the producer's last-selected launcher scene, with an assumption that it reflects the last-selected scene (not transport-launched).
result: [pending]

### 5. Invoke Pi /review Skill
expected: In Pi, invoke `/review`. It shells to `bw-arrange review --json` and renders an ASCII section timeline + unicode ▁▂▃▄▅▆▇█ energy sparkline + repetition clusters + transition observations. A `pulledAt` assumption is shown so the producer knows how stale the analysis is. Transition observations are framed as ADVISORY (producer acts manually in Bitwig).
result: [pending]

### Section B — Technical Checks (deferred; run after Section A passes)

### 6. Section Breakdown
expected: Run `bw-arrange sections --explain`. Shows labeled contiguous sections (label from profile.sectionLabels — intro/build/peak/breakdown/outro for generic, drop/break/roll for techno), each with a confidence value and an assumptions array. Below-threshold sections show "unknown."
result: [pending]

### 7. Repetition Clusters
expected: Run `bw-arrange repetition-report --explain`. Shows groups of similar scenes with a similarity score and `matchedOn` attribution (which feature dimensions drove the match — e.g. pcp/density/velocity). Singletons are NOT reported (a group of one is not a repetition).
result: [pending]

### 8. Energy Curve
expected: Run `bw-arrange energy-curve --explain`. Shows per-bar energy values normalized to [0,1] with the loudest bar = 1.0. The curve reflects genuine intra-scene variation (a 16-beat scene yields ~4 distinct points, not one stepped value).
result: [pending]

### 9. Track Roles Present
expected: In the `bw-arrange review` output (or `.bw-brain/roles.json` after refresh), each track with clips has a role classification (e.g. kick/bass/lead/pad/hats) with confidence. Tracks with no clips are omitted (not classified "unknown"). Below-minConfidence tracks show role "unknown" with an assumption.
result: [pending]

### 10. D-10 Advisory Discipline (Transitions Have No Patch Fields)
expected: Transition observations in the review output contain observation text + energy delta + a manual hint — but NO `patchId`, `operations`, or `risk` fields. They are advisory only; the producer must act manually in Bitwig.
result: [pending]

### 11. Honest Confidence / Below-Threshold Refuse
expected: Analyzers emit honest confidence ∈ [0,1] (never pre-inflated to a 0.5 floor). Fields below 0.5 confidence are dropped from the review output entirely (runAll owns the floor). No analyzer silently floors its own confidence.
result: [pending]

### 12. pulledAt Freshness on Review
expected: The `bw-arrange review` payload carries a `pulledAt` ISO timestamp indicating when the launcher grid was last pulled. The Pi /review rendering surfaces pulledAt at every output line group (State, Timeline, Sparkline, Clusters, Transitions) — not just once.
result: [pending]

### 13. Atomic Stores on Disk
expected: After `bw-arrange refresh`, both `.bw-brain/arrangement-snapshot.json` and `.bw-brain/roles.json` exist, are valid JSON, and the snapshot's `derived` block carries the analyzer outputs. No leftover `.tmp` files (atomic POSIX temp+rename).
result: [pending]

### Section C — Coverage Check (goal-backward)

### 14. Goal Coverage — All Five Critique Dimensions
expected: The arrangement critique delivered by `bw-arrange review` / Pi `/review` covers ALL five dimensions named in the phase goal: (1) sections, (2) repetition, (3) energy, (4) transitions, (5) track roles. None is silently missing. The critique is observation/suggestion only — no arranger edits.
result: [pending]

## Summary

total: 14
passed: 0
issues: 0
pending: 14
skipped: 0
blocked: 0

## Gaps

[none yet]

## Rebaseline classification (2026-08-20, Phase 04.3)

> Additive rebaseline record (Phase 04.3, requirement RB-03). Every row above keeps its
> original text and `result: [pending]` marker untouched — this block classifies
> acceptance history, it never completes it. The focused CLAP-native replacement
> ledger lives at
> `.planning/phases/04.3-clap-first-product-rebaseline-and-roadmap-reconciliation/04.3-UAT.md`.

Legend: **retained-CLI** = still exercisable through the `bw-arrange` CLI contract;
**superseded-UI** = the external Pi acceptance surface is replaced by the CLAP-native
flow; **product-gap** = no current surface satisfies the row (none found).

| # | Test | Classification | Justification |
|---|------|----------------|---------------|
| 1 | Cold Start Smoke Test | retained-CLI | Daemon/bridge boot behavior is unchanged by Phase 04.3; the smoke path (start Bitwig, load bridge, `npm start`, primary query) remains exercisable via the CLI (RESEARCH A4). |
| 2 | Refresh the Arrangement Snapshot | retained-CLI | `bw-arrange refresh` remains a retained CLI subcommand; Plan 04.3-02 reuses the same snapshot store for the CLAP flow. |
| 3 | View the Full Arrangement Review | retained-CLI | `bw-arrange review` five-dimension JSON remains the stable secondary contract (byte-identical output per Plan 04.3-02). |
| 4 | View Current Section | retained-CLI | `bw-arrange current-section` remains a retained CLI subcommand, unchanged this phase. |
| 5 | Invoke Pi /review Skill | superseded-UI | The external Pi `/review` ASCII-pane acceptance surface is superseded by the CLAP-native hosted Review flow (Plans 04.3-02/04.3-03); the underlying `bw-arrange review --json` shell remains a CLI-wrapping asset. |
| 6 | Section Breakdown | retained-CLI | `bw-arrange sections --explain` remains exercisable through the CLI contract. |
| 7 | Repetition Clusters | retained-CLI | `bw-arrange repetition-report --explain` remains exercisable through the CLI contract. |
| 8 | Energy Curve | retained-CLI | `bw-arrange energy-curve --explain` remains exercisable through the CLI contract. |
| 9 | Track Roles Present | retained-CLI | Track-role classification remains in the `bw-arrange review` payload / `.bw-brain/roles.json`, CLI-verifiable. |
| 10 | D-10 Advisory Discipline (Transitions Have No Patch Fields) | retained-CLI | The no-patch-fields invariant is still verifiable in `bw-arrange review` output; the CLAP render path inherits the same discipline (04.3-UAT row 8). |
| 11 | Honest Confidence / Below-Threshold Refuse | retained-CLI | Analyzer confidence flooring remains a CLI-verifiable property of the review payload; unchanged by the rebaseline. |
| 12 | pulledAt Freshness on Review | retained-CLI | The payload's `pulledAt` timestamp remains CLI-verifiable; the per-group render half now lives in the CLAP-native flow (04.3-UAT row 4). |
| 13 | Atomic Stores on Disk | retained-CLI | `.bw-brain/arrangement-snapshot.json` + `roles.json` atomic writes remain CLI-exercisable via `bw-arrange refresh`. |
| 14 | Goal Coverage — All Five Critique Dimensions | retained-CLI | Five-dimension coverage remains verifiable in `bw-arrange review` JSON; CLAP-native render coverage is 04.3-UAT row 1. |

product-gap rows: none — every legacy row is either retained through the CLI contract
or (row 5's pane acceptance) superseded by the CLAP-native arrangement review flow.
