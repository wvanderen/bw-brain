# ADR-0004: CLAP-first product UX; Pi daemon-managed; CLI secondary

## Status

Accepted (2026-08-20, after Phase 04.2 live verification; rebaseline completed in Phase 04.3, 2026-08-22). Supersedes the pre-CLAP seed UX (external Pi package/TUI panes as the product surface).

## Context

The original shape put the musical decision loop in an external Pi-native shell. Phase 04.1/04.2 proved a cleaner product: a thin CLAP companion inside Bitwig, with Pi demoted to a daemon-managed headless runtime.

## Decision

- The **hosted CLAP editor** is the primary producer surface: confirmed scope, analysis, proposals, approval, and bounded generated MIDI live in Bitwig.
- **Pi is a daemon-managed reasoning runtime** — one project-scoped session, four handler-backed tools, no built-ins, no apply/arm/socket/filesystem/raw-audio authority. It proposes; it cannot mutate.
- The **CLI remains the stable secondary** automation, diagnostic, and recovery contract.
- Analyze and Stop are hosted commands only; device-panel parameters are read-only status/pending values plus continuous Generated Mix (actions are never automatable).

## Consequences

- The musical decision loop never leaves Bitwig; no second application is required.
- External-Pi UX assumptions are retired: the legacy Phase-4 `/review` UAT is superseded by the CLAP-native arrangement review (its CLI coverage is retained).
- Quiet Pi startup persists only an SDK-created session header; reopen works with zero prompts (no fabricated turns).
