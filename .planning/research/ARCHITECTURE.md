# Architecture Research

**Domain:** Local-first DAW-intelligence / DAW-bridge copilot runtime (Bitwig)
**Researched:** 2026-06-25
**Confidence:** HIGH (core IPC/structure); MEDIUM on one Bitwig runtime sub-claim (TCP sockets) flagged for spike

## Standard Architecture

### System Overview

bw-brain is a **dumb-bridge / smart-daemon** split. A Java `.bwextension` runs *inside* Bitwig and exposes a thin, observable, typed edit surface to the outside world over a localhost TCP socket speaking newline-delimited JSON. A TypeScript daemon runs *outside* Bitwig, owns the authoritative normalized state model, runs all musical reasoning, and serves a small, stable CLI contract. A Pi/OpenClaw package is the first-class UX; any agent or shell can drive the same CLI.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  AGENT / UX LAYER   (no musical reasoning — composes the CLI contract)    │
├──────────────────────────┬──────────────────────┬────────────────────────┤
│  Pi/OpenClaw package     │  Other agents        │  Plain shell           │
│  • skills (md docs)      │  (Claude Code,       │  (bw-* one-liners,     │
│  • slash commands        │   OpenCode, …)       │   jq pipelines)        │
│  • TUI panes (state/diff │  drive same CLI      │                        │
│    /arrange/device)      │                      │                        │
└──────────┬───────────────┴──────────┬───────────┴───────────┬────────────┘
           │  JSON in/out             │  JSON in/out           │  JSON in/out
           ▼                          ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  STABLE CONTRACT LAYER   — the CLI surface (bw-focus, bw-midi, bw-device, │
│  bw-arrange, bw-automation, bw-edit, bw-diff) — versioned JSON, --explain │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │  localhost IPC (daemon-owned)
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  AUTHORITATIVE DAEMON  (TypeScript, outside Bitwig)                       │
│  ingest → state(raw/derived/intent) → analysis → transforms → patch       │
│  • owns normalized composition-state model + all musical reasoning        │
│  • serves CLI, emits patch proposals/diffs, enforces guardrails/risk      │
│  • owns .bw-brain/ durable memory + ephemeral session mem                 │
└──────────────┬────────────────────────────────────┬──────────────────────┘
               │ newline-delimited JSON (versioned)  │ atomic FS writes
               ▼ over localhost TCP                  ▼
┌──────────────────────────────┐   ┌────────────────────────────────────────┐
│  BITWIG BRIDGE (.bwextension,│   │  DISK-BACKED STATE  (.bw-brain/)        │
│   Java, inside the Bitwig    │   │  state-cache.json  (raw+derived, cache) │
│   JVM)                       │   │  patch-history.jsonl (append-only log)  │
│  • observers → event stream  │   │  intent.json, roles.json (small, durable)│
│  • execute typed operations  │   │  ephemeral session mem (Pi-owned, not    │
│  • undo labels, stable IDs   │   │   project-local)                        │
│  • NO musical reasoning      │   └────────────────────────────────────────┘
└──────────────┬───────────────┘
               ▼ Bitwig Control Surface API (in-process, in the Bitwig JVM)
        ┌─────────────────┐
        │   Bitwig Studio │   (the song; the only thing that ever mutates)
        └─────────────────┘
```

**Key property:** the *only* path that mutates the song is `patch → preview → apply` through the bridge. There is no background/heuristic edit path, no direct mutation from the daemon or any agent. This is the trust boundary the whole system lives or dies on.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Bitwig bridge** (`.bwextension`) | Pure adapter over the Bitwig Control Surface API. Subscribe to observers (selection, transport, tracks, clips, devices, params), emit change events, assign stable IDs, execute typed edit operations, label undo. **Zero musical reasoning, zero memory, zero policy.** | Java, packaged as `.bwextension`; built against `com.bitwig.extension.controller.api`; opens a `java.net` socket on init (daemon = TCP server, extension = client) |
| **Daemon** (TS) | Owns the authoritative normalized state. Ingest bridge events → normalize into raw/derived/intent layers → run analyzers & transforms → generate patches → serve CLI → enforce guardrails & risk classes → manage durable + ephemeral memory. | Long-running Node/TS process; IPC server on `127.0.0.1:<port>`; JSON-Schema validation on every ingest and disk load |
| **CLI surface** | The stable contract. Thin shims that ask the daemon and emit compact versioned JSON; fail clearly; prose only with `--explain`. No reasoning, no direct mutation. | Small `bw-*` bin scripts (TS/Node); read live daemon state or explicit JSON files |
| **Pi package** | First-class UX. Markdown skills (progressive-disclosure workflow docs), slash commands (thin CLI wrappers), TUI panes (live daemon-state subscribers), session-memory helpers. | TS/TSX in the Pi/OpenClaw extension model; connects to the same daemon socket the CLI uses |
| **Disk store** (`.bw-brain/`) | Durable project memory vs. ephemeral session memory, deliberately separated so experiments don't contaminate the song's musical identity. | `state-cache.json` (atomic temp+rename), `patch-history.jsonl` (append-only, self-describing lines), `intent.json`/`roles.json` (small, human-editable) |
| **Schemas** (`/schemas`) | Source of truth for every message and file shape. Three independent version domains: bridge protocol, on-disk cache, CLI output. | JSON Schema files; daemon validates against them on both ends |

## Recommended Project Structure

```
bw-brain/
├── bitwig-bridge/                 # the .bwextension (Java) — DUMB adapter
│   ├── extension/src/main/java/   # ControllerExtension, observers, socket client, op executors
│   ├── protocol/                  # message shapes shared with daemon
│   └── pom.xml
├── daemon/                        # the authoritative brain (TypeScript)
│   └── src/
│       ├── ingest/                # bridge-socket server + raw-event normalization
│       ├── state/                 # raw / derived / intent stores + projectors
│       ├── analysis/              # sections, trackRoles, motifs, energy, automationSalience
│       ├── transforms/            # midi vary / counterline / voice-leading / automation gen
│       ├── patch/                 # patch schema, preview, diff, apply, risk classification
│       ├── memory/                # .bw-brain/ disk I/O (cache, history, intent, roles)
│       └── cli/                   # the stable-contract command handlers
├── cli/                           # thin bin shims (bw-focus, bw-midi, …) → talk to daemon
│   └── bin/
├── schemas/                       # JSON Schema source of truth (3 version domains)
│   ├── protocol/                  # bridge ↔ daemon messages (versioned independently)
│   ├── disk/                      # on-disk cache files (migrations live here)
│   └── cli/                       # stable CLI output contract (what agents depend on)
├── pi-package/                    # first-class UX (skills/, slash/, tui/)
└── docs/                          # architecture.md, command-contracts.md, guardrails.md
```

### Structure Rationale

- **`bitwig-bridge/` is isolated:** everything inside is replaceable (Java ↔ a JS prototype later) without touching reasoning. It must compile to a `.bwextension` and depend only on the Bitwig API + a `protocol/` mirror it shares with the daemon.
- **`daemon/` mirrors the data-flow layers:** `ingest` → `state` (raw/derived/intent) → `analysis` → `transforms` → `patch`. Folder names are the pipeline stages, so a reader can trace data top-to-bottom.
- **`schemas/` has three sub-domains, not one flat dir:** protocol, disk, and CLI evolve at different rates. Keeping them separate forces the right "which contract am I changing?" question on every edit.
- **`cli/` is separate from `daemon/src/cli/`:** the `cli/bin` shims are the public surface (versioned, stable); `daemon/src/cli` is the internal handler implementation (free to refactor). Same split as "public API vs internals."
- **`pi-package/` is a leaf, not embedded:** it depends on the CLI contract only, never on daemon internals. This is what makes the agent layer substitutable.

## Architectural Patterns

### Pattern 1: Dumb Bridge / Smart Daemon (Adapter over a host API)

**What:** The in-host code (bridge) is a pure, near-zero-logic adapter over the DAW's control API. It translates host observers → outbound events and inbound typed ops → host API calls. All reasoning, memory, and policy live in the out-of-process daemon.
**When to use:** Any time you're bridging a closed host (DAW, browser, IDE) to an external copilot. Keeps the fragile, host-version-coupled, hard-to-iterate code as small as possible and moves the easy-to-iterate logic out where you can test it freely.
**Trade-offs:** + Daemon is fully unit-testable without a running DAW; + bridge survives a total rewrite; + the trust boundary (only typed ops pass) is auditable in one file. − You pay IPC latency on every observe/act (~localhost TCP, sub-ms to low-ms, acceptable for composition not live performance); − you must keep the op vocabulary disciplined or the bridge creeps toward "smart."

**Example:**
```typescript
// The bridge exports ONE handler for typed operations. No music knowledge here.
function executeOp(op: EditOperation): ApplyResult {
  switch (op.type) {
    case "midi_velocity_scale": return scaleVelocity(cursorClip, op.range, op.amount);
    case "insert_notes":        return insertNotes(cursorClip, op.notes);
    // ...every op is a pure primitive. Reasoning picked WHICH op upstream, in the daemon.
  }
}
```

### Pattern 2: Raw → Derived → Intent → Patch (layered, independently-versioned state)

**What:** Four distinct state layers, each with its own schema version and producer. *Raw* is the bridge's Bitwig-shaped snapshot. *Derived* is musical reasoning (sections, roles, motifs, energy) recomputed from raw. *Intent* is authored project goals (constraints/targets) that gate suggestions. *Patch* is the only mutation unit.
**When to use:** Whenever you mix "observed truth," "interpreted truth," "user goals," and "proposed change." Conflating them is the #1 cause of LLM-DAW systems that "flail" — they reason over stale or misread state.
**Trade-offs:** + Each layer can be cached, invalidated, and versioned independently; + intent cleanly separates "what the song is" from "what we want"; + the patch layer is the single audit surface. − More moving parts; you must define clear recompute triggers (derived recomputes on raw change; patches never auto-recompute derived).

### Pattern 3: CLI-as-stable-contract over daemon internals

**What:** The CLI command names, flags, JSON output shape, exit codes, and error format are the versioned public contract. Internal daemon models can refactor freely; a translation layer projects internals → the pinned CLI output schema. Any agent (Pi, Claude Code, OpenCode, shell) drives the same commands.
**When to use:** When you want agent-agnostic composability and don't want to bet the project on one agent runtime (or on MCP). Matches the "bash and code are composable" stance.
**Trade-offs:** + Future-proof against agent churn; + tiny context cost (one short README/skill doc per workflow vs. multi-k-token tool registries); + debuggable by humans with `jq`. − You must discipline the CLI as a real API (semver-ish, deprecation policy); − not as rich a real-time push model as MCP unless you add a TUI subscription path.

**Example:**
```bash
# The CLI never reasons — it asks the daemon and emits pinned-shape JSON.
$ bw-midi vary --selected --mode subtle --json
# {"schemaVersion":"cli.midi.vary/1","patch":{...},"risk":"low","assumptions":[...]}
```

### Pattern 4: Durable project memory vs. ephemeral session memory (deliberate separation)

**What:** Project identity (track roles, intent, accepted/rejected patterns, motif signatures, applied-patch history) lives in project-local `.bw-brain/`. Experimentation state (current candidate patches, "what if" branches, last analyses) lives in the Pi *session*, never on disk in the project. Trying an idea cannot contaminate the song's durable musical identity.
**When to use:** Any creative-assistant where "trying things" and "what the song is" must stay separable. Accidental memory contamination is a silent killer of trust.
**Trade-offs:** + Safe to experiment freely; + durable memory stays small and human-reviewable. − You must be explicit about *promoting* a session finding into durable memory (a deliberate write), or insights stay ephemeral.

## Data Flow

### Request Flow (read path — "describe what I selected")

```
[User: bw-focus export --json]
        ↓
[CLI shim] ──localhost──▶ [Daemon: cli/focus handler]
                                  ↓
                            [state store: raw ←(cache) + derived ←(recompute on stale)]
                                  ↓
                            [project to CLI output schema (pinned)]
                                  ↓
[compact JSON] ◀──localhost──── [Daemon]
```

### Request Flow (write path — the ONLY mutation path)

```
[User/Agent: bw-midi vary → bw-edit preview → bw-edit apply]
        ↓
[CLI shim] ──▶ [Daemon: transform → patch object {scope,ops,rationale,risk,reversible}]
                    ↓ risk class gate: low=one-step ok; medium/high=require explicit confirm
                    ↓
              [Daemon: preview = project raw ⇄ patch ⇒ diff]  → [bw-diff / TUI diff pane]
                    ↓ explicit apply (human confirms if risk > low)
              [Daemon → bridge: apply.patch{undoLabel, ops}]  ──localhost TCP──▶ [Bridge]
                                                                              ↓ executes typed ops
                                                                       [Bitwig mutates]
                                                                              ↓ observers fire
              [Bridge → Daemon: change events] ◀─────────────────────────────────
                    ↓
              [Daemon: append patch-history.jsonl, recompute derived, update state-cache.json]
```

### State Management

```
                           ┌─────────── BRIDGE (event producer) ───────────┐
                           │  observers → versioned JSON-Lines events       │
                           └───────────────────────┬───────────────────────┘
                                                   ▼ (ingest)
        ┌──────── DAEMON STATE STORE (authoritative) ────────┐
        │  raw   (schemaVersion: protocol.raw/N)  ← bridge    │
        │  derived (schemaVersion: disk.derived/N) ← analyzers│  ──recompute on raw change
        │  intent (schemaVersion: disk.intent/N)  ← authored  │  ──human/agent edited, durable
        │  pending patches (ephemeral)             ← transforms│ ──promote to history on apply
        └─────┬─────────────────┬──────────────────────┬──────┘
              ▼ atomic write     ▼ atomic write         ▼ append-only
        state-cache.json    intent.json/roles.json   patch-history.jsonl
        (last-writer-wins;  (small, human-editable)  (audit trail; one self-
         cache, loss-tolerant)                        describing line per apply)
```

### Key Data Flows

1. **Observe → normalize → cache:** Bridge observers emit `selection.changed`, `track.*`, `clip.*`, `device.*` events; daemon ingests into `raw`, atomically snapshots to `state-cache.json`. Derived layers recompute lazily/when raw changes.
2. **Suggest → patch → preview → apply → log:** Transforms produce *patch objects only* (never direct edits). `bw-edit preview` shows a diff; `bw-edit apply` sends `apply.patch` to the bridge with a mandatory `undoLabel`; on success the daemon appends `patch-history.jsonl` and recomputes derived state.
3. **Intent gates suggestions:** Every suggestion reads `intent.constraints` and must state its assumptions; a patch that would violate a constraint is flagged high-risk or refused before preview.
4. **Offline mode:** Daemon runs without Bitwig. CLI reads `state-cache.json`; apply is refused with a clear "bridge not connected" error. This keeps analysis/inspection useful while the DAW is closed.
5. **TUI live view:** Pi TUI panes subscribe to the daemon over the same localhost socket (a lightweight push channel alongside the request/response path) so state/diff/arrange panes update as the producer selects and edits.

## Scaling Considerations

This is a **single-producer, local-first** tool. "Scaling" here is about *project complexity and state size*, not user count — be realistic: there is no multi-user path.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Small project (≤32 tracks, ≤100 clips) | Full raw mirror cached in memory + on disk; derived recomputed eagerly on every raw change. No optimization needed. |
| Medium (orchestral/large arrangement, hundreds of clips, dense MIDI) | Lazy deep-clip fetch: cache the *observed/projected* subset; pull full note content on demand via request/response. Throttle/debounce derived recompute (it doesn't need to run on every note edit — debounce by region/clip). |
| Heavy automation + many devices | Don't cache every automation point eagerly; index automation *salience* (which params move, how much) rather than raw curves, and fetch raw curves per-region on demand. |

### Scaling Priorities

1. **First bottleneck — full-state cache bloat:** a naïve "mirror everything" raw cache gets large fast (every note in every clip). Fix: make `state-cache.json` the *projected/observed* view, and deep-fetch clip/device detail on demand via the request/response protocol. This also keeps the live event stream small (deltas, not full snapshots).
2. **Second bottleneck — derived recompute churn:** analyzers (sections, motifs, energy) are more expensive than ingest. Fix: region-scoped recompute + invalidation, debounce on rapid edits, and cache derived keyed by raw-region hash.

## Anti-Patterns

### Anti-Pattern 1: Smart bridge (musical reasoning inside Bitwig)

**What people do:** Put "is this a kick?", motif detection, or patch risk logic inside the `.bwextension` "because it's closest to the data."
**Why it's wrong:** Bridge code is host-version-coupled, hard to unit-test (needs a running DAW), slow to iterate, and duplicates reasoning the daemon already owns. It also blurs the trust boundary — now the in-DAW code makes policy decisions.
**Do this instead:** Bridge emits raw observations and executes typed ops. *Every* "what should change?" decision lives in the daemon. If the bridge needs a hint (e.g. a stable ID), that's mechanics, not reasoning.

### Anti-Pattern 2: Direct mutation bypassing the patch object

**What people do:** For "quick" edits, let the daemon or an agent call a bridge op directly without going through `scope → operations → rationale → risk → preview`.
**Why it's wrong:** This is the single fastest way to "wreck the song." It defeats the audit trail (`patch-history.jsonl`), skips undo labelling, and silently erodes the trust model that the project's core value depends on.
**Do this instead:** There is exactly one mutation entry point: `apply.patch` with a mandatory `undoLabel`, risk-classed, previewable. No exceptions, even for "obvious" edits. Enforce it in the daemon API, not just by convention.

### Anti-Pattern 3: OSC/UDP for the authoritative control channel

**What people do:** Reuse the proven DAW pattern (Bitwig OSC, Ableton LiveOSC) and run the whole bridge — including `apply.patch` — over UDP/OSC "because OSC already works in Bitwig."
**Why it's wrong:** OSC/UDP is fire-and-forget: no ordered delivery, no acknowledgement, no request/response correlation. For real-time controller feedback that's fine; for *deterministic patch application* a lost/reordered operation is a corrupted song and an un-debuggable failure.
**Do this instead:** Use OSC/UDP only as an optional real-time event *feed* (low-latency, lossy-tolerant). The authoritative request/response + `apply.patch` path is **localhost TCP, newline-delimited JSON** — debuggable with `nc`/`tail`, ordered, acknowledged. (OSC capability remains useful evidence that the Bitwig JVM permits networking at all.)

### Anti-Pattern 4: One mega-schema for "the project state"

**What people do:** A single `project-state.schema.json` versions raw, derived, and intent together, so any change to any layer breaks every consumer.
**Why it's wrong:** The layers change at completely different rates (raw tracks Bitwig API; derived tracks your analyzers; intent is human-edited). Coupling them makes every change a breaking change and freezes evolution.
**Do this instead:** Three independent schema version domains (protocol / disk / CLI), each additive-by-default with explicit major-bump migrations. The CLI output schema is the one agents depend on — version it most conservatively and translate to it from internals.

### Anti-Pattern 5: Conflating session memory with durable project memory

**What people do:** Write every "tried this" candidate patch into `.bw-brain/`, so the project's durable identity slowly absorbs every dead-end experiment.
**Why it's wrong:** Silent contamination: the song's "what worked / what was rejected" memory drifts toward noise; trust erodes without a clear cause.
**Do this instead:** Ephemeral candidate patches live in the Pi session; only *applied* (or explicitly promoted) findings reach `patch-history.jsonl` / durable memory. Promotion is a deliberate act.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Bitwig Studio** (the DAW/host) | Bridge = Java `.bwextension` using the Bitwig Control Surface API (`com.bitwig.extension.controller.api`); `CursorTrack`/`CursorClip`/`CursorDevice` follow selection; observers emit events; `PinnableCursorClip` note-steps enable MIDI edit ops. | API reference ships **in-app** under Help → Documentation → Developer Resources (confirmed by official `bitwig/bitwig-extensions` README). **Networking permitted:** the maintained DrivenByMoss OSC extension proves extensions can open sockets. |
| **Pi / OpenClaw** (UX host) | `pi-package/` is a leaf extension: skills (markdown), slash commands (TS, call the CLI), TUI panes (TSX, subscribe to daemon). Depends on the **CLI contract**, never daemon internals. | Makes the agent layer substitutable — Claude Code / OpenCode / shell all use the same commands. |
| **Filesystem** (`.bw-brain/`) | Daemon owns all writes; atomic temp+rename for cache/intent/roles; append-only for `patch-history.jsonl`. | Project-local, human-reviewable, git-able. Never written by the bridge or agents directly. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Bridge ↔ Daemon | **Newline-delimited JSON over localhost TCP.** Daemon = server; bridge = client (reconnects on Bitwig restart). Two sub-channels: request/response (queries, `apply.patch`) + one-way event stream (observers). | Daemon must run with or without Bitwig (offline analysis from cache). Version every message (`protocol/N`). |
| Daemon ↔ CLI | Daemon-internal (in-process handlers when the CLI shim is a thin client over the same socket, or direct when CLI is a daemon subcommand). | The *contract* is the CLI output schema, not this transport. |
| Daemon ↔ TUI panes | Same localhost socket; a lightweight push/subscribe channel for live updates. | Keeps TUI in sync without polling; reuses the one IPC seam. |
| Daemon ↔ Disk | All `state/`/`memory/` writes go through one serialization module that validates against `schemas/disk/*` and writes atomically. | Single chokepoint for durability + schema compliance. |

## IPC Recommendation (deep-dive + justification)

**Recommendation: localhost TCP, newline-delimited JSON. Daemon is the TCP server; bridge is the client.**

| Option | Verdict | Why |
|--------|---------|-----|
| **localhost TCP (JSON-Lines)** | ✅ **Recommended** | Ordered, reliable, acknowledged — required for deterministic `apply.patch`. Debuggable with `nc`/`tail`. One persistent connection = simple session. Bitwig JVM permits it (inferred from OSC proof). Daemon lifecycle independent of Bitwig. |
| OSC over UDP | ⚠️ Optional *event feed only* | Proven in Bitwig (DrivenByMoss), but fire-and-forget: no order/ack/correlation. Fine for real-time "selection changed" push, wrong for the authoritative control path. |
| stdio relay (daemon spawns helper; bridge talks its stdio) | 🟡 Fallback only | Viable if a port bind is impossible, but adds a relay process, complicates the daemon=server model, and is harder to debug. Only if the TCP spike fails. |
| MCP | ❌ Rejected (project decision) | Adds a heavy tool registry (~13–18k-token overhead per Zechner's measurement), poor composability, output must transit agent context. The thin CLI already gives agent-agnostic access. |

**Highest-risk unknown — and how it de-risks:** whether the `.bwextension` can open a *TCP* `ServerSocket`/`Socket` (not just UDP). PROVEN at HIGH confidence: extensions can open UDP sockets (DrivenByMoss OSC, 2018→Bitwig 5.3+, cross-referenced on mossgrabers.de + GitHub). That's strong evidence the JVM exposes the full `java.net` stdlib — but it is an **inference, not a direct proof, for TCP**. Confidence on the TCP claim: **MEDIUM.**

**Mitigation / phase-0 spike:** before committing to daemon-as-TCP-server, spend the first research phase confirming (a) the extension can open a TCP socket (client connect to the daemon, or bind a listener), and (b) the `CursorTrack`/`CursorClip`/`CursorDevice` observers emit what the raw model needs. If TCP is blocked, fall back to a stdio relay (daemon spawns a tiny native helper the extension talks to). This spike is cheap and removes the only structural uncertainty.

## Schema Versioning Strategy

Three **independent** version domains. Additive changes are forward-compatible; breaking changes bump major and ship a migration (for on-disk) or a new shape (for protocol/CLI).

| Domain | What it covers | Evolves with | Migration |
|--------|----------------|--------------|-----------|
| **Protocol** (`schemas/protocol/*`) | Bridge ↔ daemon messages (events, requests, responses, `apply.patch`) | Bitwig API surface + op vocabulary | New message types/versioned fields; old daemon still speaks N-1 for one cycle |
| **Disk** (`schemas/disk/*`) | `.bw-brain/` files: `state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl` | Daemon internals | On load, daemon runs N→N-1 migrators; `patch-history.jsonl` lines are each self-describing (`schemaVersion` per line) so old log entries never break |
| **CLI** (`schemas/cli/*`) | The public output contract agents depend on | Deliberately slow | Semver-ish; conservative. A translation layer projects daemon internals → the pinned CLI shape, so internal refactors never break agents |

**Rules:** every message and file carries `kind` + `schemaVersion`. Daemon validates on *every* ingest and *every* disk load. The CLI output schema is the most stable thing in the project — agents depend on it, so it changes least.

## Build Order Implications (reflecting on the seed's 4-milestone proposal)

The seed's proposed sequence — **M1 read-only context → M2 reversible MIDI patching → M3 arrangement intelligence → M4 automation/device** — is **well-founded** and the research validates it. The data-flow dependency graph is strictly layered: nothing downstream can be trustworthy until raw normalization is reliable, and nothing should mutate until the patch/diff/undo model exists. The seed's stance ("accurate first, creative later") is the correct de-risking order.

Refinements / flags for the roadmap:

1. **Insert a Phase-0 "schema + IPC spike" before M1.** The highest-risk unknown (Bitwig TCP networking, MEDIUM) and the foundation contract (the protocol + `project-state`/`patch` schemas) should be proven *first*, in a thin vertical slice: extension opens a socket → emits one real selection event → daemon normalizes it → one CLI command prints it. This de-risks the bridge and pins the contract both halves build against. Without it, M1 risks rework if the IPC model is wrong.

2. **M1 (read-only) is correctly first and should be split internally as schema → bridge observers → daemon ingest → CLI export.** Schema-first lets bridge and daemon proceed in parallel once the contract is fixed. Do *not* start coding observers before `protocol/*` and `project-state.schema.json` exist.

3. **M2 (MIDI patching) is correctly after M1.** It depends on the raw clip model (M1) *and* introduces the `patch`/`diff` schemas — which are the trust backbone for everything later. Sequence-locked behind M1.

4. **M3 (arrangement intelligence) can partially parallelize M2.** The derived-state analyzers need only the *raw* model stable (from M1), not the patch model. Good candidate to overlap with M2 to compress the schedule, if resourcing allows.

5. **M4 (automation/device) is correctly last.** Depends on the device/automation raw model (M1) + the patch model (M2); bounded automation generation also wants derived energy/section signals (M3) to target meaningfully. True dependent.

6. **Bridge lifecycle is a cross-cutting concern, not a milestone.** Reconnection-on-Bitwig-restart, stable-ID stability, and the observer→event mapping must be hardened *during* M1 and carried forward — flag it as a phase research item whenever the bridge is touched.

**Net recommendation to the roadmap:** treat the 4 milestones as the backbone, but lead with a thin Phase-0 schema+IPC spike that proves the bridge↔daemon seam and freezes the protocol contract. Mark every phase that touches the bridge as "needs deeper research" until the Phase-0 spike confirms full `java.net` access in the Bitwig JVM.

## Sources

- **Bitwig Controller Extension API — networking permitted (HIGH, cross-referenced primary):** DrivenByMoss ships a maintained **Open Sound Control (OSC)** extension, Bitwig 2.3 (2018) → Bitwig 5.3+ (June 2026), proving `.bwextension`s can open sockets. https://github.com/git-moss/DrivenByMoss (repo description lists OSC) and https://www.mossgrabers.de/Software/Bitwig/Bitwig.html (official distribution page lists "Open Sound Control / OSC" per version). OSC implies `java.net.DatagramSocket`; full TCP access is inferred (MEDIUM — flag for spike).
- **Official Bitwig extension framework + API reference location:** https://github.com/bitwig/bitwig-extensions — README confirms "A scripting guide and API reference resides in Bitwig Studio under Help > Documentation > Developer Resources"; community extensions listing at https://www.bitwig.com/support/technical_support/community-controller-extensions-and-scripts-29/.
- **CLI-as-contract vs MCP (the composability argument the seed cites):** Mario Zechner, "What if you don't need MCP at all?" (2025-11-02), https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/ — ~225-token README vs 13–18k-token MCP servers; "bash and code are composable."
- **Seed / project context:** `docs/seed.md` and `.planning/PROJECT.md` (4-component architecture, raw→derived→intent→patch data model, `.bw-brain/` memory classes, 4-milestone plan, guardrails).
- **Cross-DAW bridge patterns (MEDIUM, domain knowledge):** the OSC+scripting-layer model recurs across Ableton (LiveOSC/Max-for-Live, remote Python scripts), Reaper (ReaScript + OSC), FL Studio (Python controller scripts), and Sonic Pi (OSC-native). Pattern: OSC for real-time events; a higher-level reliable IPC/scripting layer for structured access.

---
*Architecture research for: local-first DAW-intelligence / DAW-bridge copilot (Bitwig)*
*Researched: 2026-06-25*
