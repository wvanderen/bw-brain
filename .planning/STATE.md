---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1
current_phase_name: Schema & IPC Spike
status: ready-to-verify
stopped_at: Phase 1 spike de-risked — SC#1 + SC#3 PROVEN LIVE (Java .bwextension, raw TCP confirmed end-to-end). All architectural unknowns resolved (no labelled-undo, no native stable-IDs, NoteStep surface, JS has no I/O). Behavioral probes (undo coalescing, note round-trip, automation target) intentionally deferred to pre-Phase-3 (recorded in docs/bitwig-capabilities.md). Ready for /gsd-verify-work.
last_updated: "2026-06-26T21:05:00Z"
last_activity: 2026-06-26
last_activity_desc: Phase 1 wrapped — transport + contract de-risked; behavioral probes deferred to pre-Phase-3; ready for /gsd-verify-work
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 3
  completed_plans: 2
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-25)

**Core value:** The assistant reliably understands and describes the selected Bitwig context and can only change the project through small, previewable, reversible, daemon-authoritative patches — so it never wrecks the song. Accurate first; creative later.
**Current focus:** Phase 1 — Schema & IPC Spike

## Current Position

Phase: 1 (Schema & IPC Spike) — DE-RISKED; ready for /gsd-verify-work
Plan: 3 of 3 — all complete (01-03 spike goal achieved: TCP proven + contract frozen + capability surfaces verified)
Status: Phase 1's purpose is achieved. SC#1 + SC#3 proven live via a Java `.bwextension` pivot (raw `java.net` TCP confirmed end-to-end; the JS control-surface `host` has no networking/file I/O, so Java is mandatory). Every architectural unknown is resolved against the in-app Javadoc 6.0.6: no labelled-undo API (daemon-authoritative revert confirmed), no native stable-IDs (STATE-04 fingerprint-mapping required), NoteStep-based note surface, `PinnableCursorClip` present, ServiceLoader extension packaging. Behavioral probes (undo-coalescing timing, live NoteStep round-trip, automation target) are intentionally deferred to pre-Phase-3 — recorded in `docs/bitwig-capabilities.md` §Deferred. Next: `/gsd-verify-work` to close Phase 1, then Phase 2 (Read-Only Context Foundation).
Last activity: 2026-06-26 — Phase 1 wrapped; ready for verify

Progress: [█████████░] ~95% — awaits /gsd-verify-work to formally close

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: 17 min
- Total execution time: ~0.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Schema & IPC Spike | 2/3 | 34 min | 17 min |
| 2. Read-Only Context Foundation (M1) | 0/TBD | — | — |
| 3. Reversible MIDI Patching (M2) | 0/TBD | — | — |
| 4. Arrangement Intelligence (M3) | 0/TBD | — | — |
| 5. Automation & Device Workflows (M4) | 0/TBD | — | — |

**Recent Trend:**

- Last 5 plans: 1-01 (19 min), 1-02 (15 min)
- Trend: steady; daemon-side framing pipe landed cleanly on the Plan-01 contract

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 5-phase vertical-slice structure (de-risk spike → M1 → M2 → M3 → M4) honoring accurate-first sequencing; large M1/M2 phases kept as single vertical slices (decomposed into plans rather than split into horizontal layers).
- [Roadmap]: Phase 1 leads with PROBE-01 + PROBE-02 — the single highest-risk structural unknown (Bitwig TCP) gates all bridge work.
- [Roadmap]: UX-06 (assumptions[] field) placed in Phase 2 as a foundational guardrail established from M1.
- [Phase 1 / Plan 01]: Frozen protocol breadth = envelope spine + version handshake + 4 seed-example message shapes (selection.changed, get.selected_clip, {id,ok,payload} response, apply.patch); speculative catalog marked Phase 2-extensible per Pitfall 4. Calibrated against SC#3.
- [Phase 1 / Plan 01]: Trust-spine enforced at schema level — edit.schema.json requires payload.undoLabel (minLength 1) + payload.operations (minItems 1); the bridge can refuse unlabeled edits by validation alone. PROJECT.md guardrail + AGENTS.md line 17.
- [Phase 1 / Plan 01]: Codegen via scripts/gen-types.mjs ($id-aware bundler) instead of the literal json2ts CLI — @apidevtools/json-schema-ref-parser cannot resolve cross-file $refs against the absolute https $id scheme and json2ts compiles each file independently. Contract schemas stay pristine; runtime Ajv resolves $ref by $id natively.
- [Phase 1 / Plan 02] Transport interface is the D-05 spine: the reader consumes ONLY Transport.onMessage/send/close, never net.Socket — TcpServerTransport (loopback) + StdioTransport (fallback) make the kept framing reusable regardless of the Transport Decision Rule outcome.
- [Phase 1 / Plan 02] Loopback bind is constructor-enforced (Pitfall 5): TcpServerTransport throws on any host !== 127.0.0.1 AND always passes the host arg to listen — the all-interfaces wildcard is unreachable. lsof confirms 127.0.0.1-only.
- [Phase 1 / Plan 02] Ajv 2020-12 envelope validator compiled ONCE at module load (standalone-compiled, AGENTS.md 64-65); reader enforces explicit backpressure (Pattern 5): observational events drop-oldest + dropped notice, edits/requests never drop.
- [Phase 1 / Plan 02] Under NodeNext, Ajv 2020-12 must be imported as named { Ajv2020 } from ajv/dist/2020.js (ajv 8.20 ships no exports map; .js ext required). addFormats dropped — no frozen schema uses the format keyword (premise false), and its CJS default-export interop is not callable as a static NodeNext import.
- [Phase 1 / Plan 03] Only Task 1 is autonomous; Tasks 2 (in-app capability probes → docs/bitwig-capabilities.md Observed: fields) and 3 (transport proof + live SC#1 round-trip) are blocking human-verify checkpoints. Observed Bitwig behavior is the spike's OUTPUT (D-02) — never fabricated. Skeleton + throwaway artifacts (spike/bitwig-extension.js + spike/raw-tcp-probe.java + capabilities-doc skeleton) committed as b14a52d; the manual work is documented precisely in 01-03-SUMMARY.md → "Manual Steps Remaining."
- [Phase 1 / Plan 03] Decoupled tracks (RESEARCH.md §The JS-vs-Java Spike Tension): Track A (capability probes via JS — D-07 iteration speed) is in spike/bitwig-extension.js; Track B (transport proof via raw java.net OR the OSC-as-proof fallback) is in spike/raw-tcp-probe.java. SC#1 is never hostage to whether JsApi exposes networking — Track B can use DrivenByMoss's proven OSC server as a stand-in if JDK 21 is not installed.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Bitwig TCP socket access is MEDIUM confidence — must be confirmed before daemon-as-TCP-server commits; stdio-relay fallback ready. (PROBE-02 / Plan 03 Task 3 — PENDING the live round-trip.)
- [Phase 1]: In-app scripting guide is the authoritative API reference and has never been fetched (web searches 404-prone) — must be opened in-app during the spike; record in `docs/bitwig-capabilities.md`. (PROBE-01 / Plan 03 Task 2 — PENDING the in-app probes.)
- [Phase 1 / Plan 03]: JDK 21 is NOT installed. Track B (transport proof) can either (a) install JDK 21 to run spike/raw-tcp-probe.java, or (b) reuse DrivenByMoss's proven OSC server as a transport-proof stand-in (no JDK needed). Choice is part of the Task 3 manual checkpoint. Phase 2 will need JDK 21 regardless.
- [Phase 1 / Plan 03]: PAUSED at human-verify checkpoints. The autonomous executor committed the scaffold (b14a52d) but did NOT fabricate observed Bitwig behavior — every `Observed:` field in docs/bitwig-capabilities.md is a `TODO-in-app` marker. Resume by following the numbered steps in 01-03-SUMMARY.md → "Manual Steps Remaining."

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-26T20:08:25Z
Stopped at: Completed 1-03-PLAN.md Task 1 (autonomous scaffold — b14a52d); Tasks 2 + 3 are BLOCKING human-verify checkpoints (Bitwig Studio + optional JDK 21 required)
Resume file: .planning/phases/01-schema-ipc-spike/01-03-SUMMARY.md (see "Manual Steps Remaining")
