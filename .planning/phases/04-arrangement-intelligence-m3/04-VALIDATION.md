---
phase: 4
slug: arrangement-intelligence-m3
status: approved
nyquist_compliant: true
wave_0_complete: true
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

> Plan/Wave assignments reflect the actual `requirements` frontmatter in 04-01..06-PLAN.md.
> Requirement coverage: ARRANGE-01/02 → Plans 01,02,03,05; ARRANGE-03/05 → Plans 01,02,04,05; ARRANGE-04 → Plans 01,05; UX-03 → Plans 05,06.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1/T2 | 01 | 1 | ARRANGE-01..05 | — | cursor-walk probe (BLOCKING human-verify) | unit (Java) + human | `mvn -q -pl bridge test -Dtest=LauncherGridWalkerTest` + in-app probe | ❌ W1 | ⬜ pending |
| 02-T1 | 02 | 2 | ARRANGE-01/02/03/05 | — | scene-features + self-similarity primitives | unit + property | `npm test -- --run daemon/src/transforms/scene-features.test.ts daemon/src/transforms/self-similarity.test.ts` | ❌ W2 | ⬜ pending |
| 02-T2 | 02 | 2 | ARRANGE-03/05 | — | arrangement-snapshot + roles-store atomic round-trip | unit | `npm test -- --run daemon/src/state/arrangement-snapshot.test.ts daemon/src/state/roles-store.test.ts` | ❌ W2 | ⬜ pending |
| 02-T3 | 02 | 2 | ARRANGE-01/03/05 | — | profile schema extension (energyWeights/sectionLabels/roleTemplates) | unit | `npm test -- --run daemon/src/profiles/profile-loader.test.ts` | ❌ W2 | ⬜ pending |
| 03-T1 | 03 | 3 | ARRANGE-01 | — | section-detector refuse-below-threshold | unit + property | `npm test -- --run daemon/src/transforms/section-detector.test.ts` | ❌ W3 | ⬜ pending |
| 03-T2 | 03 | 3 | ARRANGE-02 | — | repetition-report clusters disjoint + singleton filter | unit + property | `npm test -- --run daemon/src/transforms/repetition-report.test.ts` | ❌ W3 | ⬜ pending |
| 04-T1 | 04 | 3 | ARRANGE-03 | — | energy-curve TRUE per-bar composite + normalization | unit + property | `npm test -- --run daemon/src/transforms/energy-curve.test.ts` | ❌ W3 | ⬜ pending |
| 04-T2 | 04 | 3 | ARRANGE-05 | — | track-role-classifier below-threshold→unknown + roles.json shape | unit + property | `npm test -- --run daemon/src/transforms/track-role-classifier.test.ts` | ❌ W3 | ⬜ pending |
| 05-T1 | 05 | 4 | ARRANGE-01..05 | — | M3_ANALYZERS registry + runAll drops < 0.5 | unit (extend) | `npm test -- --run daemon/src/state/analyzer-registry.test.ts` | ✅ extend | ⬜ pending |
| 05-T2 | 05 | 4 | ARRANGE-04 | — | transition-suggest advisory-only (no patch imports) | unit | `npm test -- --run daemon/src/transforms/transition-suggest.test.ts` | ❌ W4 | ⬜ pending |
| 05-T3 | 05 | 4 | ARRANGE-01..05, UX-03 | — | query-server arrange.* dispatch + bw-arrange multicall + current-section | unit + smoke | `npm test -- --run daemon/src/query/query-server.test.ts daemon/src/cli/commands/arrange.test.ts` | ❌ W4 | ⬜ pending |
| 06-T1 | 06 | 5 | UX-03 | — | Pi /review skill contract (shells to CLI, no wire, assumptions[]) | contract | `npm test -- --run ../pi-pack/skills/review/skill.test.ts` | ❌ W5 | ⬜ pending |
| INV-P4-1 | 05 | 4 | D-01 | — | additive-protocol (no new event types) | unit (grep) | `npm test -- --run daemon/src/protocol/reader.test.ts` | ✅ extend | ⬜ pending |
| INV-P4-2 | 01 | 1 | D-01 | — | no deprecated Bitwig API calls | process | `node scripts/check-deprecated-bridge.mjs` | ✅ existing | ⬜ pending |
| INV-P4-3 | 01 | 1 | D-01 | — | cursor-walk completeness (every hasContent cell) | unit (Java) | `mvn -q -pl bridge test -Dtest=LauncherGridWalkerTest` | ❌ W1 Java | ⬜ pending |
| D-03 | 02 | 2 | D-03 | — | snapshot atomicity (parallel writes) | property (existing) | `npm test -- --run daemon/src/store/atomic-write.test.ts` | ✅ covered | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 2 Stubs/Tests (foundation the later-wave analyzers import)

> No framework install needed — vitest/fast-check/JUnit 5 are all present.
> These are the Wave-2 pure primitives + stores + profile data that Wave 3 analyzers import. Created by Plan 02 (Wave 2).

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

- [x] All tasks have `<automated>` verify or Wave 2 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 2 covers all MISSING references (primitives + stores + profiles before analyzers import them)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-06 (post plan-checker revision — B-1 typo fixed, S-1 map corrected, S-2 true per-bar energy, S-3 dead reference dropped)
