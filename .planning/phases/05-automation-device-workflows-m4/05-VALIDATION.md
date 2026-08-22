---
phase: 5
slug: automation-device-workflows-m4
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-22
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Task/stable-IDs map is filled by the planner output (PLAN.md task IDs); the
> per-task table below is populated at execution time from plan tasks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (daemon TS + pi-pack contract tests); JUnit 5 (bridge Java) |
| **Config file** | `daemon/vitest.config.ts`; `bridge/pom.xml` |
| **Quick run command** | `npm test -- --run` (daemon workspace) |
| **Full suite command** | `npm test -- --run` + `cd bridge && mvn -q test` + `node scripts/check-bridge-artifact.mjs` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-XX-YY | XX | — | AUTO-01..04 / UX-04 | — / T-05-XX | N/A (local-first; loopback-only transports) | unit + contract | `npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Populated per-plan once PLAN.md task IDs exist.*

---

## Wave 0 Requirements

- [ ] Test stubs for new automation-salience analyzer, patch-schema automation ops, and device-chain read path land with their plans (project convention: tests colocated `*.test.ts`)
- [ ] Bridge JUnit coverage for `get.project_meta` and parameter-enumeration handlers

*Existing infrastructure (vitest + JUnit + check scripts) covers the phase; no new framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Automation write lands on the intended envelope during playback | AUTO-03 | Requires live Bitwig + transport + ears; API semantics resolved by in-phase probe | In Bitwig: approve a bounded automation proposal; observe envelope movement; revert via journal; confirm restoration |
| Third-party VST param enumeration (Surge XT class plugins) | AUTO-04 | Requires live Bitwig with a loaded VST/AU | Load VST; `bw-device inspect` shows bounded enumerated params; CLAP drawer shows ranked top-N |
| Transport-stopped refusal surfaces visibly | AUTO-03 | Requires live transport control | Stop transport; approve automation patch; expect named refusal (e.g. transport_stopped), no mutation |
| Macro/XY suggestions carry evidence + alternative | UX-04 / SC#2 | Visual inspection in hosted CLAP drawer | Open drawer on confirmed device scope; verify ranked list with evidence lines and assumptions[] |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
