# ADR-0003: Patch trust spine — daemon-authoritative journal, frozen inverses, pre-flight gates

## Status

Accepted (2026-06-30, Phase 3); amended 2026-07-06 (pre-flight gates, Phase 03.1); amended 2026-08-23 (device gates, Phase 5)

## Context

The assistant must never wreck the song. Every mutation path (CLI, Pi skills, CLAP drawer, live MIDI approval) must flow through one authority so nothing bypasses preview, risk gating, or undo.

## Decision

1. **All mutations are patch objects** (`scope → operations → rationale → reversibility → risk`) with a mandatory `undoLabel`; the edit schema enforces this at validation time, so the bridge can refuse unlabeled edits mechanically.
2. **Risk gating:** low risk may be one-step; medium/high require explicit confirmation; multi-track is high by definition; scope mismatch (`touched ⊋ declared`) hard-errors. The classifier floors by op kind for the creative tier; identity-stable cleanup transforms (voice-leading-fix, humanize) self-declare low.
3. **Daemon-authoritative journal:** `patch-history.jsonl` freezes the inverse ops at apply time, while the daemon holds authoritative before-state. Revert replays the frozen inverse; Bitwig native undo is best-effort only.
4. **Pre-flight gates before any bridge round-trip:** `wrong_clip_targeted` (candidate.previewClipSid vs state.selection.clipSid) and later `wrong_device_targeted` (selection.deviceSid) refuse early, surfacing expected/actual/hint. Legacy candidates lacking these fields proceed with surfaced assumptions rather than losing the recovery path.
5. **Note identity** is `pitch:startQuantized` on a 1/64 grid; pitch change = remove+add, never an in-place field update.
6. Approval is atomic compare-and-delete before side effects; existing edits delegate to the shared EditService; live MIDI stays outside the journal.

## Consequences

- Revert is mechanically guaranteed even under drifted host state (SC#2).
- A silently-wrong-target apply is impossible without a pre-flight mismatch being surfaced first (closed the 2026-07-04 live UAT critical blocker).
- The CLAP drawer reuses these same seams — approval never consults visible focus, so focus races cannot retarget a patch.
