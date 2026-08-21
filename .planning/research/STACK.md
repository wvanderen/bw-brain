# Stack Research

**Domain:** Local-first Bitwig DAW intelligence layer (Java extension bridge + TS daemon + CLI + Pi/OpenClaw package)
**Researched:** 2026-06-25
**Confidence:** HIGH overall (Bitwig API surface = MEDIUM; rest = HIGH). Bitwig confidence is MEDIUM only because the canonical docs are in-app (Developer Resources) and the API surface claims below are cross-checked against the de-facto reference extension (DrivenByMoss) and the verified `com.bitwig:extension-api:21` Maven artifact, not against Bitwig's published web docs (which are 404-prone).

> **The single highest-risk finding.** Bitwig's Control Surface API exposes a *lot* of read + clip-note edit surface, but it has **no per-operation undo label**, **no arbitrary project mutation**, **no arranger clip editing**, and **no synchronous read** — everything is observer-pattern. Three downstream design constraints follow: (1) the bridge must hold a mirror state object updated by `Value<T>` observers and serve the daemon from the mirror, never synchronously "get" state from Bitwig; (2) the patch `undoLabel` in our schema is **daemon bookkeeping, not a native Bitwig undo label** — "undo last patch" means the daemon replays the inverse operations; (3) arranger-level arrangement intelligence (M3) is **observation-only** — edits must target launcher clips.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Java (OpenJDK 21)** | JDK 21 (LTS) | Bridge runtime inside Bitwig | Bitwig 5.x ships a bundled JRE at Java 21 era and the reference extension (DrivenByMoss 26.6.2) compiles with `source/target 21`. Anything newer risks rejection; anything older loses language features. Confidence: HIGH |
| **Bitwig Control Surface API** | `com.bitwig:extension-api:21` | Official extension contract | This is the **only** officially supported path to observe/mutate Bitwig from a long-running process. Published at Bitwig's own Maven repo `https://maven.bitwig.com`. JS/ControllerScript (JsApi) is a prototyping subset, not the production path. Confidence: HIGH (coordinate verified via DrivenByMoss `pom.xml`) |
| **Node.js** | 24 LTS "Krypton" (≥24.18.0) | Daemon + CLI + Pi package runtime | OpenClaw explicitly recommends Node 24 (or 22.19+). Picking Node 24 LTS means the bw-brain daemon and the Pi/OpenClaw process share one runtime, lowest friction for plugin/skill interop, proven `net.Server`/`net.Socket` for localhost TCP JSON-Lines, `fs/promises` for disk-backed state, native ESM. Confidence: HIGH |
| **TypeScript** | 5.7+ | Daemon, CLI, Pi package | Non-negotiable for the patch/diff/state data model — the type system enforces the patch-operation discriminated union. Also required for OpenClaw/TypeBox alignment. Confidence: HIGH |
| **Maven** | 3.8.1+ (`maven-compiler-plugin` 3.15, `maven-shade-plugin` 3.6.2) | Java build + `.bwextension` packaging | The reference (DrivenByMoss) uses Maven; the toolchain (shade → copy-rename to `.bwextension`) is battle-tested. Gradle works but adds zero benefit for a one-artifact bridge. Confidence: HIGH |
| **JSON Schema (Draft 2020-12)** | — | The contract format | Schemas are hand-authored files in `/schemas/`, shared as the single source of truth across Java bridge, TS daemon, and the Pi layer. Pick 2020-12 (not older drafts) because Ajv 8 supports it natively and `$defs` is cleaner than `definitions`. Confidence: HIGH |

### Supporting Libraries

#### Java side (bitwig-bridge)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `com.bitwig:extension-api` | 21 | Bitwig API surface | Always — provided by Bitwig at runtime, declared `<scope>provided</scope>`/excluded from shade |
| `com.fasterxml.jackson.core:jackson-databind` | 2.22.0 | JSON serialize/parse for JSON-Lines IPC | Always — DrivenByMoss uses the same; Jackson is the JVM standard, handles streaming newline-delimited JSON cleanly via `ObjectMapper` + `BufferedReader.readLine()` |
| JUnit 5 | 5.11.x | Bridge unit tests | Mirror-state logic deserves tests; you cannot meaningfully integration-test against live Bitwig without a harness, so test the pure logic |

#### TypeScript side (daemon + CLI + Pi package)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ajv` | 8.20.0 | Validate JSON-Lines messages + patch objects against `/schemas/*.json` at the boundary | Always — fastest, most standard-compliant, supports 2020-12 + standalone codegen. Pair with `ajv-formats` for `date-time` etc. |
| `json-schema-to-typescript` (`json2ts`) | 15.0.4 | Generate `src/gen/*.ts` types from `/schemas/*.json` | Always — keeps TS types in lockstep with the wire contract. Run via `package.json` script on schema change |
| `tonal` | 6.4.3 | Music theory primitives (Note, Interval, Scale, Chord, Key, PcSet) | M2+ when transforms/analysis need scale-degree preservation, chord detection, key constraints, motif pitch-class operations |
| `commander` | 15.0.0 | CLI subcommand parsing for `bw-focus`, `bw-midi`, `bw-arrange`, etc. | Always for the CLI surface. Requires Node ≥22.12 — fits Node 24 LTS. Strict-by-default, good help, supports `Action` async handlers |
| `@sinclair/typebox` | 0.34.49 (LTS) or 1.x | Daemon-internal value parsing; potential interop with OpenClaw's internal TypeBox schema system | Optional — use for **daemon-internal** configs/state shapes that don't need to cross the wire as JSON Schema. Do NOT use as the contract source (see Anti-Patterns) |
| `ajv-formats` | 3.0.x | String formats (`date-time`, `uri`, etc.) for Ajv | When schemas use `format:` keywords |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **`json2ts` (json-schema-to-typescript CLI)** | Emit TS from JSON Schema | `json2ts -i 'schemas/**/*.json' -o src/gen/` — wire into `npm run gen:types`. Generated files are committed for bridge-side readability |
| **Ajv standalone mode** | Pre-compile validators to JS for fast startup | `ajv.compile(schema)` at daemon boot; for hot paths use `ajv-cli` codegen. Avoid reparsing schemas per message |
| **`tsx`** (or `node --experimental-strip-types` on Node 24) | Run TS directly during dev | Node 24 strips types natively for dev; `tsx` still friendlier for watch mode |
| **Vitest** | TS test runner | ESM-native, fast, good Ajv/TypeBox support. Jest works but adds CJS friction on Node 24 |
| **`prettier` + `eslint`** | Format + lint | Standard |
| **Maven `versions-maven-plugin`** | Keep bridge deps current | DrivenByMoss uses this; copy the `<ignoredVersions>` pattern to skip alpha/beta |
| **OpenClaw skills watcher** | Hot-reload Pi skills on `SKILL.md` change | Built into OpenClaw — set `skills.load.watch: true`. Develop skills live without restarting the Gateway |

---

## Installation

```bash
# === TS side (daemon + CLI + Pi package) — Node 24 LTS ===
# init
npm init -y && npm pkg set type=module

# core runtime
npm install ajv@^8.20 ajv-formats@^3 commander@^15 tonal@^6.4

# dev
npm install -D typescript@^5.7 tsx vitest @types/node \
  json-schema-to-typescript@^15 prettier eslint

# optional daemon-internal schemas (NOT the wire contract)
npm install @sinclair/typebox@^0.34   # or `typebox@^1` for the 1.x branch

# generate TS types from the hand-authored JSON Schemas
npx json2ts -i 'schemas/**/*.json' -o src/gen/

# === Java side (bitwig-bridge) — JDK 21 + Maven 3.8+ ===
# pom.xml essentials:
#   <repository><id>bitwig</id><url>https://maven.bitwig.com</url></repository>
#   <dependency>
#     <groupId>com.bitwig</groupId><artifactId>extension-api</artifactId><version>21</version>
#     <!-- NOT provided scope: shade excludes it explicitly -->
#   </dependency>
#   <dependency>
#     <groupId>com.fasterxml.jackson.core</groupId>
#     <artifactId>jackson-databind</artifactId><version>2.22.0</version>
#   </dependency>
#
# build:
mvn -Dbitwig.extension.directory=/path/to/Bitwig\ Studio/Extensions package
# → target/bw-brain.bwextension (shaded jar, renamed)
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Java `.bwextension`** (extension-api 21) | Bitwig ControllerScript / JsApi (JavaScript) | Prototyping only — JsApi is a sandboxed subset with no Java type safety, no long-lived state guarantees, harder to ship a sturdy JSON-Lines TCP server. The seed doc already says "Java first, JS for prototyping." Revisit if a quick M0 read-only spike is wanted before committing to Java |
| **Node 24 LTS** for daemon | Bun | Only if you need faster cold start for CLI subcommands *and* don't care about Node-API native modules. OpenClaw's Bun workflow is explicitly experimental. **Not recommended for a long-running daemon that must stay up reliably for hours** |
| Node 24 LTS | Deno | Only if you want permissions-by-default security. OpenClaw does not run on Deno; you'd lose the Pi-package runtime alignment for zero benefit |
| **Ajv** (validate hand-written JSON Schema) | Zod 4.x | Only if the schema source-of-truth was TS code, not JSON files. For bw-brain the schemas MUST be cross-language JSON (shared with the Java bridge) — Zod goes the wrong direction |
| Ajv | TypeBox | Only for daemon-internal value parsing where TS is the source of truth *and* you want interop with OpenClaw's internal TypeBox schema system. Keep it out of the wire contract |
| **JSON Schema 2020-12** | Protobuf / Cap'n Proto / MessagePack | Only if JSON-Lines IPC bandwidth becomes a measured bottleneck. It won't — Bitwig state snapshots are KB-sized, not MB. Don't sacrifice inspectability (`nc localhost 7878 | jq -c`) prematurely |
| **Maven** for the bridge | Gradle | Only if the team is already Gradle-fluent. Maven's `shade → copy-rename` for `.bwextension` is one config block; Gradle needs the Shadow plugin + a custom `Rename` action. Net win is zero |
| **localhost TCP JSON-Lines** | stdio relay | Use stdio only for ephemeral CLI invocations that talk to a daemon over a Unix domain socket. For a long-running bridge inside Bitwig, **TCP is the only option** — Bitwig does not give the extension a stdin/stdout to relay through |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **MCP (Model Context Protocol)** | Explicitly rejected by PROJECT.md. The thin JSON-Lines bridge is the chosen IPC — keeps the contract inspectable and composable (`bash and code are composable` stance). MCP adds a tool-registry layer with no marginal value for a single-DAW, single-user copilot | Newline-delimited JSON over localhost TCP, versioned messages |
| **`tone.js`** | Full Web Audio synthesis runtime. The daemon is a *DAW bridge*, not an audio engine. Pulling tone.js bloats the bundle and tempts scope creep into sound generation | If MIDI-file I/O ever becomes a feature, pull `@tonejs/midi` (the lightweight parser) — not `tone` |
| **`@tonejs/midi` for the hot path** | It's a MIDI *file* parser. bw-brain exchanges note arrays as JSON over the wire, never as `.mid` files. Pulling it for the core note-clip path adds a pointless translation layer | Model notes as JSON directly (`{pitch, start, length, velocity}`) in the patch schema |
| **Zod as the schema source of truth** | Zod is TS-first — JSON Schema is a *derived* output. The contract here must be cross-language (Java bridge can't read Zod). Using Zod inverts the dependency and forces you to keep two sources in sync | Hand-authored JSON Schema files → `json2ts` → TS types → Ajv validates at the boundary |
| **AWT/Swing/JavaFX in the bridge** | Bitwig bundles its own JRE and does not expose a UI toolkit to extensions. Any UI work happens in the Pi TUI, not in Java. **Superseded 2026-08-20 (CLAP-first rebaseline, verified live in Phase 04.2): the hosted CLAP editor inside Bitwig is the product UI surface — the no-UI-in-Java guidance stands, but the "real UI lives in the Pi package" claim is retired.** | `host.showPopupNotification(String)` + `host.println(...)` for bridge→user feedback; all real UI is in the Pi package |
| **Native image / GraalVM** for the bridge | Bitwig loads `.bwextension` jars into its own hosted JVM. A native image won't load | Plain JVM bytecode, Java 21 target |
| **Cloud model calls from daemon or bridge** | Explicit project constraint (local-first). No remote model calls. **Superseded 2026-08-20 (CLAP-first rebaseline): local authority is the invariant — an explicitly configured reasoning provider (local or remote, selected in the Pi SDK agentDir outside this repo) receiving only bounded confirmed context after explicit Analyze is permitted per PROJECT.md Constraints; raw audio never leaves the plug-in.** | All reasoning is local: Pi/agent inferences happen on the host where the user already has their model API; the daemon itself is deterministic transforms + schema validation |
| **Spring / Quarkus / any app framework** | The bridge is a single extension class with `init()`/`exit()`. A framework is dead weight | Plain Java + Jackson + the Bitwig extension lifecycle |
| **Auto-edits without a patch object** | Violates the trust model (PROJECT.md guardrail). Even "obvious" cleanup must flow through `scope → operations → rationale → reversible` | Every mutation is a patch; the bridge refuses `apply.patch` without a valid patch object |

---

## Stack Patterns by Variant

**Bitwig version pinning (when to bump `extension-api`):**
- Bitwig bumps the API version (17 → 18 → … → 21) with each feature drop. Target the *lowest* version that has the surface you need; declare it in `ControllerExtensionDefinition.getAPIVersionAssociations()`. Targeting 21 (latest) cuts off users on older Bitwig builds; targeting too old drops features (e.g. `PinnableCursorClip`, remote-controls pages).
- Recommendation: target **API 19+** (broad compat, has CursorClip note + remote-controls). Bump to 21 only when you need a feature exclusive to it.

**If you need the bridge to push state to many subscribers (Pi + a future web viewer):**
- Use a single localhost TCP server in the bridge; subscribers connect and receive the same JSON-Lines event stream. Don't add a pub/sub broker — TCP fan-out is trivial at this scale (1–3 subscribers).

**If a transform risks heavy CPU (energy curve over a 200-bar project):**
- Run it in the daemon worker pool (`node:worker_threads`), not on the bridge. The bridge must stay responsive — never block an observer callback.

**If Pi skills need to call the daemon:**
- Skills invoke the CLI (`bw-focus export --json`) via the OpenClaw `exec` tool. The CLI is the stable interface. Do **not** teach Pi skills the JSON-Lines wire protocol — that's a daemon-internal.

**If you want a quick read-only prototype before committing to Java:**
- Bitwig ControllerScript (JsApi) lets you write a JS controller script that can observe a subset of the API. Use it to validate the data model and JSON shape over a weekend, then port to Java for M1. **Do not ship JS as the production bridge** — it lacks the long-running-stability and type-safety guarantees.

**If you want to share TypeBox schemas with OpenClaw's internal schema system:**
- Use TypeBox for daemon-internal config/state shapes (`bw-brain.config.ts`, runtime-only value objects). OpenClaw's plugin manifest and many internal concepts use TypeBox — alignment eases future deeper integration. Keep the *wire* contract as hand-written JSON Schema regardless.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `com.bitwig:extension-api:21` | Bitwig Studio 5.2+ (approx) | DrivenByMoss 26.6.2 targets v21; older Bitwig installs need older API versions. Test on the user's actual Bitwig version before locking |
| `jackson-databind 2.22.0` | JDK 21 | Runs on the bundled Bitwig JRE. Stream newline-delimited JSON via `ObjectMapper` + line-by-line `BufferedReader` |
| `ajv 8.20.0` | Node 18+ (we use 24 LTS) | Supports JSON Schema draft 2020-12 natively. `ajv-formats 3.x` pairs cleanly |
| `json-schema-to-typescript 15.0.4` | Node 16+ | CLI `json2ts` is the canonical entry point; programmatic `compile()` also works |
| `tonal 6.4.3` | ESM + CJS, browser + Node | Pure-functional, zero deps, TS-native. Tree-shakes well |
| `commander 15.0.0` | Node ≥22.12 | Fits Node 24 LTS. If you must support Node 20, pin `commander@^14` |
| `@sinclair/typebox 0.34.49` (LTS) | TypeBox 1.x is a parallel branch | If you start on 0.x you can stay on it for LTS; 1.x has a slightly different API. Pick one and commit |
| `tsx` / Node 24 native type-stripping | Node 24 | Node 24 strips TS types natively (no transpile) for dev; ship compiled JS for the daemon |

---

## Bitwig Control Surface API — Capabilities & Limits (the highest-risk surface)

This is the constraint set the roadmap must respect. Confidence: MEDIUM (cross-checked against `extension-api` jar usage in DrivenByMoss; the official in-app Developer Resources scripting guide is the authoritative reference and should be opened inside Bitwig to confirm before M1 lock).

### What the API exposes

| Class / Surface | Can read | Can write |
|-----------------|----------|-----------|
| `ControllerHost` | Process entry, scheduling, logging, popups | n/a (entry point) |
| `Transport` | play state, position (beats), tempo, time signature, loop | play/stop/record, tap tempo, nudge |
| `Application` | — | undo(), redo(), zoom, focus panel, new project (no per-op label) |
| `CursorTrack` | the selected track: name, volume, pan, mute, solo, arm, monitor, color, sends | all of those parameters; `playNote(pitch, velocity)` |
| `TrackBank` / `Track` | windowed N tracks (name, color, position, clip launcher slots, devices) | same parameters via the bank window |
| `CursorClip` | loop/play start+length, step grid, notes | **`addNote`, `removeNote`, `getNotes`, NoteStep velocity/duration/pan/pressure/releaseVelocity/timbre** — this is the core MIDI edit surface |
| `CursorDevice` / `DeviceBank` / `Device` | selected device: name, enabled, bypass, parameter pages, envelopes | all of those (parameters via `Parameter.set(value, ...)`) |
| `CursorRemoteControlsPage` | 8 "macro"-style remote parameters per page | each remote parameter |
| `Parameter` / `AutomatableParameter` / `Automation` | value, modulation, automation envelope (clip automation) | `set(value, ...)`, write automation |
| `Arranger` / `Launcher` | scene banks, cue markers, launcher clip slots | scene launch, clip launch (no arranger clip editing) |

### Hard limitations (constrain the design here)

1. **No arbitrary project mutation.** You get exactly the surface above. No "load this device", no "create track", no "edit arranger clip", no "open this plugin window" beyond what `Application` exposes.
2. **No arranger clip editing.** The `Clip`/`CursorClip` note API targets **launcher clips**. For arranger, you can only observe position. → Arrangement intelligence (M3) is **observation + suggestion only**; arrangement edits must route through the launcher or be advisory.
3. **No per-operation undo label.** `application.undo()`/`redo()` exist; Bitwig auto-coalesces consecutive controller edits on a timeout (~1s) and labels the group with the **extension's name**, not a per-op label. → The patch `undoLabel` in our schema is **daemon bookkeeping** (`patch-history.jsonl`), not a Bitwig undo entry. "Undo last patch" = daemon replays inverse operations through the bridge.
4. **Fully asynchronous / observer-pattern.** Every value is a `Value<T>` with `addValueObserver(callback)`. You **cannot synchronously read** state — you must subscribe, let callbacks fire, and maintain a mirror. → The bridge's primary job is to maintain that mirror and serve the daemon from it.
5. **No project-file diff API.** To produce a "before/after" diff, the bridge snapshots the mirror before applying a patch and again after the observers settle.
6. **No multi-track atomic write.** Each `CursorClip`/`Parameter` write is its own operation. "Atomicity" for a patch is the bridge batching ops tightly within Bitwig's coalesce window, plus daemon-side patch-history for rollback.
7. **No background threads from the extension.** Bitwig's API is single-threaded with respect to the host; you schedule tasks via `host.scheduleTask(runnable, delayMs)`. → Heavy work belongs in the daemon, never in the bridge.

### `ControllerExtensionDefinition` contract (what Bitwig looks for)

```
getAPIVersionAssociations()  → List<APIVersion>   // e.g. 19, 20, 21
getName()                    → String              // "bw-brain"
getVendor()                  → String
getVersion()                 → String
getId()                      → String              // stable unique id
getExtensionClass()          → Class<? extends ControllerExtension>
```

The extension `.bwextension` is a **shaded JAR renamed to `.bwextension`** with `Manifest-Version` + `Implementation-*` entries. Bitwig scans `~/.Bitwig Studio/Extensions/` (and the configured location) on startup.

---

## Sources

- `https://maven.bitwig.com` — Bitwig's official Maven repository (verified via DrivenByMoss `pom.xml`) — **HIGH**
- `https://raw.githubusercontent.com/git-moss/DrivenByMoss/master/pom.xml` — reference extension build: `com.bitwig:extension-api:21`, Java 21, shade→copy-rename to `.bwextension`, Jackson 2.22.0 for JSON — **HIGH**
- `https://nodejs.org/en/about/previous-releases` — Node 24 LTS "Krypton" active, 22 LTS maintenance, 26 Current — **HIGH**
- `https://docs.openclaw.ai/` + `/tools/skills` + `/tools/slash-commands` + `/concepts/agent` — OpenClaw/Pi architecture, skill authoring (`SKILL.md` + YAML frontmatter, AgentSkills spec, `/skill <name>` entrypoint, `command-dispatch: tool`), workspace bootstrap files, JSONL session storage, TypeBox internal schemas, Node 24 recommendation — **HIGH**
- `https://www.npmjs.com/package/ajv` — Ajv 8.20.0, JSON Schema draft 2020-12 support, 272M weekly downloads, Node 18+ — **HIGH**
- `https://www.npmjs.com/package/zod` — Zod 4.4.3, TS-first, JSON Schema as derived output (reason for rejection as contract source) — **HIGH**
- `https://www.npmjs.com/package/@sinclair/typebox` — TypeBox 0.34.49 LTS / 1.x latest, JSON Schema builder, zero deps, OpenClaw-internal — **HIGH**
- `https://www.npmjs.com/package/json-schema-to-typescript` — `json2ts` 15.0.4, 2.3M weekly, schema → TS codegen — **HIGH**
- `https://www.npmjs.com/package/@tonejs/midi` — @tonejs/midi 2.0.28, MIDI-file parser, 4 years old but stable (not the hot path for bw-brain) — **HIGH**
- `https://www.npmjs.com/package/tonal` — tonal 6.4.3, music theory primitives, TS-native, pure functional — **HIGH**
- `https://www.npmjs.com/package/commander` — commander 15.0.0, Node ≥22.12, CLI parser — **HIGH**
- In-app Bitwig Studio → Help → Developer Resources (scripting guide + Control Surface API reference) — **NOT YET VERIFIED on web** — the authoritative API reference; roadmap should flag "open in-app and confirm API version + recent additions (PinnableCursorClip, remote-controls pages) before M1 lock" — **MEDIUM (pending in-app verification)**
- `https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/` (cited in seed) — rationale for JSON-Lines over MCP — **MEDIUM**

---
*Stack research for: local-first Bitwig intelligence layer (bw-brain)*
*Researched: 2026-06-25*
