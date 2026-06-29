# bw-brain

## What This Is

`bw-brain` is a local-first intelligence layer for Bitwig — not a chatbot feature, but a copilot runtime. A Java `.bwextension` bridge mirrors live project state to a TypeScript daemon, which normalizes it into a composition-state model, runs analysis and reversible transforms, and serves a stable CLI contract (JSON in/out). A Pi/OpenClaw package is the first-class UX (slash commands, skills, TUI panes). The stable interface is the CLI, not the agent: Pi gets the best UX, but any coding agent or shell script can drive the same commands, files, and docs. Built for a single producer composing in Bitwig (initially electronic/techno-leaning), designed to be composable and genre-pluggable.

## Core Value

The assistant reliably understands and describes the selected Bitwig context (clip/device/region/arrangement) and can only change the project through small, previewable, reversible, undo-labelled patches — so it never wrecks the song. Accurate first; creative later.

## Requirements

### Validated

(None yet — ship to validate)

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
- [ ] Ship a Pi package: skills (analyze, inspect-device, vary-midi, review-arrangement, suggest-next-edits, apply-patch), slash commands, and TUI panes (state, diff, arrangement, device)
- [ ] Enforce guardrails: no background edits, no edit without a patch object, every patch gets an undo label, every suggestion states assumptions, risk-gated apply flow

### Out of Scope

- Cloud dependency / remote model calls — local-first is a defining constraint; the bridge and daemon must run offline
- MCP — deliberately avoided; a thin JSON-Lines bridge is the chosen IPC (per the "bash and code are composable" stance against large tool registries)
- Background/heuristic auto-edits without a patch object — violates the trust model
- Genre-specific hard-coding — reasoning stays generic with pluggable profiles instead of baked-in assumptions
- Heavy musical reasoning inside the Bitwig bridge — the bridge stays dumb; reasoning lives in the daemon + Pi layer
- Mobile/web client — terminal-first; the CLI is the contract

## Context

**Origin & motivation:** Sparked by the realization that what's wanted is a *local Bitwig intelligence layer with a Pi-native shell*, not a chatbot. Bitwig is a solid substrate (open controller extension API, official public extensions repo, in-app Developer Resources for the scripting guide/API reference). Pi/OpenClaw is a good UX host because it is small, extension-oriented, and comfortable with session persistence, skills, slash commands, and custom terminal UI.

**Architecture (4 components):**
1. **Bitwig bridge** — Java `.bwextension` running inside Bitwig. Dumb: mirrors selection/tracks/clips/devices/params, exposes edit primitives, labels operations for undo, emits change events, provides stable IDs. No musical reasoning.
2. **Local daemon** — TypeScript process outside Bitwig. Receives snapshots/events, normalizes into a composition-state model, maintains disk-backed cache, runs analyzers/transforms, serves CLI commands, emits patch proposals/diffs.
3. **CLI surface** — Small commands with predictable JSON I/O (`bw-focus`, `bw-project`, `bw-device`, `bw-midi`, `bw-arrange`, `bw-automation`, `bw-edit`, `bw-diff`). The stable automation contract any agent or shell can use. Compact JSON, clear failures, no prose unless `--explain`.
4. **Pi package** — First-class UX: skills, slash commands, session-memory helpers, TUI views (state/diff/arrangement/device panes).

**Data model (the heart of it):**
- **A. Raw project state** — as close to Bitwig as possible (project, transport, selection, tracks, clips, devices, automation).
- **B. Derived composition state** — sections (label + confidence), trackRoles, motifs (with signatures), energyCurve, automationSalience. Where musical reasoning starts.
- **C. Intent state** — `projectIntent` (summary, constraints, targets). Keeps the assistant from ruining the song.
- **D. Patch & diff model** — never mutate directly without a patch object: `scope → operations → rationale → reversible`. Operations are typed (e.g. `midi_velocity_scale`, `insert_notes`).

**Local protocol:** newline-delimited JSON over localhost socket or stdio relay. Versioned messages. Events (`selection.changed`), requests (`get.selected_clip`), responses, and edit requests (`apply.patch` with `undoLabel`).

**Memory classes:** durable project memory in project-local `.bw-brain/` files (`state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl`) vs ephemeral Pi session memory (current experiment thread, last analyses, candidate patches). Lets you try ideas without contaminating the project's durable musical identity.

**Guardrails (lives or dies on trust):** no background edits; no multi-track mutation unless explicitly scoped; no edit without a patch object; no patch without preview unless forced; every applied patch gets an undo label; every suggestion states assumptions; every transform has a "preserve motif identity" mode. Risk classes — low (humanize, cleanup, macro suggestions): one-step ok; medium (add/remove few notes, automation on selected param, section dup); high (reharmonization, broad arrangement, multi-track): never one-step.

**Milestone plan (from seed):**
- **M1 — bridge + read-only context:** extension, daemon, `bw-focus export`, `bw-midi inspect`, `bw-device inspect`, `bw-project summary`, Pi `/analyze`. No editing. Success: assistant reliably describes selected clip/device/region; session memory already useful.
- **M2 — reversible MIDI patching:** patch schema, preview/diff/apply flow, subtle variation, counterline, voice-leading cleanup, Pi `/vary` + `/apply`. Success: musically sane A/B/C variants; transparent, reversible edits.
- **M3 — arrangement intelligence:** section detection, repetition report, energy curve, transition suggestions, Pi `/review`. Success: project-level critique becomes genuinely useful.
- **M4 — automation & device workflows:** automation inspection, parameter-target suggestions, macro exposure proposals, bounded automation generation, Pi `/device`. Success: assistant helps with sound design and movement, not just notes.

**Sequencing stance:** do NOT start by trying to make the assistant "creative." Start by making it *accurate* — boringly good at understanding context, explaining it, producing clean diffs, keeping memory straight, not wrecking the project. The creative layer only becomes valuable after that works.

## Constraints

- **Tech stack — Bitwig bridge:** Java `.bwextension` — matches Bitwig's official extension path and gives a sturdier long-running bridge than scripts (JS prototyping permitted, harden in Java later).
- **Tech stack — daemon + CLI + Pi package:** TypeScript — matches Pi/OpenClaw ecosystem and lowers friction for the Pi package.
- **IPC:** localhost TCP or stdio relay, JSON Lines, version every message. No MCP.
- **Local-first:** no cloud/remote model calls; bridge + daemon run offline.
- **Edit model:** all mutations go through patch objects with scope/operations/rationale/reversibility/risk; preview before apply; undo labels mandatory.
- **Trust model:** low-risk edits only may be one-step; medium and high require explicit confirmation.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI is the stable interface, not the agent | Pi gets best UX but any agent/shell can drive the same commands, files, docs — composable and future-proof | — Pending |
| Scope this GSD project to all 4 milestones | Milestones are tightly coupled (shared bridge/daemon/data model); decomposing as one roadmap keeps the foundation coherent | — Pending |
| Pi/OpenClaw is a real, installed runtime | Pi package layer is in scope and buildable from M1; first-class UX is not deferred | — Pending |
| Pluggable genre profiles, generic reasoning core | Avoids hard-coded genre assumptions; electronic/techno is the first profile, not the architecture | — Pending |
| Java bridge from day one (no JS prototyping) | Official Bitwig extension path; sturdier long-running bridge. Spike (Phase 1) confirmed JS control-surface `host` exposes NO networking/file I/O — JS is unusable for the transport, so Java `.bwextension` is mandatory, not just preferred | ✓ Phase 1 — JS prototyping ruled out; Java pivot proven live |
| No MCP — thin JSON-Lines bridge | Matches "small toolbelt over large tool registries"; keeps the contract inspectable and composable | — Pending |
| VST/AU params: A1 NEGATED — `CursorDevice` exposes no `getRemoteControls()` in extension-api:21 | Live Surge XT probe (Phase 2 UAT, 2026-06-29) confirmed VST params do NOT surface via CursorRemoteControlsPage; `bw-device inspect` returns empty pages by design. `cursorDevice.getParameter(int)` direct-enumeration is the documented fallback | ✓ Phase 2 — NEGATED; fallback deferred to Phase 5 (device workflows) |

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
*Last updated: 2026-06-29 after Phase 2*
