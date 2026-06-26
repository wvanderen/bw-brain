# Walking Skeleton — bw-brain

**Phase:** 1 (Schema & IPC Spike)
**Generated:** 2026-06-26

> This is a **de-risk spike**, not a web app. The skeleton is adapted to the Bitwig-extension → transport → daemon → CLI pipe per the spike domain framing — there is no Next.js, no SQL DB, no browser UI, no deploy target.

## Capability Proven End-to-End

A throwaway Bitwig extension emits one real `selection.changed` event that flows through the daemon (reassembly → Ajv validation → backpressure-governed queue) and prints as validated JSON at the `bw-brain-spike dump` CLI — exercising the full pipe with real data, not stubs (ROADMAP SC#1).

The daemon half of that proof is fully autonomous (an injected line round-trips to a validated print in Plan 02); the live Bitwig-originated round-trip is the manual checkpoint in Plan 03 because observed Bitwig behavior is the spike's *output* and the in-app scripting guide 404s externally (D-02, STATE.md blocker).

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework (daemon + CLI) | Node.js (22.22.3 present; 24 LTS target) + TypeScript 5.7+, native ESM + NodeNext + `.js` import extensions | Matches the Pi/OpenClaw ecosystem; Node `net.Server`/`net.Socket` prove localhost TCP JSON-Lines; non-negotiable for the patch discriminated-union model (AGENTS.md locked stack) |
| Framework (Bitwig extension) | Throwaway **JavaScript** Controller Script (JsApi) for capability probes (D-07); transport proof decoupled into Track B (raw-TCP Java probe or OSC-as-proof) | JS iteration speed for probe-heavy work; the transport proof is NOT coupled to JsApi because its networking surface is `[ASSUMED]` (sandboxed subset — RESEARCH.md §JS-vs-Java Tension) |
| "Data layer" (wire contract) | JSON Lines (`\n`-terminated, UTF-8) over localhost transport, versioned envelope (`type`/`id`/`timestamp`/`ok`/`payload`) frozen as JSON Schema 2020-12 | Cross-language source of truth (Java bridge + TS daemon + CLI all bind FROM the `.json` files); `nc <loopback> <port> \| jq -c` inspectable; jsonlines.org-compliant |
| Transport | TCP confirmed-in-spike (expected) OR stdio-relay / OSC-as-proof fallback (documented, with rationale) | PROJECT.md constraint "localhost TCP or stdio"; Bitwig gives the extension no stdin/stdout so TCP is the only long-running option (AGENTS.md line 125); the spike confirms the residual raw-TCP question (A1) |
| Validation | Ajv 8.20.0 + JSON Schema 2020-12, pre-compiled at the daemon boundary | Fastest, standard-compliant; JSON Schema is the single cross-language contract (not Zod/TypeBox on the wire) |
| Directory layout | `daemon/` (KEPT scaffold), `schemas/protocol/` (frozen contract), `spike/` (THROWAWAY, deleted Phase 2), `docs/bitwig-capabilities.md` (KEPT design input) | D-06 — physical separation makes "reuse vs delete" unambiguous; real dirs from day one |
| Deployment target | Local full-stack run command (no remote deploy) | Local-first software; the "deploy" is a documented sequence: start Bitwig w/ throwaway extension → start daemon → run `bw-brain-spike dump` |
| Security invariants | Loopback-only bind (never the all-interfaces wildcard); Ajv-validate-at-boundary; version handshake rejects major drift | The two non-negotiable controls even in the spike (RESEARCH.md §Security, Pitfall 5, V5) |

## Stack Touched in Phase 1

- [x] **Project scaffold** — `daemon/` (package.json, tsconfig.json, vitest.config.ts), `schemas/protocol/`, `spike/`, single pinned `npm install` (Plan 01)
- [x] **"Routing"** — the `Transport` interface + `LineBuffer` reader: the route a message travels from socket bytes to validated handler dispatch (Plan 02)
- [x] **"Database" — one real read AND write** — one real event **read** (LineBuffer reassembles a real `selection.changed` from the extension) AND the CLI **write** (prints validated JSON to stdout). Both halves exercised with real data, not stubs (Plans 02 autonomous + 03 live)
- [x] **"UI" — one interactive element wired to the API** — the raw `bw-brain-spike dump` CLI command (D-08) that consumes the daemon and prints the validated event — the user-facing interaction surface for the spike
- [x] **"Deployment" — documented local full-stack run command** — the Bitwig → daemon → `dump` sequence that exercises the full stack (local-first; no deploy target)

## Out of Scope (Deferred to Later Slices)

Be explicit — this prevents future phases from re-litigating Phase 1's deliberate minimalism.

- **Production bridge** — no hardened Java `.bwextension`, no Maven build/packaging, no jackson IPC (deferred to Phase 2 per D-07).
- **Real CLI commands** — no `bw-focus`/`bw-project`/`bw-midi` etc.; only the throwaway `bw-brain-spike dump` proof print exists (Phase 2 designs the real commands fresh, D-08).
- **Durable project memory** — no `.bw-brain/` directory (no `state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl` until Phase 2 MEM-01).
- **Derived composition state** — no sections/track-roles/motifs/energy/automation-salience analysis (Phases 2–5).
- **Edit pipeline** — the `apply.patch` schema is *frozen* in Phase 1 (so the contract is complete) but no patch is *executed*; preview/diff/apply/undo land in Phase 3.
- **Pi / OpenClaw UX** — no skills, no TUI panes, no slash commands (Phases 2–5).
- **Full protocol catalog** — only the envelope + handshake + 4 seed-example message shapes are frozen; the rest is Phase 2-extensible (Pitfall 4 — do not over-freeze from a 1-event spike).
- **JDK 21 install** — Java is absent on this machine; Phase 2 (production bridge) needs it; the spike absorbs the absence via D-07 (JS) + the OSC-as-proof fallback for Track B.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions (the frozen contract + transport-agnostic daemon + loopback-only/Ajv-at-boundary invariants are the spine):

- **Phase 2 (M1 — Read-Only Context Foundation):** replace the throwaway extension with a real Java `.bwextension` bridge; normalize raw state; ship the real read-only CLI commands + Pi `/analyze`; bootstrap `.bw-brain/` durable memory. Builds directly on the frozen contract + daemon reader.
- **Phase 3 (M2 — Reversible MIDI Patching):** execute the `apply.patch` contract that Phase 1 froze — patch/diff/preview/apply/risk + daemon-authoritative undo (the capabilities-doc undo finding directly shapes the revert model).
- **Phase 4 (M3 — Arrangement Intelligence):** project-level critique (sections/repetition/energy/transitions/track-roles) over the normalized state.
- **Phase 5 (M4 — Automation & Device Workflows):** automation salience + macro proposals + bounded automation generation.
