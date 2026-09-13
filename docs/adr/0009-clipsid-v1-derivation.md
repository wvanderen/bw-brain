# ADR-0009: clipSid V1 derivation; V2 deferred

## Status

Accepted (2026-07-06, Phase 03.1; closes the 2026-07-04 live M4 UAT critical blocker)

## Context

extension-api:21 exposes no clip identity reader (javap-definitive: no `Clip.name()` reader). The daemon's selection state needs a stable clip ID so apply pre-flight can verify the target; a naive placeholder caused the "apply silently lands on the wrong clip" blocker (4-bar vs 8-bar clip collision).

## Decision

**clipSid V1** = `"clip_" + sha256(trackSid + ":" + loopBeats).slice(0,16)`. Push and pull paths share hash inputs (cursorTrackName + `getLoopLength().get()`) so both sides agree.

## Consequences

- Known residual: two clips on the same track with identical loop lengths collide (documented). V2 (content-sensitive identity) is deferred until a real collision occurs in practice.
- On reconnect, `refreshSnapshot` re-pulls `get.selected_clip` and folds clipSid (best-effort secondary pull; the primary `get.project_summary` stays authoritative).
- Device identity uses the parallel `deriveDeviceSid` cache shared with `parameter.changed` deviceKey, so `deviceKey` **is** the AutomationScope `deviceSid`.
