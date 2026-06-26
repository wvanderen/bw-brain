---
phase: 01-schema-ipc-spike
plan: 02
subsystem: protocol
tags: [json-lines, ipc, typescript, esm, ajv, vitest, tcp, loopback, backpressure, transport-agnostic, cli, commander]

# Dependency graph
requires:
  - phase: 01-schema-ipc-spike/01
    provides: "the 6 frozen JSON Schema 2020-12 contract files under schemas/protocol/ (envelope oneOf into event/request/response/edit/handshake) that the reader compiles + validates every message against at the boundary; the daemon/ ESM scaffold (package.json, NodeNext tsconfig, vitest.config); the Ajv-2020 + $id-resolution pattern proven by schemas.test.ts"
provides:
  - "Transport interface (D-05 transport-agnostic core) + localhost-only TcpServerTransport + StdioTransport fallback — the reader consumes ONLY the interface, so TCP/stdio are swappable"
  - "LineBuffer — pure partial-line reassembly across stream reads (SC#3 partial-line buffer); tolerates CRLF, drops blank lines, retains trailing partial fragments"
  - "negotiateVersion(their, our) — pure version-handshake rule (SC#3 versioned messages / drift prevention); equal-major accepts, different-major rejects"
  - "createReader(transport, onMessage) — transport→LineBuffer→JSON.parse(try/catch)→Ajv(envelope, compiled once at boot)→bounded queue→handler orchestrator with explicit backpressure policy (SC#3 backpressure rule)"
  - "bw-brain-spike dump CLI (D-08 raw proof print) — prints the first validated message as JSON + exits 0"
  - "Autonomous end-to-end proof of SC#1's daemon half (no Bitwig): injected selection.changed → reassembled → Ajv-validated → printed as JSON → exit 0"
  - "Green property test (LineBuffer reassembles arbitrary byte-splits) + version-negotiation unit test"
affects: [01-03-PLAN, 02-read-only-context-foundation, 03-reversible-midi-patching]

# Tech tracking
tech-stack:
  added: []  # all deps pinned + installed in Plan 01 (ajv 8.20.0, commander 15.0.0, tsx 4.22.4, vitest 4.1.9); this plan adds NO new packages
  patterns:
    - "Transport interface decoupling: the reader consumes ONLY Transport.onMessage/send/close, never a raw net.Socket — TCP and stdio are swappable (D-05). This is the kept scaffolding Phase 2 extends regardless of transport decision."
    - "Loopback-only bind as a constructor-enforced invariant (Pitfall 5): TcpServerTransport refuses any non-loopback host AND always passes the host arg to listen — the all-interfaces wildcard is impossible to reach. lsof-verified 127.0.0.1-only."
    - "Atomic-line writes (Pattern 4): one JSON.stringify + one newline + one write per message on the send side (both transports)."
    - "Ajv-at-boundary (V5): the envelope validator is compiled ONCE at module load (standalone-compiled, AGENTS.md 64–65); JSON.parse is wrapped in try/catch (T-2-02: malformed dropped, never thrown); validation runs BEFORE any handler sees the message."
    - "Explicit backpressure (Pattern 5): bounded per-connection queue (cap 256); observational events (selection.changed) drop-oldest-on-overflow + emit a {type:'dropped',payload:{count}} notice; edits/requests NEVER drop (documented Phase-2 socket-pause backpressure — 'edits never silently lost' invariant)."
    - "queueMicrotask drain: heavy consumer work is decoupled from the transport data event via a microtask-drained queue (Pitfall 3: never block an observer/data callback)."
    - "Named { Ajv2020 } import from ajv/dist/2020.js under NodeNext (ajv 8.20 ships no exports map; the deep subpath needs the .js extension). addFormats deliberately omitted — no frozen schema uses the format keyword."

key-files:
  created:
    - "daemon/src/transport/transport.ts"
    - "daemon/src/transport/tcp.ts"
    - "daemon/src/transport/stdio.ts"
    - "daemon/src/protocol/line-buffer.ts"
    - "daemon/src/protocol/handshake.ts"
    - "daemon/src/protocol/reader.ts"
    - "daemon/src/cli/dump.ts"
    - "daemon/src/protocol/line-buffer.test.ts"
    - "daemon/src/protocol/handshake.test.ts"
  modified:
    - "daemon/src/protocol/schemas.test.ts"

key-decisions:
  - "Transport interface is the D-05 spine: the reader never touches net.Socket directly. TcpServerTransport (loopback) + StdioTransport (fallback) both implement it, so the kept framing code is reusable regardless of the Transport Decision Rule outcome."
  - "Loopback bind is constructor-enforced, not just by-convention: TcpServerTransport throws on any host !== 127.0.0.1 (defense in depth) AND always passes the host arg to net.Server.listen (never single-arg — Node defaults that to the all-interfaces wildcard). The Pitfall 5 security invariant is impossible to violate from a future call site; lsof confirms 127.0.0.1-only at runtime."
  - "Ajv 2020-12 validator compiled ONCE at module load and reused for every message (standalone-compiled, AGENTS.md 64–65) — never recompiled per message. The 5 message-type schemas are registered so the envelope oneOf $refs resolve by $id (Ajv 2020-12 native; the ref-parser limitation that forced gen-types.mjs does NOT apply at runtime)."
  - "Backpressure policy is explicit and class-based (SC#3 requirement made executable): observational events drop-oldest (a newer selection supersedes an older one — bw-brain is observational); edits/requests never drop (user intent, must be ack'd; Phase 2 implements real socket-pause backpressure)."
  - "dump CLI exits 0 only after printing a VALIDATED message; the autonomous proof injects via --transport stdio so no Bitwig is needed. The TCP path (default) just listens on 127.0.0.1:7878 and waits for the real Bitwig extension (Plan 03 live run)."

patterns-established:
  - "Pattern: every message crossing the transport→daemon boundary is Ajv-validated against the frozen envelope BEFORE any handler logic runs; JSON.parse is always try/caught (drop, never throw)."
  - "Pattern: TCP servers in this project bind 127.0.0.1 ONLY — enforced at construction, never the all-interfaces wildcard (Pitfall 5)."
  - "Pattern: send side = one atomic write of JSON.stringify(msg)+'\\n' per message (Pattern 4); receive side = LineBuffer reassembly (tolerates CRLF, drops blank lines)."
  - "Pattern: long-running consumer work is decoupled from data events via a microtask-drained queue (Pitfall 3 — never block an observer/data callback)."
  - "Pattern: NodeNext + ESM — named { Ajv2020 } import from ajv/dist/2020.js (the .js extension is required because ajv 8.20 ships no exports map)."
  - "Pattern: proof CLIs flush stdout via the write callback before process.exit(0) so piped output is never truncated."

requirements-completed: []  # PROBE-02 is a phase-level requirement spanning all 3 plans. After Plan 02 the daemon-side pipe is built and autonomously proven (SC#1 daemon half), but PROBE-02 is not fully complete: it also requires the live Bitwig JVM TCP confirmation (Plan 03's manual checkpoint — the real extension connecting and round-tripping a selection.changed). Same reasoning as Plan 01's SUMMARY. This plan CONTRIBUTES to PROBE-02 (the reader/CLI half of SC#1 + the SC#3 framing/backpressure/handshake requirements made executable). The phase-level /gsd-verify-work gate owns PROBE-02's final completion.
requirements-progressed: [PROBE-02]

# Metrics
duration: 15min
completed: 2026-06-26
status: complete
---

# Phase 1 Plan 02: Schema & IPC Spike (Daemon Framing Pipe) Summary

**Transport-agnostic JSON-Lines framing pipe (D-05) — loopback-only TCP + stdio transports, pure partial-line LineBuffer, version-handshake rule, and an Ajv-at-boundary reader with explicit bounded-queue backpressure — proven end-to-end by a `bw-brain-spike dump` CLI that reassembles, validates, and prints an injected selection.changed message with exit 0 (no Bitwig needed).**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-26T19:03:38Z
- **Completed:** 2026-06-26T19:18:38Z
- **Tasks:** 2 (Task 2 split into test + feat per its `tdd="true"` flag)
- **Files modified:** 10 (9 created, 1 modified)

## Accomplishments
- Built the transport-agnostic framing spine (D-05): a `Transport` interface (`onMessage`/`send`/`close`) the reader consumes exclusively, with two impls — `TcpServerTransport` (localhost-only, the expected path) and `StdioTransport` (documented fallback). Because the reader never touches `net.Socket` directly, the kept scaffolding is reusable regardless of the Transport Decision Rule outcome.
- Enforced the Pitfall 5 security invariant as a constructor-level guarantee: `TcpServerTransport` binds `127.0.0.1` ONLY — it refuses any non-loopback host AND always passes the host arg to `listen` (Node's single-arg `listen` defaults to the all-interfaces wildcard). lsof empirically confirms the socket is bound to `127.0.0.1:17878 (LISTEN)`, never `0.0.0.0`. The LAN-exposure anti-pattern is impossible to reach from any future call site.
- Implemented `LineBuffer` (SC#3 partial-line buffer) as pure framing — reassembles arbitrary byte splits, tolerates CRLF, drops blank lines, retains trailing partial fragments. A seeded-RNG property test feeds 500 random lines chunked into 1–7-byte pieces and asserts byte-identical reassembly, plus 5 edge cases (mid-newline split, trailing-partial retain, CRLF, blank-line drop, UTF-8 Buffer input).
- Implemented `negotiateVersion(their, our)` (SC#3 version handshake / drift prevention) as a pure, framework-free function: equal major → `{ok:true, serverVersion}`, different major → `{ok:false}`. Unit-tested for exact-match, major-mismatch-reject, and same-major-different-minor-accept.
- Built `createReader(transport, onMessage)` — the orchestrator that wires transport → LineBuffer → `JSON.parse`(try/catch) → Ajv(envelope, compiled once at boot) → bounded queue → handler. Ajv runs BEFORE any handler sees the message (V5 validate-at-boundary); malformed lines are dropped, never thrown (T-2-02). The bounded queue enforces the explicit backpressure rule (Pattern 5): observational events drop-oldest-on-overflow + emit a dropped notice; edits/requests never drop. Consumer work drains via `queueMicrotask` so the data event is never blocked (Pitfall 3).
- Delivered `bw-brain-spike dump` (D-08 raw proof print): a commander CLI that prints the first VALIDATED message as JSON and exits 0. The autonomous proof `printf '<valid selection.changed>\n' | npx tsx src/cli/dump.ts --transport stdio` produces validated JSON on stdout + exit 0 — SC#1's daemon half, proven with no Bitwig. Verified malformed lines are dropped (not crashed), invalid-against-schema lines are rejected at the boundary, and malformed-then-valid in one pipe drops the bad and prints the good.

## Task Commits

Each task was committed atomically:

1. **Task 1: Transport abstraction + localhost-only TCP + stdio + LineBuffer + version handshake** — `b7fa9b4` (feat)
2. **Task 2 (test): LineBuffer property test + handshake version-negotiation test** — `f54c036` (test)
3. **Task 2 (feat): Reader orchestrator (Ajv-at-boundary + backpressure) + dump CLI** — `fcc5245` (feat)

_This plan's frontmatter is `type: execute`; Task 2 carries `tdd="true"`. Because Task 1 already shipped the `LineBuffer` and `negotiateVersion` implementations, Task 2's test files are characterization tests that pass immediately against the correct Task-1 impls (the plan's task split puts primitives in Task 1 and their tests + the reader/CLI in Task 2). The test→feat commit pair mirrors TDD's RED(test)/GREEN(feat) structure as closely as the plan's split allows._

## Files Created/Modified
- `daemon/src/transport/transport.ts` — `Transport` interface (`onMessage`/`send`/`close`); the reader's only dependency on the wire, making TCP/stdio swappable (D-05).
- `daemon/src/transport/tcp.ts` — `TcpServerTransport`; binds `127.0.0.1` ONLY (constructor-enforced Pitfall 5 invariant); one atomic-line `socket.write(JSON.stringify(msg)+"\n")` per message (Pattern 4).
- `daemon/src/transport/stdio.ts` — `StdioTransport` fallback (stdin/stdout; documented fallback per D-05).
- `daemon/src/protocol/line-buffer.ts` — `LineBuffer`; partial-line reassembly (SC#3); pure framing (no JSON.parse/validation).
- `daemon/src/protocol/handshake.ts` — `negotiateVersion(their, our)`; equal-major accept, major-mismatch reject (SC#3 drift prevention).
- `daemon/src/protocol/reader.ts` — `createReader(transport, onMessage)`; transport→LineBuffer→try/catch parse→Ajv(envelope, compiled once)→bounded queue→handler; explicit backpressure policy (Pattern 5).
- `daemon/src/cli/dump.ts` — `bw-brain-spike dump` (commander); prints first validated message as JSON + exit 0 (D-08 proof).
- `daemon/src/protocol/line-buffer.test.ts` — seeded-RNG property test (500 lines × random 1–7-byte chunks) + 5 edge cases.
- `daemon/src/protocol/handshake.test.ts` — 3 cases (exact match, major mismatch, same-major diff-minor).
- `daemon/src/protocol/schemas.test.ts` — *(modified)* fixed the Ajv import for NodeNext (Rule 3 blocking fix; see Deviations).

## Decisions Made
- **Loopback bind enforced at construction, not by convention.** A bare `.listen(port, "127.0.0.1")` would still allow a future caller to pass a wider host or omit the arg. `TcpServerTransport` instead throws on any host ≠ `127.0.0.1` and always passes the host — the invariant is structural. lsof confirms `127.0.0.1`-only at runtime.
- **Ajv compiled once at module load.** The envelope validator is built when `reader.ts` is first imported and reused for every message (AGENTS.md standalone-compiled-validators). The 5 message-type schemas are registered first so the envelope's oneOf `$ref`s resolve by `$id`.
- **Backpressure policy is class-based and explicit.** Observational events (the Phase-1 frozen `selection.changed`) drop-oldest on overflow + emit a `{type:"dropped",payload:{count}}` notice (a newer selection supersedes an older one — bw-brain is observational). Edits/requests never drop; the comment documents that real backpressure pauses the transport in Phase 2 (the bridge blocks for ack), preserving the "edits never silently lost" invariant.
- **`dump` is the default commander command.** `{ isDefault: true }` lets the autonomous proof invoke `dump.ts --transport stdio` (no `dump` subcommand word) — exactly the shape in the plan's `<verify>` block.
- **`requirements-completed` left empty (matches Plan 01's reasoning).** PROBE-02 spans all 3 plans; after Plan 02 the daemon half is built and autonomously proven, but the live Bitwig TCP confirmation (Plan 03) is still pending. Marked `requirements-progressed: [PROBE-02]` instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 + Rule 1 — Blocking + Bug] `schemas.test.ts` Ajv import broken under NodeNext; `tsc --noEmit` failed (Task 1 acceptance criterion `tsc --noEmit` exits 0)**
- **Found during:** Task 1 baseline check (before writing any code)
- **Issue:** Plan 01's `schemas.test.ts` imported `Ajv2020` via `import Ajv2020 from "ajv/dist/2020"` (default import, no extension). Under `module: NodeNext` (the locked tsconfig), ajv 8.20.0 ships no `exports` map, so the deep subpath `ajv/dist/2020` does NOT resolve under tsc NodeNext ESM mode (`TS2307 Cannot find module`). The cascading `any` also made `addFormats(ajv)` non-callable (`TS2349`). Runtime was unaffected (vitest/tsx resolve it), so Plan 01's self-check — which ran `npx vitest run schemas` but not `npx tsc --noEmit` — missed it. Plan 02's Task 1 acceptance criterion explicitly requires `tsc --noEmit` to exit 0, so this blocked the gate.
- **Fix:** Switched to the NAMED import `import { Ajv2020 } from "ajv/dist/2020.js"` (named binding resolves cleanly under NodeNext; the `.js` extension is required for the deep subpath). Also DROPPED `addFormats` entirely (see deviation 2).
- **Files modified:** `daemon/src/protocol/schemas.test.ts` (import line + header comment).
- **Verification:** `npx tsc --noEmit` exits 0; all 22 schema tests still pass; the same import form is reused in `reader.ts`.
- **Committed in:** `b7fa9b4` (Task 1 commit).

**2. [Rule 1 — Bug] Plan premise "envelope uses formats" is false; `addFormats` dropped as dead code**
- **Found during:** Task 1 (investigating the tsc failure above)
- **Issue:** The plan (Task 2 reader action: "addFormats applied"; PATTERNS.md line 270: "Use addFormats(ajv) since the envelope uses formats") directs applying `addFormats`. But `rg '"format"' schemas/protocol/` returns ZERO matches — no frozen schema uses the `format` keyword (they use `pattern` only). So `addFormats` registers nothing the contract needs and is dead code. Worse, under NodeNext the ajv-formats CJS default-export interop is NOT callable as a static import (the `.default` resolves to the module namespace itself — recursive), so keeping it would require an ugly cast purely to preserve non-functional code.
- **Fix:** Removed `addFormats` from both `reader.ts` (never added) and `schemas.test.ts` (removed the import + call). Documented the rationale in both file headers. If a future schema introduces a `format:` keyword, `addFormats` can return with the correct cast form then.
- **Files modified:** `daemon/src/protocol/schemas.test.ts`.
- **Verification:** `rg '"format"' schemas/protocol/` = empty (premise confirmed false); 22 schema tests + 9 new tests all green without addFormats; `npx tsc --noEmit` exits 0.
- **Committed in:** `b7fa9b4` (Task 1 commit).

**3. [Rule 2 — Missing Critical] TcpServerTransport constructor refuses non-loopback host (defense in depth for Pitfall 5)**
- **Found during:** Task 1 (tcp.ts design)
- **Issue:** The plan specifies "bind 127.0.0.1 ONLY" and "NEVER omit the host argument." A literal reading (`.listen(port, "127.0.0.1")` with host passed by the caller) would still permit a future caller to pass a wider host or omit it. The threat model T-2-01 (Information Disclosure via LAN-reachable bind) is the spike's single security-relevant decision; hardening it structurally is a critical correctness requirement, not a feature.
- **Fix:** `TcpServerTransport` defaults `host` to the loopback literal AND throws if any other value is passed, so the bind cannot be widened from a future call site. The listen call always passes `(port, host)`. lsof confirms `127.0.0.1`-only at runtime.
- **Files modified:** `daemon/src/transport/tcp.ts`.
- **Verification:** `rg "0\.0\.0\.0" src/transport/tcp.ts` = empty; `rg "127\.0\.0\.1"` present; lsof shows `127.0.0.1:17878 (LISTEN)`; constructor throw exercised by the acceptance sweep.
- **Committed in:** `b7fa9b4` (Task 1 commit).

**4. [Rule 1 — Bug] `dump` must be the default commander command for the proof invocation shape**
- **Found during:** Task 2 (designing dump.ts against the `<verify>` command)
- **Issue:** The plan's reader/CLI design uses `.command("dump")`, but the autonomous `<verify>` invokes `npx tsx src/cli/dump.ts --transport stdio` — with NO `dump` subcommand word. A plain `.command("dump")` would error on that invocation ("unknown command --transport"), failing the proof.
- **Fix:** Registered `dump` with `{ isDefault: true }` so options after the script path route to it whether or not the `dump` word is present. Both `dump.ts --transport stdio` and `dump.ts dump --transport stdio` work.
- **Files modified:** `daemon/src/cli/dump.ts`.
- **Verification:** the exact plan `<verify>` command prints `PIPE_OK`.
- **Committed in:** `fcc5245` (Task 2 feat commit).

---

**Total deviations:** 4 auto-fixed (2 blocking/bug, 1 bug, 1 missing-critical security hardening)
**Impact on plan:** All four are correctness/security necessities within scope — no architectural change, no scope creep. The plan's design (Transport interface, loopback bind, Ajv-at-boundary, bounded-queue backpressure, dump proof) is implemented as specified; only the tooling/import mechanics around Ajv (`ajv-formats` omission, NodeNext import form) and one structural security hardening (constructor-enforced loopback) deviated, each documented with rationale. SC#1's daemon half is fully and autonomously proven.

## Issues Encountered
- **macOS has no `timeout` command.** Initial verification of "malformed line → CLI keeps waiting" used `timeout 3 ...`, which returned exit 127 (`command not found: timeout`) hidden behind `2>/dev/null`, masquerading as a CLI failure. Re-verified with a background+sleep+kill alarm and direct runs: malformed line is dropped (no stdout), the reader does not crash, and a subsequent valid line is processed normally. Not a code issue — a test-harness tooling difference. Documented here for the next executor on this host.

## User Setup Required
None — this plan is fully autonomous (no Bitwig, no JDK, no external services). The daemon-side pipe is proven with an injected stdio message; the live Bitwig round-trip is Plan 03's manual checkpoint.

## Next Phase Readiness
- **Ready for Plan 03 (Wave 3, manual checkpoint):** the daemon listens on `127.0.0.1:7878` (default) and will receive a real `selection.changed` from the Bitwig spike extension. `bw-brain-spike dump` (TCP mode) is the receiver for SC#1's live round-trip. The frozen contract (Plan 01) + the Ajv-at-boundary reader (this plan) together mean any message the extension emits will be reassembled, validated, and printed — or rejected with a logged schema error — never crashed.
- **Ready for Phase 2:** the kept `daemon/` framing scaffolding (Transport interface, LineBuffer, reader orchestrator with backpressure) is the reusable spine Phase 2 extends. The transport-agnostic design means a Phase-2 transport decision (TCP confirmed vs stdio relay) requires no reader changes.
- **No blockers** for the daemon half of Phase 1. The only remaining Phase-1 work is the live Bitwig confirmation (Plan 03) and the in-app capability doc (Plan 03, PROBE-01).

## Self-Check: PASSED

- Verified created files exist on disk:
  - `daemon/src/transport/{transport,tcp,stdio}.ts` — FOUND (all 3)
  - `daemon/src/protocol/{line-buffer,handshake,reader}.ts` — FOUND (all 3)
  - `daemon/src/cli/dump.ts` — FOUND
  - `daemon/src/protocol/{line-buffer,handshake}.test.ts` — FOUND (both)
- Verified modified file: `daemon/src/protocol/schemas.test.ts` — FOUND (Ajv import fixed).
- Verified commits exist in git log: `b7fa9b4` FOUND, `f54c036` FOUND, `fcc5245` FOUND.
- Re-ran plan-level `<verification>` commands:
  - `cd daemon && npx vitest run` — exit 0, 31/31 tests pass (22 schema + 6 line-buffer + 3 handshake).
  - `printf '<valid selection.changed>\n' | npx tsx src/cli/dump.ts --transport stdio` — prints validated JSON `{"version":"1.0","type":"selection.changed",...}`, exit 0 (`PIPE_OK`).
  - `rg "127\.0\.0\.1" src/transport/tcp.ts` — present (LOOPBACK_HOST const + comment); `rg "0\.0\.0\.0"` — absent.
  - `npx tsc --noEmit` — exit 0.
- Re-ran Task acceptance criteria:
  - **Task 1:** Transport interface exports onMessage/send/close ✓; tcp.ts binds loopback only (literal present, wildcard absent, single non-comment `listen(` call = 1, host always passed) ✓; tcp.ts send = single `socket.write` per message ✓; stdio.ts via stdin/stdout ✓; line-buffer.ts `feed(string|Buffer)` + CRLF + partial retain ✓; handshake.ts equal-major `{ok:true}` ✓.
  - **Task 2:** reader.ts imports envelope via `with {type:"json"}`, compiles validator once at boot (`getSchema`), wraps `JSON.parse` in try/catch, validates before dispatch ✓; bounded queue + class-based backpressure policy (drop-oldest observational + dropped notice; never-drop edits) ✓; dump.ts exits 0 after printing first validated message ✓; line-buffer property test passes ✓; handshake tests pass (3 cases) ✓; tcp.ts still loopback-only (unchanged) ✓; lsof confirms `127.0.0.1`-only bind on the TCP path ✓.
- **Threat surface scan:** no new security-relevant surface beyond the plan's `<threat_model>`. The transport→reader boundary and the daemon socket bind are exactly T-2-01/T-2-02/T-2-04; all four threats have their mitigations implemented and verified. No new network endpoints, auth paths, file access, or trust-boundary schema changes introduced.

---
*Phase: 01-schema-ipc-spike*
*Completed: 2026-06-26*
