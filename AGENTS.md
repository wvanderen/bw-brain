# AGENTS.md

> **Planning migration (2026-09-12): complete.** GSD planning artifacts (formerly `.planning/`) were absorbed into the new system — decisions in `docs/adr/`, domain model in `CONTEXT.md`, outstanding work in GitHub Issues — and the originals were retired (git history retains them). Historical debug investigations live in `docs/debug/`.

Further project agent instructions live in [`.claude/AGENTS.md`](.claude/AGENTS.md).

## Agent skills

### Issue tracker

Issues live in GitHub Issues on wvanderen/bw-brain (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical triage labels (label string = role name). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
