# bw-brain — Domain Context

`bw-brain` is a local-first intelligence layer for Bitwig: a hybrid CLAP companion, controller bridge, and daemon-managed reasoning runtime. The CLAP plug-in is the primary producer-facing workspace inside Bitwig; a Java `.bwextension` bridge is the authoritative reader/mutator for Bitwig project state; a TypeScript daemon owns normalization, sessions, policy, proposals, and the bounded Pi runtime; the CLI is a stable JSON automation/diagnostic/recovery contract, not the primary interface.

**Core value:** the assistant reliably understands and describes the selected Bitwig context, and can only change the project through small, previewable, reversible, undo-labelled patches — so it never wrecks the song. Accurate first; creative later.

Decisions live in [`docs/adr/`](docs/adr/). Verified Bitwig API behavior lives in [`docs/bitwig-capabilities.md`](docs/bitwig-capabilities.md) and [`docs/bitwig-clap-capabilities.md`](docs/bitwig-clap-capabilities.md).

## Architecture (5 components)

1. **Bridge** — Java `.bwextension` running inside Bitwig. Dumb: mirrors selection/tracks/clips/devices/params, exposes edit primitives, labels operations for undo, emits change events, provides stable IDs. No musical reasoning.
2. **CLAP companion** — thin in-Bitwig workspace and real-time endpoint. Displays confirmed context and proposals, collects explicit actions, schedules only exact approved bounded MIDI. Never owns mutation authority.
3. **Daemon** — TypeScript process outside Bitwig. Owns normalized state, project/instance sessions, focus, policy, proposal lifecycle, edit orchestration, persistence.
4. **Pi runtime** — daemon-managed SDK runtime (Pi 0.84.0) with one project-scoped session and a small bounded tool surface. Proposes; cannot apply or arm.
5. **CLI** — predictable JSON I/O (`bw-*` multicall binary) for automation, diagnostics, testing, recovery.

## Data model

- **A. Raw project state** — as close to Bitwig as possible (transport, selection, tracks, clips, devices, automation).
- **B. Derived composition state** — sections (label + confidence), trackRoles, motifs (with signatures), energyCurve, automationSalience. Where musical reasoning starts.
- **C. Intent state** — `projectIntent` (summary, constraints, targets). Keeps the assistant from ruining the song.
- **D. Patch model** — never mutate without a patch object: `scope → operations → rationale → reversibility → risk`. Operations are typed (`midi_velocity_scale`, `insert_notes`, `automation_points`, …).

## Glossary

- **Patch object** — the only mutation currency. Scope + operations + rationale + reversibility + risk. The bridge refuses unlabeled edits at schema-validation time.
- **Undo label** — mandatory non-empty label on every patch; how applied edits are identified to the producer.
- **Risk class** — low (humanize, cleanup, macro suggestions): one-step ok. Medium (add/remove few notes, automation on selected param, section dup): explicit confirmation. High (reharmonization, broad arrangement, multi-track): never one-step.
- **Candidate** — an ephemeral proposed patch held in the daemon's LRU candidate store until approved or evicted.
- **Journal** — `patch-history.jsonl`; the daemon-freezes the inverse ops at apply time while it holds authoritative before-state. Revert replays the frozen inverse, never re-derives from drifted state.
- **Pre-flight gates** — daemon-side refusals before any bridge round-trip: `wrong_clip_targeted`, `wrong_device_targeted`, `automation_write_disabled`, `prior_unavailable`, `ambiguous_target`.
- **clipSid / deviceSid** — stable synthetic IDs for clips/devices. clipSid V1 = `"clip_" + sha256(trackSid:loopBeats).slice(0,16)` (see ADR-0009).
- **Freshness** — every read surfaces its state age (`pulledAt`, stale-but-readable when disconnected); stale state is labeled, never silent.
- **snapshot_invalid** — single refusal vocabulary for corrupt/unvalidatable persisted snapshots on both CLI and CLAP peer paths.
- **Launcher grid** — Bitwig clip-launcher scene/slot grid; pulled via `get.launcher_clips` with a bounded 90s bank-sync settle window (the 3000ms default pull timeout is too short for large grids).
- **Salience** — per-track ranking of parameter expressiveness from live `parameter.changed` movement (aggregates keyed `deviceKey:source:paramIndex`, movement = delta > 1e-4, 512-cap).
- **Motif signature** — PCP + IOI + density fingerprint of a clip; drives motif-preserving transforms.
- **Genre profile** — opt-in bias file (`techno.json`); the generic core (`generic.json`) runs without one. Profiles enhance, never gate (ADR-0008).
- **Write-arm** — the operative automation-write pre-flight: unarmed/unobserved arm refuses `automation_write_disabled`. Transport-stopped writes are allowed when armed (ADR-0010).
- **Probe-pins-refuse-rest** — only surfaces proven by a dated live probe in `docs/bitwig-capabilities.md` are used; everything else refuses with a named reason, never a guess-write.
- **capturedPriorValue** — bridge automation responses must carry the captured prior value or the daemon refuses `prior_unavailable` and journals nothing (never a guessed inverse).
- **Proposal** — a Pi- or analyzer-authored suggestion published to the CLAP drawer with digest + `assumptions[]`; approval tokens are single-use, fixed-expiry, compare-and-delete.
- **Existing-edit approval** — approval path delegating to the shared EditService (journal-backed); distinct from **bounded live MIDI** (exact scheduled phrase playback; original host buffer untouched; outside PatchHistory).
- **Controller correlation** — nonce-bound handshake proving a CLAP instance is the controller-selected device; names are hints, never authority.
- **Instance identity / rekey** — persisted per-project plug-in identity (closed versioned binary record); explicit Save As fork requires a rekey to prevent source/copy history aliasing.
- **Memory classes** — durable project memory in `.bw-brain/` (`state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl`) vs daemon-owned session history vs ephemeral candidates. Experiment threads never write durable memory.
- **Bounded context** — only confirmed-scope, bounded data reaches a reasoning provider on explicit Analyze; raw audio never leaves the plug-in (ADR-0005).

## Guardrails (trust model)

- No background edits; no edit without a patch object; no patch without preview unless forced; every applied patch gets an undo label; every suggestion states `assumptions[]`; every transform has a preserve-motif-identity mode.
- Multi-track mutation only when explicitly scoped (multi-track = high risk).
- Authority queues refuse on pressure (no silent drops); lifecycle disarm uses a non-droppable atomic latch.

## Local protocol

Newline-delimited JSON over localhost TCP (loopback-enforced) or UDS/stdio for CLI↔daemon; versioned messages; atomic-line writes; explicit backpressure (observational events drop-oldest, edits/requests never drop). No MCP (ADR-0002).
