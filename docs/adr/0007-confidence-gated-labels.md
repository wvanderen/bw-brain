# ADR-0007: Confidence-gated derived labels; honest freshness and bounded refusals

## Status

Accepted (2026-08-22, Phase 04.3 live verification)

## Context

Derived labels (sections, roles, energy) come from heuristics with varying confidence. Early design pressure favored always showing something; live UAT showed misreporting a populated launcher as empty (or guessing labels) destroys trust faster than saying "unknown".

## Decision

- Derived labels are **confidence-gated**: below threshold, omit the label rather than guess. Every shown label carries its confidence.
- Independent scene/energy/repetition/role evidence proves capture health even when labels are withheld — a populated launcher is never reported as empty.
- Every read surface (CLI and CLAP peer) renders visible freshness (`pulledAt`); disconnected+refresh hard-refuses, disconnected-without-refresh renders the durable snapshot labeled stale-but-readable.
- Corrupt/unvalidatable persisted snapshots refuse with the single `snapshot_invalid` vocabulary on both surfaces; a rejected save must not leak derived state (refresh returns null and skips role saves).
- Live UAT verdicts are recorded honestly: failures stay failures with defect notes until gap-closed; acceptance history is classified, never falsified.

## Consequences

- The local-first honesty contract is mechanical: weak evidence is absent, not fabricated.
- Bank-sync timing (large launcher grids) uses a bounded 90s settle window at `get.launcher_clips` sites; all other pulls keep the 3000ms default.
