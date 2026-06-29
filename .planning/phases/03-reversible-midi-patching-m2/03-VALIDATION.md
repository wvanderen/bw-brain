---
phase: 3
slug: reversible-midi-patching-m2
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-29
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> The full validation architecture (invariants, edge classes, manual UAT, req→test map)
> lives in `03-RESEARCH.md` → `## Validation Architecture`. This file is the
> execution-tracking scaffold; the planner lifts covered/backstop edges into each PLAN.md's
> `must_haves` and the executor fills the Per-Task Verification Map as tasks complete.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (+ fast-check 4.8.0 for property-based tests) |
| **Config file** | `vitest.config.ts` (extend existing) |
| **Quick run command** | `npm test -- --run --reporter=dot` |
| **Full suite command** | `npm test -- --run` |
| **Property suite command** | `npm test -- --run --grep property` |
| **Estimated runtime** | ~20 seconds (quick) / ~45 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run --reporter=dot`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green + property suite green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

> Filled by the executor as tasks land. Every task MUST map to at least one
> invariant (INV-1..INV-14) or edge class from `03-RESEARCH.md` → Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending_ | _pending_ | _pending_ | EDIT-01..06 / MIDI-01..05 / UX-02 / ARCH-01..02 | T-3-* / — | _per task_ | unit / property / integration | _per task_ | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `fast-check` 4.8.0 added to devDependencies (NEW — legitimacy verified)
- [ ] `tonal` 6.4.3 added to `daemon/dependencies` (NEW — legitimacy verified)
- [ ] Property-test harness scaffold (fast-check + vitest integration) for INV-1..INV-14
- [ ] Shared fixtures: generated MIDI/patch states for round-trip reversibility
- [ ] Held-out motif fixtures (not used to design motif-signature / harmonic-center heuristics)

*If none: "Existing infrastructure covers all phase requirements." — N/A, new deps required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Casino MIDI" audibility (below-threshold transforms refuse) | MIDI-01/02 | Requires human ears to confirm refusal is musically justified | M3 — render A/B/C variants, confirm below-threshold REFUSES |
| Bitwig undo coalescing window feel | EDIT-02/UX-02 | Host interaction + subjective timing | M1 — apply consecutive edits within ~1s, observe coalescing |
| NoteStep grid-locking behavior | EDIT-* | Live Bitwig probe required | M4 — inspect whether NoteSteps snap to grid |
| Motif-preservation musicality | MIDI-01..05 | Human judgment of motif identity | M5 — compare motifSignature before/after, listen |
| Diff pane UX for `/vary` + `/apply` | UX-02 | Visual/interaction check in Pi | Manual UAT in Pi client |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
