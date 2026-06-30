# Requirements: bw-brain

**Defined:** 2026-06-25
**Core Value:** The assistant reliably understands and describes the selected Bitwig context and can only change the project through small, previewable, reversible, daemon-authoritative patches — so it never wrecks the song. Accurate first; creative later.

## v1 Requirements

Requirements for initial release across all 4 milestones (M1 read-only context → M2 reversible patching → M3 arrangement intelligence → M4 automation/devices). Each maps to roadmap phases (phase assignment finalized during roadmap creation).

### Foundation — Bridge & Context (M1)

- [x] **BRIDGE-01**: Java `.bwextension` runs inside Bitwig and mirrors live selection (track/clip/device/region) and transport state to an external process via newline-delimited JSON over localhost
- [x] **BRIDGE-02**: Bridge mirrors tracks, clips, launcher-clip notes, device chains (including loaded VST/AU plugins), and exposed parameters via the Bitwig observer API
- [x] **BRIDGE-03**: Bridge emits change events (`selection.changed`, etc.) and applies edit primitives (note add/remove, parameter set) labelled with the extension name
- [x] **PROBE-01**: Bitwig capability probe produces `docs/bitwig-capabilities.md` documenting the verified API surface (note editing scope, automation write, bank paging, observer granularity, undo behavior) before bridge design locks
- [x] **PROBE-02**: IPC spike confirms Bitwig JVM localhost TCP (or stdio relay) access and freezes the JSON-Lines protocol contract both halves build against

### Foundation — State Model & CLI (M1)

- [x] **STATE-01**: Daemon ingests bridge snapshots and normalizes them into a raw project-state model (project, transport, selection, tracks, clips, devices, automation) validated against `schemas/project-state.schema.json`
- [x] **STATE-02**: Daemon derives composition state (sections, trackRoles, motifs, energyCurve, automationSalience) from raw state, each with confidence scores
- [x] **STATE-03**: Daemon maintains an intent-state model (`projectIntent`: summary, constraints, targets) that constrains transforms and suggestions
- [x] **STATE-04**: Daemon synthesizes stable IDs for observed Bitwig objects (Bitwig exposes none) via fingerprint mapping, with reconnect/reconcile-on-connect semantics
- [x] **CLI-01**: Eight CLI commands (`bw-focus`, `bw-project`, `bw-device`, `bw-midi`, `bw-arrange`, `bw-automation`, `bw-edit`, `bw-diff`) emit compact JSON, fail clearly, and suppress prose unless `--explain` is set
- [x] **CLI-02**: `bw-focus export`, `bw-project summary`, `bw-project region` return selected/project/region context as JSON
- [x] **CLI-03**: `bw-midi inspect` and `bw-device inspect` return notes/velocity/timing and chain/parameters (including loaded VST/AU plugins) of the selected clip/device as JSON

### Foundation — Memory (M1, cross-cutting)

- [x] **MEM-01**: Daemon maintains durable project memory in `.bw-brain/` (`state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl`) with atomic writes
- [x] **MEM-02**: Ephemeral session memory (experiment thread, candidate patches) never writes to the durable store — a hard architectural boundary

### Edit Pipeline (M2)

- [x] **EDIT-01**: Patch object schema (`scope → operations → rationale → reversibility → risk`) is defined at `schemas/patch.schema.json` and validated at every boundary (daemon entry/exit, CLI emit, bridge apply)
- [x] **EDIT-02**: `bw-edit preview` renders a diff of what a patch would change without applying it
- [x] **EDIT-03**: `bw-diff` surfaces notes added/removed/changed, automation targets touched, and scope (track/clip/region) between two states
- [x] **EDIT-04**: `bw-edit apply` applies a patch only after preview unless `--force` is used; every applied patch is recorded with a daemon-authoritative undo entry
- [x] **EDIT-05**: Undo is daemon-authoritative: `patch-history.jsonl` + `bw-edit revert` replay inverse operations (Bitwig native undo is caveated, not relied upon)
- [x] **EDIT-06**: Risk class gating classifies edits low/medium/high; only low-risk edits are one-step, medium/high require explicit confirmation

### MIDI Transforms (M2)

- [x] **MIDI-01**: Motif signature (pitch-class + rhythm quantization) and preserve-motif-identity mode are implemented; every creative transform runs in preserve-motif mode by default
- [ ] **MIDI-02**: `bw-midi vary` produces motif-preserving A/B/C variant patch candidates
- [ ] **MIDI-03**: `bw-midi counterline` generates a companion voice respecting harmonic center and motif identity
- [ ] **MIDI-04**: `bw-midi voice-leading-fix` produces a low-risk cleanup patch (parallel fifths, leading tones, spacing)
- [ ] **MIDI-05**: Velocity/timing humanization produces a low-risk humanization patch

### Arrangement Intelligence (M3)

- [ ] **ARRANGE-01**: `bw-arrange sections` performs bottom-up temporal segmentation of the project with confidence scores
- [ ] **ARRANGE-02**: `bw-arrange repetition-report` produces a self-similarity report over the arrangement
- [ ] **ARRANGE-03**: `bw-arrange energy-curve` produces a per-bar energy curve
- [ ] **ARRANGE-04**: Transition suggestions detect energy mismatches and repetition gaps between sections and propose small reversible patches
- [ ] **ARRANGE-05**: Track-role classification labels tracks (kick/bass/lead/pad/fx/hats/percussion) with confidence, stored in `roles.json`

### Automation & Devices (M4)

- [ ] **AUTO-01**: `bw-automation inspect` reports per-track automation salience (most expressive parameters)
- [ ] **AUTO-02**: `bw-device macros-suggest` proposes macro/XY assignments ranked by observed expressiveness
- [ ] **AUTO-03**: `bw-automation propose` generates a bounded automation curve patch for a selected parameter/region (medium risk → confirmation required)
- [ ] **AUTO-04**: Device inspection and automation workflows cover third-party VST/AU plugins loaded in the Bitwig device chain, not just native Bitwig devices

### UX & Architecture (cross-cutting, M1–M4)

- [x] **UX-01**: Pi `/analyze` skill reads selection/section/intent and produces critique + 2–4 next actions (M1)
- [ ] **UX-02**: Pi `/vary`, `/apply` skills drive the edit pipeline and a diff pane renders patch diffs (M2)
- [ ] **UX-03**: Pi `/review` skill + arrangement pane render section timeline + energy sparkline (M3)
- [ ] **UX-04**: Pi `/device` skill + device pane render chain summary + macro opportunities (M4)
- [x] **UX-05**: State pane renders selected track/clip/device + section label (M1)
- [x] **UX-06**: Every suggestion/transform output includes an `assumptions[]` field stating its assumptions
- [x] **ARCH-01**: Genre-pluggable profile interface is designed in M2; electronic/techno ships as the first profile, expanded in M4
- [x] **ARCH-02**: Generic reasoning core runs without a profile (defaults to generic electronic); profiles enhance, never gate, the core

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Future Profiles & Surfaces

- **ARCH-03**: Genre profiles beyond electronic/techno (e.g. house, ambient, drum-and-bass) as swappable profile packs
- **ARCH-04**: Evaluate bw-brain-as-VST/AU as an alternative integration model for non-Bitwig DAWs (architecture study, not commitment)
- **UX-07**: Additional/composable TUI panes beyond state/diff/arrangement/device
- **MEM-03**: Cross-project memory and motif library (shared motifs/patterns across projects)
- **NOTF-01**: Optional on-demand notifications for analysis completion (not real-time/always-listening)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Background auto-edits (heuristic edits without explicit user action) | Destroys the trust model — producer can't tell which changes are theirs; one bad heuristic wrecks the song silently |
| Cloud dependency / remote model calls | Violates local-first defining constraint; latency, privacy, offline-work breaks |
| MCP (Model Context Protocol) integration | Large tool registry that fights the "small toolbelt, bash-and-code-are-composable" stance; makes the contract less inspectable |
| Direct mutation without a patch object | No preview, no undo, no risk class, no audit trail — one bad call = wrecked song |
| Genre-specific hard-coding | Couples architecture to one genre; future profiles become forks |
| Heavy musical reasoning inside the Bitwig bridge | Stalls the audio engine; bridge crashes take down Bitwig |
| Generative "casino MIDI" (random generation without motif preservation) | Before accuracy works, creativity is just noise |
| Audio mastering / stem separation / audio MIR | bw-brain is MIDI/state/automation intelligence, not audio DSP |
| Mobile/web client | Terminal-first; web doubles the surface area and breaks local-first |
| Real-time / always-listening mode | Burns CPU, fights the audio engine, produces low-value suggestion stream |
| Multi-track mutation without explicit scope | Unbounded scope = unbounded risk; breaks the patch model |
| Patch without preview unless forced (`--force`) | Trust is earned; default is always preview |

## Traceability

Phase assignments finalized during roadmap creation (5 phases; see ROADMAP.md). Phase 1 is a de-risk spike leading with the Bitwig capability probe + IPC spike; Phases 2–5 map to milestones M1–M4.

| Requirement | Milestone | Phase | Status |
|-------------|-----------|-------|--------|
| BRIDGE-01 | M1 | Phase 2 | Pending |
| BRIDGE-02 | M1 | Phase 2 | Pending |
| BRIDGE-03 | M1 | Phase 2 | Pending |
| PROBE-01 | M1 | Phase 1 | Pending |
| PROBE-02 | M1 | Phase 1 | Pending |
| STATE-01 | M1 | Phase 2 | Complete (02-07 daemon boot wires end-to-end) |
| STATE-02 | M1 | Phase 2 | Pending |
| STATE-03 | M1 | Phase 2 | Pending |
| STATE-04 | M1 | Phase 2 | Complete (02-07 boot fires reconcile on every (re)connect) |
| CLI-01 | M1 | Phase 2 | Complete (02-07 daemon runnable; bw-* CLIs end-to-end) |
| CLI-02 | M1 | Phase 2 | Pending |
| CLI-03 | M1 | Phase 2 | Pending |
| MEM-01 | M1 | Phase 2 | Pending |
| MEM-02 | M1 | Phase 2 | Pending |
| UX-01 | M1 | Phase 2 | Pending |
| UX-05 | M1 | Phase 2 | Pending |
| UX-06 | M1+ | Phase 2 | Pending |
| EDIT-01 | M2 | Phase 3 | Pending |
| EDIT-02 | M2 | Phase 3 | Pending |
| EDIT-03 | M2 | Phase 3 | Pending |
| EDIT-04 | M2 | Phase 3 | Pending |
| EDIT-05 | M2 | Phase 3 | Pending |
| EDIT-06 | M2 | Phase 3 | Pending |
| MIDI-01 | M2 | Phase 3 | Pending |
| MIDI-02 | M2 | Phase 3 | Pending |
| MIDI-03 | M2 | Phase 3 | Pending |
| MIDI-04 | M2 | Phase 3 | Pending |
| MIDI-05 | M2 | Phase 3 | Pending |
| UX-02 | M2 | Phase 3 | Pending |
| ARCH-01 | M2 | Phase 3 | Pending |
| ARCH-02 | M2+ | Phase 3 | Pending |
| ARRANGE-01 | M3 | Phase 4 | Pending |
| ARRANGE-02 | M3 | Phase 4 | Pending |
| ARRANGE-03 | M3 | Phase 4 | Pending |
| ARRANGE-04 | M3 | Phase 4 | Pending |
| ARRANGE-05 | M3 | Phase 4 | Pending |
| UX-03 | M3 | Phase 4 | Pending |
| AUTO-01 | M4 | Phase 5 | Pending |
| AUTO-02 | M4 | Phase 5 | Pending |
| AUTO-03 | M4 | Phase 5 | Pending |
| AUTO-04 | M4 | Phase 5 | Pending |
| UX-04 | M4 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓
- Orphaned/duplicated: 0 ✓

**Per-phase distribution:**

- Phase 1 (Schema & IPC Spike): 2 — PROBE-01, PROBE-02
- Phase 2 (Read-Only Context Foundation / M1): 15 — BRIDGE ×3, STATE ×4, CLI ×3, MEM ×2, UX-01, UX-05, UX-06
- Phase 3 (Reversible MIDI Patching / M2): 14 — EDIT ×6, MIDI ×5, UX-02, ARCH-01, ARCH-02
- Phase 4 (Arrangement Intelligence / M3): 6 — ARRANGE ×5, UX-03
- Phase 5 (Automation & Device Workflows / M4): 5 — AUTO ×4, UX-04

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-26 after roadmap creation (phase assignments finalized)*
