# Phase 3: Reversible MIDI Patching (M2) - Research

**Researched:** 2026-06-29 (force-refresh: added `## Validation Architecture` + closing sections)
**Domain:** reversible MIDI edit pipeline (patch schema → preview → daemon-authoritative revert → risk gating → motif-preserving transforms → genre-profile interface)
**Confidence:** HIGH (codebase-internal phase; every answer traceable to a file:line. Two external bits — tonal API + librosa-derived motif concepts — verified via npm docs. Validation stack: vitest + fast-check both `[VERIFIED: npm registry]`.)

## Summary

Phase 3 operationalizes the **trust spine** the whole project lives or dies on: every mutation flows through a validated `Patch` object (`scope → operations → rationale → reversibility → risk`), `bw-edit preview` renders a diff before any apply, `bw-edit revert` is daemon-authoritative via an append-only `patch-history.jsonl` (Bitwig's native undo is caveated, NOT relied on — `docs/bitwig-capabilities.md` §1 verified there is NO labelled-undo API), and risk gating refuses medium/high without an explicit `--confirm`. On top of that spine ride four motif-preserving MIDI transforms (`vary` / `counterline` / `voice-leading-fix` / `humanization`), a genre-profile interface (`electronic/techno` v1 ships JSON-only, generic core runs without a profile), and Pi `/vary` + `/apply` skills.

The good news for the planner: **the spine already exists.** Phase 2 shipped `daemon/src/cli/diff-logic.ts` (pure `computeStateDiff` / `applyDiff` with the SC#1 round-trip property test), `daemon/src/store/atomic-write.ts` (temp+rename), `daemon/src/state/analyzer-registry.ts` (the D-08 plugin interface MIDI-01 plugs into), `daemon/src/state/intent-store.ts` (atomic validated read), `daemon/src/protocol/correlator.ts` (the daemon→bridge `get.*` request/response primitive that `apply.patch` rides), and the bridge `PullHandlers.java` grid-walk read pattern (`getStep(x,y,0)`, velocity>0) that the `apply.patch` write path mirrors via `NoteStep` setters. `bw-edit` is currently an M1 stub (`daemon/src/cli/commands/edit.ts:14` → `emitStub({name:"bw-edit", availableFrom:"M2"})`); P3 replaces it with `preview`/`apply`/`revert`.

**Two ROADMAP-flagged research items are settled here:**
1. **Undo-coalescing** — `docs/bitwig-capabilities.md` §1 already verified NO labelled-undo API; the coalescing-window + per-note-vs-batch undo-step probe is PENDING in-app but refines ONLY the user-facing "Cmd-Z step count" caveat. The daemon-authoritative revert (D-03) is the spine regardless. P3 treats the probe as an end-of-phase human-verify checkpoint, NOT a gate.
2. **Motif signature algorithm** — adapted from librosa's chroma concept but MIDI-trivial: each note's pitch is known, so the chroma vector is a direct velocity×length-weighted 12-bin histogram (no STFT). Combined with a 5-bucket inter-onset-interval (IOI) rhythm histogram + step-density ratio. Similarity = 0.6·cosine(PCP) + 0.4·histogramIntersection(rhythm). Detailed in §Code Examples.

**Two findings the planner MUST know:**
- **`tonal` is NOT installed.** `daemon/package.json` lists only `ajv`/`ajv-formats`/`commander`. STACK.md lists `tonal 6.4.3` aspirationally; P3 must add it as a real dependency (legitimacy-gate verdict: `OK`, 10.5K weekly downloads, MIT, `github.com/tonaljs/tonal`, last published 2026-01).
- **tonal does NOT do key detection.** Verified via `@tonaljs/key` npm docs: `Key.majorKey(tonic)` / `Key.minorKey(tonic)` are LOOKUP (description) functions that take a KNOWN tonic. There is NO `Key.detect()` / `Key.guess()` / `Key.fromNotes()`. Implication for D-12: tonal MATERIALIZES a detected key (scale, chord set, scale degrees) but CANNOT INFER one. The pitch-class-profile → key detection step (Krumhansl-Schmuckler correlation against 24 reference profiles) must be hand-rolled in the daemon. See §Don't Hand-Roll.

**Primary recommendation:** Build the patch pipeline as five pure-function modules (patch-resolve, risk-classifier, motif-signature, inverse-ops, harmonic-detect) each property-tested in isolation, then wire them into the I/O-bound `bw-edit`/`bw-midi` commander wrappers + the bridge `case "apply.patch"` handler. Reuse `computeStateDiff` verbatim for preview (D-06). Mint `Note.key = n:${pitch}:${startQuantized}` so pitch-changes model as remove+add (new identity) and velocity/length changes model as `update_note_field` (same key) — this preserves `diff-logic.ts` set-semantics round-trip.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 .. D-15)

**Patch Operation Catalog (EDIT-01)**
- **D-01 — Hybrid catalog (primitives canonical, semantics as metadata):** primitive CRUD `add_note` / `remove_note` / `update_note_field` (carrying before+after) are the CANONICAL wire format. Semantic transform names ride in a separate `transformIntent` metadata field. The bridge NEVER branches on `transformIntent`. The envelope-level trust-spine (P1 `edit.schema.json`: `undoLabel` required + `operations` non-empty) is unchanged; P3 tightens the operation `items` from `{type:object}` to the discriminated primitive union.
- **D-02 — Single cursor-clip scope (multi deferred):** P3 patches target the currently-selected/pinned clip ONLY. `scope.clipSid` is REQUIRED and MUST match the live cursor clip; a patch declaring >1 `trackSid` is a hard error (SC#3 "multi-track = high by definition" enforced as reject). Multi-clip / multi-track deferred.
- **D-03 — Self-reversing primitive ops (EDIT-05):** each primitive is self-inverting at creation time. `add_note` inverse = `remove_note`; `remove_note` inverse = `add_note`; `update_note_field` inverse = swap before/after. `patch-history.jsonl` records applied patches in order; `bw-edit revert <patchId>` replays inverse ops in reverse. No snapshot storage.

**Preview → Apply Workflow (EDIT-02/04/06)**
- **D-04 — Two-step explicit, NO interactive prompt:** `bw-edit preview <patch>` emits preview JSON (diff + risk class + `patchId`); `bw-edit apply <patchId>` is a SEPARATE call. No `y/N` prompt. Low-risk: apply is one extra explicit call; medium/high: `apply` requires a `--confirm` flag (still explicit). `--force` bypasses the medium/high `--confirm` gate (still explicit, still recorded). Researcher finalizes exact flag names; invariant: "no interactive prompt, every apply deliberate, med/high need an explicit override flag."
- **D-05 — Daemon in-memory candidate store (ephemeral):** candidate patches live in a daemon in-memory ephemeral store keyed by `patchId`, minted at preview time. `bw-edit apply <patchId>` looks it up. Lost on daemon restart — acceptable (candidates are ephemeral per MEM-02). `bw-midi vary` returns 3 `patchId`s (A/B/C). `patch-history.jsonl` records ONLY applied patches, NEVER candidates. Satisfies MEM-02 + D-07.
- **D-06 — Preview reuses `computeStateDiff`:** `bw-edit preview` resolves the patch ops against the current clip state in-memory, then calls the EXISTING `computeStateDiff(before, after)` from `daemon/src/cli/diff-logic.ts`. Preview output is a `StateDiff` (`notesAdded`/`notesRemoved`/`notesChanged` + `automationTouched` + `scopeTrackSids`). `bw-diff` stays state-vs-state; `preview` is patch-vs-live-state. UX-02 diff pane renders ONE shape. SC#1 round-trip covers preview.
- **D-07 — Risk class: author declares, daemon floors (EDIT-06):** each transform mints its patch WITH a self-declared risk class (`humanize`→low, `voice-leading-fix`→low, `counterline`→medium, broad rewrites→high). The daemon VALIDATES the declaration against a fixed ruleset (note count touched, field types, blast radius) and may UPGRADE (never downgrade). A scope mismatch (`scope.touched ⊋ scope.declared`) hard-errors regardless of declared class. Risk surfaces in `assumptions[]`.

**Transform Refusal Shape (MIDI-01/02)**
- **D-08 — Refuse + show near-miss:** when nothing clears the motif-preservation bar, the transform emits an empty primary result (`status: "refused"` + refusal reason + `assumptions[]`) AND surfaces the closest near-miss as a tagged `belowBarCandidate` with its motif-similarity score + a caveat. Default path refuses; the near-miss is visibility, not an applicable candidate.
- **D-09 — Below-bar override = HIGH risk + audit:** a below-bar near-miss CAN be applied ONLY via `--allow-below-bar` that reclassifies the patch as HIGH-risk (still requires `--confirm`) AND stamps the patch metadata `belowBar: true` + the motif-similarity score into `patch-history.jsonl`. Default path still refuses; override is deliberate, auditable, high-risk escape hatch.
- **D-10 — Tiered motif check (creative vs cleanup):** "Creative" transforms (`vary`, `counterline`) run the FULL motif-preservation check with a meaningful threshold and CAN refuse. "Cleanup" transforms (`voice-leading-fix`, `humanize`) run a TRIVIAL/relaxed check (or skip the creative gate). MIDI-04/05 are documented low-risk; a humanize that refused because it "changed the motif" would be a bug. Motif signature is computed over the source clip (or the declared region).

**Musical Knowledge Source (MIDI-03/04, ARCH-01/02, UX-02)**
- **D-11 — Region-aware transform target:** default is whole clip; if the patch `scope` declares a `region: {start, end}` in beats (already in P2 `project-state.schema.json` `selection.region`), the transform operates ONLY there. Motif signature is computed over the region with the full clip available as CONTEXT. Non-breaking default.
- **D-12 — Harmonic center: authored default + inferred fallback:** default source is user-authored in `intent.json` — extend STATE-03 with optional `harmonicCenter: {key, mode}`. If absent, a transform MAY run a one-shot inference (tonal `Key`/`Scale` detection over the clip's pitch-class profile) with an explicit `assumptions[]` entry `"harmonicCenter: inferred, confidence: X"` stamped on the patch — only for low-risk-tolerant transforms. Producer opts into inference by leaving `intent.json` blank.
- **D-13 — Genre profile = data + optional hooks (ARCH-01):** a profile is a declarative JSON config of constants (default motif-similarity thresholds per transform type, typical velocity-humanize curves, role→motif-salience weights, preferred scales/modes for the inferred-harmony fallback) PLUS a small fixed set of OPTIONAL override hooks. The generic core reads the config; if a hook is present, calls it; if absent, uses the data default. `electronic/techno` v1 ships JSON-only (no hooks).
- **D-14 — Generic default, techno opted-in (ARCH-02):** the daemon ships a STRICT generic core (hardcoded neutral defaults, no genre flavor). `electronic/techno` is a SEPARATE profile the producer OPTS INTO via `intent.json` (`profile: "techno"`). If no profile is named, the generic core runs as-is. `electronic/techno` ships inside the daemon package (`daemon/src/profiles/techno.json`).
- **D-15 — Pi `/vary` summaries + on-demand diff pane (UX-02):** `/vary` runs `bw-midi vary` and lists the A/B/C candidates each as a SUMMARY line (label + transform type + risk + motif-similarity + one-line description + `patchId`) — NO inline diffs. The user picks; `/apply <patchId>` runs `bw-edit apply` (`--confirm` for med/high). The DIFF PANE renders ON-DEMAND (`/diff <patchId>` or "preview B") — showing the `StateDiff`. Keeps the picking signal (motif-similarity) visible.

### the agent's Discretion
- **Note identity mechanism (D-01/D-03):** binding invariants — must be consistent with `diff-logic.ts` `Note.key`, must let `revert` mechanically find the same note, must NOT over-engineer note-sids if a content-key suffices for single-clip scope. **Researcher pins:** see §Code Examples "Note identity" — `n:${pitch}:${startQuantized}`.
- **`--force` vs `--confirm` exact flag names (D-04):** researcher finalizes. **Recommendation:** `--confirm` for the med/high explicit-ack flag, `--force` for the bypass-`--confirm` escape hatch, `--allow-below-bar` for the D-09 override (stacks with `--force`). Invariant holds.
- **Motif signature caching (MIDI-01):** MIDI-01 plugs into the P2 D-08 analyzer-registry. **Researcher recommendation:** cache in EPHEMERAL memory only (recompute per transform invocation); durable caching to `state-cache.json` is a P4+ concern (motif identity is per-transform-context, not project-stable until ARRANGE-05 track roles land).
- **ARCH-01 hook set (D-13):** researcher designs. **Candidate hooks:** `motifSalience(role)`, `constrainTransform(candidate, ctx)`, `defaultThreshold(transformType)`. `electronic/techno` v1 ships JSON-only; hooks are designed additive.
- **Bitwig undo-coalescing + motif signature ALGORITHM:** ROADMAP-flagged. **Undo-coalescing:** PENDING in-app; refines only the user-facing caveat (daemon-authoritative revert is the spine regardless). **Motif algorithm:** chroma PCP + IOI rhythm histogram + density; see §Code Examples.

### Deferred Ideas (OUT OF SCOPE)
- Multi-clip / multi-track patch scope (P3 ships single cursor-clip only, D-02).
- Profile hook implementations beyond JSON (`electronic/techno` v1 ships JSON-only, D-13).
- Per-project profile customization in `.bw-brain/` (ties to MEM-03 cross-project memory).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | Patch object schema (`scope → operations → rationale → reversibility → risk`) at `schemas/patch.schema.json`, validated at every boundary | §Architecture Patterns "Patch schema shape" + §Code Examples "schemas/patch.schema.json sketch"; envelope reuses frozen `edit.schema.json`, operations items tighten to primitive union $ref |
| EDIT-02 | `bw-edit preview` renders a diff without applying | §Code Examples "preview = computeStateDiff (D-06)"; resolves ops against live clip state, calls existing `computeStateDiff` from `diff-logic.ts:117` |
| EDIT-03 | `bw-diff` surfaces added/removed/changed notes, automation touched, scope | Already shipped Phase 2 (D-05 P2 promotion). Stays state-vs-state. No new work — P3 preview reuses the same `StateDiff` shape. |
| EDIT-04 | `bw-edit apply` applies after preview unless `--force`; every applied patch recorded with daemon-authoritative undo entry | §Code Examples "candidate store + apply flow" + §Architecture Patterns "patch-history.jsonl"; D-04 two-step explicit, D-05 ephemeral candidate store |
| EDIT-05 | Daemon-authoritative undo: `patch-history.jsonl` + `bw-edit revert` replay inverse ops; Bitwig native undo caveated | §Code Examples "self-inverting primitive ops (D-03)" + §Architecture Patterns "patch-history.jsonl journal"; bitwig-capabilities.md §1 = no labelled-undo API verified |
| EDIT-06 | Risk class gating: low one-step, med/high explicit confirmation | §Code Examples "risk classifier (D-07)" — author declares, daemon floors (upgrade-only), scope mismatch hard-errors |
| MIDI-01 | Motif signature (pitch-class + rhythm quantization) + preserve-motif-identity mode; every creative transform defaults to preserve-motif | §Code Examples "motif signature" — PCP histogram + IOI buckets + density ratio; plugs into `analyzer-registry.ts` D-08 interface; similarity = 0.6·cosine + 0.4·histogramIntersection |
| MIDI-02 | `bw-midi vary` produces motif-preserving A/B/C variants | §Code Examples "vary transform" — 3 variants (rhythmic displacement / interval contraction / octave overlay), each passes 0.85 motif threshold or refuses (D-08) |
| MIDI-03 | `bw-midi counterline` generates companion voice respecting harmonic center + motif identity | §Code Examples "counterline transform" — chord-tone below source strong-beat notes, must respect `Scale.get(harmonicCenter).notes` (D-12); risk=medium |
| MIDI-04 | `bw-midi voice-leading-fix` produces low-risk cleanup (parallel fifths, leading tones, spacing) | §Code Examples "voice-leading-fix" — detect parallel P5/P8 between consecutive intervals, resolve by step; cleanup tier (D-10) skips motif gate; risk=low |
| MIDI-05 | Velocity/timing humanization produces low-risk humanization patch | §Code Examples "humanize" — gaussian jitter velocity ±5, start ±0.01 beats; cleanup tier; risk=low |
| UX-02 | Pi `/vary`, `/apply` skills + diff pane rendering patch diffs | §Code Examples "Pi /vary + /apply SKILL.md" — mirrors existing `pi-pack/skills/analyze/SKILL.md` pattern; `/diff <patchId>` on-demand pane renders `StateDiff` |
| ARCH-01 | Genre-pluggable profile interface; electronic/techno ships as first profile | §Architecture Patterns "genre profile loader" + §Code Examples "profile JSON shape"; `daemon/src/profiles/{generic,techno}.json`, optional hooks designed-not-exercised |
| ARCH-02 | Generic reasoning core runs without a profile (defaults to generic); profiles enhance, never gate | D-14 — generic.json ships hardcoded neutral defaults; profile absent → generic core runs literally; no hook = data default |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Patch schema definition + validation | Daemon (schema + Ajv) | Bridge (re-validate on apply) | Single source of truth at `schemas/patch.schema.json`; daemon validates at preview, bridge validates again at apply boundary (defense-in-depth) |
| Patch op resolution (before → after Note[]) | Daemon (pure) | — | Pure function over in-memory state; must match `computeStateDiff` set-semantics exactly |
| StateDiff computation (preview) | Daemon (pure, reuses `diff-logic.ts`) | — | D-06 locks: reuse `computeStateDiff(before, after)` verbatim |
| Risk classification + scope-mismatch check | Daemon (pure) | — | Author declares, daemon floors (D-07); scope.touched computed post-resolve |
| Candidate store (preview patchIds) | Daemon (ephemeral in-memory) | — | MEM-02 boundary: never crosses into `.bw-brain/`; D-05 |
| Patch history journal (durable undo spine) | Daemon (`.bw-brain/patch-history.jsonl`) | — | D-03 daemon-authoritative; atomic-write discipline via `atomic-write.ts` |
| Motif signature computation | Daemon (pure, analyzer-registry) | — | MIDI-01 plugs into D-08 framework; pure function over Note[] |
| Harmonic center inference (Krumhansl-Schmuckler) | Daemon (pure) | — | Hand-rolled (tonal can't detect — see §Don't Hand-Roll); one-shot over clip PCP |
| MIDI transform generation (vary/counterline/etc.) | Daemon (pure) | — | Emits primitive ops + transformIntent metadata; never mutates bridge directly |
| Genre profile resolution | Daemon (config loader) | — | Reads `intent.profile`, loads `daemon/src/profiles/<name>.json` |
| Bridge apply.patch (NoteStep mutation) | Bridge (Bitwig JVM) | — | Only place Bitwig is mutated; consumes primitive ops, never `transformIntent` |
| `bw-edit preview` / `apply` / `revert` CLI | CLI (thin UDS client) | Daemon | CLI is a thin wrapper (D-07 P2); all state lives in daemon |
| `bw-midi vary` / `counterline` / etc. CLI | CLI (thin UDS client) | Daemon | Same pattern as existing `bw-midi inspect` (`commands/midi.ts`) |
| Pi `/vary` + `/apply` + `/diff` UX | Pi (skill shells out to CLI) | — | D-12 P2 + D-15: Pi wraps CLI; no direct Pi↔daemon path |
| Loopback security invariant (Pitfall 5) | Transport (TCP 7878 + UDS) | — | P3 adds NO new listener — uses existing bridge TCP for apply.patch + UDS for CLI. Invariant still governs. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ajv` (existing) | 8.20.0 | Validate patch objects against `schemas/patch.schema.json` at every boundary | P1/P2 standard; `import { Ajv2020 } from "ajv/dist/2020.js"` (AGENTS.md NodeNext quirk); standalone-compiled at boot; `addFormats` deliberately NOT used |
| `commander` (existing) | 15.0.0 | `bw-edit preview/apply/revert` + `bw-midi vary/counterline/...` subcommand parsing | P2 multicall pattern (`commands/midi.ts:27`); same `program.name("bw-edit").command("preview")...` shape |
| `tonal` (**NEW — P3 must install**) | 6.4.3 | Music-theory primitives for MIDI-01 motif PCP, D-12 harmonic-center materialization, MIDI-03 counterline chord-tone selection, MIDI-04 voice-leading interval math | STACK.md M2+ commitment. Umbrella re-exports `@tonaljs/{key,scale,pcset,chord,midi,note,interval,voice-leading,voicing}`. **Limitation:** `Key.majorKey/minorKey` are LOOKUP only (take a known tonic) — no `Key.detect()`. Pcset gives the binary chroma (perfect for PCP). `[VERIFIED: npm registry]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (built-in) | — | `randomUUID()` for patchId minting; `createHash("sha256")` for harmonic-center PCP hashing, scope.touched hashing | patchId = `pt_${randomUUID()}` (mirrors `correlator.ts:91` pattern); never hand-roll IDs |
| `node:fs/promises` (built-in) | — | `appendFile` for `patch-history.jsonl` (small line, atomic on POSIX); `atomic-write.ts` `atomicWriteJson` on rotate | Append-only journal; rotate-via-rename uses existing primitive |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tonal` for music theory | hand-rolled PCP + interval math | Hand-rolling loses enharmonic spelling, Scale.get, chord dictionaries, voice-leading helpers. tonal is MIT, zero-dep, TS-native, 60KB tree-shaken. Use tonal. |
| `tonal Key.majorKey` for inference | a real `Key.detect()` | **Not available** — tonal has no detection. Must hand-roll Krumhansl-Schmuckler correlation (see §Don't Hand-Roll). |
| Krumhansl-Schmuckler for key detection | Edma / tempered K-K profile / simple PCP-max | K-S is the documented MIR standard (cited via librosa lineage); reference profiles are public domain. Simple PCP-max loses minor/major disambiguation. Use K-S. |
| Custom JSONL `patch-history.jsonl` | SQLite | JSONL is grep-able, append-atomic, matches the seed design + existing atomic-write discipline. SQLite adds a runtime + binary in `.bw-brain/`. Use JSONL. |

**Installation:**
```bash
cd daemon && npm install tonal@6.4.3
```
Add to `daemon/package.json` `dependencies` (NOT devDependencies — runtime use in motif-signature + harmonic-detect + counterline).

**Version verification:**
```
npm view tonal version  → 6.4.3  (published 2026-01-18, MIT, github.com/tonaljs/tonal)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `tonal` | npm | ~5 yrs (umbrella; @tonaljs/* submodules since 2018) | ~10.5K/wk (umbrella) + ~13-15K/wk per active submodule | github.com/tonaljs/tonal | OK | Approved — add to `daemon/package.json` deps |
| `ajv` (existing) | npm | 9+ yrs | 272M/wk | github.com/ajv-validator/ajv | OK | Already installed |
| `commander` (existing) | npm | 12+ yrs | 60M/wk | github.com/tj/commander.js | OK | Already installed |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

*`tonal` discovered via STACK.md (Phase 1 research, M2+ commitment) and verified via `npm view` + npm docs + `gsd-tools query package-legitimacy check`. The umbrella package's published-at is 2026-01-18 but the @tonaljs/* submodule family has been actively maintained since 2018 with 44+ versions on `@tonaljs/key` alone. No `postinstall` script. MIT license.*

## Architecture Patterns

### System Architecture Diagram

```
                         PRODUCER ACTION
                               │
                  ┌────────────▼────────────┐
                  │   Pi /vary, /apply,     │   UX-02 / D-15
                  │   /diff (SKILL.md)      │
                  └────────────┬────────────┘
                               │ shells out (D-12 P2)
                  ┌────────────▼────────────┐
                  │  CLI: bw-edit, bw-midi  │   thin UDS client
                  │  (commands/edit.ts,     │   (D-07 P2 — query-client.ts)
                  │   commands/midi.ts)     │
                  └────────────┬────────────┘
                               │ UDS query {op, payload}
                               │ (separate from bridge TCP 7878)
                  ┌────────────▼──────────────────────────────┐
                  │              DAEMON (TS)                   │
                  │                                            │
                  │  ┌──────────────────┐  ┌────────────────┐ │
                  │  │ query-server.ts  │  │ candidate      │ │ D-05
                  │  │  (UDS dispatch)  │  │ store          │ │ ephemeral
                  │  │  + edit ops      │  │ Map<patchId,   │ │ in-memory
                  │  │    added         │  │     Patch>     │ │
                  │  └────────┬─────────┘  └────────┬───────┘ │
                  │           │                     │         │
                  │   ┌───────▼─────────────────────▼──────┐  │
                  │   │   PURE PIPELINE (property-tested)  │  │
                  │   │                                     │  │
                  │   │  motif-signature ◄── analyzer-registry.ts (D-08)
                  │   │       │                             │  │ MIDI-01
                  │   │       ▼                             │  │
                  │   │  harmonic-detect (K-S, hand-rolled) │  │ D-12
                  │   │       │                             │  │
                  │   │       ▼                             │  │
                  │   │  transform engine                   │  │ MIDI-02..05
                  │   │  (vary/counterline/VL-fix/humanize) │  │
                  │   │       │ emits Patch{ops,intent}     │  │
                  │   │       ▼                             │  │
                  │   │  risk-classifier (D-07) ───────► refuse / belowBar (D-08/09)
                  │   │       │                             │  │
                  │   │       ▼                             │  │
                  │   │  patch-resolve (ops → after Note[]) │  │
                  │   │       │                             │  │
                  │   │       ▼                             │  │
                  │   │  computeStateDiff (DIFF-LOGIC.TS)   │  │ D-06 reuse
                  │   │       │                             │  │
                  │   │       ▼                             │  │
                  │   │  inverse-ops (D-03 self-inverting)  │  │
                  │   └───────┬─────────────────────────────┘  │
                  │           │                                │
                  │   ┌───────▼───────┐  ┌──────────────────┐  │
                  │   │ profile loader│  │ patch-history.jsonl │ D-03 spine
                  │   │ generic.json  │  │ (.bw-brain/,       │ MEM-01
                  │   │ techno.json   │  │  atomic-write)     │
                  │   └───────────────┘  └──────────────────┘  │
                  │                                            │
                  └────────────┬───────────────────────────────┘
                               │ TCP 127.0.0.1:7878 (bridge-only)
                               │ {type:"apply.patch", id, payload:{patch}}
                               │ (correlator.ts awaits response)
                  ┌────────────▼────────────┐
                  │   BRIDGE (Java, JVM     │   PullHandlers.java
                  │   inside Bitwig)        │   NEW case "apply.patch":
                  │                         │   for each primitive op:
                  │   NoteStep = clip       │     add_note    → getStep(x,y,0).setVelocity
                  │     .getStep(x,y,0)     │     remove_note → getStep(x,y,0).setVelocity(0)
                  │     .setVelocity(d)     │     update_note_field → setVelocity/setDuration
                  │     .setDuration(d)     │   reply {id, ok, appliedOps:N}
                  └─────────────────────────┘
```

**Trace the primary use case** (Pi `/vary` → `/apply`): producer types `/vary` → Pi shells to `bw-midi vary` → CLI UDS query `midi.vary` to daemon → daemon loads profile + intent.harmonicCenter → motif-signature analyzer runs over live clip → transform engine emits 3 Patch candidates → risk-classifier grades each → candidate store mints `pt_<uuid>` per candidate → daemon returns 3 patchIds to CLI → Pi renders summary lines. Producer picks `apply B` → `bw-edit apply pt_yyy` → daemon looks up candidate → resolves ops → `apply.patch` over TCP → bridge NoteStep setters → response → daemon appends `patch-history.jsonl` with inverse ops → done. Revert: `bw-edit revert pt_yyy` → daemon reads journal → emits inverse ops through the same bridge path → appends a new journal entry (revert is itself recorded).

### Recommended Project Structure

P3 adds new modules under the existing daemon tree; nothing moves.

```
daemon/src/
├── patch/                       # NEW (P3) — the pure trust-spine
│   ├── patch-schema.ts          # Ajv validator (standalone-compiled at boot)
│   ├── patch-resolve.ts         # ops → after Note[] (pure)
│   ├── inverse-ops.ts           # self-inverting primitive inverse (pure, D-03)
│   ├── risk-classifier.ts       # author declares, daemon floors (pure, D-07)
│   ├── candidate-store.ts       # ephemeral Map<patchId, Patch> (D-05, MEM-02)
│   └── patch-history.ts         # append-only JSONL journal (atomic-write)
├── transforms/                  # NEW (P3) — MIDI-02..05
│   ├── motif-signature.ts       # PCP + IOI + density (pure, MIDI-01)
│   ├── harmonic-detect.ts       # Krumhansl-Schmuckler (pure, D-12)
│   ├── vary.ts                  # A/B/C motif-preserving variants (MIDI-02)
│   ├── counterline.ts           # companion voice (MIDI-03)
│   ├── voice-leading-fix.ts     # parallel-fifth cleanup (MIDI-04)
│   └── humanize.ts              # velocity/timing jitter (MIDI-05)
├── profiles/                    # NEW (P3) — ARCH-01/02
│   ├── generic.json             # hardcoded neutral defaults (D-14)
│   ├── techno.json              # electronic/techno v1, JSON-only (D-13/14)
│   ├── profile.schema.json      # the profile contract
│   └── profile-loader.ts        # resolves active profile from intent.profile
├── state/
│   ├── analyzer-registry.ts     # EXTEND — register MotifSignature analyzer (MIDI-01)
│   └── intent-store.ts          # EXTEND — harmonicCenter + profile fields (D-12/14)
├── cli/commands/
│   ├── edit.ts                  # REPLACE stub with preview/apply/revert (D-04/05/06)
│   └── midi.ts                  # EXTEND with vary/counterline/voice-leading-fix/humanize
├── query/
│   └── query-server.ts          # EXTEND dispatch with edit.* / midi.vary ops
└── store/
    └── atomic-write.ts          # REUSE for patch-history.jsonl

schemas/
├── patch.schema.json            # NEW (EDIT-01) — the patch object contract
├── profile.schema.json          # NEW (ARCH-01) — profile contract
├── protocol/edit.schema.json    # TIGHTEN operations.items → $ref patch.schema.json
└── intent.schema.json           # EXTEND — harmonicCenter + profile (D-12/14)

bridge/src/main/java/com/bwbrain/bridge/
└── PullHandlers.java            # ADD case "apply.patch" branch

pi-pack/skills/
├── vary/SKILL.md                # NEW (UX-02) — /vary
├── apply/SKILL.md               # NEW (UX-02) — /apply
└── diff/SKILL.md                # NEW (UX-02) — /diff on-demand pane
```

### Pattern 1: Pure-function + I/O split (mirror `diff-logic.ts`)

**What:** Every pure computation (patch-resolve, risk-classifier, motif-signature, inverse-ops, harmonic-detect, transforms) lives in its own file with NO I/O and NO side effects. The commander wrapper (`commands/edit.ts`, `commands/midi.ts`) is the I/O-bound shell that reads argv, calls the daemon, prints JSON.

**When to use:** ALWAYS for P3 — this is the `diff-logic.ts` (`daemon/src/cli/diff-logic.ts:1-21`) canonical pattern, and SC#1's round-trip property was provable PRECISELY because the logic was pure. The same discipline lets P3's held-out property tests (round-trip, scope-mismatch, risk-monotonicity) be mechanical, not integration tests.

**Example:**
```typescript
// daemon/src/patch/risk-classifier.ts — PURE
// Source: mirrors diff-logic.ts discipline (documented interface, @example, NO I/O)

export type RiskClass = "low" | "medium" | "high";

export interface RiskInput {
  declared: RiskClass;            // author's self-declaration
  operations: PrimitiveOp[];      // resolved ops
  scopeDeclared: PatchScope;      // {clipSid, region?}
  scopeTouched: Set<string>;      // noteKeys the ops reference
  belowBar: boolean;              // D-09 override
}

export function classifyRisk(input: RiskInput): RiskClass {
  // 1. scope mismatch → throw (hard error, D-07) — caller translates to ok:false
  if (input.scopeDeclared.region) {
    for (const op of input.operations) {
      const noteStart = opStart(op);
      if (noteStart < input.scopeDeclared.region.start ||
          noteStart >= input.scopeDeclared.region.end) {
        throw new ScopeMismatchError(`op touches note at ${noteStart} outside declared region`);
      }
    }
  }
  // 2. compute floor (upgrade-only)
  let floor: RiskClass = "low";
  if (input.operations.length > 20) floor = "high";
  else if (input.operations.length > 5) floor = "medium";
  // 3. below-bar override → forced high (D-09)
  if (input.belowBar) floor = "high";
  // 4. take max(declared, floor) — never downgrade
  const order: RiskClass[] = ["low", "medium", "high"];
  return order[Math.max(order.indexOf(input.declared), order.indexOf(floor))];
}
```

### Pattern 2: Validate at every boundary (defense-in-depth)

**What:** The patch object is validated by Ajv at THREE boundaries: (a) CLI emit (`bw-edit preview` parses argv → validates before UDS send), (b) daemon entry (UDS query handler validates before dispatch), (c) bridge apply (`PullHandlers.java` validates `apply.patch` payload before mutating NoteStep). The frozen `edit.schema.json` already enforces `undoLabel` + non-empty `operations`; P3's `patch.schema.json` adds the primitive discriminated union.

**When to use:** EVERY patch crossing a process boundary. This is the P1 trust-spine pattern (`reader.ts` Ajv-at-boundary).

### Pattern 3: Daemon-authoritative append-only journal (D-03)

**What:** `patch-history.jsonl` is an append-only line journal. Each applied patch becomes ONE line: `{patchId, undoLabel, clipSid, scope, operations, inverseOperations, transformIntent, risk, belowBar, motifSimilarity, appliedAt, stateHashBefore}`. `bw-edit revert <patchId>` reads the file, finds the entry, emits the inverse ops through the SAME bridge apply.patch path, and on success appends a NEW entry recording the revert itself. History never rewrites; revert is just another applied patch (the inverse-inverse = the original).

**When to use:** EDIT-05 (daemon-authoritative undo). The atomic-write discipline: append via `fs.appendFile` (POSIX-atomic for lines < the pipe buffer, typically 4KB — our entries are ~1KB); rotate via temp+rename through `atomic-write.ts:atomicWriteJson` when the file exceeds a threshold (e.g. 10MB).

### Pattern 4: Two-step explicit CLI (D-04)

**What:** `bw-edit preview <patch>` ALWAYS returns a preview (StateDiff + risk + patchId) without applying. `bw-edit apply <patchId>` is the SEPARATE apply call. No `y/N` interactive prompt anywhere. Med/high patches require `--confirm` on apply (still explicit); `--force` bypasses the `--confirm` gate (still explicit, still recorded); `--allow-below-bar` stacks with `--force` for D-09.

**When to use:** EDIT-02/04/06. The CLI stays shell-composable + Pi-friendly (`/apply` IS the second step). Every apply is a deliberate second action — "no background edits" operationalized.

### Anti-Patterns to Avoid

- **Hand-rolling a separate patch-vs-state diff (instead of `computeStateDiff`).** P3's `preview` MUST resolve ops → after-state, then call `computeStateDiff(before, after)` from `diff-logic.ts:117`. A bespoke patch-diff forks the SC#1 property test. D-06 is explicit.
- **Branching the bridge on `transformIntent`.** The bridge `case "apply.patch"` handler MUST consume only primitive ops. Semantic names ride as metadata; if the bridge ever reads `transformIntent`, the catalog grows unboundedly in Java. D-01.
- **Multi-track patches in P3.** A patch with `scope.trackSids.length > 1` MUST hard-error at the daemon (SC#3 enforced as reject). The bridge has ONE `PinnableCursorClip`; multi-clip is deferred. D-02.
- **Snapshot-based undo.** EDIT-05 is INVERSE-OPS, not snapshot. `patch-history.jsonl` records inverse ops computed at apply time; revert replays them. Snapshots are O(clip-size) per patch + ambiguous under concurrent edits. D-03.
- **Relying on Bitwig native undo as the spine.** `docs/bitwig-capabilities.md` §1 verified NO labelled-undo API. Native undo is caveated best-effort; the daemon spine is authoritative. EDIT-05.
- **Inferring harmonic center silently.** D-12: inference is OPT-IN (producer leaves `intent.harmonicCenter` blank) + ALWAYS discloses via `assumptions[]` + refuses below a confidence threshold. No silent guessing.
- **`patchId` as a content hash.** patchId is a random UUID (correlator.ts:91 pattern), NOT a hash of the patch content. Two previews of the same logical transform must yield DISTINCT patchIds (the candidate store keys by patchId; identical-content hashes would collide + overwrite).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Patch-vs-state diff | a new patch-aware diff | `computeStateDiff(before, after)` from `daemon/src/cli/diff-logic.ts:117` (D-06) | SC#1 round-trip property already proven in `diff-logic.test.ts`. Resolve ops → after-state, then diff. One shape (`StateDiff`) for `bw-diff` AND preview. |
| Atomic durable writes | your own temp+rename | `atomicWriteJson` from `daemon/src/store/atomic-write.ts:45` | SC#3 N=20-parallel property test already proven. POSIX rename atomicity, temp-in-same-dir defense. |
| Candidate patchId minting | content-hash or monotonic counter | `crypto.randomUUID()` (node built-in) | Matches `correlator.ts:91` pattern. Randomness avoids collisions in the ephemeral store; no predictability concern (loopback-only, single-user). |
| Scale/chord materialization (given a tonic) | interval math tables | `tonal` `Key.majorKey(tonic)` / `Key.minorKey(tonic)` / `Scale.get("A minor")` | Returns `{tonic, type, scale, triads, chords, chordScales, intervals, grades}`. MIDI-03 counterline chord-tone selection, MIDI-04 voice-leading interval lookup. `[VERIFIED: npm @tonaljs/key docs]` |
| Pitch-class set operations | bit manipulation | `tonal` `Pcset.get(notes)` / `Pcset.isIncludedIn(parent)` / `Pcset.isSubsetOf` | Returns `{num, chroma, intervals, length}`. `chroma` is the 12-bit binary PCP (perfect for motif signature identity component). `[VERIFIED: npm @tonaljs/pcset docs]` |
| Note↔MIDI conversion | lookup tables | `tonal` `Note.midi` / `Midi.midiToNoteName` | Handles enharmonic spelling, octave conventions. |
| Voice-leading chord voicing | custom closest-voice search | `tonal` `VoiceLeading.tritones` / `Voicing.search` helpers | The @tonaljs/voice-leading + @tonaljs/voicing submodules (present in 6.4.3 deps tree). MIDI-04 cleanup. |
| JSON-Schema → TS codegen | literal `json2ts` CLI on `patch.schema.json` | `scripts/gen-types.mjs` (the `$id`-aware bundler) | json2ts can't resolve cross-file `$refs` against our `https://bw-brain.local` `$id` scheme. P1/P2 pattern (`gen-types.mjs:62-118`). |
| Daemon→bridge request/response | a new apply RPC | `RequestCorrelator.send("apply.patch", {patch})` from `daemon/src/protocol/correlator.ts:90` | Already wired in boot.ts; 3s timeout; dispatcher routes the response by id. The bridge just adds a `case "apply.patch"` to the existing `handle()` switch. |
| CLI UDS query | a new socket client | `query` from `daemon/src/cli/query-client.ts` (used by `commands/midi.ts:35`) | Same UDS path, same envelope. Extend `query.schema.json` op enum with `edit.preview` / `edit.apply` / `edit.revert` / `midi.vary` / etc. |

**Key insight — harmonic-center detection:** `tonal` CANNOT detect a key from a pitch-class profile. `Key.majorKey(tonic)` / `Key.minorKey(tonic)` are LOOKUP functions taking a KNOWN tonic (verified via `@tonaljs/key` npm README — there is no `Key.detect()` / `Key.guess()` / `Key.fromNotes()`). The D-12 inferred-harmony fallback therefore MUST hand-roll the Krumhansl-Schmuckler key-finding algorithm: build the clip's 12-bin PCP, correlate against the 24 Krumhansl-Kessler reference profiles (12 major + 12 minor, public-domain templates), pick the max-correlation tonic+mode, map the correlation `r ∈ [-1, 1]` to a confidence. tonal's `Key.majorKey(detectedTonic)` then materializes the detected key's scale/chords for downstream transforms (counterline chord tones, voice-leading intervals). This is the ONE piece of P3 musical reasoning that cannot delegate to tonal. See §Code Examples.

## Code Examples

### schemas/patch.schema.json sketch (EDIT-01)

The NEW patch contract. The envelope stays at `edit.schema.json` (`undoLabel` + non-empty `operations`); `patch.schema.json` defines the full Patch object + the primitive union that `edit.schema.json`'s `operations.items` $refs.

```jsonc
// schemas/patch.schema.json — NEW
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bw-brain.local/schemas/patch.schema.json",
  "title": "Patch",
  "description": "EDIT-01 patch contract. scope → operations → rationale → reversibility → risk. Primitive CRUD ops are canonical; transformIntent rides as metadata (D-01).",
  "$comment": "Reused by: (1) edit.schema.json operations.items -> $ref patch.schema.json#/$defs/PrimitiveOp; (2) the daemon candidate store (D-05) + patch-history.jsonl entries (D-03). undoLabel is LIFTED into Patch for durable history so revert has the label without needing the envelope.",
  "type": "object",
  "required": ["patchId", "scope", "operations", "rationale", "reversibility", "risk"],
  "additionalProperties": false,
  "properties": {
    "patchId": { "type": "string", "pattern": "^pt_[0-9a-f-]{36}$" },
    "undoLabel": { "type": "string", "minLength": 1 },
    "scope": { "$ref": "#/$defs/Scope" },
    "operations": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/PrimitiveOp" }
    },
    "transformIntent": {
      "type": "object",
      "description": "D-01 metadata. Human/audit readability. The bridge NEVER branches on this.",
      "properties": {
        "name": { "enum": ["vary", "counterline", "voice-leading-fix", "humanize", "manual"] },
        "variant": { "type": "string" },
        "profile": { "type": "string" }
      }
    },
    "rationale": { "type": "string", "minLength": 1 },
    "reversibility": { "enum": ["self-inverse", "manual-inverse", "irreversible"] },
    "risk": { "$ref": "#/$defs/RiskClass" },
    "belowBar": { "type": "boolean", "default": false },
    "motifSimilarity": { "type": "number", "minimum": 0, "maximum": 1 },
    "harmonicCenter": { "$ref": "#/$defs/HarmonicCenter" },
    "assumptions": { "type": "array", "items": { "$ref": "#/$defs/Assumption" } }
  },
  "$defs": {
    "Scope": {
      "type": "object",
      "required": ["clipSid"],
      "additionalProperties": false,
      "properties": {
        "clipSid": { "type": "string", "pattern": "^clip_[0-9a-f]{16}$" },
        "region": {
          "type": "object",
          "additionalProperties": false,
          "properties": { "start": { "type": "number" }, "end": { "type": "number" } }
        }
      }
    },
    "PrimitiveOp": {
      "oneOf": [
        { "$ref": "#/$defs/AddNoteOp" },
        { "$ref": "#/$defs/RemoveNoteOp" },
        { "$ref": "#/$defs/UpdateNoteFieldOp" }
      ]
    },
    "AddNoteOp": {
      "type": "object",
      "required": ["op", "note"],
      "additionalProperties": false,
      "properties": {
        "op": { "const": "add_note" },
        "note": { "$ref": "#/$defs/Note" }
      }
    },
    "RemoveNoteOp": {
      "type": "object",
      "required": ["op", "note"],
      "additionalProperties": false,
      "properties": {
        "op": { "const": "remove_note" },
        "note": { "$ref": "#/$defs/Note" }
      }
    },
    "UpdateNoteFieldOp": {
      "type": "object",
      "required": ["op", "before", "after"],
      "additionalProperties": false,
      "properties": {
        "op": { "const": "update_note_field" },
        "before": { "$ref": "#/$defs/Note" },
        "after": { "$ref": "#/$defs/Note" }
      }
    },
    "Note": {
      "type": "object",
      "required": ["key", "pitch", "start", "length", "velocity"],
      "additionalProperties": false,
      "properties": {
        "key": { "type": "string", "pattern": "^n:[0-9]+:[0-9.]+$" },
        "pitch": { "type": "integer", "minimum": 0, "maximum": 127 },
        "start":   { "type": "number", "minimum": 0 },
        "length":  { "type": "number", "minimum": 0 },
        "velocity":{ "type": "integer", "minimum": 1, "maximum": 127 }
      }
    },
    "RiskClass": { "enum": ["low", "medium", "high"] },
    "HarmonicCenter": {
      "type": "object",
      "additionalProperties": false,
      "required": ["key", "mode"],
      "properties": {
        "key": { "enum": ["A","Bb","B","C","Db","D","Eb","E","F","F#","G","Ab"] },
        "mode": { "enum": ["major", "minor"] },
        "source": { "enum": ["authored", "inferred"] },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "Assumption": {
      "type": "object",
      "required": ["claim", "confidence", "source"],
      "additionalProperties": false,
      "properties": {
        "claim": { "type": "string", "minLength": 1 },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "source": { "enum": ["selection", "intent", "config", "default"] }
      }
    }
  }
}
```

**`edit.schema.json` tightening (one-line change):** change `operations.items` from `{ "type": "object" }` to `{ "$ref": "https://bw-brain.local/schemas/patch.schema.json#/$defs/PrimitiveOp" }`. The envelope's `undoLabel` + `minItems: 1` stay MANDATORY. Runtime Ajv resolves the `$ref` by `$id` natively (all schemas added to one instance — P1/P2 pattern).

### Note identity (D-01/D-03 agent discretion — PINNED)

The key scheme MUST be consistent with `diff-logic.ts` `Note.key` (a string used for set comparison). For a single cursor-clip (D-02) where Bitwig exposes no native note IDs (`docs/bitwig-capabilities.md` §6 verified), the canonical content key is:

```typescript
// Source: reconciles diff-logic.ts Note shape (lines 30-41) + NoteStep grid model
// + D-02 single-clip scope + D-03 self-inverse requirement.

/**
 * Mint a stable note key from its identity-stable fields.
 *
 * `pitch` + `start` ARE the identity. `velocity` / `length` / `pressure` are
 * MUTABLE CONTENT (their change is an update_note_field, not a new identity).
 *
 * Pitch changes are modeled as remove_note(old) + add_note(new), never
 * update_note_field on pitch — a different pitch IS a different note identity
 * (musically honest, mechanically sound for revert). This is why voice-leading-
 * fix (MIDI-04) emits remove+add pairs, not pitch updates.
 *
 * Quantization: start is rounded to the nearest 1/64 beat (0.015625) so
 * floating-point drift from the bridge's NoteStep grid doesn't split identities.
 * The bridge's launcher grid is 16 columns × clip-loop-length; for a 16-beat
 * loop that's 1 beat/column, well above 1/64 precision.
 */
export function noteKey(pitch: number, startBeats: number): string {
  const GRID = 1 / 64;  // 0.015625 beats
  const quantized = Math.round(startBeats / GRID) * GRID;
  return `n:${pitch}:${quantized.toFixed(4)}`;
}
```

**Why this works for revert (D-03):** `inverse-ops` carries the FULL `before`/`after` Note content, so revert never needs to "find" a note by identity at revert time — it re-applies the inverse ops which carry complete Note objects. The key is for (a) `computeStateDiff` set-matching during preview (D-06) and (b) the risk-classifier's `scope.touched` computation. Both use the key as a map index, exactly as `diff-logic.ts:96-100` `indexByKey` already does.

### Self-inverting primitive ops (D-03)

```typescript
// daemon/src/patch/inverse-ops.ts — PURE
// Source: D-03 self-inverting-at-creation-time + diff-logic.ts set-semantics.

export type PrimitiveOp =
  | { op: "add_note"; note: Note }
  | { op: "remove_note"; note: Note }
  | { op: "update_note_field"; before: Note; after: Note };

/** Compute the inverse of a single primitive op. Pure. */
export function inverseOp(op: PrimitiveOp): PrimitiveOp {
  switch (op.op) {
    case "add_note":         return { op: "remove_note", note: op.note };
    case "remove_note":      return { op: "add_note", note: op.note };
    case "update_note_field": return { op: "update_note_field", before: op.after, after: op.before };
  }
}

/** Compute the inverse of an op SEQUENCE (reversed + each op inverted). Pure. */
export function inverseOps(ops: PrimitiveOp[]): PrimitiveOp[] {
  return ops.slice().reverse().map(inverseOp);
}

// Property test (held out): inverseOps(inverseOps(ops)) deep-equals ops.
// Property test (held out): applyOps(state, ops) then applyOps(_, inverseOps(ops))
//                           yields the original state (SC#2 round-trip).
```

### preview = computeStateDiff (D-06)

```typescript
// daemon/src/patch/patch-resolve.ts — PURE
// Source: D-06 reuse + diff-logic.ts computeStateDiff.

import { computeStateDiff, type Note, type RawState, type StateDiff } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "./inverse-ops.js";

/** Resolve a sequence of primitive ops against a before-state, yielding the after-state. Pure. */
export function resolveOps(before: Note[], ops: PrimitiveOp[]): Note[] {
  const byKey = new Map(before.map((n) => [n.key, n]));
  for (const op of ops) {
    switch (op.op) {
      case "add_note":
        byKey.set(op.note.key, op.note);
        break;
      case "remove_note":
        byKey.delete(op.note.key);
        break;
      case "update_note_field":
        // key must match (identity-stable); content replaces
        byKey.set(op.after.key, op.after);
        break;
    }
  }
  return [...byKey.values()];
}

/**
 * Preview a patch: resolve ops against live clip state, then computeStateDiff.
 * Pure. Returns the SAME StateDiff shape bw-diff emits (D-06 — UX-02 diff pane
 * renders ONE shape).
 */
export function previewPatch(before: Note[], ops: PrimitiveOp[]): StateDiff {
  const after = resolveOps(before, ops);
  return computeStateDiff(
    { notes: before } satisfies RawState,
    { notes: after } satisfies RawState,
  );
}

// Property test (held out): previewPatch(before, ops) deep-equals
//   computeStateDiff({notes:before}, {notes:resolveOps(before, ops)}).
// This is mechanically true by construction; the test guards against regressions.
```

The "before" comes from `state.clips` for `selection.clipSid` (refreshed via a `get.selected_clip` pull on demand, mirroring `query-server.ts:370-420` `handleMidiInspect`). If `stateFreshness !== "live"`, preview refuses (state may have drifted — the watchdog gate from SC#3).

### Bridge `case "apply.patch"` handler (PullHandlers.java)

The bridge consumes ONLY primitive ops (D-01 — it never branches on `transformIntent`). Each primitive maps to NoteStep setters via the grid-walk pattern the read path (`PullHandlers.java:157-179` `handleSelectedClip`) already uses.

```java
// bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java — ADD to handle() switch
// Source: PullHandlers.java:146-150 (existing get.* dispatch) + NoteStep API
// (docs/bitwig-capabilities.md §2 VERIFIED: NoteStep exposes setVelocity/setDuration/etc.)

case "apply.patch" -> outbox.offer(handleApplyPatch(id, req, cursorClip));

private static String handleApplyPatch(final String id, final JsonNode req,
                                        final PinnableCursorClip cursorClip) {
    final JsonNode payload = req.path("payload");
    final JsonNode ops = payload.path("operations");
    if (!ops.isArray() || ops.isEmpty()) {
        return LineJson.responseError(id, "invalid_patch");
    }
    // BEATS-PER-GRID-COLUMN: the launcher cursor clip is created with
    // createLauncherCursorClip(16, 128) — 16 columns × clip-loop-length.
    // We read the loop length to map startBeats -> x column. If loop is 0/unknown,
    // fall back to 1 beat/column (BridgeExtension.java:64 default).
    final double loopBeats = cursorClip.getLoopLength().get();
    final double beatsPerColumn = loopBeats > 0 ? loopBeats / GRID_W : 1.0;

    int applied = 0;
    int failed = 0;
    for (final JsonNode opNode : ops) {
        final String opType = opNode.path("op").asText("");
        try {
            switch (opType) {
                case "add_note" -> {
                    final JsonNode n = opNode.path("note");
                    final int x = (int) Math.round(n.path("start").asDouble() / beatsPerColumn);
                    final int y = n.path("pitch").asInt();
                    final NoteStep step = cursorClip.getStep(x, y, 0);
                    step.setVelocity(n.path("velocity").asDouble());
                    step.setDuration(n.path("length").asDouble());
                    applied++;
                }
                case "remove_note" -> {
                    final JsonNode n = opNode.path("note");
                    final int x = (int) Math.round(n.path("start").asDouble() / beatsPerColumn);
                    final int y = n.path("pitch").asInt();
                    final NoteStep step = cursorClip.getStep(x, y, 0);
                    step.setVelocity(0.0);  // velocity 0 = no note (read heuristic mirrored)
                    applied++;
                }
                case "update_note_field" -> {
                    // The KEY invariant: before.key === after.key (identity-stable;
                    // pitch+start unchanged). Only velocity/length mutate in-place.
                    final JsonNode after = opNode.path("after");
                    final int x = (int) Math.round(after.path("start").asDouble() / beatsPerColumn);
                    final int y = after.path("pitch").asInt();
                    final NoteStep step = cursorClip.getStep(x, y, 0);
                    step.setVelocity(after.path("velocity").asDouble());
                    step.setDuration(after.path("length").asDouble());
                    applied++;
                }
                default -> failed++;  // unknown op — defensive, daemon pre-validates
            }
        } catch (final Exception e) {
            failed++;  // grid index out of range, etc.
        }
    }
    final Map<String, Object> result = Map.of("applied", applied, "failed", failed);
    return LineJson.response(id, failed == 0, result);
}
```

**Why this stays tiny:** D-01's hybrid catalog means the bridge handler is 3 cases forever. New transforms (`vary`, `counterline`, etc.) emit the SAME primitives; the bridge never grows. `transformIntent` is metadata for the daemon's audit log + the user-facing label.

**Bitwig NoteStep API surface** (`docs/bitwig-capabilities.md` §2 VERIFIED via in-app Javadoc 6.0.6): `NoteStep` exposes `velocity`, `duration`, `pressure`, `releaseVelocity`, `velocitySpread`, `pan`, `timbre`, `start`, `pitch` with matching setters. `Clip.scrollToStep(int)` for navigation. `PinnableCursorClip extends CursorClip`. **PENDING live probe:** grid-locked vs free-beat positioning — if NoteStep.start is grid-locked, the daemon must quantize patch ops to the grid (or size `createLauncherCursorClip` gridWidth to the project's shortest note). Mitigation already documented; route launcher-only in P3.

### Motif signature (MIDI-01)

Adapted from librosa's chroma concept, but MIDI-trivial (each note's pitch is known — no STFT). The signature supports preserve-motif-identity check (creative transforms), similarity scoring (for the `belowBarCandidate` near-miss), and region-scoped computation (D-11).

```typescript
// daemon/src/transforms/motif-signature.ts — PURE
// Source: librosa.feature.chroma concept (adapted) + diff-logic.ts Note shape.
// Plugs into analyzer-registry.ts D-08 interface (produces: "motifs").

import type { Note } from "../cli/diff-logic.js";

export interface MotifSignature {
  /** 12-bin normalized pitch-class profile (weighted by velocity × length). */
  pcp: number[];            // length 12, sums to ~1.0
  /** 5-bucket inter-onset-interval histogram (normalized). */
  rhythm: number[];         // length 5, sums to 1.0
  /** Notes-per-beat density. */
  density: number;
}

const IOI_BUCKETS = [0.25, 0.5, 1.0, 2.0];  // bucket edges in beats; 5 buckets

/** Compute the motif signature of a note set. Pure. */
export function motifSignature(notes: Note[], regionBeats?: number): MotifSignature {
  const pcpRaw = new Array(12).fill(0);
  for (const n of notes) {
    pcpRaw[n.pitch % 12] += n.velocity * n.length;  // salience = loud × long
  }
  const pcpSum = pcpRaw.reduce((a, b) => a + b, 0) || 1;
  const pcp = pcpRaw.map((v) => v / pcpSum);

  // IOI histogram over sorted-by-start notes
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const rhythmRaw = new Array(5).fill(0);
  for (let i = 1; i < sorted.length; i++) {
    const ioi = sorted[i].start - sorted[i - 1].start;
    const bucket = ioi <= IOI_BUCKETS[0] ? 0
                 : ioi <= IOI_BUCKETS[1] ? 1
                 : ioi <= IOI_BUCKETS[2] ? 2
                 : ioi <= IOI_BUCKETS[3] ? 3 : 4;
    rhythmRaw[bucket]++;
  }
  const rhythmSum = rhythmRaw.reduce((a, b) => a + b, 0) || 1;
  const rhythm = rhythmRaw.map((v) => v / rhythmSum);

  const span = sorted.length > 1 ? sorted[sorted.length - 1].start - sorted[0].start : 1;
  const density = notes.length / Math.max(span, 0.25);

  return { pcp, rhythm, density };
}

/** Similarity ∈ [0,1]. 0.6·cosine(PCP) + 0.4·histogramIntersection(rhythm). Pure. */
export function motifSimilarity(a: MotifSignature, b: MotifSignature): number {
  const cos = cosine(a.pcp, b.pcp);               // ∈ [-1, 1] → normalize to [0,1]
  const pcpSim = (cos + 1) / 2;
  const rhythmSim = histogramIntersection(a.rhythm, b.rhythm);
  return 0.6 * pcpSim + 0.4 * rhythmSim;
}

function cosine(u: number[], v: number[]): number {
  let dot = 0, magU = 0, magV = 0;
  for (let i = 0; i < u.length; i++) { dot += u[i] * v[i]; magU += u[i] ** 2; magV += v[i] ** 2; }
  const denom = Math.sqrt(magU) * Math.sqrt(magV);
  return denom === 0 ? 0 : dot / denom;
}

function histogramIntersection(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.min(a[i], b[i]);
  return sum;
}
```

**Default thresholds** (from `profiles/generic.json` — D-14 generic core):
- `vary` creative threshold: **0.85** — below = refuse (D-08) + show `belowBarCandidate`
- `counterline` creative threshold: **0.80** — counterline adds a voice; rhythmic match matters more than pitch
- `voice-leading-fix` cleanup tier: **0.0** (skipped, D-10)
- `humanize` cleanup tier: **0.0** (skipped, D-10)

**Region-scoped computation (D-11):** filter notes to `region.start ≤ note.start < region.end`, but include 1 beat of context on each side when computing `pcp` (for harmonic continuity) — only `rhythm`/`density` are computed over the strict region.

**Analyzer-registry integration (D-08 binding):** register `MotifSignatureAnalyzer` in `M1_ANALYZERS` → `M2_ANALYZERS` (`analyzer-registry.ts:158`). It `consumes: ["clips"]`, `produces: ["motifs"]`. Caching is EPHEMERAL (recompute per transform invocation); durable motif identity waits for ARRANGE-05 track roles (P4).

### Harmonic center detection (D-12 — hand-rolled Krumhansl-Schmuckler)

```typescript
// daemon/src/transforms/harmonic-detect.ts — PURE
// Source: Krumhansl-Kessler reference profiles (public-domain MIR standard);
// tonal CANNOT detect (Key.majorKey/minorKey are LOOKUP only — verified).

import { Key } from "tonal";
import type { Note } from "../cli/diff-logic.js";

// Krumhansl-Kessler major + minor reference profiles (12-dim, C-indexed).
// Public-domain templates; canonical key-finding algorithm since Krumhansl 1990.
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface HarmonicDetection {
  key: string;         // "A" | "Bb" | ... (the tonic name)
  mode: "major" | "minor";
  confidence: number;  // mapped from correlation r ∈ [-1, 1]
}

/** Detect the harmonic center from a clip's pitch-class profile. Pure. */
export function detectHarmonicCenter(notes: Note[]): HarmonicDetection | null {
  if (notes.length < 4) return null;  // below minimum density

  const pcp = new Array(12).fill(0);
  for (const n of notes) pcp[n.pitch % 12] += n.velocity * n.length;

  let bestR = -Infinity, bestTonic = 0, bestMode: "major" | "minor" = "major";
  for (let rot = 0; rot < 12; rot++) {        // rotate profile to each tonic
    const rMaj = correlate(pcp, rotate(KS_MAJOR, rot));
    const rMin = correlate(pcp, rotate(KS_MINOR, rot));
    if (rMaj > bestR) { bestR = rMaj; bestTonic = rot; bestMode = "major"; }
    if (rMin > bestR) { bestR = rMin; bestTonic = rot; bestMode = "minor"; }
  }

  // Map correlation r ∈ [-1, 1] → confidence ∈ [0, 1].
  // r > 0.85 → very strong (0.9); 0.7-0.85 → strong (0.75); 0.5-0.7 → weak (0.6); <0.5 → refuse.
  let confidence: number;
  if (bestR > 0.85) confidence = 0.9;
  else if (bestR > 0.7) confidence = 0.75;
  else if (bestR > 0.5) confidence = 0.6;
  else return null;  // below bar — REFUSE (no silent guess, D-12)

  const tonicName = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"][bestTonic];
  return { key: tonicName, mode: bestMode, confidence };
}

// After detection, tonal MATERIALIZES the key's scale/chords for downstream use:
//   Key.majorKey("A").scale           → ["A","B","C","D","E","F#","G"]
//   Key.minorKey("A").natural.scale   → ["A","B","C","D","E","F","G"]
// (Used by counterline chord-tone selection + voice-leading interval lookup.)

function correlate(a: number[], b: number[]): number { /* Pearson r over 12 elems */ return 0; }
function rotate(arr: number[], n: number): number[] { /* rotate by n positions */ return arr; }
```

**Stamps on patch (D-12 disclosure):**
```typescript
assumptions.push({
  claim: `harmonicCenter: inferred ${det.key} ${det.mode}, confidence ${det.confidence}`,
  confidence: det.confidence,
  source: "default",
});
```

### MIDI transforms (MIDI-02..05)

For each: inputs, preserve-motif check tier (D-10), primitive ops emitted, risk.

```typescript
// daemon/src/transforms/vary.ts — MIDI-02 (creative tier)
// Emits 3 motif-preserving A/B/C variants. Each either clears 0.85 or refuses (D-08).

export interface VaryCandidate {
  label: "A" | "B" | "C";
  description: string;
  patchId: string;        // pt_<uuid> (candidate store key)
  operations: PrimitiveOp[];
  risk: RiskClass;        // "medium" — adds/moves notes
  motifSimilarity: number;
}

export function vary(source: Note[], region: Region, profile: Profile, harmonic: HarmonicCenter): VaryCandidate[] {
  const sourceSig = motifSignature(filterRegion(source, region));
  const variants: VaryCandidate[] = [];

  // A — rhythmic displacement: shift ~20% of notes ±1 grid step (1/16)
  const a = rhythmicDisplacement(source, region, /*shiftRatio*/0.2);
  const aSim = motifSimilarity(sourceSig, motifSignature(a));
  variants.push(mkCandidate("A", "rhythmic displacement", a, aSim, profile.thresholds.vary));

  // B — interval contraction: move notes one scale-degree toward tonic (in-scale only)
  const b = intervalContraction(source, region, harmonic);  // uses Scale.get(key.mode).notes
  const bSim = motifSimilarity(sourceSig, motifSignature(b));
  variants.push(mkCandidate("B", "interval contraction", b, bSim, profile.thresholds.vary));

  // C — octave overlay: add low-velocity octave-doubled notes at strong beats
  const c = octaveOverlay(source, region);
  const cSim = motifSimilarity(sourceSig, motifSignature(c));  // additions don't reduce similarity
  variants.push(mkCandidate("C", "octave overlay", c, cSim, profile.thresholds.vary));

  return variants;
}

function mkCandidate(label, desc, after, sim, threshold): VaryCandidate {
  if (sim < threshold) {
    // D-08: refuse + tag as belowBarCandidate (the candidate store entry exists
    // but is marked refused; /vary lists it with the score + a caveat).
    return { label, description: desc, patchId: mintPatchId(), operations: [],
             risk: "high", motifSimilarity: sim, /* status: "refused" */ };
  }
  return { label, description: desc, patchId: mintPatchId(),
           operations: diffToOps(source, after), risk: "medium", motifSimilarity: sim };
}
```

**MIDI-03 counterline** (creative tier, threshold 0.80, risk **medium**):
- Inputs: source Note[], region, harmonicCenter
- For each strong-beat source note (downbeats), emit a companion `add_note` a third or fifth BELOW, pitch drawn from `Key.minorKey(harmonic.key).natural.scale` (chord tones preferred)
- Rhythm matches source strong-beat positions (preserves motif rhythmic identity)
- Operations: list of `add_note` (companion voice) — counterline writes into the SAME clip (D-02)

**MIDI-04 voice-leading-fix** (cleanup tier, motif check **skipped** per D-10, risk **low**):
- Detect parallel fifths/octaves: walk consecutive interval pairs in a single voice; if two consecutive intervals are both P5 (7 semitones) or both P8 (12), flag
- Resolve by moving the second note by a step (scale-degree down)
- Operations: `update_note_field` pairs (key stable, pitch/length mutates) OR `remove_note`+`add_note` pairs when pitch changes (per Q2 — pitch change = new identity)
- Also: leading-tone resolution (VII→I), spacing cleanup (>octave between adjacent voices in a chord)

**MIDI-05 humanize** (cleanup tier, motif check **skipped** per D-10, risk **low**):
- For each note: gaussian jitter velocity ±5 (clamped 1-127), start ±0.01 beats (clamped ≥0)
- Operations: list of `update_note_field` (key stable; velocity/start mutate)
- A humanize that "changed the motif" is a bug (D-10) — the cleanup tier exists precisely so this low-risk transform never refuses

### Candidate store + apply flow (D-05 / D-04)

```typescript
// daemon/src/patch/candidate-store.ts — EPHEMERAL in-memory (MEM-02 boundary)

import { randomUUID } from "node:crypto";
import type { Patch } from "../gen/patch.js";

const MAX_CANDIDATES = 64;  // LRU cap

export class CandidateStore {
  private readonly map = new Map<string, Patch>();  // Map preserves insertion order (LRU-friendly)

  /** Mint a new candidate patchId + store the patch. Lost on daemon restart (D-05). */
  mint(patch: Omit<Patch, "patchId">): Patch {
    const full: Patch = { ...patch, patchId: `pt_${randomUUID()}` };
    this.map.set(full.patchId, full);
    if (this.map.size > MAX_CANDIDATES) {
      const oldest = this.map.keys().next().value;  // insertion-ordered
      this.map.delete(oldest);
    }
    return full;
  }

  /** Look up by patchId (bw-edit apply). Returns undefined if evicted/restarted. */
  get(patchId: string): Patch | undefined {
    const p = this.map.get(patchId);
    if (p) {  // refresh LRU
      this.map.delete(patchId);
      this.map.set(patchId, p);
    }
    return p;
  }

  /** Evict after successful apply (moves to patch-history.jsonl). */
  evict(patchId: string): void { this.map.delete(patchId); }
}
```

**Apply flow** (`bw-edit apply <patchId>` → UDS query → daemon):
1. Look up candidate by patchId; if missing → `ok:false, error:"candidate_not_found"` (daemon restarted or evicted)
2. Validate risk gate: med/high requires `--confirm` flag in the query payload; absent → `ok:false, error:"confirmation_required"`
3. If `belowBar: true` → require `--allow-below-bar` AND `--confirm` (D-09 stacking)
4. Compute `inverseOps(patch.operations)` (D-03 self-inverse at apply time, NOT at revert time)
5. Send `{type:"apply.patch", id, payload:{undoLabel, operations}}` via `correlator.send` → bridge NoteStep mutation → await response
6. On success: append `patch-history.jsonl` entry (full Patch + inverse ops + stateHashBefore); evict candidate; return `ok:true`
7. On bridge failure: return `ok:false, error:"apply_failed", applied: N` — do NOT journal a partial patch

### patch-history.jsonl journal (EDIT-05 / D-03)

```typescript
// daemon/src/patch/patch-history.ts — durable append-only journal

import { appendFile } from "node:fs/promises";
import { atomicWriteJson } from "../store/atomic-write.js";
import type { Patch } from "../gen/patch.js";
import type { PrimitiveOp } from "./inverse-ops.js";

export interface PatchHistoryEntry extends Patch {
  inverseOperations: PrimitiveOp[];
  appliedAt: number;        // unix ms
  appliedRevertedAt?: number;
  stateHashBefore: string;  // sha256(canonical-json(before notes))
}

const ROTATE_AT_BYTES = 10 * 1024 * 1024;  // 10 MB

export class PatchHistory {
  constructor(private readonly path: string, private readonly rotateAt = ROTATE_AT_BYTES) {}

  /** Append an applied-patch entry. Atomic on POSIX for lines < 4KB ( ours are ~1KB). */
  async append(entry: PatchHistoryEntry): Promise<void> {
    const line = JSON.stringify(entry) + "\n";
    await appendFile(this.path, line, "utf8");
    // Rotate via atomic temp+rename if oversize (atomic-write.ts:45).
    // Rotation compaction: re-read, drop entries older than the cap, atomic-write.
  }

  /** Read all entries (revert path + audit). */
  async *entries(): AsyncGenerator<PatchHistoryEntry> {
    const text = await readFile(this.path, "utf8");
    for (const line of text.split("\n")) {
      if (line) yield JSON.parse(line) as PatchHistoryEntry;
    }
  }

  /** Find a patch by patchId (revert path). */
  async find(patchId: string): Promise<PatchHistoryEntry | null> {
    for await (const e of this.entries()) {
      if (e.patchId === patchId && !e.appliedRevertedAt) return e;
    }
    return null;
  }
}

/** bw-edit revert <patchId> flow:
 * 1. history.find(patchId) → entry (or ok:false, error:"not_found")
 * 2. Build a NEW Patch whose operations = entry.inverseOperations
 * 3. Apply via the same apply.patch bridge path (Step 5 of apply flow)
 * 4. On success: append a NEW history entry recording the revert itself
 *    (its own inverseOperations = entry.operations; appliedRevertedAt on original)
 * 5. SC#2 property: apply(p) then revert(p) → state == state_before_p
 *    (proven by inverseOps(inverseOps(ops)) === ops + resolveOps associativity)
 */
```

### Profile loader + JSON shape (ARCH-01 / D-13 / D-14)

```jsonc
// daemon/src/profiles/generic.json — ships inside the daemon package (D-14)
{
  "name": "generic",
  "thresholds": {
    "vary": 0.85,
    "counterline": 0.80,
    "voiceLeadingFix": 0.0,
    "humanize": 0.0
  },
  "velocityHumanize": { "jitter": 5, "curve": "gaussian" },
  "timingHumanize":   { "jitterBeats": 0.01 },
  "roleSalience": {
    "kick": 1.0, "bass": 0.9, "lead": 0.8, "pad": 0.5,
    "hats": 0.4, "percussion": 0.4, "fx": 0.3
  },
  "preferredScales": ["minor", "dorian", "phrygian"],
  "strongBeatGrid": [0, 1, 2, 3]   // beat positions within a 4/4 bar
}

// daemon/src/profiles/techno.json — OPT-IN via intent.profile (D-14)
{
  "name": "techno",
  "extends": "generic",
  "thresholds": { "vary": 0.88, "counterline": 0.82 },
  "velocityHumanize": { "jitter": 3, "curve": "gaussian" },  // tighter — techno is rigid
  "preferredScales": ["minor", "phrygian", "locrian"],       // dark modes
  "strongBeatGrid": [0, 2],                                  // techno = 4-on-the-floor
  "roleSalience": { "kick": 1.0, "bass": 0.95, "hats": 0.5 }  // bass+kick dominate
}
```

**Hook contract (designed, NOT exercised in v1 per D-13):**
```typescript
// Optional hooks a profile MAY provide. Absent → data default.
export interface ProfileHooks {
  /** Override motif salience by track role. Default: roleSalience[role]. */
  motifSalience?: (role: string) => number;
  /** Constrain or reject a candidate the data rules allowed. Default: pass-through. */
  constrainTransform?: (candidate: VaryCandidate, ctx: TransformCtx) => VaryCandidate | null;
  /** Override the default threshold for a transform type. Default: thresholds[type]. */
  defaultThreshold?: (transformType: string) => number;
}
// electronic/techno v1 ships NO hooks (JSON-only). The loader detects a `hooks.js`
// sibling (absent for v1) and skips hook invocation if missing.
```

**Loader:**
```typescript
// daemon/src/profiles/profile-loader.ts — PURE-ish (one fs read at boot)
import genericProfile from "./generic.json" with { type: "json" };
import technoProfile from "./techno.json" with { type: "json" };

const PROFILES = { generic: genericProfile, techno: technoProfile };

export function loadProfile(named?: string): Profile {
  // D-14: generic is the strict default. No profile named → generic core literally.
  if (!named || named === "generic") return PROFILES.generic;
  const p = PROFILES[named];
  if (!p) throw new UnknownProfileError(named);
  // If profile `extends`, merge over the parent (deep-merge thresholds/curves/scales).
  return p.extends ? mergeProfiles(loadProfile(p.extends), p) : p;
}
```

### intent.schema.json extension (D-12 / D-14)

```jsonc
// schemas/intent.schema.json — extend projectIntent.properties (additive, backward-compat)
"projectIntent": {
  "required": ["summary"],
  "additionalProperties": false,
  "properties": {
    "summary": { /* unchanged */ },
    "constraints": { /* unchanged */ },
    "targets": { /* unchanged */ },
    "harmonicCenter": {      // NEW — D-12 authored-default source
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "key": { "enum": ["A","Bb","B","C","Db","D","Eb","E","F","F#","G","Ab"] },
        "mode": { "enum": ["major", "minor"] }
      }
    },
    "profile": {             // NEW — D-14 genre profile opt-in
      "type": "string",
      "enum": ["generic", "techno"]
    }
  }
}
```
Both fields OPTIONAL. Existing `intent.json` without them still validates. `harmonicCenter` absent → transforms MAY run inference (D-12 fallback); `profile` absent → generic core runs (D-14).

### Pi /vary + /apply SKILL.md (UX-02 / D-15)

Mirror `pi-pack/skills/analyze/SKILL.md` (frontmatter + steps + hard rules).

```markdown
---
name: vary
description: Run bw-midi vary on the selected clip and list 3 motif-preserving A/B/C variant candidates as summary lines. User picks; /apply runs the edit pipeline.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-midi","bw-edit"]}}}
---

# /vary — motif-preserving A/B/C MIDI variants

You are running `bw-midi vary` on the user's live selected clip and listing the
3 candidates as SUMMARY lines. The diff pane renders ON-DEMAND only.

## Steps

1. Run `bw-midi vary --json` to get 3 candidates (A/B/C).
2. Render each as ONE summary line — NO inline diffs:

```
[A] vary/rhythmic-displacement | risk: medium | motif: 0.91 | shifts 20% of notes ±1 step
[B] vary/interval-contraction  | risk: medium | motif: 0.87 | moves notes 1 scale-degree toward tonic
[C] vary/octave-overlay        | risk: medium | motif: 0.95 | adds low-velocity octave doublings
```

If a candidate was REFUSED (below bar), render:
```
[B] vary/interval-contraction | REFUSED (motif 0.78 < 0.85) | near-miss available via --allow-below-bar
```

3. Tell the user: "say `apply A` or `/apply pt_<id>` to apply; `/diff pt_<id>` to preview the diff first."

## Hard rules (D-15)
- NEVER render inline diffs in /vary output — the picking signal is motif-similarity, not note detail.
- EVERY candidate line carries motif-similarity + risk (UX-06 assumptions).
- A refused candidate (status: refused) is visibility, NOT applicable — do not let the user apply it without --allow-below-bar.
```

```markdown
---
name: apply
description: Apply a candidate patch by patchId via bw-edit apply. Med/high risk requires --confirm.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-edit"]}}}
---

# /apply <patchId> — apply a candidate

## Steps
1. Receive patchId (from /vary summary line or user paste).
2. Run `bw-edit apply <patchId>` — for med/high risk, add `--confirm` (and `--allow-below-bar --confirm` for below-bar overrides).
3. Print the result: `{ok:true, appliedOps:N, patchId, undoLabel}` or the structured failure.
4. Tell the user: the apply is recorded in patch-history.jsonl; `bw-edit revert <patchId>` fully reverses it.

## Hard rules
- NEVER apply without preview if the patchId is unknown — run `bw-midi vary` or `bw-edit preview` first.
- `--allow-below-bar` RECLASSIFIES as HIGH risk and STILL requires `--confirm` (D-09).
```

```markdown
---
name: diff
description: Render the StateDiff of a candidate patch on-demand.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-edit"]}}}
---

# /diff <patchId> — on-demand diff pane

## Steps
1. Run `bw-edit preview <patchId>` (or `bw-edit preview <patch-file>`).
2. Render the StateDiff pane:

```
─── patch pt_abc123 (vary/A, risk: medium) ───────────────
+ added:    2 notes  [n:60:0.25, n:60:0.75]
- removed:  1 note   [n:72:0.50]
~ changed:  3 notes  (velocity -8 avg, length +0.125 avg)
scope:      clip_xyz | region: none
motif:      0.91 (cleared 0.85)
──────────────────────────────────────────────────────────
```

3. Tell the user: "say `/apply pt_abc123 --confirm` to apply."
```

## Validation Architecture

> Nyquist validation is ENABLED (`.planning/config.json` `workflow.nyquist_validation: true`). Phase 3 is the **trust spine** — validation is the deliverable, not an afterthought. Every invariant below maps to a success criterion (SC#1–SC#5) and to requirement IDs. Trust is earned by *provably* holding invariants, not by passing hand-picked examples.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **vitest 4.1.9** (existing, `[VERIFIED: daemon/package.json]`) + **fast-check 4.8.0** (NEW devDependency — see §Validation Package Legitimacy below) |
| Config file | `daemon/vitest.config.ts` (existing — `include: ["src/**/*.test.ts", "../fixtures/**/*.test.ts"]`; no change needed; new `*.test.ts` files auto-picked-up) `[VERIFIED: daemon/vitest.config.ts]` |
| Quick run command | `cd daemon && npm test` (~1s; vitest `run` mode, pure-function suite) |
| Full suite command | `cd daemon && npm test` (same — no watch in CI) |
| Property-filter command | `cd daemon && npm test -- inverse-ops` (or any invariant name); recommended dedicated script `npm run test:property` |

**Why fast-check is added in P3 (not earlier):** Phase 2's SC#1 round-trip (`daemon/src/cli/diff-logic.test.ts`) uses **curated fixtures + an `assertRoundTrip(a,b)` helper** — it proves the property for hand-picked cases. Phase 3's trust spine must hold for **arbitrary** op sequences (a 47-note humanize, a 12-note counterline, a revert-of-a-revert). fast-check generates hundreds of random valid `Note[]` + `PrimitiveOp[]` per run and **shrinks** failing cases to a minimal counterexample. This is the difference between "tested the cases I thought of" and "tested the space." Curated fixtures stay for edge coverage (§Edge Coverage); fast-check covers the generative space for the reversibility + purity invariants.

### Validation Package Legitimacy

| Package | Registry | Verdict | Downloads | Source | Disposition |
|---------|----------|---------|-----------|--------|-------------|
| `fast-check` | npm | **OK** | ~29.3M/wk | github.com/dubzzz/fast-check | Approved — add to `daemon/devDependencies` `[VERIFIED: npm registry + gsd-tools query package-legitimacy check]` |
| `tonal` (runtime, repeated from §Standard Stack) | npm | OK | ~10.5K/wk | github.com/tonaljs/tonal | Approved — add to `daemon/dependencies` |

`fast-check` 4.8.0: MIT, no `postinstall` script (`npm view fast-check scripts.postinstall` → empty), zero runtime deps, ESM-native, tree-shakes, works with vitest out of the box. Published 2026-05-11. `[VERIFIED: npm registry]`

**Install:**
```bash
cd daemon && npm install --save-dev fast-check@4.8.0
```

### Invariant-Based / Property-Based Tests (fast-check)

These are the core correctness claims of the trust spine. Each runs as `fc.assert(fc.property(arbA, arbB, (a, b) => ...))` with ≥100 generated cases (default; bump to 500–1000 for the reversibility spine — INV-1/2/3).

| # | Invariant | Property (fast-check) | Req IDs | SC |
|---|-----------|----------------------|---------|-----|
| **INV-1** | **Round-trip reversibility** | `resolveOps(applyOps(state, ops), inverseOps(ops))` set-equals `state` (order-independent) for arbitrary `ops` | EDIT-04, EDIT-05 | SC#2 |
| **INV-2** | **Self-inverse primitives** | `inverseOp(inverseOp(op))` deep-equals `op` for each primitive; `inverseOps(inverseOps(ops))` deep-equals `ops` | EDIT-05 | SC#2 |
| **INV-3** | **Double-revert = identity** | state after `apply(p) → revert(p) → revert(revert(p))` equals state after `apply(p)` (the inverse-inverse IS the original) | EDIT-05 | SC#2 |
| **INV-4** | **Preview purity** | `previewPatch(before, ops)` does not mutate `before`; N calls yield identical output (no side effects) | EDIT-02 | SC#1 |
| **INV-5** | **Preview = computeStateDiff(after)** | `previewPatch(before, ops)` deep-equals `computeStateDiff({notes:before}, {notes:resolveOps(before, ops)})` (D-06 — mechanically true by construction; guards against regressions) | EDIT-02, EDIT-03 | SC#1 |
| **INV-6** | **Motif signature sanity** | `motifSimilarity(sig, sig) === 1.0`; symmetry `sim(a,b) === sim(b,a)`; `sig` from empty clip does not NaN | MIDI-01 | SC#4 |
| **INV-7** | **Motif-preservation gate** (creative tier) | for vary/counterline: result is EITHER `motifSimilarity >= threshold` OR `status:"refused"` — **no third state** (a below-bar candidate that applied silently is a bug) | MIDI-01, MIDI-02, MIDI-03 | SC#4 |
| **INV-8** | **Cleanup tier never refuses** | for humanize/voice-leading-fix: result is NEVER `status:"refused"` on motif grounds (D-10 — a refusing cleanup is a bug, not a feature) | MIDI-04, MIDI-05 | SC#4 |
| **INV-9** | **Scope containment** | `scope.touched ⊆ scope.declared` for every accepted patch; a violation (`scope.touched ⊋ scope.declared`) hard-errors (D-07) | EDIT-06 | SC#3 |
| **INV-10** | **Risk monotonicity** | `multi-track ⇒ high`; `belowBar:true ⇒ high`; `risk = max(declared, floor)` (daemon never downgrades, D-07) | EDIT-06 | SC#3 |
| **INV-11** | **Below-bar default refuses** | a below-threshold creative candidate's DEFAULT path is `status:"refused"` + `belowBarCandidate` tag; applying requires `--allow-below-bar` AND `--confirm` (D-08/D-09) | MIDI-01, MIDI-02 | SC#4 |
| **INV-12** | **Harmonic detection refuses below bar** | `detectHarmonicCenter(notes)` returns `null` when best K-S correlation < 0.5 (no silent guess, D-12) | MIDI-03, ARCH-01 | SC#4 |
| **INV-13** | **Profile-absent = generic literally** | with no `intent.profile`, transforms run with `generic.json` thresholds (0.85 vary); ARCH-02 ("generic core runs without a profile") is literally true, not a fiction where "generic" is secretly techno | ARCH-02 | SC#5 |
| **INV-14** | **History entry carries inverse** | every `patch-history.jsonl` entry's `inverseOperations` set-equals `inverseOps(entry.operations)` (D-03 — computed at apply time, not revert time) | EDIT-05 | SC#2 |

**Arbitraries (the generative input shapes — define once in a shared `daemon/src/patch/arb.ts`):**
- `arbNote`: pitch ∈ [0,127], start ∈ [0,16] beats (1/64-quantized via the real `noteKey()` fn so identity matches production), length ∈ [0.0625,4], velocity ∈ [1,127]. Mint `key` via `noteKey(pitch, start)` — NEVER a free string (else identity drifts from production).
- `arbNoteSet`: `fc.uniqueArray(arbNote, { selector: (n) => n.key })` — no key collisions (set semantics, mirrors `diff-logic.ts`).
- `arbPrimitiveOp`: oneof(add_note/remove_note/update_note_field) with valid Note payloads; `update_note_field` constrained so `before.key === after.key` (identity-stable, D-01).
- `arbOpSeq`: a sequence of `arbPrimitiveOp` that is internally consistent (no remove of a note absent from the base). Easiest construction: generate a target `arbNoteSet` + a base `arbNoteSet`, then emit ops = diffToOps(base, target) — guarantees INV-1 is even testable.

### Held-Out / Property-Based Fixtures

The motif-signature + harmonic-center heuristics are **tuned against examples**. To avoid overfitting, hold out data the algorithm designer never sees:

| Held-out set | What it guards | Source | Size |
|--------------|----------------|--------|------|
| **MIDI clip fixtures** (`../fixtures/representative-clips/*.json` — extend the existing Phase 2 dir) | motif-similarity thresholds (0.85 vary / 0.80 counterline) — assert a known-good variant scores ABOVE the bar and a random-note scramble ("casino MIDI") scores BELOW | author 10 clips: 5 motif-preserving variants + 5 random scrambles; **committed BEFORE threshold tuning** | 10 clips |
| **Harmonic-center fixtures** (`../fixtures/harmonic-centers/*.json`) | K-S key detection — assert correct tonic+mode on clips with known keys (A-minor pentatonic run, C-major scale, etc.) | author 8 clips with ground-truth key labels | 8 clips |
| **Round-trip fixtures** (generated, not authored) | INV-1/2/3 — fast-check generates arbitrary Note[]/op sequences at test time | fast-check RNG (`fc.configureGlobal({ numRuns: 500 })` — seeded for reproducibility; failing seed printed on failure) | 500 runs |

**Discipline:** the threshold-tuning author may look at the motif fixtures to SET the bar; the test author (or a second pass) writes assertions against fixtures the tuner did NOT see. This is the "held-out" discipline — it catches the failure mode where 0.85 "works" because you tuned it to pass.

### Edge Coverage (Nyquist sampling)

Beyond the generative property tests, these **curated deterministic fixtures** cover the critical edge classes. These are the cases generative testing tends to miss (boundary values, empty states, partial failures):

| Edge class | Test file | Req IDs | Why critical |
|-----------|-----------|---------|--------------|
| **Empty clip** (0 notes) | `patch-resolve.test.ts`, `motif-signature.test.ts` | EDIT-02, MIDI-01 | `resolveOps([], [add_note])` + `motifSignature([])` (density=0, PCP all-zero — must NOT NaN on the divide) |
| **Single-note clip** | `motif-signature.test.ts`, `vary.test.ts` | MIDI-01, MIDI-02 | IOI histogram has no pairs; density=1/span; vary on 1 note must REFUSE (can't preserve a 1-note motif under displacement) |
| **Exactly-at-threshold transform** | `vary.test.ts` | MIDI-01, MIDI-02 | `motifSimilarity === 0.85` boundary: must ACCEPT (≥, not >); `0.84999` must REFUSE. Off-by-one in the comparison is the classic bug. |
| **Self-inverting op boundaries** | `inverse-ops.test.ts` | EDIT-05 | `update_note_field` where `before === after` (no-op); `inverseOps([])` (empty seq); `inverseOps` of a single op |
| **Identity-stable update** (pitch unchanged) | `patch-resolve.test.ts`, `patch-schema.test.ts` | EDIT-01, D-01 | `update_note_field` MUST keep `before.key === after.key`; a pitch change modeled as update (not remove+add) is a schema violation |
| **Pitch change = new identity** | `voice-leading-fix.test.ts` | MIDI-04, D-01 | a pitch change emits `remove_note`+`add_note` pair, NOT `update_note_field` on pitch (identity changes) |
| **Journal corruption / partial write** | `patch-history.test.ts` | EDIT-05 | append a valid line, then a truncated line (no `\n`), then a valid line → `entries()` must skip/flag the malformed line, not crash the daemon or poison the revert path |
| **Concurrent apply attempts** | `candidate-store.test.ts`, `patch-history.test.ts` | EDIT-04, D-05 | two `apply(pt_x)` in parallel: exactly ONE succeeds + journals; the other gets `already_applied` (or history has exactly one entry) |
| **Candidate eviction (LRU cap=64)** | `candidate-store.test.ts` | D-05 | after 65 mints the oldest is evicted; `get(evicted)` → undefined → `apply` returns `candidate_not_found` |
| **Profile-absent vs profile-present** | `profile-loader.test.ts`, `vary.test.ts` | ARCH-01, ARCH-02 | vary with no `intent.profile` uses `generic.json` (0.85); with `profile:"techno"` uses 0.88. Asserts INV-13 (ARCH-02 literally) |
| **Undo across multiple patches (LIFO)** | `patch-history.test.ts`, revert flow | EDIT-05 | apply p1,p2,p3; revert p2 first → only p2's inverse runs (p3 stays applied); then revert p3. LIFO ordering of inverse replay. |
| **Unknown patchId on apply** | `edit-apply.test.ts` | EDIT-04 | `apply pt_doesnotexist` → `ok:false, error:"candidate_not_found"` (daemon restarted or evicted) |
| **Med/high without `--confirm`** | `edit-apply.test.ts` | EDIT-06, D-04 | `apply pt_medrisk` without `--confirm` → `ok:false, error:"confirmation_required"`; WITH `--confirm` → applies |
| **Below-bar without `--allow-below-bar`** | `edit-apply.test.ts` | MIDI-02, D-09 | a `belowBar:true` candidate without `--allow-below-bar` → refused; with `--allow-below-bar --confirm` → applies AND stamps `belowBar:true` + score in history |
| **Multi-track scope hard-error** | `risk-classifier.test.ts` | EDIT-06, D-02 | a patch declaring >1 `trackSid` → hard error (REJECT, not gate) — SC#3 enforced |
| **State-stale refusal** | `edit-preview.test.ts` | EDIT-02, SC#3 P2 | preview when `stateFreshness !== "live"` → refuses (state may have drifted; the watchdog gate from Phase 2 SC#3) |

### Test Commands (exact)

```bash
# From daemon/ — all tests (pure-function suite + smoke, ~1s)
cd daemon && npm test

# Filter to the trust-spine property tests only (fast-check suites)
npm test -- inverse-ops
npm test -- patch-resolve
npm test -- patch-history
npm test -- risk-classifier
npm test -- motif-signature

# Filter by invariant name (fast-check describe/it titles)
npm test -- "round-trip reversibility"
npm test -- "profile-absent"

# Dedicated property script (recommended — runs fc.assert suites at 500 runs each)
npm run test:property

# CLI contract tests (bw-edit preview/apply/revert + bw-midi vary shape — mock the daemon)
npm test -- cli-edit
npm test -- cli-midi

# Full diff round-trip proof (Phase 2 + Phase 3 share computeStateDiff — regression guard)
npm test -- diff-logic
```

**Per-task commit:** `cd daemon && npm test` (full suite is fast — pure functions).
**Per-wave merge:** `cd daemon && npm test` + the CLI smoke (below).
**Phase gate:** full suite green + the five manual UAT checkpoints (below) BEFORE `/gsd-verify-work`.

### CLI Smoke (daemon ↔ fake-bridge, no live Bitwig)

The Java `handleApplyPatch` cannot be unit-tested without Bitwig. The **daemon↔bridge wire contract** IS testable via a **fake bridge** (the Phase 1/2 smoke pattern — `daemon/src/runtime/smoke.test.ts`):

```bash
npm test -- smoke   # exercises: preview → candidate mint → apply.patch over TCP → fake-bridge mutates a mock clip → patch-history.jsonl appended → revert → inverse applied
```

This proves the wire contract end-to-end without a live DAW. The Java `handleApplyPatch` op-dispatch itself is covered by a JUnit test on the pure dispatch logic (mock `NoteStep`) + manual UAT (below).

### Non-Testable / Manual Verification (gated behind human UAT)

These CANNOT be automated — they require human ears, live Bitwig, or subjective musical judgment. They are **end-of-phase** checkpoints (`human_verify_mode: "end-of-phase"`), NOT per-task gates.

| # | Manual checkpoint | Why not automatable | Req IDs | How to verify |
|---|-------------------|---------------------|---------|---------------|
| **M1** | **Bitwig undo coalescing probe** (ROADMAP-flagged) | requires live Bitwig; refines the user-facing "Cmd-Z step count" caveat ONLY (daemon-authoritative revert is the spine regardless — D-03) | EDIT-05 | On a throwaway launcher clip: add 1 note → `Application.undo()` → 1 step back (expected). Add 5 notes in a tight loop → undo once → count survivors (coalescing vs per-note). Document observed step-count in `docs/bitwig-capabilities.md` §1 + the user-facing revert caveat. **NON-BLOCKING** — the probe refines guidance, not architecture. |
| **M2** | **`/vary` + `/apply` Pi UX feel** | requires the Pi runtime + a human reading summary lines | UX-02 | `/vary` on a real clip → 3 summary lines render with motif-similarity + risk; pick one; `/apply pt_x --confirm` → applies; `bw-edit revert pt_x` → reverses. Producer confirms the picking signal (motif-similarity) is legible, not buried under note detail (D-15). |
| **M3** | **"Casino MIDI" audibility** (the project's named out-of-scope failure mode) | requires human ears — below-threshold transforms must REFUSE, but the refusal + near-miss must be musically sensible | MIDI-01, MIDI-02 | On a clip with a clear motif, run `/vary`. If candidates clear 0.85, apply one and listen — the motif must be recognizable. Force a below-bar scenario (tiny/chaotic clip) → confirm the candidate REFUSES + surfaces `belowBarCandidate` with a caveat, NOT silent degradation into casino MIDI. |
| **M4** | **NoteStep grid-locked vs free-beat positioning** (PENDING probe from capabilities §2) | requires live Bitwig — does `NoteStep.start` snap to the grid or accept free beats? | EDIT-04, MIDI-02..05 | Apply a patch with a note at `start=0.237` beats (off-grid). Inspect in Bitwig: did it land at 0.237 or snap to nearest grid column? If grid-locked, document the quantization mitigation (size `createLauncherCursorClip` gridWidth to shortest note, or quantize patch ops). **ARCHITECTURE-IMPACTING if grid-locked** — flag immediately. |
| **M5** | **`electronic/techno` profile actually sounds techno, not generic** | subjective genre judgment | ARCH-01 | Run `/vary` with no profile, then with `profile:"techno"`. Techno variants should prefer dark modes (minor/phrygian), tighter velocity humanize, 4-on-the-floor strong beats. Producer confirms the profile ENHANCES without GATING (ARCH-02). |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| EDIT-01 | `patch.schema.json` validates at every boundary (primitive union, `undoLabel`, `minItems`) | unit (Ajv) | `npm test -- patch-schema` | ❌ Wave 0 |
| EDIT-02 | `bw-edit preview` renders diff without applying | property (INV-4/5) + CLI contract | `npm test -- patch-resolve` / `npm test -- cli-edit` | ❌ Wave 0 |
| EDIT-03 | `bw-diff` surfaces added/removed/changed + scope | unit (existing) | `npm test -- diff-logic` | ✅ Phase 2 |
| EDIT-04 | `bw-edit apply` applies after preview; every patch recorded | unit (candidate store) + smoke | `npm test -- candidate-store` / `npm test -- smoke` | ❌ Wave 0 |
| EDIT-05 | daemon-authoritative undo via `patch-history.jsonl` + revert | property (INV-1/2/3/14) + unit | `npm test -- inverse-ops` / `npm test -- patch-history` | ❌ Wave 0 |
| EDIT-06 | risk gating: low one-step, med/high confirm, multi-track=high, scope-mismatch errors | unit (INV-9/10) | `npm test -- risk-classifier` | ❌ Wave 0 |
| MIDI-01 | motif signature (PCP + rhythm) + preserve-motif mode | property (INV-6) + unit | `npm test -- motif-signature` | ❌ Wave 0 |
| MIDI-02 | `bw-midi vary` A/B/C motif-preserving variants | unit (INV-7/11) + manual M3 | `npm test -- vary` | ❌ Wave 0 |
| MIDI-03 | `bw-midi counterline` companion voice | unit (INV-7) + manual | `npm test -- counterline` | ❌ Wave 0 |
| MIDI-04 | `bw-midi voice-leading-fix` low-risk cleanup | unit (INV-8) | `npm test -- voice-leading-fix` | ❌ Wave 0 |
| MIDI-05 | velocity/timing humanization low-risk patch | unit (INV-8) | `npm test -- humanize` | ❌ Wave 0 |
| UX-02 | Pi `/vary` + `/apply` + diff pane | manual (M2) + CLI contract | `npm test -- cli-midi` | ❌ Wave 0 (Pi skills manual) |
| ARCH-01 | genre-pluggable profile interface; electronic/techno first | unit (loader) + manual (M5) | `npm test -- profile-loader` | ❌ Wave 0 |
| ARCH-02 | generic core runs without a profile | property (INV-13) + unit | `npm test -- "profile-absent"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd daemon && npm test` (full pure-function suite, ~1s).
- **Per wave merge:** `cd daemon && npm test` + CLI smoke (`npm test -- smoke`).
- **Phase gate:** full suite green + all 5 manual checkpoints (M1–M5) reviewed BEFORE `/gsd-verify-work`. **M1** (undo coalescing) is **non-blocking** (refines caveat, not architecture); **M4** (grid-locked) is **architecture-impacting if grid-locked** — flag immediately to the planner.

### Wave 0 Gaps (must exist before implementation)

- [ ] `daemon/src/patch/arb.ts` — shared fast-check arbitraries (`arbNote`, `arbNoteSet`, `arbPrimitiveOp`, `arbOpSeq`)
- [ ] `daemon/src/patch/inverse-ops.test.ts` — INV-1, INV-2, INV-3 (round-trip + self-inverse + double-revert, fast-check 500 runs)
- [ ] `daemon/src/patch/patch-resolve.test.ts` — INV-4, INV-5 (preview purity + D-06 equivalence)
- [ ] `daemon/src/patch/risk-classifier.test.ts` — INV-9, INV-10 (scope containment + risk monotonicity)
- [ ] `daemon/src/patch/candidate-store.test.ts` — eviction + concurrent-apply edge
- [ ] `daemon/src/patch/patch-history.test.ts` — journal append + corruption skip + LIFO revert (INV-14)
- [ ] `daemon/src/patch/patch-schema.test.ts` — Ajv validation of primitive union + envelope tightening
- [ ] `daemon/src/transforms/motif-signature.test.ts` — INV-6 (sanity) + empty/single-note edge
- [ ] `daemon/src/transforms/harmonic-detect.test.ts` — INV-12 (refuses below bar) + held-out key fixtures
- [ ] `daemon/src/transforms/vary.test.ts` — INV-7, INV-11 (motif gate + below-bar refuse + boundary 0.85)
- [ ] `daemon/src/transforms/{counterline,voice-leading-fix,humanize}.test.ts` — INV-8 (cleanup tier never refuses)
- [ ] `daemon/src/profiles/profile-loader.test.ts` — INV-13 (profile-absent = generic literally)
- [ ] `daemon/src/cli/commands/edit.test.ts` — CLI contract (preview/apply/revert shape, `--confirm`/`--allow-below-bar` gating)
- [ ] `../fixtures/representative-clips/*.json` — held-out motif fixtures (committed BEFORE threshold tuning)
- [ ] `../fixtures/harmonic-centers/*.json` — held-out key-detection fixtures
- [ ] `daemon/package.json` — add `fast-check@4.8.0` to `devDependencies`; add `"test:property": "vitest run --grep property"` script

*(If no gaps: N/A — 16 Wave-0 items listed; the planner should create the test files in the SAME plan that creates the module under test, per the pure-function + I/O split pattern.)*

## Common Pitfalls

### Pitfall 1: Off-by-one in the motif-threshold comparison
**What goes wrong:** `motifSimilarity < threshold` vs `<= threshold` — a candidate scoring EXACTLY the threshold (0.850) is accepted by `<` but refused by `<=`.
**Why it happens:** The threshold is the bar; "clears the bar" reads as `>` but the intent is `≥` (0.850 is good enough).
**How to avoid:** The edge fixture "exactly-at-threshold" (§Edge Coverage) pins this. Use `sim >= threshold` (accept at equality) and write the boundary test BEFORE tuning. fast-check will also surface it via shrinkage.
**Warning signs:** a candidate that "should obviously pass" refuses; or one that "should obviously refuse" passes. Always check the boundary first.

### Pitfall 2: Modeling a pitch change as `update_note_field` instead of remove+add
**What goes wrong:** A transform moves a note C→E (pitch change). If emitted as `update_note_field(before:{pitch:60}, after:{pitch:64})`, the `key` changes (`n:60:0` vs `n:64:0`) — violating the D-01 invariant `before.key === after.key`. `computeStateDiff` set-matching breaks; revert can't find the note.
**Why it happens:** "Update" reads as "change a field"; pitch is a field.
**How to avoid:** The schema enforces it (`patch.schema.json` `UpdateNoteFieldOp` requires `before.key === after.key` — add an Ajv `if/then` or a TS type guard). Pitch changes are ALWAYS `remove_note(old)` + `add_note(new)`. MIDI-04 voice-leading-fix is the main offender — its test fixture (§Edge Coverage) pins this.
**Warning signs:** a reverted clip has stray notes or missing notes after a pitch-moving transform.

### Pitfall 3: `computeStateDiff` NaN from empty/all-zero PCP
**What goes wrong:** `motifSignature([])` divides by `pcpSum` which is 0 → NaN propagates into similarity → every comparison returns false → every transform refuses (or worse, accepts).
**Why it happens:** The divide-by-zero guard (`|| 1`) is easy to forget on one of the three normalizations (PCP, rhythm, density).
**How to avoid:** The empty-clip edge fixture. fast-check's `arbNoteSet` should include the empty array as a known case. Assert `Number.isFinite` on every signature field.
**Warning signs:** ALL transforms refuse on a specific clip; similarity scores are `NaN`/`Infinity`.

### Pitfall 4: Relying on Bitwig native undo as the spine
**What goes wrong:** Developer assumes `Application.undo()` will reverse an `apply.patch`; ships without daemon-authoritative revert; native undo coalesces unpredictably and the user's Cmd-Z undoes the wrong thing (or 20 things).
**Why it happens:** "The DAW has undo" is the obvious assumption.
**How to avoid:** `docs/bitwig-capabilities.md` §1 VERIFIED no labelled-undo API. D-03 is daemon-authoritative. The spine is `patch-history.jsonl` + inverse ops, ALWAYS. Native undo is a caveated bonus (manual checkpoint M1 refines the caveat only).
**Warning signs:** any code path that calls `Application.undo()` as the revert mechanism.

### Pitfall 5: `patchId` as a content hash (candidate-store collision)
**What goes wrong:** Two previews of the same logical transform mint the SAME patchId (same content → same hash) → the second overwrites the first in the candidate store → the user's `apply A` applies `C`'s content.
**Why it happens:** Content-hash feels "deterministic and clean."
**How to avoid:** `patchId = pt_${randomUUID()}` (correlator.ts:91 pattern). Randomness is correct here — loopback-only, single-user, no collision concern. The anti-pattern is listed in §Architecture Patterns.
**Warning signs:** `/vary` returns 3 candidates but one overwrites another; `apply A` applies the wrong variant.

### Pitfall 6: Silent harmonic-center inference (D-12 violation)
**What goes wrong:** `intent.harmonicCenter` is blank; the transform infers a key with r=0.55 (weak); applies it WITHOUT an `assumptions[]` entry; the counterline writes notes in a wrong scale.
**Why it happens:** "It detected something, ship it."
**How to avoid:** D-12 is explicit: inference is OPT-IN (blank `harmonicCenter`), ALWAYS discloses via `assumptions[]`, and REFUSES below r=0.5 (INV-12). The harmonic-detect test pins the refuse-below-bar behavior.
**Warning signs:** a patch with `harmonicCenter.source:"inferred"` but no matching `assumptions[]` entry.

### Pitfall 7: Bridge branching on `transformIntent`
**What goes wrong:** The Java `handleApplyPatch` grows a `switch(transformIntent)` to handle `humanize` vs `counterline` differently; the bridge becomes musically aware; every new transform requires a Java rebuild + Bitwig reload.
**Why it happens:** "The bridge needs to know what it's doing."
**How to avoid:** D-01 is explicit: primitives are canonical; `transformIntent` is metadata the bridge NEVER reads. The bridge handler is 3 cases forever (`add_note`/`remove_note`/`update_note_field`). The anti-pattern is in §Architecture Patterns.
**Warning signs:** any `req.path("transformIntent")` or `switch(intent)` in `PullHandlers.java`.

### Pitfall 8: Journal poisoning from a partial append
**What goes wrong:** `fs.appendFile` writes half a line (power loss / crash mid-write); `entries()` throws on `JSON.parse`; the daemon refuses to start; ALL history is unreachable.
**Why it happens:** `appendFile` is atomic for lines < the pipe buffer BUT not across crashes.
**How to avoid:** `entries()` must skip-and-flag malformed lines (try/catch per line), not throw. The journal-corruption edge fixture pins this. Rotation uses `atomic-write.ts` temp+rename (SC#3 P2 proven).
**Warning signs:** daemon refuses to start with a JSON parse error pointing at `patch-history.jsonl`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Snapshot-based undo (store full state per patch) | Inverse-ops journal (D-03) | P3 design decision | O(ops) not O(clip-size) per patch; no ambiguity under concurrent edits; revert is just another apply |
| Interactive `y/N` prompt on apply | Two-step explicit CLI (D-04) | P3 design decision | Shell-composable + Pi-friendly (`/apply` IS the second step); no TTY assumption |
| Semantic operation catalog (bridge understands `humanize`) | Hybrid: primitives canonical + `transformIntent` metadata (D-01) | P3 design decision | Bridge stays 3-case forever; new transforms need zero Java changes |
| tonal `Key.detect()` for harmonic inference | Hand-rolled Krumhansl-Schmuckler (tonal has no detect) | Verified this session | The ONE piece of musical reasoning that can't delegate to tonal |
| Curated-fixture property tests | fast-check generative property tests (added P3) | P3 validation decision | Covers the arbitrary-op-sequence space, not just hand-picked cases |

**Deprecated/outdated:**
- `Application.undo(label)` / `beginUndoTask(name)`: **DOES NOT EXIST** in Bitwig extension-api 21 (verified `docs/bitwig-capabilities.md` §1). Any code assuming labelled native undo is wrong.
- `addFormats` for Ajv: deliberately NOT used (AGENTS.md) — no frozen schema uses `format:`. Don't re-add it.

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this to identify decisions needing user confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The motif-similarity thresholds (0.85 vary / 0.80 counterline) are reasonable starting bars | Code Examples "motif signature" | LOW — they are TUNABLE via profile JSON (D-13); held-out fixtures + manual M3 validate. Wrong threshold → over/under-refusing, not data loss. |
| A2 | The Krumhansl-Kessler reference profiles + r>0.5 refuse bar are the right key-detection heuristic | Code Examples "harmonic-detect" | LOW — hand-rolled (tonal can't detect); held-out harmonic fixtures validate. Wrong → refused inference (safe failure mode, D-12). |
| A3 | `NoteStep.start` may be grid-locked in Bitwig launcher clips | Code Examples "bridge apply.patch" | MEDIUM — PENDING live probe (manual M4). If grid-locked, patch ops must quantize to the grid OR `createLauncherCursorClip` gridWidth sized to shortest note. Architecture-impacting; flagged. |
| A4 | The 5-bucket IOI histogram + density ratio is a sufficient rhythm signature | Code Examples "motif signature" | LOW — adapted from librosa concepts to MIDI; held-out fixtures validate. Wrong → motif gate misfires (safe: refuses rather than degrades). |
| A5 | `patch-history.jsonl` line size (~1KB) is well under the POSIX append-atomicity buffer (4KB) | Architecture Patterns "Pattern 3" | LOW — a 100-op patch is ~10KB worst case; rotation + the per-line try/catch (Pitfall 8) mitigate. Verify with the concurrent-apply edge test. |
| A6 | fast-check integrates cleanly with vitest 4.1.9 (no ESM/CJS friction) | Validation Architecture "Test Framework" | LOW — both are ESM-native, zero-config; `npm install --save-dev fast-check@4.8.0` + `import fc from "fast-check"`. If friction, fall back to vitest's built-in `_.times(N, ...)` loop pattern (less shrinkage). |

**If this table is empty:** N/A — 6 assumptions listed; A3 (NoteStep grid-lock) is the only MEDIUM-risk one and is covered by manual checkpoint M4.

## Open Questions (RESOLVED)

All items resolved by Plan 05 Task 2 (the end-of-phase manual UAT checkpoints M1–M5 + held-out fixture validation). Each prefix records the resolution path; the original text is preserved below for traceability.

1. RESOLVED: manual probe M4 at end-of-phase (non-blocking) → Plan 05 Task 2. **NoteStep grid-locking (A3 / M4)**
   - What we know: `docs/bitwig-capabilities.md` §2 VERIFIED `NoteStep` exposes `start`/`pitch`/`velocity`/`duration` setters; the launcher cursor clip is `createLauncherCursorClip(16, 128)`.
   - What's unclear: does `NoteStep.start` accept free-beat values or snap to the 16-column grid? The grid-walk read pattern (`getStep(x,y,0)`) implies grid-locked addressing.
   - Recommendation: manual probe M4 at end-of-phase. If grid-locked, the planner adds a quantize-mitigation task (size gridWidth to shortest note, or quantize patch op `start` to the grid). NON-blocking for planning — the daemon-side spine (resolve/preview/revert) is grid-agnostic; only the bridge write path cares.

2. RESOLVED: manual probe M1 (non-blocking) → Plan 05 Task 2. **Bitwig undo coalescing window (M1)**
   - What we know: `docs/bitwig-capabilities.md` §1 VERIFIED no labelled-undo API; coalescing behavior is undocumented.
   - What's unclear: does `Application.undo()` reverse one NoteStep mutation or coalesce a tight loop of 5 adds into one step?
   - Recommendation: manual probe M1 (non-blocking). Refines the user-facing "Cmd-Z step count" caveat ONLY. The daemon-authoritative revert (D-03) is the spine regardless.

3. RESOLVED: ship the guesses + validate via held-out fixtures + M3/M5 → Plan 05 Task 2. **Exact motif thresholds per genre (D-13)**
   - What we know: generic.json ships `vary:0.85`, `counterline:0.80`; techno.json tightens to 0.88/0.82.
   - What's unclear: are these the RIGHT numbers musically? They are starting guesses, not measured.
   - Recommendation: ship the guesses; validate via held-out fixtures + manual M3/M5. Tunable via profile JSON (no code change). The D-08 refuse-and-show-near-miss path means a wrong threshold produces over/under-refusing, NOT data loss.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥22.19 | daemon runtime | ✓ | (project-standard; AGENTS.md) | — |
| TypeScript 5.7+ | daemon compile | ✓ | (project-standard) | — |
| vitest 4.1.9 | test runner | ✓ | `daemon/package.json` `[VERIFIED]` | — |
| **fast-check 4.8.0** (NEW) | property tests | ✗ (not yet installed) | 4.8.0 `[VERIFIED: npm registry]` | vitest loop pattern (less shrinkage) if ESM friction — but A6 says unlikely |
| **tonal 6.4.3** (NEW) | motif PCP + harmonic materialization | ✗ (not in `daemon/node_modules`) | 6.4.3 `[VERIFIED: npm registry]` | hand-rolled PCP/interval math (loses enharmonic + Scale.get; worse) |
| `node:crypto` | patchId minting | ✓ | built-in | — |
| `node:fs/promises` | journal append | ✓ | built-in | — |
| Bitwig Studio 6.0.6 + JDK 21 | live bridge reload (manual M1/M4) | ✓ (Phase 1/2 verified) | 6.0.6 / 21 | — (manual checkpoints only) |
| Pi/OpenClaw runtime | `/vary` + `/apply` UX (manual M2) | ✓ (Phase 2 Pi pack shipped) | — | — |

**Missing dependencies with no fallback:** none — `fast-check` and `tonal` are the only new installs, both clean (OK legitimacy verdict, no postinstall), both with documented fallbacks.

**Missing dependencies with fallback:**
- `fast-check`: if ESM/CJS friction with vitest 4.1.9 (unlikely — A6), fall back to vitest `_.times(N, () => { const [a,b] = generate(); assert(...) })` loop pattern. Loses shrinkage (minimal counterexample) but preserves coverage.

## Security Domain

> `security_enforcement: true` (`.planning/config.json`), ASVS level 1, block-on high. Phase 3 adds the **mutation surface** — the bridge `apply.patch` handler — so security is now load-bearing, not just observational.

### Project Constraints (from AGENTS.md)

- Node ≥22.19 / TS 5.7+ strict, ESM NodeNext `.js` imports (HARD RULE).
- Ajv 2020-12: `import { Ajv2020 } from "ajv/dist/2020.js"` (named import quirk); `addFormats` deliberately NOT used.
- Loopback-only bind invariant (Pitfall 5): any listener REFUSES non-loopback hosts. P3 adds NO new listener (uses existing bridge TCP 7878 + UDS for CLI).
- Validate at every boundary: Ajv-compiled-once; never let invalid structures reach handler logic.
- Trust-spine at schema level: `edit.schema.json` enforces `undoLabel` + non-empty `operations`.
- `scripts/gen-types.mjs` for JSON-Schema → TS (NOT literal json2ts — cross-file `$ref` resolution).
- Standalone-compiled validators (compiled once at boot).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local-first; loopback-only transport is the auth boundary. No login. |
| V3 Session Management | no | Single-user; no session tokens. Daemon↔CLI over UDS (filesystem perms); daemon↔bridge over loopback TCP. |
| V4 Access Control | yes | **Scope enforcement (D-02/D-07):** a patch declaring >1 `trackSid` hard-errors (multi-track = reject). `scope.clipSid` MUST match the live cursor clip. `scope.touched ⊆ scope.declared` or hard-error. This IS access control — bounding what a patch may mutate. |
| V5 Input Validation | yes | **Ajv validation of every patch at 3 boundaries** (CLI emit, daemon entry, bridge apply). The primitive discriminated union (`patch.schema.json`) rejects malformed ops structurally. `update_note_field` requires `before.key === after.key`. |
| V6 Cryptography | partial | `node:crypto.randomUUID()` for patchId minting (collision-resistance); `createHash("sha256")` for `stateHashBefore` (tamper-evidence on history entries). No encryption (local-only). |
| V7 Error Handling | yes | Bridge `handleApplyPatch` try/catch per op → `failed` count, no crash. Daemon returns structured `ok:false, error:"..."` not stack traces. Journal corruption skipped-and-flagged (Pitfall 8). |
| V8 Data Protection | partial | `patch-history.jsonl` in `.bw-brain/` (project-local, not global). Candidate store EPHEMERAL in-memory (MEM-02 boundary — never crosses to durable). Atomic writes (SC#3 P2 proven). |
| V9 Communications | yes | **Loopback-only TCP 7878 + UDS** (Pitfall 5 invariant, constructor-enforced in Phase 1). JSON-Lines framed; partial-line buffer. No remote calls (local-first constraint). |
| V13 API & Web Service | yes | The daemon UDS query API + bridge TCP are the "API surface." Every op validated; no unbounded scope; risk-gated apply. |

### Known Threat Patterns for the bw-brain mutation stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Unbounded-scope mutation** (a patch touches tracks/clips outside its declared scope) | Tampering | D-02 single-clip scope + D-07 scope-mismatch hard-error + `scope.touched ⊆ scope.declared` (INV-9). SC#3 enforced. |
| **Direct mutation bypassing the patch object** | Tampering | Trust-spine: the bridge `handleApplyPatch` is the ONLY mutation path; it requires a valid patch envelope. No direct-mutation code path exists (SC#1). |
| **Irreversible edit** (no undo entry) | Repudiation | D-03 every apply appends `patch-history.jsonl` with inverse ops (INV-14); `revert` is always available. `undoLabel` mandatory (schema-level). |
| **High-risk edit without confirmation** | Elevation of privilege | D-04/D-07: med/high require `--confirm`; `belowBar` requires `--allow-below-bar --confirm`; daemon floors risk (upgrade-only, INV-10). |
| **Stale-state mutation** (apply when bridge is silent / state drifted) | Tampering | SC#3 P2 watchdog: preview/apply refuse when `stateFreshness !== "live"` (edge fixture). |
| **Malformed journal poisoning revert** | Denial of service | Pitfall 8: `entries()` skips-and-flags malformed lines, doesn't crash. Rotation via atomic temp+rename. |
| **Native-undo reliance** (Cmd-Z undoes wrong thing) | Repudiation | D-03 daemon-authoritative revert is the spine; native undo caveated (M1 refines the caveat only). |
| **PatchId collision** (candidate store overwrite) | Tampering | A5/Pitfall 5: `randomUUID()` not content-hash; two previews of same transform yield distinct patchIds. |
| **Loopback bypass** (remote host reaches the bridge) | Spoofing | Pitfall 5: constructor-enforced loopback-only bind (Phase 1). P3 adds no new listener. |

## Sources

### Primary (HIGH confidence — codebase + verified registries)
- `daemon/src/cli/diff-logic.ts` + `diff-logic.test.ts` — the pure diff + SC#1 round-trip property test P3 reuses (D-06). `[VERIFIED: read]`
- `daemon/src/store/atomic-write.ts` + `atomic-write.test.ts` — SC#3 N=20-parallel atomic-write property test pattern P3 mirrors. `[VERIFIED: read]`
- `daemon/src/state/analyzer-registry.ts` — the D-08 plugin interface MIDI-01 plugs into. `[VERIFIED: read]`
- `daemon/package.json` — vitest 4.1.9, ajv 8.20.0, commander 15.0.0 confirmed; tonal/fast-check ABSENT (must add). `[VERIFIED: read]`
- `daemon/vitest.config.ts` — `include: ["src/**/*.test.ts", "../fixtures/**/*.test.ts"]`; new test files auto-picked-up. `[VERIFIED: read]`
- `docs/bitwig-capabilities.md` §1 — VERIFIED no labelled-undo API; coalescing probe PENDING (non-blocking). `[VERIFIED: read]`
- `docs/bitwig-capabilities.md` §2/§6 — VERIFIED NoteStep setter surface; NO native note id. `[VERIFIED: read]`
- `.claude/AGENTS.md` — NodeNext `.js` imports, Ajv 2020-12 quirk, `addFormats` NOT used, Vitest ESM-native. `[VERIFIED: read]`
- npm registry: `fast-check@4.8.0` (MIT, 29.3M/wk, no postinstall, github.com/dubzzz/fast-check). `[VERIFIED: npm view + gsd-tools query package-legitimacy check]`
- npm registry: `tonal@6.4.3` (MIT, 10.5K/wk, no postinstall, github.com/tonaljs/tonal). `[VERIFIED: npm view + gsd-tools query package-legitimacy check]`
- npm docs `@tonaljs/key`: `Key.majorKey/minorKey` are LOOKUP (take known tonic); NO `Key.detect()`. `[VERIFIED: npm README]`

### Secondary (MEDIUM confidence)
- `.planning/phases/03-reversible-midi-patching-m2/03-CONTEXT.md` — locked decisions D-01..D-15 (the source of truth). `[VERIFIED: read]`
- `.planning/REQUIREMENTS.md` — EDIT-01..06, MIDI-01..05, UX-02, ARCH-01/02 definitions. `[VERIFIED: read]`
- Krumhansl-Kessler reference profiles — public-domain MIR standard (canonical key-finding algorithm since Krumhansl 1990). `[CITED: MIR literature]`

### Tertiary (LOW confidence)
- Motif-similarity thresholds (0.85/0.80) — starting guesses, tunable via profile JSON; validated by held-out fixtures + manual M3/M5. `[ASSUMED]` (A1)
- NoteStep grid-locking behavior — PENDING live probe (M4). `[ASSUMED]` (A3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ajv/commander existing + verified; tonal + fast-check verified via npm registry + legitimacy gate; limitations (tonal no `Key.detect`) confirmed via npm docs.
- Architecture: HIGH — every pattern traces to an existing module (`diff-logic.ts`, `atomic-write.ts`, `analyzer-registry.ts`, `correlator.ts`, `PullHandlers.java`); D-01..D-15 locked in CONTEXT.md.
- Validation: HIGH — vitest config + existing property-test pattern (`diff-logic.test.ts`, `atomic-write.test.ts`) read directly; fast-check legitimacy verified; 14 invariants + 16 edge classes enumerated; 5 manual checkpoints mapped to req IDs.
- Pitfalls: HIGH — 8 pitfalls, each tied to a locked decision or a verified capability finding.

**Research date:** 2026-06-29 (force-refresh: added `## Validation Architecture` + Common Pitfalls + State of the Art + Assumptions Log + Open Questions + Environment Availability + Security Domain + Sources + Metadata — the prior file truncated at the Code Examples sentinel)
**Valid until:** 2026-07-29 (30 days — stable codebase-internal phase; the only fast-moving bits are the two PENDING live probes M1/M4 which are non-blocking)
