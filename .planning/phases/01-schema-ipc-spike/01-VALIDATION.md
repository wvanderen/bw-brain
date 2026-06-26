---
phase: 1
slug: schema-ipc-spike
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> This is a **de-risk spike**: outputs are findings + a frozen contract + a thin end-to-end proof, not a feature suite. The validation surface is kept proportionate — over-testing a spike wastes its whole point (speed of learning).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (ESM-native, fast Ajv support — per AGENTS.md) |
| **Config file** | `daemon/vitest.config.ts` (Wave 0 creates it — greenfield repo) |
| **Quick run command** | `cd daemon && npx vitest run` |
| **Full suite command** | `cd daemon && npx vitest run` (same — suite is small) |
| **Estimated runtime** | ~5 seconds |

No test infrastructure exists yet (greenfield). Wave 0 of this phase creates `daemon/vitest.config.ts` and the test files below.

---

## Sampling Rate

- **After every task commit:** Run `cd daemon && npx vitest run`
- **After every plan wave:** Run `cd daemon && npx vitest run` (same — small suite)
- **Before `/gsd-verify-work`:** Full suite green + SC#1 runnable spike produces a validated JSON line + SC#2 structural check passes
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Task IDs finalize once PLAN.md exists. Rows below map phase requirements to their proof; the executor annotates the actual `1-NN-MM` task IDs against these.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-TBD | 01 | W0 | PROBE-02/SC#3 | — | Ajv-validate every message at daemon boundary | property test | `cd daemon && npx vitest run line-buffer` | ❌ W0 | ⬜ pending |
| 1-01-TBD | 01 | W0 | PROBE-02/SC#3 | — | Every frozen message validates against its schema | unit | `cd daemon && npx vitest run schemas` | ❌ W0 | ⬜ pending |
| 1-01-TBD | 01 | W0 | PROBE-02/SC#3 | T-1-01 | Version mismatch rejected; match accepted | unit | `cd daemon && npx vitest run handshake` | ❌ W0 | ⬜ pending |
| 1-01-TBD | 01 | W1 | PROBE-02/SC#1 | — | One real `selection.changed` round-trips; CLI prints validated JSON; exit 0 | runnable spike + exit-code + schema check | `cd daemon && npx tsx src/cli/dump.ts && echo $?` | ❌ W0 | ⬜ pending |
| 1-01-TBD | 01 | W1 | PROBE-01/SC#2 | — | Capabilities doc structurally complete | structural check | `node scripts/check-capabilities-doc.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `daemon/vitest.config.ts` — Vitest config (ESM)
- [ ] `daemon/src/protocol/line-buffer.test.ts` — property test for PROBE-02/SC#3 framing (feed random byte-splits of N messages → get N whole messages)
- [ ] `daemon/src/protocol/schemas.test.ts` — Ajv validation of every frozen schema + counter-examples
- [ ] `daemon/src/protocol/handshake.test.ts` — version-negotiation accept/reject
- [ ] `scripts/check-capabilities-doc.mjs` — structural validator for PROBE-01/SC#2 (sections present for 5 items + stable-ID; every gap row has a non-empty Mitigation field)
- [ ] Framework install: `npm i -D vitest` (part of the single `npm install` in Standard Stack)

*No existing infrastructure — Wave 0 creates all of the above. Lightest viable surface for a spike; Phase 2 expands it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Observed Bitwig API behavior (undo labels/coalescing, note-editing scope, stable IDs, JsApi networking surface) recorded in `docs/bitwig-capabilities.md` | PROBE-01/SC#2 | In-app Bitwig behavior is a human-verified finding by design — no automated test can validate it; the scripting guide is 404 externally and must be opened in-app | Open the in-app Bitwig Developer Resources scripting guide; run the code-probes from D-02; record verified facts + a mitigation for every gap (D-04) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
