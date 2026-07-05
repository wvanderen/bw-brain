---
name: vary
description: Run bw-midi vary on the selected clip and list 3 motif-preserving A/B/C variant candidates as summary lines. User picks; /apply runs the edit pipeline.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-midi","bw-edit"]}}}
---

<!-- Source: docs.openclaw.ai/tools/skills (verified) + CONTEXT.md D-15 + UX-02 -->
<!-- Transcribed from 03-RESEARCH.md §Code Examples "Pi /vary + /apply SKILL.md" lines 1109-1144 -->

# /vary — motif-preserving A/B/C MIDI variants

You are running `bw-midi vary` on the user's live selected clip and listing the 3
A/B/C candidates as SUMMARY lines. The diff pane renders ON-DEMAND only (`/diff`)
— the picking signal is motif-similarity, NOT note detail (D-15). You shell out
to the `bw-midi` CLI; you never speak the daemon wire protocol.

## Steps

1. Run `bw-midi vary --json` to get the 3 candidates (A/B/C). Each candidate
   carries `label` / `description` / `risk` / `motifSimilarity` / `patchId` and
   either clears the motif threshold OR carries `status: "refused"`.
2. Render each as ONE summary line — NO inline diffs:

   ```
   [A] vary/rhythmic-displacement | risk: medium | motif: 0.91 | shifts 20% of notes ±1 step   → pt_<id>
   [B] vary/interval-contraction  | risk: medium | motif: 0.87 | moves notes 1 scale-degree toward tonic → pt_<id>
   [C] vary/octave-overlay        | risk: medium | motif: 0.95 | adds low-velocity octave doublings → pt_<id>
   ```

   If a candidate was REFUSED (below bar), render the visibility shape — do NOT
   hide it, do NOT let the producer apply it without the override:

   ```
   [B] vary/interval-contraction | REFUSED (motif 0.78 < 0.85) | near-miss available via --allow-below-bar → pt_<id>
   ```

3. Tell the user the apply/diff follow-ups:
   - "say `apply A` or `/apply pt_<id>` to apply; med/high risk adds `--confirm`."
   - "say `/diff pt_<id>` to preview the diff first."

## Hard rules (D-15)

- NEVER render inline diffs in /vary output — the picking signal is
  motif-similarity, not note detail. Diff detail lives behind `/diff`.
- EVERY candidate summary line carries motif-similarity + risk (UX-06
  assumptions). No suggestion without its risk + its motif score.
- A REFUSED candidate (`status: "refused"`) is VISIBILITY, NOT applicable — do
  not let the producer apply it without `--allow-below-bar` (which D-09
  reclassifies as high risk + still requires `--confirm`).
- Shell to `bw-midi` / `bw-edit` ONLY. Never teach the producer (or emit) the
  daemon wire protocol — the CLI is the stable interface (AGENTS.md).

## Freshness gate (D-10)

The daemon's `stateFreshness` field is `live` | `stale` | `disconnected`.
- `live` and `stale` are BOTH trustworthy — the daemon pulls fresh state over the
  connected bridge on every `bw-midi vary` call. Mutation safety is the
  daemon-authoritative journal + the fresh pull, NOT the watchdog's last-push
  timestamp (commit 7a7e7cf).
- `disconnected` (no bridge) is a HARD REFUSAL — the CLI returns
  `error:"state_disconnected"`. Tell the producer to relaunch Bitwig / re-enable
  the bw-brain controller.
