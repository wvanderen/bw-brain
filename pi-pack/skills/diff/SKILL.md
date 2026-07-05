---
name: diff
description: Render the StateDiff of a candidate patch on-demand via bw-edit preview. The picking signal lives in /vary; the diff pane is for when the producer wants the note detail.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-edit"]}}}
---

<!-- Source: docs.openclaw.ai/tools/skills (verified) + CONTEXT.md D-15 + UX-02 -->
<!-- Transcribed from 03-RESEARCH.md §Code Examples "Pi /vary + /apply SKILL.md" lines 1167-1192 -->

# /diff <patchId> — on-demand diff pane

You are rendering the StateDiff of a candidate patch ON DEMAND. The picking
signal is motif-similarity (surfaced in `/vary`); the diff pane is for when the
producer wants the note-level detail before applying (D-15). You shell out to
`bw-edit preview`; you never speak the daemon wire protocol.

## Steps

1. Run `bw-edit preview <patchId>` (or `bw-edit preview <patch-file>` for a
   draft the producer authored by hand). The daemon resolves the patch
   operations against the live clip state, classifies risk, mints a candidate
   patchId (if not already minted), and returns the StateDiff.
2. Render the StateDiff pane:

   ```
   ─── patch pt_<id> (vary/A, risk: medium) ─────────────────
   + added:    2 notes  [n:60:0.25, n:60:0.75]
   - removed:  1 note   [n:72:0.50]
   ~ changed:  3 notes  (velocity -8 avg, length +0.125 avg)
   scope:      clip_xyz | region: none
   motif:      0.91 (cleared 0.85)
   ─────────────────────────────────────────────────────────
   ```

   Surface the motif score AND the boundary it cleared (or, for a refused
   near-miss, the threshold it missed) so the producer can judge the trade-off.
3. Tell the producer: "say `/apply pt_<id> --confirm` to apply." For a refused
   near-miss, point at `--allow-below-bar --confirm` (D-09) — never apply a
   below-bar patch without the explicit override.

## Hard rules

- The diff pane is ON-DEMAND only — `/vary` never inlines it (D-15). Render it
  here when asked, not unprompted in `/vary` output.
- EVERY diff pane carries the motif score + risk + assumptions (UX-06).
- Shell to `bw-edit` ONLY. Never teach the producer (or emit) the daemon
  wire protocol — the CLI is the stable interface (AGENTS.md).

## Freshness gate (D-10)

The daemon's `stateFreshness` field is `live` | `stale` | `disconnected`.
- `live` and `stale` are BOTH trustworthy — the daemon pulls fresh state over the
  connected bridge on every `bw-diff` call. Mutation safety is the
  daemon-authoritative journal + the fresh pull, NOT the watchdog's last-push
  timestamp (commit 7a7e7cf).
- `disconnected` (no bridge) is a HARD REFUSAL — the CLI returns
  `error:"state_disconnected"`. Tell the producer to relaunch Bitwig / re-enable
  the bw-brain controller.
