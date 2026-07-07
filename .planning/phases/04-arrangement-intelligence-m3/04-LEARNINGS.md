---
phase: "04"
phase_name: "arrangement-intelligence-m3"
project: "bw-brain"
generated: "2026-07-07"
counts:
  decisions: 18
  lessons: 11
  patterns: 16
  surprises: 8
missing_artifacts:
  - "VERIFICATION.md (no formal verification doc; verification happened inline via SUMMARY self-checks + the live Bitwig capability probe for Plan 04-01)"
  - "UAT.md (no separate UAT doc yet; end-to-end UAT is the next planned step via /gsd-verify-work)"
---

# Phase 4 Learnings: arrangement-intelligence-m3

## Decisions

### Eager observer registration only — Bitwig forbids post-init registration
All Bitwig extension observers MUST be registered during `init()`. Attempting to register `ClipLauncherSlot.hasContent()` from a controller-thread callback (lazy wiring from the track-name observer) throws `ydq: This can only be called during driver initialization`. The lazy-wire path is structurally impossible; eager wiring during `init()` is the only viable option.

**Rationale:** Bitwig's extension API enforces a strict lifecycle — observers bind to host state during driver initialization only. Any post-init registration attempt throws at runtime.
**Source:** 04-01-SUMMARY.md

---

### `createTrackBank(numTracks, numSends, numScenes)` — the third arg is per-track slotBank size
Switched from `createTrackBank(BANK_SIZE, 0, 0)` to `createTrackBank(BANK_SIZE, 0, SCENE_COUNT)`. With `numScenes=0`, every track's `clipLauncherSlotBank()` returns null — the third arg controls each track's `ClipLauncherSlotBank` size, not bank-level scene navigation. The separate `SceneBank(16)` for scene-name observers is unchanged.

**Rationale:** Pre-fix every track returned slotBank=null because Bitwig interprets `numScenes=0` as "no per-track slotBank." The arg name was misleading — it reads as bank-wide scene count but is actually per-track.
**Source:** 04-01-SUMMARY.md

---

### ConcurrentHashMap<Long, Boolean> cache keyed by `(trackIdx << 16) | sceneIdx`
The hasContent observer cache uses a composite long key — mirrors the existing `bankTrackNames`/`sceneNames` cache style for thread-safe controller-thread writes + pull-handler reads. A plain `boolean[][]` would diverge from the established pattern AND lack a happens-before relationship for element writes across threads.

**Rationale:** Consistency with the existing observer-cache idiom; thread-safety by construction.
**Source:** 04-01-SUMMARY.md

---

### Walker timeout stays at 500ms; ~1s/cell wall-clock accepted as UX cost
`DEFAULT_PER_CELL_TIMEOUT_MS=500` bounds `awaitNext` only. The observed ~1s per hasContent cell wall-clock is dominated by `select()` + `readNotes()` overhead (Bridge IPC + NoteStep grid enumeration), not the awaitNext timeout. Bumping the timeout would not improve latency.

**Rationale:** The timeout bounds the right thing (observer-fire wait). The wall-clock cost lives in select/readNotes which a timeout bump cannot affect. Accepted as documented UX cost; sits in D-22's "250ms < p95 ≤ 1s → document UX" band.
**Source:** 04-01-SUMMARY.md

---

### `cosineAffinity` zero-magnitude → 0 (NOT 0.5)
The spec said "zero-magnitude → 0" which took precedence over the `(cos+1)/2` remap. An empty/zero vector is dissimilar to everything; the matrix sets the diagonal to 1.0 explicitly so self-similarity still holds.

**Rationale:** Spec text overrode the formula's natural mapping. Empty = dissimilar (not "neutral 0.5").
**Source:** 04-02-SUMMARY.md

---

### Inline daemon-internal JSON schemas (D-13)
`arrangement-snapshot` + `roles` schemas live INLINE in their TS files (`urn:bw-brain:arrangement-snapshot` / `urn:bw-brain:roles`), NOT under `schemas/`. That directory is the cross-language wire contract; these files never cross the wire.

**Rationale:** `schemas/` is reserved for cross-language wire contracts (Java bridge + TS daemon both bind). Internal-only formats don't belong there. Also: no `format:` keywords (AGENTS.md — `addFormats` NOT used).
**Source:** 04-02-SUMMARY.md

---

### `energyWeights` sum-check is `console.warn`, NOT a throw (ARCH-02)
Analyzers consume the weights as-authored; the daemon surfaces drift so a profile author notices during development. The "enhance never gate" principle (ARCH-02) — validation should help developers, not block producers.

**Rationale:** A throw would make a malformed profile crash the daemon; a warn lets the analysis proceed with the as-authored weights while making the drift visible.
**Source:** 04-02-SUMMARY.md

---

### Profile deep-merge: object-merge per-key, array-replace wholesale
`mergeProfiles` extended so object-valued fields (like `energyWeights`) merge per-key (child wins per-key); array-valued fields (`sectionLabels`/`roleTemplates`) replace wholesale. Techno's `roleTemplates` carries ONLY kick+bass (the array-replace semantics make it the complete techno set, NOT an append to generic's 7).

**Rationale:** Object-merge supports partial overrides ("techno overrides only noteDensity weight"); array-replace avoids ambiguous half-merges of role definitions.
**Source:** 04-02-SUMMARY.md

---

### `maxSections` is a CEILING, not a TARGET
The agglomerative merge loop continues while affinity ≥ minSim, even below maxSections. Identical scenes collapse to a single section. Matches librosa.segment.agglomerative semantics (merge until variance increases beyond threshold).

**Rationale:** A "target" interpretation would force-split identical scenes — meaningless. The ceiling interpretation lets similar scenes collapse naturally while bounding the upper limit.
**Source:** 04-03-SUMMARY.md

---

### Energy confidence is honest 1.0 (deterministic, not inferred)
The energy composite + normalization is a deterministic function of the notes — no inferential step, no threshold judgment. Confidence 1.0 is honest (energy IS the composite; nothing is being guessed). Differs from SectionDetector (confidence = intra-section similarity) and RepetitionReport (confidence = cluster similarity).

**Rationale:** Different analyzer categories warrant different confidence semantics. `runAll` never drops a deterministic field (1.0 ≥ 0.5); the gate exists to drop low-confidence *inferred* fields.
**Source:** 04-04-SUMMARY.md

---

### Register-window masking via cosine-against-uniform-in-window
Zero out bins outside `[low, high]`, renormalize the masked slice to sum=1, then cosine against a uniform-in-window reference (1/windowSize per bin). A track with notes spread evenly inside the window scores highest; a track with no notes in the window returns 0 (the zero-magnitude guard).

**Rationale:** This is the D-08 novelty — a kick template genuinely only "sees" C1-E1. Cosine-against-uniform is the canonical "does this track live in this register?" test, reusable for any register-scoped template matching.
**Source:** 04-04-SUMMARY.md

---

### Tracks with zero `hasContent` cells are FILTERED, not classified "unknown"
A track with no clips has no role to classify. Calling it "unknown" would conflate "no data" with "below-threshold data" (RESEARCH Open Question 4). The analyzer skips null results from `aggregateTrackFeatures`; only tracks with ≥1 hasContent cell get a `RoleClassification`.

**Rationale:** "Unknown" is a refuse-below-threshold signal; "no data" is a different category that should not pollute the role map.
**Source:** 04-04-SUMMARY.md

---

### M3 analyzer registry lives in query-server (lazy singleton), not boot.ts
`getM3Registry()` is constructed lazily on the first `arrange.*` query. boot.ts never constructed an `AnalyzerRegistry` before this plan — the analyzers weren't wired into the runtime. The analyzers are pure + stateless, so there's no lifecycle concern.

**Rationale:** Avoids boot-time construction of analyzers that may never be queried; lazy initialization matches actual usage.
**Source:** 04-05-SUMMARY.md

---

### `arrange.*` handlers run analyzers fresh on each query
Rather than only reading `snapshot.derived` (which may be stale), the handlers run `runAll(M3_ANALYZERS)` against the snapshot grid on every query. Pure + fast for O(10²) scenes. The `--refresh` flag triggers a grid re-pull; without it, the analysis runs against the cached snapshot grid.

**Rationale:** Avoids the "is this analysis current?" question — every query is fresh against the snapshot. Stale-data risk lives only in the snapshot grid itself, not in the analysis.
**Source:** 04-05-SUMMARY.md

---

### `arrange.current_section` = last-selected scene (NOT transport-launched)
D-01 is pull-only — the 5-event protocol enum does not grow. The current section maps to `state.selection.sceneIdx` (the producer's last-clicked launcher scene). An assumption surfaces this: "current-section reflects last-selected scene, not transport-launched scene."

**Rationale:** Avoids minting a new event type for "transport launched a section." The pull-side mapping to `sceneIdx` is sufficient for the producer's mental model.
**Source:** 04-05-SUMMARY.md

---

### `transition-suggest` repetition-gap emission capped at 3
A large project with many ungrouped scenes would spam `repetition_gap` observations. The cap (`DEFAULT_MAX_REPETITION_GAPS = 3`) surfaces the first few most isolated scenes without overwhelming the producer.

**Rationale:** Producer UX — too many observations noise the signal. The 3 most isolated scenes are the highest-priority gaps.
**Source:** 04-05-SUMMARY.md

---

### Prohibition prose must NOT enumerate forbidden tokens verbatim
When a Hard rule says "no X, no Y, no Z" and a contract test regex-negates X/Y/Z, the prose itself trips the regex. Rephrase to describe the forbidden thing conceptually (e.g. "the daemon's TCP endpoint" / "the patch envelope" instead of "127.0.0.1:7878" / "apply.patch"). The structural test (no literal tokens) remains the runtime guarantee.

**Rationale:** Documentation prose legitimately mentions forbidden things to explain prohibitions; regex-negation tests can't distinguish prose from executable code. Conceptual language avoids the trip while preserving the structural invariant.
**Source:** 04-06-SUMMARY.md (recurring from 04-05 deviation #2)

---

### `pulledAt` surfaced as an assumption on EVERY output line group (not just once)
Pitfall 8 is "the producer always knows how stale the analysis is" — that means `pulledAt` appears as an assumption at the State, Timeline, Sparkline, Clusters, AND Transitions line groups, not just at the top.

**Rationale:** A single top-level `pulledAt` is easy to scroll past; per-line-group surfacing keeps freshness visible at every claim the producer reads.
**Source:** 04-06-SUMMARY.md

---

## Lessons

### JUnit tests with recording fakes cannot catch Bitwig API wiring defects
The walker's state machine was fully covered by unit tests, but the production bindings (the four functional interfaces wired in `PullHandlers.handleLauncherGrid`) had three bugs that only manifest against a live Bitwig host. This is the structural reason the trust-spine gate (Plan 04-01 Task 2) exists — capabilities-discipline: observed Bitwig behavior is the deliverable, never fabricated.

**Context:** Plan 04-01 surfaced three compounding defects (unsubscribed BooleanValue + numScenes=0 + post-init constraint). Each required a separate live-Bitwig probe iteration to surface. None were catchable by the recording-fake unit tests.
**Source:** 04-01-SUMMARY.md

---

### The "echo JSON | nc 127.0.0.1:7878" probe recipe doesn't work — use a standalone loopback daemon
The daemon's TCP listener only accepts bridge-side messages (hello/response/events). CLI requests must go through the UDS socket with `{type:"query", op:"..."}`. New pull handlers that lack a CLI integration can be exercised end-to-end only by writing a standalone probe daemon that takes over the bridge port.

**Context:** The first Plan 04-01 probe recipe (suggested by the executor) was wrong; the orchestrator wrote `scripts/probe-launcher-clips.mjs` as a 200-line standalone loopback daemon to exercise the bridge directly. Future plans that add new pull handlers should reference this pattern.
**Source:** 04-01-SUMMARY.md

---

### Spec ambiguity surfaces during implementation — `(cos+1)/2` remap vs "zero-magnitude → 0"
The Plan 02 spec said "zero-magnitude → 0" but the cosine remap formula naturally produces 0.5 for cosine=0. The first implementation followed the formula; the test caught the divergence; an explicit guard was needed before the remap.

**Context:** The fix was a one-line `if (magU === 0 || magV === 0) return 0;` short-circuit BEFORE the remap. Spec text takes precedence over formula intuition.
**Source:** 04-02-SUMMARY.md (deviation #1)

---

### `reduce` initial value choice leaks into vector math in subtle ways
Setting `activeCells.reduce((peak, c) => Math.max(peak, c.notes.length), 1)` with initial=1 meant an empty column produced polyphony=1 (not 0) — leaking into the raw vector as a unit-vector along the polyphony axis, violating the "empty column → normalized=[]" contract.

**Context:** Initial=0 makes the raw vector all-zeros → mag=0 → normalized=[]. The lesson: when a reduce feeds into vector magnitude, the initial value is a load-bearing choice that needs explicit reasoning about empty-input behavior.
**Source:** 04-02-SUMMARY.md (deviation #2)

---

### `fast-check`'s `fc.float` rejects double literals — use `fc.integer + scale` instead
`fc.float({ min: 0, max: 32, ... })` threw "fc.float constraints.min must be a 32-bit float" — the literals `0`/`8`/`0.1`/`2` are doubles, not 32-bit floats. Switched note start/length generators to `fc.integer({min:0, max:3200}).map(t => t/100)` — same coverage, no constraint quirk.

**Context:** Property tests for Plan 02's matrix invariants (symmetry + diagonal=1 + entries ∈ [0,1] for N=1..50). The workaround is mechanical but worth documenting to avoid rediscovery.
**Source:** 04-02-SUMMARY.md (deviation #3)

---

### Parallel wave siblings may need types earlier than PATTERNS.md assigns them
PATTERNS.md assigned the `"repetition"` addition to `DerivedFieldName` (D-21) to Plan 04-05, but Plan 04-03 (Wave 3) shipped FIRST and needed the type for `RepetitionReport` to compile. Same for `AnalyzeContext.profile` — assigned to 04-05 but needed by 04-03's SectionDetector.

**Context:** Both additions were purely additive (one type-member + one optional field), so the deviation was safe — Plan 04-05 saw them already present and skipped its corresponding edit steps. The lesson for planners: when a Wave N plan needs a type slot, assign it to the EARLIEST plan that needs it, not the latest plan that touches the file.
**Source:** 04-03-SUMMARY.md (deviations #1 + #2)

---

### The Edit tool's oldString can match inside the wrong handler when patterns are similar
In Plan 04-05, an edit appending arrange handlers matched inside `handleEditApply` instead of the intended `handleMidiHumanize`, replacing `handleEditApply`'s success payload (`{ ok: true, appliedOps, patchId, undoLabel }`) with the humanize handler's payload — breaking `handleEditApply` (undefined `minted`/`result`/`assumptions`).

**Context:** Caught by `tsc --noEmit` immediately after the edit. Recovery: restored `handleEditApply`'s correct ending from git HEAD. The lesson: when an Edit's oldString is short or generic, verify the surrounding context first; run `tsc --noEmit` (or equivalent) after multi-handler edits.
**Source:** 04-05-SUMMARY.md (deviation #3)

---

### Source-grep contract tests must scope to executable code paths, not comment text
Documentation legitimately mentions forbidden things to explain prohibitions. A `grep "patchId"` on a module whose comments explain "NO patchId" will false-positive. Scope the source-level check to import paths (`../patch/`) or structural output assertions (no `patchId` property on emitted objects).

**Context:** Plan 04-05's D-10 source-grep test initially matched the module's documentation comments. Plan 04-06's contract test hit the same pattern (forbidden wire-protocol tokens). Two iterations of the same lesson — the fix is structural: describe prohibitions conceptually in prose, assert them structurally in tests.
**Source:** 04-05-SUMMARY.md (deviation #2) + 04-06-SUMMARY.md (deviation #1)

---

### Boundary allowlist gates catch schema additions — update both files together
The MEM-02/SC#5 boundary gate asserts every `query.schema.json` op is in an allowlist (`ALLOWED_QUERY_OPS`). The 6 new `arrange.*` ops were in the schema but not in the allowlist, so the gate rejected them.

**Context:** Plan 04-05 added ops to the schema but missed the allowlist; the boundary test caught it. The lesson: when adding query ops, the schema and the allowlist are a paired edit — they MUST land in the same commit.
**Source:** 04-05-SUMMARY.md (deviation #4)

---

### Plan-side prose can be ambiguous about "empty" semantics
Plan 04-04's prose said "empty scenes contribute zero-value points" — which initially read as "scenes with no active cells contribute 0 bars." The actual intent: scenes with active cells but bars-within-that-have-no-notes contribute value-0 bars (the gap is visible post-normalization). The property test pinned the actual semantics.

**Context:** "Empty" is overloaded — empty scene vs empty bar. The lesson: when planner prose uses "empty," disambiguate which kind; pin the semantics in a property test.
**Source:** 04-04-SUMMARY.md (decision #3)

---

### The first Plan 04-01 probe recipe returned empty responses — needed investigation, not "the daemon is broken"
Sending `get.launcher_clips` via netcat to port 7878 returned 0 bytes immediately. The dispatcher's default branch silently dropped the request (the type wasn't a recognized bridge-side message). The "empty response" looked like a daemon bug but was actually correct behavior for an unsupported message type.

**Context:** The orchestrator initially interpreted the empty response as a connection bug. Investigation of `daemon/src/runtime/dispatcher.ts` revealed the dispatcher only accepts `hello`/`response`/5-event-types from the bridge side; arbitrary `request` messages get dropped. The fix was writing a proper probe daemon.
**Source:** 04-01-SUMMARY.md (Issues Encountered)

---

## Patterns

### BooleanValue subscription + cache + read-from-cache
`Bitwig BooleanValue.get()` returns the default `false` until `addValueObserver` fires the boot state. The pattern: register all observers during `init()`, write callbacks into a `ConcurrentHashMap`, and read from the cache (never call `.get()` on an unsubscribed value).

**When to use:** Any Bitwig `BooleanValue` / `IntegerValue` / `StringValue` consumed by a pull handler. Extends to all observer-driven API surfaces.
**Source:** 04-01-SUMMARY.md

---

### Standalone loopback probe daemon
When a new bridge-side pull handler lacks a CLI integration yet, write a small Node script that binds `127.0.0.1:7878`, accepts the bridge's reconnect, fires the request, and times the response. The bridge auto-reconnects when the real daemon is killed.

**When to use:** Capability probes for new bridge pull handlers — Plan 04-01's `scripts/probe-launcher-clips.mjs` is the template (200 lines; accepts the bridge, handshakes, fires N requests, prints stats).
**Source:** 04-01-SUMMARY.md

---

### Trust-spine checkpoint as the live-host verification gate
The Plan 04-01 Task 2 BLOCKING checkpoint (`autonomous: false` in frontmatter) gated Wave 2 on a producer-verified live Bitwig probe. This caught three compounding defects that recording-fake unit tests could not.

**When to use:** Any plan that introduces new Bitwig API bindings (a new pull handler, a new observer subscription, a new bank type). The `autonomous: false` flag + 5-probe recipe + capabilities-doc §7 update is the template.
**Source:** 04-01-SUMMARY.md

---

### Pure-module discipline (`PURE module: no fs/net imports`)
`scene-features.ts`, `self-similarity.ts`, `section-detector.ts`, `repetition-report.ts`, `energy-curve.ts`, `track-role-classifier.ts`, and `transition-suggest.ts` all carry the "PURE module" header. They consume only their arguments + return values — no `fs`, no `net`, no global state. The pattern lifts `motif-signature.ts` from Phase 02.

**When to use:** Any transform/analyzer module that should be unit-testable in isolation. The fs/net boundary lives in stores + the runtime, not in the math.
**Source:** 04-02-SUMMARY.md through 04-05-SUMMARY.md

---

### Atomic-store mirror pattern
`arrangement-snapshot.ts` and `roles-store.ts` are STRUCTURALLY IDENTICAL: same imports, same `ENOENT→null`, same Ajv compile-once, same `atomicWriteJson` POSIX temp+rename save. Future daemon-internal durable files should copy this template verbatim.

**When to use:** Any new daemon-internal durable file (snapshot, role map, cached analysis). Copy the template; change the schema + filename.
**Source:** 04-02-SUMMARY.md

---

### Matrix-pair analyzers: same matrix, two cuts
Two analyzers can consume the SAME selfSimilarityMatrix — one cuts it contiguously (sections via agglomerative clustering), one graph-wise (repetition via union-find). The matrix is computed once per analyzer; no forked pipeline.

**When to use:** When two analyzers need the same similarity substrate but apply different clustering algorithms. The pattern preserves the shared substrate while letting each analyzer choose its cut.
**Source:** 04-03-SUMMARY.md

---

### Refuse-below-threshold is mechanical via `runAll` (no `Math.max(0.5, ...)` pre-flooring)
Analyzers emit honest `confidence ∈ [0,1]`; `runAll` drops fields with `confidence < 0.5`. The grep for `Math.max(0.5,...)` in `transforms/` is the T-04-10/T-04-12 code-review checklist — pre-flooring is forbidden because it hides low-confidence data from the audit trail.

**When to use:** Every Analyzer plugin. The pattern is structural — emit honest confidence, let the registry own the threshold.
**Source:** 04-03-SUMMARY.md + 04-04-SUMMARY.md

---

### Analyzer wrapper shape (mirrors `MotifSignatureAnalyzer`)
Type-only back-import from `analyzer-registry` → no cycle. Defensive grid extraction from `raw.tracks`. Refuse-on-empty (return null). `assumptions[]` on every `DerivedField`. Pure `analyze(ctx)` method.

**When to use:** Any new Analyzer plugin. The shape is now the canonical bw-brain analyzer contract.
**Source:** 04-03-SUMMARY.md

---

### Per-bar re-derivation for intra-scene variation
When a feature is defined per-bar (D-17), re-derive the signals (noteDensity, velocity, polyphony, pitchCentroid) from THAT bar's filtered notes — do not reuse the scene-aggregate feature vector. This delivers genuine intra-scene variation (a 16-beat scene yields 4 distinct points, not one stepped value).

**When to use:** Any analyzer that needs per-bar resolution within a scene. The anti-pattern (scene-aggregate repeated per bar) produces stepped plates, not variation.
**Source:** 04-04-SUMMARY.md

---

### ARCH-02 fallback at the Analyzer boundary (`ctx.profile.field ?? DEFAULT`)
The generic core runs literally without a profile; the profile enhances, never gates. Every analyzer that reads `ctx.profile.X` has a `DEFAULT_X` constant + a `?? DEFAULT_X` fallback. This means a profile-less daemon still produces valid analysis.

**When to use:** Every analyzer that consumes profile data. The fallback is a one-liner; the benefit is producer resilience (the daemon doesn't crash on a missing profile).
**Source:** 04-04-SUMMARY.md

---

### Lazy module-level registry pattern (`getM3Registry()`)
Pure + stateless analyzers registered once via `getM3Registry()` on first query — no boot-time construction needed. The registry is constructed on-demand from the query-server handler.

**When to use:** Any registry of pure+stateless analyzers. Avoids paying construction cost if the registry is never queried; preserves the singleton property for repeat queries.
**Source:** 04-05-SUMMARY.md

---

### Snapshot → RawState adapter (`rawFromSnapshot`)
Pass the snapshot's `grid.tracks` as `RawState.tracks` — the analyzers' `extractSceneColumns` consumes the shape directly. No re-conversion needed; the snapshot grid IS a valid RawState.tracks shape.

**When to use:** Whenever analyzers need to consume the snapshot grid. The adapter is a one-liner that preserves the analyzer contract.
**Source:** 04-05-SUMMARY.md

---

### Shared dispatch preamble (`prepareArrangeDispatch`)
The `midi.*` `prepareMidiDispatch` shape generalized: watchdog gate → load snapshot (optional `--refresh`) → `runAll` → build assumptions with `pulledAt` (Pitfall 8). Reduces handler boilerplate to the unique dispatch logic.

**When to use:** Any family of query-server handlers that share a dispatch preamble (snapshot + analyzers + assumptions). The pattern is the query-server analogue of a middleware chain.
**Source:** 04-05-SUMMARY.md

---

### D-10 advisory boundary enforced structurally
`TransitionObservation` output has NO `patchId`/`operations`/`risk` keys — the type system forbids them. The contract test asserts no `../patch/*` import path. The combination (structural output type + import-path grep) is the runtime guarantee.

**When to use:** Whenever a module must provably not emit patch-like objects. The structural type is the primary defense; the grep test catches regressions.
**Source:** 04-05-SUMMARY.md

---

### Pi skill shell-to-CLI pattern (5-sibling skill set)
`/analyze`, `/vary`, `/apply`, `/diff`, `/review` all share: shell to a `bw-*` CLI binary, parse JSON, render text with `assumptions[]` on every line group, copy the D-10 freshness gate verbatim from `/vary`. The pattern is now the canonical bw-brain read-side skill shape.

**When to use:** Any new Pi skill that surfaces daemon state to the producer. The shell-to-CLI discipline (D-12 P2) keeps the wire protocol inside the daemon — Pi never learns it.
**Source:** 04-06-SUMMARY.md

---

### Hand-rolled unicode sparkline (no library dependency)
Eight unicode block chars (▁▂▃▄▅▆▇█) map 0–1 → indices 0–7. A 10-line renderer is trivially correct; `ascii-chart`/`sparkly` packages add bundle size + a legitimacy gate.

**When to use:** Any ASCII visualization of a [0,1] signal. Producer terminals render the block chars universally; no font/emoji ambiguity.
**Source:** 04-06-SUMMARY.md

---

### `pulledAt`-as-assumption on every output line group (Pitfall 8)
Pitfall 8 isn't "pulledAt appears somewhere" — it's "the producer always sees how stale the analysis is at every claim." The Hard rule: pulledAt appears as an assumption at the State, Timeline, Sparkline, Clusters, AND Transitions line groups, not just at the top.

**When to use:** Any skill/CLI output that renders analysis from a snapshot. The per-line-group surfacing keeps freshness visible regardless of which section the producer reads.
**Source:** 04-06-SUMMARY.md

---

## Surprises

### Three compounding Bitwig API defects in Plan 04-01 — each required a separate probe iteration
The launcher-grid cursor-walk looked like "one wiring task" but had three independent root causes: (1) unsubscribed `BooleanValue` returning false, (2) `createTrackBank`'s third arg misinterpreted, (3) Bitwig's "driver initialization only" constraint on observer registration. Each was invisible until a live probe surfaced it.

**Impact:** Plan 04-01 took ~3 hours instead of the planned ~30 min. The trust-spine gate proved its worth — without the live-Bitwig verification, all three defects would have shipped silently and Wave 2 analyzers would have run against an all-empty snapshot.
**Source:** 04-01-SUMMARY.md

---

### The walker completing in 5–12ms with 0/128 hasContent was a diagnostic signature, not "broken"
Initially looked like the walker wasn't iterating at all. Actually it WAS iterating — but every cell short-circuited at `hasContent==false` (the unsubscribed observer default), so no `select()` was called and the walk completed in milliseconds. The combination "fast walk + zero content" is the unique fingerprint of an unsubscribed observer.

**Impact:** Took one probe iteration to recognize the signature; another to identify the root cause. Documented in `LaunchGridWalkerTest.regressionUnsubscribedHasContentObserverProducesAllEmpty` so the signature is greppable.
**Source:** 04-01-SUMMARY.md

---

### Bitwig's cryptic error: `ydq: This can only be called during driver initialization`
The `ydq` prefix (no space, no context) is Bitwig's internal error tag for "post-init observer registration forbidden." The error gives no hint about what "driver initialization" means in the extension lifecycle — it refers to the `init()` method on `ControllerExtension`.

**Impact:** The lazy-wire attempt was abandoned after one probe iteration because the error was clearly a hard Bitwig constraint, not a fixable bug. Documented so future Bitwig extension work recognizes the tag immediately.
**Source:** 04-01-SUMMARY.md

---

### Plan 04-01 took ~3h while Plans 04-02 through 04-06 took 8–18 min each
The trust-spine gate (Plan 04-01 Task 2) dominated the phase. Once the foundation was verified, the analyzers + integration + skill landed quickly because the contracts were clean and the patterns were proven.

**Impact:** Phase-level estimation should weight the first plan with a live-host verification gate at ~3x a normal plan. The debugging cost lives entirely in the API-wiring discovery, not in the analyzer math or the CLI integration.
**Source:** 04-01-SUMMARY.md + phase-level commit timestamps

---

### Plan 04-04 needed ZERO shared-file edits — Plan 04-03 had already added the slots
The M1 reservation of `energyCurve`/`trackRoles` in `DerivedFieldName` + Plan 04-03's addition of `profile?: Profile` to `AnalyzeContext` meant Plan 04-04 was purely additive new files. Zero merge-conflict surface with the parallel Wave 3 sibling.

**Impact:** Wave 3 (parallel 04-03 + 04-04) shipped without merge conflicts despite both touching `analyzer-registry.ts`. The lesson: pre-allocating type slots in earlier plans eliminates parallel-wave merge surfaces.
**Source:** 04-04-SUMMARY.md

---

### The Edit tool corrupted `handleEditApply`'s payload in Plan 04-05
An `oldString` intended for `handleMidiHumanize` matched inside `handleEditApply` (the surrounding lines were similar). The replacement clobbered `handleEditApply`'s success payload with the humanize handler's payload, breaking the edit-apply path with undefined `minted`/`result`/`assumptions`.

**Impact:** Caught immediately by `tsc --noEmit`. Recovery: restored from git HEAD. The lesson: when an Edit's oldString is a generic handler-ending pattern, the surrounding context must be specified uniquely.
**Source:** 04-05-SUMMARY.md (deviation #3)

---

### Plan 04-06's contract test caught the same prohibition-prose pattern twice
The D-10 documentation pattern ("explain WHY a thing is forbidden by naming it") trips regex-negation tests. Plan 04-05 hit it once; Plan 04-06 hit it again on the same pattern. This is a recurring lesson, not a one-off.

**Impact:** Added to the planner checklist: "When prohibition prose + regex-negation test coexist, describe the forbidden thing conceptually (not verbatim)." The structural test remains the runtime guarantee.
**Source:** 04-06-SUMMARY.md (deviation #1) — recurring from 04-05

---

### Pi `/review` shipped in 2 minutes — the skill pattern is now well-established
Plan 04-06 was the fastest plan in the phase (2 min vs 8–18 min for the others). The 5-sibling skill pattern (`/analyze`/`/vary`/`/apply`/`/diff`/`/review`) + `parseSkillDoc` minimal YAML parser + D-10 freshness gate verbatim text meant the executor only needed to write the unique rendering logic.

**Impact:** Future Pi skills should be estimated at ~5 min for the first instance of a new pattern family, ~2 min once the pattern is established. The skill layer is now the fastest-moving surface in the project.
**Source:** 04-06-SUMMARY.md
