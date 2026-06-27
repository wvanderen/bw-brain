---
phase: 2
slug: read-only-context-foundation-m1
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-27
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

> Derived from `02-RESEARCH.md` §Validation Architecture. Populated by the planner from
> PLAN.md task `<verify><automated>` commands; the test infrastructure rows are pre-filled
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

> One row per task across the 6 plans (02-01, 02-02, 02-03a, 02-03b, 02-04, 02-05).
> Transcribed from each task's `<verify><automated>` command. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 01 | 1 | STATE-01, STATE-03, CLI-01, BRIDGE-03, UX-06 | T-2-01-E/S/I | Sid regex gate, ok:false conditional, assumptions[] shape | unit (TS, Ajv round-trip) | `cd daemon && npx vitest run src/protocol/schemas.test.ts` | ✅ extends existing | ⬜ pending |
| 02-01-T2 | 01 | 1 | STATE-01, BRIDGE-03 | T-2-01-T (Pitfall 1) | OBSERVATIONAL_EVENT_TYPES equals event enum | unit (TS) + codegen | `cd daemon && npm run gen:types && npx vitest run src/protocol/schemas.test.ts && npx tsc --noEmit` | ✅ extends existing | ⬜ pending |
| 02-02-T1 | 02 | 1 | BRIDGE-01 | T-2-02-T/SC | loopback-only bind, ServiceLoader FQCN, shade packaging | unit (Java, pure logic) + Wave 0 env setup | `cd bridge && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q package && ls target/bw-brain.bwextension` | ❌ W0 (new bridge/) | ⬜ pending |
| 02-02-T2 | 02 | 1 | BRIDGE-01/02/03 | T-2-02-D (audio stall) | observers enqueue-never-block (outbox.offer), no socket.write in lambdas | unit (Java, pure logic) | `cd bridge && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q package` | ✅ Task 1 | ⬜ pending |
| 02-02-T3 | 02 | 1 | BRIDGE-01/02/03, CLI-03, STATE-04 | — | A1 VST/AU exposure; SC#3 reload reconcile | **MANUAL** (human-verify checkpoint) | — (Bitwig open required) | — | ⬜ pending |
| 02-03a-T1 | 03a | 2 | STATE-04, MEM-01 | T-2-03a-T/E | SC#3 held-out: 20-track reorder reconcile (>=18/20 survive); N=20-parallel atomic write (final file parses + deep-equals one input); fingerprint determinism | property (TS, held-out fixtures — SC#3 critical) | `cd daemon && npx vitest run src/state/fingerprint.test.ts src/state/reconcile.test.ts src/store/atomic-write.test.ts src/store/state-cache.test.ts` | ❌ W0 (SC#3 fixtures) | ⬜ pending |
| 02-03b-T1 | 03b | 3 | STATE-01, STATE-02, STATE-03, MEM-02 | T-2-03b-I (MEM-02 gate) | SC#5 boundary unit test (no ephemeral-write op in cli-query enum); D-08 framework-only (M1_ANALYZERS.length===1); D-09 no-inference (null on absent intent) | unit (TS) | `cd daemon && npx vitest run src/state/ src/store/ src/ingest/ && node --experimental-vm-modules src/store/boundary.ts 2>/dev/null; npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-03b-T2 | 03b | 3 | CLI-01 | T-2-03b-S (UDS 0600), T-2-03b-T (stale trusted) | Pitfall 5 UDS-form (file mode 0o600 asserted); stateFreshness surfaces on every result (SC#3) | unit (TS) | `cd daemon && npx vitest run src/transport/uds.test.ts src/query/query-server.test.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-04-T1 | 04 | 2 | CLI-01 | T-2-04-S | SC#1 bw-diff round-trip 100% (lossless property); dump.ts deleted | property (TS, SC#1) + structural | `cd daemon && npx vitest run src/cli/diff-logic.test.ts && npx tsc --noEmit && test ! -f src/cli/dump.ts && echo DUMP_REMOVED` | ❌ W0 (SC#1 diff round-trip) | ⬜ pending |
| 02-04-T2 | 04 | 2 | CLI-01, CLI-02, CLI-03 | T-2-04-D | multicall dispatch (both shim + git-style reach same handler); 5 live + 3 stubs; assumptions[] on every derived output (UX-06) | unit (TS, contract suite w/ fake UDS server) | `cd daemon && npx vitest run src/cli/cli.test.ts && npm link 2>/dev/null && bw-focus --help 2>&1 | head -1 && bw-brain focus --help 2>&1 | head -1 && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-05-T1 | 05 | 3 | UX-01, UX-05, UX-06 | T-2-05-I (hallucinated critique) | SC#1 accuracy harness: >=18/20 fixtures tokenOverlap >0.9; Pitfall 7 negative match (no section/motif/role terms); assumptions[] non-empty | property (TS, held-out fixtures — SC#1) | `cd daemon && npx vitest run src/state/describe.test.ts ../fixtures/representative-clips/accuracy-harness.test.ts` | ❌ W0 (SC#1 fixtures) | ⬜ pending |
| 02-05-T2 | 05 | 3 | UX-01, UX-05, UX-06 | T-2-05-I | OpenClaw frontmatter (user-invocable:true, no command-dispatch:tool); SKILL.md hard rules forbid invented critique | structural (TS shell + grep) | `test -f pi-pack/skills/analyze/SKILL.md && head -1 pi-pack/skills/analyze/SKILL.md | grep -q "^---" && grep -c "user-invocable: true" pi-pack/skills/analyze/SKILL.md | grep -q 1 && grep -c "assumptions" pi-pack/skills/analyze/SKILL.md | grep -q 1 && echo SKILL_OK` | ❌ W0 | ⬜ pending |
| 02-05-T3 | 05 | 3 | UX-01, UX-05, UX-06, BRIDGE-01 (spike deletion gate) | T-2-05-S (spike resurrect) | Pi /analyze live smoke (D-12); spike/ deletion (D-05/D-06) gated on Plan-02 SUMMARY | **MANUAL** (human-verify checkpoint) | — (real Pi runtime + Bitwig open) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `schemas/project-state.schema.json` + `cli-query/{query,result}.schema.json` — validated at boundary (Ajv 2020-12, compiled once at boot) — REQ STATE-01, CLI-01 — **covered by 02-01 Task 1 + Task 2** (author + extend + Ajv round-trip test).
- [x] Held-out fixtures for SC#1 (bw-diff round-trip + ~20-clip read-accuracy) — REQ STATE-04 / UX-01 — **covered by 02-04 Task 1** (diff-logic round-trip property test) **+ 02-05 Task 1** (10 fixture pairs + accuracy-harness.test.ts).
- [x] Held-out fixtures for SC#3 (20-track-reorder reconcile + concurrent atomic write) — REQ STATE-04 — **covered by 02-03a Task 1** (reconcile.test.ts 20-track-reorder case + atomic-write.test.ts N=20-parallel case).
- [x] `brew install maven` + `JAVA_HOME` to JDK 21.0.11 (installed, off-PATH) — Wave 0 setup only — **covered by 02-02 Task 1** (autonomous shell setup block: brew install maven + JAVA_HOME export / symlink).

*All Wave 0 requirements are allocated to specific tasks; no MISSING references remain.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `bw-device inspect` returns VST/AU plugin params (CursorRemoteControlsPage exposure) | CLI-03 / BRIDGE-02 | Requires Bitwig open + a real loaded VST (Open Question A1 — RESOLVED via 02-02 Task 3) | Load a free VST in Bitwig; select its device; run `bw-device inspect` → JSON contains the plugin params |
| Bridge reload/reconnect reconcile against live Bitwig | STATE-04 / SC#3 | Requires a running Bitwig session + manual extension reload (live half of SC#3; automated half is 02-03a held-out property test) | Reload the `.bwextension`; confirm daemon reconciles stable IDs via fingerprint + `stateFreshness` returns `live` |
| Pi `/analyze` smoke (real OpenClaw runtime) | UX-01 / UX-05 | Pi/OpenClaw is a real installed runtime; automated test = CLI contract (D-12) | `pi install ./pi-pack`; run `/analyze`; confirm critique + assumptions[] + state render |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (12 of 13 tasks carry automated verify; 02-02-T3 + 02-05-T3 are intentional human-verify checkpoints per D-12 / Phase-1 Plan-03 pattern).
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manual checkpoints are isolated at end of 02-02 and 02-05).
- [x] Wave 0 covers all MISSING references (4 boxes above; each tied to a specific plan/task).
- [x] No watch-mode flags (all `<automated>` commands use `vitest run`, not `vitest watch`).
- [x] Feedback latency < 40s (daemon vitest run ~20-40s; bridge `mvn -q test` ~10-20s; no live-Bitwig in CI).
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved — all 13 tasks across 6 plans mapped; Wave 0 + Sign-Off boxes hold; nyquist gate satisfied.
