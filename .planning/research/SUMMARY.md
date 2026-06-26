# Project Research Summary

**Project:** bw-brain — local-first Bitwig DAW intelligence layer
**Domain:** DAW-bridge copilot runtime (dumb-bridge / smart-daemon / CLI-stable contract)
**Researched:** 2026-06-25
**Confidence:** HIGH (with one MEDIUM structural flag — Bitwig TCP socket access — to de-risk in Phase 0)

## Executive Summary

bw-brain is a local-first copilot for Bitwig that takes the unusual but well-supported shape of a **dumb Java `.bwextension` bridge + smart TypeScript daemon + stable CLI contract + Pi/OpenClaw UX shell**. Experts build this class of system as an *adapter-over-host-API*: the in-DAW code is reduced to the smallest possible surface that subscribes to host observers, emits versioned JSON-Lines events over localhost TCP, and executes a small vocabulary of typed edit operations. Every piece of musical reasoning, memory, policy, and risk classification lives in a daemon you can unit-test without a running DAW. The agent layer (Pi skills, slash commands, TUI panes) is a thin leaf that drives the **CLI as the versioned contract** — never daemon internals, never the wire protocol — so the agent runtime is substitutable (Claude Code, OpenCode, plain shell, all compose). MCP is explicitly rejected; the seed's "bash and code are composable" stance wins.

The recommended approach is **schema-first, accuracy-first, and patch-first**, in that strict order. Schema-first means the three independent version domains (bridge protocol, on-disk cache, CLI output) are pinned before either side writes a line of business code. Accuracy-first means M1 ships only read-only context (describe what is selected) and **gates M2** behind a measured accuracy bar — because the seed's own warning ("before accurate, it's just casino MIDI") is the single largest trust risk. Patch-first means every mutation — including "obvious" cleanups — flows through `scope → operations → rationale → reversibility → risk → preview → apply`, with a daemon-side `patch-history.jsonl` as the authoritative reversibility path (Bitwig's native undo does not support per-op labels).

The dominant risks all live in the **Bitwig Control Surface API contract**, which is documented only in-app and which is not the "DAW object graph" a planner imagines. It is **cursor + paged banks + cursor-clip editing, with no public stable IDs, no per-operation undo labels, no arbitrary project mutation, no arranger clip editing, and fully asynchronous observer-pattern reads.** Three downstream constraints are non-negotiable: (1) the bridge holds a mirror state fed by `Value<T>` observers — never synchronous "get" calls; (2) "undo" is daemon bookkeeping (`bw-edit revert <patchId>`), not Bitwig undo; (3) arrangement intelligence is observation/suggestion only — edits target launcher clips. The single highest-risk unknown is whether the `.bwextension` JVM permits **TCP** sockets (UDP/OSC is proven via DrivenByMoss). This must be confirmed in a thin Phase-0 spike before M1 commits to daemon-as-TCP-server.

## Key Findings

### Recommended Stack

The stack is a deliberately split Java/TS hybrid chosen for host-API compatibility on one side and reasoning ergonomics on the other. The Java side is locked to **OpenJDK 21 + Bitwig `extension-api:21`** (Bitwig ships a bundled JRE; newer is rejected, older loses features), built with **Maven 3.8+ → shaded JAR → renamed `.bwextension`** (the DrivenByMoss reference path), and uses **Jackson 2.22** for newline-delimited JSON IPC. The TS side runs on **Node 24 LTS** (the OpenClaw/Pi-recommended runtime, shared with the daemon and CLI), in **TypeScript 5.7+**, with **Ajv 8.20** validating every wire and disk boundary against hand-authored **JSON Schema 2020-12** files, **`json2ts`** generating TS types from those schemas, **`tonal`** for music theory primitives (M2+), and **`commander`** for the CLI surface. TypeBox is reserved for daemon-internal shapes — never the wire contract (that stays JSON Schema so the Java bridge can consume it).

**Core technologies:**
- **Java 21 + `com.bitwig:extension-api:21`** — the only officially supported path to observe/mutate Bitwig from a long-running process; `provided` scope, excluded from shade.
- **Node 24 LTS + TypeScript 5.7** — daemon, CLI, and Pi package share one runtime; lowest friction for OpenClaw interop.
- **JSON Schema 2020-12 + Ajv 8 + json2ts** — the cross-language contract source of truth (Java can't read Zod/TypeBox-first); TS types are generated, never hand-written.
- **Maven + Jackson** — battle-tested bridge build path (shade → copy-rename → `.bwextension`); Jackson streams JSON-Lines cleanly.
- **localhost TCP + newline-delimited JSON** — ordered, reliable, debuggable with `nc`/`tail`; the only transport that supports deterministic `apply.patch`.

**Critical version requirements:** target **Bitwig API 19+** for broad compatibility (bump to 21 only for an exclusive feature); `commander@15` needs Node ≥22.12 (fits Node 24 LTS); `jackson-databind 2.22.0` runs on the bundled Bitwig JRE.

**Explicitly rejected:** MCP (project decision), Zod as contract source (TS-first; inverts dependency), `tone.js` (audio engine — wrong product), AWT/Swing/JavaFX (Bitwig exposes no UI toolkit to extensions), native/GraalVM image (Bitwig hosts the jar), cloud model calls (violates local-first), Spring/Quarkus (dead weight for one extension class).

### Expected Features

The feature set splits cleanly into **table stakes** (without these the tool is useless or untrustworthy), **differentiators** (the unoccupied competitive cell — no rival combines analysis-of-existing-material + durable memory + reversible patching + local-first copilot), and **anti-features** (deliberate non-goals that protect the trust model).

**Must have (table stakes — M1/M2):**
- Live context export (`bw-focus export`, `bw-project summary`, `bw-project region`) — the entire premise; needs the bridge mirror.
- Normalized composition-state model (raw → derived → intent) — the contract that lets analyzers/transforms be written once.
- Stable CLI with predictable JSON I/O — the central PROJECT.md decision ("the stable interface is the CLI, not the agent").
- Patch object schema (`scope → operations → rationale → reversibility → risk`) — the hard rule "no edit without a patch object."
- Preview-before-apply flow (`bw-edit preview` + `bw-diff`) — the trust baseline.
- Undo label / patch-history on every applied patch — daemon-side, since Bitwig can't honor it.
- Risk class gating (low/medium/high) — only low-risk is one-step.
- Project memory (`.bw-brain/`: roles, intent, accepted/rejected, motifs) — keeps the assistant from ruining the song.
- MIDI/device inspection, suggestion assumptions, `--explain` opt-in prose — the minimum read + honesty surface.

**Should have (differentiators — M2/M3/M4):**
- **Motif identity preservation across all transforms** — the keystone of "accurate first"; gates variation/counterline/voice-leading.
- Subtle MIDI variation, counterline generation, voice-leading cleanup — work *on* existing material, not from chord packs.
- Section detection + repetition report + energy curve + transition suggestions — project-level arrangement critique (M3).
- Automation salience + macro exposure proposals + bounded automation generation (M4).
- Track-role classification with confidence; genre-pluggable profiles over a generic reasoning core.
- Durable vs ephemeral memory split — try ideas without contaminating the song.
- Pi TUI panes (state/diff/arrangement/device) + `analyze-current` and `suggest-next-edits` composite skills.

**Defer (v2+):** genre profile expansion beyond electronic/techno, additional composite skills, anything in the anti-features list.

**Anti-features (hard non-goals):** background auto-edits, cloud/remote models, MCP, direct mutation without patches, genre hard-coding, heavy reasoning in the bridge, generative "casino MIDI," auto-mastering, stem separation, mobile/web client, real-time always-listening, multi-track mutation without explicit scope, patch-without-preview, chatbot prose interface.

### Architecture Approach

bw-brain is a **dumb-bridge / smart-daemon split** with a **CLI-as-stable-contract** agent layer. A Java `.bwextension` runs inside Bitwig and exposes a thin, observable, typed edit surface over localhost TCP speaking newline-delimited JSON. A TS daemon runs outside Bitwig, owns the authoritative normalized state, runs all reasoning, and serves a small CLI contract. Pi/OpenClaw is the first-class UX; any agent or shell drives the same commands. The only path that mutates the song is `patch → preview → apply` through the bridge — this is the trust boundary the system lives or dies on.

**Major components:**
1. **Bitwig bridge** (`.bwextension`, Java) — pure adapter over the Bitwig API; observers → events, typed ops → API calls, stable-ID mechanics, undo labels. **Zero reasoning, zero memory, zero policy.** Strict off-thread discipline (callbacks enqueue to a worker; p99 < 1ms).
2. **Daemon** (TS) — owns authoritative state in four layers (**raw / derived / intent / patch**, each independently versioned); runs analyzers + transforms; generates patches; enforces guardrails + risk; manages durable + ephemeral memory.
3. **CLI surface** — the versioned public contract (8 `bw-*` commands); thin shims that ask the daemon and emit compact pinned-shape JSON; prose only with `--explain`.
4. **Pi package** — leaf extension: skills (markdown), slash commands (CLI wrappers), TUI panes (daemon subscribers). Depends on CLI contract only — never daemon internals.
5. **Disk store** (`.bw-brain/`) — `state-cache.json` (atomic temp+rename), `patch-history.jsonl` (append-only, self-describing, rotated), `intent.json`/`roles.json` (small, human-editable). Durable vs ephemeral separation is a hard boundary.
6. **Schemas** (`/schemas/{protocol,disk,cli}`) — three independent version domains; daemon validates on every ingest and every disk load.

**Key patterns:** (1) Adapter-over-host-API (bridge is replaceable; daemon is unit-testable); (2) Raw → Derived → Intent → Patch layered state (each cacheable/versionable; conflating them is the #1 cause of LLM-DAW systems that flail); (3) CLI-as-stable-contract (agent-agnostic composability); (4) Durable project memory vs ephemeral session memory (trying ideas never contaminates the song).

### Critical Pitfalls

The top pitfalls, in order of how early each can bite (full set of 12 in PITFALLS.md):

1. **Designing an edit surface the API can't fulfill** — Bitwig has no `clipById().addNote()`; note editing goes through a navigated `CursorClip`, banks are paged, no arranger editing. **Avoid:** build a capability probe in M1 P1 *before* writing any patch-schema field; design the schema bottom-up from the probe; record results in `docs/bitwig-capabilities.md`.
2. **No stable persistent IDs — state rots on every edit** — the public API exposes no GUIDs (indices and names only); reorder/rename silently corrupts `state-cache.json`. **Avoid:** synthesize IDs in the daemon from a fingerprint tuple the API *can* provide; emit `state.reconciled` events; never persist raw index references.
3. **"Every patch gets an undo label" is unfulfillable as written** — Bitwig has no `setUndoLabel`/`beginUndoGroup` in the public surface; multi-op patches may not collapse. **Avoid:** redefine honestly (daemon patch-history + `bw-edit revert <patchId>` is authoritative; Bitwig undo is best-effort); document the caveat prominently.
4. **Reload/restart silently drops the bridge and corrupts in-flight edits** — Bitwig fully tears down and re-creates extensions on reload/restart; no warm reload. **Avoid:** stateless, reconciliation-based connection; idempotency keys (`patchId`) on every `apply.patch`; watchdog marks daemon `stale` and refuses edits when bridge is silent.
5. **Controller-thread callbacks stall all controllers and the host UI** — the controller thread is shared with DrivenByMoss (the user's hardware controller); heavy callbacks freeze the Launchpad/Push. **Avoid:** strict off-thread discipline — callbacks only enqueue to a worker; `catch Throwable` in every callback; load-test with DrivenByMoss co-resident from day one.

Also load-bearing: **JSON-Lines partial-frame/backpressure corruption** (atomic line writes, partial-line buffer, per-message version field, bounded queue with explicit `throttled`), **state-cache corruption + unbounded patch-history** (atomic temp+rename; rotation+retention mirroring OpenClaw's `pruneAfter`/`maxEntries`; `bw-migrate` with `--dry-run`), **trust death by casino MIDI** (M1 accuracy gate before M2; refuse-below-threshold transforms), **multi-track scope escape** (three-layer scope enforcement; hard error on `scope.touched ⊋ scope.declared`), **over-confident heuristics** (carry confidence to user; below threshold = refuse; null-genre-profile test), **CLI contract drift** (one JSON object to stdout; documented exit codes; CI schema validation), **Pi skills/TUI drift** (skills generated from contracts; TUI re-queries on focus).

## Implications for Roadmap

The research strongly validates the seed's 4-milestone plan and adds one critical insertion: **a Phase-0 spike** that de-risks the only structural unknown (Bitwig TCP socket access) and freezes the contract both halves build against. Suggested phase structure:

### Phase 0: Schema + IPC spike (NEW — pre-M1)
**Rationale:** The single highest-risk unknown is whether `.bwextension`s can open **TCP** sockets (UDP/OSC is proven via DrivenByMoss; TCP is inferred at MEDIUM confidence). Combined with the highest-impact foundational contract (protocol + `project-state` + `patch` schemas), this should be proven *first* in a thin vertical slice before either side commits.
**Delivers:** A throwaway extension that opens a socket, emits one real `selection.changed` event, daemon normalizes it, one CLI command prints it. Output: `docs/bitwig-capabilities.md` (capability probe), `schemas/protocol/*` frozen enough to build against, confirmed TCP-or-fallback decision.
**Addresses:** Stack (Java 21 + Node 24 + JSON-Lines), Architecture (IPC recommendation).
**Avoids:** Pitfall 1 (designing an edit surface the API can't fulfill), Pitfall 8 (JSON-Lines framing), and the structural risk of M1 rework if TCP is blocked.

### Phase 1: M1 — Read-only context foundation
**Rationale:** "Accurate first, creative later" is the seed's stance and the dominant trust strategy. Nothing downstream is trustworthy until raw normalization is reliable and the bridge lifecycle is honest. Split internally: schema → bridge observers → daemon ingest → CLI export.
**Delivers:** Java bridge mirror (selection/transport/tracks/clips/devices/params), TS daemon with raw-state normalization + atomic disk cache, stable CLI (`bw-focus export`, `bw-project summary`, `bw-midi inspect`, `bw-device inspect`), project memory bootstrap, Pi `/analyze` skill + read-only state pane. Plus: stable-ID fingerprint synthesis, connection lifecycle + reconcile-on-connect, off-thread bridge discipline, JSON-Lines framing rules, CLI contract tests in CI.
**Addresses:** All M1 table-stakes features; confidence-on-the-wire contract seeded for M3/M4.
**Avoids:** Pitfalls 1, 2, 4, 5, 8, 9 (atomic writes), 11 (CLI contract), 12 (skill codegen + TUI re-query).
**Hard gate before M2:** measured read-only accuracy bar (e.g., "for 20 representative clips, description matches human >90%; `bw-diff` round-trips 100%").

### Phase 2: M2 — Reversible MIDI patching
**Rationale:** Sequence-locked behind M1 — every transform emits patch candidates, so the patch/diff/undo/risk backbone must exist before any creative work. This is the trust backbone for everything later.
**Delivers:** Patch schema + validation, `bw-edit preview/apply`, `bw-diff`, undo labels (daemon-side) + `bw-edit revert <patchId>`, risk class gating, motif signature + preserve-motif-identity **invariant** (refuse-below-threshold), subtle variation / counterline / voice-leading / velocity-timing humanization, patch-history JSONL with rotation, three-layer scope enforcement, Pi `/vary` + `/apply` + diff pane.
**Addresses:** All M2 table-stakes + core differentiators (motif preservation, variation, counterline, voice-leading).
**Avoids:** Pitfall 3 (honest reversibility contract), Pitfall 6 (motif preservation as invariant, not flag), Pitfall 7 (scope enforcement), Pitfall 9 (rotation/retention).
**Risk class gating rule:** medium/high require explicit confirm; multi-track = high risk by definition.

### Phase 3: M3 — Arrangement intelligence
**Rationale:** Project-level critique needs only the *raw* model stable (from M1), not the patch model — so M3 can partially parallelize M2 if resourcing allows. Internal ordering is strict: sections → repetition → energy → transitions (each enables the next).
**Delivers:** `bw-arrange sections` (bottom-up segmentation, confidence-scored), `bw-arrange repetition-report`, `bw-arrange energy-curve`, transition suggestions (energy mismatch + repetition gap), track-role classification with confidence, Pi `/review` + arrangement pane (section timeline + energy sparkline), `suggest-next-edits` composite skill.
**Addresses:** Section detection, repetition report, energy curve, transition suggestions, track-role classification.
**Avoids:** Pitfall 10 (every derived claim carries confidence to user; null-genre-profile test; below threshold = refuse).
**Note:** Arrangement *edits* are observation/suggestion only — API forbids arranger clip editing; suggestion patches must target launcher clips.

### Phase 4: M4 — Automation & device workflows
**Rationale:** Highest-complexity milestone; depends on the device/automation raw model (M1) + patch model (M2) + derived energy/section signals (M3) to target meaningfully. True dependent — defer until M1–M3 stable.
**Delivers:** `bw-automation inspect` (automation salience per track), `bw-device macros-suggest` (ranked macro/XY proposals), `bw-automation propose` (bounded automation generation, always patch, always previewable), Pi `/device` + device pane.
**Addresses:** Automation salience, macro exposure proposals, bounded automation generation.
**Avoids:** Pitfall 10 (ranked candidates with disambiguation, never a single "best" target), Pitfall 7 (writing to a send = multi-track = high risk).

### Phase Ordering Rationale

- **Phase 0 before Phase 1:** the only structural unknown (Bitwig TCP) plus the foundational contract (protocol/state/patch schemas) are cheap to prove and catastrophically expensive to discover late. A weekend spike prevents M1 rework.
- **Phase 1 first (read-only):** the data-flow dependency graph is strictly layered — nothing downstream is trustworthy until raw normalization is reliable and the bridge lifecycle is honest. This is the seed's "accurate first" stance made operational.
- **Phase 2 sequence-locked behind Phase 1:** every transform emits patches; the patch/diff/undo/risk backbone *is* the trust model. Hard accuracy gate prevents casino MIDI.
- **Phase 3 can partially overlap Phase 2:** derived-state analyzers need only the raw model stable, not the patch model. Good schedule-compression candidate.
- **Phase 4 last:** depends on all three prior milestones (raw device/automation model + patch model + derived energy/section signals). True dependent.
- **Bridge lifecycle is cross-cutting, not a milestone:** reconnection-on-restart, stable-ID synthesis, off-thread discipline, idempotency keys — hardened during Phase 1 and carried forward into every phase that touches the bridge.

### Research Flags

**Needs deeper research (`/gsd-plan-phase --research-phase <N>`):**
- **Phase 0:** TCP socket access in the Bitwig JVM (the single highest-risk structural unknown — MEDIUM confidence); fallback path decision (stdio relay). Also: in-app verification of the Bitwig Developer Resources scripting guide to confirm exact API version + recent additions (`PinnableCursorClip`, remote-controls pages).
- **Phase 1:** bridge capability probe (Pitfall 1 — the single highest-risk item in the whole project); exact `CursorClip`/`CursorTrack`/`CursorDevice` observer surface; controller-thread scheduling semantics.
- **Phase 2:** Bitwig undo-grouping behavior (does the host auto-coalesce consecutive edits on a ~1s window?); motif signature algorithm (chroma/rhythm features adapted from librosa.segment concepts to MIDI).
- **Phase 3:** librosa.segment algorithm adaptation (`agglomerative`, `recurrence_matrix`) to MIDI/state rather than audio; section-detection threshold tuning.
- **Phase 4:** automation salience statistics; bounded automation generation with genre profile constraints.

**Standard patterns (skip research-phase):**
- **CLI surface implementation:** commander + Ajv + pinned output schemas — well-documented, established patterns.
- **Disk store:** atomic temp+rename, append-only JSONL with rotation — mirrors OpenClaw's session model.
- **Pi skills/slash/TUI:** standard OpenClaw extension model; skills generated from contracts.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All coordinates verified against primary sources (DrivenByMoss `pom.xml`, npm, Bitwig Maven repo). Bitwig API version coordination is MEDIUM-pending-in-app-verification but the artifact (`com.bitwig:extension-api:21`) is confirmed. |
| Features | HIGH | Competitive landscape cross-checked against 6+ primary sources (LANDR, Scaler 3, Captain Plugins Epic, WigAI, DrivenByMoss, Bitwig community topic). bw-brain's competitive cell is genuinely unoccupied. |
| Architecture | HIGH (core IPC/structure) / MEDIUM (one TCP sub-claim) | Dumb-bridge/smart-daemon is the established cross-DAW pattern. The only structural flag — Bitwig TCP socket access — is inferred from OSC proof and must be confirmed in Phase 0. |
| Pitfalls | HIGH | 12 pitfalls cross-checked against `bitwig/bitwig-extensions`, DrivenByMoss, mossgrabers.de, jsonlines.org, OpenClaw session docs. Bitwig public-API behavioral specifics (undo grouping, stable IDs, threading) are MEDIUM-derived from community API surface — to be re-verified against the in-app scripting guide in Phase 1. |

**Overall confidence:** HIGH — with two named MEDIUM flags that the roadmap already accounts for (Phase 0 TCP spike, Phase 1 capability probe + in-app scripting-guide verification).

### Gaps to Address

- **Bitwig TCP socket access (MEDIUM):** unconfirmed whether `.bwextension`s can open TCP `ServerSocket`/`Socket` (UDP/OSC is proven). **Handle:** Phase 0 spike; fallback = stdio relay.
- **In-app scripting guide never fetched:** the authoritative API reference ships only in-app (Help → Documentation → Developer Resources); web searches 404-prone. **Handle:** open in-app during Phase 0/1; record in `docs/bitwig-capabilities.md`; confirm exact API version + recent additions before M1 lock.
- **Bitwig undo grouping behavior:** whether the host auto-coalesces consecutive controller edits on a ~1s window (and labels the group with the extension's name) is derived from community knowledge, not a fetched javadoc. **Handle:** test explicitly during Phase 2 capability work; document the actual behavior in the reversibility contract.
- **librosa.segment adaptation to MIDI:** the algorithmic basis for section detection / repetition / energy is audio-native; porting to MIDI + composition state is novel work. **Handle:** Phase 3 research-phase; expect threshold tuning and adversarial fixtures.
- **Specific method-name surface** (`CursorClip.addNote`, `Parameter.setValue`, `TrackBank` paging size): consistent with the public API package used by official + DrivenByMoss extensions but not fetched directly. **Handle:** re-verify against the in-app scripting guide in Phase 1 capability probe.

## Sources

### Primary (HIGH confidence)
- `https://maven.bitwig.com` — Bitwig's official Maven repository (verified via DrivenByMoss `pom.xml`): `com.bitwig:extension-api:21`.
- `https://github.com/git-moss/DrivenByMoss` (763★, 159 releases, current for Bitwig 5.3+ Jun 2026, ships OSC) — reference extension proving networking-from-extension is feasible; canonical demonstration of what the Bitwig Java extension API exposes (transport, tracks, clips, scenes, cursor track/clip/device, parameters, automation, MIDI I/O, OSC). Build coordinates (Java 21, shade→copy-rename→`.bwextension`, Jackson 2.22).
- `https://github.com/bitwig/bitwig-extensions` — official Bitwig controller extensions repo; confirms `.bwextension`/`.js` paths, in-app-only scripting guide location, `com.bitwig.extensions.{controllers,framework,util}` package surface.
- `https://www.mossgrabers.de/Software/Bitwig/Bitwig.html` — official DrivenByMoss distribution page; confirms 10+ parallel release lines (Bitwig 2.3 → 5.3+) and that the manual "covers also many pitfalls."
- `https://nodejs.org/en/about/previous-releases` — Node 24 LTS "Krypton" active, 22 LTS maintenance, 26 Current.
- `https://docs.openclaw.ai/` (+ `/tools/skills`, `/tools/slash-commands`, `/concepts/agent`, `/reference/session-management-compaction`) — Pi/OpenClaw architecture, skill authoring, workspace bootstrap, JSONL session storage, TypeBox internal schemas, Node 24 recommendation, Gateway-as-source-of-truth, mutable-store vs append-only-transcript retention model.
- `https://jsonlines.org` — canonical JSON-Lines framing rules (complete JSON per line, `\n` terminator, no BOM, UTF-8).
- npm primary package pages: `ajv` 8.20 (2020-12 support), `@sinclair/typebox` 0.34.49 LTS / 1.x, `json-schema-to-typescript` 15.0.4, `tonal` 6.4.3, `commander` 15.0, `zod` 4.4 (reason for rejection as contract source).
- Competitive primary sources: `scalermusic.com` (Scaler 3), `mixedinkey.com/captain-plugins` (Captain Plugins Epic), `landr.com/plugins/landr-composer` (LANDR Composer / ex-Orb), `github.com/fabb/WigAI` (only direct "AI + Bitwig extension" competitor — 41★, dumb MCP control surface, no analysis/patch/memory/risk), `github.com/topics/bitwig` (77-repo community survey).
- `https://librosa.org/doc/0.11.0/segment` — `recurrence_matrix`, `cross_similarity`, `agglomerative`, `subsegment`, `path_enhance`. Algorithmic basis for section detection / repetition / energy.
- Project-internal: `.planning/PROJECT.md` (guardrails, risk classes, memory classes, milestone plan), `docs/seed.md` (data model, protocol examples, "casino MIDI" warning, durable-vs-ephemeral split).

### Secondary (MEDIUM confidence)
- `https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/` (Mario Zechner, 2025-11-02; cited in seed) — CLI-as-contract vs MCP; ~225-token README vs 13–18k-token MCP servers; "bash and code are composable."
- Bitwig public-API behavioral specifics (undo grouping, controller-thread scheduling, exact `CursorClip`/`TrackBank` paging semantics) — MEDIUM: consistent across official repo structure + DrivenByMoss workaround patterns + in-app-only scripting-guide reality; to be re-verified against the in-app guide in Phase 0/1.
- Cross-DAW bridge patterns (OSC + scripting-layer model across Ableton LiveOSC/Max, Reaper ReaScript+OSC, FL Studio Python scripts, Sonic Pi OSC-native) — domain knowledge confirming the dumb-bridge/smart-daemon split.

---
*Research completed: 2026-06-25*
*Ready for roadmap: yes*
