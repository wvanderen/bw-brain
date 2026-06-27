# Phase 2: Read-Only Context Foundation (M1) - Research

**Researched:** 2026-06-27
**Domain:** Bitwig Java `.bwextension` bridge (production) + TypeScript long-running daemon + multicall CLI + Pi/OpenClaw UX pack — the read-only accuracy milestone
**Confidence:** HIGH on bridge observer surface + transport + CLI contract (all verified live in Phase 1); HIGH on stack (AGENTS.md-locked); MEDIUM on STATE-04 reconcile/watchdog semantics (designed from verified "no native IDs" finding, but the reconnect/stale policy is novel); MEDIUM on Pi pack shape (OpenClaw conventions verified, TUI-pane API unresolved).

<user_constraints>
## User Constraints (from CONTEXT.md)

> Copied verbatim. These are LOCKED — the planner honors them; research does not re-litigate.

### Locked Decisions

**Bridge Mirror Coverage**
- **D-01 — Cursor + windowed TrackBank (NOT cursor-only, NOT full enumeration):** The bridge mirrors the GUI selection via `CursorTrack` + `PinnableCursorClip` + `CursorDevice` (the proven surface from Phase 1's `cursorTrack.position()` round-trip) AND a windowed `TrackBank` (N tracks around the cursor, page size chosen by researcher) so `bw-project summary` can enumerate the project without a full fan-out. Rationale: pure cursor-only can't serve a project summary; full enumeration is the heaviest observer fan-out and bank-paging is still TODO-in-app (capabilities doc §4). Windowed-N bounds cost while enabling the project view.
- **D-02 — Cursor device chain incl. VST/AU params (meets CLI-03):** Device-chain mirroring follows `CursorDevice` and enumerates its parameter pages (`CursorRemoteControlsPage`, 8 remotes/page) **including loaded VST/AU plugins** — VST/AU params are exposed through the same parameter-page surface as native devices. This is the M1 must-have CLI-03 ("including loaded VST/AU plugins"). Native-only was rejected as under-delivering CLI-03; full-chain (every device, not just cursor) was rejected as heavier than M1 needs.
- **D-03 — Hybrid push/pull snapshot delivery:** Observers **push** lightweight/volatile state (selection, transport, track/clip/device name + position) as events — the proven `selection.changed` path, drop-oldest under flood (Phase 1 backpressure). Heavy/verbose inspection (full note list, parameter-page dump) is **pulled** on-demand via `get.*` request/response. Rationale: bounds observer fan-out under rapid change, reuses BOTH envelopes Phase 1 froze (event + request/response), matches the bounded-queue backpressure design. Pure-push wastes the request channel; pure-poll loses the live `selection.changed` reactivity the spike proved.
- **D-04 — Automation mirror deferred (raw slot reserved, empty):** The raw-state model keeps the `automation` field (seed §A) but the bridge leaves it **empty in M1**. Automation inspection is explicitly AUTO-01 (Phase 5); the §3 automation-write probe is deferred to pre-Phase-3; `bw-automation` is an M4 command. Keeps M1 focused on notes/devices/structure.

**CLI Surface & Daemon Shape**
- **D-05 — Read commands live + 3 stubs + bw-diff promoted:** The four read commands ship functionally: `bw-focus` (export), `bw-project` (summary/region), `bw-midi` (inspect), `bw-device` (inspect). `bw-diff` is **promoted to a live M1 command** (read-only state-vs-state diff: notes/automation/scope between two raw-state snapshots — NOT patch-diff, which is M2) so SC#1's *"bw-diff round-trips 100%"* is satisfied. The remaining three (`bw-arrange`, `bw-automation`, `bw-edit`) are registered as **stubs that emit a clear "not implemented until M2-M4" JSON failure** (honors CLI-01 "all 8 emit JSON" + "fail clearly"). CLI-01's "eight CLI commands" is thus delivered as: 5 live + 3 stubs.
- **D-06 — Multicall binary + `bw-*` shims:** One multicall `bw-brain` binary dispatched by `argv[0]`; `bw-focus`, `bw-project`, `bw-midi`, `bw-device`, `bw-diff` (and the three stubs) installed as thin shims/symlinks to it. BOTH `bw-focus export` (seed spelling) AND `bw-brain focus export` work (git-style). One codebase, seed's snappy naming honored, shell-composable. (The Phase 1 throwaway `bw-brain-spike dump` is removed; `dump` is replaced by the real commands.)
- **D-07 — Long-running daemon as source of truth; CLI = thin client over a SEPARATE channel:** The daemon is the single source of truth — it holds the normalized state, writes `state-cache.json` atomically (temp+rename), reconciles stable IDs on bridge reconnect, and the watchdog marks state stale refusing edits when the bridge is silent (SC#3). The CLI is a **thin client** that queries the daemon over a **daemon-local channel separate from the bridge TCP port** (unix socket or second loopback port — researcher pins), with its **own query/response shape**. The bridge TCP port (`127.0.0.1:7878`) stays **bridge-only**. Rationale: SC#3's "daemon survives bridge reload" implies a long-running daemon; separating CLI-query from bridge-protocol keeps the two contracts independently evolvable and avoids mixing CLI traffic with bridge control on one socket.

**Derived-State & Intent Floor**
- **D-08 — Framework-only + intent; NO analyzers in M1:** Build the derivation **pipeline** (raw → derived normalizer, per-field confidence plumbing, `assumptions[]` attachment points) so Phases 3–5 plug analyzers in via a defined analyzer interface — but **no heavy analyzers run in M1**. `sections`/`trackRoles`/`motifs`/`energyCurve`/`automationSalience` (STATE-02) all stay **empty until their phase** (P3 MIDI-01, P4 ARRANGE-01..05, P5 AUTO-01). M1's only "derived" output is intent (STATE-03). Rationale: every STATE-02 analyzer is explicitly scoped to a later phase; pulling any forward is scope creep against the accurate-first, vertical-slice plan. The M1 deliverable is the *substrate*, not the analysis.
- **D-09 — Intent is user-authored in `.bw-brain/intent.json`:** `projectIntent` (`{summary, constraints[], targets[]}` per seed §C) is **user-authored**. M1 ships the intent schema + an atomic validated read; the daemon validates + serves it; `/analyze` grounds in it. **No inference** in M1 (accurate-first; inference is a later creative layer). Inferred defaults and full daemon-inference were both rejected as premature guessing. (Editing UX — a future `/intent` command or hand-edit — is the agent's discretion; M1 need only read it correctly.)

**Pi `/analyze` & Package Delivery**
- **D-10 — M1 `/analyze` = accurate description + read-actions, `assumptions[]` on each:** With no P3/P4 analyzers, `/analyze` outputs an **accurate description of the literal selection** (track/clip/device + transport + how it maps to the authored intent) + **2–4 next actions** that point at **read commands available NOW** (`bw-midi inspect`, `bw-device inspect`, edit `intent.json`) or surface intent/selection mismatches. **No invented musical critique** (no section/motif claims). Every output line carries `assumptions[]`. This honors UX-01 ("critique + 2–4 next actions") at the honest M1 floor and UX-06 (assumptions on every suggestion) from day one.
- **D-11 — State pane renders T/C/D + transport; section slot reserved:** UX-05's "selected track/clip/device + section label" is delivered as: render **track/clip/device + transport** (the proven raw state) now; the **section-label slot is reserved**, rendered empty/`—` until Phase 4 section detection lands. No fake section. The pane is not deferred (it ships in M1), but it doesn't invent a section it can't derive.
- **D-12 — Pi wraps the CLI; CLI contract tested, Pi validated by manual smoke:** The Pi pack is a **thin UX shell whose skills/commands invoke the CLI under the hood** (CLI = stable contract; Pi = best UX, per PROJECT). Phase 2 delivers the pack (the `/analyze` skill + slash command + state-pane) AND tests the **CLI contract rigorously** (automated). The Pi layer is validated by a **manual Pi-runtime smoke check**, NOT an automated live-Pi dependency. Matches PROJECT's locked decisions: "Pi/OpenClaw is a real, installed runtime" and "CLI is the stable interface — Pi gets the best UX, but any agent or shell can drive the same commands."

### the agent's Discretion
- **TrackBank page size (D-01):** the exact N (8/16/…) is left to the researcher — bank paging is still TODO-in-app; pick the smallest N that serves `bw-project summary` without the full-fan-out cost.
- **Daemon-local query channel (D-07):** unix socket vs second loopback port, and whether the query/response shape is a new schema or a constrained subset — researcher/planner pins; the binding invariant is "separate from the bridge TCP port."
- **Intent editing UX (D-09):** whether M1 adds a `/intent` command or treats `intent.json` as hand-edited-only is the agent's call; M1's hard requirement is a correct validated read.
- **Analyzer-plugin interface shape (D-08):** the exact input/output/confidence contract Phases 3–5 implement is designed in planning/research; M1 only needs it to *exist* and be empty.
- **`assumptions[]` JSON shape (D-10/UX-06):** the field schema every `/analyze` output (and every future suggestion/transform) inherits — designed in planning; M1 only needs it attached from day one.
- **Pi package location & discovery (D-12):** where the pack lives in the repo (top-level `pi/` module vs part of the daemon package), the skill/slash-command manifest, and the `/analyze` prompt source — researcher/planner pins against the real Pi/OpenClaw runtime conventions.

### Deferred Ideas (OUT OF SCOPE)
- Stable-ID reconcile + watchdog-stale semantics (SC#3 / STATE-04) deep-dive — within Phase 2 scope, left for research/planning (resolved in this doc, §Architecture Patterns Pattern 4).
- Java bridge build/packaging (Gradle, `bridge/` source location, ServiceLoader assembly, install) — within Phase 2 scope (resolved in this doc, §Standard Stack + §Code Examples; **note the Maven-vs-Gradle contradiction flagged below**).
- Daemon-local query channel shape (D-07), analyzer-plugin interface (D-08), `assumptions[]` schema (D-10), intent-edit UX (D-09), TrackBank page size (D-01), Pi package location/discovery (D-12) — all flagged as the agent's discretion above; **resolved with recommendations in this doc**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **BRIDGE-01** | Java `.bwextension` runs inside Bitwig and mirrors live selection (track/clip/device/region) and transport state to an external process via newline-delimited JSON over localhost | §Standard Stack (Java side) + §Code Examples "Bridge extension skeleton" — Phase 1 already proved `CursorTrack.position()` → `selection.changed` round-trip live (capabilities doc §Transport Decision). Phase 2 extends that to add `PinnableCursorClip`, `CursorDevice`, transport observers, and the windowed `TrackBank` (D-01). Build/packaging via Maven shade → `.bwextension` → install to `~/Documents/Bitwig Studio/Extensions/`. |
| **BRIDGE-02** | Bridge mirrors tracks, clips, launcher-clip notes, device chains (incl. VST/AU plugins), and exposed parameters via the Bitwig observer API | §Architecture Patterns Pattern 2 (Observer surface) — verified surface in capabilities doc §2 (NoteStep), §4 (TrackBank windowing), §5 (observers enqueue-never-block). D-02 confirms `CursorRemoteControlsPage` (8 remotes/page) exposes VST/AU params through the same surface as native devices. |
| **BRIDGE-03** | Bridge emits change events (`selection.changed`, etc.) and applies edit primitives (note add/remove, parameter set) labelled with the extension name | Push half (events): extends the Phase-1-frozen `event.schema.json` with new event types. **Pull/apply half (`get.*` + `apply.patch` handling) is M2 (Phase 3)** — the bridge implements the `get.*` request handler in M1 (D-03 pull path for note/param dumps); `apply.patch` handling lands with EDIT-01 in Phase 3 (the edit schema is already frozen). The `undoLabel` trust-spine is already enforced at the schema level. |
| **STATE-01** | Daemon ingests bridge snapshots and normalizes them into a raw project-state model validated against `schemas/project-state.schema.json` | §Architecture Patterns Pattern 3 (raw-state normalizer) + §Code Examples "raw-state schema seed" — new schema file `schemas/project-state.schema.json` (seed §A generalized), validated at the daemon boundary by Ajv (same pattern as Phase 1 envelope). |
| **STATE-02** | Daemon derives composition state (sections, trackRoles, motifs, energyCurve, automationSalience) from raw state, each with confidence scores | **Framework-only in M1 (D-08).** §Architecture Patterns Pattern 5 (analyzer-plugin interface) — the pipeline + per-field confidence + `assumptions[]` plumbing ships; every named analyzer stays EMPTY until its phase. M1 delivers the SUBSTRATE, not the analysis. |
| **STATE-03** | Daemon maintains an intent-state model (`projectIntent`: summary, constraints, targets) that constrains transforms and suggestions | §Code Examples "intent schema" — `schemas/intent.schema.json` from seed §C; user-authored `.bw-brain/intent.json` (D-09); atomic validated read. No inference in M1. |
| **STATE-04** | Daemon synthesizes stable IDs for observed Bitwig objects (Bitwig exposes none) via fingerprint mapping, with reconnect/reconcile-on-connect semantics | §Architecture Patterns Pattern 4 (STATE-04 fingerprint + reconcile + stale-watchdog) — the highest-complexity M1 design. Verified "no native stable IDs" (capabilities doc §6). Fingerprint = name + type + neighbors + content hash. Atomic `state-cache.json` (temp+rename). Stale-watchdog refuses EDITS (M2+) when bridge is silent — M1 has no edits, but the watchdog still marks state stale so `/analyze` and CLI output carries a `stateFreshness: "stale"` signal. |
| **CLI-01** | Eight CLI commands emit compact JSON, fail clearly, and suppress prose unless `--explain` is set | §Architecture Patterns Pattern 6 (multicall CLI) — 5 live (`bw-focus`, `bw-project`, `bw-midi`, `bw-device`, `bw-diff`) + 3 stubs (`bw-arrange`, `bw-automation`, `bw-edit`) per D-05. All emit JSON; stubs emit a structured `{ok:false, error:"not_implemented", availableFrom:"M2"|"M4"}` failure. |
| **CLI-02** | `bw-focus export`, `bw-project summary`, `bw-project region` return selected/project/region context as JSON | §Architecture Patterns Pattern 6 + §Code Examples "CLI query/response" — these are the project-summary surface (D-01 windowed TrackBank) + the focus export (cursor triple). Served by the daemon over the daemon-local channel (D-07). |
| **CLI-03** | `bw-midi inspect` and `bw-device inspect` return notes/velocity/timing and chain/parameters (incl. VST/AU plugins) of the selected clip/device as JSON | §Architecture Patterns Pattern 2 (D-03 pull path) — `bw-midi inspect` issues a `get.selected_clip` request for the full NoteStep dump; `bw-device inspect` issues `get.selected_device_chain` walking `CursorRemoteControlsPage` (8 remotes/page × N pages). VST/AU params come through the same surface (D-02). |
| **MEM-01** | Daemon maintains durable project memory in `.bw-brain/` (`state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl`) with atomic writes | §Architecture Patterns Pattern 7 (durable store) + §Code Examples "atomic write" — `fs.writeFile` to a temp file in the same dir, then `fs.rename` (atomic on POSIX/Node). `patch-history.jsonl` is created empty in M1 (used by Phase 3 EDIT-05); `roles.json` likewise empty until Phase 4 ARRANGE-05. |
| **MEM-02** | Ephemeral session memory (experiment thread, candidate patches) never writes to the durable store — a hard architectural boundary | §Architecture Patterns Pattern 7 + §Security Domain — ephemeral state stays inside the Pi session (`~/.pi/agent/` or the OpenClaw session JSONL). The daemon has NO API surface that accepts "ephemeral" data for durable write. SC#5. |
| **UX-01** | Pi `/analyze` skill reads selection/section/intent and produces critique + 2–4 next actions | §Architecture Patterns Pattern 8 (Pi `/analyze` pack) + §Code Examples "SKILL.md" — M1 floor (D-10): accurate description + 2–4 read-action next actions, NO invented critique (no analyzers yet). State-pane slot reserved for section (D-11). |
| **UX-05** | State pane renders selected track/clip/device + section label | §Architecture Patterns Pattern 8 + §Open Questions (TUI-pane API) — M1 renders T/C/D + transport; section slot reserved empty `—` (D-11). The persistent TUI-pane API is NOT in the verified OpenClaw skills/slash-commands docs — M1 floor is a text render from `/analyze`; a real persistent pane may need an OpenClaw plugin (heavier). Flagged for planner. |
| **UX-06** | Every suggestion/transform output includes an `assumptions[]` field stating its assumptions | §Code Examples "`assumptions[]` schema" (D-10/UX-06 discretion) — `{assumptions: Assumption[]}` where `Assumption = {claim, confidence, source}`. Attached from day one on every `/analyze` output and every CLI output that carries a derived field. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

> `.claude/AGENTS.md` is the locked engineering-rules document (treated with the same authority as CONTEXT.md locked decisions). These directives govern Phase 2 implementation.

- **Node ≥22.19** (installed: 22.22.3 — meets floor; AGENTS.md prefers 24 LTS for OpenClaw alignment, 22.19+ acceptable). `[VERIFIED: node --version]`
- **TypeScript 5.7+**, strict, NodeNext ESM. All relative `.ts` imports MUST end in `.js` (runtime requirement). `resolveJsonModule: true` for `with { type: "json" }` schema imports. `[VERIFIED: daemon/tsconfig.json + reader.ts]`
- **Ajv 2020-12 at the boundary, compiled once.** `import { Ajv2020 } from "ajv/dist/2020.js"` (named + `.js` ext — ajv 8.20 has no exports map). `addFormats` deliberately NOT used. Validate at every boundary. `[VERIFIED: reader.ts]`
- **Standalone-compiled validators** — Ajv validators compiled once at module load, never per-message. `[VERIFIED: reader.ts]`
- **Codegen: `scripts/gen-types.mjs`** — the `$id`-aware JSON-Schema → TS bundler (json2ts can't resolve cross-file `$ref`s against absolute `https` `$id`s). Any new schemas MUST go through this, not literal json2ts. `[VERIFIED: scripts/gen-types.mjs]`
- **Loopback-only security invariant (Pitfall 5)** — `TcpServerTransport` REFUSES any non-loopback host and always passes `127.0.0.1` to `listen`. **MUST be replicated on the new daemon-local CLI-query listener (D-07).** `[VERIFIED: tcp.ts]`
- **Trust-spine at schema level** — `edit.schema.json` requires `payload.undoLabel` (minLength 1) + `payload.operations` (minItems 1); the bridge can refuse unlabeled edits by validation alone. New schemas (raw-state, intent, CLI query/response) inherit "validate at the boundary" discipline. `[VERIFIED: edit.schema.json]`
- **Stack (Java side):** `com.bitwig:extension-api:21` (provided by Bitwig at runtime), `jackson-databind 2.22.0` (JSON), JUnit 5 (tests). Maven 3.8.1+ with `maven-shade-plugin` → copy-rename to `.bwextension`. The reference (DrivenByMoss) uses this exact toolchain. `[CITED: AGENTS.md §Technology Stack + DrivenByMoss pom.xml]`
- **Stack (TS side):** ajv 8.20.0, ajv-formats 3.0.1 (deliberately unused per Phase 1 finding — keep pinned for symmetry), commander 15.0.0, tsx 4.22.4, vitest 4.1.9, json-schema-to-typescript 15.0.4. All present from Phase 1. `[VERIFIED: daemon/package.json]`
- **No MCP, no cloud** — JSON-Lines over localhost; local-first. `[VERIFIED: PROJECT.md Constraints]`
- **`commander` is the CLI parser** — strict-by-default, async-action handlers, fits Node ≥22.12. `[VERIFIED: AGENTS.md]`

### ⚠️ Contradiction to flag for the planner: Maven vs Gradle

The CONTEXT.md `<canonical_refs>` "To Be Produced" section says: *"The real Java `.bwextension` bridge (replaces `spike/`; build/packaging de-risk deferred from Phase 1 D-07 — Gradle + ServiceLoader `META-INF/services/com.bitwig.extension.ExtensionDefinition`)."*

The locked `.claude/AGENTS.md` §Technology Stack + §Alternatives Considered says the opposite: **Maven** is recommended; *"Gradle works but adds zero benefit for a one-artifact bridge"* and *"the toolchain (shade → copy-rename to `.bwextension`) is battle-tested."*

**Research recommendation:** Follow **AGENTS.md (Maven)**. Rationale: (a) AGENTS.md is sourced from the DrivenByMoss reference `pom.xml` (HIGH confidence — the only verified production Bitwig extension in this stack); (b) the shade → copy-rename pattern is one `<plugin>` block vs Gradle's Shadow plugin + custom Rename; (c) the user's "Gradle" note in CONTEXT.md was a passing reference in the canonical-refs section, not a locked decision (it is NOT in the `<decisions>` block). The planner should treat this as a single decision point and confirm Maven unless the user explicitly overrides. **The ServiceLoader registration (`META-INF/services/com.bitwig.extension.ExtensionDefinition`) is identical under either build tool** — it's a resource shipped in the jar, not a build-tool feature. Verified by capabilities doc §Transport Decision (Bitwig uses ServiceLoader, NOT a manifest attribute).

## Summary

Phase 2 lands the **read-only accuracy milestone**: a production Java bridge that mirrors the selected Bitwig context, a long-running TypeScript daemon that normalizes it, a stable multicall CLI that exposes it, and a Pi `/analyze` skill that wraps the CLI. The highest-risk unknowns are already retired — Phase 1 proved raw `java.net` loopback TCP live (`docs/bitwig-capabilities.md` §Transport Decision), confirmed no native stable IDs (§6 → STATE-04 fingerprint-mapping required), confirmed the NoteStep note surface + `PinnableCursorClip` + ServiceLoader packaging, and froze the 6-schema JSON-Lines contract both halves build against. Phase 2 is **engineering on a verified surface**, not exploration.

Three M1 design complexities remain genuinely novel and need prescriptive research: (1) **STATE-04** — fingerprint synthesis + reconnect reconcile + the stale-watchdog that marks state stale when the bridge is silent (the trust-spine gate for SC#3, designed from the verified "no native IDs" finding); (2) **the daemon-local CLI-query channel** — a NEW listener separate from port 7878 with its own query/response schema, replicating the loopback-only invariant (Pitfall 5); (3) **the raw→derived normalizer pipeline** — framework-only with the analyzer-plugin interface that Phases 3–5 plug into, plus the `assumptions[]` JSON shape attached from day one (UX-06). All three are designed concretely below with code shapes the planner can transcribe.

The bridge observer surface (BRIDGE-01/02/03) is the largest single deliverable: extending the proven `CursorTrack.position()` path to a full `CursorTrack` + `PinnableCursorClip` + `CursorDevice` + windowed `TrackBank` mirror, with hybrid push (events) for volatile state and pull (`get.*` request/response) for heavy inspection (D-03). The controller-thread scheduling invariant (capabilities doc §5 — observers enqueue, never block) and the bounded-queue drop-oldest backpressure (Phase 1 reader.ts) carry over unchanged. The `CursorRemoteControlsPage` 8-remotes/page surface is the CLI-03 VST/AU path (D-02) — VST/AU params are exposed through the same parameter-page surface as native devices, no special-casing.

**Primary recommendation:** Plan in waves that mirror the dependency spine — (1) **Wave 1: schemas + Java bridge skeleton** (raw-state, intent, CLI-query schemas via the gen-types.mjs codegen; the Java bridge Gradle/Maven build + ServiceLoader + cursor-triple observers); (2) **Wave 2: daemon normalizer + STATE-04 + CLI-query channel** (the raw-state ingest, fingerprint mapping, reconcile, stale-watchdog, the new UDS listener, the multicall CLI binary + shims); (3) **Wave 3: Pi `/analyze` pack + accuracy harness** (the SKILL.md + slash command + state-pane text render + the ~20-clip fixture harness for SC#1). The CLI contract is the test boundary — every CLI command has an automated test against a synthetic raw-state fixture (no live Bitwig in CI); the bridge half is a human-verify checkpoint (Bitwig open) per Phase 1's pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live Bitwig observation (selection, transport, track/clip/device name+position) | **Bitwig extension JVM (Java)** | — | Only the in-process extension can subscribe to Bitwig value observers; observers fire on the controller thread (capabilities doc §5). Pushed as `selection.changed` + new event types over `127.0.0.1:7878`. |
| Heavy inspection (full NoteStep dump, parameter-page walk) | **Bitwig extension JVM** (pull handler) | daemon (requester) | Pulled on-demand via `get.*` request/response (D-03) — bounds observer fan-out. The bridge is the only tier that can read `NoteStep` / `CursorRemoteControlsPage`. |
| JSON-Lines framing + Ajv validation + backpressure | **Daemon (Node/TS)** | — | Transport-agnostic; the kept Phase 1 reader.ts. New CLI-query listener reuses `createReader` + LineBuffer. Never inside the bridge. |
| Raw-state normalization (raw → validated `project-state`) | **Daemon** | — | STATE-01. New `schemas/project-state.schema.json`; Ajv-at-boundary. |
| Stable-ID synthesis + reconcile + stale-watchdog (STATE-04) | **Daemon** | — | No native IDs in Bitwig (capabilities doc §6). The daemon owns the fingerprint → stableId map + the atomic `state-cache.json`. |
| Derived-state pipeline (raw → derived) + analyzer registry | **Daemon** | — | STATE-02 framework. Empty analyzers in M1 (D-08); Phases 3–5 plug in. Intent is the only "derived" output in M1. |
| Intent state | **Daemon** (reads) + **filesystem** (`.bw-brain/intent.json`) | user (authors) | STATE-03. User-authored; daemon does atomic validated read (D-09). |
| Durable project memory (`.bw-brain/`) | **Daemon** (sole writer) | filesystem | MEM-01. Atomic writes (temp+rename). `patch-history.jsonl` + `roles.json` created empty. |
| CLI surface (8 commands, multicall) | **CLI process** (thin client) | daemon (query target) | CLI-01/02/03. The CLI is a stateless thin client over the daemon-local channel (D-07). Stable interface. |
| Daemon-local CLI-query channel | **Daemon** (listener) | CLI (client) | D-07. NEW listener, separate from bridge port 7878. Unix domain socket (recommended) with 0600 file mode. |
| Pi `/analyze` skill + state pane | **Pi/OpenClaw runtime** (UX host) | CLI (the contract it wraps) | UX-01/05/06, D-10/11/12. Pi shells out to `bw-*` CLI commands. No direct Pi↔daemon path. |
| Ephemeral session memory | **Pi session** (`~/.pi/agent/` or OpenClaw JSONL) | — | MEM-02. NEVER crosses to durable. Hard architectural boundary. |
| `.bwextension` build + packaging | **Maven** (build) | filesystem → Bitwig | ServiceLoader jar; install to `~/Documents/Bitwig Studio/Extensions/`. AGENTS.md-locked. |

## Standard Stack

> The full cross-language stack is **locked in `.claude/AGENTS.md` §Technology Stack**. This phase does NOT re-litigate it. Below: only what THIS phase installs/uses, with the verification status carried from Phase 1 + this session's probes.

### Core (TS side — daemon + CLI; NO new npm packages)

Phase 2 needs **zero new npm dependencies**. The daemon already has every package the new surfaces require:

| Library | Version | Purpose (Phase 2 use) | Why Standard | Legitimacy |
|---------|---------|----------------------|--------------|------------|
| `ajv` | 8.20.0 | Validate raw-state, intent, CLI-query schemas at the boundary (STATE-01/03) | Already proven in Phase 1 reader.ts | **OK** `[VERIFIED]` |
| `commander` | 15.0.0 | Multicall `bw-brain` binary + 8 subcommands (CLI-01) | Async-action handlers fit the daemon-query client; multicall dispatch by `argv[0]` is a commander pattern | **SUS** (false-positive "too-new"; 444M/wk, canonical repo, no postinstall — install normally) |
| `json-schema-to-typescript` | 15.0.4 (dev) | Generate types for the NEW schemas via `scripts/gen-types.mjs` | Already wired; new schemas go through the existing codegen | **OK** `[VERIFIED]` |
| `tsx` | 4.22.4 (dev) | Run the daemon + CLI during dev; multicall binary entry | Already present | **SUS** (false-positive, same as above) |
| `vitest` | 4.1.9 (dev) | Unit tests for normalizer, fingerprint, reconcile, bw-diff round-trip, CLI contract | ESM-native, fast | **SUS** (false-positive) |
| `typescript` | 5.7+ (dev) | Strict NodeNext ESM | AGENTS.md-locked | **OK** `[VERIFIED]` |

**No new TS deps because:** Unix domain sockets, TCP, atomic file writes, and multicall dispatch all live in Node's built-ins (`node:net`, `node:fs/promises`, `process.argv`). Adding `fs-extra`, `fastify`, `express`, or a socket wrapper would violate the "don't hand-roll what's standard" inverse — these are NOT problems with a library shortcut; they're one-liners against built-ins. The CLI is `commander` (already installed).

### Core (Java side — bridge; NEW Maven project)

| Coordinate | Version | Purpose | Why Standard | Verified |
|-----------|---------|---------|--------------|----------|
| `com.bitwig:extension-api` | `21` | Bitwig Control Surface API contract | The ONLY officially supported path; provided by Bitwig at runtime (compile-time only) | `[VERIFIED: DrivenByMoss pom.xml + capabilities doc Header — extension declaring API 21 loaded cleanly on 6.0.6]` |
| `com.fasterxml.jackson.core:jackson-databind` | 2.22.0 | JSON serialize/parse for JSON-Lines IPC | JVM standard; DrivenByMoss uses the same; `ObjectMapper` + `BufferedReader.readLine()` streams newline-delimited JSON cleanly | `[VERIFIED: DrivenByMoss pom.xml + AGENTS.md]` |
| `org.junit.jupiter:junit-jupiter` | 5.11.x | Bridge unit tests (pure logic: fingerprint, outbox drain, line-shape) | Mirror DrivenByMoss; cannot integration-test against live Bitwig without a harness | `[CITED: AGENTS.md]` |
| `org.apache.maven.plugins:maven-shade-plugin` | 3.6.2 | Build fat jar → rename to `.bwextension` | The battle-tested toolchain; one `<plugin>` block | `[VERIFIED: DrivenByMoss pom.xml]` |
| `org.apache.maven.plugins:maven-compiler-plugin` | 3.15 | Java 21 compile | `<source>21</source>` `<release>21</release>` | `[VERIFIED: DrivenByMoss pom.xml]` |
| Maven | 3.8.1+ | Build orchestration | AGENTS.md-locked; **NOT currently installed** (`mvn` missing — see Environment Availability) | `[VERIFIED: AGENTS.md]` |

**Bitwig compile classpath (NOT a Maven dependency):** the bundled `/Applications/Bitwig Studio.app/Contents/Java/bitwig.jar` (+ `libs.jar`). Declare as `<scope>system</scope>systemPath` OR install to local Maven cache via `mvn install:install-file`. The Phase 1 spike compiled against this jar directly with plain `javac` — proven path. `[VERIFIED: spike/java/ + capabilities doc §Transport Decision]`

**ServiceLoader resource (NOT a dependency):** `src/main/resources/META-INF/services/com.bitwig.extension.ExtensionDefinition` containing one line: the FQCN of the `ControllerExtensionDefinition` subclass. Bitwig discovers the extension via ServiceLoader — NOT a manifest attribute, NOT class scanning (capabilities doc §Transport Decision).

### Installation (this phase)

```bash
# === TS side — NO new npm install (all deps already present from Phase 1) ===
cd daemon && npm install  # idempotent — refreshes from package-lock.json

# Generate types for the NEW schemas (raw-state, intent, CLI-query):
cd daemon && npm run gen:types

# === Java side — NEW Maven project at bridge/ ===
# 1. Install Maven (NOT currently on the machine — see Environment Availability):
brew install maven

# 2. Set JAVA_HOME (JDK 21 IS installed via Homebrew but NOT on PATH):
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
# (or symlink: sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk)

# 3. Build the .bwextension:
cd bridge && mvn clean package
# → target/bw-brain-<version>.jar (shaded)
# → copy-rename to bw-brain.bwextension

# 4. Install into Bitwig (user Extensions dir, verified to exist):
cp target/bw-brain.bwextension "$HOME/Documents/Bitwig Studio/Extensions/"

# 5. Restart Bitwig → Settings → Controllers → add "bw-brain"
```

**Version verification (run this session):**
- `ajv` 8.20.0, `ajv-formats` 3.0.1, `commander` 15.0.0, `tsx` 4.22.4, `vitest` 4.1.9, `json-schema-to-typescript` 15.0.4 — all current as of 2026-06-27 `[VERIFIED: npm view + package-legitimacy gate]`. No `postinstall` scripts on any (no supply-chain execution risk).
- JDK 21.0.11 (Homebrew) — `/opt/homebrew/opt/openjdk@21/bin/java --version` returns openjdk 21.0.11. `[VERIFIED: this session]`
- Bitwig Studio 6.0.6 — `/Applications/Bitwig Studio.app` confirmed; `CFBundleShortVersionString=6.0.6`. `[VERIFIED: this session]`
- `com.bitwig:extension-api:21` available at `https://maven.bitwig.com` (DrivenByMoss resolves it from there). `[VERIFIED: DrivenByMoss pom.xml]`

## Package Legitimacy Audit

> Run via `gsd-tools query package-legitimacy check --ecosystem npm ...` + `npm view` cross-check + `npm view <pkg> scripts.postinstall` (all empty). Phase 2 installs **no new npm packages**, so the audit is the same set Phase 1 already approved — re-verified this session for currency.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `ajv` | npm | ~5 yrs (v8) | 328M/wk | github.com/ajv-validator/ajv | **OK** | Approved |
| `ajv-formats` | npm | ~2 yrs (v3) | 99M/wk | github.com/ajv-validator/ajv-formats | **OK** | Approved (kept pinned though unused) |
| `json-schema-to-typescript` | npm | ~1.5 yrs (v15) | 2.4M/wk | github.com/bcherny/json-schema-to-typescript | **OK** | Approved |
| `commander` | npm | ~4 wks (v15.0.0) | 444M/wk | github.com/tj/commander.js | **SUS** | Flagged — false-positive (see note) |
| `tsx` | npm | ~4 wks (v4.22.4) | 57M/wk | github.com/privatenumber/tsx | **SUS** | Flagged — false-positive |
| `vitest` | npm | recent (v4.1.9) | 70M/wk | github.com/vitest-dev/vitest | **SUS** | Flagged — false-positive |

**Java side (Maven — outside the npm legitimacy gate; verified via DrivenByMoss reference):**

| Coordinate | Registry | Verified Via | Verdict |
|-----------|----------|--------------|---------|
| `com.bitwig:extension-api:21` | maven.bitwig.com | DrivenByMoss `pom.xml` resolves it from Bitwig's official Maven repo | **OK** (authoritative publisher = Bitwig) |
| `jackson-databind 2.22.0` | Maven Central | DrivenByMoss uses identical coord; Jackson is the JVM JSON standard | **OK** |
| `junit-jupiter 5.11.x` | Maven Central | Standard JVM test framework | **OK** |

**Packages removed due to [SLOP]:** none.

**Packages flagged [SUS] — planner disposition:** All three SUS verdicts are the **"too-new" heuristic firing on legitimate major releases** of top-tier npm packages (commander = de-facto npm CLI library at 444M weekly; tsx and vitest are mainstream dev tools with canonical GitHub repos and **zero `postinstall` scripts**). Known false-positive pattern. **Recommendation:** all three are already installed in `daemon/package.json` from Phase 1 — Phase 2 changes nothing; no `checkpoint:human-verify` needed for an `npm install` that re-reads the existing lockfile.

*No NEW package in this phase was discovered via WebSearch/training — all are named in the locked AGENTS.md stack doc, which is itself sourced from npm + DrivenByMoss. The Java coordinates are sourced from DrivenByMoss `pom.xml` (HIGH confidence).*

## Architecture Patterns

### System Architecture Diagram

```
              BITWIG STUDIO (host process, bundled JVM)
   ┌─────────────────────────────────────────────────────────────────┐
   │  Extension JVM (NOT sandboxed — raw java.net proven in Phase 1) │
   │  ┌───────────────────────────────────────────────────────────┐  │
   │  │ BW-BRAIN EXTENSION (.bwextension, Java, Maven-built)      │  │
   │  │                                                           │  │
   │  │  PUSH observers (fire on controller thread → enqueue):    │  │
   │  │   ├─ CursorTrack.position()/name()       ─┐               │  │
   │  │   ├─ PinnableCursorClip (hasClip, name)   │ selection +   │  │
   │  │   ├─ CursorDevice (name, position)        │ transport +   │  │
   │  │   ├─ Transport (play, position, loop)     │ name events   │  │
   │  │   └─ windowed TrackBank[N] (name/color)  ─┘               │  │
   │  │                                                           │  │
   │  │  PULL handlers (request/response, D-03):                  │  │
   │  │   ├─ get.selected_clip  → NoteStep dump                   │  │
   │  │   ├─ get.selected_device_chain → CursorRemoteControlsPage │  │
   │  │   │                         walk (8 remotes/page × N)     │  │
   │  │   └─ get.project_summary → windowed TrackBank snapshot    │  │
   │  │                                                           │  │
   │  │  Outbox (LinkedBlockingQueue) → writer thread → Socket    │  │
   │  └───────────────────────────┬───────────────────────────────┘  │
   └───────────────────────────────┼─────────────────────────────────┘
                                   │ loopback TCP ONLY (Pitfall 5)
                                   │ 127.0.0.1:7878 — JSON-Lines
                                   │ (event push + request/response pull)
                                   ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  DAEMON (Node 22 + TS, LONG-RUNNING — D-07 source of truth)    │
   │  ┌────────────────────┐    ┌─────────────────────────────────┐ │
   │  │ BRIDGE LISTENER    │    │ STATE INGEST + NORMALIZER       │ │
   │  │ TcpServerTransport │───▶│ (Phase 1 kept spine)            │ │
   │  │ 127.0.0.1:7878     │    │  ├─ createReader (framing +     │ │
   │  │ (Phase 1, reused)  │    │  │  Ajv envelope validation)    │ │
   │  └────────────────────┘    │  ├─ raw-state.schema.json val   │ │
   │                            │  └─ → normalized RawState        │ │
   │                            └─────────────┬───────────────────┘ │
   │  ┌──────────────────────────────────────▼───────────────────┐ │
   │  │ STATE-04 FINGERPRINT MAP + RECONCILE + STALE-WATCHDOG     │ │
   │  │  ├─ fingerprint(name,type,neighbors,contentHash) → sid    │ │
   │  │  ├─ reconcile-on-reconnect (stable IDs survive reorder)   │ │
   │  │  └─ watchdog: bridge silent >T → mark stateFreshness:     │ │
   │  │            "stale" (refuse edits in M2; flag in M1)       │ │
   │  └─────────────┬────────────────────────────────────────────┘ │
   │                │                                                │
   │  ┌─────────────▼────────────────┐  ┌─────────────────────────┐ │
   │  │ DERIVED PIPELINE (D-08)      │  │ DURABLE STORE (MEM-01)  │ │
   │  │  ├─ Analyzer registry        │  │  ~/.bw-brain/ (project) │ │
   │  │  │   (EMPTY in M1)           │  │   ├─ state-cache.json   │ │
   │  │  ├─ per-field confidence     │  │   │  (atomic temp+rename)│ │
   │  │  ├─ assumptions[] plumbing   │  │   ├─ intent.json        │ │
   │  │  └─ intent read (only M1     │  │   ├─ roles.json (empty) │ │
   │  │     "derived" output, D-09)  │  │   └─ patch-history.jsonl│ │
   │  └─────────────┬────────────────┘  │     (empty until M2)   │ │
   │                │                   └─────────────────────────┘ │
   │  ┌─────────────▼────────────────┐                              │
   │  │ CLI-QUERY LISTENER (D-07)    │  ← NEW listener, SEPARATE   │
   │  │ Unix domain socket (rec'd)   │    from bridge port 7878    │
   │  │ ~/.bw-brain/daemon.sock      │                              │
   │  │ 0600 file mode (Pitfall 5)   │                              │
   │  └─────────────▲────────────────┘                              │
   └─────────────────┼───────────────────────────────────────────────┘
                     │ UDS, JSON-Lines (cli-query schema)
                     │ one connection per CLI invocation
   ┌─────────────────┴─────────────────────────────────────────────┐
   │  CLI (THIN CLIENT — multicall `bw-brain` binary, D-06)        │
   │  argv[0] dispatch:                                            │
   │   bw-focus export     ─┐                                      │
   │   bw-project summary   │ 5 LIVE commands (D-05)               │
   │   bw-project region    │ query daemon → print JSON → exit 0   │
   │   bw-midi inspect      │                                      │
   │   bw-device inspect   ─┘                                      │
   │   bw-diff a.json b.json  → state-vs-state diff (SC#1)         │
   │   bw-arrange / bw-automation / bw-edit  → 3 STUBS             │
   │     ({ok:false,error:"not_implemented",availableFrom:"M2|4"}) │
   │   ALSO: `bw-brain <subcmd>` works (git-style)                 │
   └─────────────────▲─────────────────────────────────────────────┘
                     │ shells out (exec) — D-12 "Pi wraps the CLI"
                     │ (NO direct Pi↔daemon path)
   ┌─────────────────┴─────────────────────────────────────────────┐
   │  Pi /OpenClaw RUNTIME (real, installed — pi 0.79.10)          │
   │  ┌──────────────────────────────────────────┐                 │
   │  │ pi-pack/ (installed via `pi install`)     │                 │
   │  │  └─ skills/analyze/SKILL.md               │                 │
   │  │     (user-invocable → /analyze command)   │                 │
   │  │     prompt: read selection+intent via CLI │                 │
   │  │     → accurate description + 2-4 actions  │                 │
   │  │     → assumptions[] on every line (UX-06) │                 │
   │  └──────────────────────────────────────────┘                 │
   │  State pane: M1 = text render from /analyze (T/C/D +          │
   │   transport + section slot "—"). Persistent TUI pane API is   │
   │   NOT in the verified skills/slash-commands surface — open.   │
   │  EPHEMERAL SESSION MEMORY lives here (~/.pi/agent/),          │
   │   NEVER crosses to durable .bw-brain/ (MEM-02 hard boundary)  │
   └───────────────────────────────────────────────────────────────┘
```

A reader can trace the primary use case (SC#1 "select a clip → `bw-midi inspect` returns accurate notes") by following arrows: user selects clip in Bitwig → extension observers fire on controller thread → enqueue → writer thread sends `selection.changed` over loopback TCP → daemon's bridge listener reassembles via LineBuffer → Ajv-validates envelope → normalizer updates RawState → STATE-04 map updates fingerprint → user runs `bw-midi inspect` → CLI connects to daemon UDS → daemon sends `get.selected_clip` to bridge over port 7878 → bridge walks `PinnableCursorClip.getNotes(x,y,w,h)` → NoteStep dump returned as `response` → daemon serves to CLI → CLI prints JSON → exit 0.

### Recommended Project Structure

```
bw-brain/
├── bridge/                            # NEW — Java .bwextension (replaces spike/)
│   ├── src/main/java/com/bwbrain/bridge/
│   │   ├── BridgeDefinition.java      # ControllerExtensionDefinition (ServiceLoader FQCN)
│   │   ├── BridgeExtension.java       # ControllerExtension — observer registration + outbox
│   │   ├── Observers.java             # CursorTrack + PinnableCursorClip + CursorDevice + TrackBank + Transport
│   │   ├── PullHandlers.java          # get.selected_clip / get.selected_device_chain / get.project_summary
│   │   ├── Outbox.java                # LinkedBlockingQueue + writer thread (Phase 1 pattern, hardened)
│   │   └── LineJson.java              # Jackson ObjectMapper line serialization
│   ├── src/main/resources/
│   │   └── META-INF/services/
│   │       └── com.bitwig.extension.ExtensionDefinition   # one line: com.bwbrain.bridge.BridgeDefinition
│   ├── src/test/java/com/bwbrain/bridge/
│   │   ├── OutboxTest.java            # queue + drain semantics
│   │   ├── LineJsonTest.java          # envelope shape
│   │   └── PullHandlersTest.java      # response shape (no live Bitwig)
│   └── pom.xml                        # Maven: extension-api:21 (provided), jackson 2.22.0, junit-jupiter, shade → .bwextension
├── daemon/                            # KEPT (Phase 2 extends)
│   └── src/
│       ├── transport/                 # Phase 1 kept (TcpServerTransport, StdioTransport, Transport)
│       │   └── uds.ts                 # NEW — Unix domain socket transport (D-07, same Transport interface)
│       ├── protocol/                  # Phase 1 kept (reader, line-buffer, handshake) + bridge half extensions
│       ├── ingest/                    # NEW — raw-state normalizer (STATE-01)
│       │   ├── normalizer.ts          # raw envelope payload → RawState
│       │   └── normalizer.test.ts
│       ├── state/                     # NEW — STATE-04 + derived pipeline (D-08)
│       │   ├── fingerprint.ts         # name+type+neighbors+contentHash → stableId
│       │   ├── reconcile.ts           # reconnect reconcile (SC#3)
│       │   ├── stale-watchdog.ts      # bridge-silence → stateFreshness: stale (SC#3)
│       │   ├── analyzer-registry.ts   # EMPTY analyzer registry + Analyzer interface (D-08)
│       │   ├── intent-store.ts        # .bw-brain/intent.json atomic validated read (STATE-03)
│       │   └── *.test.ts
│       ├── store/                     # NEW — durable .bw-brain/ (MEM-01)
│       │   ├── atomic-write.ts        # fs.writeFile(temp) → fs.rename (POSIX-atomic)
│       │   ├── state-cache.ts         # state-cache.json (the snapshot the daemon owns)
│       │   └── atomic-write.test.ts
│       ├── query/                     # NEW — daemon-local CLI-query channel (D-07)
│       │   ├── query-server.ts        # UDS listener + query/response schema validation
│       │   └── query-server.test.ts
│       ├── cli/                       # REPLACES dump.ts (D-06 multicall)
│       │   ├── bw-brain.ts            # multicall entry — dispatch by argv[0]
│       │   ├── commands/              # one file per subcommand
│       │   │   ├── focus.ts           # bw-focus export (CLI-02)
│       │   │   ├── project.ts         # bw-project summary/region (CLI-02)
│       │   │   ├── midi.ts            # bw-midi inspect (CLI-03)
│       │   │   ├── device.ts          # bw-device inspect (CLI-03)
│       │   │   ├── diff.ts            # bw-diff (state-vs-state, SC#1)
│       │   │   ├── arrange.ts         # STUB (M3)
│       │   │   ├── automation.ts      # STUB (M4)
│       │   │   └── edit.ts            # STUB (M2)
│       │   ├── stubs.ts               # shared "not implemented" JSON emitter
│       │   └── query-client.ts        # UDS client (connects, sends query, prints result)
│       └── gen/                       # generated types (existing + new for raw-state/intent/cli-query)
├── schemas/                           # NEW schemas added (existing protocol/ kept)
│   ├── protocol/                      # Phase 1 frozen (6 files) — EXTENDED: new event types in event.schema.json, new request types in request.schema.json
│   ├── project-state.schema.json      # NEW — raw project state (STATE-01, seed §A)
│   ├── intent.schema.json             # NEW — projectIntent (STATE-03, seed §C)
│   └── cli-query/                     # NEW — daemon-local query/response (D-07)
│       ├── query.schema.json          # {op:"focus.export"|"project.summary"|..., payload?}
│       └── result.schema.json         # {ok:true,payload:{...}} | {ok:false,error,availableFrom?}
├── pi-pack/                           # NEW — Pi/OpenClaw pack (D-12)
│   └── skills/
│       └── analyze/
│           └── SKILL.md               # /analyze skill (user-invocable, wraps bw-* CLI)
├── docs/                              # KEPT
│   ├── bitwig-capabilities.md         # Phase 1 PROBE-01 output (design-lock input — DO NOT regress)
│   └── seed.md                        # project seed
├── scripts/                           # KEPT
│   ├── gen-types.mjs                  # $id-aware codegen (used for new schemas too)
│   └── check-capabilities-doc.mjs
├── fixtures/                          # NEW — SC#1 accuracy harness
│   └── representative-clips/          # ~20 hand-crafted raw-state fixtures
│       ├── 01-kick-4bar.json          #   (clip name, expected human description,
│       ├── 02-bass-8bar.json          #    expected bw-diff round-trip property)
│       └── ...
├── daemon/package.json                # updated: bin → multicall bw-brain + bw-* shims
└── .planning/                         # KEPT
```

**`spike/` disposition:** DELETE per Phase 1 D-05/D-06 (it was throwaway). The proven patterns (`CursorTrack.position()` observer, `LinkedBlockingQueue` outbox, loopback-only `java.net.Socket`, ServiceLoader registration) are REPLICATED in `bridge/`, not imported. `[CITED: 01-03-SUMMARY.md patterns-established + capabilities doc §Transport Decision]`

### Pattern 1: Java Bridge Observer Wiring (BRIDGE-01/02/03, D-01/D-02/D-03)

**What:** The bridge subscribes to Bitwig value observers for the cursor triple (track/clip/device) + transport + a windowed TrackBank; observers fire on the controller thread, enqueue a JSON-Lines line onto a `LinkedBlockingQueue`, and a dedicated writer thread drains the queue into the loopback socket. Heavy inspection (full note dump, parameter-page walk) is served on-demand via `get.*` request/response.

**When to use:** Always — this IS the bridge. The Phase 1 spike proved the skeleton; Phase 2 hardens it into a full observer set + adds the pull path.

**Verified observer surface `[VERIFIED: capabilities doc §5 + §Transport Decision + in-app Javadoc 6.0.6]`:**

| Object | How created | Observers (PUSH — volatile state) | Pull handlers (D-03 — heavy inspect) |
|--------|-------------|-----------------------------------|--------------------------------------|
| `CursorTrack` | `host.createCursorTrack(0,0)` (non-deprecated, 2-arg) | `position().addValueObserver(cb, 1)` (proven), `name().addValueObserver`, `addIsSelectedInMixerObserver` | (selection is push) |
| `PinnableCursorClip` | `host.createCursorClip(gridW, gridH)` (2-arg — confirmed) then `host.createPinnableCursorClip(...)` | `clipExists().addValueObserver`, `name().addValueObserver`, `loopStart`/`loopLength`/`playStart`/`playLength` observers, grid changes | `getNotes(start, length, noteStart, noteRange) → NoteStep[]` (the `bw-midi inspect` dump) |
| `CursorDevice` | `cursorTrack.createCursorDevice()` | `name().addValueObserver`, `position().addValueObserver`, `isEnabled`/`isPinned` observers | `cursorDevice.getRemoteControls()` → `CursorRemoteControlsPage` (8 remotes/page × N pages — the `bw-device inspect` walk, exposes VST/AU params per D-02) |
| `Transport` | `host.createTransport()` | `playState`, `position()` (proven pattern), `tempo`, `isLoopEnabled`, `loopStart`/`loopLength` | (transport is push) |
| `TrackBank` (windowed) | `host.createTrackBank(N, 0, 0)` (N = page size, recommended **8**) | per-track `name()`/`color()`/`position()` observers via `tb.getTrack(i).name().addValueObserver(...)` | `get.project_summary` → snapshot of all N tracks' name+color+clip-count |

**Controller-thread invariant `[VERIFIED: capabilities doc §5]`:** every `addValueObserver` callback MUST return immediately. The callback builds the JSON line string and calls `outbox.offer(line)` (non-blocking, `LinkedBlockingQueue`). A dedicated writer thread (setDaemon(true)) drains via `outbox.take()` + `socket.write`. **Phase 1 proved this never stalls the audio engine** (skipFirstFire guard documented). Replicate exactly.

**Push envelope `[VERIFIED: event.schema.json — Phase 2 extends]`:** Phase 1 froze `selection.changed` only. Phase 2 adds: `track.name_changed`, `clip.name_changed`, `device.name_changed`, `transport.changed`. Add to `event.schema.json`'s `type` enum + the `OBSERVATIONAL_EVENT_TYPES` set in `daemon/src/protocol/reader.ts`. All carry the drop-oldest backpressure classification.

**Pull envelope `[VERIFIED: request.schema.json — Phase 2 extends]`:** Phase 1 froze `get.selected_clip` only. Phase 2 adds: `get.selected_device_chain`, `get.project_summary`. Add to `request.schema.json`'s `type` enum. The bridge registers a request handler that reads `msg.type` and dispatches to the matching pull handler. Response is the frozen `response.schema.json` shape `{version, type:"response", id, ok, payload}`.

**Anti-patterns:**
- **Subscribing to every track's full observer set (full enumeration).** D-01 rejects this — fan-out is the heaviest cost. Window the bank to N=8 around the cursor.
- **Calling `socket.write` directly inside an `addValueObserver` callback.** Stalls the audio engine. Always enqueue + writer-thread drain.
- **Pulling the full note dump on every selection change.** Wastes the request channel (D-03). Notes are pulled only when `bw-midi inspect` runs.
- **Trusting `TrackBank.getTrack(int)` / `getChannel(int)` (deprecated in API 21).** The cursor-following pattern (verified) replaces them.

### Pattern 2: STATE-04 Fingerprint + Reconcile + Stale-Watchdog (SC#3 — highest design complexity)

**What:** Because Bitwig exposes NO native stable IDs (capabilities doc §6), the daemon synthesizes them. A fingerprint = `(name, type, neighbors, contentHash)` is hashed (SHA-256, hex) into a `stableId`. On bridge reconnect, the daemon reconciles the new observed set against the persisted map. A watchdog marks the state `stale` when the bridge has been silent > T (refuses edits in M2+; surfaces `stateFreshness` in M1 output).

**When to use:** Always — this is the trust-spine gate for SC#3 ("daemon survives a bridge reload without corrupting state").

**Fingerprint composition (designed, MEDIUM confidence):**

```typescript
// Source: capabilities doc §6 + CONTEXT.md D-01 fingerprint description
type FingerprintInput = {
  name: string;                  // Bitwig name() value (settable, not stable alone)
  type: "track"|"clip"|"device"; // object class
  neighbors: string[];           // sorted [prevName, nextName] for tracks; [parentTrackName] for clips; [parentTrackName, chainIndex] for devices
  contentHash: string;           // for clips: hash of note-set (pitch,start,length,velocity sorted); for tracks: hash of clip-count + first-clip-name; for devices: hash of param-page-values
};
function fingerprint(input: FingerprintInput): string {
  // Canonical JSON (sorted keys) → SHA-256 hex, truncated to 16 chars
  const canon = JSON.stringify({
    n: input.name, t: input.type, nb: input.neighbors, ch: input.contentHash,
  });  // keys already sorted; JSON.stringify preserves insertion order
  return createHash("sha256").update(canon).digest("hex").slice(0, 16);
}
```

**Why each component:**
- **name** — primary signal (a track named "Kick" is probably the same Kick across reloads).
- **type** — disambiguates a track "Kick" from a clip "Kick".
- **neighbors** — survives reorders: even if "Kick" moves from slot 0 to slot 3, its neighbors ("Bass", "Lead") identify it. Sorted to be order-independent within the neighbor pair.
- **contentHash** — survives renames: if the user renames "Kick" to "Kick Main", the note-content fingerprint still matches. For clips this is the note-set hash (the same notes = same clip identity). For tracks it's clip-count + first-clip-name. For devices it's the param-page snapshot.

**Reconcile-on-reconnect (designed, MEDIUM confidence):**

```typescript
// On bridge (re)connect — runs AFTER the first post-reconnect raw-state snapshot:
function reconcile(observed: RawState, persisted: StableIdMap): ReconcileResult {
  const result: ReconcileResult = { matched: [], reassigned: [], new: [], vanished: [] };
  for (const obj of observed.allObjects()) {
    const fp = fingerprint(fingerprintInput(obj));
    const existingSid = persisted.byFingerprint.get(fp);
    if (existingSid) {
      result.matched.push({ sid: existingSid, obj });
      persisted.lastSeen.set(existingSid, Date.now());
    } else {
      // Fuzzy fallback: same name+type but different content (user edited the clip)
      const fuzzy = persisted.byNameAndType.get(`${obj.type}:${obj.name}`);
      if (fuzzy) {
        result.reassigned.push({ sid: fuzzy, obj, reason: "name+type match, content drifted" });
        persisted.byFingerprint.set(fp, fuzzy);  // rebind to new fingerprint
      } else {
        const newSid = mintSid(obj.type);        // trk_xxxxx / clip_xxxxx / dev_xxxxx
        result.new.push({ sid: newSid, obj });
        persisted.byFingerprint.set(fp, newSid);
        persisted.byNameAndType.set(`${obj.type}:${obj.name}`, newSid);
      }
    }
  }
  // Vanished: in persisted but not observed — keep for grace period (the bridge
  // might just be slow); expire after windowQuietGrace (e.g. 60s)
  return result;
}
```

**Atomic `state-cache.json` write (HIGH confidence — standard Node pattern):**

```typescript
// Source: standard POSIX-atomic-rename pattern (Node fs/promises)
import { writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const dir = dirname(path);
  const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");  // write fully first
  await rename(tmp, path);                                       // atomic rename (POSIX)
}
```

`fs.rename` is atomic on the same filesystem (POSIX guarantee). The temp file is in the same dir (`.bw-brain/`) so the rename never crosses a filesystem boundary. A partially-written `state-cache.json` is impossible — readers either see the old file or the new file, never a half-written one. **This is SC#3's "atomic temp+rename" requirement made executable.** `[CITED: POSIX rename(2) + Node fs/promises docs]`

**Stale-watchdog (designed, MEDIUM confidence):**

```typescript
// Source: SC#3 "watchdog marks state stale (refusing edits) when bridge is silent"
const STALE_THRESHOLD_MS = 5_000;      // bridge silent > 5s → mark stale
const RECONNECT_GRACE_MS = 60_000;     // vanished objects kept for 60s before expiry

type Freshness = "live" | "stale" | "disconnected";

class StaleWatchdog {
  private lastBridgeAt = Date.now();
  private freshness: Freshness = "disconnected";
  onBridgeMessage() { this.lastBridgeAt = Date.now(); this.freshness = "live"; }
  onBridgeDisconnect() { this.freshness = "disconnected"; }
  tick(): Freshness {
    if (this.freshness === "disconnected") return "disconnected";
    if (Date.now() - this.lastBridgeAt > STALE_THRESHOLD_MS) {
      this.freshness = "stale";
    }
    return this.freshness;
  }
  // SC#3 enforcement point: edit handlers (M2+) call assertFresh() before apply.patch
  assertFresh(): void {
    if (this.freshness !== "live") {
      throw new Error(`refuse edit: state freshness is ${this.freshness} (bridge silent/disconnected)`);
    }
  }
}
```

**M1 has no edits** — `assertFresh()` is wired but unreachable (no `apply.patch` handler until Phase 3). What M1 DOES surface: every `/analyze` output and every CLI command that returns derived state carries a `stateFreshness: "live"|"stale"|"disconnected"` field, so the user/Pi never trusts stale state silently. This is the honest M1 floor of SC#3.

**Anti-patterns:**
- **Using Bitwig slot index as the ID.** Slot shifts on reorder (capabilities doc §6) — the fingerprint exists precisely because slot-bound identity is wrong.
- **Naive `fs.writeFile` to `state-cache.json` directly.** A crash mid-write corrupts the cache. Always temp+rename.
- **Treating "stale" as "disconnected."** Stale = bridge was alive recently, may resume; disconnected = socket torn down. The reconcile path differs (stale keeps the map; disconnected triggers full re-fingerprint on reconnect).
- **Aggressively expiring vanished objects.** A bridge reload briefly makes every object "vanish." Grace period (60s) prevents an expire-storm.

### Pattern 3: Daemon-Local CLI-Query Channel (D-07)

**What:** A SECOND listener on the daemon, separate from the bridge TCP port 7878. The CLI is a thin client that connects, sends one `{op, payload}` query, receives one `{ok, payload}` result, and disconnects. The bridge port stays bridge-only.

**Recommendation (D-07 discretion — researcher pins):** **Unix domain socket** at a stable path. NOT a second loopback TCP port.

**Rationale (Steel Man of the alternative considered):**

| Option | Pro | Con |
|--------|-----|-----|
| **Unix domain socket (RECOMMENDED)** `~/.bw-brain/daemon.sock` | • No port-allocation collision risk (a 2nd TCP port is a guess; 7879 might clash)<br>• Filesystem permission IS the auth (socket mode 0600 = only the user can connect)<br>• `node:net` API is identical to TCP (`net.createServer()` + `net.createConnection({path})`)<br>• Implements the same `Transport` interface → `createReader` reuses verbatim | • Path must be stable + cleaned on daemon exit |
| Second loopback TCP port (e.g. 7879) | • Slightly simpler if we wanted remote CLI (we don't — local-first)<br>• Same `TcpServerTransport` (already proven) | • Port allocation is a guess<br>• No filesystem-permission auth model (any local process can connect — needs a shared-secret token, more moving parts)<br>• Two TCP servers is more net surface than one TCP + one UDS |

**The loopback-only invariant (Pitfall 5) replicates as filesystem permissions:** the UDS listener `chmod 0600`s the socket file after `listen()`. Only the same-user process can connect. This is **stronger** than TCP-loopback (which any local process can hit). `[CITED: POSIX socket permissions + Node net docs]`

**Transport reuse (HIGH confidence):** the existing `Transport` interface (`transport.ts`) consumes any byte stream. A new `UnixDomainSocketTransport` implements it:

```typescript
// Source: Node node:net UDS API + existing Transport interface (transport.ts)
import * as net from "node:net";
import { chmod } from "node:fs/promises";
import type { Transport } from "./transport.js";

export class UnixDomainSocketServerTransport implements Transport {
  // SECURITY: socket file mode 0600 — only the same user can connect.
  // This is the Pitfall-5-equivalent for UDS (loopback-only + permission-gated).
  private static readonly SOCKET_MODE = 0o600;
  // ... net.createServer({ path: socketPath }) + chmod(socketPath, 0o600)
  // onMessage/send/close identical to TcpServerTransport
}
```

**Query/response shape (D-07 discretion — researcher pins):** **NEW schema set** at `schemas/cli-query/`, NOT a constrained subset of the bridge protocol. Rationale: the two contracts evolve independently (the bridge protocol is Java-bridge ↔ daemon; the CLI contract is any-agent/shell ↔ daemon). Mixing them would couple CLI traffic to bridge-protocol changes.

```json
// schemas/cli-query/query.schema.json
{
  "version": "1.0",
  "type": "query",
  "op": "focus.export"|"project.summary"|"project.region"|"midi.inspect"|"device.inspect"|"diff",
  "payload": { ... }   // op-specific args (e.g. project.region: {start, end})
}
// schemas/cli-query/result.schema.json
{
  "version": "1.0",
  "type": "result",
  "ok": true,
  "stateFreshness": "live"|"stale"|"disconnected",   // SC#3 surfaces here
  "payload": { ... }   // op-specific result
  // OR: { ok:false, error:"not_implemented", availableFrom:"M2" } for stubs
}
```

Both go through `scripts/gen-types.mjs` codegen; both validated by Ajv at the daemon boundary (same pattern as Phase 1 envelope).

### Pattern 4: Multicall CLI (CLI-01/02/03, D-05/D-06)

**What:** One `bw-brain` binary dispatched by `argv[0]`. `bw-focus`, `bw-project`, `bw-midi`, `bw-device`, `bw-diff` (and 3 stubs) are symlinks/shims to it. Inside, the multicall dispatch reads `path.basename(process.argv[0])` and routes to the matching `commander` subcommand. `bw-brain <subcmd>` ALSO works (git-style).

**When to use:** Always — this IS the CLI surface. commander 15 supports it cleanly.

**Multicall dispatch (HIGH confidence — standard commander pattern):**

```typescript
// Source: standard multicall pattern + commander 15 + CONTEXT.md D-06
import { program } from "commander";
import { basename } from "node:path";

const invokedAs = basename(process.argv[1] ?? process.argv[0]);  // "bw-focus"|"bw-project"|...|"bw-brain"
const MULTICALL = {
  "bw-focus":      () => import("./commands/focus.js"),
  "bw-project":    () => import("./commands/project.js"),
  "bw-midi":       () => import("./commands/midi.js"),
  "bw-device":     () => import("./commands/device.js"),
  "bw-diff":       () => import("./commands/diff.js"),
  "bw-arrange":    () => import("./commands/arrange.js"),    // stub
  "bw-automation": () => import("./commands/automation.js"), // stub
  "bw-edit":       () => import("./commands/edit.js"),       // stub
};

if (invokedAs in MULTICALL) {
  // Shim/symlink invocation: dispatch directly.
  await MULTICALL[invokedAs as keyof typeof MULTICALL]();
} else {
  // `bw-brain` invocation: register all subcommands git-style.
  for (const loader of Object.values(MULTICALL)) await loader();
  program.parse();
}
```

**Shim install (`daemon/package.json` `"bin"` field):**

```json
{
  "bin": {
    "bw-brain": "./src/cli/bw-brain.ts",
    "bw-focus": "./src/cli/bw-brain.ts",
    "bw-project": "./src/cli/bw-brain.ts",
    "bw-midi": "./src/cli/bw-brain.ts",
    "bw-device": "./src/cli/bw-brain.ts",
    "bw-diff": "./src/cli/bw-brain.ts",
    "bw-arrange": "./src/cli/bw-brain.ts",
    "bw-automation": "./src/cli/bw-brain.ts",
    "bw-edit": "./src/cli/bw-brain.ts"
  }
}
```

All `bin` entries point at the SAME file. `npm install -g .` (or `npm link`) creates the symlinks. The multicall dispatch reads `argv[0]` to know which subcommand was invoked.

**Stub shape (D-05):**

```typescript
// commands/arrange.ts — STUB (M3)
import { emitStub } from "../stubs.js";
emitStub({ name: "bw-arrange", availableFrom: "M3" });
// → prints {"version":"1.0","ok":false,"error":"not_implemented",
//           "command":"bw-arrange","availableFrom":"M3"} and exit 0
```

Exit 0 (not 1) because CLI-01 says "all 8 emit JSON, fail clearly" — emitting a structured not-implemented JSON IS the clear failure; non-zero exit would break shell pipelines that grep the JSON. `[CITED: CLI-01]`

### Pattern 5: Raw→Derived Normalizer + Analyzer-Plugin Interface (STATE-01/02, D-08)

**What:** A pipeline: raw state → (validated against `project-state.schema.json`) → (run through registered analyzers) → derived state. Per-field confidence + `assumptions[]` are attached at every stage. The analyzer interface is EMPTY in M1 — only intent (STATE-03) is "derived."

**When to use:** Always — this IS the STATE-01/02 substrate. Phases 3–5 plug analyzers into it.

**Analyzer interface (D-08 discretion — researcher pins, MEDIUM confidence):**

```typescript
// Source: CONTEXT.md D-08 ("defined analyzer interface") + UX-06 (assumptions on every suggestion)
export interface Analyzer {
  /** Stable id for telemetry + registry. e.g. "section-detector", "track-role-classifier". */
  readonly id: string;
  /** Which raw-state fields this analyzer reads. */
  readonly consumes: readonly (keyof RawState)[];
  /** Which derived-state fields this analyzer produces. */
  readonly produces: readonly (keyof DerivedState)[];
  /**
   * Pure function. NEVER mutates raw. Returns 0+ derived fields, each carrying
   * a confidence ∈ [0,1] and the assumptions[] it made (UX-06).
   */
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[];
}

export interface DerivedField {
  field: "sections"|"trackRoles"|"motifs"|"energyCurve"|"automationSalience"|"intent";
  value: unknown;
  confidence: number;        // ∈ [0,1]; below threshold (e.g. 0.5) = refuse rather than emit
  assumptions: Assumption[]; // UX-06: every derived field states its assumptions
}

export interface AnalyzeContext {
  intent: ProjectIntent | null;     // STATE-03 (the only M1 "analyzer" output)
  now: number;                       // Date.now() — analyzers must be deterministic given raw + intent + now
}

export interface Assumption {
  claim: string;                     // "selected clip has 32 notes" / "intent says 'preserve bass motif'"
  confidence: number;                // ∈ [0,1]
  source: "selection"|"intent"|"config"|"default";  // where the assumption came from
}

export interface AnalyzerRegistry {
  register(a: Analyzer): void;
  runAll(raw: RawState, ctx: AnalyzeContext): DerivedField[];
}
```

**M1 ships:** the registry + the interface + an **`IntentAnalyzer`** that reads `intent.json` and emits one `DerivedField{field:"intent", confidence:1.0, assumptions:[{claim:"user-authored in .bw-brain/intent.json", confidence:1.0, source:"intent"}]}`. **Zero other analyzers** — `sections`/`trackRoles`/`motifs`/`energyCurve`/`automationSalience` stay empty until P3/P4/P5 (D-08). The "below-threshold = refuse rather than guess" stance (CONTEXT.md `<specifics>`) is encoded in the registry: derived fields with `confidence < 0.5` are dropped from output (the analyzer refused).

### Pattern 6: Durable Store + Memory Boundary (MEM-01/02, SC#5)

**What:** The daemon is the SOLE writer to `~/.bw-brain/` (or `<project>/.bw-brain/` — pick one; researcher recommends **project-local** per seed §Storage "project-local `.bw-brain/`"). Every write is atomic (temp+rename, Pattern 2). Ephemeral session memory lives in the Pi session (`~/.pi/agent/`) and NEVER crosses to durable.

**Durable layout (HIGH confidence — seed §Storage locks it):**

```
<project-root>/.bw-brain/
├── state-cache.json      # SC#3 atomic snapshot (Pattern 2). Created M1.
├── intent.json           # STATE-03, user-authored. Read M1, edited by hand.
├── roles.json            # ARRANGE-05 (Phase 4). Created EMPTY in M1 (MEM-01 lists it).
└── patch-history.jsonl   # EDIT-05 (Phase 3). Created EMPTY in M1 (MEM-01 lists it).
```

**MEM-02 hard boundary enforcement (HIGH confidence):** the daemon has **no API surface that accepts "ephemeral" data for durable write.** The CLI-query schema (`schemas/cli-query/query.schema.json`) has no `op` that writes to `.bw-brain/` (M1 is read-only; M2 adds `apply.patch` which is the patch-history path, not an arbitrary ephemeral dump). The Pi `/analyze` skill reads via CLI; it cannot push data back to the daemon except via `apply.patch` (M2+). Ephemeral state (experiment threads, candidate patches) stays in `~/.pi/agent/<session>/` and dies with the session. `[CITED: seed.md §How session memory should work + PROJECT.md Memory classes]`

### Pattern 7: Pi `/analyze` Pack (UX-01/05/06, D-10/D-11/D-12)

**What:** A Pi skill at `pi-pack/skills/analyze/SKILL.md`, installed via `pi install ./pi-pack`. `/analyze` shells out to `bw-focus export` + `bw-project summary` + reads `intent.json`, then produces an accurate description + 2–4 read-action next actions, every line carrying `assumptions[]`.

**Verified Pi/OpenClaw conventions `[VERIFIED: docs.openclaw.ai/tools/skills + /tools/slash-commands this session]`:**
- **Skill location:** `<workspace>/skills/<name>/SKILL.md` (workspace-highest precedence). For bw-brain this is the repo-rooted `pi-pack/skills/analyze/SKILL.md` installed via `pi install ./pi-pack`.
- **SKILL.md format:** YAML frontmatter (`name`, `description` minimum). AgentSkills spec.
- **Slash command exposure:** `user-invocable: true` (default) auto-registers the skill as `/<name>`. Skill name sanitized to `a-z0-9_`, max 32 chars. `/analyze` qualifies.
- **Model-mediated dispatch (default):** the skill body is the prompt; the model invokes `bw-*` CLI via the `exec` tool. Do NOT set `command-dispatch: tool` (that bypasses the model — wrong for `/analyze` which produces critique, not a deterministic tool output).
- **Hot reload:** `skills.load.watch: true` (built-in). Dev iteration without restarting Pi.

**State pane (UX-05) — M1 floor (D-11) + open question:**

The verified OpenClaw skills/slash-commands docs do NOT document a persistent TUI-pane renderer API. The seed doc's "TUI panes" likely map to an OpenClaw **plugin** (heavier than a skill). **M1 recommendation:** ship the state pane as a **text render from `/analyze`** (the skill's output includes a "State:" block showing T/C/D + transport + `section: —`). Defer the persistent-pane question to the planner — it's either (a) ship text-only in M1, defer the real pane to M2 (recommended), or (b) build an OpenClaw plugin in M1 (scope-creep risk). Flagged in Open Questions.

**`/analyze` prompt (D-10):** M1 floor — accurate description + read-actions, NO invented critique. See Code Examples.

### Anti-Patterns to Avoid

- **Build the bridge in Gradle when AGENTS.md locks Maven.** See §Project Constraints contradiction. Use Maven unless the user explicitly overrides.
- **Subscribe to full TrackBank enumeration.** D-01 rejects it — fan-out cost. Window to N=8.
- **Block the controller thread.** Capabilities doc §5 + Phase 1 spike — observers enqueue, never block.
- **Couple the CLI-query channel to the bridge protocol.** D-07 says separate. Use a new schema set.
- **Use `fs.writeFile` directly on `state-cache.json`.** Crash-corruption risk. Temp+rename always.
- **Trust slot index as stable ID.** Capabilities doc §6 — slot shifts on reorder. Fingerprint.
- **Pull every note dump on every selection change.** Wastes the request channel. Notes are pull-on-demand.
- **Run analyzers in M1.** D-08 — every analyzer is a later phase. The M1 deliverable is the SUBSTRATE.
- **Infer intent.** D-09 — no inference in M1. User-authored only.
- **Invent section labels.** D-11 — section slot reserved `—`. Phase 4 fills it.
- **Direct Pi↔daemon path.** D-12 — Pi wraps the CLI. No shortcut.
- **Cross ephemeral → durable.** MEM-02 — hard architectural boundary.
- **Add `fs-extra`, `fastify`, `express`, or a socket wrapper.** Node built-ins cover UDS, atomic writes, and multicall dispatch in one-liners. Adding libs violates the inverse of "don't hand-roll."
- **Treat `commander`/`tsx`/`vitest` SUS flags as real supply-chain risk.** False-positive "too-new" heuristic on top-tier packages. Already installed in Phase 1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON validation at the boundary (raw-state, intent, CLI-query) | Custom validators | `ajv` 8.20.0 + JSON Schema 2020-12 (already installed) | Same pattern Phase 1 used for the envelope; cross-language contract (Java bridge can't read Zod) `[VERIFIED: reader.ts]` |
| TS types from new wire schemas | Hand-maintained TS interfaces | `scripts/gen-types.mjs` (the `$id`-aware codegen) | Already wired; new schemas drop in. json2ts literal can't resolve cross-file `$ref` against absolute `https` `$id`s `[VERIFIED: gen-types.mjs]` |
| Newline-delimited framing for CLI-query channel | Length-prefixed / custom delimiters | `LineBuffer` (Phase 1 kept) + `\n`-terminated JSON | Inspectable, jsonlines.org-compliant; reuses the proven reader `[VERIFIED: line-buffer.ts]` |
| Unix domain socket server | Raw `net.createServer` boilerplate scattered in CLI code | A new `UnixDomainSocketServerTransport` impl of the existing `Transport` interface | The reader consumes `Transport` only — keeps the CLI-query path transport-agnostic, mirrors Phase 1 D-05 `[VERIFIED: transport.ts]` |
| Atomic file write (`state-cache.json`) | Custom lock-file / write-then-verify | `fs.writeFile(temp) + fs.rename` (POSIX-atomic) | `rename(2)` is atomic on the same filesystem — no half-written state possible `[CITED: POSIX + Node fs/promises]` |
| Multicall CLI dispatch | Custom argv parsing | `commander` 15 + `basename(argv[0])` switch | Standard multicall pattern; honors BOTH `bw-focus export` and `bw-brain focus export` `[VERIFIED: AGENTS.md + commander]` |
| Bitwig extension packaging | Custom jar-assembly script | Maven `shade-plugin` → copy-rename to `.bwextension` | Battle-tested by DrivenByMoss; one `<plugin>` block `[VERIFIED: DrivenByMoss pom.xml]` |
| ServiceLoader registration | Manifest attributes / class-scanning hacks | `META-INF/services/com.bitwig.extension.ExtensionDefinition` resource file | Bitwig's discovery mechanism (verified, not a guess) `[VERIFIED: capabilities doc §Transport Decision]` |
| Bitwig JSON-Lines serialization (Java) | Manual string concatenation | `jackson-databind` 2.22.0 `ObjectMapper` | JVM standard; DrivenByMoss uses identical coord; `BufferedReader.readLine()` streams cleanly `[VERIFIED: DrivenByMoss pom.xml]` |
| Stable ID generation | Sequential counters / UUIDs | SHA-256 fingerprint (name+type+neighbors+contentHash) | Bitwig has no native IDs (capabilities doc §6); a content-addressed fingerprint survives reorder + rename; UUIDs would not reconcile on reconnect |
| Pi skill slash-command registration | Custom command-dispatch code | Pi/OpenClaw `user-invocable: true` frontmatter | Auto-registers as `/<name>`; built into the runtime `[VERIFIED: docs.openclaw.ai/tools/slash-commands]` |

**Key insight:** Phase 2 is **all substrate on verified surfaces.** Every "hard" problem here (atomic writes, framing, validation, multicall, packaging, stable IDs) has a one-paragraph standard solution. Reserve hand-effort for the THREE genuinely novel designs (STATE-04 reconcile semantics, the stale-watchdog policy, the M1 `/analyze` floor) — those have no library shortcut because they're project-specific policy.

## Common Pitfalls

### Pitfall 1: Forgetting to extend `OBSERVATIONAL_EVENT_TYPES` when adding new event types

**What goes wrong:** Phase 2 adds `track.name_changed`, `transport.changed`, etc. The bridge emits them; the daemon reader drops them as "unclassified" → backpressure policy mis-fires → edits (when M2 lands) could be dropped under flood.
**Why:** `daemon/src/protocol/reader.ts` has `OBSERVATIONAL_EVENT_TYPES = new Set(["selection.changed"])` — a frozen Phase 1 set. Phase 2's new event types must be added here OR they default to "never drop" (which is correct for edits but wrong for observational events under flood).
**How to avoid:** Every new event type added to `event.schema.json`'s enum is also added to `OBSERVATIONAL_EVENT_TYPES`. A unit test asserts the two sets are equal.
**Warning signs:** `dropped` notices on events that should be observational; edits pausing under selection flood.

### Pitfall 2: Slot-index vs fingerprint confusion in the bridge payload

**What goes wrong:** The bridge sends `payload.trackId: "trk_5"` (a slot index from `cursorTrack.position()`) and the daemon treats it as a stable ID. On reorder, "trk_5" now refers to a different track and the daemon corrupts its state-cache.
**Why:** The Phase 1 spike literally did this (`"trackId":"trk_"+trackIndex`) because it was a one-shot proof, not a stable contract.
**How to avoid:** Phase 2's bridge sends RAW identity signals (Bitwig name + slot + neighbors + content hint) and the DAEMON computes the stable ID via the fingerprint map (Pattern 4). The wire payload's `trackId` field is RENAMED to `track` carrying `{name, slot, ...}` — the daemon mints `sid: "trk_<fp16>"`. Never trust a Bitwig slot as identity.
**Warning signs:** state-cache IDs change after a UI reorder; bw-diff reports spurious "track vanished" events.

### Pitfall 3: Coupling the CLI-query schema to the bridge protocol

**What goes wrong:** The CLI reuses `get.selected_clip` directly as its query op. A bridge-protocol change (e.g. tightening `get.*` payload in Phase 3) silently breaks every CLI consumer.
**Why:** D-07 explicitly says "separate from the bridge TCP port" with "its own query/response shape" — but it's tempting to reuse the frozen schemas.
**How to avoid:** New schema set at `schemas/cli-query/`. The daemon TRANSLATES between cli-query ops and bridge `get.*` requests internally — the CLI never sees a bridge-protocol message.
**Warning signs:** a bridge-protocol PR breaks CLI tests it shouldn't touch.

### Pitfall 4: `fs.writeFile` without temp+rename on `state-cache.json`

**What goes wrong:** Daemon crashes mid-write (SIGKILL, power loss) → `state-cache.json` is half-written → on restart the daemon ingests corrupt JSON → Ajv rejects → state is lost or stuck.
**Why:** `fs.writeFile` is not atomic — it truncates then writes. A crash between truncate and full-write leaves a partial file.
**How to avoid:** Always `writeFile(tmp` then `rename(tmp, dest)`. `rename(2)` is atomic on the same filesystem. The temp file MUST be in the same directory as the destination (`.bw-brain/`) — cross-filesystem rename is non-atomic.
**Warning signs:** state-cache.json grows to 0 bytes or contains partial JSON after a crash.

### Pitfall 5: Loopback-only invariant violation on the new UDS listener

**What goes wrong:** The CLI-query UDS listener creates the socket file with default mode (often 0644 or worse) → other local users can connect.
**Why:** `net.createServer().listen(path)` does NOT set restrictive permissions by default. The Pitfall-5 invariant that `TcpServerTransport` enforces via constructor host-check has a different shape on UDS — it's a file-mode problem, not a bind-host problem.
**How to avoid:** `chmod(socketPath, 0o600)` immediately after `listen()`. Add a constructor guard that REFUSES to start if the chmod fails. Mirror the defensive style of `TcpServerTransport`'s host-guard.
**Warning signs:** `ls -l ~/.bw-brain/daemon.sock` shows mode != 0600.

### Pitfall 6: Treating `stale` as `disconnected` (or vice versa)

**What goes wrong:** The watchdog conflates "bridge was alive 3s ago, no message since" with "socket torn down" → either expiring objects prematurely (false disconnected) or never triggering reconnect reconcile (false stale).
**Why:** The two states require different responses: stale = keep the map, surface `stateFreshness:"stale"`; disconnected = tear down per-connection state, full re-fingerprint on reconnect.
**How to avoid:** Three-state enum `Freshness = "live"|"stale"|"disconnected"`. Transitions are explicit: `live → stale` (timeout), `* → disconnected` (socket close), `disconnected → live` (reconnect + first message). Unit tests for every transition.
**Warning signs:** vanish-storms after a brief bridge stall; reconnect leaves state stuck `stale`.

### Pitfall 7: Inventing musical critique in `/analyze` (violating D-10)

**What goes wrong:** With no analyzers, the model behind `/analyze` hallucinates section labels or motif claims to "be useful." The output looks impressive but isn't grounded — violating accurate-first.
**Why:** The D-10 floor is genuinely austere (description + read-actions) and LLMs want to fill the gap.
**How to avoid:** The `/analyze` prompt explicitly forbids invented critique ("Do NOT claim sections, motifs, or track roles — those analyzers land in Phase 3-5"). Every output line must trace to a CLI result or an intent.json entry. The `assumptions[]` discipline surfaces any leap.
**Warning signs:** `/analyze` output contains "this section is a drop" or "the bass motif" with no analyzer backing.

### Pitfall 8: Crossing ephemeral → durable memory (MEM-02 violation)

**What goes wrong:** A future `/try` or experiment feature writes candidate patches into `.bw-brain/patch-history.jsonl` → pollutes the durable store with un-applied experiments → the project's "musical identity" is contaminated.
**Why:** It's tempting to "just write it down for later." The hard boundary exists precisely to prevent this.
**How to avoid:** The daemon CLI-query schema has NO op that writes to durable outside `apply.patch` (M2+). Ephemeral data stays in Pi session JSONL. A unit test asserts the daemon's durable-write API surface is exactly `{state-cache, intent-read-only, patch-history-via-apply-only}`.
**Warning signs:** `patch-history.jsonl` grows without a corresponding `apply.patch` event.

### Pitfall 9: Building the bridge in Gradle when AGENTS.md locks Maven

**What goes wrong:** The CONTEXT.md canonical-refs section casually mentions "Gradle + ServiceLoader"; the planner follows it; the build diverges from the AGENTS.md-locked + DrivenByMoss-reference toolchain; future contributors face a non-standard build.
**Why:** See §Project Constraints contradiction. The user's note in CONTEXT.md is in `<canonical_refs>`, not `<decisions>` — it's a passing reference, not a locked decision.
**How to avoid:** Follow AGENTS.md (Maven). If the user wants Gradle, they override AGENTS.md explicitly. The ServiceLoader mechanism is identical either way.
**Warning signs:** a `bridge/build.gradle` instead of `bridge/pom.xml`.

### Pitfall 10: Assuming `CursorRemoteControlsPage` walks VST/AU without verification

**What goes wrong:** D-02 asserts VST/AU params come through the same surface as native devices. The bridge ships assuming this; on first real VST load the page is empty.
**Why:** Capabilities doc §4 lists `CursorRemoteControlsPage` (8 remotes/page) but the VST/AU exposure was inferred, not behaviorally probed (the §4 probe is "TODO-in-app").
**How to avoid:** Add a Phase 2 human-verify checkpoint that loads a real VST (e.g. a free synth) and runs `bw-device inspect` against it. If the page is empty, fall back to `cursorDevice.getParameter(int index)` direct enumeration (slower but covers all params). Document the finding.
**Warning signs:** `bw-device inspect` returns an empty parameter list for a clearly-loaded VST.

## Code Examples

### Bridge extension skeleton (Java — the proven Phase 1 pattern, hardened)

```java
// Source: spike/java/src/com/bwbrain/spike/SpikeExtension.java (PROVEN LIVE in Phase 1)
// + capabilities doc §Transport Decision + §5 (observers enqueue-never-block)
// Phase 2 hardens: full cursor triple + windowed TrackBank + Transport + pull handlers.
package com.bwbrain.bridge;

import com.bitwig.extension.controller.ControllerExtension;
import com.bitwig.extension.controller.ControllerExtensionDefinition;
import com.bitwig.extension.controller.api.*;
import java.util.concurrent.LinkedBlockingQueue;

public final class BridgeExtension extends ControllerExtension {
    private static final String LOOPBACK = "127.0.0.1";  // Pitfall 5 — loopback ONLY
    private static final int PORT = 7878;
    private final LinkedBlockingQueue<String> outbox = new LinkedBlockingQueue<>();
    private volatile boolean running = true;

    BridgeExtension(ControllerExtensionDefinition def, ControllerHost host) {
        super(def, host);
    }

    @Override public void init() {
        final ControllerHost host = getHost();
        host.println("[bw-brain] init — cursor triple + windowed TrackBank[N=8] + transport");

        // === PUSH observers (D-01, D-03) — all enqueue, never block ===
        final CursorTrack cursorTrack = host.createCursorTrack(0, 0);
        cursorTrack.position().addValueObserver(idx -> enqueue(trackPositionLine(idx)), 1);
        cursorTrack.name().addValueObserver(name -> enqueue(trackNameLine(name)));

        final PinnableCursorClip cursorClip = host.createCursorClip(16, 128);  // 2-arg (verified)
        cursorClip.clipExists().addValueObserver(exists -> enqueue(clipExistsLine(exists)));
        cursorClip.name().addValueObserver(name -> enqueue(clipNameLine(name)));

        final CursorDevice cursorDevice = cursorTrack.createCursorDevice();
        cursorDevice.name().addValueObserver(name -> enqueue(deviceNameLine(name)));

        final Transport transport = host.createTransport();
        transport.playState().addValueObserver(state -> enqueue(transportLine(state)));

        // Windowed TrackBank (D-01) — N=8 around the cursor (recommended page size)
        final int N = 8;  // see TrackBank page size discretion — 8 matches CursorRemoteControlsPage width
        final TrackBank trackBank = host.createTrackBank(N, 0, 0);
        for (int i = 0; i < N; i++) {
            final Track t = trackBank.getTrack(i);  // note: in-window access is non-deprecated
            final int slot = i;
            t.name().addValueObserver(name -> enqueue(bankTrackNameLine(slot, name)));
        }

        // === PULL handler thread (D-03) — reads request lines, dispatches get.* ===
        // (separate from the writer thread; the same socket carries both directions)
        // get.selected_clip       → cursorClip.getNotes(...) → response line
        // get.selected_device_chain → walk cursorDevice.getRemoteControls() → response line
        // get.project_summary     → snapshot trackBank → response line

        // Writer thread (Phase 1 proven pattern — drains outbox to the loopback socket)
        startWriterThread();
        startPullHandlerThread();
    }

    /** Build a JSON-Lines line and offer to outbox. NEVER blocks the controller thread. */
    private void enqueue(String line) { outbox.offer(line); }

    private void startWriterThread() {
        Thread t = new Thread(() -> { /* identical to Phase 1 SpikeExtension writerLoop */ }, "bw-brain-writer");
        t.setDaemon(true); t.start();
    }
    private void startPullHandlerThread() { /* reads inbound request lines, dispatches */ }

    @Override public void exit() { running = false; }
    @Override public void flush() { /* no-op — all I/O offloaded */ }
}
```

### ServiceLoader registration resource

```text
# bridge/src/main/resources/META-INF/services/com.bitwig.extension.ExtensionDefinition
# One line: the FQCN of the ControllerExtensionDefinition subclass.
# Source: capabilities doc §Transport Decision (Bitwig uses ServiceLoader, NOT manifest attr)
com.bwbrain.bridge.BridgeDefinition
```

### Maven shade → .bwextension (pom.xml essentials)

```xml
<!-- Source: DrivenByMoss pom.xml (verified reference build) + AGENTS.md §Technology Stack -->
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.bwbrain</groupId>
  <artifactId>bw-brain-bridge</artifactId>
  <version>0.1.0</version>
  <packaging>jar</packaging>

  <repositories>
    <repository><id>bitwig</id><url>https://maven.bitwig.com</url></repository>
  </repositories>

  <dependencies>
    <!-- Bitwig API: provided by host at runtime, NOT bundled into the shade -->
    <dependency>
      <groupId>com.bitwig</groupId>
      <artifactId>extension-api</artifactId>
      <version>21</version>
      <scope>provided</scope>
    </dependency>
    <!-- JSON for JSON-Lines IPC -->
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>2.22.0</version>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.11.0</version>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.15.0</version>
        <configuration><release>21</release></configuration>
      </plugin>
      <plugin>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.6.2</version>
        <executions>
          <execution>
            <phase>package</phase>
            <goals><goal>shade</goal></goals>
            <configuration>
              <!-- Keep ServiceLoader resource; exclude provided extension-api -->
              <filters>
                <filter><artifact>com.bitwig:extension-api</artifact><excludes><exclude>**</exclude></excludes></filter>
              </filters>
              <outputFile>${project.build.directory}/bw-brain.bwextension</outputFile>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>
```

Install: `cp bridge/target/bw-brain.bwextension "$HOME/Documents/Bitwig Studio/Extensions/"` then restart Bitwig → Settings → Controllers → add "bw-brain".

### Multicall CLI entry (TypeScript — D-06)

```typescript
// daemon/src/cli/bw-brain.ts
// Source: CONTEXT.md D-06 + commander 15 multicall pattern
#!/usr/bin/env node
import { program } from "commander";
import { basename } from "node:path";

const invokedAs = basename(process.argv[1] ?? process.argv[0] ?? "bw-brain");

const SHIMS = ["bw-focus","bw-project","bw-midi","bw-device","bw-diff",
               "bw-arrange","bw-automation","bw-edit"] as const;

async function loadCommands(): Promise<void> {
  // Side-effect: each module registers its commander subcommand on `program`.
  await import("./commands/focus.js");
  await import("./commands/project.js");
  await import("./commands/midi.js");
  await import("./commands/device.js");
  await import("./commands/diff.js");
  await import("./commands/arrange.js");    // stub
  await import("./commands/automation.js"); // stub
  await import("./commands/edit.js");       // stub
}

if ((SHIMS as readonly string[]).includes(invokedAs)) {
  // Shim/symlink invocation — dispatch directly to ONE subcommand.
  process.argv[1] = process.argv[1]?.replace(/bw-[a-z-]+$/, "bw-brain");
  await loadCommands();
  program.parse([...process.argv.slice(0, 2), invokedAs.replace("bw-", ""), ...process.argv.slice(2)]);
} else {
  // `bw-brain <subcmd>` (git-style) or no args → register all + show help.
  await loadCommands();
  program.parse();
}
```

### CLI query client (thin — D-07)

```typescript
// daemon/src/cli/query-client.ts
// Source: D-07 "CLI is a thin client over a daemon-local channel" + node:net UDS
import * as net from "node:net";
import { dirname, join } from "node:path";

const DEFAULT_SOCKET = join(process.env.HOME ?? "", ".bw-brain", "daemon.sock");

export async function query<T>(op: string, payload: unknown = {}, socketPath = DEFAULT_SOCKET): Promise<T> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ path: socketPath }, () => {
      sock.write(JSON.stringify({ version: "1.0", type: "query", op, payload }) + "\n");
    });
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
      buf += chunk;
      const i = buf.indexOf("\n");
      if (i >= 0) {
        sock.end();
        try {
          const result = JSON.parse(buf.slice(0, i));
          if (result.ok) resolve(result.payload as T);
          else reject(new Error(`${result.error}${result.availableFrom ? ` (available from ${result.availableFrom})` : ""}`));
        } catch (e) { reject(e); }
      }
    });
    sock.on("error", reject);
    sock.on("close", () => { if (!buf.includes("\n")) reject(new Error("daemon closed before result")); });
  });
}
```

### Raw-state schema seed (`schemas/project-state.schema.json` — STATE-01)

```jsonc
// Source: docs/seed.md §A "Raw project state" generalized into JSON Schema 2020-12
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bw-brain.local/schemas/project-state.schema.json",
  "title": "ProjectState",
  "type": "object",
  "required": ["version", "project", "selection"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
    "stateFreshness": { "enum": ["live", "stale", "disconnected"] },
    "project": {
      "type": "object",
      "required": ["name", "tempo", "timeSignature"],
      "properties": {
        "name": { "type": "string" },
        "tempo": { "type": "number" },
        "timeSignature": { "type": "string" },
        "keySignature": { "type": "string" },
        "transport": {
          "type": "object",
          "properties": {
            "playing": { "type": "boolean" },
            "positionBeats": { "type": "number" },
            "loop": { "type": "object", "properties": {
              "enabled": { "type": "boolean" }, "start": { "type": "number" }, "length": { "type": "number" }
            } }
          }
        }
      }
    },
    "selection": {
      "type": "object",
      "properties": {
        "trackSid": { "type": "string", "pattern": "^trk_[0-9a-f]{16}$" },   // STATE-04 fingerprint, NOT Bitwig slot
        "clipSid":  { "type": "string", "pattern": "^clip_[0-9a-f]{16}$" },
        "deviceSid":{ "type": "string", "pattern": "^dev_[0-9a-f]{16}$" },
        "region":   { "type": "object", "properties": { "start": { "type": "number" }, "end": { "type": "number" } } }
      }
    },
    "tracks":  { "type": "array", "items": { "type": "object" } },   // windowed TrackBank[N=8] snapshot
    "clips":   { "type": "array", "items": { "type": "object" } },   // pull-result cache (bw-midi inspect)
    "devices": { "type": "array", "items": { "type": "object" } },   // pull-result cache (bw-device inspect)
    "automation": { "type": "array", "items": { "type": "object" } }  // EMPTY in M1 (D-04)
  }
}
```

Note the `trackSid` / `clipSid` / `deviceSid` regex — these are STATE-04 fingerprint IDs, NOT Bitwig slot indices. Pitfall 2 defense.

### Intent schema (`schemas/intent.schema.json` — STATE-03, D-09)

```jsonc
// Source: docs/seed.md §C "Intent state" + CONTEXT.md D-09
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bw-brain.local/schemas/intent.schema.json",
  "title": "ProjectIntent",
  "type": "object",
  "required": ["version", "projectIntent"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
    "projectIntent": {
      "type": "object",
      "required": ["summary"],
      "properties": {
        "summary":    { "type": "string", "minLength": 1 },
        "constraints":{ "type": "array", "items": { "type": "string" } },
        "targets":    { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

### Atomic write (TypeScript — MEM-01, SC#3)

```typescript
// daemon/src/store/atomic-write.ts
// Source: POSIX rename(2) atomicity + Node fs/promises
import { writeFile, rename, mkdir, dirname, basename } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  // Temp file MUST be in same dir as dest — cross-filesystem rename is non-atomic.
  const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  const serialized = JSON.stringify(data, null, 2);
  await writeFile(tmp, serialized, "utf8");   // write fully first
  await rename(tmp, path);                    // atomic on POSIX, same filesystem
}
```

### bw-diff — state-vs-state (SC#1, CLI-01/03, D-05)

```typescript
// daemon/src/cli/commands/diff.ts — READ-ONLY state-vs-state diff (NOT M2 patch-diff)
// Source: SC#1 "bw-diff round-trips 100%" + D-05 promotion of bw-diff to live M1
import { readFileSync } from "node:fs";
import { program } from "commander";

program.command("diff <a> <b>")
  .description("Diff two raw-state JSON files (notes/automation/scope). Round-trips 100%.")
  .option("--explain", "prose alongside JSON")
  .action((a: string, b: string, opts) => {
    const sa = JSON.parse(readFileSync(a, "utf8"));
    const sb = JSON.parse(readFileSync(b, "utf8"));
    const diff = computeStateDiff(sa, sb);  // {notesAdded, notesRemoved, notesChanged, automationTouched, scopeTrackSids, ...}
    console.log(JSON.stringify({ version: "1.0", ok: true, diff, assumptions: [
      { claim: "compared two raw-state snapshots field-by-field", confidence: 1.0, source: "selection" }
    ]}, null, opts.explain ? 2 : 0));
  });

// SC#1 round-trip property: for any state S, computeStateDiff(S, applyPatch(S, diff)) === noop.
// This is the assertion the SC#1 fixture harness holds-out tests against (see Validation Architecture).
```

### Pi `/analyze` SKILL.md (D-10/D-11/D-12, UX-01/05/06)

```markdown
<!-- pi-pack/skills/analyze/SKILL.md -->
<!-- Source: docs.openclaw.ai/tools/skills (verified) + CONTEXT.md D-10/D-11/D-12 -->
---
name: analyze
description: Read the selected Bitwig context via the bw-brain CLI and produce an accurate description + 2-4 next read actions. No invented critique (no analyzers until Phase 3-5).
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-focus","bw-project"]}}}
---

# /analyze — Bitwig context read

You are reading the user's live Bitwig selection via the `bw-*` CLI and producing an **accurate description** + **2-4 next actions**. The bw-brain analyzers for sections, motifs, track roles, energy, and automation salience do NOT exist yet (Phases 3-5). Do NOT invent them.

## Steps

1. Run `bw-focus export --json` to read the selected track/clip/device + transport.
2. Run `bw-project summary --json` to read the surrounding project window.
3. Read `<project>/.bw-brain/intent.json` if present.
4. Produce output in this shape:

```
State:
  Track: <name>    Clip: <name or —>    Device: <name or —>
  Transport: <playing|stopped> @ <positionBeats> beats   Loop: <on|off>
  Section: —   (reserved — Phase 4 fills this)

What this is:
  <one-paragraph literal description grounded ONLY in the focus export + intent.
   No section/motif/role claims. State any mismatch with intent.>

Next actions (2-4, each points at a read command available NOW):
  - `bw-midi inspect --json` — see the exact notes/velocity/timing
    assumptions: [{claim:"a clip is selected", confidence:<0|1>, source:"selection"}]
  - `bw-device inspect --json` — see the chain + exposed parameters
    assumptions: [...]
  - edit `.bw-brain/intent.json` if the description above mismatches your goal
    assumptions: [{claim:"intent.json is the authored source of truth", confidence:1.0, source:"intent"}]
```

## Hard rules (D-10)

- EVERY output line and EVERY next-action carries an `assumptions[]` field (UX-06).
- DO NOT claim sections, motifs, track roles, energy levels, or automation salience.
- If `bw-focus` reports `stateFreshness: "stale"|"disconnected"`, surface that prominently and refuse to describe until live.
- If no clip is selected, skip `bw-midi inspect` from the actions.
```

### `assumptions[]` shape (UX-06, D-10 discretion — pinned here)

```typescript
// Source: CONTEXT.md D-10/UX-06 + AGENTS.md "every suggestion states assumptions"
export interface Assumption {
  /** Human-readable claim, e.g. "selected clip has 32 notes" or "intent says 'preserve bass motif'". */
  claim: string;
  /** Confidence ∈ [0,1]. 1.0 = directly observed; 0.5 = inferred; <0.5 should not appear. */
  confidence: number;
  /** Where the assumption comes from. */
  source: "selection" | "intent" | "config" | "default";
}

// Every /analyze output, every CLI result carrying a derived field, every suggestion,
// every future transform ships with `assumptions: Assumption[]`. Attached from day one.
```

### Analyzer-plugin interface (D-08 discretion — pinned here, MEDIUM confidence)

See §Architecture Patterns Pattern 5 for the full `Analyzer` / `DerivedField` / `AnalyzeContext` / `Assumption` interfaces. M1 ships the registry + the `IntentAnalyzer` only; Phases 3–5 register the section/role/motif/energy/automation analyzers.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bitwig JS ControllerScript as bridge | Java `.bwextension` (production) | Phase 1 finding (JS host has no networking/file I/O) | Phase 2 ships the real Java bridge; spike/ deleted |
| `selection.changed` 1-event protocol | 5-event push + 3-request pull protocol | Phase 2 (this phase) | Bridge mirrors cursor triple + transport + windowed bank; daemon serves full notes/devices via pull |
| Slot-index as identity (`trk_5`) | Fingerprint-based stable IDs (`trk_<sha256[16]>`) | Phase 2 (STATE-04, this phase) | State-cache survives reorder + rename; reconcile-on-reconnect works |
| One TCP port for everything | Bridge TCP 7878 + daemon-local UDS | Phase 2 (D-07, this phase) | CLI contract evolves independently from bridge protocol; UDS gives permission-based auth |
| Throwaway `bw-brain-spike dump` | Multicall `bw-brain` binary + 8 `bw-*` shims | Phase 2 (D-06, this phase) | Stable CLI contract; Pi + any agent can drive it |
| Raw-state in-memory only | Atomic `state-cache.json` + stale-watchdog | Phase 2 (SC#3, this phase) | Daemon survives bridge reload without corrupting state |

**Deprecated/outdated (DO NOT regress):**
- **JS ControllerScript as bridge** — capabilities doc Header: JS `host` has no networking. Java mandatory.
- **`bw-brain-spike dump`** — Phase 1 throwaway. Deleted; replaced by multicall `bw-brain`.
- **`spike/` directory** — Phase 1 throwaway per D-05/D-06. Patterns replicated into `bridge/`, dir deleted.
- **Slot-index wire identity** — Pitfall 2. Fingerprint only.

## Assumptions Log

> Claims tagged `[ASSUMED]`. The planner / discuss-phase use this to identify decisions needing user confirmation. Most are converter-resolvable in-plan; the high-risk ones are flagged.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `CursorRemoteControlsPage` (8 remotes/page) exposes VST/AU params through the same surface as native devices (inferred from capabilities doc §4 + D-02, NOT behaviorally probed). | Pattern 1, Pitfall 10 | Medium — if VST/AU params don't surface via remote-controls, fall back to `cursorDevice.getParameter(int)` direct enumeration. Add a Phase 2 human-verify checkpoint that loads a real VST. |
| A2 | TrackBank page size N=8 is the right window (matches CursorRemoteControlsPage width; smallest useful project-summary window). | Pattern 1, D-01 discretion | Low — if too small, bump to 16; one constant change. The capabilities doc §4 says paging is TODO-in-app so this is a best-effort default. |
| A3 | Maven (not Gradle) is the build tool, per AGENTS.md (CONTEXT.md canonical-refs casually mentions Gradle — flagged as contradiction). | Project Constraints, Pitfall 9 | Low — if user explicitly overrides, swap to Gradle Shadow plugin; ServiceLoader mechanism identical. |
| A4 | Unix domain socket is the right D-07 daemon-local channel (vs second loopback TCP port). | Pattern 3, D-07 discretion | Low — if UDS causes cross-platform issues (it shouldn't on macOS/Linux), fall back to TCP-loopback 7879 + shared-secret token. |
| A5 | Fingerprint composition (name + type + neighbors + contentHash) reconciles correctly across typical Bitwig reorder/rename patterns. | Pattern 4 (STATE-04) | Medium — fuzzy fallback (name+type match) covers content drift; the held-out reconcile test (see Validation) catches regressions. |
| A6 | Stale threshold (5s) and vanish-grace (60s) are reasonable defaults. | Pattern 4 (watchdog) | Low — both are constants; tune after first real bridge-reload test. |
| A7 | Persistent TUI state-pane API is NOT in the verified OpenClaw skills/slash-commands docs → M1 ships text-rendered state from `/analyze`. | Pattern 7, UX-05, Open Questions | Medium — if a pane API exists in OpenClaw plugins and the user wants it in M1, scope grows. Recommended: defer persistent pane to M2. |
| A8 | Project-local `.bw-brain/` (per PROJECT.md) is the durable-store location (not `~/.bw-brain/` global). | Pattern 6, MEM-01 | Low — PROJECT.md + seed.md both say project-local; locked. |
| A9 | `pi install ./pi-pack` is the install path (Pi 0.79.10 `pi --help` confirms `pi install <source>`). | Pattern 7, D-12 | Low — `pi install` is documented; verified this session. |
| A10 | The `CursorTrack` / `PinnableCursorClip` / `CursorDevice` observer method names (`addValueObserver` on `name()`, `position()`, `clipExists()`, etc.) match the in-app Javadoc 6.0.6 surface as documented in capabilities doc §2/§5. | Pattern 1 | Low — Phase 1 already proved `cursorTrack.position().addValueObserver(...)`; the rest are the same API family on the same Javadoc. |

**If this table is empty:** — not applicable; the above 10 are the assumed claims. A1, A5, A7 carry the most planning risk and are mirrored in Open Questions.

## Open Questions

1. **`CursorRemoteControlsPage` VST/AU exposure (A1)** — does walking the 8-remotes-per-page surface for a loaded VST (e.g. Vital, Surge, a free synth) actually return the plugin's parameters? Capabilities doc §4 lists the surface but the §4 behavioral probe is TODO-in-app.
   - What we know: surface exists; 8 remotes/page; AGENTS.md capabilities table says "8 macro-style remote parameters per page" with `each remote parameter` writable.
   - What's unclear: whether VST/AU plugins AUTOMATICALLY populate the page or whether the user must manually map macros first.
   - Recommendation: add a Phase 2 human-verify checkpoint (load a free VST, run `bw-device inspect`, observe). Fallback if empty: `cursorDevice.getParameter(int index)` direct walk (slower but covers all params regardless of page mapping).

2. **Persistent TUI state-pane API (A7)** — the seed doc shows four TUI panes (state/diff/arrangement/device); the verified OpenClaw docs cover skills + slash commands but NOT a custom-pane renderer.
   - What we know: `pi --help` shows the runtime; OpenClaw has plugins (heavier than skills); Ink-style TUI is implied by the project shape.
   - What's unclear: whether M1 should ship a real persistent pane (plugin-shaped effort) or text-rendered state from `/analyze` (M1-recommended).
   - Recommendation: M1 = text-rendered state in `/analyze` output + a reserved section slot. Persistent pane deferred to M2 (with `/vary`+diff-pane) where the diff visualization is the real value. UX-05's "renders selected track/clip/device + section label" is satisfiable as text-render in M1.

3. **Reconcile policy under massive project reorder (A5)** — the fingerprint fuzzy-fallback covers renames + content drift. What if the user reorders 20 tracks at once (drag-strip)?
   - What we know: neighbors are part of the fingerprint; a 20-track reorder changes most neighbor pairs.
   - What's unclear: whether the name+content signal alone is enough, or whether we need a longer neighbor window.
   - Recommendation: ship the documented reconcile + a held-out fixture test simulating a 20-track reorder; tune the fuzzy fallback after observing real behavior.

4. **Java `host.println()` reachability for bridge diagnostics** — the bridge logs via `host.println()` (Bitwig's in-app console). For debugging the daemon-side, do we need bridge logs to reach the daemon?
   - What we know: Phase 1 spike used `host.println` for in-app visibility; no disk log is produced.
   - Recommendation: NOT needed for M1 — the bridge is dumb by design; daemon-side logging (console + structured) is sufficient. Bridge errors surface as malformed/missing events the daemon already drops cleanly.

## Environment Availability

> Probed this session via `command -v` / `--version` / Homebrew Cellar inspection / Info.plist reads.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | daemon + CLI + Pi pack (D-05/D-06/D-12) | ✓ | 22.22.3 | AGENTS.md prefers 24 LTS; 22.19+ acceptable for OpenClaw alignment (Phase 1 finding). Acceptable. |
| npm | TS deps install | ✓ | 10.9.8 | — |
| TypeScript | daemon language | ✓ (dev) | 5.7+ | — |
| Bitwig Studio | bridge host + bridge human-verify checkpoints | ✓ | 6.0.6 | None — substrate. Bundled JARs at `/Applications/Bitwig Studio.app/Contents/Java/{bitwig.jar,libs.jar}` (compile classpath). User Extensions dir `~/Documents/Bitwig Studio/Extensions/` exists (SpikeProbe.bwextension already installed). |
| **JDK 21** | Java bridge build | ✓ (NOT on PATH) | 21.0.11 (Homebrew `/opt/homebrew/Cellar/openjdk@21/`) | Set `JAVA_HOME=/opt/homebrew/opt/openjdk@21` OR `sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk` to put on PATH. **Planner: add a Wave 0 setup step.** |
| **Maven** | Java bridge build (`.bwextension` packaging) | ✗ | — | `brew install maven` (one command). **Planner: add to Wave 0.** AGENTS.md locks Maven; not currently installed. |
| Pi runtime | Pi `/analyze` pack (D-12) + manual smoke | ✓ | 0.79.10 (`/Users/eggfam/.local/share/pi-node/.../bin/pi`) | None — D-12 depends on this; PROJECT.md confirms "Pi/OpenClaw is a real, installed runtime." `pi install <source>` is the pack-install path. |
| OpenClaw Gateway | (optional — Pi is sufficient for M1) | ✗ | — | NOT required for M1. Pi 0.79.10 is the agent layer. If persistent TUI panes turn out to require an OpenClaw plugin (Open Question 2), this becomes a dependency. |
| gsd-tools | research/planning seams | ✓ | — | — |

**Missing dependencies with no fallback:**
- None blocking Phase 2 execution. JDK 21 is installed (off-PATH); Maven + `JAVA_HOME` setup are one-command Wave 0 steps.

**Missing dependencies with fallback:**
- Maven: install via `brew install maven`. If the user prefers Gradle (CONTEXT.md contradiction), Gradle is also a `brew install gradle` — but AGENTS.md locks Maven.
- JDK 21 on PATH: either `JAVA_HOME` env var or a Homebrew symlink. Either unblocks the Maven build.

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — section required. This is the **M1 read-only accuracy** milestone: validation must prove (a) the bridge mirrors correctly, (b) the daemon normalizes correctly, (c) STATE-04 survives reconnect, (d) bw-diff round-trips, (e) the CLI contract is stable, and (f) the ~20-clip accuracy bar (SC#1). The CLI contract is the testable boundary; the bridge half is a human-verify checkpoint (Bitwig open).

### Test Framework

| Property | Value |
|----------|-------|
| Framework (TS) | Vitest 4.1.9 (already configured from Phase 1) |
| Framework (Java) | JUnit 5.11.x (new — bridge module) |
| Config file (TS) | `daemon/vitest.config.ts` (existing); new vitest config for bridge module if needed |
| Quick run command | `cd daemon && npx vitest run` (TS); `cd bridge && mvn test` (Java) |
| Full suite command | `cd daemon && npx vitest run && cd ../bridge && mvn test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **BRIDGE-01** (push) | Cursor triple + transport + windowed TrackBank observers fire + emit schema-valid JSON-Lines | unit (Java) + integration (human) | `cd bridge && mvn test` (line-shape tests); human-verify: load .bwextension in Bitwig, exercise selection, observe daemon log | ❌ Wave 0 (Java tests); human checkpoint per plan |
| **BRIDGE-02** (mirror) | Notes/chain/params mirror correctly including VST/AU | integration (human) — see Open Question 1 | human-verify: load a VST, run `bw-device inspect`, observe non-empty param list | human checkpoint (A1) |
| **BRIDGE-03** (events) | All event types validate against extended `event.schema.json` | unit (TS) | `cd daemon && npx vitest run schemas` | ✅ (existing schemas.test.ts — extend) |
| **STATE-01** | Raw-state normalization validates against `project-state.schema.json` | unit (TS) | `cd daemon && npx vitest run normalizer` | ❌ Wave 0 |
| **STATE-02** (framework) | Empty analyzer registry + IntentAnalyzer emit derived intent field | unit (TS) | `cd daemon && npx vitest run analyzer-registry` | ❌ Wave 0 |
| **STATE-03** | Intent read from `.bw-brain/intent.json` validates + atomic | unit (TS) | `cd daemon && npx vitest run intent-store` | ❌ Wave 0 |
| **STATE-04** (fingerprint) | Fingerprint deterministic for same input; distinct for different | unit (TS) | `cd daemon && npx vitest run fingerprint` | ❌ Wave 0 |
| **STATE-04** (reconcile — SC#3) | Reconcile survives reorder, rename, content drift; no ID corruption | property (TS) — held-out fixture simulating 20-track reorder | `cd daemon && npx vitest run reconcile` | ❌ Wave 0 (SC#3 critical) |
| **STATE-04** (atomic write — SC#3) | Concurrent writes never produce a half-written `state-cache.json` | property (TS) — N parallel atomicWriteJson → final file always parses + is one of the inputs | `cd daemon && npx vitest run atomic-write` | ❌ Wave 0 (SC#3 critical) |
| **STATE-04** (stale watchdog — SC#3) | `live → stale → disconnected` transitions correct; assertFresh() throws when not live | unit (TS) | `cd daemon && npx vitest run stale-watchdog` | ❌ Wave 0 (SC#3 critical) |
| **CLI-01** (multicall) | All 8 commands emit JSON; 3 stubs emit `{ok:false,error:"not_implemented",availableFrom}`; `--explain` adds prose | unit (TS) | `cd daemon && npx vitest run cli` | ❌ Wave 0 |
| **CLI-02** (focus/project) | `bw-focus export`, `bw-project summary`, `bw-project region` return schema-valid project-state | unit (TS) — synthetic daemon fixture | `cd daemon && npx vitest run cli/focus cli/project` | ❌ Wave 0 |
| **CLI-03** (midi/device inspect) | `bw-midi inspect` returns notes/velocity/timing; `bw-device inspect` returns chain/params incl. VST/AU (mocked) | unit (TS) — mock daemon responses | `cd daemon && npx vitest run cli/midi cli/device` | ❌ Wave 0 |
| **CLI-03** (live VST) | Real VST params surface via `bw-device inspect` | integration (human) — Open Question 1 | human-verify | human checkpoint |
| **MEM-01** (atomic) | `.bw-brain/` files all written atomically; survive crash mid-write | property (TS) — same as STATE-04 atomic-write | (covered by atomic-write test) | ❌ Wave 0 |
| **MEM-02** (boundary) | No CLI op writes ephemeral data to durable | unit (TS) — assert cli-query schema has no ephemeral-write op | `cd daemon && npx vitest run store/boundary` | ❌ Wave 0 (SC#5) |
| **UX-01** (/analyze) | `/analyze` produces accurate description + 2-4 actions w/ assumptions[]; NO invented critique | manual smoke (Pi) + unit (CLI contract it wraps) | human: `pi` then `/analyze`; unit: `cd daemon && npx vitest run cli` | human + automated |
| **UX-05** (state pane) | State pane renders T/C/D + transport + section="—" | manual smoke (Pi) | human: observe `/analyze` output block | human (A7) |
| **UX-06** (assumptions) | Every CLI derived-field output + every /analyze line carries `assumptions[]` | unit (TS) — schema assert | `cd daemon && npx vitest run schemas` (assert assumptions required on result payloads) | ❌ Wave 0 |
| **SC#1 (read accuracy)** | `bw-focus export`/`bw-project summary`/`bw-project region` match human judgment >90% across ~20 representative clips | **held-out fixture harness** — see Sampling Rate | `cd daemon && npx vitest run fixtures/representative-clips` | ❌ Wave 0 (the bar) |
| **SC#1 (bw-diff round-trip)** | `bw-diff(a, applyPatch(a, diff(a,b))) === noop` — round-trips 100% | property (TS) — for any two synthetic states | `cd daemon && npx vitest run cli/diff` | ❌ Wave 0 (the bar) |

### Sampling Rate

- **Per task commit:** `cd daemon && npx vitest run` (TS suite; `cd bridge && mvn test` for bridge tasks)
- **Per wave merge:** full TS + Java suites
- **Phase gate:** full suites green + SC#1 fixture harness >90% + SC#1 bw-diff round-trip 100% + bridge human-verify checkpoints passed (Bitwig open), before `/gsd-verify-work`

### SC#1 Accuracy Harness — the read-only bar

The fixture harness is the executable form of SC#1's *"description matches human judgment >90% across ~20 representative clips"*:

```
fixtures/representative-clips/
  01-kick-4bar.json          # raw-state fixture: 4-bar kick clip
  01-kick-4bar.expected.json # human-authored expected description + assumptions[]
  02-bass-8bar.json
  02-bass-8bar.expected.json
  ... (20 total, covering: kick/bass/lead/pad/hats/perc, varying lengths,
       with/without VST params, with/without intent.json)
```

**Test shape:** for each fixture, the harness runs the daemon's `bw-focus export` + `bw-project summary` normalization logic against the fixture's raw-state, then asserts the output's `description` field matches `expected.description` (token-overlap > 0.9 or LLM-judged semantic match — pick one in planning). The `assumptions[]` field is asserted present + non-empty on every output line.

**`bw-diff` round-trip (100% bar):** property test — for any two synthetic raw-states `a`, `b`:
1. `diff = computeStateDiff(a, b)`
2. `b' = applyDiff(a, diff)` (a pure function — M1 has no patches, so this is just a state-merge)
3. `assert computeStateDiff(b', b).isEmpty()` — the round-trip is lossless

This is the executable form of SC#1's *"bw-diff round-trips 100%"* and is the test that **must** pass at the phase gate.

### Wave 0 Gaps

- [ ] `bridge/pom.xml` + `bridge/src/...` (Java bridge skeleton, ServiceLoader resource, JUnit 5 tests for Outbox/LineJson/PullHandlers)
- [ ] `bridge/src/test/java/.../OutboxTest.java`, `LineJsonTest.java`, `PullHandlersTest.java`
- [ ] `daemon/src/ingest/normalizer.{ts,test.ts}` — STATE-01
- [ ] `daemon/src/state/fingerprint.{ts,test.ts}` — STATE-04 fingerprint (deterministic, distinct)
- [ ] `daemon/src/state/reconcile.{ts,test.ts}` — STATE-04 reconcile (held-out 20-track-reorder property test — SC#3 critical)
- [ ] `daemon/src/state/stale-watchdog.{ts,test.ts}` — STATE-04 watchdog transitions (SC#3 critical)
- [ ] `daemon/src/state/analyzer-registry.{ts,test.ts}` — D-08 framework (empty + IntentAnalyzer)
- [ ] `daemon/src/state/intent-store.{ts,test.ts}` — STATE-03
- [ ] `daemon/src/store/atomic-write.{ts,test.ts}` — MEM-01/SC#3 atomic-write property test (N parallel writes — SC#3 critical)
- [ ] `daemon/src/store/state-cache.{ts,test.ts}` — SC#3 snapshot
- [ ] `daemon/src/store/boundary.{ts,test.ts}` — MEM-02 SC#5 boundary assertion
- [ ] `daemon/src/transport/uds.{ts,test.ts}` — D-07 Unix domain socket transport (0600 mode test — Pitfall 5)
- [ ] `daemon/src/query/query-server.{ts,test.ts}` — D-07 query/response (Ajv validation, stub emitter)
- [ ] `daemon/src/cli/bw-brain.ts` — multicall entry (D-06)
- [ ] `daemon/src/cli/commands/{focus,project,midi,device,diff,arrange,automation,edit}.ts` — 5 live + 3 stubs (D-05)
- [ ] `daemon/src/cli/query-client.ts` — D-07 thin client
- [ ] `daemon/src/cli/cli.test.ts` — multicall dispatch + JSON output + `--explain` + stub shape
- [ ] `schemas/project-state.schema.json`, `schemas/intent.schema.json`, `schemas/cli-query/{query,result}.schema.json` — new contracts
- [ ] `schemas/protocol/event.schema.json` + `request.schema.json` — EXTEND enums for new event/request types
- [ ] `daemon/src/protocol/reader.ts` — extend `OBSERVATIONAL_EVENT_TYPES` (Pitfall 1)
- [ ] `pi-pack/skills/analyze/SKILL.md` — Pi `/analyze` skill (D-10/D-11/D-12)
- [ ] `fixtures/representative-clips/` — ~20 hand-crafted raw-state fixtures + expected outputs (SC#1)
- [ ] Framework install: `brew install maven`; `JAVA_HOME=/opt/homebrew/opt/openjdk@21` (or symlink)
- [ ] `daemon/package.json` `bin` field: 9 entries (bw-brain + 8 shims) all pointing at `./src/cli/bw-brain.ts`

*(Existing Phase 1 test infrastructure — vitest config, line-buffer.test.ts, schemas.test.ts, handshake.test.ts — covers the kept spine; Wave 0 extends, not replaces.)*

## Security Domain

> `security_enforcement: true`, ASVS L1, `security_block_on: high` (`.planning/config.json`). Phase 2 expands the localhost-IPC surface: a new daemon-local listener (UDS), durable disk writes (`.bw-brain/`), a Java bridge running inside Bitwig's JVM, and a CLI thin client. The security posture is "local-first, single-user, loopback/filesystem-only" — but the surface is now non-trivial.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user localhost; no auth needed. The UDS file mode 0600 (Pattern 3) IS the local auth — only the same-user process can connect. |
| V3 Session Management | no | Daemon is a long-running process, not a session server. CLI connections are one-shot query/response. |
| V4 Access Control | **yes** | **Filesystem permissions on `.bw-brain/` (0600 files, 0700 dir) + UDS socket mode 0600** are the access control. MEM-02 boundary (no ephemeral → durable path) is an architectural access control. |
| V5 Input Validation | **yes** | **Ajv validates every message at every boundary** (bridge→daemon envelope, daemon-ingest raw-state, daemon→CLI query/response). New schemas (raw-state, intent, cli-query) extend the Phase 1 pattern. Malformed messages dropped, never processed. |
| V6 Cryptography | no | No crypto in M1 (no secrets on the wire; .bw-brain/ contains no secrets, only project state + intent). Intent.json is user-authored project notes, not credentials. |
| V12 Files & Resources | **yes** | **Atomic writes (temp+rename) on every `.bw-brain/` file**; daemon is sole writer; temp files in same dir (no cross-filesystem rename); files created with restrictive mode. Bridge writes NOTHING to disk (it's in-process in Bitwig's JVM). |
| V13 API & Web Service | partial | The daemon-local UDS is an API surface (cli-query). It is loopback-only (filesystem-bound), schema-validated, and one-shot per query. No HTTP, no REST, no remote surface. |

### Known Threat Patterns for the bw-brain M1 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LAN-reachable daemon socket (TCP bind to 0.0.0.0) | Information disclosure / Tampering | **`TcpServerTransport` refuses non-loopback host** (Phase 1 invariant — Pitfall 5). Replicate on the new UDS via 0600 file mode (Pattern 3). |
| UDS socket world-readable/writable | Tampering / Elevation | `chmod(socketPath, 0o600)` immediately after listen (Pitfall 5 UDS-form). |
| Half-written `state-cache.json` after crash | Tampering / DoS (state loss) | Atomic temp+rename on every durable write (Pattern 4 / Pitfall 4). |
| Cross-traffic from another local process on UDS | Spoofing | File mode 0600 — only same-user processes connect. Single-user dev box is the threat model. |
| Stale state trusted as live | Tampering (silent wrong-state edits) | Stale-watchdog surfaces `stateFreshness` on every CLI/`/analyze` output; refuses edits in M2+ (Pattern 4). |
| Bridge flood overwhelming daemon reader | DoS | Bounded-queue drop-oldest on observational events (Phase 1 reader.ts — Pattern 5). New event types added to `OBSERVATIONAL_EVENT_TYPES` (Pitfall 1). |
| Malformed message crashing reader | DoS | Ajv-before-process + JSON.parse try/catch (Phase 1 reader.ts). Replicate for cli-query schema. |
| Ephemeral data polluting durable store | Tampering (trust model violation) | MEM-02: daemon has no ephemeral-write op in cli-query schema; boundary unit test (SC#5). |
| Protocol-drift silent corruption | Tampering | Version handshake (Phase 1 Pattern 3). Bridge ↔ daemon protocol versioned; CLI ↔ daemon query schema versioned separately. |
| `.bwextension` supply-chain (third-party Maven deps) | Tampering | Only `jackson-databind` (Maven Central, JVM standard) + `extension-api` (Bitwig's own repo, provided scope). No third-party bridge deps. Audit `pom.xml` for transitive surprises. |
| Bridge crashes Bitwig (heavy work on controller thread) | DoS (audio engine stalls) | Observers enqueue-never-block (Pattern 1, Pitfall 3 — capabilities doc §5). Unit test the queue-offer path. |

**No high-severity findings** — the M1 surface is adequately scoped. The two non-negotiable controls are: (1) loopback/filesystem-only listeners (TCP loopback + UDS 0600); (2) Ajv validation at every boundary (envelope, raw-state, intent, cli-query). The MEM-02 boundary is an architectural control the planner must encode as a unit test.

## Sources

### Primary (HIGH confidence)

- **`docs/bitwig-capabilities.md`** — Phase 1 PROBE-01 output, in-app verified against Javadoc 6.0.6: §Transport Decision (raw `java.net` TCP confirmed live, ServiceLoader packaging verified), §2 (NoteStep + `PinnableCursorClip`, `createCursorClip(gridW,gridH)` 2-arg), §4 (TrackBank windowing — TODO-in-app behavioral), §5 (observers enqueue-never-block, `CursorTrack.position()` proven path), §6 (NO native stable IDs → STATE-04 fingerprint required). `[VERIFIED — Phase 1 output, read this session]`
- **`.claude/AGENTS.md` §Technology Stack + §Capabilities table** — locked stack: Java (OpenJDK 21, `com.bitwig:extension-api:21`), Maven 3.8.1+ (shade → .bwextension), jackson 2.22.0, Node ≥22.19, TS 5.7+, Ajv 8.20.0, JSON Schema 2020-12, commander 15. `MCP rejected`; `TCP is the only option — Bitwig does not give the extension a stdin/stdout`. `[VERIFIED — sourced from DrivenByMoss + npm]`
- **`spike/java/src/com/bwbrain/spike/Spike{Definition,Extension}.java`** — Phase 1 PROVEN-LIVE Java extension: `CursorTrack.position().addValueObserver(...)` → `LinkedBlockingQueue` outbox → writer thread → loopback `java.net.Socket` to `127.0.0.1:7878`. Captured round-trip `{"version":"1.0","type":"selection.changed",...}` end-to-end. `[VERIFIED — read this session]`
- **`daemon/src/transport/{transport,tcp}.ts` + `daemon/src/protocol/{reader,line-buffer}.ts`** — Phase 1 KEPT daemon spine: `Transport` interface (transport-agnostic), `TcpServerTransport` (loopback-only, Pitfall 5 constructor guard), `createReader` (framing → Ajv-at-boundary → bounded-queue backpressure), `LineBuffer` (partial-line reassembly), `OBSERVATIONAL_EVENT_TYPES`. `[VERIFIED — read this session]`
- **`schemas/protocol/*.schema.json` (6 files)** — Phase 1 frozen contract: envelope (oneOf discriminator), event (`selection.changed` only — Phase 2 extends), request (`get.selected_clip` only — Phase 2 extends), response (`{id, ok, payload}`), edit (`apply.patch` + undoLabel trust-spine), handshake (`hello`/`hello.response`). `[VERIFIED — read this session]`
- **`scripts/gen-types.mjs`** — the `$id`-aware JSON-Schema → TS codegen (json2ts can't resolve cross-file `$ref`s against absolute `https` `$id`s). New schemas MUST go through this. `[VERIFIED — read this session]`
- **DrivenByMoss GitHub (`git-moss/DrivenByMoss`, master, release 26.6.2)** — reference Bitwig extension build: `pom.xml` (`extension-api:21`, Java 21, jackson 2.22.0, `maven-shade-plugin` → copy-rename to `.bwextension`, repo `https://maven.bitwig.com`); OSC networking proven. `[CITED in AGENTS.md — sourced from DrivenByMoss pom.xml]`
- **OpenClaw docs (`docs.openclaw.ai/tools/skills` + `/tools/slash-commands`)** — Pi/OpenClaw skill conventions: `<workspace>/skills/<name>/SKILL.md`, YAML frontmatter (`name`,`description`,`user-invocable`,`command-dispatch`,`metadata.openclaw`), AgentSkills spec, slash-command auto-registration sanitized to `a-z0-9_` max 32 chars, `command-dispatch: tool` for deterministic dispatch (NOT used for /analyze), `skills.load.watch: true` for hot-reload. `[VERIFIED — fetched this session]`
- **Pi runtime 0.79.10** — `pi --help` confirms `pi install <source> [-l]` is the pack-install path; `pi list` shows installed extensions; `~/.pi/agent/` is the session dir (ephemeral memory location for MEM-02). `[VERIFIED — probed this session]`
- **npm registry** — `ajv` 8.20.0, `ajv-formats` 3.0.1, `commander` 15.0.0, `tsx` 4.22.4, `vitest` 4.1.9, `json-schema-to-typescript` 15.0.4; no `postinstall` scripts on any (supply-chain clean). `[VERIFIED via npm view + package-legitimacy gate this session]`
- **Installed environment** — Node 22.22.3 (`node --version`), JDK 21.0.11 (`/opt/homebrew/opt/openjdk@21/bin/java --version`), Bitwig Studio 6.0.6 (`/Applications/Bitwig Studio.app/Contents/Info.plist`), Pi 0.79.10 (`pi --version`). Maven NOT installed (`brew install maven` needed). `[VERIFIED — probed this session]`

### Secondary (MEDIUM confidence)

- **`docs/seed.md` §"The data model" §A/§B/§C/§D + §"Proposed local protocol" + §"Pi package design" + §"MVP build plan / Milestone 1"** — the project seed: raw-state shape, derived composition state, intent state, patch/diff model, JSON-Lines examples, six skills + slash commands + four TUI panes, M1 ship list. `[CITED — project seed]`
- **jsonlines.org** — UTF-8, one JSON value per line, `\n` terminator (`\r\n` tolerated), trailing terminator recommended. Reused for cli-query framing. `[CITED]`
- **POSIX `rename(2)` + Node `fs/promises`** — atomic-rename guarantee on same filesystem. Basis for the atomic-write pattern (Pattern 4). `[CITED]`
- **`docs.openclaw.ai/tools/creating-skills`** (referenced but not fetched) — full skill-authoring guide. The verified `/tools/skills` page covers the frontmatter format sufficient for M1. `[CITED]`

### Tertiary (LOW confidence / must verify in-plan)

- **`CursorRemoteControlsPage` VST/AU exposure (A1)** — capabilities doc §4 lists the surface; whether VST/AU plugins AUTOMATICALLY populate the page (vs requiring manual macro mapping) is TODO-in-app. **Open Question 1 — Phase 2 human-verify checkpoint.**
- **Persistent TUI pane API (A7)** — seed doc shows four panes; verified OpenClaw docs cover skills/slash-commands but not a pane renderer. **Open Question 2 — M1 recommendation is text-render from /analyze.**
- **Reconcile policy under massive reorder (A5)** — fingerprint fuzzy-fallback designed but not stress-tested at scale. Held-out fixture test (Validation Architecture) covers it.

## Metadata

**Confidence breakdown:**
- Bridge observer surface (BRIDGE-01/02/03): **HIGH** — Phase 1 proved `CursorTrack.position()` live; the rest are the same Javadoc 6.0.6 family; only VST/AU exposure (A1) is MEDIUM-pending human verify.
- Daemon spine reuse (Transport/reader/LineBuffer): **HIGH** — Phase 1 kept spine, read this session.
- STATE-04 fingerprint + reconcile + watchdog: **MEDIUM** — designed from the verified "no native IDs" finding; the reconcile policy under massive reorder (A5) is a held-out test away from HIGH.
- Multicall CLI + UDS query channel: **HIGH** — standard patterns (commander multicall, node:net UDS, Ajv-at-boundary); all tools already installed.
- Atomic writes + memory boundary: **HIGH** — POSIX rename + architectural MEM-02 enforcement.
- Pi `/analyze` pack: **MEDIUM-HIGH** — OpenClaw conventions verified; TUI-pane API (A7) unresolved.
- Maven build toolchain: **HIGH** — AGENTS.md + DrivenByMoss; the Gradle contradiction (A3) is planner-confirmable.
- Read-only accuracy harness (SC#1): **MEDIUM** — the fixture approach is sound; the >90% bar's exact matching criterion (token-overlap vs LLM-judge) is a planner decision.

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (30 days — stable stack; the SC#1 fixture set + the reconcile test are the long-lived artifacts; OpenClaw/Pi conventions may evolve faster — re-verify if planning slips past 30 days)
