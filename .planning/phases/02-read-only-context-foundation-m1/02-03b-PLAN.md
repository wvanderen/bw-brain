---
phase: 02-read-only-context-foundation-m1
plan: 03b
type: execute
wave: 3
depends_on: [02-03a, 02-01]
files_modified:
  - daemon/src/state/stale-watchdog.ts
  - daemon/src/state/stale-watchdog.test.ts
  - daemon/src/state/analyzer-registry.ts
  - daemon/src/state/analyzer-registry.test.ts
  - daemon/src/state/intent-store.ts
  - daemon/src/state/intent-store.test.ts
  - daemon/src/store/boundary.ts
  - daemon/src/store/boundary.test.ts
  - daemon/src/ingest/normalizer.ts
  - daemon/src/ingest/normalizer.test.ts
  - daemon/src/transport/uds.ts
  - daemon/src/transport/uds.test.ts
  - daemon/src/query/query-server.ts
  - daemon/src/query/query-server.test.ts
autonomous: true
requirements: [STATE-01, STATE-02, STATE-03, MEM-02, CLI-01]
must_haves:
  truths:
    - "Raw bridge snapshots normalize into a RawState validated against schemas/project-state.schema.json at the daemon boundary (STATE-01)"
    - "The analyzer registry runs exactly ONE analyzer (IntentAnalyzer) in M1; sections/trackRoles/motifs/energyCurve/automationSalience all stay empty until their phase (STATE-02 framework-only, D-08)"
    - "projectIntent loads from <project>/.bw-brain/intent.json via an atomic validated read; no inference, no defaults (STATE-03, D-09)"
    - "The stale-watchdog surfaces stateFreshness live|stale|disconnected on every CLI result and would refuse edits in M2 (SC#3 — the trust-spine gate)"
    - "The daemon-local UDS listener at ~/.bw-brain/daemon.sock has file mode 0600 — only the same user can connect (D-07, Pitfall 5)"
    - "The daemon has NO op that writes ephemeral data to the durable store (MEM-02 — boundary unit test asserts the cli-query schema carries no ephemeral-write op)"
  artifacts:
    - path: "daemon/src/state/stale-watchdog.ts"
      provides: "StaleWatchdog state machine: live|stale|disconnected + assertFresh() (SC#3)"
      contains: "stateFreshness"
    - path: "daemon/src/state/analyzer-registry.ts"
      provides: "Analyzer interface + AnalyzerRegistry (drops confidence<0.5) + M1_ANALYZERS=[IntentAnalyzer] (D-08)"
      contains: "IntentAnalyzer"
    - path: "daemon/src/state/intent-store.ts"
      provides: "loadIntent(path): ProjectIntent | null — atomic validated read, no inference (D-09)"
      contains: "loadIntent"
    - path: "daemon/src/ingest/normalizer.ts"
      provides: "normalize(payload): RawState | null — drop-never-throw second-stage validator (STATE-01)"
      contains: "validateProjectState"
    - path: "daemon/src/store/boundary.ts"
      provides: "checkMemoryBoundary(querySchema): string[] — MEM-02 architectural gate"
      contains: "checkMemoryBoundary"
    - path: "daemon/src/transport/uds.ts"
      provides: "UnixDomainSocketServerTransport implementing Transport, socket mode 0600 (D-07)"
      contains: "0o600"
    - path: "daemon/src/query/query-server.ts"
      provides: "UDS listener + cli-query Ajv validation + op dispatch (D-07)"
      contains: "focus.export"
  key_links:
    - from: "daemon/src/ingest/normalizer.ts"
      to: "schemas/project-state.schema.json"
      via: "Ajv validates normalized RawState against the Plan-01 schema before handing to state layer"
      pattern: "project-state.schema.json"
    - from: "daemon/src/query/query-server.ts"
      to: "schemas/cli-query/{query,result}.schema.json"
      via: "Ajv validates inbound queries + outbound results at the UDS boundary"
      pattern: "cli-query"
    - from: "daemon/src/query/query-server.ts"
      to: "daemon/src/state/stale-watchdog.ts"
      via: "every query result carries stateFreshness from watchdog.tick() (SC#3 surfacing)"
      pattern: "watchdog\\.tick"
    - from: "daemon/src/transport/uds.ts"
      to: "daemon/src/transport/transport.ts"
      via: "UnixDomainSocketServerTransport implements the Phase-1 Transport interface (D-07 new peer, not a reuse of bridge TCP)"
      pattern: "implements Transport"
---

<objective>
Build the daemon's stateful layer + the D-07 daemon-local UDS query channel, consuming the trust-spine primitives (fingerprint, reconcile, atomicWriteJson, state-cache) shipped by 02-03a. This plan delivers: (a) STATE-01 raw-state normalization against the Plan-01 schema; (b) STATE-02 framework-only analyzer registry with exactly ONE analyzer (IntentAnalyzer) per D-08; (c) STATE-03 user-authored intent read; (d) MEM-02 ephemeral/durable boundary (SC#5); (e) D-07 daemon-local UDS query channel (the new listener separate from bridge port 7878). The stale-watchdog consumes the SC#3 truth (atomic state-cache + stable fingerprint map exist below it) and surfaces stateFreshness live|stale|disconnected on every CLI result.

Purpose: Wave 3 lands AFTER 02-03a has locked the trust-spine primitives with held-out property tests. This lets the stateful layer (stale-watchdog, analyzer-registry, intent-store, normalizer) and the UDS transport + query-server be developed against PROVEN fingerprint/atomic-write/state-cache semantics rather than inheriting unverified scaffolding. Honors D-04 (automation empty), D-07 (UDS separate from bridge TCP), D-08 (no analyzers in M1 except IntentAnalyzer), D-09 (intent user-authored read-only), D-10 (assumptions[] plumbing from day one).
Output: 14 new daemon source files + their tests, including the stale-watchdog transition suite, the MEM-02 boundary unit test (SC#5), and the Pitfall-5 UDS 0600-mode unit test.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.claude/AGENTS.md
@.planning/phases/02-read-only-context-foundation-m1/02-CONTEXT.md
@.planning/phases/02-read-only-context-foundation-m1/02-RESEARCH.md
@.planning/phases/02-read-only-context-foundation-m1/02-PATTERNS.md
@.planning/phases/02-read-only-context-foundation-m1/02-VALIDATION.md
@.planning/phases/02-read-only-context-foundation-m1/02-01-SUMMARY.md
@.planning/phases/02-read-only-context-foundation-m1/02-03a-SUMMARY.md
@daemon/src/state/fingerprint.ts
@daemon/src/state/reconcile.ts
@daemon/src/store/atomic-write.ts
@daemon/src/store/state-cache.ts
@daemon/src/transport/tcp.ts
@daemon/src/transport/transport.ts
@daemon/src/protocol/reader.ts
@scripts/check-capabilities-doc.mjs
@schemas/project-state.schema.json
@schemas/intent.schema.json
@schemas/cli-query/query.schema.json
@schemas/cli-query/result.schema.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: STATE-02/03/04 stateful + MEM-02 boundary — stale-watchdog + analyzer-registry (IntentAnalyzer only) + intent-store + normalizer + boundary</name>
  <files>daemon/src/state/stale-watchdog.ts, daemon/src/state/stale-watchdog.test.ts, daemon/src/state/analyzer-registry.ts, daemon/src/state/analyzer-registry.test.ts, daemon/src/state/intent-store.ts, daemon/src/state/intent-store.test.ts, daemon/src/ingest/normalizer.ts, daemon/src/ingest/normalizer.test.ts, daemon/src/store/boundary.ts, daemon/src/store/boundary.test.ts</files>
  <read_first>
    - daemon/src/transport/tcp.ts (lines 43-48 — the STATEFUL-CLASS pattern: private readonly fields, constructor, lifecycle; stale-watchdog.ts mirrors this shape per PATTERNS.md Assignment 7 lines 300-330)
    - daemon/src/protocol/reader.ts (lines 32-59 — the Ajv compile-once-at-boot pattern; lines 155-172 — the validate-then-drop-never-throw pattern; normalizer.ts + intent-store.ts mirror both per Shared Pattern A + E)
    - daemon/src/protocol/schemas.test.ts (lines 53-92 — the Ajv round-trip test pattern; replicate for normalizer + intent-store schema validation)
    - .planning/phases/02-read-only-context-foundation-m1/02-RESEARCH.md (Pattern 2 stale-watchdog lines 513-543 — Freshness enum + StaleWatchdog class + assertFresh; Pattern 5 analyzer-plugin interface lines 673-721 — Analyzer/DerivedField/AnalyzeContext/Assumption interfaces + IntentAnalyzer + below-threshold refuse filter; §Code Examples "assumptions[] shape" lines 1265-1278)
    - .planning/phases/02-read-only-context-foundation-m1/02-RESEARCH.md (§Code Examples "Atomic write" lines 1172-1186 — intent-store uses the atomic read counterpart; Pitfall 6 lines 828-833 — three-state Freshness discipline)
    - .planning/phases/02-read-only-context-foundation-m1/02-PATTERNS.md (Assignment 7 lines 300-330 stale-watchdog; Assignment 8 lines 333-348 analyzer-registry; Assignment 9 lines 352-363 intent-store; Assignment 5 lines 227-257 normalizer; Assignment 11 lines 395-417 boundary; Shared Pattern E lines 684-697 validate-at-boundary)
    - .planning/phases/02-read-only-context-foundation-m1/02-CONTEXT.md (D-08 framework-only — no analyzers in M1 except IntentAnalyzer; D-09 intent user-authored, read-only, no inference; D-10 assumptions[] shape {claim,confidence,source})
    - scripts/check-capabilities-doc.mjs (lines 84-143 — the structural-validator-returning-errors-array pattern; boundary.ts mirrors this per PATTERNS.md Assignment 11 line 400)
  </read_first>
  <behavior>
    - stale-watchdog: starts disconnected; onBridgeMessage -> live; 5s of silence -> stale; onBridgeDisconnect -> disconnected; reconnect + first message -> live; assertFresh() throws when freshness is not live (the M2 edit gate; M1 surfaces freshness but does not call assertFresh on a live path).
    - analyzer-registry: runAll with IntentAnalyzer only emits exactly one DerivedField{field:"intent", confidence:1.0, assumptions:[...]}; a derived field with confidence <0.5 is dropped (below-threshold refuse); a hypothetical analyzer returning sections/motifs/etc is NOT registered in M1 (D-08).
    - intent-store: loadOrValidate reads <project>/.bw-brain/intent.json; if absent returns null (no inference, no defaults — D-09); if present validates against intent.schema.json and returns ProjectIntent; if invalid throws a structured error.
    - normalizer: receives an Ajv-validated envelope payload; produces a RawState validated against project-state.schema.json; invalid -> drop + log (never throw).
    - boundary: imports cli-query/query.schema.json, enumerates the op enum, asserts no op is an ephemeral-write op (the MEM-02 architectural gate).
  </behavior>
  <action>
    Create daemon/src/state/stale-watchdog.ts (PATTERNS.md Assignment 7 — mirror tcp.ts lines 43-48 stateful-class shape). Export type Freshness = "live"|"stale"|"disconnected"; export const STALE_THRESHOLD_MS = 5_000; export const RECONNECT_GRACE_MS = 60_000. Export class StaleWatchdog with private lastBridgeAt: number; private freshness: Freshness = "disconnected". Methods: onBridgeMessage() sets lastBridgeAt=Date.now() + freshness="live"; onBridgeDisconnect() sets freshness="disconnected"; tick(): Freshness — if disconnected return disconnected; if Date.now()-lastBridgeAt > STALE_THRESHOLD_MS set freshness="stale"; return freshness; assertFresh(): void — throws Error("refuse edit: state freshness is ${this.freshness}...") if freshness !== "live" (the M2 edit gate; M1 does not call this on a live path but the method EXISTS for D-08 plumbing). Three-state discipline per RESEARCH.md Pitfall 6 lines 828-833.

    Create daemon/src/state/stale-watchdog.test.ts: test every transition — initial=disconnected; onBridgeMessage -> live; 6s silence -> stale (use vi.useFakeTimers); onBridgeDisconnect -> disconnected; reconnect+message -> live; assertFresh throws when stale + when disconnected; assertFresh does not throw when live.

    Create daemon/src/state/analyzer-registry.ts (PATTERNS.md Assignment 8 + RESEARCH.md Pattern 5 lines 683-718 verbatim). Export interfaces Analyzer { readonly id: string; readonly consumes: readonly (keyof RawState)[]; readonly produces: readonly (keyof DerivedState)[]; analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[] }; DerivedField { field: "sections"|"trackRoles"|"motifs"|"energyCurve"|"automationSalience"|"intent"; value: unknown; confidence: number; assumptions: Assumption[] }; AnalyzeContext { intent: ProjectIntent | null; now: number }; Assumption { claim: string; confidence: number; source: "selection"|"intent"|"config"|"default" }. Export class AnalyzerRegistry with register(a: Analyzer) + runAll(raw, ctx): DerivedField[] that collects all analyzer outputs then DROPS any DerivedField with confidence <0.5 (the "below-threshold = refuse rather than guess" stance, CONTEXT.md specifics). Export const M1_ANALYZERS: Analyzer[] containing exactly ONE analyzer: IntentAnalyzer (id "intent", consumes [], produces ["intent"], analyze returns [DerivedField{field:"intent", value: ctx.intent, confidence: 1.0, assumptions:[{claim:"user-authored in .bw-brain/intent.json", confidence:1.0, source:"intent"}]}]). NO other analyzers (D-08). Import RawState from "../../gen/project-state.js", ProjectIntent from "../../gen/intent.js".

    Create daemon/src/state/analyzer-registry.test.ts: runAll with M1_ANALYZERS + a fixture raw + non-null intent -> returns exactly one DerivedField with field "intent" confidence 1.0 + non-empty assumptions; runAll with null intent -> the IntentAnalyzer still emits field "intent" with value null + confidence 1.0; register a FAKE analyzer returning confidence 0.3 -> runAll DROPS its output (below-threshold refuse); assert M1_ANALYZERS.length === 1.

    Create daemon/src/state/intent-store.ts (PATTERNS.md Assignment 9 — mirror reader.ts validate-on-read lines 164-170). Import { Ajv2020 } from "ajv/dist/2020.js"; import intentSchema from "../../../schemas/intent.schema.json" with { type:"json" }; const ajv = new Ajv2020({allErrors:true, strict:false}); ajv.addSchema(intentSchema); const validateIntent = ajv.getSchema(intentSchema.$id)!. Export async function loadIntent(path: string): Promise<ProjectIntent | null>: readFile; if absent return null (D-09 — NO inference, NO defaults); JSON.parse; if !validateIntent throw Error(`intent.json invalid: ${JSON.stringify(validateIntent.errors)}`); else return parsed.projectIntent. NO write path in M1 (user-authored by hand per D-09).

    Create daemon/src/state/intent-store.test.ts: absent file -> null; valid intent.json -> ProjectIntent with summary/constraints/targets; invalid intent.json (missing summary) -> throws with the Ajv errors; NO defaults are ever synthesized when the file is absent (D-09 defense — assert the null return, not a default object).

    Create daemon/src/ingest/normalizer.ts (PATTERNS.md Assignment 5 — mirror reader.ts lines 32-59 + 155-172). Import { Ajv2020 } from "ajv/dist/2020.js"; import projectStateSchema from "../../../schemas/project-state.schema.json" with { type:"json" }; const ajv = new Ajv2020({allErrors:true, strict:false}); ajv.addSchema(projectStateSchema); const validateProjectState = ajv.getSchema(projectStateSchema.$id)!. Export function normalize(payload: unknown): RawState | null: if !validateProjectState(payload) -> console.error + return null (drop-never-throw, Shared Pattern E); else return payload as RawState. This is the SECOND-stage validator after the envelope (reader.ts is the first).

    Create daemon/src/ingest/normalizer.test.ts: valid raw-state fixture (from Plan 01) -> returns RawState; fixture missing required version -> null; fixture with a slot-index trackSid like trk_5 -> null (the Pitfall-2 regex gate rejects it); counter-example for each top-level required field.

    Create daemon/src/store/boundary.ts (PATTERNS.md Assignment 11 — mirror check-capabilities-doc.mjs lines 84-143 validator shape). Import querySchema from "../../../schemas/cli-query/query.schema.json" with { type:"json" }. Export function checkMemoryBoundary(schema: typeof querySchema): string[]: enumerate schema.properties.op.enum; for each op, if it is NOT one of the allowed durable-interacting ops (M1: all query ops are READ-ONLY; the only durable-write path is apply.patch which lands in M2 via a SEPARATE edit schema, NOT cli-query), push an error. Return errors[] (empty = pass). Add a main() guard that runs checkMemoryBoundary(querySchema) + console.error for each + process.exit(1) on failure, mirroring check-capabilities-doc.mjs lines 164-170. This is the MEM-02 architectural gate (RESEARCH.md lines 846, 1489) — asserts the daemon's durable-write API surface excludes ephemeral writes.

    Create daemon/src/store/boundary.test.ts: assert checkMemoryBoundary(querySchema) returns [] (the M1 query op enum has no ephemeral-write op); add a counter-test that feeds a FAKE schema with an op like "experiment.save" and asserts checkMemoryBoundary returns a non-empty errors array (the gate fires when violated).
  </action>
  <verify>
    <automated>cd /Users/eggfam/dev/bw-brain/daemon && npx vitest run src/state/ src/store/ src/ingest/ && node --experimental-vm-modules src/store/boundary.ts 2>/dev/null; npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - stale-watchdog.ts exports the Freshness type with exactly 3 values and assertFresh() throws when freshness !== "live".
    - stale-watchdog.test.ts exercises all transitions including the 5s-timeout stale transition (vi.useFakeTimers) and the disconnected state.
    - analyzer-registry.ts exports the Analyzer/DerivedField/AnalyzeContext/Assumption interfaces matching RESEARCH.md Pattern 5 lines 683-718.
    - M1_ANALYZERS array has length exactly 1 (IntentAnalyzer only — D-08 defense; grep the source: zero section/motif/energy/role/automation analyzers are registered).
    - analyzer-registry runAll drops any DerivedField with confidence <0.5 (the below-threshold refuse test passes).
    - intent-store.ts loadIntent returns null for an absent file (NOT a default object — D-09 defense); throws on invalid; NO write path exists (grep: no writeFile/fs.writeFile calls in intent-store.ts).
    - normalizer.ts returns null for invalid payload (drop-never-throw); returns null for a slot-index trackSid (Pitfall 2 regex gate).
    - boundary.ts checkMemoryBoundary(querySchema) returns [] for the real schema and a non-empty array for a fake schema with an ephemeral-write op.
    - `npx vitest run src/state/ src/store/ src/ingest/` is green.
    - `npx tsc --noEmit` passes.
  </acceptance_criteria>
  <done>The stateful daemon layer is complete: watchdog transitions correct (SC#3 surfacing), analyzer framework ships empty-but-pluggable with IntentAnalyzer only (STATE-02/D-08), intent is read-only user-authored (STATE-03/D-09), raw-state normalizes against the schema (STATE-01), and the MEM-02 boundary is enforced as a unit test (SC#5). Ready for Task 2 to expose this via the UDS query channel.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: D-07 UDS transport + query-server (cli-query Ajv validation + op dispatch + stateFreshness surfacing)</name>
  <files>daemon/src/transport/uds.ts, daemon/src/transport/uds.test.ts, daemon/src/query/query-server.ts, daemon/src/query/query-server.test.ts</files>
  <read_first>
    - daemon/src/transport/tcp.ts (FULL FILE — the closest analog; copy the SECURITY INVARIANT header block, the constructor guard, the net.createServer per-connection handling, the send() atomic-line write, the onMessage/close shape; uds.ts mirrors this with path-based listen + chmod 0600 instead of host:port)
    - daemon/src/transport/transport.ts (lines 21-37 — the Transport interface uds.ts implements: onMessage/send/close)
    - daemon/src/protocol/reader.ts (lines 32-59 Ajv compile-once; lines 155-172 validate-then-drop; query-server.ts wires UDS transport + cli-query Ajv + op dispatch per PATTERNS.md Assignment 12 lines 420-438)
    - .planning/phases/02-read-only-context-foundation-m1/02-RESEARCH.md (Pattern 3 "Daemon-Local CLI-Query Channel" lines 551-604 — UDS recommendation, loopback-invariant-as-0600-file-mode, Transport reuse, query/response shape; Pitfall 5 UDS-form lines 821-826)
    - .planning/phases/02-read-only-context-foundation-m1/02-PATTERNS.md (Assignment 4 lines 151-223 — uds.ts header comment + constructor guard + send pattern, all verbatim against tcp.ts; Assignment 12 lines 420-438 query-server; Shared Pattern B lines 637-652 0600 invariant)
    - .planning/phases/02-read-only-context-foundation-m1/02-CONTEXT.md (D-07 — daemon-local channel SEPARATE from bridge port 7878; UDS at stable path; the binding invariant is "separate from bridge TCP")
    - schemas/cli-query/query.schema.json + result.schema.json (Plan 01 — the op enum + the ok:true/false discriminator + stateFreshness required + assumptions plumbing)
  </read_first>
  <behavior>
    - UDS transport: listen(path) creates the socket file, chmod 0o600 immediately; a test asserting the file mode is 0600 after listen passes (Pitfall 5 UDS-form); onMessage feeds chunks to a handler; send writes one JSON.stringify(msg)+"\n" per connected socket; close destroys sockets + unlinks the socket file.
    - query-server: receives a {version,type:"query",op,payload} line; validates against cli-query/query.schema.json; dispatches on op; for the 5 live ops returns {ok:true, stateFreshness, payload, assumptions}; for unknown/not-implemented ops returns {ok:false, error:"not_implemented", availableFrom}; stateFreshness comes from the StaleWatchdog.
  </behavior>
  <action>
    Create daemon/src/transport/uds.ts (PATTERNS.md Assignment 4 — transcribe the header block + structure from tcp.ts). Header comment block (lines 1-19 of tcp.ts pattern): cite RESEARCH.md Pitfall 5 UDS-form + Pattern 3; state the SECURITY INVARIANT: socket file mode 0o600 ONLY, chmod runs immediately after listen, the constructor REFUSES to start if chmod fails. Imports: import * as net from "node:net"; import { chmod, unlink } from "node:fs/promises"; import type { Transport } from "./transport.js". Export class UnixDomainSocketServerTransport implements Transport with private readonly socketPath; private readonly server; private readonly sockets = new Set<net.Socket>(); private handler. Constructor({socketPath}): create net.createServer((socket) => { this.sockets.add(socket); socket.setEncoding("utf8"); socket.on("data", (chunk) => this.handler(chunk)); const cleanup = () => { this.sockets.delete(socket); }; socket.on("error", cleanup); socket.on("close", cleanup); }); server.on("error", (err) => { throw err; }); server.listen(socketPath); then await chmod(socketPath, 0o600); if the chmod throws, close the server + rethrow (the constructor-refuses-to-start guard, mirroring tcp.ts lines 55-59 host-guard). onMessage/send/close mirror tcp.ts lines 84-106; close additionally awaits unlink(socketPath) to clean up the socket file on daemon exit. send() writes JSON.stringify(msg)+"\n" per socket (Shared Pattern C atomic-line write).

    Create daemon/src/transport/uds.test.ts: start a transport on os.tmpdir()+"/test-bw-brain.sock"; assert fs.statSync(socketPath) exists; assert (fs.statSync(socketPath).mode & 0o777) === 0o600 (the Pitfall-5 UDS-form gate); connect a net.createConnection({path:socketPath}); send a message; assert the client receives JSON.parse-able line; close asserts the socket file is unlinked. Use afterEach cleanup.

    Create daemon/src/query/query-server.ts (PATTERNS.md Assignment 12). Import { Ajv2020 } from "ajv/dist/2020.js"; import querySchema from "../../../schemas/cli-query/query.schema.json" with { type:"json" }; import resultSchema from "../../../schemas/cli-query/result.schema.json" with { type:"json" }; const ajv = new Ajv2020({allErrors:true, strict:false}); ajv.addSchema(querySchema); ajv.addSchema(resultSchema); const validateQuery = ajv.getSchema(querySchema.$id)!; Export interface QueryServerDeps { transport: Transport; watchdog: StaleWatchdog; getState: () => RawState | null; getIntent: () => ProjectIntent | null; }. Export function startQueryServer(deps: QueryServerDeps): void — wires deps.transport.onMessage((chunk) => { parse + validateQuery; if invalid -> send result{ok:false, error:"invalid_query", stateFreshness: deps.watchdog.tick()}; else dispatch on msg.op: "focus.export" -> send result{ok:true, stateFreshness, payload: focusView(deps.getState()), assumptions:[...]}; "project.summary" -> ...; "project.region" -> ...; "midi.inspect" -> ...; "device.inspect" -> ...; "diff" -> ...; default -> send result{ok:false, error:"not_implemented", availableFrom: "M2", stateFreshness} }). The stateFreshness field is REQUIRED on every result (schemas/cli-query/result.schema.json gate from Plan 01). The assumptions[] array is attached to every result carrying a derived field (UX-06). The actual op-handler bodies (focusView, projectSummary, etc.) are THIN — they read from deps.getState()/getIntent() which Task 1's normalizer + intent-store populate. For M1, if getState() returns null (bridge not yet connected), return stateFreshness from the watchdog (likely "disconnected") + payload null + assumptions[{claim:"bridge not connected", confidence:1.0, source:"selection"}].

    Create daemon/src/query/query-server.test.ts: inject a fake transport (capture sent messages) + a fake watchdog (return "live" + "stale" + "disconnected" on demand) + a fixture RawState. Test: send {op:"focus.export"} -> response has ok:true, stateFreshness matches the watchdog, payload is the focus view, assumptions is non-empty. Test: send {op:"project.summary"} -> ok:true. Test: send {op:"unknown"} -> ok:false, error:"not_implemented", availableFrom present. Test: send a malformed query (missing op) -> ok:false, error:"invalid_query". Test: watchdog returns "stale" -> response stateFreshness:"stale" (SC#3 surfacing). Test: getState() returns null -> response ok:true but payload null + stateFreshness from watchdog + assumptions carrying the "bridge not connected" claim.
  </action>
  <verify>
    <automated>cd /Users/eggfam/dev/bw-brain/daemon && npx vitest run src/transport/uds.test.ts src/query/query-server.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - uds.ts implements the Transport interface (onMessage/send/close) and the constructor calls chmod(socketPath, 0o600) after listen; if chmod throws the constructor closes the server and rethrows (the refuses-to-start guard).
    - uds.test.ts asserts (fs.statSync(socketPath).mode & 0o777) === 0o600 after listen (Pitfall 5 UDS-form gate).
    - uds.ts close() calls unlink on the socket file (cleanup on daemon exit).
    - query-server.ts validates inbound queries against cli-query/query.schema.json (Ajv compile-once) and emits results shaped per cli-query/result.schema.json.
    - Every result from query-server carries stateFreshness (REQUIRED field — SC#3 surfacing) + assumptions[] on derived-field results (UX-06).
    - Unknown ops return {ok:false, error:"not_implemented", availableFrom} (the stub arm).
    - `npx vitest run` for these 2 test files is green.
    - `npx tsc --noEmit` passes.
  </acceptance_criteria>
  <done>The D-07 daemon-local UDS query channel is complete: the 0600-mode listener (Pitfall 5 UDS-form), the cli-query schema validation at the boundary, the op dispatch, and the stateFreshness+assumptions surfacing on every result. The daemon-side state layer is fully wired and queryable; Plan 04's CLI thin client connects to this socket.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| bridge → daemon ingest (port 7878) | Raw bridge payloads normalize through the second-stage Ajv validator (project-state.schema.json) before reaching the state layer. Pitfall 2 defense: a slot-index trackSid cannot pass the regex gate. |
| CLI → daemon query (UDS ~/.bw-brain/daemon.sock) | Inbound cli-query messages validate against cli-query/query.schema.json; outbound results carry stateFreshness (SC#3) + assumptions[] (UX-06). Socket file mode 0600 is the auth (same-user only). |
| daemon → durable disk (<project>/.bw-brain/) | Every write is atomic via the 02-03a atomicWriteJson primitive. The MEM-02 boundary unit test asserts no ephemeral-write op exists in the cli-query schema. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-03b-S | Spoofing | UDS socket (other local user connects) | mitigate | chmod(socketPath, 0o600) immediately after listen + constructor refuses-to-start if chmod fails — Pitfall 5 UDS-form; uds.test.ts asserts the mode. |
| T-2-03b-T | Tampering (stale trusted as live) | CLI results during bridge silence | mitigate | StaleWatchdog surfaces stateFreshness on every result; assertFresh() throws when not live (M2 edit gate). |
| T-2-03b-I | Tampering (ephemeral -> durable) | cli-query op surface | mitigate | boundary.ts unit test asserts the cli-query op enum has NO ephemeral-write op (MEM-02 / SC#5 architectural gate). |
| T-2-03b-D | DoS (fingerprint flood) | reconcile under massive reorder | accept | M1 threat model is single-user dev box; 02-03a's held-out 20-track test bounds the realistic case. Tuning the fuzzy fallback is a post-M1 observation per RESEARCH.md Open Question 3. |
</threat_model>

<verification>
- `cd daemon && npx vitest run src/state src/store src/ingest src/transport/uds.test.ts src/query` green (all Task 1+2 tests).
- `cd daemon && npx tsc --noEmit` green (NodeNext strict).
- boundary.ts checkMemoryBoundary(querySchema) returns [] (MEM-02 gate holds).
- uds.test.ts asserts socket file mode 0o600 (Pitfall 5 UDS-form).
</verification>

<success_criteria>
- Raw bridge snapshots normalize into schema-valid RawState (STATE-01) — invalid payloads (incl. slot-index sids) drop, never throw.
- Analyzer framework ships with IntentAnalyzer ONLY (STATE-02/D-08); the registry drops below-threshold output; sections/motifs/roles/energy/automation stay empty.
- Intent loads read-only from <project>/.bw-brain/intent.json with NO inference (STATE-03/D-09).
- The watchdog surfaces stateFreshness live|stale|disconnected on every CLI result (SC#3 — built on 02-03a's proven state-cache primitive).
- UDS listener at ~/.bw-brain/daemon.sock has mode 0600 (D-07/Pitfall 5).
- MEM-02 boundary holds: no cli-query op writes ephemeral data to durable (SC#5 — unit test).
</success_criteria>

<output>
Create `.planning/phases/02-read-only-context-foundation-m1/02-03b-SUMMARY.md` when done.
</output>

## Artifacts this phase produces (Plan 03b)

**New modules (daemon-side stateful layer + UDS query channel):**
- `daemon/src/state/stale-watchdog.ts` — `StaleWatchdog` class, `Freshness` type, `STALE_THRESHOLD_MS`, `RECONNECT_GRACE_MS` constants
- `daemon/src/state/analyzer-registry.ts` — `Analyzer`, `DerivedField`, `AnalyzeContext`, `Assumption` interfaces; `AnalyzerRegistry` class; `M1_ANALYZERS` const (length 1: IntentAnalyzer); `IntentAnalyzer`
- `daemon/src/state/intent-store.ts` — `loadIntent(path): Promise<ProjectIntent | null>`
- `daemon/src/ingest/normalizer.ts` — `normalize(payload): RawState | null`
- `daemon/src/store/boundary.ts` — `checkMemoryBoundary(querySchema): string[]` + main() guard
- `daemon/src/transport/uds.ts` — `UnixDomainSocketServerTransport` class implementing `Transport`
- `daemon/src/query/query-server.ts` — `QueryServerDeps` interface, `startQueryServer(deps)`

**New tests (8 files):**
- stale-watchdog.test.ts (SC#3 transition suite), analyzer-registry.test.ts (D-08 framework + below-threshold refuse), intent-store.test.ts (D-09 no-inference), atomic-write/state-cache tests live in 02-03a, boundary.test.ts (MEM-02 / SC#5 gate), normalizer.test.ts (Pitfall 2 regex gate), uds.test.ts (Pitfall 5 0600 gate), query-server.test.ts (op dispatch + stateFreshness surfacing)
