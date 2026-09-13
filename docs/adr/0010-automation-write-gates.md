# ADR-0010: Automation writes — write-arm gate, probe-pinned surface, prior honesty

## Status

Accepted (2026-08-23, Phase 5; from the dated 2026-08-22 live automation-write probe)

## Context

Phase 5 introduced bounded automation proposals/apply. The live probe needed to pin exactly which write semantics are real in Bitwig 6.0.11 before any code relied on them.

## Decision

1. **Write-arm (not transport) is the operative pre-flight gate.** Armed + stopped writes points (latched) — so `transport_stopped` is RETIRED as a refusal trigger. Unarmed/unobserved arm refuses `automation_write_disabled` before dispatch.
2. **JS write surface:** device-site `CursorRemoteControlsPage` parameter (verified Surge XT M1–M8; `set`/`setImmediately`/`setRaw` normalized 0..1 + touch). Value readback is ASYNC — the bridge must never verify writes synchronously. `Device.getParameter(int)` is JS-NEGATED live.
3. **Clip/launcher-targeted automation stays refused** as `ambiguous_target` (launcher-armed cells unverified — probe-pins-refuse-rest, never a guess-write).
4. **Risk floor:** automation ops are medium risk by op kind (remote-page macro targets medium, never self-declared low).
5. **Prior honesty:** bridge automation responses must carry `capturedPriorValue` or the daemon refuses `prior_unavailable` and journals nothing — never a guessed inverse. Authored inverses are manual-inverse with disclosure; the journal records the captured prior.
6. Removal surface (`remove_automation_points`) is unverified — the bridge honestly refuses removals (`removal_surface_unverified`), so automation revert may report `apply_failed` with Bitwig ⌘Z as recovery until the UAT arbitrates.

## Consequences

- The proposal→preview→approve→apply→revert flow rides the same candidate/pre-flight/controller/journal seams as note edits (medium risk → explicit confirmation).
- Automation proposals omit `transformIntent` (Phase-3 enum frozen); audit metadata rides rationale/undoLabel/curve block.
- The removal-surface question is a standing UAT item (see the Phase 5 UAT issue).
