---
name: apply
description: Apply a candidate patch by patchId via bw-edit apply. Med/high risk requires --confirm; below-bar overrides require --allow-below-bar --confirm (D-09).
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-edit"]}}}
---

<!-- Source: docs.openclaw.ai/tools/skills (verified) + CONTEXT.md D-04/D-09 + UX-02 -->
<!-- Transcribed from 03-RESEARCH.md §Code Examples "Pi /vary + /apply SKILL.md" lines 1146-1165 -->

# /apply <patchId> — apply a candidate

You are applying a candidate patch the producer picked from `/vary` or previewed
with `bw-edit preview`. Every apply is a DELIBERATE second action (D-04 — no
interactive prompt, no background edits). You shell out to `bw-edit`; you never
speak the daemon wire protocol.

## Steps

1. Receive the `patchId` (from a `/vary` summary line, a `/diff` pane, or the
   producer pasting one). If the patchId is UNKNOWN to you (no prior `/vary` or
   preview in this session), REFUSE and tell the producer to preview first —
   never apply a patch you have not seen previewed.
2. Run `bw-edit apply <patchId>` with the risk-appropriate flags (D-04/D-09):
   - low risk: `bw-edit apply <patchId>` (no extra flags).
   - medium / high risk: add `--confirm`.
   - below-bar override (`status: "refused"` near-miss the producer explicitly
     accepts): add `--allow-below-bar --confirm`. The `--allow-below-bar` flag
     RECLASSIFIES the patch as HIGH risk and STILL requires `--confirm` (D-09).
3. Print the result the CLI returns — either the success envelope
   `{ok: true, appliedOps: N, patchId, undoLabel}` or the structured failure
   (`candidate_not_found` / `confirmation_required` / `below_bar_requires_confirm`).
4. Tell the producer:
   - the apply is recorded in `.bw-brain/patch-history.jsonl` (the
     daemon-authoritative journal, D-03); and
   - `bw-edit revert <patchId>` fully reverses it (the journal replays the
     inverse operations stamped at apply time — INV-14).

## Hard rules (D-04 / D-09)

- NEVER apply a patchId you have not seen previewed in this session — if it is
  unknown, run `/vary` or tell the producer to run `bw-edit preview` first.
  (T-3-23 — apply-without-preview is the tampering vector.)
- `--allow-below-bar` RECLASSIFIES the patch as HIGH risk and STILL requires
  `--confirm` (D-09). No silent degradation into a casino-MIDI patch.
- EVERY result line carries the risk class + assumptions (UX-06). No apply
  without its risk surfaced.
- Shell to `bw-edit` ONLY. Never teach the producer (or emit) the daemon
  wire protocol — the CLI is the stable interface (AGENTS.md).

## Freshness gate (D-10)

The daemon's `stateFreshness` field is `live` | `stale` | `disconnected`.
- `live` and `stale` are BOTH trustworthy — the daemon pulls fresh state over the
  connected bridge on every `bw-midi vary` / `bw-edit apply` / `bw-edit revert`
  call. Mutation safety is the daemon-authoritative journal + the fresh pull, NOT
  the watchdog's last-push timestamp (commit 7a7e7cf).
- `disconnected` (no bridge) is a HARD REFUSAL — the CLI returns
  `error:"state_disconnected"`. Tell the producer to relaunch Bitwig / re-enable
  the bw-brain controller.

## Wrong-clip targeting (D-04/D-06)

If the producer selects a different clip between `/vary` (preview) and `/apply`,
the daemon refuses with `error:"wrong_clip_targeted"` carrying `expectedClipSid`,
`actualClipSid`, and a `hint`. Surface the hint verbatim — tell the producer to
re-select the previewed clip (or re-preview). Do NOT attempt to override.
