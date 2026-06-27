# Phase 2: Read-Only Context Foundation (M1) - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The assistant reliably **understands and describes** the selected Bitwig context (clip/device/region/arrangement) through a Java `.bwextension` bridge → TypeScript daemon → stable read-only CLI → Pi `/analyze` skill — **no editing**. "Accurate first" made operational: the first milestone where the model proves it can describe what's there before any creative layer lands. Requirements: BRIDGE-01/02/03, STATE-01/02/03/04, CLI-01/02/03, MEM-01/02, UX-01/05/06 (15 total). Success criteria are in `.planning/ROADMAP.md` §Phase 2.

**Scope anchor (from discussion):** M1 is the *read-only accuracy* milestone. Every analyzer that produces musical *judgment* (sections, motifs, track roles, energy, automation salience) is explicitly a later phase (P3 ARRANGE/MIDI, P4, P5 AUTO). M1 builds the **substrate** those analyzers will plug into: the bridge mirror, the raw→derived normalizer pipeline + confidence/assumptions plumbing, the durable/ephemeral memory boundary, the stable CLI contract, and a Pi UX shell that wraps the CLI. The M1 `/analyze` critique is *accurate description + read-actions*, never invented musical critique.

</domain>

<decisions>
## Implementation Decisions

### Bridge Mirror Coverage
- **D-01 — Cursor + windowed TrackBank (NOT cursor-only, NOT full enumeration):** The bridge mirrors the GUI selection via `CursorTrack` + `PinnableCursorClip` + `CursorDevice` (the proven surface from Phase 1's `cursorTrack.position()` round-trip) AND a windowed `TrackBank` (N tracks around the cursor, page size chosen by researcher) so `bw-project summary` can enumerate the project without a full fan-out. Rationale: pure cursor-only can't serve a project summary; full enumeration is the heaviest observer fan-out and bank-paging is still TODO-in-app (capabilities doc §4). Windowed-N bounds cost while enabling the project view.
- **D-02 — Cursor device chain incl. VST/AU params (meets CLI-03):** Device-chain mirroring follows `CursorDevice` and enumerates its parameter pages (`CursorRemoteControlsPage`, 8 remotes/page) **including loaded VST/AU plugins** — VST/AU params are exposed through the same parameter-page surface as native devices. This is the M1 must-have CLI-03 ("including loaded VST/AU plugins"). Native-only was rejected as under-delivering CLI-03; full-chain (every device, not just cursor) was rejected as heavier than M1 needs.
- **D-03 — Hybrid push/pull snapshot delivery:** Observers **push** lightweight/volatile state (selection, transport, track/clip/device name + position) as events — the proven `selection.changed` path, drop-oldest under flood (Phase 1 backpressure). Heavy/verbose inspection (full note list, parameter-page dump) is **pulled** on-demand via `get.*` request/response. Rationale: bounds observer fan-out under rapid change, reuses BOTH envelopes Phase 1 froze (event + request/response), matches the bounded-queue backpressure design. Pure-push wastes the request channel; pure-poll loses the live `selection.changed` reactivity the spike proved.
- **D-04 — Automation mirror deferred (raw slot reserved, empty):** The raw-state model keeps the `automation` field (seed §A) but the bridge leaves it **empty in M1**. Automation inspection is explicitly AUTO-01 (Phase 5); the §3 automation-write probe is deferred to pre-Phase-3; `bw-automation` is an M4 command. Keeps M1 focused on notes/devices/structure.

### CLI Surface & Daemon Shape
- **D-05 — Read commands live + 3 stubs + bw-diff promoted:** The four read commands ship functionally: `bw-focus` (export), `bw-project` (summary/region), `bw-midi` (inspect), `bw-device` (inspect). `bw-diff` is **promoted to a live M1 command** (read-only state-vs-state diff: notes/automation/scope between two raw-state snapshots — NOT patch-diff, which is M2) so SC#1's *"bw-diff round-trips 100%"* is satisfied. The remaining three (`bw-arrange`, `bw-automation`, `bw-edit`) are registered as **stubs that emit a clear "not implemented until M2-M4" JSON failure** (honors CLI-01 "all 8 emit JSON" + "fail clearly"). CLI-01's "eight CLI commands" is thus delivered as: 5 live + 3 stubs.
- **D-06 — Multicall binary + `bw-*` shims:** One multicall `bw-brain` binary dispatched by `argv[0]`; `bw-focus`, `bw-project`, `bw-midi`, `bw-device`, `bw-diff` (and the three stubs) installed as thin shims/symlinks to it. BOTH `bw-focus export` (seed spelling) AND `bw-brain focus export` work (git-style). One codebase, seed's snappy naming honored, shell-composable. (The Phase 1 throwaway `bw-brain-spike dump` is removed; `dump` is replaced by the real commands.)
- **D-07 — Long-running daemon as source of truth; CLI = thin client over a SEPARATE channel:** The daemon is the single source of truth — it holds the normalized state, writes `state-cache.json` atomically (temp+rename), reconciles stable IDs on bridge reconnect, and the watchdog marks state stale refusing edits when the bridge is silent (SC#3). The CLI is a **thin client** that queries the daemon over a **daemon-local channel separate from the bridge TCP port** (unix socket or second loopback port — researcher pins), with its **own query/response shape**. The bridge TCP port (`127.0.0.1:7878`) stays **bridge-only**. Rationale: SC#3's "daemon survives bridge reload" implies a long-running daemon; separating CLI-query from bridge-protocol keeps the two contracts independently evolvable and avoids mixing CLI traffic with bridge control on one socket.

### Derived-State & Intent Floor
- **D-08 — Framework-only + intent; NO analyzers in M1:** Build the derivation **pipeline** (raw → derived normalizer, per-field confidence plumbing, `assumptions[]` attachment points) so Phases 3–5 plug analyzers in via a defined analyzer interface — but **no heavy analyzers run in M1**. `sections`/`trackRoles`/`motifs`/`energyCurve`/`automationSalience` (STATE-02) all stay **empty until their phase** (P3 MIDI-01, P4 ARRANGE-01..05, P5 AUTO-01). M1's only "derived" output is intent (STATE-03). Rationale: every STATE-02 analyzer is explicitly scoped to a later phase; pulling any forward is scope creep against the accurate-first, vertical-slice plan. The M1 deliverable is the *substrate*, not the analysis.
- **D-09 — Intent is user-authored in `.bw-brain/intent.json`:** `projectIntent` (`{summary, constraints[], targets[]}` per seed §C) is **user-authored**. M1 ships the intent schema + an atomic validated read; the daemon validates + serves it; `/analyze` grounds in it. **No inference** in M1 (accurate-first; inference is a later creative layer). Inferred defaults and full daemon-inference were both rejected as premature guessing. (Editing UX — a future `/intent` command or hand-edit — is the agent's discretion; M1 need only read it correctly.)

### Pi `/analyze` & Package Delivery
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 outputs (the kept spine Phase 2 extends — start here)
- `docs/bitwig-capabilities.md` — the verified Bitwig API surface (PROBE-01 output). **Design-lock input for the bridge.** Critical sections: §Transport Decision (raw TCP confirmed live, `CursorTrack.position()` proven), §2 Note-Editing (`NoteStep` + `PinnableCursorClip`, `createCursorClip(gridW,gridH)` 2-arg), §6 Stable IDs (NO native id → STATE-04 fingerprint-mapping required), §4 Bank Paging (TODO-in-app — gates D-01 page-size research), §5 Observer Granularity (enqueue-never-block proven). §Deferred lists the pre-Phase-3 behavioral probes.
- `.planning/phases/01-schema-ipc-spike/01-CONTEXT.md` — Phase 1 decisions D-01..D-08 (the kept daemon spine, throwaway extension, transport decision rule, protocol freeze breadth). The "Agent's Discretion" items (transport threshold, protocol breadth) are now RESOLVED (TCP confirmed, 6 schemas frozen) — treat as locked.
- `schemas/protocol/*` (6 files: `envelope`/`event`/`request`/`response`/`edit`/`handshake`) — the frozen JSON-Lines contract both halves build against. D-03 (push/pull) reuses the event AND request/response envelopes. The bridge implements the `get.*` request handler (new in Phase 2).
- `daemon/src/transport/transport.ts` — the `Transport` interface (D-05 core); the reader consumes ONLY this. D-07's new daemon-local CLI-query channel is a NEW transport peer, not a reuse of the bridge `TcpServerTransport`.
- `daemon/src/protocol/reader.ts` — the framing/validation/backpressure orchestrator; `OBSERVATIONAL_EVENT_TYPES = {"selection.changed"}` (Phase 2 extends this set as more event types freeze); Ajv-compiled-once-at-boot pattern to mirror for any new schema.
- `daemon/src/transport/tcp.ts` — `TcpServerTransport`; the **loopback-only security invariant (Pitfall 5)** MUST be replicated on any new daemon-local listener (D-07).
- `daemon/src/cli/dump.ts` — the throwaway `bw-brain-spike dump` proof CLI; D-06 replaces it with the real multicall `bw-brain` binary.

### Project intent & constraints (do not re-litigate)
- `.planning/PROJECT.md` §Constraints + §Key Decisions — Java bridge first; JSON-Lines over localhost TCP; local-first; patch model; trust model; "CLI is the stable interface, not the agent"; "Pi/OpenClaw is a real, installed runtime"; pluggable genre profiles / generic reasoning core.
- `.planning/REQUIREMENTS.md` — Phase 2's 15 requirements (BRIDGE-01/02/03, STATE-01..04, CLI-01/02/03, MEM-01/02, UX-01/05/06) + the STATE-04 fingerprint-mapping decision (no native stable IDs).
- `.planning/ROADMAP.md` §Phase 2 — goal, 5 success criteria (SC#1 read accuracy + `bw-diff` round-trip; SC#2 midi/device inspect; SC#3 daemon survives bridge reload + stable-ID reconcile + stale watchdog; SC#4 Pi `/analyze` + assumptions[] + state pane; SC#5 durable/ephemeral memory boundary), UI hint: yes, named research items.
- `.claude/AGENTS.md` — repo engineering rules referenced throughout Phase 1 code (NodeNext ESM `.js` import rule, Node ≥22.19, TS 5.7+, Ajv-2020 named-import quirk, standalone-compiled validators, loopback-only bind). Read before any daemon-side work.

### Seed design (the vision this phase realizes)
- `docs/seed.md` §"The data model" (§A raw project state, §B derived composition state, §C intent state, §D patch & diff model) — the raw-state shape the daemon normalizes against (STATE-01) and the intent shape (D-09). Note §B's analyzers are later phases (D-08).
- `docs/seed.md` §"Proposed local protocol" — the event/request/response/`apply.patch` examples the frozen schemas generalize.
- `docs/seed.md` §"Pi package design" — the six skills, slash commands, and four TUI panes; Phase 2 ships `/analyze` + the state pane only.
- `docs/seed.md` §"MVP build plan / Milestone 1" — the M1 ship list (extension, daemon, `bw-focus export`, `bw-midi inspect`, `bw-device inspect`, `bw-project summary`, Pi `/analyze`) and success bar.

### To Be Produced (this phase's outputs)
- The real Java `.bwextension` bridge (replaces `spike/`; build/packaging de-risk deferred from Phase 1 D-07 — Gradle + ServiceLoader `META-INF/services/com.bitwig.extension.ExtensionDefinition`).
- The raw→derived normalizer pipeline + STATE-04 fingerprint-mapping + reconcile/stale-watchdog (SC#3).
- The multicall `bw-brain` CLI + `bw-*` shims (5 live read/diff commands + 3 stubs).
- The Pi pack (`/analyze` skill + slash command + state pane) wrapping the CLI.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`Transport` interface + `TcpServerTransport` + `StdioTransport`** (`daemon/src/transport/`) — the transport-agnostic byte-stream abstraction (D-05). The new daemon-local CLI-query listener (D-07) is a NEW transport peer implementing this same interface; do NOT couple the CLI query path to `net.Socket` directly.
- **`createReader` framing orchestrator** (`daemon/src/protocol/reader.ts`) — transport → LineBuffer → JSON.parse → Ajv(envelope) → bounded-queue → onMessage, with drop-oldest-observational / never-drop-edits backpressure. Reuse for the CLI-query channel if it speaks JSON-Lines; the Ajv-compiled-once-at-boot + `$id`-based `$ref` resolution pattern is the canonical way to add any new schema.
- **`LineBuffer` + handshake** (`daemon/src/protocol/`) — atomic-line reassembly + version handshake; the bridge's `get.*` request/response cycle (D-03) rides these.
- **Codegen: `scripts/gen-types.mjs`** — the `$id`-aware JSON-Schema → TS bundler (json2ts couldn't resolve cross-file `$refs` against the absolute `https` `$id` scheme). Any new schemas (raw-state, intent, CLI query/response) MUST go through this, not literal json2ts.
- **`scripts/check-capabilities-doc.mjs`** — the validator that kept `docs/bitwig-capabilities.md` design-ready; pattern to mirror if Phase 2 produces a design-lock doc.

### Established Patterns
- **Ajv 2020-12 at the boundary, compiled once** — `import { Ajv2020 } from "ajv/dist/2020.js"` (named + `.js` ext under NodeNext; ajv 8.20 has no exports map). `addFormats` is deliberately NOT used (no frozen schema uses `format`; CJS interop not callable as static NodeNext import). Validate at every boundary, never let invalid structures reach handler logic.
- **Loopback-only security invariant (Pitfall 5)** — `TcpServerTransport` REFUSES any non-loopback host and always passes `127.0.0.1` to `listen` (never omitted → never the `0.0.0.0` wildcard). Replicate on the new CLI-query listener (D-07).
- **NodeNext ESM `.js`-import rule** — all relative imports in `.ts` sources MUST end in `.js` (runtime requirement even though source is `.ts`). `resolveJsonModule: true` for `with { type: "json" }` schema imports.
- **Trust-spine at schema level** — `edit.schema.json` requires `payload.undoLabel` (minLength 1) + `payload.operations` (minItems 1); the bridge can refuse unlabeled edits by validation alone. Phase 2's `get.*` responses inherit the same "validate at the boundary" discipline.
- **Stack:** Node ≥22.19, TS 5.7+, strict, vitest 4.1.9, commander 15, ajv 8.20. `daemon/package.json` is ESM (`"type": "module"`).

### Integration Points
- **Bridge ↔ daemon:** `127.0.0.1:7878` TCP, JSON-Lines. Phase 2 adds the bridge's `get.*` request/response handling (D-03 pull path) on top of the existing event push.
- **CLI ↔ daemon:** NEW daemon-local channel (D-07), separate from port 7878. The CLI is a thin client.
- **Pi ↔ CLI:** the Pi pack shells out to the `bw-*` CLI commands (D-12); no direct Pi↔daemon path.
- **Memory:** `.bw-brain/` durable store (`state-cache.json`, `intent.json`, …) written by the daemon; ephemeral session memory stays in Pi, never crosses into durable (MEM-02 hard boundary, SC#5).

</code_context>

<specifics>
## Specific Ideas

- The user's recurring stance — *"below-threshold = refuse rather than guess"* (sections, transforms, PROJECT) — governs the M1 `/analyze` floor (D-10): with no analyzers, `/analyze` describes + points at read commands rather than inventing critique. The same stance is why no analyzer is pulled forward (D-08) and why intent is user-authored not inferred (D-09).
- *"Accurate first; creative later"* (PROJECT Core Value) is the explicit reason M1 delivers the *substrate* (pipeline + memory boundary + CLI contract + Pi shell) and leaves every musical-judgment analyzer to P3–P5.
- SC#1's *"bw-diff round-trips 100%"* was treated as binding: it's the reason `bw-diff` is promoted to a live M1 read command (read-only state-vs-state diff) rather than left as an M2 patch-diff stub (D-05).

</specifics>

<deferred>
## Deferred Ideas

- **Stable-ID reconcile + watchdog-stale semantics (SC#3 / STATE-04) deep-dive** — offered as a bridge-area follow-up, not selected. The fingerprint-mapping *design path* is locked from Phase 1 (name + type + neighbors + content hash; required because Bitwig exposes no native id). The exact reconcile-on-reconnect + stale-watchdog behavior is within Phase 2's domain and is left for the researcher/planner against SC#3 — not deferred to a later phase, just not pre-decided here.
- **Java bridge build/packaging (Gradle, `bridge/` source location, ServiceLoader assembly, install)** — offered as a bridge-area follow-up, not selected. This is the Phase-1 D-07 de-risk now landing in Phase 2; the mechanics are left to research/planning.
- **Daemon-local query channel shape (D-07)**, **analyzer-plugin interface (D-08)**, **`assumptions[]` schema (D-10)**, **intent-edit UX (D-09)**, **TrackBank page size (D-01)**, **Pi package location/discovery (D-12)** — all flagged as the agent's discretion above; within Phase 2 scope, intentionally handed to research/planning rather than locked by the user.

None of these are new capabilities — all are within Phase 2's domain, intentionally left for the research/planning steps that follow.

</deferred>

---

*Phase: 2-Read-Only Context Foundation (M1)*
*Context gathered: 2026-06-27*
