# Roadmap: bw-brain

## Overview

bw-brain is a local-first intelligence layer for Bitwig, built as a dumb Java `.bwextension` bridge + smart TypeScript daemon + stable CLI contract + Pi/OpenClaw UX shell. The roadmap follows the seed's strict **accurate-first, creative-later** sequencing across five phases: a thin de-risk spike that proves Bitwig TCP access and freezes the JSON-Lines contract, then four vertical-slice milestones (M1 read-only context → M2 reversible patching → M3 arrangement intelligence → M4 automation/devices). Every mutation in the system flows through `scope → operations → rationale → reversibility → risk → preview → apply`; every derived claim carries a confidence; the trust model (no background edits, no edit without a patch object, daemon-authoritative undo) is the spine the whole project lives or dies on. The CLI is the stable interface — Pi gets the best UX, but any agent or shell can drive the same commands.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema & IPC Spike** - Prove Bitwig TCP access, freeze the JSON-Lines contract, document the verified API surface before any production bridge work
- [ ] **Phase 2: Read-Only Context Foundation (M1)** - Bridge mirror + daemon normalization + read CLI + memory bootstrap + Pi /analyze — the assistant reliably describes selected context
- [ ] **Phase 3: Reversible MIDI Patching (M2)** - Patch/diff/preview/apply/risk backbone + daemon-authoritative undo + motif signature + MIDI transforms + Pi /vary /apply
- [ ] **Phase 4: Arrangement Intelligence (M3)** - Section/repetition/energy/transition analysis + track-role classification + Pi /review — project-level critique (observation/suggestion only)
- [ ] **Phase 5: Automation & Device Workflows (M4)** - Automation salience + macro proposals + bounded automation generation (incl. VST/AU) + Pi /device

## Phase Details

### Phase 1: Schema & IPC Spike

**Goal**: Confirm Bitwig JVM localhost TCP access (or lock the stdio-relay fallback), freeze the JSON-Lines protocol contract both halves build against, and document the verified API surface before any production bridge code is written — eliminating the single highest-risk structural unknown.
**Mode**: mvp
**Depends on**: Nothing (first phase)
**Requirements**: PROBE-01, PROBE-02
**Success Criteria** (what must be TRUE):

  1. A throwaway Bitwig extension connects to an external process over a real transport (TCP confirmed, or stdio-relay fallback chosen with rationale) and delivers at least one real `selection.changed` event end-to-end through the daemon to a CLI print.
  2. `docs/bitwig-capabilities.md` exists and is grounded in in-app verification of the scripting guide — documenting note-editing scope, automation write, bank paging, observer granularity, and undo behavior — so bridge design locks against API reality, not assumption.
  3. The JSON-Lines protocol contract (`schemas/protocol/*`) is frozen enough to build against: versioned messages, atomic-line writes, a partial-line buffer, and an explicit backpressure rule.

**Plans**: 1/3 plans executed
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Freeze the JSON-Lines protocol contract (6 JSON Schema 2020-12 files) + daemon ESM scaffold + generated TS types + capabilities-doc validator (autonomous, Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Daemon framing pipe: transport abstraction (localhost-only TCP + stdio) + LineBuffer + version handshake + Ajv-at-boundary reader + bounded-queue backpressure + `bw-brain-spike dump` CLI proof (autonomous, Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Bitwig-side spike: in-app capability probes → docs/bitwig-capabilities.md + transport proof + live SC#1 round-trip (MANUAL checkpoints, Wave 3)

**Research needed**: TCP socket access in the Bitwig JVM (the single highest-risk structural unknown — MEDIUM confidence); in-app verification of the Bitwig Developer Resources scripting guide to confirm exact API version + recent additions.

### Phase 2: Read-Only Context Foundation (M1)

**Goal**: The assistant reliably understands and describes the selected Bitwig context (clip/device/region/arrangement) through a stable CLI and a Pi `/analyze` skill — no editing. "Accurate first" made operational.
**Mode**: mvp
**Depends on**: Phase 1
**Requirements**: BRIDGE-01, BRIDGE-02, BRIDGE-03, STATE-01, STATE-02, STATE-03, STATE-04, CLI-01, CLI-02, CLI-03, MEM-01, MEM-02, UX-01, UX-05, UX-06
**Success Criteria** (what must be TRUE):

  1. Producer can select any clip/device/region in Bitwig and `bw-focus export` / `bw-project summary` / `bw-project region` return accurate JSON describing it — meeting a measured read-only accuracy bar (e.g., description matches human judgment >90% across ~20 representative clips; `bw-diff` round-trips 100%).
  2. `bw-midi inspect` returns correct notes/velocity/timing and `bw-device inspect` returns chain/parameters (including loaded VST/AU plugins) for the selected target.
  3. The daemon survives a bridge reload/restart without corrupting state: stable IDs reconcile on reconnect, `state-cache.json` stays consistent (atomic temp+rename), and a watchdog marks state stale (refusing edits) when the bridge is silent.
  4. Pi `/analyze` produces a critique + 2–4 next actions grounded in live selection/section/intent, every suggestion carries an `assumptions[]` field, and the state pane renders selected track/clip/device + section label.
  5. Durable project memory (`.bw-brain/`) and ephemeral session memory stay cleanly separated — experiment threads never write to the durable store (hard architectural boundary).

**Plans**: TBD
**UI hint**: yes
**Research needed**: bridge capability probe (Pitfall 1 — highest-risk item in the project); exact `CursorClip`/`CursorTrack`/`CursorDevice` observer surface; controller-thread scheduling semantics.

### Phase 3: Reversible MIDI Patching (M2)

**Goal**: The assistant produces musically sane, motif-preserving, fully reversible MIDI transforms through a preview/diff/apply pipeline with daemon-authoritative undo and risk gating — the trust backbone for every creative feature that follows.
**Mode**: mvp
**Depends on**: Phase 2
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-06, MIDI-01, MIDI-02, MIDI-03, MIDI-04, MIDI-05, UX-02, ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):

  1. Every mutation flows through a validated patch object (`scope → operations → rationale → reversibility → risk`) at every boundary — no direct-mutation path exists — and `bw-edit preview` renders a diff before any apply.
  2. `bw-edit revert <patchId>` fully reverses an applied patch via the authoritative `patch-history.jsonl`; Bitwig native undo is treated as best-effort and caveated, not relied upon.
  3. Risk gating enforces: low-risk edits are one-step, medium/high require explicit confirmation, multi-track = high by definition, and a scope mismatch (`scope.touched ⊋ scope.declared`) hard-errors.
  4. `bw-midi vary` produces A/B/C motif-preserving variants; counterline, voice-leading-fix, and humanization all default to preserve-motif-identity mode, and below-threshold transforms refuse rather than emit "casino MIDI."
  5. Pi `/vary` + `/apply` drive the edit pipeline with a diff pane rendering patch diffs; the genre-profile interface (ARCH-01) is in place with electronic/techno as the first profile, and the generic reasoning core runs without a profile (profiles enhance, never gate).

**Plans**: TBD
**UI hint**: yes
**Research needed**: Bitwig undo-grouping behavior (does the host auto-coalesce consecutive edits on a ~1s window?); motif signature algorithm (chroma/rhythm features adapted from librosa concepts to MIDI).

### Phase 4: Arrangement Intelligence (M3)

**Goal**: The assistant delivers genuinely useful project-level arrangement critique — sections, repetition, energy, transitions, and track roles — as observation/suggestion only (Bitwig's API cannot edit the arranger, so edits route through launcher clips or remain advisory).
**Mode**: mvp
**Depends on**: Phase 2 (raw model stable); enriched by Phase 3 (suggestions emit reversible patches) — can partially overlap Phase 3 if resourcing allows
**Requirements**: ARRANGE-01, ARRANGE-02, ARRANGE-03, ARRANGE-04, ARRANGE-05, UX-03
**Success Criteria** (what must be TRUE):

  1. `bw-arrange sections` performs bottom-up temporal segmentation with confidence scores, and every derived section label carries its confidence to the user (below-threshold = refuse rather than guess).
  2. `bw-arrange repetition-report` produces a self-similarity report and `bw-arrange energy-curve` produces a per-bar energy curve over the project.
  3. Transition suggestions detect energy mismatches and repetition gaps between sections and propose small reversible patches — routing through launcher clips or remaining advisory, never touching the arranger directly.
  4. Track-role classification labels tracks (kick/bass/lead/pad/fx/hats/percussion) with confidence, persisted to `roles.json` (gates automation salience in Phase 5).
  5. Pi `/review` + arrangement pane render a section timeline + energy sparkline for project-level critique.

**Plans**: TBD
**UI hint**: yes
**Research needed**: librosa.segment algorithm adaptation (`agglomerative`, `recurrence_matrix`) to MIDI/composition-state rather than audio; section-detection threshold tuning.

### Phase 5: Automation & Device Workflows (M4)

**Goal**: The assistant helps with sound design and movement — automation inspection, macro/XY exposure proposals, and bounded automation generation across native Bitwig and third-party (VST/AU) device chains.
**Mode**: mvp
**Depends on**: Phase 2 (device/automation raw model), Phase 3 (patch model + risk gating), Phase 4 (energy/section signals + track roles inform salience)
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, UX-04
**Success Criteria** (what must be TRUE):

  1. `bw-automation inspect` reports per-track automation salience (most expressive parameters), with salience informed by track-role classification from Phase 4.
  2. `bw-device macros-suggest` proposes macro/XY assignments ranked by observed expressiveness — ranked candidates with disambiguation, never a single "best" target.
  3. `bw-automation propose` generates a bounded automation curve patch for a selected parameter/region, always as a medium-risk patch requiring preview and explicit confirmation.
  4. Device inspection and automation workflows cover third-party VST/AU plugins loaded in the chain, not just native Bitwig devices.
  5. Pi `/device` + device pane render a chain summary + macro opportunities.

**Plans**: TBD
**UI hint**: yes
**Research needed**: automation salience statistics; bounded automation generation with genre-profile constraints.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5
(Phase 4 may partially overlap Phase 3 — see its Depends-on note — but the default ordering is sequential.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & IPC Spike | 1/3 | In Progress|  |
| 2. Read-Only Context Foundation (M1) | 0/TBD | Not started | - |
| 3. Reversible MIDI Patching (M2) | 0/TBD | Not started | - |
| 4. Arrangement Intelligence (M3) | 0/TBD | Not started | - |
| 5. Automation & Device Workflows (M4) | 0/TBD | Not started | - |
