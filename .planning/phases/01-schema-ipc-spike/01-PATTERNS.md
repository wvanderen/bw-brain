# Phase 1: Schema & IPC Spike - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 23 (new — greenfield, 0 modified)
**Analogs found:** 23 / 23 (all mapped to authoritative sources; this is a greenfield spike so "analog" = the locked convention/reference to replicate, not an existing source file)

> **GREENFIELD NOTICE.** Per CONTEXT.md §code_context: *"Reusable Assets: None — only `docs/seed.md`, `.planning/`, and `.claude/` exist. No source code, no schemas yet."* Verified by `git ls-files` this session: the repo contains zero `.ts`/`.js`/`.mjs`/`.java`/schema files. **There is no in-repo code to copy from.** For each file below, the "Closest Analog" column points to the **authoritative source** the implementer must replicate — drawn from three locked documents:
> - **`RESEARCH.md`** — Patterns 1–5, the Code Examples block, and the validation/wave-0 file list (these contain ready-to-transcribe code/schema excerpts).
> - **`.claude/AGENTS.md`** — the locked stack (Node 24 LTS / TS 5.7+ / Ajv 8.20.0 / JSON Schema 2020-12 / `com.bitwig:extension-api:21`), the "JsApi is a sandboxed subset" fact, the "TCP is the only option" fact, and the capabilities table.
> - **`docs/seed.md`** — the sketched JSON-Lines envelope and the four example message shapes the frozen schemas must generalize.
> - **DrivenByMoss reference** (cited in RESEARCH.md §Sources) — the authoritative Bitwig API pattern for the throwaway spike extension.
>
> Match-quality legend for a greenfield repo:
> - **exact** — source provides a complete, transcribable code/schema excerpt (just copy + name the file).
> - **pattern** — source provides the structural pattern + convention; implementer writes the body.
> - **reference** — only an external reference (DrivenByMoss / in-app guide) exists; no transcribable excerpt.

## File Classification

| New File | Role | Data Flow | Closest Analog (authoritative source) | Match |
|---|---|---|---|---|
| `daemon/src/protocol/line-buffer.ts` | utility | streaming (byte→message reassembly) | `RESEARCH.md` Pattern 2 (lines 278–298) — full `LineBuffer` class | exact |
| `daemon/src/protocol/line-buffer.test.ts` | test | property test (random byte-splits) | `RESEARCH.md` §Validation (PROBE-02/SC#3 framing, line 579) + AGENTS.md "Vitest, ESM-native" | pattern |
| `daemon/src/transport/transport.ts` | provider/interface | streaming abstraction | `RESEARCH.md` Pattern 1 (lines 261–276) — full `Transport` interface | exact |
| `daemon/src/transport/tcp.ts` | provider | streaming (localhost TCP) | `RESEARCH.md` Pattern 1 + Pitfall 5 (`127.0.0.1`-bind rule, lines 419–422) | pattern |
| `daemon/src/transport/stdio.ts` | provider | streaming (stdin/stdout) | `RESEARCH.md` Pattern 1 comment ("StdioTransport reads process.stdin…", line 276) + AGENTS.md "TCP is the only option" (stdio = documented fallback) | pattern |
| `daemon/src/protocol/reader.ts` | service (orchestrator) | streaming (transport→buffer→validate→handler) | `RESEARCH.md` Code Examples "Daemon reader wiring" (lines 488–507) | exact |
| `daemon/src/cli/dump.ts` | controller/CLI | request-response (one-shot proof print) | AGENTS.md "commander 15.0.0 … strict-by-default, async-action" (lines 56, 160) + `RESEARCH.md` D-08 (lines 24, 173) | pattern |
| `schemas/protocol/envelope.schema.json` | model/schema | schema-definition | `RESEARCH.md` Code Examples "Envelope schema" (lines 433–458) — full JSON Schema 2020-12 doc | exact |
| `schemas/protocol/event.schema.json` | model/schema | schema-definition | `docs/seed.md` event example (lines 368–380) + `RESEARCH.md` selection.changed example (lines 462–464) | pattern |
| `schemas/protocol/request.schema.json` | model/schema | schema-definition | `docs/seed.md` request example (lines 382–389) `get.selected_clip` | pattern |
| `schemas/protocol/response.schema.json` | model/schema | schema-definition | `docs/seed.md` response example (lines 391–402) `{id, ok, payload}` | pattern |
| `schemas/protocol/edit.schema.json` | model/schema | schema-definition | `docs/seed.md` edit example (lines 404–415) `apply.patch`+`undoLabel` + seed patch model (lines 248–273) | pattern |
| `schemas/protocol/handshake.schema.json` | model/schema | schema-definition | `RESEARCH.md` Pattern 3 (lines 300–308) — `hello`/`hello.response` JSONL examples | pattern |
| `daemon/src/protocol/schemas.test.ts` | test | unit (Ajv valid/invalid assertions) | `RESEARCH.md` §Validation (PROBE-02/SC#3 schema, line 580) + AGENTS.md "Ajv standalone-compiled validators" (lines 64–65) | pattern |
| `daemon/src/protocol/handshake.test.ts` | test | unit (version accept/reject) | `RESEARCH.md` §Validation (PROBE-02/SC#3 handshake, line 581) + Pattern 3 | pattern |
| `daemon/src/gen/*.ts` | generated (codegen) | transform (JSON Schema → TS) | AGENTS.md "json-schema-to-typescript … `json2ts -i 'schemas/**/*.json' -o src/gen/`" (lines 54, 64) | exact (tool-defined) |
| `daemon/package.json` | config | — | `RESEARCH.md` §Installation (lines 102–110) — exact `npm i` invocation + pinned versions | exact |
| `daemon/tsconfig.json` | config | — | AGENTS.md stack: "TypeScript 5.7+ … Node 24 LTS … native ESM" (lines 34–35, 162) | pattern |
| `daemon/vitest.config.ts` | config | — | AGENTS.md "Vitest … ESM-native, fast" (lines 67) + `RESEARCH.md` §Validation (line 567) | pattern |
| `spike/bitwig-extension.js` | spike/throwaway (D-07) | event-driven (Bitwig observers) | DrivenByMoss `OSCControllerSetup.java` via `RESEARCH.md` Code Examples (lines 466–484) — **transfers per D-07 (same API surface); JS surface unverified (see note)** | reference |
| `spike/raw-tcp-probe.java` | spike/throwaway (Track B) | request-response (one-shot socket test) | DrivenByMoss OSC pattern (`RESEARCH.md` lines 466–484) + `java.net.ServerSocket` — no direct analog exists | reference |
| `docs/bitwig-capabilities.md` | doc (PROBE-01 output) | — (human-verified finding) | `RESEARCH.md` §Capability Probe Design Questions skeleton (lines 344–392) — one section per item, every gap → Mitigation | pattern |
| `scripts/check-capabilities-doc.mjs` | utility/script | file-I/O (grep-driven structural check) | `RESEARCH.md` §Validation (PROBE-01/SC#2, line 582) — "structural check … grep-driven structural validator" | pattern |

## Pattern Assignments

### `daemon/src/protocol/line-buffer.ts` (utility, streaming)

**Analog:** `RESEARCH.md` Pattern 2 (lines 278–298) — the partial-line buffer.

**Core pattern — transcribe verbatim, then add a JSDoc block citing jsonlines.org:**
```typescript
// Source: standard newline-delimited JSON framing (jsonlines.org + common practice)
export class LineBuffer {
  private buf = "";
  constructor(private readonly onLine: (line: string) => void) {}
  feed(chunk: string | Buffer): void {
    this.buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, ""); // tolerate \r\n (jsonlines.org)
      this.buf = this.buf.slice(i + 1);
      if (line.length > 0) this.onLine(line);              // blank lines not valid JSON Lines
    }
  }
}
```

**Convention to honor:** ESM (`export class`), accept `string | Buffer` (both transports deliver bytes), tolerate `\r\n`, skip blank lines. **Do not** add error handling here — `feed` is pure framing; JSON.parse + validation happen in the reader (see `reader.ts`).

---

### `daemon/src/protocol/line-buffer.test.ts` (test, property test)

**Analog:** `RESEARCH.md` §Validation row PROBE-02/SC#3 framing (line 579): *"feed random byte-splits of N messages → get N whole messages."*

**Test shape (vitest ESM):**
```typescript
import { describe, it, expect } from "vitest";
import { LineBuffer } from "./line-buffer.js";
// Property: for any random chunking of N "\n"-terminated lines,
// feeding the chunks in order yields exactly N lines, byte-identical to the originals.
// Use a seeded RNG (e.g. mulberry32) so failures are reproducible.
```

**Convention to honor:** AGENTS.md line 67 — Vitest, ESM-native. **Include the `.js` extension in imports** (NodeNext ESM resolution). Assert: (a) mid-`\n` splits reassemble, (b) trailing partial line is retained until next feed, (c) `\r\n` tolerated, (d) blank lines dropped. This is SC#3's "partial-line buffer" requirement made executable.

---

### `daemon/src/transport/transport.ts` (provider/interface, streaming)

**Analog:** `RESEARCH.md` Pattern 1 (lines 261–276) — the transport abstraction (D-05 core: makes TCP and stdio swappable).

**Transcribe verbatim:**
```typescript
// Source: standard Node.js pattern + AGENTS.md stack guidance
export interface Transport {
  onMessage(handler: (msg: unknown) => void): void;
  send(msg: object): void;        // throws on unrecoverable write failure
  close(): void;
}
```

**Convention to honor:** The reader (`reader.ts`) consumes ONLY this interface — never `net.Socket` directly (this is what makes the kept scaffolding transport-agnostic per D-05). `send` throws on failure (do not silently swallow — edits must be ack'd or errored).

---

### `daemon/src/transport/tcp.ts` (provider, streaming)

**Analog:** `RESEARCH.md` Pattern 1 (lines 274–276) + Pitfall 5 (lines 419–422).

**Hard rule (security invariant — RESEARCH.md Pitfall 5):** bind `127.0.0.1` ONLY. Never `0.0.0.0`. `net.createServer().listen(port, "127.0.0.1")` — the second arg is the one security-relevant decision in the spike.

**Pattern:** Implement `Transport` from `transport.ts`. On `'connection'`, wrap the `net.Socket`'s `'data'` events into `onMessage(chunk)` calls; `send` does a single `socket.write(JSON.stringify(msg) + "\n")` (atomic-line write, Pattern 4). Close on socket `'error'`/`'close'`.

**Convention:** localhost-only, one `\n`-terminated write per message (Pattern 4 — `JSON.stringify` already escapes embedded newlines, so one write = one line).

---

### `daemon/src/transport/stdio.ts` (provider, streaming)

**Analog:** `RESEARCH.md` Pattern 1 comment (line 276): *"StdioTransport reads process.stdin, writes process.stdout."* + AGENTS.md line 125: *"TCP is the only option … stdio only for ephemeral CLI invocations."*

**Pattern:** Implement `Transport`. `onMessage` pipes `process.stdin` chunks through; `send` writes `JSON.stringify(msg) + "\n"` to `process.stdout` via a single `write` call (atomic-line, Pattern 4). `close` calls `process.stdin.destroy()`.

**Note for planner:** stdio is the **documented fallback** in the Transport Decision Rule (RESEARCH.md lines 178–186, outcome #3), not the expected path. It exists in the spike so the reader scaffolding is provably transport-agnostic (D-05). Do not over-invest here.

---

### `daemon/src/protocol/reader.ts` (service, streaming orchestrator)

**Analog:** `RESEARCH.md` Code Examples "Daemon reader wiring" (lines 488–507) — transcribe the wiring.

**Transcribe (adapt imports to final file paths):**
```typescript
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { LineBuffer } from "./line-buffer.js";
import { TcpServerTransport } from "../transport/tcp.js";
import envelopeSchema from "../../../../schemas/protocol/envelope.schema.json" with { type: "json" };

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(envelopeSchema);  // pre-compiled at boot (AGENTS.md: standalone-compiled validators)

const transport = new TcpServerTransport({ host: "127.0.0.1", port: 7878 });
const lines = new LineBuffer((line) => {
  let msg: unknown;
  try { msg = JSON.parse(line); } catch { return; /* drop malformed, never throw */ }
  if (!validate(msg)) { console.error(validate.errors); return; }
  onMessage(msg);
});
transport.onMessage((chunk) => lines.feed(chunk));
```

**Conventions to honor (all from AGENTS.md / RESEARCH.md):**
- **Ajv pre-compiled at boot**, not per-message (AGENTS.md lines 64–65).
- **Try/catch around `JSON.parse`** — malformed lines dropped, never thrown (RESEARCH.md Pitfall — LineBuffer pattern).
- **Validate before process** (RESEARCH.md §Security V5 — JSON Schema at the boundary IS the contract-freeze output).
- Import the schema with `with { type: "json" }` (Node 22.22.3 / Node 24 native JSON modules; `--experimental` not needed on ≥22.15).

---

### `daemon/src/cli/dump.ts` (controller/CLI, request-response proof print)

**Analog:** AGENTS.md line 56/160 — commander 15.0.0, strict-by-default, async-action support. `RESEARCH.md` D-08 (lines 24, 173) — *"raw `bw-brain-spike dump`-style command that prints the received `selection.changed` event as validated JSON."*

**Pattern (commander ESM):**
```typescript
#!/usr/bin/env node
import { program } from "commander";

program
  .name("bw-brain-spike")
  .command("dump")
  .description("Print the next received selection.changed event as validated JSON (proof of pipe). Exits 0.")
  .option("-p, --port <number>", "TCP port", "7878")
  .action(async (opts) => {
    // wire reader.ts; on first valid selection.changed → console.log(JSON.stringify(msg)); process.exit(0)
  });

program.parse();
```

**Conventions to honor:**
- **Exit 0 on a validated `selection.changed`** — this IS SC#1 (`RESEARCH.md` line 578: `npx tsx src/cli/dump.ts && echo $?` exits 0, stdout validates vs envelope).
- **No pretense of being a real command** (D-08) — Phase 2 designs `bw-focus`/`bw-project` fresh. Keep it bare.
- Strict-by-default commander (AGENTS.md line 56); `--port` default `7878` (matches `RESEARCH.md` line 499 + the architecture diagram).

---

### `schemas/protocol/envelope.schema.json` (model/schema, schema-definition)

**Analog:** `RESEARCH.md` Code Examples "Envelope schema" (lines 433–458) — full JSON Schema 2020-12 doc. **Transcribe verbatim.**

**Convention to honor (locked in AGENTS.md line 37):** JSON Schema **Draft 2020-12** (not draft-07) — `$schema: "https://json-schema.org/draft/2020-12/schema"`. Use `$defs` (not `definitions`). `$id` with the `https://bw-brain.local/schemas/protocol/...` scheme so cross-file `$ref` resolves. Envelope is `additionalProperties: false` with a `oneOf` discriminator branch into the five message-type schemas (event/request/response/edit/handshake). This is the **single cross-language source of truth** (AGENTS.md line 37, 62) — Java bridge, TS daemon, and CLI all bind from it.

---

### `schemas/protocol/event.schema.json` (model/schema)

**Analog:** `docs/seed.md` event example (lines 368–380) + `RESEARCH.md` selection.changed example (lines 462–464).

**Generalize from seed.md (the spike freezes this):**
```jsonl
{"version":"1.0","type":"selection.changed","timestamp":1773501001,"payload":{"trackId":"trk_5","clipId":"clip_19","deviceId":"dev_2"}}
```
→ schema: `type` enum includes `"selection.changed"`; `payload` for selection.changed = `{trackId?, clipId?, deviceId?}` (all optional — selection can be empty). Freeze only the events the 1-event spike honestly validates (Pitfall 4: over-freezing locks guesses). Mark others `"Phase 2-extensible"`.

**Convention:** `$ref` the envelope; constrain `type` via enum; `timestamp` is unix-seconds (number), sender-originated.

---

### `schemas/protocol/request.schema.json` (model/schema)

**Analog:** `docs/seed.md` request example (lines 382–389):
```json
{ "id": "req_91", "type": "get.selected_clip" }
```
→ schema: `type` enum includes `"get.selected_clip"` (and the other `get.*` the spike freezes); `id` required on requests (correlation). Optional `payload` for parameterized requests.

**Convention:** `id` is the request/response correlation key — required on every request, echoed on its response.

---

### `schemas/protocol/response.schema.json` (model/schema)

**Analog:** `docs/seed.md` response example (lines 391–402):
```json
{ "id": "req_91", "ok": true, "payload": { "clipId": "clip_19", "notes": [...] } }
```
→ schema: `id` required (echoes request), `ok: boolean` required, `payload` shape depends on the originating request type (use a discriminator on the request type carried through, or leave `payload` open `{}` for the spike and tighten in Phase 2 — Pitfall 4).

---

### `schemas/protocol/edit.schema.json` (model/schema)

**Analog:** `docs/seed.md` edit example (lines 404–415) `apply.patch` + `undoLabel`, cross-referenced with the patch model (lines 248–273: `scope`/`operations`/`rationale`/`reversible`) and PROJECT.md trust model (AGENTS.md line 17: *"scope/operations/rationale/reversibility/risk; preview before apply; undo labels mandatory"*).

**Required fields on an edit message:**
- `type: "apply.patch"`
- `id` (it's a request — correlation)
- `payload.undoLabel` — **mandatory** (PROJECT.md / seed.md line 411: `"bw-brain: subtle variation"`). This field is the trust-spine; the bridge refuses any edit without it.
- `payload.operations` — array of typed ops (seed.md lines 255–269: `midi_velocity_scale`, `insert_notes`, …).

**Convention:** `undoLabel` is non-optional on edits — this enforces the trust model at the schema level. D-01's deep-verify of undo behavior directly informs whether `undoLabel` is honored natively or only used for daemon-authoritative revert (record finding in `bitwig-capabilities.md`).

---

### `schemas/protocol/handshake.schema.json` (model/schema)

**Analog:** `RESEARCH.md` Pattern 3 (lines 300–308):
```jsonl
{"version":"1.0","type":"hello","payload":{"capabilities":["events","requests"]}}
{"version":"1.0","type":"hello.response","ok":true,"payload":{"serverVersion":"1.0"}}
```
→ schema: `type` enum `["hello", "hello.response"]`; `version` pattern `"^\d+\.\d+$"` (major.minor); major-version mismatch → reject (prevents protocol-drift silent corruption, RESEARCH.md §Security).

**Convention:** Handshake is the first message on every connection (Pattern 3). Reject on major-version mismatch; the test `handshake.test.ts` makes this executable.

---

### `daemon/src/protocol/schemas.test.ts` (test, unit)

**Analog:** `RESEARCH.md` §Validation row PROBE-02/SC#3 schema (line 580) + AGENTS.md "Ajv standalone-compiled validators" (lines 64–65).

**Pattern:** For each frozen schema under `schemas/protocol/`: Ajv-compile it; assert a representative valid example passes and at least one counter-example fails. Load example/counter-example fixtures inline or from `schemas/protocol/examples/` if added.

**Convention:** Vitest ESM, `.js` import extensions. Use `addFormats(ajv)` (AGENTS.md line 58) since the envelope uses formats. This test guards SC#3 ("every frozen message validates against its schema").

---

### `daemon/src/protocol/handshake.test.ts` (test, unit)

**Analog:** `RESEARCH.md` §Validation row PROBE-02/SC#3 handshake (line 581) + Pattern 3.

**Pattern:** Two cases — (1) matching major version → `hello.response` with `ok: true`; (2) mismatching major version → reject (no `hello.response`, or `ok: false`).

---

### `daemon/src/gen/*.ts` (generated codegen, transform)

**Analog:** AGENTS.md line 54 + 64: *"json-schema-to-typescript (`json2ts`) 15.0.4 — Generate `src/gen/*.ts` from `/schemas/*.json`. Run via `package.json` script on schema change."* Exact CLI: `json2ts -i 'schemas/**/*.json' -o src/gen/`.

**Convention:**
- **Generated files are committed** (AGENTS.md line 64: *"Generated files are committed for bridge-side readability"*).
- Add an `npm run gen:types` script in `daemon/package.json` that runs the `json2ts` command above.
- Do NOT hand-edit `gen/*` — regenerate on schema change. Treat as a build artifact with a `// GENERATED — DO NOT EDIT` header (json2ts emits this automatically).

---

### `daemon/package.json` (config)

**Analog:** `RESEARCH.md` §Installation (lines 102–110) — exact `npm i` invocation with pinned versions.

**Transcribe deps from RESEARCH.md line 104–105 (versions are pinned + verified this session):**
- runtime: `ajv@8.20.0`, `ajv-formats@3.0.1`, `commander@15.0.0`
- dev: `typescript`, `tsx@4.22.4`, `vitest@4.1.9`, `json-schema-to-typescript@15.0.4`, `@types/node`
- scripts: `"gen:types": "json2ts -i '../schemas/protocol/**/*.json' -o src/gen/"`, `"test": "vitest run"`, `"dump": "tsx src/cli/dump.ts"`
- `"type": "module"` (ESM — AGENTS.md line 162, RESEARCH.md stack)

---

### `daemon/tsconfig.json` (config)

**Analog:** AGENTS.md stack — *"TypeScript 5.7+ … Node 24 LTS … native ESM"* (lines 34–35, 162).

**Convention:** ESM-native NodeNext config:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```
`resolveJsonModule: true` for importing `.schema.json` in the reader. **All relative imports MUST use `.js` extensions** (NodeNext resolution quirk — required at runtime even for `.ts` sources).

---

### `daemon/vitest.config.ts` (config)

**Analog:** AGENTS.md line 67 — *"Vitest — TS test runner, ESM-native, fast, good Ajv/TypeBox support."* + `RESEARCH.md` §Validation (line 567).

**Convention:** Minimal ESM config (`defineConfig` from `vitest/config`); `environment: "node"`; test files `["src/**/*.test.ts"]`. No special transform needed (Node 22.22.3 / tsx handle TS). Quick run: `npx vitest run`.

---

### `spike/bitwig-extension.js` (spike/throwaway, event-driven — D-07)

**Analog:** DrivenByMoss `OSCControllerSetup.java`, transcribed in `RESEARCH.md` Code Examples (lines 466–484). **Per D-07, this transfers to JS because it's the same Bitwig API surface** (observers, CursorClip, Application.undo, etc. are reachable from JsApi). Selection-changed origin is verified:
```java
final ITrackBank tb = this.model.getTrackBank();
tb.addSelectionObserver((index, isSelected) -> { /* emit event */ });
```
→ JS (JsApi) equivalent: `host.createCursorTrack(...)` / `host.getTrackBank(...)` / `trackBank.addSelectionObserver(...)` (exact JS surface to be confirmed in-app — A2).

**⚠️ CRITICAL PLANNING NOTE (RESEARCH.md §The JS-vs-Java Spike Tension, lines 161–177):** JsApi is documented (AGENTS.md line 33, 118) as *"a sandboxed subset."* The proven networking surface (`com.bitwig.extension.api.opensoundcontrol`) is **Java-only**. Whether JsApi exposes ANY networking or file-I/O is `[ASSUMED]` (A2) and **must be confirmed in-app on spike day 1**. **Do NOT couple the transport proof (SC#1) to this JS file.** Track A (capability probes via JS, where iteration speed matters) is the right home for this file; Track B (transport proof) is the `raw-tcp-probe.java` file or OSC-as-proof.

**Convention:** Plain JS loaded into Bitwig's ControllerScripts dir — **no npm install** (RESEARCH.md line 72). Throwaway (deleted in Phase 2, D-05/D-06). Use `host.println(...)` for debug. Observers must **enqueue, not block** (RESEARCH.md Pitfall 3 — blocking an observer stalls the audio engine).

---

### `spike/raw-tcp-probe.java` (spike/throwaway, request-response — Track B)

**Analog:** **No direct analog exists.** The closest reference is DrivenByMoss's OSC pattern (`RESEARCH.md` lines 466–484), which proves the JVM can network via the official `OscServer` API. This probe asks the *residual* question A1: does raw `java.net.ServerSocket` work directly? RESEARCH.md line 155: *"A ~30-line Java extension that opens a `ServerSocket` on `127.0.0.1:<port>` and writes one JSON line settles it in minutes."*

**Convention:**
- ~30 lines; compile against `com.bitwig:extension-api:21` jar directly — **no Maven build** (RESEARCH.md line 72, 107).
- Opens `new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"))` — localhost-only (Pitfall 5 applies to Java too).
- Writes one JSON line (`{"version":"1.0","type":"hello",...}`) on accept, then exits/closes.
- **Java/JDK 21 is NOT installed** (RESEARCH.md §Environment Availability line 551). Two options for the planner: (a) skip this probe and reuse DrivenByMoss's running OSC server as the transport proof stand-in, or (b) gate this file behind a "install JDK 21" checkpoint. Track-B's purpose is satisfied either way.

---

### `docs/bitwig-capabilities.md` (doc, PROBE-01 output)

**Analog:** `RESEARCH.md` §Capability Probe Design Questions skeleton (lines 344–392). No other analog — this is a verified-finding doc, content is the spike's *output* (D-01..D-04).

**Structure to replicate (one section per item; every gap row gets a non-empty Mitigation — D-04):**
1. **Undo Behavior** (D-01 DEEP) — design questions + probe recipe + *Observed:* (fill in-spike) + Mitigation
2. **Note-Editing Scope** (D-01 DEEP) — verified surface `[VERIFIED: AGENTS.md + DrivenByMoss ClipModule/INoteClip]` + design questions + Observed + Mitigation
3. **Automation Write** (standard)
4. **Bank Paging** (standard)
5. **Observer Granularity** (standard)
6. **Stable IDs** (D-03 — determines STATE-04 necessity)

**Header must record:** exact API version the installed Bitwig 6.0.6 exposes (A6 — open the in-app scripting guide on day 1). **Convention (D-04):** every gap → verified fact + proposed mitigation. Makes the doc design-ready for Phase 2. **Validation:** `scripts/check-capabilities-doc.mjs` (below) enforces the structural shape, not the truth.

---

### `scripts/check-capabilities-doc.mjs` (utility/script, file-I/O structural check)

**Analog:** `RESEARCH.md` §Validation row PROBE-01/SC#2 (line 582): *"structural check (sections present for 5 items + stable-ID; every gap row has a non-empty Mitigation field) … grep-driven structural validator."*

**Pattern (Node ESM `.mjs`, no deps):**
- `fs.readFileSync("docs/bitwig-capabilities.md", "utf8")`
- Assert headings exist for each of the 6 sections (undo, note-editing, automation, bank paging, observer granularity, stable IDs).
- For each section, assert a "Mitigation" line/subsection is present and non-empty (regex match).
- `console.error` + `process.exit(1)` on any missing; `process.exit(0)` on pass.
- Add an `npm run check:capabilities` script (root or `daemon/package.json`).

**Convention:** `.mjs` extension = native ESM (AGENTS.md line 162). Grep-driven (string search), not a real markdown parser — the doc is small and its shape is locked by the skeleton above. This is SC#2 made executable.

## Shared Patterns

### JSON Schema at the boundary (cross-cutting contract)

**Source:** `RESEARCH.md` §Security V5 + Code Examples envelope + AGENTS.md lines 37, 53, 62.
**Apply to:** every `schemas/protocol/*.json`, `reader.ts`, `schemas.test.ts`, `gen/*` (codegen input).
```typescript
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(envelopeSchema);  // once at boot
// per message: if (!validate(msg)) { drop; } — never process unvalidated
```
**Hard rule:** JSON Schema 2020-12 is the single cross-language source of truth. Never validate with hand-rolled checks; never derive the contract from TS (Zod) or Java — both halves bind FROM the `.json` files.

### Atomic-line writes (Pattern 4)

**Source:** `RESEARCH.md` Pattern 4 (lines 310–313).
**Apply to:** `transport/tcp.ts`, `transport/stdio.ts`, and the spike extension's writer.
```typescript
const str = JSON.stringify(msg) + "\n";   // JSON.stringify escapes embedded \n — safe
socket.write(str);                         // ONE write call per message
```
**Hard rule:** one `JSON.stringify` + one `"\n"` + one `write`. Never interleave writes from multiple producers without a mutex.

### Localhost-only bind (security invariant)

**Source:** `RESEARCH.md` Pitfall 5 (lines 419–422) + §Security.
**Apply to:** `transport/tcp.ts`, `spike/raw-tcp-probe.java`.
```
.listen(port, "127.0.0.1")          // TS — never omit the host arg
new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"))   // Java
```
**Hard rule:** never `0.0.0.0`. This is the single security-relevant decision in the spike (RESEARCH.md §Security: "the `127.0.0.1`-bind rule and Ajv-boundary-validation are the two controls that must be in place even in the spike").

### Never block a Bitwig observer (Pattern 5 + Pitfall 3)

**Source:** `RESEARCH.md` Pattern 5 (line 320) + Pitfall 3 (lines 408–412) + AGENTS.md line 146.
**Apply to:** `spike/bitwig-extension.js` (and Phase 2 Java bridge).
**Hard rule:** observers fire on the controller thread; blocking stalls the audio engine. Observers only enqueue onto a bounded queue; a worker drains. Honor this even in the throwaway spike.

### ESM + `.js` import extensions + NodeNext (TS convention)

**Source:** AGENTS.md lines 34–35, 162.
**Apply to:** every `.ts` file under `daemon/src/`.
**Hard rule:** `"type": "module"` in `package.json`; `"module": "NodeNext"` in `tsconfig.json`; **all relative imports end in `.js`** (even when the source is `.ts`) — required by NodeNext resolution at runtime.

### Discriminated message type via envelope `oneOf` (cross-cutting contract)

**Source:** `RESEARCH.md` Code Examples envelope (lines 450–456).
**Apply to:** `envelope.schema.json` + all five message-type schemas.
**Hard rule:** the envelope's `oneOf` branches into event/request/response/edit/handshake; each sub-schema constrains `type` via enum. This is the wire-level discriminator the TS discriminated-union patch model (AGENTS.md line 35) binds from.

## No Analog Found

Files where no transcribable in-repo or reference excerpt exists — the implementer writes from the cited design spec, and (for the Bitwig probes) **observed in-app behavior is the authoritative source** (D-02):

| File | Role | Data Flow | Reason | Authoritative Fallback |
|---|---|---|---|---|
| `spike/bitwig-extension.js` (JS surface) | spike | event-driven | JsApi JS surface is `[ASSUMED]` (A2); no external doc (404); DrivenByMoss analog is Java-only. Exact `host.*` JS entry points must be confirmed in-app day 1. | DrivenByMoss `OSCControllerSetup.java` (RESEARCH.md lines 466–484) for the *observer/selection pattern*; in-app scripting guide for the *exact JS API names*. |
| `spike/raw-tcp-probe.java` | spike | request-response | No reference extension demonstrates raw `java.net.ServerSocket` (they use OSC/UDP). This file IS the de-risking artifact (A1). | `java.net.ServerSocket` standard API + RESEARCH.md line 155 (~30-line recipe); fallback if JDK 21 absent: reuse DrivenByMoss OSC as transport proof. |
| `docs/bitwig-capabilities.md` (content) | doc | — | The *content* (observed Bitwig behavior) is the spike's output by design — no automated test can validate in-app behavior (RESEARCH.md line 584). | RESEARCH.md §Capability Probe Design Questions skeleton (lines 344–392) for the *structure*; in-app probes (D-02) for the *truth*. |
| `scripts/check-capabilities-doc.mjs` | utility | file-I/O | No existing structural-check script pattern in the repo (greenfield). | RESEARCH.md line 582 spec: "grep-driven structural validator." Plain Node ESM `.mjs`, no deps. |

## Metadata

**Analog search scope:**
- `git ls-files` over the full repo — confirmed greenfield (only `.planning/*`, `.claude/AGENTS.md`, `docs/seed.md` tracked).
- `Glob **/*.{ts,js,mjs,json,java}` — zero source matches (only `.planning/config.json` + research-cache JSONs).
- Authoritative documents consulted: `RESEARCH.md` (Patterns 1–5, Code Examples, §Validation, §Capability Probe Design Questions, §Sources), `.claude/AGENTS.md` (§Technology Stack, §Capabilities table, §Alternatives, §What NOT to Use), `docs/seed.md` (§Proposed local protocol lines 362–415, §data model lines 162–273).
- External reference (via RESEARCH.md): DrivenByMoss `git-moss/DrivenByMoss` master @ 26.6.2 — `OSCControllerSetup.java`, `pom.xml`, `OpenSoundControlServerImpl.java`, `ClipModule.java`.

**Files scanned:** 3 authoritative docs (CONTEXT.md, RESEARCH.md, AGENTS.md, seed.md) + 0 source files (greenfield).

**Pattern extraction date:** 2026-06-26

**Planner hot-spots (flagged for PLAN.md):**
1. **JS-vs-Java decoupling** (RESEARCH.md §The JS-vs-Java Spike Tension) — keep transport proof (SC#1) independent of the JS extension choice; Track A (JS probes) + Track B (Java TCP probe or OSC-as-proof) split.
2. **Protocol freeze breadth** (CONTEXT.md discretion; RESEARCH.md Pitfall 4) — freeze envelope + handshake + ~4 seed messages; mark the rest "Phase 2-extensible."
3. **JDK 21 absence** (RESEARCH.md §Environment) — Track B Java probe either needs a JDK-install checkpoint or is replaced by OSC-as-proof.
4. **Security invariants** — `127.0.0.1`-only bind (Pitfall 5) and Ajv-at-boundary (V5) are non-negotiable even in the spike.
