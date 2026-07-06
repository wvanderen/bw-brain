# Phase 4: Arrangement Intelligence (M3) - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The M3 **arrangement intelligence** milestone. The assistant delivers genuinely useful project-level arrangement critique — sections, repetition, energy, transitions, and track roles — as **observation/suggestion only** (Bitwig's API cannot edit the arranger, and this phase's advice is project-level where a single-clip patch would be a category error). 6 requirements: ARRANGE-01..05 (sections, repetition-report, energy-curve, transition suggestions, track-role classification) + UX-03 (Pi `/review` + arrangement pane). Success criteria are in `.planning/ROADMAP.md` §Phase 4.

**Scope anchor (from discussion):** Phase 4 extends the bridge to enumerate the **launcher clip-grid** (tracks × scenes) — the data foundation every analyzer needs — then plugs four analyzers into the existing `AnalyzerRegistry` (D-08 P2): section-detector, repetition-report, energy-curve, track-role-classifier. All four carry confidence + assumptions[] (UX-06) and refuse below threshold (the recurring "refuse rather than guess" stance, encoded in `runAll` at `CONFIDENCE_THRESHOLD = 0.5`). Track roles persist to `.bw-brain/roles.json` (ARRANGE-05) and gate Phase 5 automation salience. Transition suggestions are PURELY ADVISORY (no patch objects) — the patch model stays single cursor-clip (P3 D-01); project-level advice never forces into a clip-scoped patch. Pi `/review` shells to a `bw-arrange review` CLI and renders an ASCII section timeline + energy sparkline.

**The load-bearing reframing:** the ROADMAP originally framed section detection as "librosa.segment temporal segmentation of a continuous timeline." Discussion locked the analysis target to the **launcher scene view** (not the arranger timeline), so section detection becomes **scene-grouping + launch-order analysis** (structural grouping of discrete clip-launcher scenes), not continuous-timeline segmentation. The librosa.segment *concepts* (self-similarity matrix, feature-vector clustering) still apply — but over discrete scene units, not continuous audio.

**What P4 is NOT:** no arranger-timeline editing or reading (ROADMAP confirms can't edit; reading unprobed and explicitly deferred — launcher view only), no new MIDI transforms (P3), no automation workflows (P5), no multi-clip/multi-track patch scope (still deferred per P3 D-02), no real-time/always-listening analysis (Out of Scope per REQUIREMENTS).

</domain>

<decisions>
## Implementation Decisions

### Project-Wide Data Acquisition (the foundation every analyzer depends on)

- **D-01 — Bridge clip-grid enumeration (`get.launcher_clips`):** Phase 4 extends the bridge with a new `get.launcher_clips` pull handler that enumerates the launcher clip-grid (tracks × scenes) and returns raw `NoteStep` content per clip. This is **additive to the frozen JSON-Lines protocol** — a new `get.*` request type following the `get.selected_clip` pattern (no new envelope, no new event type). The bridge stays dumb (raw notes per clip, per PROJECT.md "bridge stays dumb; reasoning lives in the daemon"); the daemon derives all features. **Requires an in-app capabilities-doc probe of the `SceneBank`/`ClipBank` API surface** (unprobed today — capabilities doc §4 only covers `TrackBank` deprecation). This probe is Phase 4's highest-risk research item. Rejected: cursor-clip-walk accumulation (slow/manual), thin-signal current-bridge-only (below the milestone's usefulness bar), hybrid enumerate+fallback (overscoped).
- **D-02 — Launcher scene view (NOT arranger timeline):** The analysis target is the **launcher clip-grid (scenes × tracks)**, not the arranger timeline. Section detection becomes scene-grouping + launch-order analysis; energy curve is per-scene or per-bar within the launched sequence. The bridge enumerates `SceneBank` + each track's `ClipBank`. Rationale: matches how electronic/techno producers compose (scene-based performance); reuses the existing `PinnableCursorClip` surface; ROADMAP confirmed the arranger can't be EDITED (reading is unprobed + higher API risk). Both-views was rejected as 2× the bridge work + overscoped for one milestone.
- **D-03 — Durable arrangement snapshot (`.bw-brain/arrangement-snapshot.json`):** The daemon pulls the launcher grid once, derives an arrangement model, and persists it to `.bw-brain/arrangement-snapshot.json` — a sibling to `state-cache.json` / `intent.json` / `roles.json` / `patch-history.jsonl` under MEM-01 durable memory. Subsequent reads use the snapshot; a freshness check decides when to re-pull (bridge reconnect via the existing `refreshSnapshot` path in `boot.ts`, or an explicit `bw-arrange refresh`). Atomic temp+rename discipline (`atomic-write.ts`). Rationale: `roles.json` (ARRANGE-05) is already durable — the snapshot is its natural companion; avoids re-pulling the whole grid on each analysis call. Rejected: on-demand pull no cache (latency on large projects), in-memory session cache (conflicts with roles.json durability across restart).

### Section + Repetition + Energy Signals (ARRANGE-01/02/03)

- **D-04 — Scene feature-vector clustering (ARRANGE-01):** Section detection computes a per-scene feature vector (note-density, pitch-class profile, velocity aggregate, active-track count, length) and clusters adjacent similar scenes into sections via a **self-similarity matrix over scene boundaries**. This adapts the ROADMAP librosa.segment concepts (`agglomerative`, `recurrence_matrix`) to discrete scene units rather than continuous audio. Below-threshold similarity = **refuse to label** (carry the recurring stance). Reuses the MIDI-01 motif-signature feature-extraction pattern (the signature's PCP+IOI+density is the template for the scene feature vector).
- **D-05 — Weighted composite energy (ARRANGE-03):** The per-bar energy value is a **weighted multi-signal composite**: note-density + velocity aggregate + polyphony/voice count + pitch centroid. Weights come from the **genre profile** (reuse ARCH-01; techno may weight density + low-end presence, ambient may weight polyphony). Normalized 0-1 against the **project's own peak** (relative, not absolute — avoids cross-project meaninglessness). Rejected single-signal definitions (note-density-only misses loud single hits; velocity-only misses dense quiet passages).
- **D-06 — Grouped repetition clusters (ARRANGE-02):** The repetition-report outputs **grouped repetition clusters**: sets of scenes/sections that are musically similar, each with a similarity score + the feature dimensions that match. e.g. `{group:[scene0,scene4,scene8], similarity:0.91, matchedOn:["density","pitchClass"]}`. Producer-readable ("your drop at scene 4 repeats at scene 8") AND directly consumable by transition suggestions (repetition gaps = ungrouped scenes). Motifs stay in MIDI-01 (Phase 3); repetition is scene/section level. Rejected: raw similarity matrix (dense/hard to read for >10 scenes), per-scene nearest-neighbor (misses transitive groups).
- **D-07 — Genre-profile label vocabulary:** Section labels come from the **genre profile** (ARCH-01). Generic profile ships a small neutral vocabulary (`intro`/`build`/`peak`/`breakdown`/`outro` + `unknown` for below-threshold). Techno profile adds techno-specific labels (`drop`/`break`/`roll`) + position/energy heuristics mapping a cluster to a label. Below-threshold clusters refuse a label. Profiles enhance, never gate (ARCH-02) — generic core labels run without a profile. Rationale: reuses the ARCH-01 mechanism; techno producers think in drop/break, not verse/chorus.

### Track-Role Classification (ARRANGE-05)

- **D-08 — MIDI-feature + genre templates:** Track-role classification classifies from the **MIDI content of each track's clips** (made available by D-01's enumeration): pitch-range/register, rhythm pattern, velocity profile — aggregated across the track's clips. The **genre profile** (ARCH-01) supplies **role templates** (techno kick = `{register:C1-E1, pattern:quarter-note 4-on-floor, vel:stable-high}`) and the classifier matches each track's aggregate features against templates, emitting the best-match role + confidence. Below-threshold = `unknown` (refuse). Rationale: with D-01 the MIDI is available (not just names); genre-profile templates reuse ARCH-01. Rejected: name-heuristic primary (brittle for producer-unfriendly names, ignores musical content), authored+validated (defeats automatic classification the requirement names).
- **D-09 — Single role + alternatives (roles.json shape):** `roles.json` stores **ONE best-match role + confidence + a short list of runner-up alternatives** per track. e.g. `{trk_abc:{role:"kick",confidence:0.94,alternatives:[{role:"percussion",score:0.31}]}}`. Below-threshold tracks store `role:"unknown", confidence:<0.5` WITH a surfaced assumption. Phase 5 reads `.role` directly. The role **vocabulary is genre-extensible** (generic = the ARRANGE-05 seed set `kick`/`bass`/`lead`/`pad`/`fx`/`hats`/`percussion`; techno profile adds techno-specific roles; future genres add their own). Rationale: single-role-per-track is what Phase 5 automation salience needs; alternatives preserve debuggability; `unknown` is honest not hidden.

### Transition Suggestions + Pi /review (ARRANGE-04 + UX-03)

- **D-10 — Advisory only (NO patch objects):** Transition suggestions are **purely advisory** — structured observations + `assumptions[]` + a manual-fix hint, NOT patch objects. The analyzer detects the issue (energy mismatches between adjacent sections; repetition gaps = ungrouped scenes from D-06) and surfaces it as a structured observation (e.g. "energy drops sharply between scene 4 (drop) and scene 5 (break) — consider a transition clip"). Producer acts manually in Bitwig. Rationale: the patch model (P3 D-01) is single cursor-clip scoped; project-level arrangement advice is a category error to force into a clip patch. Honors the phase's "observation/suggestion only" framing literally. Rejected: patches-where-single-clip-fits (hybrid adds complexity, muddies the clean observation/suggestion boundary), always-patches (loses project-level critique, forces cursor-clip routing).
- **D-11 — `/review` text skill + ASCII viz:** Pi `/review` is a **skill that shells to `bw-arrange review`** (CLI emits structured JSON: `sections[]`, `energyCurve[]`, `repetition[]`, `transition-observations[]`) and renders a **TEXT block**: an ASCII section timeline (scene-numbered bars with labels) + a small unicode energy sparkline (bar per scene) + the repetition clusters + transition observations. Matches the existing Pi skill pattern (D-12 P2 — `/analyze` `/vary` `/apply` `/diff` all shell to CLI + render text). The D-11 P2 reserved section-label slot in the state pane gets populated by a single `bw-arrange current-section` (or equivalent) lookup. Rationale: matches the proven "Pi wraps the CLI" pattern; ASCII timeline is producer-legible; no new TUI framework risk. Rejected: interactive TUI pane (new dependency surface, higher build effort), JSON-only (fails SC#5 "render" literally).

### the agent's Discretion
- **Exact `get.launcher_clips` request/response JSON shape (D-01):** the binding invariant is "returns every launcher clip's raw notes keyed by track × scene, additive to the frozen protocol, follows the `get.selected_clip` pattern." Whether the grid is `{tracks:[{trackSid, scenes:[{sceneIdx, clipSid, notes:[...]}]}]}` or some other shape is the researcher's call after the SceneBank/ClipBank probe confirms the API surface.
- **SceneBank/ClipBank API probe outcome (D-01):** whether Bitwig's `host.createSceneBank()` / track-clip-launcher enumeration exposes what P4 needs is the researcher's live in-app finding (capabilities doc §4 extension). If the surface is limited, the researcher documents the constraint + picks the faithful-est fallback within the launcher-scene commitment (D-02) — NOT switching to the arranger timeline without re-asking.
- **Section-detector clustering algorithm specifics (D-04):** the binding invariant is "per-scene feature vector → self-similarity matrix → adjacent-scene clustering → genre-profile labels → refuse below threshold." Whether clustering is agglomerative, sliding-window, or threshold-gap is the researcher's call (the ROADMAP names librosa.segment `agglomerative` + `recurrence_matrix` as starting concepts).
- **Energy-weight normalization curve (D-05):** whether the 0-1 normalization is linear against project-peak, z-score, or min-max is the researcher's call; the invariant is "project-relative, 0-1, weights from genre profile."
- **`bw-arrange` subcommand surface:** the SCs name `bw-arrange sections`, `repetition-report`, `energy-curve`; D-11 implies a `bw-arrange review` aggregate + a section-label lookup for the state pane. The exact subcommand set (granular vs aggregate) is the planner's call — the invariant is "the three named SC commands exist + a `/review`-driving aggregate."
- **Arrangement-snapshot refresh trigger (D-03):** the binding invariant is "refreshed on bridge reconnect via refreshSnapshot + an explicit `bw-arrange refresh`." Whether it ALSO refreshes on a clip-content-change observer, on a TTL, or only on-demand is the researcher/planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Analyzer framework (the spine P4 plugs into — do NOT fork)
- `daemon/src/state/analyzer-registry.ts` — **the D-08 P2 plugin interface P4 implements.** `Analyzer` interface (`id`/`consumes`/`produces`/`analyze`), `DerivedFieldName` already includes `"sections"`/`"trackRoles"`/`"energyCurve"` (the slots are RESERVED EMPTY waiting for P4), `CONFIDENCE_THRESHOLD = 0.5` (the refuse-below-threshold gate), `runAll` drops sub-threshold fields. `M2_ANALYZERS` is the current set (IntentAnalyzer + MotifSignatureAnalyzer); P4 appends section-detector + repetition-report + energy-curve + track-role-classifier. **Binding: reuse, no parallel pipeline.**
- `daemon/src/transforms/motif-signature.ts` — the MIDI-01 feature-extraction pattern P4's scene feature vector reuses (PCP + IOI + density). The template for D-04's per-scene feature vector.

### Bridge (where D-01's `get.launcher_clips` lands)
- `bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java` — `startConnector` (line 82) + `createLauncherCursorClip(64, 128)` (line 67). The D-01 enumeration handler registers alongside the existing pull handlers; the SceneBank/ClipBank surface is created in `init()` alongside the existing `TrackBank`.
- `bridge/src/main/java/com/bwbrain/bridge/Observers.java` — the windowed `TrackBank` observer pattern (line 154 `wireTrackBank`). The SceneBank observer (if push is needed for scene-name changes) mirrors this pattern.
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` — **the `get.selected_clip` pattern D-01's `get.launcher_clips` follows** (line 178 `handleSelectedClip` + `enumerateNotes` grid-walk at line 207). The pure response builders (`buildClipResponse`/`buildProjectSummaryResponse`) are the template for the new grid-response builder. `NoteView` record (line 58) is the per-note shape.
- `bridge/src/main/java/com/bwbrain/bridge/ClipSid.java` — the V1 clipSid derivation (`sha256(trackName:loopBeats).slice(0,16)`). The launcher-grid clips need stable IDs following the same `^clip_[0-9a-f]{16}$` pattern; whether the scene-context enriches the hash is the researcher's call.

### Bitwig capability surface (design-lock inputs — P4 EXTENDS via in-app probe)
- `docs/bitwig-capabilities.md` §4 Bank Paging — **`TrackBank` deprecation chain documented (getItemAt); SceneBank/ClipBank surface is UNPROBED.** P4's research adds the launcher-clip-enumeration probe here (the capabilities-doc discipline: observed Bitwig behavior is the deliverable, never fabricated).
- `docs/bitwig-capabilities.md` §2 Note-Editing Scope — `NoteStep` + `PinnableCursorClip` surface (VERIFIED live). The D-01 enumeration reads NoteSteps across all launcher clips, not just the cursor clip.
- `docs/bitwig-capabilities.md` §6 Stable IDs — Bitwig exposes NO native note/clip id → D-01's launcher-grid clip IDs are daemon-synthesized following the STATE-04 fingerprint pattern.

### Frozen contracts (P4 extends additively)
- `schemas/protocol/request.schema.json` — the `get.*` request enum P4 extends with `get.launcher_clips` (D-01). Additive; no new envelope.
- `schemas/project-state.schema.json` — `tracks`/`clips` items are open objects (`{type:object}`) explicitly awaiting shape-tightening. P4 reconciles the clip/scene/grid shape against the launcher-enumeration model. The `automation` field stays `maxItems:0` (Phase 5).
- `schemas/intent.schema.json` — STATE-03 intent. P4 does NOT extend (genre profile is already there via P3 D-14; section labels come from the profile, not intent).

### Daemon (the analyzers + snapshot + dispatch + CLI)
- `daemon/src/runtime/boot.ts` — `bridgePoll` (line 251) + `refreshSnapshot` (line 177) = the auto-reconcile path D-03's snapshot refresh hooks. The arrangement-snapshot refresh piggybacks on the existing reconnect path.
- `daemon/src/runtime/dispatcher.ts` — the event-fold branch (line 110). P4 adds no new event types (D-01 is pull-only per the heavy-inspection-is-pulled D-03 P2 pattern).
- `daemon/src/query/query-server.ts` — the `bw-arrange` op dispatch (currently stubbed). P4 wires `arrange.sections`/`arrange.repetition_report`/`arrange.energy_curve`/`arrange.review` handlers following the `midi.*` dispatch pattern (line 287+).
- `daemon/src/state/intent-store.ts` — the atomic validated read pattern; `arrangement-snapshot.json` (D-03) + `roles.json` (ARRANGE-05) follow this shape.
- `daemon/src/store/atomic-write.ts` — temp+rename discipline; `arrangement-snapshot.json` + `roles.json` MUST use it.
- `daemon/src/cli/commands/arrange.ts` — **the M1 STUB P4 replaces** (`emitStub availableFrom:"M3"`). Follow the `midi.ts` multicall pattern (subcommands shell to daemon via `query-client`).
- `daemon/src/cli/commands/midi.ts` — the live multicall shape P4's `bw-arrange` mirrors (subcommands → `query-client` → daemon).
- `daemon/src/state/describe.ts` — Pitfall 7 hard rule: `describe()` NEVER claims sections/motifs/roles/energy. P4 lands the analyzers that MAKE those claims legitimate (the `/analyze` skill can start referencing them post-P4).

### Genre profiles (D-05/D-07/D-08 extend)
- `daemon/src/profiles/generic.json` + `daemon/src/profiles/techno.json` — the ARCH-01 profiles P4 EXTENDS with: energy-curve weights (D-05), section-label vocabulary (D-07), track-role templates (D-08). The `profile.schema.json` governs the shape; P4 adds fields additively.

### Pi skills (D-11's /review + the state-pane section slot)
- `pi-pack/skills/analyze/SKILL.md` — the existing skill pattern (shell to CLI, render text, assumptions[] on every line, D-10 hard rules). The `/review` skill follows this shape; post-P4 the `/analyze` "Section: —" reserved slot (line 27) can populate.
- `pi-pack/skills/{vary,apply,diff}/SKILL.md` + `skill.test.ts` — the contract-test discipline (BLOCKER-02 vitest-include: `daemon/vitest.config.ts` covers `../pi-pack/skills/**/*.test.ts`).

### Project intent & constraints (do not re-litigate)
- `.planning/PROJECT.md` §Constraints + §Guardrails — patch model (scope/operations/rationale/reversibility/risk); trust model; risk classes; "bridge stays dumb; reasoning lives in the daemon"; "no background edits; no edit without a patch object; every patch gets an undo label; every suggestion states assumptions"; local-first.
- `.planning/REQUIREMENTS.md` — Phase 4's 6 requirements (ARRANGE-01..05, UX-03) + the Out-of-Scope "Real-time / always-listening mode" (transition suggestions are on-demand) + "Audio mastering / stem separation / audio MIR" (P4 is MIDI/state, not audio DSP — the librosa.segment reference is concept-adaptation, NOT an audio pipeline).
- `.planning/ROADMAP.md` §Phase 4 — goal, 5 success criteria, UI hint: yes, research items (librosa.segment adaptation — reframed by D-02/D-04 to discrete scenes; section-detection threshold tuning).
- `.claude/AGENTS.md` — repo engineering rules: NodeNext ESM `.js` import rule; Node ≥22.19 / TS 5.7+; Ajv 2020-12 named-import quirk; standalone-compiled validators; loopback-only bind; `addFormats` deliberately NOT used.

### Prior phase context (the spine P4 extends — do not re-litigate)
- `.planning/phases/03.1-gap-closure-clip-identity-scope-apply-pre-flight-bridge-auto/03.1-CONTEXT.md` — the clipSid foundation (D-01/D-02/D-03) P4's launcher-grid clip IDs build on; the auto-reconnect lifecycle (D-08) P4's snapshot-refresh piggybacks on.
- `.planning/phases/03-reversible-midi-patching-m2/03-CONTEXT.md` — **the patch model P4 honors.** D-01 hybrid catalog, D-02 single cursor-clip scope (P4 transition suggestions stay ADVISORY because of this), D-03 self-reversing ops, D-13 genre-profile data+hooks (P4 extends profiles with energy/label/role data), D-14 generic-default-techno-opted-in.
- `.planning/phases/02-read-only-context-foundation-m1/02-CONTEXT.md` — **the analyzer framework P4 plugs into.** D-08 analyzer-plugin interface (P4 adds 4 analyzers), D-09 intent user-authored (unchanged), D-10 assumptions[] on every suggestion (P4 inherits), D-11 state-pane section-label slot reserved (P4 populates), D-12 Pi wraps the CLI (P4 /review follows).
- `.planning/phases/01-schema-ipc-spike/01-CONTEXT.md` — trust-spine at schema level; Pitfall 5 loopback-only; the kept daemon spine.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`AnalyzerRegistry` + `Analyzer` interface** (`daemon/src/state/analyzer-registry.ts`) — the D-08 P2 framework. P4 registers section-detector, repetition-report, energy-curve, track-role-classifier. The `DerivedFieldName` slots (`sections`/`trackRoles`/`energyCurve`) are already reserved. `runAll` applies the refuse-below-threshold filter for free. **No new pipeline.**
- **`MotifSignatureAnalyzer`** (`daemon/src/transforms/motif-signature.ts`) — the FIRST analyzer addition (MIDI-01). Its PCP+IOI+density feature extraction is the template for D-04's per-scene feature vector + D-08's track aggregate features.
- **`get.selected_clip` grid-walk** (`PullHandlers.java:178-231`) — the `enumerateNotes` NoteStep-dump pattern D-01's `get.launcher_clips` generalizes from one cursor clip to all launcher clips.
- **`intent-store`** (`daemon/src/state/intent-store.ts`) — the atomic validated read pattern; `arrangement-snapshot.json` (D-03) + `roles.json` (ARRANGE-05) follow it.
- **`atomic-write`** (`daemon/src/store/atomic-write.ts`) — temp+rename discipline for the new durable files.
- **`bw-midi` multicall** (`daemon/src/cli/commands/midi.ts`) — the live subcommand→`query-client`→daemon pattern `bw-arrange` mirrors.
- **Genre-profile loader** (`daemon/src/profiles/` + P3 D-13/D-14) — `generic.json` + `techno.json`; P4 extends with energy weights, section labels, role templates.
- **`tonal` 6.4.3** (already in stack) — pitch-class / scale-degree utilities usable for D-04's pitch-class-profile feature + D-08's register classification.
- **`scripts/gen-types.mjs`** — the `$id`-aware JSON-Schema→TS bundler; any schema additions (request enum, project-state clip/grid shape) go through it.
- **Pi skill + contract-test pattern** (`pi-pack/skills/*/SKILL.md` + `skill.test.ts`) — `/review` follows the shell-to-CLI + assumptions[] + contract-test discipline.

### Established Patterns
- **Validate at every boundary** — Ajv-compiled-once; the new `get.launcher_clips` response + the `arrangement-snapshot.json`/`roles.json` reads are validated at boundaries.
- **Heavy inspection is PULLED** (D-03 P2) — D-01's launcher-grid enumeration is pull-only (no new event types); matches the `get.selected_clip` discipline.
- **Loopback-only security invariant (Pitfall 5)** — D-01 adds no new listener; the existing bridge TCP 7878 stays bridge-only.
- **NodeNext ESM `.js`-import rule** — all daemon-side `.ts` edits end in `.js`.
- **Below-threshold = refuse rather than guess** — encoded in `runAll` (`CONFIDENCE_THRESHOLD = 0.5`); P4's analyzers inherit it for section labels, track roles, energy claims.
- **Pure-function + I/O split** — `motif-signature.ts` is the canonical example (pure feature extraction in its own file, property-tested; I/O-bound commander wrapper separate). P4's analyzers + clustering logic follow the same split.
- **Profiles enhance, never gate (ARCH-02)** — P4's energy weights / section labels / role templates are profile DATA; the generic core runs literally without a profile.
- **Stack:** Node ≥22.19, TS 5.7+, strict, vitest 4.1.9, commander 15, ajv 8.20, tonal 6.4.3. Java bridge: Bitwig extension-api 21. `daemon/package.json` is ESM (`"type":"module"`).

### Integration Points
- **Bridge ↔ daemon:** `127.0.0.1:7878` TCP, JSON-Lines. P4 adds the daemon→bridge `get.launcher_clips` request (additive to the frozen protocol) + the bridge `case "get.launcher_clips"` handler that walks `SceneBank`/`ClipBank`.
- **CLI ↔ daemon:** UDS (the existing query channel). `bw-arrange sections`/`repetition-report`/`energy-curve`/`review` query the daemon via `query-client`. The daemon reads/writes `arrangement-snapshot.json` + `roles.json`.
- **Pi ↔ CLI:** the `/review` skill shells to `bw-arrange review` (D-12 P2); no direct Pi↔daemon path.
- **Memory:** `.bw-brain/arrangement-snapshot.json` (D-03, new durable) + `.bw-brain/roles.json` (ARRANGE-05, new durable) join the MEM-01 durable store. Both atomic-write; `roles.json` is the gate Phase 5 automation salience reads.
- **Analyzer pipeline:** the 4 new analyzers register in `AnalyzerRegistry.runAll` (D-08 P2); their `DerivedField` outputs feed both the `/review` critique + the durable snapshot.

</code_context>

<specifics>
## Specific Ideas

- The user's recurring stance — *"below-threshold = refuse rather than guess"* — governs every P4 analyzer: section labels (D-04/D-07), energy claims (D-05), repetition clusters (D-06), track roles (D-08/D-09). The `CONFIDENCE_THRESHOLD = 0.5` gate in `runAll` enforces it mechanically.
- *"Accurate first; creative later"* (PROJECT Core Value) is why P4 is **observation/suggestion only** (D-10): arrangement intelligence is critique the producer acts on manually, NOT auto-editing. Forcing project-level advice into the single-clip patch model (P3 D-01) would be a category error AND violate the trust model.
- The **launcher-vs-arranger reframing** (D-02) is the user's domain call: electronic/techno producers compose in scenes, not linear timelines. This single decision reshapes the ROADMAP's librosa.segment research from continuous-timeline segmentation to discrete-scene structural grouping — the *concepts* (self-similarity, feature clustering) carry over; the *input model* changes.
- The **genre-profile-centric design** (D-05 weights, D-07 labels, D-08 role templates all live in profiles) operationalizes ARCH-01 ("pluggable profiles, generic reasoning core"): the generic profile ships neutral-but-functional defaults; the techno profile is the first real exercise of the enhancement surface. This is where ARCH-01 stops being theoretical.
- The **durable-snapshot choice** (D-03) reflects the user's instinct that `roles.json` (ARRANGE-05) shouldn't be the only durable arrangement artifact — the snapshot is its natural companion, and Phase 5 automation salience benefits from a stable arrangement model rather than re-deriving it per call.

</specifics>

<deferred>
## Deferred Ideas

- **Arranger-timeline reading + analysis** — D-02 commits to the launcher scene view; reading the arranger timeline is unprobed (ROADMAP confirms can't EDIT; reading is a separate open question). If a future producer's project is primarily arranger-based, a later phase can probe timeline reading + add temporal segmentation. Noted for the roadmap backlog.
- **Transition suggestions as real patches** — D-10 keeps transitions advisory. If a future "arrangement edit" capability emerges (e.g. scene duplication, clip-launch reordering via a bridge surface that doesn't exist today), transition suggestions could mint patches then. Noted for the roadmap backlog; depends on Bitwig API capabilities not yet probed.
- **Interactive TUI arrangement pane** — D-11 ships ASCII text rendering in `/review`. A real interactive scrollable TUI pane (the seed §"Pi package design" vision) is a richer future surface if/when the project adopts a TUI framework. Noted for the roadmap backlog.
- **Real-time / always-listening arrangement analysis** — explicitly Out of Scope per REQUIREMENTS (burns CPU, fights the audio engine). P4 analysis is on-demand (`bw-arrange` / `/review` invocation). Not a roadmap candidate — a deliberate non-goal.
- **Cross-project arrangement memory** — ties to MEM-03 (cross-project memory + motif library, deferred to v2). P4's `roles.json` + `arrangement-snapshot.json` are project-local; cross-project pattern reuse is far future.
- **Audio-based MIR / spectral analysis** — REQUIREMENTS Out of Scope ("Audio mastering / stem separation / audio MIR — bw-brain is MIDI/state/automation intelligence, not audio DSP"). P4's librosa.segment reference is concept-adaptation to MIDI features, NOT an audio pipeline. Firmly out of scope.

None of these are new capabilities within P4's domain — all are intentionally left for later phases or the roadmap backlog.

</deferred>

---

*Phase: 4-Arrangement Intelligence (M3)*
*Context gathered: 2026-07-05*
