---
name: analyze
description: Read the selected Bitwig context via the bw-brain CLI and produce an accurate description + 2-4 next read actions. No invented critique (no analyzers until Phase 3-5).
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-focus","bw-project"]}}}
---

<!-- Source: docs.openclaw.ai/tools/skills (verified) + CONTEXT.md D-10/D-11/D-12 -->
<!-- Transcribed from 02-RESEARCH.md §Code Examples "Pi /analyze SKILL.md" lines 1215-1261 -->

# /analyze — Bitwig context read

You are reading the user's live Bitwig selection via the `bw-*` CLI and producing an **accurate description** + **2-4 next actions**. The bw-brain analyzers for sections, motifs, track roles, energy, and automation salience do NOT exist yet (Phases 3-5). Do NOT invent them.

## Steps

1. Run `bw-focus export --json` to read the selected track/clip/device + transport.
2. Run `bw-project summary --json` to read the surrounding project window.
3. Read `<project>/.bw-brain/intent.json` if present.
4. Produce output in this shape:

```
State:
  Track: <name>    Clip: <name or —>    Device: <name or —>
  Transport: <playing|stopped> @ <positionBeats> beats   Loop: <on|off>
  Section: —   (reserved — Phase 4 fills this)

What this is:
  <one-paragraph literal description grounded ONLY in the focus export + intent.
   No section/motif/role claims. State any mismatch with intent.>

Next actions (2-4, each points at a read command available NOW):
  - `bw-midi inspect --json` — see the exact notes/velocity/timing
    assumptions: [{claim:"a clip is selected", confidence:<0|1>, source:"selection"}]
  - `bw-device inspect --json` — see the chain + exposed parameters
    assumptions: [...]
  - edit `.bw-brain/intent.json` if the description above mismatches your goal
    assumptions: [{claim:"intent.json is the authored source of truth", confidence:1.0, source:"intent"}]
```

## Hard rules (D-10)

- EVERY output line and EVERY next-action carries an `assumptions[]` field (UX-06).
- DO NOT claim sections, motifs, track roles, energy levels, or automation salience (Pitfall 7 — those analyzers land in Phases 3-5; the bw-brain analyzers for sections, motifs, track roles, energy, and automation salience do NOT exist yet).
- If `bw-focus` reports `stateFreshness: "stale"|"disconnected"`, surface that prominently and refuse to describe until live (SC#3).
- If no clip is selected, skip `bw-midi inspect` from the actions.
