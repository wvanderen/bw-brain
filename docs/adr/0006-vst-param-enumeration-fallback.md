# ADR-0006: VST/AU parameter enumeration — A1 negated; `cursorDevice.getParameter(int)` fallback

## Status

Accepted (2026-06-29, live probe with Surge XT + javap, Phase 2 UAT; fallback implemented in Phase 5)

## Context

The plan assumed VST/AU parameters would surface via `CursorRemoteControlsPage`. Live probing falsified this.

## Decision

**A1 is NEGATED:** `CursorDevice` exposes no `getRemoteControls()` in extension-api:21, and VST parameters do **not** appear via `CursorRemoteControlsPage` (pages come back empty for third-party devices). `bw-device inspect` returning empty pages for VSTs was correct behavior, not a bug.

The documented fallback is direct per-index enumeration via `cursorDevice.getParameter(int)`, adopted in Phase 5 as bounded VST/AU parameter enumeration.

## Consequences

- `docs/bitwig-capabilities.md §4` records the observed surface; extension-API claims are always javap/live-probe verified before use.
- Phase 5's device workflows pair `get.selected_device_chain` reads with the `getParameter(int)` fallback, honoring probe-pins-refuse-rest.
