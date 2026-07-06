---
phase: 4
slug: arrangement-intelligence-m3
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `.planning/phases/04-arrangement-intelligence-m3/04-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.9 + fast-check 4.8.0 (daemon); JUnit 5 (bridge) |
| **Config file** | `daemon/vitest.config.ts` (existing; `include` covers `../pi-pack/skills/**/*.test.ts`) |
| **Quick run command** | `npm test -- --run daemon/src/transforms/section-detector.test.ts daemon/src/transforms/repetition-report.test.ts daemon/src/transforms/energy-curve.test.ts daemon/src/transforms/track-role-classifier.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Bridge suite command** | `mvn -q -pl bridge test` |
| **Estimated runtime** | ~30s (daemon full suite); ~10s (bridge) |

---

## Sampling Rate

- **After every task commit:** Run the relevant transform's `.test.ts` (fast; <2s per file)
- **After every plan wave:** Run `npm test -- --run` (full daemon suite)
- **Before `/gsd-verify-work`:** Full suite green + `mvn -q -pl bridge test` green + `node scripts/check-deprecated-bridge.mjs` clean + `node scripts/check-bridge-artifact.mjs` clean
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Planner fills the Task ID / Plan / Wave columns when PLAN.md files land.
> Requirement + Test Type + Command rows are pre-seeded from RESEARCH.md.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | ARRANGE-01 | — | refuse-below-threshold sections | unit + property | `npm test -- --run daemon/src/transforms/section-detector.test.ts` | ❌ W1 | ⬜ pending |
| TBD | 01 | 1 | ARRANGE-01 | — | runAll drops < 0.5 confidence | unit (extend) | `npm test -- --run daemon/src/state/analyzer-registry.test.ts` | ✅ extend | ⬜ pending |
| TBD | 01 | 1 | ARRANGE-02 | — | repetition clusters + singleton filter | unit + property | `npm test -- --run daemon/src/transforms/repetition-report.test.ts` | ❌ W1 | ⬜ pending |
| TBD | 01 | 1 | ARRANGE-03 | — | energy normalization against peak | unit + property | `npm test -- --run daemon/src/transforms/energy-curve.test.ts` | ❌ W1 | ⬜ pending |
| TBD | 01 | 1 | ARRANGE-04 | — | advisory-only shape (no patch fields) | unit | `npm test -- --run daemon/src/transforms/transition-suggest.test.ts` | ❌ W1 | ⬜ pending |
| TBD | 01 | 1 | ARRANGE-05 | — | role classification + below-threshold→unknown | unit + property | `npm test -- --run daemon/src/transforms/track-role-classifier.test.ts` | ❌ W1 | ⬜ pending |
| TBD | 04 | 4 | UX-03 | — | /review skill contract (shells to CLI, no wire) | contract | `npm test -- --run ../pi-pack/skills/review/skill.test.ts` | ❌ W4 | ⬜ pending |
| TBD | 01 | 1 | D-01 | — | get.launcher_clips response Ajv-valid | unit | `npm test -- --run daemon/src/state/arrangement-snapshot.test.ts` | ❌ W1 | ⬜ pending |
| TBD | 01 | 1 | D-03 | — | snapshot atomicity (parallel writes) | property (existing) | `npm test -- --run daemon/src/store/atomic-write.test.ts` | ✅ covered | ⬜ pending |
| TBD | 01 | 1 | D-09 | — | roles.json round-trip save→load→equal | unit | `npm test -- --run daemon/src/state/roles-store.test.ts` | ❌ W1 | ⬜ pending |
| TBD | 01 | 1 | INV-P4-1 | — | additive-protocol (no new event types) | unit (grep) | `npm test -- --run daemon/src/protocol/reader.test.ts` | ✅ extend | ⬜ pending |
| TBD | 01 | 1 | INV-P4-2 | — | no deprecated Bitwig API calls | process | `node scripts/check-deprecated-bridge.mjs` | ✅ existing | ⬜ pending |
| TBD | 01 | 1 | INV-P4-3 | — | cursor-walk completeness (every hasContent cell) | unit (Java) | `mvn -q -pl bridge test -Dtest=LauncherGridWalkerTest` | ❌ W1 Java | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> No framework install needed — vitest/fast-check/JUnit 5 are all present.
> The files below are the Wave-1 stubs/tests that must exist before later-wave tasks can sample feedback.

- [ ] `daemon/src/transforms/scene-features.ts` — per-scene feature vector (input to D-04/D-06/D-05)
- [ ] `daemon/src/transforms/self-similarity.ts` — cosine affinity matrix (shared by D-04 + D-06)
- [ ] `daemon/src/transforms/section-detector.ts` — agglomerative contiguous clustering + analyzer wrapper
- [ ] `daemon/src/transforms/repetition-report.ts` — union-find clusters + analyzer wrapper
- [ ] `daemon/src/transforms/energy-curve.ts` — weighted composite + normalize + analyzer wrapper
- [ ] `daemon/src/transforms/track-role-classifier.ts` — template matching + analyzer wrapper
- [ ] `daemon/src/transforms/transition-suggest.ts` — advisory observation generator (NO patch imports)
- [ ] `daemon/src/state/arrangement-snapshot.ts` — load/save + Ajv validator
- [ ] `daemon/src/state/roles-store.ts` — load/save roles.json (mirrors intent-store.ts)
- [ ] `daemon/src/state/analyzer-registry.ts` — extend `DerivedFieldName` + add `M3_ANALYZERS`
- [ ] `bridge/src/main/java/com/bwbrain/bridge/LauncherGridWalker.java` — cursor-walk state machine
- [ ] `bridge/src/test/java/com/bwbrain/bridge/LauncherGridWalkerTest.java` — JUnit
- [ ] `daemon/src/profiles/generic.json` + `techno.json` — add energyWeights + sectionLabels + roleTemplates
- [ ] `pi-pack/skills/review/SKILL.md` + `skill.test.ts` — UX-03 contract test

*Framework already covers all phase requirements — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SceneBank/ClipBank cursor-walk probe | D-01 / ARRANGE-01..05 | Requires live Bitwig 6.0.6 + human eyes; the API surface is unprobed in-app. Autonomous research grounded it in Javadoc but behavioral characteristics (latency, coalescing, GUI-focus) need a human. | Run the in-app probe recipe in `docs/bitwig-capabilities.md §7` (P4 adds this); verify cursor-walk enumerates non-cursor launcher clips; record Observed: in capabilities doc. |
| Live arrangement analysis sanity | ARRANGE-01..05 | Requires a real multi-scene Bitwig project; the cursor-walk + analyzers must run against real producer content. | After the bridge probe passes, run `bw-arrange review` against a real project; verify sections/repetition/energy/roles/transition observations are musically coherent. |

---

## Property Tests (the trust-spine gates)

> Seed property tests the planner should lift into the relevant PLAN.md `<verify>` blocks.
> Source: RESEARCH.md §Validation Architecture §Property Tests.

- **Refuse-below-threshold:** every emitted section/role/energy field has confidence ≥ 0.5 (runAll drops lower).
- **Self-similarity matrix:** symmetric + diagonal = 1.0.
- **Repetition clusters:** disjoint; every pair with sim ≥ threshold is in the same cluster.
- **Energy curve:** normalized to [0,1] with peak = 1.0.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
