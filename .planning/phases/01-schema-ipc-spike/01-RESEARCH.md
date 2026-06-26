# Phase 1: Schema & IPC Spike - Research

**Researched:** 2026-06-26
**Domain:** Bitwig extension JVM networking + newline-delimited JSON protocol design + TypeScript daemon scaffolding
**Confidence:** HIGH on transport-de-risking & stack; MEDIUM on protocol design (standard practice); LOW (by design) on in-app API behavior — those are the spike's *outputs*, not inputs.

<user_constraints>
## User Constraints (from CONTEXT.md)

> Copied verbatim. These are LOCKED — the planner honors them; research does not re-litigate.

### Locked Decisions

**Capability Probe Priorities (PROBE-01 → `docs/bitwig-capabilities.md`)**
- **D-01 — Deep-verify trust-critical items:** `undo behavior` and `note-editing scope` get deep verification. `automation write`, `bank paging`, and `observer granularity` get standard single-pass confirmation.
- **D-02 — Verification method is code-probes + guide:** Write tiny probe code that actually exercises the deep items. Open the in-app scripting guide to *design* the probes, but trust observed behavior over docs (the guide is 404-prone externally and has never been fetched — STATE.md blocker). Observed reality is the whole point of a spike.
- **D-03 — Probe scope is the 5 named items + stable-ID availability:** Verify whether Bitwig exposes any stable object IDs for tracks/clips/devices, in addition to the 5 named items. Determines whether Phase 2's fingerprint-mapping (STATE-04) is needed at all.
- **D-04 — Gap policy is fact + mitigation:** When the probe finds a capability missing or limited, `bitwig-capabilities.md` records the verified fact AND a proposed mitigation/workaround. Makes the doc design-ready.

**Spike Code Disposition**
- **D-05 — Keep daemon-side scaffolding; extension is throwaway:** The daemon-side scaffolding — JSON-Lines reader, partial-line buffer, version check, framing — is KEPT as Phase 2's real starting point. Light discipline (TypeScript types, clear structure), no premature hardening (no full test suite, no watchdog).
- **D-06 — Repo layout is `spike/` + real dirs:** Throwaway extension lives in `spike/`. Kept code (`daemon/`, `schemas/protocol/*`) lives in the real repo structure from day one.
- **D-07 — Spike extension is a JavaScript prototype:** Write the spike extension in JS for iteration speed. API findings transfer to Java because it's the same Bitwig API surface. The `.bwextension` Java build/packaging de-risk is deferred to Phase 2.
- **D-08 — End-to-end demo is a raw proof print:** A raw `bw-brain-spike dump`-style command prints the received `selection.changed` event as validated JSON — proves the pipe works end-to-end with no pretense of being a real command.

### Agent's Discretion
- **Transport decision rule (TCP vs stdio):** Left OPEN deliberately — the choice depends on spike findings. The researcher/planner frames the decision criteria once TCP behavior is observed. Both transports are pre-accepted as valid outcomes (PROJECT Constraints).
- **Protocol freeze breadth:** Left OPEN — calibrated by the planner against success criteria #3 (versioned messages, atomic-line writes, partial-line buffer, backpressure rule).

### Deferred Ideas (OUT OF SCOPE)
- Transport decision threshold (TCP vs stdio tie-breaker) — belongs to planner once spike findings exist.
- Protocol freeze breadth — calibrated by planner against SC#3.
- `.bwextension` Java build/packaging de-risk — deferred to Phase 2 (D-07).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **PROBE-01** | Bitwig capability probe produces `docs/bitwig-capabilities.md` documenting the verified API surface (note editing scope, automation write, bank paging, observer granularity, undo behavior) before bridge design locks | See §Capability Probe Design Questions — for each of the 5 named items + stable-ID (D-03), research establishes the *design questions* the probes must answer and the skeleton structure of the doc. Observed behavior is the spike's output, not pre-known. The DrivenByMoss source confirms the read/write API surface that the AGENTS.md stack table already documents. |
| **PROBE-02** | IPC spike confirms Bitwig JVM localhost TCP (or stdio relay) access and freezes the JSON-Lines protocol contract both halves build against | See §Transport Findings (the JVM-networking question is substantially de-risked to HIGH confidence via DrivenByMoss OSC+JNA evidence) and §JSON-Lines Protocol Contract (concrete schema layout + framing/backpressure/handshake rules the planner can freeze). |
</phase_requirements>

## Summary

This is a **de-risk spike**, and the single highest-risk structural unknown — "can the Bitwig extension JVM open a localhost socket?" — is **substantially de-risked before the spike even runs**, by direct inspection of the reference extension. DrivenByMoss 26.6.2 (released 2026-06-12, targeting Bitwig 5.3+; the installed host is Bitwig 6.0.6) ships a working **OSC (Open Sound Control) module** that uses Bitwig's *official* networking API: `com.bitwig.extension.api.opensoundcontrol.OscServer` / `OscConnection`, exposed via `host.createOSCServer(...)` and `host.connectToOSCServer(host, port)` `[VERIFIED: DrivenByMoss source]`. Crucially, DrivenByMoss also loads **JNA + native HID + a native file chooser** inside the same extension JVM — conclusive evidence that **the Bitwig extension JVM is NOT running under a restrictive `SecurityManager`** `[VERIFIED: DrivenByMoss pom.xml]`. If JNA (arbitrary native code) works, raw `java.net.ServerSocket`/`Socket` will work too. No reference extension demonstrates *raw TCP JSON-Lines* directly (they use the OSC/UDP API), so that specific path remains to be confirmed empirically — but the question has collapsed from "does networking work at all?" (was MEDIUM) to "does raw TCP work given that OSC+JNA already work?" (very likely YES).

This surfaces **one sharp planning tension the planner must resolve up front**: D-07 chose a **JavaScript** Controller Script (JsApi) spike extension for iteration speed, but the proven networking surface (`com.bitwig.extension.api.opensoundcontrol`) is **Java-only**, and JsApi is documented (AGENTS.md) as "a sandboxed subset." The web docs that would settle whether JsApi exposes networking are 404-prone externally (STATE.md blocker — confirmed: `bitwig.com/developer-resources/` returns 404). Research therefore cannot pre-confirm the JS path; the planner should structure the spike so the **transport proof is decoupled from the JS choice** (see §The JS-vs-Java Spike Tension). This is the single most important planning decision in this phase.

The protocol-contract half (PROBE-02, SC#3) is fully designable now: JSON Lines is a stable spec (`\n`-terminated, UTF-8, one JSON value per line) `[CITED: jsonlines.org]`; the envelope from `docs/seed.md` generalizes cleanly into a `schemas/protocol/*` tree with a versioned envelope + discriminated `type` + a `hello`/`hello.response` version handshake + a bounded-queue drop-on-overflow backpressure rule (safe for observational events, never for edits). The daemon scaffolding (D-05) is transport-agnostic by design, so it is reusable regardless of which transport wins.

**Primary recommendation:** Plan the spike as two decoupled tracks — (1) a **tiny raw-TCP confirmation** (a ~30-line Java extension OR reuse of the official OSC path as proof) that nails the transport decision, and (2) **JS capability probes** (where iteration speed genuinely matters) that produce `docs/bitwig-capabilities.md`. Freeze the JSON-Lines contract (`schemas/protocol/*`) in parallel from existing knowledge — it does not depend on the transport outcome.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Selection/state observation (emit `selection.changed`) | **Bitwig extension (in-process JVM)** | — | Only the extension can subscribe to Bitwig observers (`ITrackBank.addSelectionObserver`); observers fire on Bitwig's controller thread `[VERIFIED: DrivenByMoss OSCControllerSetup]`. |
| Transport (carry JSON-Lines off-host) | **Bitwig extension (JVM)** OR **native relay process** | daemon | Either the extension opens the socket directly (preferred if raw TCP works), or a native wrapper relays `host.println()`/file output to the daemon (stdio-relay fallback). Daemon is always the *listener/receiver*. |
| JSON-Lines framing + partial-line buffer + version check | **Daemon (Node/TS)** | — | Transport-agnostic; lives in the kept `daemon/` scaffolding (D-05). Never inside the bridge — bridge stays dumb and responsive. |
| Protocol contract (`schemas/protocol/*`) | **Shared schema files** | Java bridge + TS daemon + CLI | JSON Schema 2020-12 is the single cross-language source of truth; both halves generate/bind from it (locked in AGENTS.md). |
| Capability probe execution + evidence capture | **Spike extension (JS per D-07)** | in-app scripting guide | Probes run inside Bitwig; observed behavior is captured to `docs/bitwig-capabilities.md`. |
| End-to-end proof print (`bw-brain-spike dump`) | **Daemon CLI** | transport | Validates received message against the frozen envelope and prints it; exits. |

## Standard Stack

> The full cross-language stack is **locked in `.claude/AGENTS.md` §Technology Stack** (sourced from the DrivenByMoss reference build + npm registry). This phase does NOT re-litigate it. Below: only what THIS spike installs/uses, with verification status.

### Core (this phase installs — daemon side only)

The JS spike extension (D-07) uses **no npm dependencies** — Bitwig Controller Scripts are plain JS loaded by the host. The Java raw-TCP confirmation (recommended) uses **only the Bitwig-provided `extension-api`** (no Maven build needed for a 30-line probe; can be compiled against the jar directly). So the only packages this phase installs are the daemon/CLI dev deps:

| Library | Version | Purpose | Why Standard | Legitimacy |
|---------|---------|---------|--------------|------------|
| `ajv` | 8.20.0 | Validate JSON-Lines messages + envelope at the boundary | Fastest, JSON Schema 2020-12 native, 329M/wk | **OK** `[VERIFIED: npm + legitimacy gate]` |
| `ajv-formats` | 3.0.1 | `date-time` etc. formats for Ajv | Pairs with ajv; 99M/wk | **OK** `[VERIFIED]` |
| `json-schema-to-typescript` | 15.0.4 (dev) | Generate `daemon/src/gen/*.ts` from `schemas/*.json` | Keeps TS types in lockstep with the wire contract | **OK** `[VERIFIED]` |
| `typescript` | 5.7+ (dev) | Daemon language | Non-negotiable for the discriminated-union patch model (AGENTS.md) | **OK** `[VERIFIED]` |
| `commander` | 15.0.0 | `bw-brain-spike dump` CLI parsing | Standard; 444M/wk; Node ≥22.12 | **SUS** (false-positive "too-new"; see Audit) |
| `tsx` | 4.22.4 (dev) | Run TS directly during dev | ESM-native, watch mode; Node 22 also strips types natively | **SUS** (false-positive "too-new"; see Audit) |
| `vitest` | 4.1.9 (dev) | Property/example tests for framing + schema validation | ESM-native, fast Ajv support | **SUS** (false-positive "too-new"; see Audit) |
| `@types/node` | latest (dev) | Node type defs | Standard | **OK** |

**Bitwig extension API (not an npm/Maven install for the spike — provided by the host):**

| Surface | Coordinate | Purpose | Verified |
|---------|-----------|---------|----------|
| `com.bitwig:extension-api` | version `21` | Official extension contract (Java path) | `[VERIFIED: DrivenByMoss pom.xml]` — `<source>21</source>`, repo `https://maven.bitwig.com` |
| `com.bitwig.extension.api.opensoundcontrol` | part of extension-api 21 | **Official networking** (`OscServer`, `OscConnection`) | `[VERIFIED: OpenSoundControlServerImpl.java / OSCControllerSetup.java]` |
| Bitwig Controller Script (JsApi) | host-version-coupled | JS prototyping subset (D-07 spike path) | `[ASSUMED]` — surface not externally documented (404); must be confirmed in-app |

### Supporting (Java side — Phase 2, NOT this spike; listed for boundary clarity)

| Library | Version | Purpose | When |
|---------|---------|---------|------|
| `jackson-databind` | 2.22.0 | JSON for JSON-Lines IPC (Java) | Phase 2 production bridge. Spike avoids it. `[VERIFIED: DrivenByMoss pom.xml]` |
| Maven + shade + copy-rename | 3.8.1+ / 3.6.2 / 1.0.1 | `.bwextension` packaging | Phase 2 (D-07 defers this). Pattern: `target/*.jar` → copy-rename → `*.bwextension` `[VERIFIED: DrivenByMoss pom.xml]` |

### Installation (this phase)

```bash
# daemon/ + CLI scaffolding (Node 22.22.3 present; AGENTS.md prefers 24 LTS, 22.19+ acceptable)
cd daemon && npm init -y && npm i ajv@8.20.0 ajv-formats@3.0.1 commander@15.0.0 \
  && npm i -D typescript tsx vitest json-schema-to-typescript @types/node
# JS spike extension: NO install — drop a .js file into Bitwig's ControllerScripts dir
# Java raw-TCP confirmation (optional, recommended): compile 1 file against extension-api jar; no Maven needed
```

**Version verification (run this session):** `ajv` 8.20.0, `ajv-formats` 3.0.1, `json-schema-to-typescript` 15.0.4, `commander` 15.0.0, `tsx` 4.22.4, `vitest` 4.1.9 — all current as of 2026-06-26 `[VERIFIED: npm view]`. No `postinstall` scripts on any of them (no supply-chain execution risk).

## Package Legitimacy Audit

> Run via `gsd-tools query package-legitimacy check --ecosystem npm ...` + `npm view` cross-check + `npm view <pkg> scripts.postinstall` (all empty).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `ajv` | npm | ~5 yrs (v8) | 329M/wk | github.com/ajv-validator/ajv | **OK** | Approved |
| `ajv-formats` | npm | ~2 yrs (v3) | 99M/wk | github.com/ajv-validator/ajv-formats | **OK** | Approved |
| `json-schema-to-typescript` | npm | ~1.5 yrs (v15) | 2.8M/wk | github.com/bcherny/json-schema-to-typescript | **OK** | Approved |
| `commander` | npm | ~4 wks (v15.0.0) | 444M/wk | github.com/tj/commander.js | **SUS** | Flagged — see note |
| `tsx` | npm | ~4 wks (v4.22.4) | 68M/wk | github.com/privatenumber/tsx | **SUS** | Flagged — see note |
| `vitest` | npm | recent (v4.1.9) | high | github.com/vitest-dev/vitest | **SUS** | Flagged — see note |

**Packages removed due to [SLOP]:** none.

**Packages flagged [SUS] — planner disposition:** All three SUS verdicts are the **"too-new" heuristic firing on legitimate major releases** of top-tier packages (commander = the de-facto npm CLI library at 444M weekly; tsx and vitest are mainstream dev tools with canonical GitHub repos and **zero `postinstall` scripts**). This is a known false-positive pattern of the recency heuristic, not a real supply-chain signal. **Recommendation:** pin exact versions (above) and install normally; the planner may add a single `checkpoint:human-verify` before `npm install` if it wants belt-and-braces, but no package here is genuinely suspicious. If the planner wants to avoid even the heuristic, `commander@^14` and `vitest@^3` are acceptable older majors.

*No package in this phase was discovered via WebSearch/training only — all are named in the locked AGENTS.md stack doc, which is itself sourced from npm + DrivenByMoss.*

## Transport Findings — the highest-risk item, substantially de-risked

> This is the core of PROBE-02. The question "can the Bitwig JVM do localhost networking?" drives the whole spike. Research resolves most of it; the spike confirms the residual.

### What is now VERIFIED (HIGH confidence, pre-spike)

1. **The Bitwig extension JVM performs networking via an official API.** `OSCControllerSetup.createSurface()` calls:
   ```java
   // Send (extension → external)
   IOpenSoundControlClient oscClient = this.host.connectToOSCServer(sendHost, sendPort);
   // Receive (external → extension)
   this.oscServer = this.host.createOSCServer(parser);
   this.oscServer.start(receivePort);
   ```
   `[VERIFIED: DrivenByMoss OSCControllerSetup.java, master branch]`. `host` is `ControllerHost`/`IHost`. The OSC types live in `com.bitwig.extension.api.opensoundcontrol` (part of `extension-api:21`).

2. **The OSC transport is UDP.** Comment in `OpenSoundControlClientImpl.sendBundle`: *"We cannot get the exact size of the message due to the API, so let's try to stay below 64K, which is the maximum of an UDP message"* `[VERIFIED]`. So the official API gives UDP, **not TCP**.

3. **The extension JVM is NOT sandboxed against native code.** DrivenByMoss `pom.xml` depends on `net.java.dev.jna:jna:5.19.0` + `jna-platform`, `purejavahidapi` (native HID), `nativefilechooser` (native OS file dialog), and `com.badlogicgames.jamepad` (native gamepad) `[VERIFIED: DrivenByMoss pom.xml]`. JNA loads arbitrary native shared libraries inside the Bitwig JVM. **If native library loading works, `java.net.ServerSocket`/`Socket` works.** There is no indication of a restrictive `SecurityManager` or `jvm.policy` blocking `java.net`.

4. **The selection-changed event source is confirmed.** `OSCControllerSetup.createObservers()` registers `tb.addSelectionObserver((index, isSelected) -> ...)` on an `ITrackBank` `[VERIFIED]`. This is precisely the origin of `selection.changed`.

### What MUST be observed in-spike (cannot be pre-confirmed — by design)

1. **Does raw `java.net.ServerSocket` (TCP) work directly in the extension JVM?** Very likely YES given (3), but no reference extension demonstrates raw TCP JSON-Lines (they use OSC/UDP). A ~30-line Java extension that opens a `ServerSocket` on `127.0.0.1:<port>` and writes one JSON line settles it in minutes. **This is the spike's transport gate.**

2. **Does the JS Controller Script (JsApi) expose ANY networking or file-I/O surface?** The official OSC API is Java-only (`com.bitwig.extension.api.opensoundcontrol`). JsApi is documented (AGENTS.md) as "a sandboxed subset." The externally-hosted docs that would settle this 404 (`bitwig.com/developer-resources/` → 404 confirmed this session) `[VERIFIED: webfetch]`. The in-app scripting guide (STATE.md blocker) is the only authoritative source. **This is the D-07 spike-blocking question** (see §The JS-vs-Java Spike Tension).

3. **Undo behavior, note-editing scope, automation, bank paging, observer granularity, stable IDs** (D-01..D-04) — all empirical; see §Capability Probe Design Questions.

### The JS-vs-Java Spike Tension (the single most important planning decision)

D-07 chose a JS spike extension for iteration speed, reasoning that "API findings transfer to Java because it's the same Bitwig API surface." That reasoning is sound **for capability probing** (observers, note editing, undo — all reachable from JsApi). But it breaks down **for the transport proof** if JsApi exposes no networking:

| If JsApi exposes… | Then SC#1 (transport proof) can be done in JS via… | Recommendation |
|---|---|---|
| Raw sockets or OSC | A direct TCP/OSC send from JS | JS is fine for both tracks |
| File I/O only | Writing JSON lines to a file the daemon tails (a "file relay") | Acceptable but weak — doesn't prove a real transport |
| Neither (only `host.println`) | Piping Bitwig's console/log to the daemon (a "log-tail relay") | Does NOT satisfy "real transport" — only a fallback demo |
| Nothing | Impossible in JS | **Must pivot transport track to Java** |

**Recommendation to planner:** Do NOT couple the transport proof to the JS choice. Structure two decoupled tracks:
- **Track A — Capability probes (JS, D-07):** selection/note/undo/automation/bank/observer/stable-ID probes run in JS where iteration speed matters. This is where D-07's rationale is strongest.
- **Track B — Transport confirmation:** A **tiny Java extension** (~30 lines) that opens a `java.net.ServerSocket` on `127.0.0.1` and writes one JSON line, OR — even cheaper — confirm the transport by pointing the daemon at DrivenByMoss's existing OSC server (already proven to work) as a stand-in. This makes SC#1 unblockable regardless of JsApi's networking surface.

This preserves D-07's intent (JS for the probe-heavy, iteration-heavy work) while guaranteeing SC#1 isn't held hostage to an unverified JsApi limitation. **Flag this for the planner explicitly; it is not a re-litigation of D-07, it's a scoping refinement that keeps D-07's goal achievable.**

### Transport Decision Rule (D-transport is OPEN — frame for the planner)

Once Track B observes behavior, apply this decision tree (in priority order — matches PROJECT.md "localhost TCP or stdio"):

1. **IF raw `java.net.ServerSocket` binds and exchanges JSON-Lines on `127.0.0.1`** → **CHOOSE TCP.** Matches PROJECT.md constraint, inspectable (`nc 127.0.0.1 <port> | jq -c`), no relay process. This is the expected outcome.
2. **ELSE IF only the official OSC API works** → OSC is **UDP address/value-pairs, NOT JSON-Lines.** Adapting bw-brain to OSC would invert the locked contract (PROJECT.md: "JSON Lines"). **Reject unless TCP is truly impossible.** A thin shim (OSC message carrying a single JSON string blob) is possible but ugly — treat as last resort.
3. **ELSE (no Java networking — implausible given OSC+JNA)** → **stdio relay:** a native wrapper process spawns the Bitwig extension host or tails `host.println()` output and pipes it to the daemon over a Unix socket / stdin. This is the documented fallback (STATE.md: "stdio fallback ready"). Viability depends on whether `host.println()` output is reachable from an external process (Bitwig logs to a console window / log file — must be confirmed in-spike).

**Tie-breaker note (deferred in CONTEXT.md):** the rule above is the threshold. There is no "gray area" — outcome (1) is overwhelmingly likely given finding (3). The planner can treat TCP as the working assumption and stdio as documented fallback.

## Architecture Patterns

### System Architecture Diagram (the spike's data flow)

```
                    BITWIG STUDIO (host process, bundled JVM)
                    ┌──────────────────────────────────────────────┐
                    │  Extension JVM (NOT sandboxed — JNA works)   │
                    │  ┌────────────────────────────────────────┐  │
                    │  │ SPIKE EXTENSION (throwaway)            │  │
                    │  │  ─ CursorTrack/CursorClip observers    │  │
                    │  │  ─ ITrackBank.addSelectionObserver ──┐ │  │   <-- selection.changed origin
                    │  │  ─ capability probes (undo/note/...)  │ │  │
                    │  │  ─ Transport writer                  │ │  │
                    │  └──────────────────────────────────────┼─┘  │
                    │                 │                        │    │
                    │   (Track A: JS probes)  (Track B: TCP)   │    │
                    └───────────────────┼────────────────────────┼──┘
                                        │                        │
                        DECISION POINT: │ raw java.net TCP       │ (fallback: host.println
                        apply Decision   │  (expected)            │  → log-tail → daemon)
                        Rule once        │                        │
                                        ▼                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │  DAEMON (Node 22 + TS, KEPT per D-05)            │
                    │  ┌─────────────┐   ┌──────────────────────────┐ │
                    │  │ Transport   │   │ JSON-Lines Reader        │ │
                    │  │ abstraction │──▶│  ─ partial-line buffer   │ │
                    │  │ (TCP|Stdio) │   │  ─ split on \n           │ │
                    │  └─────────────┘   │  ─ version handshake     │ │
                    │                    └──────────┬───────────────┘ │
                    │                               ▼                  │
                    │          ┌──────────────────────────────────┐   │
                    │          │ Ajv validate vs schemas/protocol/*│   │
                    │          └──────────────┬───────────────────┘   │
                    │                         ▼ (valid)                │
                    │          ┌──────────────────────────────────┐   │
                    │          │ bw-brain-spike dump (commander)  │   │
                    │          │  prints validated JSON, exit 0   │───┼──▶ stdout (proof)
                    │          └──────────────────────────────────┘   │
                    └─────────────────────────────────────────────────┘
```

A reader can trace the primary use case (SC#1) by following arrows from `addSelectionObserver` → transport → daemon reader → Ajv → CLI print.

### Recommended Project Structure (D-06)

```
bw-brain/
├── spike/                         # THROWAWAY (deleted in Phase 2)
│   ├── bitwig-extension.js        # JS Controller Script (D-07) — capability probes + event emit
│   └── raw-tcp-probe.java         # (Optional, recommended) Track B: minimal ServerSocket confirmation
├── daemon/                        # KEPT (Phase 2's real starting point, D-05)
│   ├── src/
│   │   ├── transport/             # Transport interface + TcpServerTransport + StdioTransport (swappable)
│   │   ├── protocol/              # JSON-Lines reader, partial-line buffer, version handshake
│   │   ├── cli/                   # bw-brain-spike dump (commander)
│   │   └── gen/                   # generated TS types from schemas (json2ts output, committed)
│   ├── package.json
│   └── tsconfig.json
├── schemas/
│   └── protocol/                  # FROZEN contract (SC#3)
│       ├── envelope.schema.json   # base: {version, type, id?, timestamp?, ok?, payload}
│       ├── event.schema.json      # selection.changed, ...
│       ├── request.schema.json    # get.selected_clip, ...
│       ├── response.schema.json   # {ok, payload}
│       ├── edit.schema.json       # apply.patch + undoLabel
│       └── handshake.schema.json  # hello / hello.response (version negotiation)
├── docs/
│   └── bitwig-capabilities.md     # PROBE-01 output (design-ready for Phase 2, D-04)
└── .planning/...
```

### Pattern 1: Transport Abstraction (so TCP and stdio are swappable — D-05 core)

**What:** A single `Transport` interface the daemon consumes; two impls. The JSON-Lines reader is built on the interface, not on `net.Socket` directly.
**When to use:** Always — this is what makes the kept scaffolding reusable regardless of the transport decision.

```typescript
// Source: standard Node.js pattern + AGENTS.md stack guidance
export interface Transport {
  onMessage(handler: (msg: unknown) => void): void;
  send(msg: object): void;        // throws on unrecoverable write failure
  close(): void;
}

// TcpServerTransport binds 127.0.0.1 ONLY (security: never 0.0.0.0)
// StdioTransport reads process.stdin, writes process.stdout
```

### Pattern 2: Partial-Line Buffer (reassembly across stream reads)

**What:** TCP and stdio both deliver *byte streams*, not messages. A `\n` can fall mid-message across two `data` chunks. Accumulate, split on `\n`, emit complete lines, retain the tail.
**When:** Every JSON-Lines reader, always. This is SC#3's "partial-line buffer" requirement.

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

### Pattern 3: Version Handshake (first message on connect)

**What:** On connect, the sender emits `hello`; the receiver validates the major version and replies `hello.response` before any other traffic.
**When:** Every new connection. Prevents protocol-drift silent corruption.

```jsonl
{"version":"1.0","type":"hello","payload":{"capabilities":["events","requests"]}}
{"version":"1.0","type":"hello.response","ok":true,"payload":{"serverVersion":"1.0"}}
```

### Pattern 4: Atomic-Line Writes (one message = one `\n`-terminated write)

**What:** Serialize with `JSON.stringify` (which escapes embedded `\n` as `\n` — safe), append `\n`, and issue a **single** `socket.write(str)` / `process.stdout.write(str)` call. Do not interleave writes from multiple producers without a mutex.
**Why:** guarantees one complete JSON value per line even under concurrency. Node's `net.Socket.write` is atomic for buffers under the kernel write buffer (~16KB); Bitwig state messages are KB-sized, not MB.

### Pattern 5: Bounded-Queue Backpressure (the SC#3 "backpressure rule")

**What:** Daemon keeps a bounded per-connection queue. Policy differs by message class:
- **Observational events** (`selection.changed`, etc.): when queue full, **DROP** oldest and emit a `{"type":"dropped","payload":{"count":N}}` notice. Safe — a newer selection supersedes an older one; bw-brain is observational.
- **Edits / requests** (`apply.patch`, `get.*`): **NEVER drop.** Apply backpressure by blocking the sender (the bridge must wait for ack). Edits are user-intent and must be acknowledged.
- **NEVER block inside a Bitwig observer callback** (AGENTS.md stack pattern: "never block an observer callback"). Observers enqueue; a daemon worker drains.

### Anti-Patterns to Avoid

- **Hand-rolling JSON framing with custom delimiters.** Use `\n`. Anything else breaks `nc | jq` inspectability and the jsonlines.org spec.
- **Binding the TCP server to `0.0.0.0`.** Localhost-only is a security invariant — bind `127.0.0.1` explicitly.
- **Doing heavy work in a Bitwig observer callback.** Observers fire on the controller thread; blocking stalls the audio engine (AGENTS.md). Enqueue, don't process.
- **Relying on Bitwig native undo as the revert mechanism.** D-01 deep-verifies undo precisely because the trust model (PROJECT.md) is daemon-authoritative revert; native undo is best-effort/caveated, never the spine.
- **Freezing more of the protocol than the 1-event spike can honestly support.** Over-freezing locks guesses (CONTEXT.md discretion). Freeze envelope + handshake + ~4 example messages; defer the rest.
- **Treating the JS spike extension as the transport proof.** See §The JS-vs-Java Spike Tension — decouple them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON validation at the boundary | Custom validators | `ajv` 8.20.0 + JSON Schema 2020-12 | The contract is cross-language (Java bridge can't read Zod); Ajv is the standard, fastest, supports 2020-12 + standalone codegen `[VERIFIED: AGENTS.md]` |
| TS types from the wire contract | Hand-maintained TS interfaces mirroring JSON | `json-schema-to-typescript` (`json2ts`) codegen | Keeps types in lockstep; one source of truth (the `.json` files) `[VERIFIED]` |
| Newline-delimited framing | Length-prefixed binary framing / custom delimiters | `\n`-terminated JSON (jsonlines.org) | Inspectable (`nc | jq`), spec-compliant, unix-tool-friendly `[CITED: jsonlines.org]` |
| TCP server | Raw `net.createServer` boilerplate scattered in CLI code | A `Transport` abstraction impl (Pattern 1) | Swappable for stdio; keeps the reader transport-agnostic (D-05) |
| Bitwig networking | Raw `java.net.Socket` if OSC suffices for the proof | Bitwig's official `host.createOSCServer` / `host.connectToOSCServer` | Official, proven, maintained across Bitwig versions `[VERIFIED: DrivenByMoss]`. (Note: bw-brain's *contract* is JSON-Lines, so OSC is only a proof stand-in, not the production transport.) |
| CLI arg parsing | `process.argv` slicing | `commander` | Standard, strict-by-default, async-action support `[VERIFIED]` |

**Key insight:** This spike's whole purpose is to *stop* hand-waving. The protocol contract and the daemon framing are the two things that must be real from day one — both are served entirely by standard tools (JSON Schema + Ajv + jsonlines.org framing). Reserve hand-effort for the Bitwig API probes, which have no library shortcut.

## Capability Probe Design Questions (PROBE-01 — D-01..D-04)

> **Critical framing:** Observed Bitwig API behavior is the spike's *output*, not pre-discussion. Research can establish (a) the read/write surface from the verified DrivenByMoss code + AGENTS.md table, and (b) the precise *design questions* each probe must answer. It must NOT fabricate observed behavior. Every "Observed:" field below is to be filled in-spike; everything marked `[VERIFIED]` is establishable now.

`docs/bitwig-capabilities.md` skeleton (one section per item; every gap gets a Mitigation per D-04):

### 1. Undo Behavior (D-01 — DEEP verify; foundation of daemon-authoritative revert)

**Design questions the probe must answer:**
- Does `Application.undo()` / `redo()` exist? (AGENTS.md table lists `Application.undo()` `[VERIFIED: AGENTS.md capabilities table]` — confirm in-app.)
- Does any undo API accept a **label**? (seed.md assumes `undoLabel`; PROJECT.md: "every applied patch gets an undo label.")
- Does the host **coalesce** consecutive edits on a time window (e.g. ~1s)? ROADMAP.md Phase 3 flags this as a research item.
- Does `CursorClip.addNote()` create **one undo step per note** or **one per batch**? (Critical: if per-note, applying a 20-note patch = 20 undo steps the user must click through.)

**Probe recipe:** add a note via `CursorClip.addNote(...)` → invoke `Application.undo()` → observe whether the note disappears in one step. Then add 5 notes in a tight loop → undo once → observe coalescing. Record timing.

**Mitigation if native undo is unreliable/unlabelled:** daemon-authoritative revert (`patch-history.jsonl` + inverse ops) becomes the **only** safe path (EDIT-05); native undo is caveated harder in docs. This is the trust-model spine.

### 2. Note-Editing Scope (D-01 — DEEP verify)

**Verified surface `[VERIFIED: AGENTS.md + DrivenByMoss ClipModule/INoteClip]`:** `CursorClip` exposes `addNote`, `removeNote`, `getNotes`, and `NoteStep` with velocity/duration/pan/pressure/releaseVelocity/timbre. `INoteClip` (DrivenByMoss) exposes `quantize`, `setName`, `setColor`, `togglePinned`, `doesExist`.

**Design questions:**
- Can notes be edited in **launcher clips** AND **arranger clips**? (ROADMAP Phase 4 notes "Bitwig's API cannot edit the arranger.")
- Step-sequencer grid vs free note grid — does `addNote` accept arbitrary `start`/`length` in beats?
- Is there a `PinnableCursorClip` (AGENTS.md mentions it as a recent addition) — does pinning matter for editing the right clip?

**Probe recipe:** select a launcher clip → `CursorClip.addNote({pitch, start, length, velocity})` → `getNotes()` → confirm round-trip.

### 3. Automation Write (standard, single-pass)

**Verified surface `[VERIFIED: AGENTS.md]`:** `AutomatableParameter.set(value, ...)`, `Automation` envelope, clip automation.
**Design question:** clip automation vs track automation — which does `AutomatableParameter` write to? Does writing require record/transport-play?

### 4. Bank Paging (standard)

**Verified surface `[VERIFIED: AGENTS.md + DrivenByMoss ModelSetup]`:** `TrackBank`/`DeviceBank`/`CursorRemoteControlsPage` are windowed N (configurable page size — DrivenByMoss `ModelSetup.setNumTracks(N)` etc.).
**Design questions:** scroll vs page? Does the cursor track follow bank scrolls? 8-remote-parameters-per-page confirmed?

### 5. Observer Granularity (standard)

**Verified surface `[VERIFIED: DrivenByMoss OSCControllerSetup]`:** `ITrackBank.addSelectionObserver((index, isSelected) -> ...)`, `addNoteObserver(...)`, plus name/color/value observers via the framework. `configuration.addSettingObserver(key, cb)` for settings.
**Design questions:** are observers per-object or per-bank? Do they fire on the controller thread (must not block)? Is there a debounce/coalesce on rapid changes?

### 6. Stable IDs (D-03 — determines STATE-04 necessity)

**Design questions:** Do `Track`/`Clip`/`Device` expose any stable UUID or hash, or only name+index (which shift on reorder)? `OSCControllerDefinition` uses a fixed UUID for the **extension**, not for tracks `[VERIFIED: OSCControllerDefinition.java]`.
**Probe recipe:** dump a track's name+index, reorder in the UI, re-dump → did the identity follow the track or the slot?
**Mitigation if no stable IDs (likely):** STATE-04 (fingerprint mapping) is **required** — daemon synthesizes stable IDs from a fingerprint (name + type + neighbors + content hash) with reconnect/reconcile-on-connect semantics. Cheap to confirm, high downstream value (D-03).

## Common Pitfalls

### Pitfall 1: Assuming JsApi (JS) can do everything the Java API can
**What goes wrong:** D-07's JS spike is written assuming `host.connectToOSCServer` is reachable from JS; it isn't (OSC API is Java-only), and the spike can't deliver SC#1.
**Why:** JsApi is a documented "sandboxed subset"; networking/file-I/O are exactly the kind of capability a sandbox drops.
**How to avoid:** Decouple transport proof from JS (§The JS-vs-Java Spike Tension). Confirm JsApi's surface in-app on day 1 of the spike before committing the transport track to JS.
**Warning signs:** the JS extension "works" but can't open any socket or write any file.

### Pitfall 2: Confusing "OSC works" with "TCP JSON-Lines works"
**What goes wrong:** The DrivenByMoss OSC evidence is read as proof that raw TCP JSON-Lines works; the spike skips the raw-TCP confirmation and Phase 2 builds a TCP server that then hits an unseen sandbox limit.
**Why:** OSC uses Bitwig's official API path (which may be selectively permissioned); raw `java.net` is a different code path. JNA evidence makes raw TCP *very likely* but not *certain*.
**How to avoid:** Track B (the 30-line `ServerSocket` probe) is cheap insurance — run it.
**Warning signs:** "networking works" stated without distinguishing OSC vs raw TCP.

### Pitfall 3: Blocking a Bitwig observer callback
**What goes wrong:** Daemon does work synchronously inside `addSelectionObserver` → audio engine stalls → producer hears glitches.
**Why:** Observers fire on the controller thread; any blocking stalls it.
**How to avoid:** Observers only enqueue onto the daemon's bounded queue (Pattern 5); a worker drains. This is in the AGENTS.md stack pattern — honor it even in the spike.
**Warning signs:** audio glitches when selection changes rapidly.

### Pitfall 4: Over-freezing the protocol from a 1-event spike
**What goes wrong:** SC#3 is read as "freeze the entire message catalog"; the spike freezes guesses it can't validate, and Phase 2 is locked to wrong shapes.
**Why:** A 1-event proof (`selection.changed`) cannot honestly validate the full edit/response/error catalog.
**How to avoid:** Freeze envelope + handshake + the ~4 seed example messages (event/request/response/edit); explicitly mark the rest as "Phase 2-extensible." CONTEXT.md discretion point — calibrate breadth against SC#3's four named requirements (versioned, atomic, buffer, backpressure), not against catalog completeness.

### Pitfall 5: Binding the TCP server to 0.0.0.0
**What goes wrong:** The daemon's TCP server is reachable from the LAN; violates the local-first/trust model.
**Why:** `net.createServer().listen(port)` defaults to all interfaces.
**How to avoid:** `.listen(port, "127.0.0.1")` explicitly. This is the one security-relevant decision in the spike.

### Pitfall 6: Trusting externally-fetched Bitwig docs
**What goes wrong:** Web research treats a Bitwig API doc page as authoritative; it's stale or 404.
**Why:** STATE.md blocker — confirmed this session (`bitwig.com/developer-resources/` → 404).
**How to avoid:** The in-app scripting guide is the only authoritative source. D-02 bakes this in: probes observe behavior, docs only *design* probes.

## Code Examples

### Envelope schema (the frozen contract core — `schemas/protocol/envelope.schema.json`)

```json
// Source: docs/seed.md §"Proposed local protocol" generalized + jsonlines.org + JSON Schema 2020-12
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bw-brain.local/schemas/protocol/envelope.schema.json",
  "title": "Envelope",
  "type": "object",
  "required": ["version", "type"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
    "type": { "type": "string" },
    "id": { "type": "string", "description": "request/response correlation id" },
    "timestamp": { "type": "number", "description": "unix seconds, sender-originated" },
    "ok": { "type": "boolean", "description": "present on responses" },
    "payload": {}
  },
  "oneOf": [
    { "$ref": "event.schema.json" },
    { "$ref": "request.schema.json" },
    { "$ref": "response.schema.json" },
    { "$ref": "edit.schema.json" },
    { "$ref": "handshake.schema.json" }
  ]
}
```

### Example `selection.changed` (the SC#1 proof message)

```jsonl
{"version":"1.0","type":"selection.changed","timestamp":1773501001,"payload":{"trackId":"trk_5","clipId":"clip_19","deviceId":"dev_2"}}
```

### Bitwig extension transport pattern (from DrivenByMoss — the authoritative reference)

```java
// Source: DrivenByMoss OSCControllerSetup.java (master, 26.6.2) [VERIFIED]
// This is OSC (UDP). bw-brain wants TCP JSON-Lines — Track B confirms raw java.net works the same way.
@Override
protected void createSurface () {
    // Send to an external process:
    final IOpenSoundControlClient oscClient = this.host.connectToOSCServer(sendHost, sendPort);
    // Receive from an external process:
    this.oscServer = this.host.createOSCServer(parser);
}
@Override
protected void createObservers () {
    // selection.changed origin:
    final ITrackBank tb = this.model.getTrackBank ();
    tb.addSelectionObserver ((index, isSelected) -> { /* emit event */ });
}
```

### Daemon reader wiring (TypeScript — the kept scaffolding, D-05)

```typescript
// Source: standard Node.js + Patterns 1–5 above
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { LineBuffer } from "./protocol/line-buffer.js";
import { TcpServerTransport } from "./transport/tcp.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(envelopeSchema);  // imported from schemas/protocol/

const transport = new TcpServerTransport({ host: "127.0.0.1", port: 7878 });
const lines = new LineBuffer((line) => {
  let msg: unknown;
  try { msg = JSON.parse(line); } catch { return; /* drop malformed */ }
  if (!validate(msg)) { console.error(validate.errors); return; }
  onMessage(msg);
});
transport.onMessage((chunk) => lines.feed(chunk));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bitwig API v17/18 | `extension-api:21` (DrivenByMoss 26.6.2 target, Bitwig 5.3+; installed host is 6.0.6) | 2024–2026 | Targeting 21 is safe on the installed host; for broad compat target 19+ (AGENTS.md). Pin the exact API version the installed host exposes in-spike. |
| JSON Schema draft-07 | JSON Schema 2020-12 | 2020+ | Use 2020-12 — `$defs`, native Ajv 8 support, cleaner (AGENTS.md locked). |
| Per-message hand validation | Ajv standalone-compiled validators | Ajv 8.x | Pre-compile at boot; avoid reparsing schemas per message (AGENTS.md). |

**Deprecated/outdated:**
- JsApi-as-production-bridge: explicitly "prototyping only" (AGENTS.md). The spike uses it for iteration; Phase 2 hardens to Java.
- MCP for DAW IPC: explicitly rejected by PROJECT.md (locked).

## Assumptions Log

> Claims tagged `[ASSUMED]` — the planner/discuss-phase should confirm these need no user check, or gate them behind a probe. The spike is *designed* to convert most of these into `[VERIFIED]` findings.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Raw `java.net.ServerSocket`/`Socket` works directly in the Bitwig extension JVM (inferred from JNA+OSC working, not directly demonstrated by any reference extension). | Transport Findings | Medium — if blocked, fall back to OSC-blob or stdio relay. Track B probe converts this to VERIFIED in minutes. |
| A2 | The JS Controller Script (JsApi) does NOT expose networking/file-I/O (it's a "sandboxed subset"). | JS-vs-Java Tension | High for SC#1 if the planner couples transport proof to JS. Mitigation: decouple tracks (recommended). Must observe in-app. |
| A3 | Bitwig `Application.undo()` does not accept a meaningful label and the host coalesces edits on a time window. | Capability Probes #1 | High — drives whether daemon-authoritative revert is the only path (likely) or a complement. D-01 deep-verifies. |
| A4 | Bitwig exposes no stable IDs for tracks/clips/devices (only name+index). | Capability Probes #6 | Medium — if wrong, STATE-04 fingerprint-mapping is unnecessary (saves Phase 2 work). D-03 probe confirms. |
| A5 | `host.println()` output is reachable from an external process (for the stdio-relay fallback). | Transport Decision Rule #3 | Low — only matters if TCP AND OSC both fail (implausible). Confirm only if fallback is triggered. |
| A6 | Bitwig 6.0.6 exposes `extension-api` surface compatible with the v21 coordinate DrivenByMoss targets. | Standard Stack | Low — 6.0.6 is newer than 5.3+; near-certainly a superset. In-app guide confirms exact version. |

**If this table is empty:** — not applicable; the above six are all the assumed claims. A1, A2, A3, A4 are *expected* to be resolved by the spike itself (that is the spike's job).

## Open Questions

1. **Exact JsApi networking surface** (A2) — only resolvable in-app. The planner should make Track-A-vs-Track-B decoupling explicit so this doesn't gate the whole phase.
2. **Exact API version the installed Bitwig 6.0.6 exposes** (A6) — open the in-app scripting guide on spike day 1; record in `docs/bitwig-capabilities.md` header.
3. **Protocol freeze breadth calibration** (CONTEXT.md discretion) — planner decides how much of the catalog beyond envelope+handshake+~4 examples to freeze now vs defer to Phase 2. Recommendation: freeze the spine, defer the catalog.
4. **Whether `PinnableCursorClip` and remote-controls-pages (AGENTS.md "recent additions") are present on the installed host** — fold into capability probe; affects Phase 2 bridge design.

## Environment Availability

> Probed this session via `command -v` / `--version` / Info.plist reads.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | daemon + CLI (D-05) | ✓ | 22.22.3 | AGENTS.md prefers 24 LTS; 22.19+ acceptable for OpenClaw alignment. Acceptable for spike; upgrade before Phase 2 if Pi-package interop demands 24. |
| Bitwig Studio | spike extension host + capability probes | ✓ | 6.0.6 (CFBundleShortVersionString) | None — this is the substrate. Newer than DrivenByMoss's 5.3+ target; near-certainly an API superset. |
| Java/JDK | Track B raw-TCP Java probe (optional); Phase 2 production bridge | ✗ | — | **Not installed.** D-07 spike is JS, so the spike is not blocked. Track B Java probe can either (a) be skipped in favor of reusing DrivenByMoss OSC as the transport proof, or (b) require installing a JDK 21. **Phase 2 needs JDK 21 — flag now.** |
| Maven | Java build/packaging | ✗ | — | Not needed this phase (D-07 defers `.bwextension` packaging to Phase 2). |
| gsd-tools | research/planning seams | ✓ | — | — |

**Missing dependencies with no fallback:** none blocking the spike (Java absence is absorbed by D-07's JS choice + the OSC-as-proof option).

**Missing dependencies with fallback:** Java/JDK 21 — for Phase 2, not this phase. For Track B, fallback is "reuse DrivenByMoss OSC as transport proof" (no JDK needed).

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — section required. This is a **de-risk spike**: validation is unusual. The spike's outputs are *findings + a frozen contract + a thin end-to-end proof*, not a feature suite. The validation surface is kept proportionate — over-testing a spike wastes the spike's whole point (speed of learning).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (ESM-native, fast Ajv support — AGENTS.md) |
| Config file | `daemon/vitest.config.ts` (Wave 0 creates it) |
| Quick run command | `cd daemon && npx vitest run` |
| Full suite command | `cd daemon && npx vitest run` (same — small suite) |

No test infrastructure exists yet (greenfield). Wave 0 of this phase creates `daemon/vitest.config.ts` + the test files below.

### Phase Requirements → Test/Proof Map

| Req ID | Behavior | Test/Proof Type | Automated Command | File Exists? |
|--------|----------|-----------------|-------------------|-------------|
| PROBE-02 / SC#1 | One real `selection.changed` round-trips end-to-end and prints as validated JSON | **runnable spike + exit-code + schema check** | `cd daemon && npx tsx src/cli/dump.ts && echo $?` (exits 0, stdout validates vs envelope.schema.json) | ❌ Wave 0 |
| PROBE-02 / SC#3 (framing) | Partial-line buffer reassembles split messages correctly; atomic-write never splits a line | **property test** (feed random byte-splits of N messages → get N whole messages) | `cd daemon && npx vitest run line-buffer` | ❌ Wave 0 |
| PROBE-02 / SC#3 (schema) | Every example/frozen message validates against its schema | **unit test** (Ajv-compile each schema; assert valid on examples, invalid on counter-examples) | `cd daemon && npx vitest run schemas` | ❌ Wave 0 |
| PROBE-02 / SC#3 (handshake) | Version mismatch is rejected; match is accepted | **unit test** | `cd daemon && npx vitest run handshake` | ❌ Wave 0 |
| PROBE-01 / SC#2 | `docs/bitwig-capabilities.md` exists and is structurally complete | **structural check** (sections present for 5 items + stable-ID; every gap row has a non-empty Mitigation field) | `node scripts/check-capabilities-doc.mjs` (grep-driven structural validator) | ❌ Wave 0 |

**Manual-only (justified):** the *content* of `docs/bitwig-capabilities.md` (observed API behavior) is a human-verified finding by design — no automated test can validate in-app Bitwig behavior. The structural check above only verifies the doc's shape, not its truth.

### Sampling Rate
- **Per task commit:** `cd daemon && npx vitest run` (full suite — it's small)
- **Per wave merge:** same
- **Phase gate:** full suite green + SC#1 runnable spike produces a validated JSON line + SC#2 structural check passes, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `daemon/vitest.config.ts` — Vitest config (ESM)
- [ ] `daemon/src/protocol/line-buffer.test.ts` — property test for PROBE-02/SC#3 framing
- [ ] `daemon/src/protocol/schemas.test.ts` — Ajv validation of every frozen schema + counter-examples
- [ ] `daemon/src/protocol/handshake.test.ts` — version-negotiation accept/reject
- [ ] `scripts/check-capabilities-doc.mjs` — structural validator for PROBE-01/SC#2
- [ ] Framework install: `npm i -D vitest` (part of the single `npm install` in Standard Stack)

*No existing test infrastructure — Wave 0 creates all of the above. This is the lightest viable surface for a spike; Phase 2 expands it.*

## Security Domain

> `security_enforcement: true`, ASVS L1, `security_block_on: high` (`.planning/config.json`). This is a **localhost IPC spike** with no auth, no secrets, no external network egress, no persisted user data beyond the throwaway extension. The security surface is minimal but non-zero.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user localhost; no auth needed for spike. (Phase 2 may add loopback-only bind + optional shared-secret token if threat model grows.) |
| V3 Session Management | no | No sessions in spike. |
| V4 Access Control | no | Single-user localhost. |
| V5 Input Validation | **yes** | **JSON Schema (Ajv) validates every message at the daemon boundary** — this IS the spike's contract-freeze output (SC#3). Malformed/unvalidated messages are dropped, never processed. |
| V6 Cryptography | no | No crypto in spike. |
| V12 Files & Resources | partial | Daemon writes nothing durable in spike (no `.bw-brain/` until Phase 2 MEM-01). |

### Known Threat Patterns for localhost-IPC

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LAN-reachable daemon socket (bind to 0.0.0.0) | Information disclosure / Tampering | **Bind `127.0.0.1` only** (Pitfall 5). Hard rule. |
| Malformed message crashing the reader | Denial of Service | Ajv-validate before process; drop invalid; never `JSON.parse` without try/catch (LineBuffer pattern). |
| Protocol-drift silent corruption | Tampering | Version handshake (Pattern 3) — reject on major-version mismatch. |
| Cross-traffic from another local process | Spoofing | Acceptable for spike (single-user dev box); Phase 2 may add token auth. |

**No high-severity findings** — the spike's security posture is adequate for its scope. The `127.0.0.1`-bind rule and Ajv-boundary-validation are the two controls that must be in place even in the spike.

## Sources

### Primary (HIGH confidence)
- **DrivenByMoss GitHub repo (`git-moss/DrivenByMoss`, master, release 26.6.2, 2026-06-12)** — the authoritative reference Bitwig extension:
  - `pom.xml` — `com.bitwig:extension-api:21`, Java 21, jackson 2.22.0, **JNA 5.19.0 + native HID + nativefilechooser + jamepad**, Maven shade→copy-rename to `.bwextension`. `[VERIFIED via webfetch]`
  - `src/.../bitwig/framework/osc/OpenSoundControlServerImpl.java` — uses `com.bitwig.extension.api.opensoundcontrol.OscServer`; `server.start(port)`. `[VERIFIED]`
  - `src/.../bitwig/framework/osc/OpenSoundControlClientImpl.java` — uses `OscConnection`; comment confirms **UDP** ("maximum of an UDP message"). `[VERIFIED]`
  - `src/.../controller/osc/OSCControllerSetup.java` — `host.connectToOSCServer(host,port)`, `host.createOSCServer(parser)`, `ITrackBank.addSelectionObserver(...)` (selection.changed origin). `[VERIFIED]`
  - `src/.../controller/osc/module/ClipModule.java` — clip/note surface (`INoteClip`, quantize/name/color/pinned/doesExist). `[VERIFIED]`
  - `src/.../controller/osc/OSCControllerDefinition.java` — UUID-for-extension pattern (not for tracks). `[VERIFIED]`
- **`.claude/AGENTS.md` §Technology Stack** — locked stack (Node 24 LTS target, TypeScript 5.7+, Ajv 8.20.0, JSON Schema 2020-12, `com.bitwig:extension-api:21`, jackson 2.22.0); capabilities table; "JsApi is a sandboxed subset"; "TCP is the only option — Bitwig does not give the extension a stdin/stdout." `[VERIFIED — sourced from DrivenByMoss + npm]`
- **Installed Bitwig Studio 6.0.6** — `CFBundleShortVersionString` read from `/Applications/Bitwig Studio.app/Contents/Info.plist`. `[VERIFIED]`
- **npm registry** — `ajv` 8.20.0, `ajv-formats` 3.0.1, `json-schema-to-typescript` 15.0.4, `commander` 15.0.0, `tsx` 4.22.4, `vitest` 4.1.9; no `postinstall` scripts on any. `[VERIFIED via npm view + package-legitimacy gate]`

### Secondary (MEDIUM confidence)
- **jsonlines.org** — spec: UTF-8, one JSON value per line, `\n` terminator (`\r\n` tolerated), trailing terminator recommended, `.jsonl` extension. `[CITED]`
- **docs/seed.md §"Proposed local protocol"** — envelope sketch (`type`/`id`/`timestamp`/`ok`/`payload`), `selection.changed`, `get.selected_clip`, `apply.patch`+`undoLabel`. `[CITED — project seed]`

### Tertiary (LOW confidence / must observe in-spike)
- **Bitwig in-app Developer Resources scripting guide** — `https://www.bitwig.com/developer-resources/` returns **404** externally `[VERIFIED: webfetch]`; authoritative API reference must be opened **in-app** during the spike (STATE.md blocker). All claims about exact JsApi surface, undo labels/coalescing, and stable IDs are `[ASSUMED]` until observed.

## Metadata

**Confidence breakdown:**
- Transport de-risking: **HIGH** — JVM networking is conclusively proven via DrivenByMoss OSC+JNA; raw-TCP residual is a minutes-long confirmation, not an open question.
- Stack: **HIGH** — locked in AGENTS.md, re-verified against DrivenByMoss pom + npm this session.
- Protocol design: **HIGH/MEDIUM** — JSON Lines is a stable spec; envelope/handshake/backpressure are standard practice; freeze-breadth calibration is a planner judgment (MEDIUM).
- In-app API behavior (undo, stable IDs, JsApi surface): **LOW (by design)** — these are the spike's *outputs*. Research establishes the design questions, not the answers.

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (30 days — stable stack; the Bitwig API findings expire the moment the in-app guide is opened, since they convert from questions to verified facts)
