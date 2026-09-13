# ADR-0005: Local-first with explicitly configured bounded remote inference

## Status

Accepted (2026-08-20, CLAP-first rebaseline). Supersedes the earlier "all reasoning is local" constraint.

## Context

The original constraint banned all remote model calls. Rebaselining clarified the actual invariant: authority and data custody, not provider geography.

## Decision

**Local authority is the invariant.** DAW integration, raw project state, authorization, persistence, and mutation remain local. Reasoning may use a locally configured model **or an explicitly configured remote provider**, selected in the Pi SDK agentDir outside this repo (the daemon passes no model/modelRuntime). Only bounded confirmed context is sent on explicit Analyze; **raw audio never leaves the plug-in**. Provider absence or auth failure is a bounded visible state (`analysis_auth_required` / `analysis_model_unavailable`), never a crash or silent fallback.

## Consequences

- No secrets or provider config live in the repo.
- Local-first remains testable: mutation authority and raw state are verifiably local regardless of provider location.
- Honest disclosure: analysis evidence carries its freshness and provider state in the UI.
