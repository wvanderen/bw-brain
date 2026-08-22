# bw-brain

## What This Is

`bw-brain` is a local-first intelligence layer for Bitwig — a hybrid CLAP companion, controller bridge, and daemon-managed reasoning runtime. The CLAP plug-in is the primary producer-facing workspace inside Bitwig: it shows confirmed scope, analysis, proposals, approval, and bounded generated MIDI. A dumb Java `.bwextension` remains the authoritative reader/mutator for Bitwig project state, while the TypeScript daemon owns normalization, sessions, policy, proposals, and the exact Pi runtime. The CLI remains a stable JSON automation, diagnostic, and recovery contract rather than the primary interface.

## Core Value

The assistant reliably understands and describes the selected Bitwig context (clip/device/region/arrangement) and can only change the project through small, previewable, reversible, undo-labelled patches — so it never wrecks the song. Accurate first; creative later.

## Requirements

### Validated

- [x] Thin CLAP companion works in Bitwig in together and separate hosting modes, including persistent identity, confirmed scope, Analyze, proposal review, existing-edit approval, bounded live MIDI, Stop, reconnect, Save As fork, and transparent audio/MIDI pass-through (Phase 04.2).
- [x] Pi 0.84 runs headlessly inside the daemon with project-scoped sessions and bounded tools; it has no direct Bitwig, socket, filesystem, apply, arm-token, or raw-audio authority (Phase 04.2).
- [x] Controller/daemon trust spine remains authoritative for project mutation and daemon-authoritative journal/revert behavior (Phases 3, 03.1, 04.2).
- [x] CLAP-native arrangement review exposes populated scene, energy, repetition, role, assumption, and advisory transition evidence with durable freshness and CLI recovery parity (Phase 04.3).

### Active

- [ ] Observe and export live Bitwig project state (transport, selection, tracks, clips, devices, automation) via a Java `.bwextension` bridge
  - *Phase 2 (M1) delivered: selection, tracks, clips, devices, transport events mirror live over loopback TCP (5/5 event types verified). Still outstanding: project metadata (tempo/time-signature/transport position) via a `get.project_meta` handler, and automation (Phase 5).*
- [ ] Enumerate device-chain parameters (incl. VST/AU plugins) via the `cursorDevice.getParameter(int)` fallback
  - *Emerged Phase 2 (A1 NEGATED): `CursorDevice` exposes no `getRemoteControls()` in extension-api:21, so `bw-device inspect` returns empty pages. Direct parameter enumeration lands in Phase 5 (device workflows). Documented in `docs/bitwig-capabilities.md §4`.*
- [ ] Normalize bridge snapshots into a disk-backed composition-state model (raw state → derived state → intent state)
- [ ] Provide a stable CLI surface with predictable JSON I/O for context export, inspection, analysis, transforms, and the edit pipeline
- [ ] Detect arrangement structure: sections, repetition, energy curve, automation salience
- [ ] Classify track roles and motif identity (generic core + swappable genre profiles)
- [ ] Maintain durable project memory (track roles, project intent, accepted/rejected patterns, motif identities) in `.bw-brain/`
- [ ] Edit only through a patch/diff model: scope → operations → rationale → reversibility → risk class, with preview before apply
- [ ] Generate musically sane, motif-preserving MIDI transforms (subtle variation, counterline, voice-leading cleanup)
- [ ] Propose bounded automation and macro-exposure targets for device chains
- [ ] Complete the CLAP-first product surface for device/automation workflows; keep legacy Pi skills and the CLI as secondary headless interfaces
- [ ] Enforce guardrails: no background edits, no edit without a patch object, every patch gets an undo label, every suggestion states assumptions, risk-gated apply flow

### Out of Scope

- Mandatory cloud dependency — bridge, daemon, state, policy, mutation, and non-AI inspection must work locally; a configured reasoning provider may be local or explicitly remote
- MCP — deliberately avoided; a thin JSON-Lines bridge is the chosen IPC (per the "bash and code are composable" stance against large tool registries)
- Background/heuristic auto-edits without a patch object — violates the trust model
- Genre-specific hard-coding — reasoning stays generic with pluggable profiles instead of baked-in assumptions
- Heavy musical reasoning inside the Bitwig bridge or audio callback — reasoning lives in daemon-managed Pi sessions
- Mobile/web client — the in-Bitwig CLAP editor is the primary product surface

## Context

**Origin & motivation:** The project began as a local Bitwig intelligence layer with an external Pi-native shell. Phase 04.1/04.2 proved a cleaner product shape: keep Pi as the bounded reasoning engine behind the daemon and put the musical decision loop inside Bitwig through a thin CLAP companion.

**Architecture (5 components):**
1. **Bitwig bridge** — Java `.bwextension` running inside Bitwig. Dumb: mirrors selection/tracks/clips/devices/params, exposes edit primitives, labels operations for undo, emits change events, provides stable IDs. No musical reasoning.
2. **CLAP companion** — Thin in-Bitwig workspace and real-time endpoint. It displays confirmed context and proposals, collects explicit actions, and schedules only exact approved bounded MIDI; it never owns project mutation authority.
3. **Local daemon** — TypeScript process outside Bitwig. Owns normalized state, project/instance sessions, focus, policy, proposal lifecycle, edit orchestration, and persistence.
4. **Pi runtime** — Exact daemon-managed SDK runtime with one project-scoped session and a small bounded tool surface. It proposes; it cannot apply or arm.
5. **CLI surface** — Predictable JSON I/O for automation, diagnostics, testing, and recovery. It remains supported but is no longer the primary human UX.

**Data model (the heart of it):**
- **A. Raw project state** — as close to Bitwig as possible (project, transport, selection, tracks, clips, devices, automation).
- **B. Derived composition state** — sections (label + confidence), trackRoles, motifs (with signatures), energyCurve, automationSalience. Where musical reasoning starts.
- **C. Intent state** — `projectIntent` (summary, constraints, targets). Keeps the assistant from ruining the song.
- **D. Patch & diff model** — never mutate directly without a patch object: `scope → operations → rationale → reversible`. Operations are typed (e.g. `midi_velocity_scale`, `insert_notes`).

**Local protocol:** newline-delimited JSON over localhost socket or stdio relay. Versioned messages. Events (`selection.changed`), requests (`get.selected_clip`), responses, and edit requests (`apply.patch` with `undoLabel`).

**Memory classes:** durable project memory in project-local `.bw-brain/` files (`state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl`) vs daemon-owned project session history and ephemeral candidates. CLAP instance identity persists in host state; explicit Save As fork prevents source/copy history aliasing.

**Guardrails (lives or dies on trust):** no background edits; no multi-track mutation unless explicitly scoped; no edit without a patch object; no patch without preview unless forced; every applied patch gets an undo label; every suggestion states assumptions; every transform has a "preserve motif identity" mode. Risk classes — low (humanize, cleanup, macro suggestions): one-step ok; medium (add/remove few notes, automation on selected param, section dup); high (reharmonization, broad arrangement, multi-track): never one-step.

**Milestone plan (from seed):**
- **M1 — bridge + read-only context:** extension, daemon, `bw-focus export`, `bw-midi inspect`, `bw-device inspect`, `bw-project summary`, Pi `/analyze`. No editing. Success: assistant reliably describes selected clip/device/region; session memory already useful.
- **M2 — reversible MIDI patching:** patch schema, preview/diff/apply flow, subtle variation, counterline, voice-leading cleanup, Pi `/vary` + `/apply`. Success: musically sane A/B/C variants; transparent, reversible edits.
- **M3 — arrangement intelligence:** section detection, repetition report, energy curve, and transition suggestions exist; Phase 04.3 brings their producer-facing review flow into CLAP and reconciles the legacy external-Pi UAT.
- **M4 — automation & device workflows:** automation inspection, parameter-target suggestions, macro exposure proposals, and bounded automation generation appear in the CLAP proposal workflow, backed by the controller/journal authority path.

**Sequencing stance:** do NOT start by trying to make the assistant "creative." Start by making it *accurate* — boringly good at understanding context, explaining it, producing clean diffs, keeping memory straight, not wrecking the project. The creative layer only becomes valuable after that works.

## Constraints

- **Tech stack — Bitwig bridge:** Java `.bwextension` — matches Bitwig's official extension path and gives a sturdier long-running bridge than scripts (JS prototyping permitted, harden in Java later).
- **Tech stack — CLAP:** C++17/CMake with the verified JUCE/free-audio CLAP adapter path; release licensing remains an explicit gate.
- **Tech stack — daemon + CLI + Pi runtime:** TypeScript.
- **IPC:** localhost TCP or stdio relay, JSON Lines, version every message. No MCP.
- **Local-first:** all DAW integration, raw project state, authorization, persistence, and mutation remain local. Reasoning may use a locally configured model or an explicitly configured remote provider; only bounded confirmed context is sent on explicit Analyze, never raw audio.
- **Edit model:** all mutations go through patch objects with scope/operations/rationale/reversibility/risk; preview before apply; undo labels mandatory.
- **Trust model:** low-risk edits only may be one-step; medium and high require explicit confirmation.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLAP editor is the primary product UX; CLI is the stable secondary contract | Keeps the musical decision loop in Bitwig while preserving scriptability, diagnostics, and recovery | ✓ Phase 04.2 live-verified; rebaseline accepted 2026-08-20 |
| Scope this GSD project to all 4 milestones | Milestones are tightly coupled (shared bridge/daemon/data model); decomposing as one roadmap keeps the foundation coherent | — Pending |
| Pi is a daemon-managed reasoning runtime, not a separate required UI | Preserves project-scoped reasoning and sessions without splitting the producer workflow across applications | ✓ Phase 04.2 live-verified; rebaseline accepted 2026-08-20 |
| Local-first permits explicit bounded remote inference | Local authority and data custody are the invariant; provider location is configurable and raw audio never leaves the plug-in | ✓ Rebaseline 2026-08-20 |
| Pluggable genre profiles, generic reasoning core | Avoids hard-coded genre assumptions; electronic/techno is the first profile, not the architecture | — Pending |
| Java bridge from day one (no JS prototyping) | Official Bitwig extension path; sturdier long-running bridge. Spike (Phase 1) confirmed JS control-surface `host` exposes NO networking/file I/O — JS is unusable for the transport, so Java `.bwextension` is mandatory, not just preferred | ✓ Phase 1 — JS prototyping ruled out; Java pivot proven live |
| No MCP — thin JSON-Lines bridge | Matches "small toolbelt over large tool registries"; keeps the contract inspectable and composable | — Pending |
| VST/AU params: A1 NEGATED — `CursorDevice` exposes no `getRemoteControls()` in extension-api:21 | Live Surge XT probe (Phase 2 UAT, 2026-06-29) confirmed VST params do NOT surface via CursorRemoteControlsPage; `bw-device inspect` returns empty pages by design. `cursorDevice.getParameter(int)` direct-enumeration is the documented fallback | ✓ Phase 2 — NEGATED; fallback deferred to Phase 5 (device workflows) |
| Arrangement labels remain confidence-gated while independent scene/energy/repetition/role evidence proves capture health | Preserves the local-first honesty contract: omit weak labels instead of guessing, without misreporting a populated launcher as empty | ✓ Phase 04.3 live-verified 2026-08-22 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-22 after Phase 04.3 live verification and CLAP-first product rebaseline completion*
