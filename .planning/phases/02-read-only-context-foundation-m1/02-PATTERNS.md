# Phase 2: Read-Only Context Foundation (M1) - Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 31 new/modified files (grouped into 14 pattern assignments)
**Analogs found:** 12 with analogs / 14 assignments (2 use RESEARCH.md excerpts — atomic-write, Pi SKILL.md)

> **Source authority:** All excerpts are copied verbatim from the repo. Cross-references to `RESEARCH.md` mean `02-RESEARCH.md` in this phase dir. Line numbers are 1-indexed against the current working tree. The planner transcribes these patterns into plan `<actions>` blocks verbatim.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|-------------------|------|-----------|----------------|-------|
| `schemas/project-state.schema.json` | schema/config | validation | `schemas/protocol/event.schema.json` | **exact** |
| `schemas/intent.schema.json` | schema/config | validation | `schemas/protocol/handshake.schema.json` | **exact** |
| `schemas/cli-query/query.schema.json` | schema/config | request-response | `schemas/protocol/request.schema.json` | **exact** |
| `schemas/cli-query/result.schema.json` | schema/config | request-response | `schemas/protocol/response.schema.json` | **exact** |
| `schemas/protocol/event.schema.json` (extend) | schema/config | event-driven | itself (enum extension point) | **exact** |
| `schemas/protocol/request.schema.json` (extend) | schema/config | request-response | itself (enum extension point) | **exact** |
| `scripts/gen-types.mjs` (extend) | utility/build | transform | itself | **exact** |
| `daemon/src/transport/uds.ts` | transport | streaming + request-response | `daemon/src/transport/tcp.ts` | **exact** |
| `daemon/src/ingest/normalizer.ts` | service | transform | `daemon/src/protocol/reader.ts` | role-match |
| `daemon/src/state/fingerprint.ts` | model/utility | transform | `daemon/src/protocol/handshake.ts` | role-match |
| `daemon/src/state/reconcile.ts` | service | transform | `daemon/src/protocol/handshake.ts` | role-match |
| `daemon/src/state/stale-watchdog.ts` | service | event-driven | `daemon/src/transport/tcp.ts` | role-match |
| `daemon/src/state/analyzer-registry.ts` | service | transform | `daemon/src/protocol/reader.ts` (Ajv registry) | role-match |
| `daemon/src/state/intent-store.ts` | store/service | file-I/O + validation | `daemon/src/protocol/reader.ts` | role-match |
| `daemon/src/store/atomic-write.ts` | utility | file-I/O | **(none in repo)** → RESEARCH.md Pattern 4 | **none** |
| `daemon/src/store/state-cache.ts` | store | file-I/O | `daemon/src/store/atomic-write.ts` (new) | role-match |
| `daemon/src/store/boundary.ts` | test/utility | validation | `scripts/check-capabilities-doc.mjs` | role-match |
| `daemon/src/query/query-server.ts` | controller/server | request-response | `daemon/src/protocol/reader.ts` + `uds.ts` | role-match |
| `daemon/src/cli/bw-brain.ts` | controller/CLI | request-response | `daemon/src/cli/dump.ts` | role-match |
| `daemon/src/cli/commands/{focus,project,midi,device,diff,arrange,automation,edit}.ts` | controller/CLI | request-response | `daemon/src/cli/dump.ts` action | role-match |
| `daemon/src/cli/stubs.ts` | utility/controller | request-response | `daemon/src/cli/dump.ts` (stdout+exit) | role-match |
| `daemon/src/cli/query-client.ts` | service/client | request-response | `spike/raw-tcp-probe.java` (raw socket client) | partial |
| `daemon/src/protocol/reader.ts` (extend) | middleware | streaming | itself (`OBSERVATIONAL_EVENT_TYPES`) | **exact** |
| `daemon/package.json` (extend bin) | config | n/a | itself | **exact** |
| `bridge/pom.xml` | config/build | n/a | **(none in repo)** → RESEARCH.md §Code Examples | **none** |
| `bridge/.../BridgeDefinition.java` | extension/config | n/a | `spike/java/.../SpikeDefinition.java` | **exact** |
| `bridge/.../BridgeExtension.java` | extension/controller | event-driven + request-response | `spike/java/.../SpikeExtension.java` | **exact** |
| `bridge/.../Observers.java` + `PullHandlers.java` + `Outbox.java` + `LineJson.java` | service | event-driven | `spike/java/.../SpikeExtension.java` (split-out) | role-match |
| `bridge/.../META-INF/services/com.bitwig.extension.ExtensionDefinition` | config | n/a | `spike/java/.../SpikeExtension.java` header + capabilities doc | partial |
| `bridge/src/test/java/.../*Test.java` | test | n/a | `daemon/src/protocol/*.test.ts` | role-match |
| `pi-pack/skills/analyze/SKILL.md` | skill/config | request-response (via exec) | **(none in repo)** → RESEARCH.md Pattern 7 | **none** |
| `fixtures/representative-clips/*.json` | test-fixture | file-I/O | `daemon/src/protocol/schemas.test.ts` + `check-capabilities-doc.mjs` SELF_TEST_FIXTURE | role-match |

---

## Pattern Assignments

### Assignment 1 — New JSON Schemas (`project-state`, `intent`, `cli-query/{query,result}`)

**Analog:** `schemas/protocol/event.schema.json` + `handshake.schema.json` + `request.schema.json` + `response.schema.json`

Every new schema MUST copy this exact skeleton. The four analogs share one shape; the new files are one-per-purpose.

**Schema skeleton** (`schemas/protocol/event.schema.json` lines 1-9 — copy verbatim, swap `$id`/`title`/enum):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bw-brain.local/schemas/protocol/event.schema.json",
  "title": "Event",
  "description": "...",
  "$comment": "...",
  "type": "object",
  "required": ["version", "type", "timestamp"],
  "additionalProperties": false,
  "properties": { ... }
}
```

**Non-negotiable conventions (verified across all 6 Phase 1 schemas):**
1. `$schema` = `https://json-schema.org/draft/2020-12/schema` (Ajv 2020-12 mode — `reader.ts` line 50).
2. `$id` = `https://bw-brain.local/schemas/<dir>/<name>.schema.json` (absolute https URI; the `gen-types.mjs` `$id`-based deref REQUIRES this — `gen-types.mjs` lines 60-82). New schemas use the same scheme: `https://bw-brain.local/schemas/project-state.schema.json`, `.../intent.schema.json`, `.../cli-query/query.schema.json`, `.../cli-query/result.schema.json`.
3. `additionalProperties: false` at EVERY object level (envelope line 8, event line 9, edit line 9 — this is the trust-spine defense).
4. `version` field with `"pattern": "^\\d+\\.\\d+$"` (every schema carries this; it's the handshake gate input).
5. `type` discriminator as a string `enum` (event line 17, request line 17, response line 17).
6. `required` array is EXHAUSTIVE — every property not in `required` must be genuinely optional (e.g. `payload` is open but constrained).
7. Use `pattern` NOT `format` (no schema uses `format`; `addFormats` is deliberately omitted — `reader.ts` lines 47-49, `schemas.test.ts` lines 20-25).

**Trust-spine pattern** (`schemas/protocol/edit.schema.json` lines 23-42) — apply to `cli-query/result.schema.json`'s `ok:false` arm and to any field that's a hard gate (e.g. `project-state`'s `selection.*Sid` regex):
```json
"payload": {
  "required": ["undoLabel", "operations"],
  "additionalProperties": true,
  "properties": {
    "undoLabel": { "type": "string", "minLength": 1 },
    "operations": { "type": "array", "minItems": 1 }
  }
}
```
`project-state.schema.json` MUST carry `selection.trackSid` / `clipSid` / `deviceSid` as `{ "type": "string", "pattern": "^(trk|clip|dev)_[0-9a-f]{16}$" }` — the Pitfall-2 defense against slot-index identity (RESEARCH.md lines 1128-1131).

**Conditional-shape pattern** (`schemas/protocol/handshake.schema.json` lines 44-66) — apply to `cli-query/result.schema.json` for the `ok:true` vs `ok:false` discriminator:
```json
"allOf": [
  {
    "if": { "properties": { "ok": { "const": false } } },
    "then": { "required": ["error"] }
  }
]
```

**Verification:** every new schema gets a `schemas.test.ts`-style Ajv round-trip (see Assignment 12 — Testing).

---

### Assignment 2 — Extend existing schemas (`event`, `request` enums)

**Analog:** the schemas themselves; the extension point is documented in their `$comment`.

Extend `schemas/protocol/event.schema.json` line 17 enum:
```json
"type": { "type": "string", "enum": ["selection.changed"] }
```
→ add `"track.name_changed"`, `"clip.name_changed"`, `"device.name_changed"`, `"transport.changed"` (RESEARCH.md Pattern 1, lines 422).

Extend `schemas/protocol/request.schema.json` line 17 enum:
```json
"type": { "type": "string", "enum": ["get.selected_clip"] }
```
→ add `"get.selected_device_chain"`, `"get.project_summary"` (RESEARCH.md Pattern 1, lines 424).

**CRITICAL — Pitfall 1 (RESEARCH.md lines 793-798):** every new event type added to `event.schema.json`'s enum MUST ALSO be added to `OBSERVATIONAL_EVENT_TYPES` in `daemon/src/protocol/reader.ts` line 68. A unit test must assert the two sets are equal (Assignment 11).

Do NOT touch `response.schema.json` / `edit.schema.json` / `handshake.schema.json` / `envelope.schema.json` — they are frozen (their `$comment`s say so).

---

### Assignment 3 — Extend `scripts/gen-types.mjs` for new schema dirs

**Analog:** `scripts/gen-types.mjs` itself (lines 29-32 — the dir is hardcoded to one location).

Current scope (`scripts/gen-types.mjs` lines 29-32):
```js
const REPO_ROOT = resolve(__dirname, "..");
const SCHEMA_DIR = join(REPO_ROOT, "schemas", "protocol");
const OUT_DIR = join(REPO_ROOT, "daemon", "src", "gen");
```

And the file scan (`scripts/gen-types.mjs` lines 111-131) reads ONLY `SCHEMA_DIR`. The planner must extend this to scan **multiple** schema roots and preserve the existing `$id`-based deref logic (lines 53-109) unchanged:
- `schemas/protocol/` (existing — 6 files)
- `schemas/` (new — `project-state.schema.json`, `intent.schema.json`)
- `schemas/cli-query/` (new — `query.schema.json`, `result.schema.json`)

The `$id`-based cross-file `$ref` resolution (lines 60-82) ALREADY handles the new `$id`s (`https://bw-brain.local/schemas/project-state.schema.json` etc.) because it suffix-matches against `byId` keys — no logic change needed there. The only change is the input-directory loop. Keep the `BANNER` (lines 42-46) and the `DO NOT EDIT` header convention.

The output `daemon/src/gen/*.ts` files (example: `event.ts`, `envelope.ts`) MUST keep the generated-discriminated-union shape — the envelope's `oneOf` compiles to a TS union (see `daemon/src/gen/envelope.ts` lines 35-107). The new schemas emit their own `daemon/src/gen/{project-state,intent,query,result}.ts`.

---

### Assignment 4 — `daemon/src/transport/uds.ts` (UnixDomainSocketServerTransport)

**Analog:** `daemon/src/transport/tcp.ts` — **this is the closest, most important analog in the phase.** Same role (transport listener), same interface (`Transport`), same data flow (streaming + atomic-line writes), same security-invariant shape (loopback-host guard → 0600-file-mode guard).

**Interface contract** (`daemon/src/transport/transport.ts` lines 21-37 — implement verbatim):
```typescript
export interface Transport {
  onMessage(handler: (chunk: unknown) => void): void;
  send(msg: object): void;   // single atomic-line write: JSON.stringify(msg) + "\n"
  close(): void;
}
```

**File header comment pattern** (`daemon/src/transport/tcp.ts` lines 1-19) — copy the SECURITY INVARIANT block structure, swap "loopback bind" → "0600 file mode":
```typescript
// daemon/src/transport/uds.ts
//
// UnixDomainSocketServerTransport — the daemon's CLI-query listener (D-07).
//
// SECURITY INVARIANT (RESEARCH.md Pitfall 5 / Pattern 3): the socket file is
// created with mode 0600 ONLY. chmod(socketPath, 0o600) runs immediately after
// listen(). The mode is NEVER omitted (net.createServer().listen(path) defaults
// to a permissive mask — would expose the daemon to other local users). The
// constructor additionally REFUSES to start if the chmod fails, so the
// permission cannot be widened by accident.
```

**Imports pattern** (`daemon/src/transport/tcp.ts` lines 21-22):
```typescript
import * as net from "node:net";
import type { Transport } from "./transport.js";   // NodeNext: .js ext on .ts source
```
Add `import { chmod } from "node:fs/promises";`.

**Constructor guard pattern** (`daemon/src/transport/tcp.ts` lines 50-59) — the UDS analog is a chmod-failure refusal instead of a host-refusal:
```typescript
constructor(opts: UdsServerTransportOptions) {
  const host = opts.host ?? LOOPBACK_HOST;     // ← TCP version
  if (host !== LOOPBACK_HOST) {
    throw new Error(`TcpServerTransport refuses non-loopback bind ...`);
  }
  // UDS version: chmod(socketPath, 0o600) after listen(); throw if it fails.
}
```

**Server setup + per-connection socket handling** (`daemon/src/transport/tcp.ts` lines 63-82) — copy this structure; UDS replaces `net.createServer((socket) => {...})` with the same callback shape (Node's `net` API is identical for TCP and UDS; only the `listen()` arg differs — `listen(path)` vs `listen(port, host)`):
```typescript
this.server = net.createServer((socket) => {
  this.sockets.add(socket);
  socket.setEncoding("utf8");
  socket.on("data", (chunk: Buffer | string) => this.handler(chunk));
  const cleanup = (): void => { this.sockets.delete(socket); };
  socket.on("error", cleanup);   // per-socket errors cleaned up, not crashed
  socket.on("close", cleanup);
});
this.server.on("error", (err) => { throw err; });   // server-level errors throw
this.server.listen(this.port, this.host);            // ← UDS: this.server.listen(socketPath)
```

**`send` atomic-line write pattern** (`daemon/src/transport/tcp.ts` lines 88-98) — copy verbatim (Pattern 4: one `JSON.stringify` + one `"\n"` + one write per socket):
```typescript
send(msg: object): void {
  if (this.sockets.size === 0) {
    throw new Error("TcpServerTransport.send: no connected client");
  }
  const line = JSON.stringify(msg) + "\n";
  for (const socket of this.sockets) { socket.write(line); }
}
```

**`onMessage` + `close`** (`daemon/src/transport/tcp.ts` lines 84-86, 100-106) — copy verbatim.

**Verification:** `uds.test.ts` asserts the socket file mode is `0o600` after `listen()` (Pitfall 5 UDS-form — RESEARCH.md lines 821-826).

---

### Assignment 5 — `daemon/src/ingest/normalizer.ts` (STATE-01 raw → RawState)

**Analog:** `daemon/src/protocol/reader.ts` — the parse → validate → transform pipeline.

The normalizer is the SECOND-stage validator (after the envelope). It receives an Ajv-validated envelope payload and produces a `RawState` validated against `schemas/project-state.schema.json`.

**Ajv compile-once pattern** (`daemon/src/protocol/reader.ts` lines 32-59) — copy this exact boot-time compile shape for the new schema:
```typescript
import { Ajv2020 } from "ajv/dist/2020.js";   // named import + .js ext (no exports map)
import projectStateSchema from "../../../schemas/project-state.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(projectStateSchema);
const validateProjectState = ajv.getSchema(projectStateSchema.$id)!;
```

**Validate-then-process pattern** (`daemon/src/protocol/reader.ts` lines 155-172) — the normalizer's core mirrors this: parse/validate, drop-on-invalid (never throw into handler):
```typescript
const lines = new LineBuffer((line) => {
  let msg: unknown;
  try { msg = JSON.parse(line); } catch { return; }   // malformed → drop
  if (!validateEnvelope(msg)) {
    console.error("[reader] envelope validation failed:", JSON.stringify(validateEnvelope.errors));
    return;   // invalid → drop, never process
  }
  enqueue(msg);
});
```
The normalizer's analog: receive validated envelope → if `!validateProjectState(normalized)` log + drop; else hand `RawState` to the state layer.

**Import-ext convention** (`daemon/src/protocol/reader.ts` lines 33-38) — every schema import uses `with { type: "json" }` (requires `resolveJsonModule: true` — `daemon/tsconfig.json` line 16). Relative path depth = `../../../schemas/`.

---

### Assignment 6 — `daemon/src/state/{fingerprint,reconcile}.ts` (STATE-04 pure functions)

**Analog:** `daemon/src/protocol/handshake.ts` — **pure, framework-free, unit-testable function.** This is the canonical pattern for any daemon logic that has no I/O.

**Function shape** (`daemon/src/protocol/handshake.ts` lines 16-46) — copy this structure for `fingerprint()` and `reconcile()`:
```typescript
/** Result of {@link negotiateVersion}. */
export interface NegotiateVersionResult {
  ok: boolean;
  serverVersion?: string;
}

/**
 * Compare MAJOR versions of two `major.minor` version strings.
 * @example
 * negotiateVersion("1.5", "1.3"); // { ok: true, serverVersion: "1.3" }
 */
export function negotiateVersion(
  theirVersion: string,
  ourVersion: string,
): NegotiateVersionResult {
  const theirMajor = theirVersion.split(".")[0];
  const ourMajor = ourVersion.split(".")[0];
  if (theirMajor === ourMajor) return { ok: true, serverVersion: ourVersion };
  return { ok: false };
}
```

`fingerprint.ts` follows the same shape: a pure `(input: FingerprintInput) => string` with a documented `@example`, no side effects, no I/O. The body uses `node:crypto` `createHash("sha256")` (RESEARCH.md lines 448-454). The JSDoc header comment block (`handshake.ts` lines 1-14) explains WHY the function exists + what it's pure against — replicate that discipline.

`reconcile.ts` follows the same shape: pure `(observed: RawState, persisted: StableIdMap) => ReconcileResult` (RESEARCH.md lines 467-492). No socket, no file — the caller (the daemon's ingest path) owns persistence.

**Imports** (`daemon/src/protocol/handshake.ts` has none beyond the type exports) — `fingerprint.ts` adds:
```typescript
import { createHash } from "node:crypto";
```

---

### Assignment 7 — `daemon/src/state/stale-watchdog.ts` (STATE-04 stateful class)

**Analog:** `daemon/src/transport/tcp.ts` — **stateful class with constructor invariants and explicit lifecycle.** The watchdog is a small state machine; `tcp.ts` is the closest class-with-invariants example.

**Class skeleton** (`daemon/src/transport/tcp.ts` lines 43-48) — copy this private-field + constructor shape:
```typescript
export class TcpServerTransport implements Transport {
  private readonly host: string;
  private readonly port: number;
  private readonly server: net.Server;
  private readonly sockets = new Set<net.Socket>();
  private handler: (chunk: unknown) => void = () => {};
  // ...
}
```

`StaleWatchdog` mirrors this with `private lastBridgeAt`, `private freshness: Freshness`, and three explicit methods (`onBridgeMessage`, `onBridgeDisconnect`, `tick`, `assertFresh`) — see RESEARCH.md lines 522-540 for the exact body. The three-state enum (`"live"|"stale"|"disconnected"`) and the explicit-transition discipline is the Pitfall-6 defense (RESEARCH.md lines 828-833).

**Constructor guard** (`daemon/src/transport/tcp.ts` lines 55-59) — the watchdog's `assertFresh()` mirrors this defensive throw style:
```typescript
if (host !== LOOPBACK_HOST) {
  throw new Error(`TcpServerTransport refuses non-loopback bind (got ${host})...`);
}
```
`assertFresh()`:
```typescript
if (this.freshness !== "live") {
  throw new Error(`refuse edit: state freshness is ${this.freshness} ...`);
}
```

---

### Assignment 8 — `daemon/src/state/analyzer-registry.ts` (D-08 framework)

**Analog:** the Ajv registry pattern in `daemon/src/protocol/reader.ts` lines 50-59 — `addSchema` then `getSchema` by `$id`. The analyzer registry is the same shape: `register(a)` then `runAll(raw, ctx)`.

**Registry compile/register pattern** (`daemon/src/protocol/reader.ts` lines 50-59):
```typescript
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(eventSchema);
ajv.addSchema(requestSchema);
// ... register all, THEN look up
const validateEnvelope = ajv.getSchema(envelopeSchema.$id)!;
```

`AnalyzerRegistry` mirrors this: register analyzers at boot, run them against raw state on demand. The M1 registry ships with exactly ONE analyzer (`IntentAnalyzer`); every other slot is empty (D-08). The "below-threshold = refuse" filter (drop `DerivedField` with `confidence < 0.5`) is the registry's `runAll` post-step (RESEARCH.md lines 721).

The `Analyzer` / `DerivedField` / `Assumption` interfaces are NEW (RESEARCH.md Pattern 5, lines 683-718) — no codebase analog; transcribe from RESEARCH.md verbatim.

---

### Assignment 9 — `daemon/src/state/intent-store.ts` (STATE-03 atomic validated read)

**Analog:** `daemon/src/protocol/reader.ts` (validate-then-process) + Assignment 13 (atomic-write, read counterpart).

**Read+validate pattern:** load `~/.bw-brain/intent.json` → Ajv-validate against `intent.schema.json` (Assignment 1 + Assignment 5 compile-once pattern) → return `ProjectIntent` or throw a structured error. NO inference, NO defaults (D-09).

The store is read-only in M1 (D-09 — user-authored by hand). The validate-on-read mirrors `reader.ts` lines 164-170:
```typescript
if (!validateIntent(loaded)) {
  throw new Error(`intent.json invalid: ${JSON.stringify(validateIntent.errors)}`);
}
```

---

### Assignment 10 — `daemon/src/store/atomic-write.ts` (MEM-01 / SC#3)

**Analog:** **NONE in the codebase.** This is a new pattern. Use the RESEARCH.md canonical excerpt (RESEARCH.md Pattern 4, lines 497-509 + lines 1172-1186) verbatim.

The closest in-repo *spirit* is the transport "one atomic-line write" discipline (`daemon/src/transport/tcp.ts` lines 88-98 + `transport.ts` lines 29-34 — `send` issues a SINGLE write of `JSON.stringify(msg) + "\n"`). But atomic *file* writes need temp+rename, which has no existing implementation.

**Canonical implementation** (RESEARCH.md lines 1172-1186 — transcribe verbatim):
```typescript
// daemon/src/store/atomic-write.ts
import { writeFile, rename, mkdir, dirname, basename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

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

**Pitfall-4 defense** (RESEARCH.md lines 814-819): temp file MUST be `join(dir, ...)` — never `/tmp`. The property test (Assignment 12) asserts N parallel writes never produce a half-written file.

---

### Assignment 11 — `daemon/src/store/boundary.ts` (MEM-02 SC#5 assertion)

**Analog:** `scripts/check-capabilities-doc.mjs` — **structural validator that returns an errors[] array and exits non-zero on failure.**

**Validator function shape** (`scripts/check-capabilities-doc.mjs` lines 84-143):
```typescript
function validate(doc) {
  const errors = [];
  // ... structural checks push to errors[]
  return errors;   // empty = pass
}
```

`boundary.ts` is the MEM-02 enforcement: it asserts the daemon's durable-write API surface is exactly `{state-cache, intent-read-only, patch-history-via-apply-only}` — i.e. the `cli-query/query.schema.json` has NO op that writes ephemeral data to `.bw-brain/` (RESEARCH.md lines 846, 1489). The test imports the compiled query schema, enumerates its `op` enum, and asserts none is an ephemeral-write op.

**Error-reporting style** (`scripts/check-capabilities-doc.mjs` lines 164-170) — copy for the test's failure output:
```typescript
if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
```

---

### Assignment 12 — `daemon/src/query/query-server.ts` (D-07 UDS query/response)

**Analog:** `daemon/src/protocol/reader.ts` (the framing/validation orchestrator) wired to `daemon/src/transport/uds.ts` (Assignment 4).

The query-server is the SECOND use of `createReader` (RESEARCH.md code_context line 87 — "Reuse for the CLI-query channel if it speaks JSON-Lines"). It:
1. Constructs a `UnixDomainSocketServerTransport` (Assignment 4).
2. Wires `createReader(transport, handler)` — but with the **cli-query schemas** registered instead of the bridge envelope schemas.
3. The handler dispatches on `msg.op` → translates to internal logic → responds with a `result.schema.json`-validated object.

**Ajv registry for the new schemas** — mirror `reader.ts` lines 50-59 but register `query.schema.json` + `result.schema.json`:
```typescript
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(querySchema);
ajv.addSchema(resultSchema);
const validateQuery = ajv.getSchema(querySchema.$id)!;
```

**Send pattern** — the response goes back over the SAME transport via `transport.send(result)` (one atomic-line write — Pattern 4). The stubs (`bw-arrange`/`bw-automation`/`bw-edit`) emit `{ok:false, error:"not_implemented", availableFrom:"M2"|"M4"}` here.

---

### Assignment 13 — `daemon/src/cli/bw-brain.ts` + `commands/*` + `stubs.ts` + `query-client.ts` (D-05/D-06 multicall)

**Analog:** `daemon/src/cli/dump.ts` — the throwaway commander CLI this REPLACES. Copy the commander setup discipline; replace the single-action body with multicall dispatch.

**Commander + transport/reader wiring** (`daemon/src/cli/dump.ts` lines 18-22, 28-58) — copy the import + `program` structure:
```typescript
#!/usr/bin/env node
import { program } from "commander";
import { TcpServerTransport } from "../transport/tcp.js";
import { StdioTransport } from "../transport/stdio.js";
import { createReader } from "../protocol/reader.js";
```
The multicall entry REPLACES the `TcpServerTransport`/`createReader` imports with `query-client.ts` (UDS client) — the CLI no longer listens; it queries.

**Multicall dispatch** (NO in-repo analog — transcribe RESEARCH.md Pattern 4, lines 614-639 verbatim):
```typescript
import { program } from "commander";
import { basename } from "node:path";

const invokedAs = basename(process.argv[1] ?? process.argv[0] ?? "bw-brain");

const MULTICALL = {
  "bw-focus":      () => import("./commands/focus.js"),
  "bw-project":    () => import("./commands/project.js"),
  // ... 5 live + 3 stubs
};

if (invokedAs in MULTICALL) {
  await MULTICALL[invokedAs as keyof typeof MULTICALL]();
} else {
  for (const loader of Object.values(MULTICALL)) await loader();
  program.parse();
}
```

**Subcommand action handler** (`daemon/src/cli/dump.ts` lines 38-58) — copy the option-parse + action shape for each live command; the action body calls `query(op, payload)` from `query-client.ts` instead of `createReader`:
```typescript
.action((opts: DumpOpts) => {
  const handler = (msg: unknown): void => {
    process.stdout.write(`${JSON.stringify(msg)}\n`, () => process.exit(0));
  };
  // ...bw-focus et al. replace this with: query("focus.export").then(print).catch(...)
});
```

**JSON output discipline** (`daemon/src/cli/dump.ts` line 42) — every command emits `JSON.stringify(...) + "\n"` and `process.exit(0)`. Stubs ALSO exit 0 (CLI-01: structured not-implemented JSON IS the clear failure; non-zero would break shell pipelines — RESEARCH.md lines 663-671).

**`stubs.ts`** — shared emitter (RESEARCH.md lines 664-668):
```typescript
emitStub({ name: "bw-arrange", availableFrom: "M3" });
// → {"version":"1.0","ok":false,"error":"not_implemented","command":"bw-arrange","availableFrom":"M3"}
```

**`query-client.ts`** (D-07 thin client) — analog is `spike/raw-tcp-probe.java` (raw socket client), but TS. Transcribe RESEARCH.md lines 1058-1089 verbatim. It's a one-shot `net.createConnection({path: socketPath})` → write query → read one result line → `JSON.parse` → resolve/reject. The `stateFreshness` field on the result surfaces SC#3 staleness to every CLI consumer (RESEARCH.md lines 598-601).

---

### Assignment 14 — `daemon/src/protocol/reader.ts` (extend `OBSERVATIONAL_EVENT_TYPES`)

**Analog:** itself (`daemon/src/protocol/reader.ts` lines 61-74).

Current set (`daemon/src/protocol/reader.ts` line 68):
```typescript
const OBSERVATIONAL_EVENT_TYPES: ReadonlySet<string> = new Set(["selection.changed"]);
```

Extend to include every new event type added to `event.schema.json` (Assignment 2): `"track.name_changed"`, `"clip.name_changed"`, `"device.name_changed"`, `"transport.changed"`. Add a unit test asserting `OBSERVATIONAL_EVENT_TYPES === event.schema.json's type enum` (Pitfall 1 — RESEARCH.md lines 793-798).

Do NOT change the `isObservationalEvent` predicate (lines 70-74), the bounded-queue logic (lines 109-151), or the `createReader` signature — those are the kept Phase 1 spine.

---

### Assignment 15 — `daemon/package.json` (extend `bin`, retire `dump`)

**Analog:** itself (`daemon/package.json` lines 10-15).

Add the multicall `bin` field (RESEARCH.md lines 643-657) — 9 entries all pointing at `./src/cli/bw-brain.ts`:
```json
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
```

Retire the `"dump": "tsx src/cli/dump.ts"` script (line 13) — `dump.ts` is DELETED per D-06 (RESEARCH.md lines 1297, 402). Keep `"gen:types"`, `"test"`, `"check:capabilities"` unchanged.

No new dependencies (RESEARCH.md §Standard Stack lines 128-139 — zero new npm packages).

---

### Assignment 16 — Java bridge (`bridge/` Maven project)

**Analog (Definition + Extension):** `spike/java/src/com/bwbrain/spike/SpikeDefinition.java` + `SpikeExtension.java` — **EXACT analogs; Phase 2 hardens + splits.** Same Bitwig API family, same lifecycle (`init`/`exit`/`flush`), same observer-enqueue-never-block invariant, same loopback socket.

**`BridgeDefinition.java`** — copy `spike/java/src/com/bwbrain/spike/SpikeDefinition.java` verbatim, change:
- package `com.bwbrain.spike` → `com.bwbrain.bridge`
- class `SpikeDefinition` → `BridgeDefinition`
- `getName()` return `"SpikeProbe"` → `"bw-brain"`
- `getVersion()` `"0.0.1-spike"` → `"0.1.0"`
- new UUID (the spike's is fine to keep, but a fresh one signals production)
- `getRequiredAPIVersion()` stays `21` (line 35 — `extension-api:21`)

**`BridgeExtension.java`** — copy `spike/java/src/com/bwbrain/spike/SpikeExtension.java` structure (lines 41-147), harden:
- Same `LOOPBACK = "127.0.0.1"` + `PORT = 7878` constants (lines 43-44).
- Same `LinkedBlockingQueue<String> outbox` + `volatile boolean running` + daemon writer thread (lines 49-55, 82-85, 100-132).
- Same `skipFirstFire` guard (lines 52-53, 73-77) — Bitwig observers fire once on registration; skip the boot state.
- EXTEND the observer set: add `PinnableCursorClip`, `CursorDevice`, `Transport`, windowed `TrackBank[N=8]` (RESEARCH.md Pattern 1, lines 412-418). The `cursorTrack.position().addValueObserver(cb, 1)` proven call (SpikeExtension lines 69-80) is the template for every new observer.
- ADD pull-handler thread for `get.*` request/response (RESEARCH.md lines 916-920) — reads inbound request lines on the SAME socket, dispatches to `getNotes(...)` / `getRemoteControls()` / TrackBank snapshot.
- The enqueue pattern (`outbox.offer(line)` — SpikeExtension line 96, "NEVER blocks the controller thread") is INVARIANT.

**Outbox.java / LineJson.java / Observers.java / PullHandlers.java** — split-out responsibilities from `SpikeExtension.java`'s monolith. `Outbox.java` = the queue + writer thread (SpikeExtension lines 49, 100-132). `LineJson.java` = Jackson `ObjectMapper` line serialization (replaces the hand-concatenated JSON string at SpikeExtension lines 93-95 — that was spike-quality; production uses Jackson per AGENTS.md).

**`META-INF/services/com.bitwig.extension.ExtensionDefinition`** (RESEARCH.md lines 943-948) — one line, the FQCN:
```text
com.bwbrain.bridge.BridgeDefinition
```
This is the ServiceLoader discovery mechanism (capabilities doc §Transport Decision — NOT a manifest attribute). NO in-repo analog (the spike used the older manifest path); transcribe from RESEARCH.md.

**`bridge/pom.xml`** — NO in-repo analog (spike used plain `javac`). Transcribe RESEARCH.md lines 952-1014 verbatim (DrivenByMoss reference build). Key invariants:
- `<repository><url>https://maven.bitwig.com</url></repository>` (line 962).
- `extension-api:21` with `<scope>provided</scope>` (lines 967-972 — NOT bundled into shade).
- `jackson-databind 2.22.0` (lines 974-978).
- `maven-shade-plugin 3.6.2` with `<outputFile>.../bw-brain.bwextension</outputFile>` + filter excluding `com.bitwig:extension-api` (lines 994-1010).
- Java 21 (`<release>21</release>`).

**`bridge/src/test/java/.../*Test.java`** — analog is `daemon/src/protocol/*.test.ts` (the test discipline), in JUnit 5. Test ONLY pure logic (Outbox queue/drain, LineJson envelope shape, PullHandlers response shape) — cannot integration-test against live Bitwig (RESEARCH.md line 148 + Validation table).

---

### Assignment 17 — `pi-pack/skills/analyze/SKILL.md` (D-10/D-11/D-12)

**Analog:** **NONE in the codebase** (no skills exist). Use RESEARCH.md Pattern 7 (lines 1213-1261) + the OpenClaw conventions (lines 743-748) verbatim.

**SKILL.md frontmatter** (RESEARCH.md lines 1218-1223):
```yaml
---
name: analyze
description: Read the selected Bitwig context via the bw-brain CLI and produce an accurate description + 2-4 next read actions. No invented critique (no analyzers until Phase 3-5).
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-focus","bw-project"]}}}
---
```

Key conventions (RESEARCH.md lines 743-748):
- `user-invocable: true` (default) auto-registers as `/analyze`.
- Do NOT set `command-dispatch: tool` — `/analyze` produces critique (model-mediated), not a deterministic tool output.
- Skill name sanitized to `a-z0-9_`, max 32 chars — `analyze` qualifies.
- The skill body is the prompt; the model invokes `bw-*` CLI via the `exec` tool.

The prompt body (RESEARCH.md lines 1225-1261) is the M1 floor: accurate description + 2-4 read actions, `assumptions[]` on every line, explicit "DO NOT claim sections/motifs/roles" rule (Pitfall 7 — RESEARCH.md lines 835-840).

---

### Assignment 18 — `fixtures/representative-clips/*.json` (SC#1 harness)

**Analog:** `daemon/src/protocol/schemas.test.ts` (seed-example-based test data) + the `SELF_TEST_FIXTURE` inline constant in `scripts/check-capabilities-doc.mjs` lines 45-78.

**Fixture pair shape** (RESEARCH.md lines 1414-1422): each clip is TWO files — `<name>.json` (raw-state fixture) + `<name>.expected.json` (human-authored expected description + assumptions[]). ~20 pairs covering kick/bass/lead/pad/hats/perc, varying lengths, with/without VST params, with/without intent.json.

**Test shape** (RESEARCH.md lines 1424-1431): run `bw-focus export` + `bw-project summary` normalization against the fixture's raw-state, assert output `description` matches `expected.description` (token-overlap > 0.9), assert `assumptions[]` present + non-empty on every line.

The `bw-diff` round-trip (SC#1 100% bar) is a separate property test: for any two synthetic raw-states `a`, `b`, `computeStateDiff(b', b).isEmpty()` after `b' = applyDiff(a, diff(a,b))` (RESEARCH.md lines 1426-1431).

---

## Shared Patterns

These cross-cut every plan in the phase. Apply to ALL new/modified files unless noted.

### Shared Pattern A — Ajv 2020-12 compiled-once-at-boot (every daemon boundary)

**Source:** `daemon/src/protocol/reader.ts` lines 32-59.
**Apply to:** `ingest/normalizer.ts`, `query/query-server.ts`, `state/intent-store.ts`, `state/analyzer-registry.ts` (if it validates derived output), the extended `reader.ts`.

```typescript
import { Ajv2020 } from "ajv/dist/2020.js";   // named import + .js ext (no exports map)
import someSchema from "../../../schemas/<dir>/<name>.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(someSchema);
const validateSome = ajv.getSchema(someSchema.$id)!;
```

**Non-negotiables (verified `daemon/src/protocol/schemas.test.ts` lines 16-25, `reader.ts` lines 44-49):**
- `Ajv2020` named import with `.js` extension (ajv 8.20 ships no exports map; deep subpath resolves at runtime but not under tsc NodeNext).
- `{ allErrors: true, strict: false }`.
- `addFormats` is NOT used (no schema uses `format`; CJS interop not callable as static NodeNext import).
- Validate at the boundary, NEVER let invalid structures reach handler logic (`reader.ts` lines 164-170).

### Shared Pattern B — Loopback-only / 0600-file-mode security invariant (Pitfall 5)

**Source:** `daemon/src/transport/tcp.ts` lines 1-13, 50-59.
**Apply to:** `daemon/src/transport/uds.ts` (the 0600 chmod guard); the bridge Java socket (`LOOPBACK = "127.0.0.1"` — `spike/java/.../SpikeExtension.java` line 43).

```typescript
// TCP form (tcp.ts lines 50-59):
const host = opts.host ?? LOOPBACK_HOST;
if (host !== LOOPBACK_HOST) {
  throw new Error(`TcpServerTransport refuses non-loopback bind (got ${host})...`);
}
// UDS form (new — RESEARCH.md Pattern 3): chmod(socketPath, 0o600) after listen();
// constructor REFUSES to start if chmod fails.
```

The constructor GUARD (not just a default) is the defense-in-depth — a future call site cannot widen the bind by accident.

### Shared Pattern C — Atomic-line writes (Pattern 4) on every Transport

**Source:** `daemon/src/transport/transport.ts` lines 29-34 + `tcp.ts` lines 88-98 + `stdio.ts` lines 41-43.
**Apply to:** `daemon/src/transport/uds.ts` `send()`; the bridge Java socket writes (`spike/java/.../SpikeExtension.java` line 122).

```typescript
send(msg: object): void {
  const line = JSON.stringify(msg) + "\n";   // ONE stringify + ONE "\n" + ONE write
  for (const socket of this.sockets) { socket.write(line); }
}
```

`JSON.stringify` escapes embedded newlines, so one write = one complete JSON value per line (jsonlines.org-compliant). The bridge Java analog: `out.write(line.getBytes(StandardCharsets.UTF_8)); out.flush();` (SpikeExtension lines 122-123).

### Shared Pattern D — NodeNext ESM `.js`-import rule

**Source:** `daemon/tsconfig.json` lines 2-8; verified in every `.ts` file.
**Apply to:** EVERY new `.ts` file under `daemon/src/`.

```typescript
// Source file is line-buffer.ts → import path ends in .js:
import { LineBuffer } from "./line-buffer.js";
import type { Transport } from "../transport/transport.js";
import envelopeSchema from "../../../schemas/protocol/envelope.schema.json" with { type: "json" };
```

- All relative imports in `.ts` sources MUST end in `.js` (runtime requirement even though source is `.ts`).
- `resolveJsonModule: true` (tsconfig line 16) required for `with { type: "json" }` schema imports.
- `target: "ES2023"`, `module: "NodeNext"`, `strict: true` (tsconfig lines 10-15).

### Shared Pattern E — Validate-at-the-boundary, drop-never-throw

**Source:** `daemon/src/protocol/reader.ts` lines 155-172.
**Apply to:** `query/query-server.ts`, `ingest/normalizer.ts`, `state/intent-store.ts`.

```typescript
try { msg = JSON.parse(line); } catch { return; }   // malformed → drop, NEVER throw (T-2-02)
if (!validateEnvelope(msg)) {
  console.error("[reader] envelope validation failed:", JSON.stringify(validateEnvelope.errors));
  return;   // invalid → drop, never process
}
```

A bad peer cannot crash the daemon by sending garbage. Every new boundary (cli-query, raw-state ingest, intent read) replicates this.

### Shared Pattern F — Atomic file writes (POSIX temp+rename) for every durable write

**Source:** RESEARCH.md Pattern 4 lines 497-509 + 1172-1186 (no in-repo analog).
**Apply to:** `daemon/src/store/atomic-write.ts` (the primitive), `daemon/src/store/state-cache.ts`, `daemon/src/state/intent-store.ts` (if it ever writes — M1 is read-only), any future durable write.

```typescript
const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
await rename(tmp, path);   // atomic on POSIX, same filesystem
```

**Non-negotiables (Pitfall 4 — RESEARCH.md lines 814-819):**
- Temp file MUST be `join(dirname(dest), ...)` — cross-filesystem rename is non-atomic.
- `mkdir(dir, { recursive: true })` before write (the `.bw-brain/` dir may not exist yet).
- The daemon is the SOLE writer to `.bw-brain/` (MEM-01).

### Shared Pattern G — Trust-spine at schema level (`additionalProperties: false` + required gates)

**Source:** `schemas/protocol/edit.schema.json` lines 23-42 (undoLabel minLength 1 + operations minItems 1).
**Apply to:** every new schema (`project-state`, `intent`, `cli-query/{query,result}`); the `selection.*Sid` regex gates in `project-state`.

The schema itself enforces the trust model — the bridge/daemon refuse invalid structures by validation alone, no runtime check needed. `project-state.schema.json`'s `selection.trackSid` pattern `^trk_[0-9a-f]{16}$` is the Pitfall-2 defense (slot-index can never match a fingerprint ID).

### Shared Pattern H — Test discipline (vitest property + unit, seeded RNG for reproducibility)

**Source:** `daemon/src/protocol/line-buffer.test.ts` (property test with mulberry32 RNG, lines 15-25, 34-57) + `schemas.test.ts` (Ajv round-trip, lines 53-92) + `handshake.test.ts` (pure-function cases, lines 15-26).
**Apply to:** every new `*.test.ts` under `daemon/src/`.

- **Pure functions** (`fingerprint.ts`, `reconcile.ts`, `handshake.ts`) → unit cases + `@example` assertions (`handshake.test.ts` shape).
- **Stateful classes** (`stale-watchdog.ts`, `uds.ts`) → constructor-guard assertions + lifecycle transitions.
- **Framing/buffering** → seeded-RNG property tests (`line-buffer.test.ts` shape — deterministic failures).
- **Schemas** → Ajv round-trip: valid example passes + ≥1 counter-example fails (`schemas.test.ts` shape).
- **Atomic writes** → N-parallel-writes property test (RESEARCH.md lines 1390, 1443 — final file always parses + is one of the inputs).
- **Bridge Java tests** → JUnit 5, pure logic only (queue/drain, line shape, response shape — no live Bitwig).

---

## No Analog Found

Files with no close in-repo match — the planner references the RESEARCH.md excerpt (cited) instead of a codebase analog.

| File | Role | Data Flow | Reason | Use Instead |
|------|------|-----------|--------|-------------|
| `daemon/src/store/atomic-write.ts` | utility | file-I/O | No atomic-write primitive exists; Phase 1 transports write sockets, not files | RESEARCH.md Pattern 4 lines 497-509, 1172-1186 (verbatim) |
| `bridge/pom.xml` | config/build | n/a | No Java build exists; spike used plain `javac` | RESEARCH.md lines 952-1014 (DrivenByMoss reference, verbatim) |
| `bridge/.../META-INF/services/com.bitwig.extension.ExtensionDefinition` | config | n/a | Spike used the older manifest path; ServiceLoader resource is new | RESEARCH.md lines 943-948 (one-line FQCN) |
| `pi-pack/skills/analyze/SKILL.md` | skill | request-response (via exec) | No skills exist in the repo | RESEARCH.md Pattern 7 lines 1213-1261 + OpenClaw conventions lines 743-748 |
| `daemon/src/cli/bw-brain.ts` multicall dispatch | controller/CLI | request-response | `argv[0]` multicall dispatch is new; `dump.ts` is single-command | RESEARCH.md Pattern 4 lines 614-639 (verbatim) + `dump.ts` commander skeleton |
| `daemon/src/cli/query-client.ts` | service/client | request-response | No TS socket-client analog (only server transports + the Java spike client) | RESEARCH.md lines 1058-1089 (verbatim) + `spike/raw-tcp-probe.java` (raw-socket spirit) |
| `daemon/src/state/analyzer-registry.ts` interfaces | model | transform | The `Analyzer`/`DerivedField`/`Assumption` interfaces are new (D-08 framework) | RESEARCH.md Pattern 5 lines 683-718 (verbatim) |

---

## Metadata

**Analog search scope:**
- `daemon/src/**/*.ts` (16 files — full Phase 1 spine: transport, protocol, cli, gen)
- `schemas/protocol/*.json` (6 frozen schemas)
- `scripts/*.mjs` (2 — gen-types, check-capabilities-doc)
- `spike/**` (4 — Java spike Definition/Extension, raw-tcp-probe, JS extension)
- `daemon/package.json`, `daemon/tsconfig.json` (config conventions)
- `.claude/AGENTS.md` (locked stack + conventions authority)

**Files scanned:** 29 source files + 2 phase artifacts (CONTEXT.md, RESEARCH.md) + AGENTS.md.
**Strong analogs selected:** 12 (stopped at the count where every new file has a defensible pattern source — either an in-repo analog or a RESEARCH.md canonical excerpt).
**Pattern extraction date:** 2026-06-27.

**Coverage summary:**
- Files with EXACT analog (same role + same data flow, copy-and-harden): 8 schema files, `uds.ts`, `BridgeDefinition.java`, `BridgeExtension.java`, `reader.ts`/`package.json` self-extends.
- Files with ROLE-MATCH analog (same role, adapt the pattern): all daemon state/store/ingest/query/cli modules; bridge split-out modules; bridge tests; fixtures.
- Files with NO analog (use RESEARCH.md verbatim): `atomic-write.ts`, `pom.xml`, ServiceLoader resource, `SKILL.md`, multicall dispatch, `query-client.ts`, analyzer interfaces.
