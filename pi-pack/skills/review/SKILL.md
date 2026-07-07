---
name: review
description: Run bw-arrange review on the current project and render an ASCII section timeline + unicode energy sparkline + repetition clusters + transition observations.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-arrange"]}}}
---

<!-- Source: docs.openclaw.ai/tools/skills (verified) + CONTEXT.md D-11 + UX-03 -->
<!-- Mirrors pi-pack/skills/vary/SKILL.md (shell-to-CLI + Hard rules + Freshness gate)
     + pi-pack/skills/analyze/SKILL.md (assumptions[] on every line, Pitfall 7). -->

# /review — arrangement critique

You are running `bw-arrange review` on the producer's project and rendering an
**ASCII section timeline + unicode energy sparkline + repetition clusters +
transition observations** as a text block. The analysis lives behind the CLI
(D-12 P2 — Pi wraps the CLI; never teaches Pi the wire protocol). Transition
observations are **ADVISORY** (D-10) — the producer acts manually in Bitwig.

## Steps

1. Run `bw-arrange review --json` to get the aggregate critique payload. It
   carries `sections[]`, `energyCurve[]`, `repetition[]`,
   `transitionObservations[]`, plus a top-level `pulledAt` ISO timestamp and
   the daemon's `stateFreshness` (`live` | `stale` | `disconnected`).
2. (Optional, for the State line) Run `bw-arrange current-section --json` to
   look up the section label covering the producer's last-selected scene.
3. Render the text block in this exact shape (research §Pi /review rendering):

   ```
   State:
     Section: <label or —>   Freshness: <live|stale>
     assumptions: [{claim:"section reflects last-selected scene, not transport-launched", confidence:1.0, source:"selection"},
                   {claim:"analysis derived from snapshot pulled at <pulledAt>", confidence:1.0, source:"snapshot"}]

   Timeline (<N> scenes):
     0:<label0>   1:<label1>   2:<label2>   ...   <N-1>:<label or —>
     ▄▄▅▅▆▆▇▇     ▅▅▆▆▇▇██     ████████     ...   ▁▁▁▁▁▁
     assumptions: [{claim:"labels below CONFIDENCE_THRESHOLD=0.5 are omitted (refuse rather than guess)", confidence:1.0, source:"runAll gate"},
                   {claim:"derived from snapshot pulled at <pulledAt>", confidence:1.0, source:"snapshot"}]

   Energy sparkline (per-scene aggregate, normalized 0-1 against project peak):
     ▃ ▄ ▇ █ ▇ █ ▅ ▂
     assumptions: [{claim:"weighted composite: density + velocity + polyphony + pitch centroid (genre-profile weights)", confidence:1.0, source:"profile"},
                   {claim:"derived from snapshot pulled at <pulledAt>", confidence:1.0, source:"snapshot"}]

   Repetition clusters:
     - scenes [<i>, <j>, ...] (<label>, <label>, ...) similarity=<score> matchedOn=[<dims>]
       assumptions: [{claim:"derived from snapshot pulled at <pulledAt>", confidence:1.0, source:"snapshot"}]

   Transition observations (ADVISORY — act manually in Bitwig):
     - scene <i>→<j> (<label> → <label>): energy drop <from> → <to> — consider a transition riser
       assumptions: [{claim:"derived from per-scene energy composite", confidence:1.0, source:"default"},
                     {claim:"derived from snapshot pulled at <pulledAt>", confidence:1.0, source:"snapshot"}]
     - scene <k> is ungrouped (no repetition cluster) — may benefit from variation
       assumptions: [{claim:"repetition threshold from genre profile", confidence:1.0, source:"config"},
                     {claim:"derived from snapshot pulled at <pulledAt>", confidence:1.0, source:"snapshot"}]
   ```

   The unicode block chars for the sparkline are `▁▂▃▄▅▆▇█` (eight steps, 0-1
   mapped to indices 0-7). One char per scene for the sparkline; the timeline
   row uses a per-scene mini-bar of the same chars repeated for visual weight.
4. Tell the producer the follow-ups:
   - `bw-arrange refresh` if the project has changed since `<pulledAt>`.
   - `bw-arrange sections --explain` / `bw-arrange repetition-report --explain` /
     `bw-arrange energy-curve --explain` for detail on any one signal.
   - Transition observations are **advisory** — act on them manually in Bitwig
     (the patch model is single cursor-clip scoped, P3 D-01; project-level
     arrangement advice is a category error to force into a clip patch — D-10).

## Hard rules (D-10 / D-11 / Pitfall 7 / Pitfall 8)

- EVERY output line carries its grounding. The `pulledAt` ISO timestamp is in
  EVERY `/review` as an assumption — the producer always knows how stale the
  analysis is (Pitfall 8 — snap-stale defense; the freshness gate below is the
  contract, the pulledAt assumption is the surfaced evidence).
- Shell to `bw-arrange` ONLY. NEVER teach the producer (or emit) the daemon
  wire protocol — the daemon's TCP endpoint, its line-delimited JSON envelope,
  and its patch envelope are all daemon-internal. The CLI is the stable
  interface (AGENTS.md / T-3-22).
- Transition observations are **ADVISORY** (D-10) — NEVER auto-apply, NEVER
  route through the daemon's patch envelope, NEVER mint a patchId for a
  transition. The producer acts manually in Bitwig.
- DO NOT invent section labels the daemon didn't return (Pitfall 7). The
  analyzer gate (`CONFIDENCE_THRESHOLD = 0.5` in `runAll`) is the contract —
  below-threshold clusters are `unknown` or omitted, NEVER guessed. If a scene
  has no label, render `—`, not a guess.

## Freshness gate (D-10 — copied verbatim from /vary)

The daemon's `stateFreshness` field is `live` | `stale` | `disconnected`.
- `live` and `stale` are BOTH trustworthy — the daemon pulls fresh state over
  the connected bridge on every `bw-arrange review` call (or reads the durable
  snapshot when the bridge is up but the grid hasn't changed). Mutation safety
  is the daemon-authoritative snapshot + the fresh pull, NOT the watchdog's
  last-push timestamp.
- `disconnected` (no bridge) is a HARD REFUSAL — the CLI returns
  `error:"state_disconnected"`. Tell the producer to relaunch Bitwig / re-enable
  the bw-brain controller. Refuse rather than guess from a stale snapshot when
  the bridge is down — the pulledAt assumption is honesty about staleness, not
  license to analyze against a possibly-stale grid.
