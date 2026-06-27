---
phase: 02-read-only-context-foundation-m1
plan: 03b
subsystem: state
tags: [state-01, state-02, state-03, state-04, mem-02, sc3, sc5, d-07, d-08, d-09, uds, unix-domain-socket, ajv, stale-watchdog, analyzer-registry, intent-store, normalizer, boundary, cli-query]

# Dependency graph
requires:
  - phase: 02-read-only-context-foundation-m1 (plan 01)
    provides: "schemas/project-state.schema.json + schemas/intent.schema.json + schemas/cli-query/{query,result}.schema.json + daemon/src/gen/{project-state,intent,query,result}.ts — the frozen wire contracts the normalizer, intent-store, and query-server validate against"
  - phase: 02-read-only-context-foundation-m1 (plan 03a)
    provides: "daemon/src/state/reconcile.ts (RawState alias) — the type the normalizer + analyzer-registry + query-server consume; the proven atomicWriteJson/state-cache primitives the stale-watchdog consumes the truth of"
  - phase: 02-read-only-context-foundation-m1 (plan 04)
    provides: "the CLI UDS query-client contract (daemon/src/cli/query-client.ts) — defines the wire shape this server speaks; 02-04's CLI is the client, 02-03b is the server side"
provides:
  - "daemon/src/state/stale-watchdog.ts — StaleWatchdog (live|stale|disconnected) + assertFresh() M2 edit gate + STALE_THRESHOLD_MS/RECONNECT_GRACE_MS (SC#3 surfacing)"
  - "daemon/src/state/analyzer-registry.ts — Analyzer/DerivedField/AnalyzeContext/Assumption interfaces + AnalyzerRegistry.runAll (drops confidence<0.5) + M1_ANALYZERS=[IntentAnalyzer] (D-08 framework-only)"
  - "daemon/src/state/intent-store.ts — loadIntent(path): atomic validated read of .bw-brain/intent.json, absent->null, invalid->structured error, NO write path (STATE-03/D-09)"
  - "daemon/src/ingest/normalizer.ts — normalize(payload): RawState | null second-stage validator against project-state.schema.json (STATE-01, Pitfall 2 regex gate, drop-never-throw)"
  - "daemon/src/store/boundary.ts — checkMemoryBoundary(schema): string[] MEM-02/SC#5 allowlist gate + main() guard"
  - "daemon/src/transport/uds.ts — UnixDomainSocketServerTransport implementing Transport; chmod 0o600 after listen via ready promise; refuses-to-start on failure; close unlinks (D-07/Pitfall 5)"
  - "daemon/src/query/query-server.ts — startQueryServer(deps): UDS listener + cli-query Ajv validation + op dispatch + stateFreshness+assumptions surfacing (D-07)"
affects: [02-05, 03, 05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StaleWatchdog three-state machine (live/stale/disconnected) with Pitfall 6 discipline — stale != disconnected; assertFresh() is the M2 edit gate wired but unreachable in M1"
    - "Analyzer registry allowlist-filter: runAll drops any DerivedField with confidence < CONFIDENCE_THRESHOLD (0.5) — the 'below-threshold = refuse rather than guess' stance made executable"
    - "UDS transport async-constructor-via-ready-promise: TS constructors cannot be async, so listen+chmod surface through a `ready` promise that rejects + closes the server on failure (the refuses-to-start guard)"
    - "MEM-02 boundary as an ALLOWLIST (not denylist): every cli-query op must be in ALLOWED_READ_ONLY_OPS; novel ephemeral-write ops fail by default — stronger than a denylist pattern-match"
    - "Validate-at-boundary second stage: normalizer is the SECOND Ajv gate (after the envelope reader); a payload that passed the envelope but carries a slot-index sid drops here (Pitfall 2)"
    - "query-server LineBuffer framing reuse: the D-05 reader spine (LineBuffer + parse + Ajv) is reused for the cli-query channel with a different schema set registered"

key-files:
  created:
    - "daemon/src/state/stale-watchdog.ts"
    - "daemon/src/state/stale-watchdog.test.ts"
    - "daemon/src/state/analyzer-registry.ts"
    - "daemon/src/state/analyzer-registry.test.ts"
    - "daemon/src/state/intent-store.ts"
    - "daemon/src/state/intent-store.test.ts"
    - "daemon/src/ingest/normalizer.ts"
    - "daemon/src/ingest/normalizer.test.ts"
    - "daemon/src/store/boundary.ts"
    - "daemon/src/store/boundary.test.ts"
    - "daemon/src/transport/uds.ts"
    - "daemon/src/transport/uds.test.ts"
    - "daemon/src/query/query-server.ts"
    - "daemon/src/query/query-server.test.ts"
  modified: []

key-decisions:
  - "loadIntent returns the FULL ProjectIntent object (version + projectIntent), not parsed.projectIntent. The plan action said 'return parsed.projectIntent' but (a) the declared return type is Promise<ProjectIntent | null> and gen ProjectIntent IS the full {version, projectIntent:{summary,...}} object, (b) analyzer-registry ctx.intent: ProjectIntent | null and query-server getIntent(): ProjectIntent | null both type-flow the full object, (c) returning the inner field would break the whole type chain. The plan's literal text had a type inconsistency; the full-object return is type-correct and matches the gen type. Callers access intent via result.projectIntent.summary."
  - "boundary.ts uses an ALLOWLIST (ALLOWED_READ_ONLY_OPS) rather than a denylist of ephemeral-write patterns. The plan said 'if NOT one of the allowed durable-interacting ops, push an error' — an allowlist IS the literal reading, and it's stronger than pattern-matching: a novel op like 'experiment.cache.flush' fails by default rather than needing its pattern enumerated. The structural QuerySchemaShape type (vs the plan's `typeof querySchema`) lets the counter-test pass a FAKE schema literal."
  - "UDS constructor exposes a `ready: Promise<void>` (TS constructors cannot be async). listen kicks off synchronously; chmod 0o600 runs on the 'listening' event; either failure closes the server + rejects ready. This honors the plan's 'constructor refuses to start if chmod fails' semantics — the refusal surfaces at the first `await transport.ready`. Callers MUST await ready before relying on the socket."
  - "query-server invalid_query arm carries availableFrom:'M2'. result.schema.json's allOf FORCES availableFrom on every ok:false result; the ok:false arm was designed for not_implemented stubs but the schema doesn't distinguish. M1's error-response taxonomy is austere — invalid_query reuses the stub arm. A richer error taxonomy (availableFrom optional on non-stub errors) is a future schema evolution."
  - "getState()===null returns ok:true with payload OMITTED (not null). result.schema.json declares payload as type:'object' when present, so null would fail validation; the field is optional, so omission is schema-valid. The response carries the 'bridge not connected' assumption + the watchdog's (likely disconnected) freshness. This is the honest M1 floor: daemon up, bridge down, CLI gets a structured answer."
  - "'diff' op routed to the not_implemented default arm. Per 02-04, bw-diff is a PURE client-side state-vs-state diff (no daemon query) — the daemon has no live diff handler in M1. The op is in the query enum (boundary allows it) but the daemon treats it as not-served. Server-side diff is a future concern."
  - "RawState imported from ../state/reconcile.js (02-03a's `type RawState = ProjectState` alias) rather than re-defined in each consumer. Single source of truth for the alias; DRY across normalizer/analyzer-registry/query-server."

patterns-established:
  - "Pattern: every CLI result carries stateFreshness from watchdog.tick() (SC#3) + assumptions[] on derived-field results (UX-06) — enforced structurally in query-server, not per-op"
  - "Pattern: the MEM-02 boundary is an allowlist gate with a main() guard (run via tsx/node) so it can be invoked ad-hoc AND in the vitest suite — a structural validator returning errors[] (mirrors check-capabilities-doc.mjs)"
  - "Pattern: framework-only analyzer registry — M1 ships exactly ONE analyzer (IntentAnalyzer); Phases 3-5 plug section/role/motif/energy/automation analyzers into the same Analyzer interface without touching the registry"

requirements-completed: [STATE-01, STATE-02, STATE-03, MEM-02, CLI-01]

# Metrics
duration: 10 min
completed: 2026-06-27
status: complete
---

# Phase 02 Plan 03b: Daemon Stateful Layer + D-07 UDS Query Channel Summary

**Seven new daemon modules — stale-watchdog (SC#3 freshness), analyzer-registry (D-08 framework + IntentAnalyzer only), intent-store (STATE-03 atomic read), normalizer (STATE-01 second-stage validator), boundary (MEM-02 allowlist gate), UDS transport (0600-mode listener), query-server (cli-query dispatch) — with 82 new tests, all green and consuming the 02-03a trust-spine primitives unchanged.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-27T21:36:51Z
- **Completed:** 2026-06-27T21:46:46Z
- **Tasks:** 2 (both TDD: RED → GREEN; no REFACTOR needed)
- **Files created:** 14 (7 source + 7 test)

## Accomplishments
- Shipped the daemon's stateful layer that consumes 02-03a's proven trust-spine primitives (fingerprint/reconcile/atomicWriteJson/state-cache) unchanged: the stale-watchdog reads the SC#3 truth below it and surfaces stateFreshness live|stale|disconnected on every CLI result.
- The analyzer framework ships EMPTY-but-pluggable with EXACTLY ONE analyzer (IntentAnalyzer) — D-08 defense verified by `M1_ANALYZERS.length === 1` and a grep proving zero sections/motifs/roles/energy/automation analyzers are registered.
- STATE-01 normalizer is the second-stage schema gate: a payload that passed the envelope but carries a slot-index trackSid (`trk_5`) drops here (Pitfall 2 regex gate). Invalid payloads drop + log, never throw (Shared Pattern E).
- STATE-03 intent-store does an atomic validated read of `.bw-brain/intent.json`: absent → null (NO inference, NO defaults — D-09), invalid → structured error with the Ajv errors. NO write path exists (M1 read-only; verified by grep).
- MEM-02 boundary is an allowlist gate: `checkMemoryBoundary(querySchema)` returns `[]` for the real schema and a non-empty errors array for a fake schema with `experiment.save`. The main() guard runs the gate directly (tsx → exit 0).
- D-07 UDS listener: `chmod(socketPath, 0o600)` runs immediately after listen via the `ready` promise; the test asserts `(statSync(socketPath).mode & 0o777) === 0o600` (Pitfall 5 UDS-form). A real net.createConnection client round-trips an atomic-line write. close() unlinks the socket file.
- The query-server speaks the cli-query contract end-to-end: Ajv-validates inbound queries, dispatches the 5 live ops with ok:true + payload + assumptions[], routes unknown/diff ops to not_implemented, and emits invalid_query for malformed input. EVERY result carries stateFreshness (SC#3); the result.schema.json allOf gates are verified (ok:false forbids payload; ok:true forbids error/availableFrom).
- Full daemon suite: 206/206 green (no Phase-1 / 02-01 / 02-03a / 02-04 regressions); `tsc --noEmit` clean under NodeNext strict.

## Task Commits

Each task was committed atomically (both TDD: RED → GREEN):

1. **Task 1 (RED): failing tests for stateful layer + MEM-02 boundary (5 test files)** — `e37a8df` (test)
2. **Task 1 (GREEN): stale-watchdog + analyzer-registry + intent-store + normalizer + boundary** — `6239e68` (feat)
3. **Task 2 (RED): failing tests for UDS transport + query-server (2 test files)** — `da8e8e6` (test)
4. **Task 2 (GREEN): UDS transport + cli-query server** — `5deb3c9` (feat)

_No REFACTOR commits — both GREEN implementations are minimal and direct._

## Files Created/Modified
- `daemon/src/state/stale-watchdog.ts` — `Freshness` type (3 values), `STALE_THRESHOLD_MS=5000`, `RECONNECT_GRACE_MS=60000`, `StaleWatchdog` class (onBridgeMessage/onBridgeDisconnect/tick/assertFresh). Pitfall 6 three-state discipline.
- `daemon/src/state/stale-watchdog.test.ts` — 15 tests: every transition via fake timers, threshold boundary, assertFresh throws on stale+disconnected, constants pinned.
- `daemon/src/state/analyzer-registry.ts` — `Analyzer`/`DerivedField`/`AnalyzeContext`/`Assumption` interfaces, `CONFIDENCE_THRESHOLD=0.5`, `AnalyzerRegistry` (register/runAll with below-threshold refuse), `IntentAnalyzer`, `M1_ANALYZERS=[IntentAnalyzer]`.
- `daemon/src/state/analyzer-registry.test.ts` — 14 tests: M1_ANALYZERS.length===1 (D-08), below-threshold refuse, borderline-at-threshold kept, purity.
- `daemon/src/state/intent-store.ts` — `loadIntent(path)`: readFile → ENOENT→null (D-09), JSON.parse, Ajv validate → structured error, return full ProjectIntent. No write path.
- `daemon/src/state/intent-store.test.ts` — 9 tests: absent→null (no default), valid→ProjectIntent, invalid→structured error, blank-summary rejection, nested .bw-brain/ layout.
- `daemon/src/ingest/normalizer.ts` — `normalize(payload)`: Ajv(project-state.schema) → return RawState | null (drop+log on invalid).
- `daemon/src/ingest/normalizer.test.ts` — 15 tests: valid→RawState, missing-required→null, Pitfall 2 slot-index sids (trk_5/clip_19/dev_2)→null, automation maxItems 0 (D-04), drop-never-throw.
- `daemon/src/store/boundary.ts` — `checkMemoryBoundary(schema)`: allowlist gate (ALLOWED_READ_ONLY_OPS) + main() guard (isMain via import.meta.url).
- `daemon/src/store/boundary.test.ts` — 8 tests: real schema passes, fake experiment.save fails, empty/subset enum edge cases, one-error-per-violation.
- `daemon/src/transport/uds.ts` — `UnixDomainSocketServerTransport implements Transport`; `ready` promise (listen→chmod 0o600); send atomic-line per socket; close destroys + unlinks.
- `daemon/src/transport/uds.test.ts` — 8 tests: socket created, mode===0o600 (Pitfall 5), real client round-trip, onMessage feed, close unlinks, send-throws-no-client, constructor-refuses-on-bad-path.
- `daemon/src/query/query-server.ts` — `startQueryServer(deps)`: LineBuffer→parse→Ajv(query.schema)→op dispatch; 5 live ops ok:true+payload+assumptions; not_implemented + invalid_query arms; getState()===null ok:true no-payload; stateFreshness on every result.
- `daemon/src/query/query-server.test.ts` — 15 tests: each live op, not_implemented default, invalid_query (missing-op + non-JSON), stale/disconnected freshness surfacing, getState-null, UX-06 assumptions on every ok:true, allOf gates.

## Decisions Made
See `key-decisions` frontmatter. Summary:
- **loadIntent returns full ProjectIntent** (not parsed.projectIntent) — return type + downstream ctx.intent typing require the full object; plan's literal text had a type inconsistency (Rule 1).
- **boundary is an allowlist** (not denylist) — stronger MEM-02 gate; structural QuerySchemaShape type for testability.
- **UDS `ready` promise** — TS constructors can't be async; chmod/listen failures reject ready + close server.
- **invalid_query carries availableFrom:"M2"** — result.schema.json allOf forces it on every ok:false.
- **getState()===null → payload omitted** (not null) — schema declares payload type:"object"; omission is schema-valid.
- **"diff" op → not_implemented** — bw-diff is client-side in M1 (02-04); daemon has no live diff handler.
- **RawState imported from reconcile.ts** — single source for the alias, DRY.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] loadIntent return shape (full ProjectIntent, not parsed.projectIntent)**
- **Found during:** Task 1 GREEN (writing intent-store.ts)
- **Issue:** The plan action said "else return parsed.projectIntent" but the declared return type is `Promise<ProjectIntent | null>` and the gen `ProjectIntent` is the full `{version, projectIntent:{summary,...}}` object (the schema's `$comment` calls it the ProjectIntent contract). Returning only the inner field would (a) not match the return type, (b) break analyzer-registry's `ctx.intent: ProjectIntent | null` and query-server's `getIntent(): ProjectIntent | null` which type-flow the full object. The plan's literal text had a type inconsistency.
- **Fix:** `return parsed as ProjectIntent` (the full validated file object). Callers access intent via `result.projectIntent.summary`. Documented in the intent-store.ts header.
- **Files modified:** daemon/src/state/intent-store.ts
- **Verification:** 9/9 intent-store tests pass; the "valid intent.json -> ProjectIntent" test asserts `result.projectIntent.summary`; tsc clean.
- **Committed in:** 6239e68 (Task 1 GREEN)

**2. [Rule 1 - Bug] stale-watchdog.test tick() before assertFresh**
- **Found during:** Task 1 GREEN (first vitest run — 1 test failed)
- **Issue:** The "error message names the offending freshness state" test called `assertFresh()` after `advanceTimersByTime(STALE_THRESHOLD_MS+1)` WITHOUT calling `tick()` first. `assertFresh()` checks the STORED `freshness` field, which only transitions live→stale via `tick()`. Without the tick, freshness stayed "live" and assertFresh didn't throw → `caught` stayed undefined → test failed.
- **Fix:** Added `expect(w.tick()).toBe("stale")` before the assertFresh() try/catch so the stored freshness transitions first. The implementation was correct; the test had a logic error.
- **Files modified:** daemon/src/state/stale-watchdog.test.ts
- **Verification:** 15/15 stale-watchdog tests pass; the implementation is unchanged.
- **Committed in:** 6239e68 (Task 1 GREEN)

**3. [Rule 1 - Bug] normalizer.test ProjectState→Record cast**
- **Found during:** Task 1 GREEN (tsc --noEmit)
- **Issue:** The "missing required field" tests cast `validRaw() as Record<string, unknown>` to `delete` a field. `ProjectState` has no index signature, so tsc rejected the direct cast (TS2352).
- **Fix:** Cast through `unknown` first: `validRaw() as unknown as Record<string, unknown>`. The delete-then-normalize pattern is unchanged.
- **Files modified:** daemon/src/ingest/normalizer.test.ts
- **Verification:** tsc clean; 15/15 normalizer tests pass.
- **Committed in:** 6239e68 (Task 1 GREEN)

**4. [Rule 1 - Bug] uds.test chunk type guard (unknown → Buffer cast)**
- **Found during:** Task 2 GREEN (tsc --noEmit)
- **Issue:** The onMessage handler did `chunk.toString()` where `chunk: unknown` (Transport.onMessage passes unknown). tsc rejected the call on unknown (TS18046).
- **Fix:** `typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8")` — a proper type guard.
- **Files modified:** daemon/src/transport/uds.test.ts
- **Verification:** tsc clean; 8/8 uds tests pass.
- **Committed in:** 5deb3c9 (Task 2 GREEN)

**5. [Rule 2 - Missing Critical] boundary.ts allowlist (stronger than the plan's literal allowlist reading)**
- **Found during:** Task 1 GREEN (designing the gate)
- **Issue:** The plan said "if NOT one of the allowed durable-interacting ops, push an error" — an allowlist. But it also mentioned a structural type `typeof querySchema` which would make the fake-schema counter-test fail tsc (the imported JSON's op enum is a readonly tuple of literal string types, not assignable from a fake literal). A structural `QuerySchemaShape` interface is the testable equivalent.
- **Fix:** Defined `QuerySchemaShape` (loose structural type) + `ALLOWED_READ_ONLY_OPS: ReadonlySet`. The allowlist catches novel ephemeral-write ops by default (stronger than a denylist). The real querySchema is assignable to QuerySchemaShape; the fake counter-schema literal is too.
- **Files modified:** daemon/src/store/boundary.ts
- **Verification:** 8/8 boundary tests pass; the real schema returns []; the fake experiment.save schema returns non-empty errors; main() guard exits 0.
- **Committed in:** 6239e68 (Task 1 GREEN)

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bugs — 1 plan type-inconsistency + 2 test-fixture logic/cast + 1 type guard; 1 Rule 2 missing-critical — allowlist + structural type).
**Impact on plan:** All auto-fixes necessary for type-correctness, test-correctness, or schema-validity. The public surface (Freshness, StaleWatchdog, Analyzer/DerivedField/AnalyzeContext/Assumption, M1_ANALYZERS, loadIntent, normalize, checkMemoryBoundary, UnixDomainSocketServerTransport, startQueryServer) matches the plan's intent. No scope creep.

## Issues Encountered
None beyond the five deviations above (all resolved inline).

## User Setup Required
None — no external service configuration required. This plan is pure TypeScript module + test work; no servers to start (the UDS listener is exercised via the test suite + tsx, not a long-running daemon boot — that wiring lands when the daemon entry point assembles these deps, which is out of this plan's scope).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: mitigated | daemon/src/transport/uds.ts | T-2-03b-S (Spoofing — other local user connects) — mitigated by chmod(socketPath, 0o600) immediately after listen via the `ready` promise; constructor closes the server + rejects ready if chmod fails (refuses-to-start). uds.test.ts asserts `(mode & 0o777) === 0o600`. |
| threat_flag: mitigated | daemon/src/state/stale-watchdog.ts + daemon/src/query/query-server.ts | T-2-03b-T (Tampering — stale trusted as live) — mitigated by StaleWatchdog surfacing stateFreshness on every CLI result (query-server calls watchdog.tick() per result); assertFresh() throws when not live (M2 edit gate, wired but unreachable in M1). |
| threat_flag: mitigated | daemon/src/store/boundary.ts | T-2-03b-I (Tampering — ephemeral → durable) — mitigated by the MEM-02 allowlist gate: checkMemoryBoundary(querySchema) returns [] (no ephemeral-write op in the cli-query enum); boundary.test.ts proves a fake experiment.save schema fails the gate. |
| threat_flag: accepted | daemon/src/state/reconcile.ts (consumed unchanged) | T-2-03b-D (DoS — fingerprint flood under massive reorder) — accepted per the plan; M1 threat model is single-user dev box; 02-03a's held-out 20-track test bounds the realistic case. |

All 4 threats in the plan's `<threat_model>` carry their disposition and are behavior-verified by the new test suite.

## TDD Gate Compliance

Both tasks are `tdd="true"`. Gate sequence honored per task:

**Task 1:**
- **RED gate** (`e37a8df`): all 5 test files written first; vitest run confirmed they fail (RED) — `Cannot find module './stale-watchdog.js'` etc. Tests fail for the right reason (module-not-found), not a test bug.
- **GREEN gate** (`6239e68`): the 5 source implementations landed; 59/59 Task-1 tests pass; tsc clean.

**Task 2:**
- **RED gate** (`da8e8e6`): both test files written first; vitest run confirmed they fail — `Cannot find module './uds.js'` / `./query-server.js`. Right reason.
- **GREEN gate** (`5deb3c9`): the 2 source implementations landed; 23/23 Task-2 tests pass; tsc clean.

**REFACTOR gate:** skipped for both — the GREEN implementations are minimal and direct (no duplication, single-purpose helpers). A REFACTOR commit with no behavior change would be noise.

Gate commits in `git log --oneline --grep="02-03b"`:
- `test(02-03b)` × 2 (e37a8df stateful-layer RED, da8e8e6 uds/query-server RED)
- `feat(02-03b)` × 2 (6239e68 stateful-layer GREEN, 5deb3c9 uds/query-server GREEN)

Valid RED→GREEN sequence per task; RED tests failed for the correct reason (missing modules); GREEN implementations minimal.

## Self-Check: PASSED

**Created files exist on disk:**
- FOUND: daemon/src/state/stale-watchdog.ts
- FOUND: daemon/src/state/stale-watchdog.test.ts
- FOUND: daemon/src/state/analyzer-registry.ts
- FOUND: daemon/src/state/analyzer-registry.test.ts
- FOUND: daemon/src/state/intent-store.ts
- FOUND: daemon/src/state/intent-store.test.ts
- FOUND: daemon/src/ingest/normalizer.ts
- FOUND: daemon/src/ingest/normalizer.test.ts
- FOUND: daemon/src/store/boundary.ts
- FOUND: daemon/src/store/boundary.test.ts
- FOUND: daemon/src/transport/uds.ts
- FOUND: daemon/src/transport/uds.test.ts
- FOUND: daemon/src/query/query-server.ts
- FOUND: daemon/src/query/query-server.test.ts

**Commits exist:**
- FOUND: e37a8df (test(02-03b): stateful layer + MEM-02 boundary RED)
- FOUND: 6239e68 (feat(02-03b): stateful layer + MEM-02 boundary GREEN)
- FOUND: da8e8e6 (test(02-03b): UDS transport + query-server RED)
- FOUND: 5deb3c9 (feat(02-03b): UDS transport + cli-query server GREEN)

**Plan-level `<verification>` commands re-run:**
- `cd daemon && npx vitest run src/state src/store src/ingest src/transport/uds.test.ts src/query` → 111/111 tests pass. PASS.
- `cd daemon && npx tsc --noEmit` → exit 0 (NodeNext strict). PASS.
- `checkMemoryBoundary(querySchema)` returns [] → verified by boundary.test.ts + main guard (`npx tsx src/store/boundary.ts` → "✓ ... passed MEM-02 boundary check", exit 0). PASS.
- uds.test.ts asserts socket mode 0o600 → `(statSync(socketPath).mode & 0o777) === 0o600` test passes. PASS.

**Acceptance criteria:** all 10 Task-1 criteria + all 8 Task-2 criteria verified inline (grep/file/test) before each GREEN commit.

**Full daemon suite (regression check):** 206/206 across 16 files. PASS.

## Next Phase Readiness
- The daemon's stateful layer is complete and the D-07 UDS query channel is live (in the test suite). Plan 02-05 (Pi `/analyze` + describe() + state pane) can now wire these deps: a daemon entry point that constructs StaleWatchdog + UnixDomainSocketServerTransport + startQueryServer, but that boot wiring is the remaining assembly step (out of this plan's scope — this plan delivered the modules + their tests, not the daemon main()).
- The stale-watchdog's `Date.now()` feeds reconcile's injected `now` (02-03a's contract) — the daemon boot will wire `reconcile(observed, persisted, watchdog-relative-now)`.
- The cli-query contract is spoken end-to-end: 02-04's CLI client connects to this server's socket; until the daemon boot assembles + listens, 02-04's CLI continues to fail-closed with `stateFreshness:"disconnected"` (the designed M1 interim behavior — non-blocking).
- Phases 3-5 plug analyzers into `AnalyzerRegistry.register()` (sections/trackRoles/motifs/energyCurve/automationSalience) without touching the registry or the query-server — the D-08 framework contract is frozen.

---
*Phase: 02-read-only-context-foundation-m1*
*Completed: 2026-06-27*
