---
phase: 2
slug: read-only-context-foundation-m1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

> Derived from `02-RESEARCH.md` §Validation Architecture. The planner populates the
> per-task map below from the PLAN.md tasks; the test infrastructure rows are pre-filled
> from the verified Phase 1 stack (`.claude/AGENTS.md`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.9 (daemon/TS side); Maven `mvn test` (Java bridge side); held-out fixtures for SC#1 read-accuracy + SC#3 daemon-reload |
| **Config file** | `daemon/vitest.config.ts` (exists from Phase 1); `bridge/pom.xml` (new this phase) |
| **Quick run command** | `cd daemon && npx vitest run` |
| **Full suite command** | `cd daemon && npx vitest run && cd ../bridge && mvn -q test` |
| **Estimated runtime** | ~20–40 seconds (daemon unit + integration; bridge unit excludes live Bitwig) |

---

## Sampling Rate

- **After every task commit:** Run `cd daemon && npx vitest run` (daemon) or `cd bridge && mvn -q test` (bridge)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green + held-out SC#1/SC#3 fixtures green
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

> Populated by the planner from PLAN.md tasks. Each task must map to a requirement,
> a secure behavior where relevant, an automated command, and a held-out test where
> the behavior is a backstop edge (per RESEARCH.md §Validation Architecture).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-XX | 01 | 1 | — | — | — | — | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `daemon/src/schemas/project-state.schema.json` + `cli-query/{query,result}.schema.json` — validated at boundary (Ajv 2020-12, compiled once at boot) — REQ STATE-01, CLI-01
- [ ] Held-out fixtures for SC#1 (bw-diff round-trip + ~20-clip read-accuracy) and SC#3 (20-track-reorder reconcile + concurrent atomic write) — REQ STATE-04
- [ ] `brew install maven` + `JAVA_HOME` to JDK 21.0.11 (installed, off-PATH) — Wave 0 setup only

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `bw-device inspect` returns VST/AU plugin params (CursorRemoteControlsPage exposure) | CLI-03 / BRIDGE-02 | Requires Bitwig open + a real loaded VST (open question A1 from research) | Load a free VST in Bitwig; select its device; run `bw-device inspect` → JSON contains the plugin params |
| Bridge reload/reconnect reconcile against live Bitwig | STATE-04 / SC#3 | Requires a running Bitwig session + manual extension reload | Reload the `.bwextension`; confirm daemon reconciles stable IDs via fingerprint + `stateFreshness` returns `live` |
| Pi `/analyze` smoke (real OpenClaw runtime) | UX-01 / UX-05 | Pi/OpenClaw is a real installed runtime; automated test = CLI contract (D-12) | `pi install ./pi-pack`; run `/analyze`; confirm critique + assumptions[] + state render |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
