# Phase 4: Arrangement Intelligence (M3) - Research

**Researched:** 2026-07-06
**Domain:** Project-level arrangement analysis over Bitwig launcher clip-grid (scenes × tracks); discrete-scene structural grouping adapted from librosa.segment concepts
**Confidence:** HIGH (codebase + Javadoc groundings), MEDIUM on the in-app probe (PENDING by design), MEDIUM on cluster-threshold tuning (empirical)

## Summary

Phase 4 ships project-level arrangement critique by extending the bridge with a new `get.launcher_clips` pull handler that enumerates the launcher clip-grid (scenes × tracks), then plugging four new analyzers (section-detector, repetition-report, energy-curve, track-role-classifier) into the existing `AnalyzerRegistry`. The daemon persists a durable `.bw-brain/arrangement-snapshot.json` (companion to `roles.json`); the `bw-arrange` CLI replaces its M1 stub with `sections`/`repetition-report`/`energy-curve`/`review`/`refresh`/`current-section` subcommands; Pi `/review` shells to `bw-arrange review` and renders ASCII timeline + unicode sparkline. Every analyzer inherits `CONFIDENCE_THRESHOLD = 0.5` from `runAll` — the recurring "refuse rather than guess" stance is mechanical, not aspirational.

**The make-or-break finding (focus area 1):** the Bitwig extension-api Javadoc (read live at `/Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/`) confirms `host.createSceneBank(int)`, `SceneBank.getScene(int)`/`getItemAt(int)`, `Track.clipLauncherSlotBank()` all exist — but `Scene`, `ClipLauncherSlot`, and `ClipLauncherSlotBank` expose **state + actions only, NO `Clip` accessor**. The ONLY path to read NoteSteps from non-cursor clips is `Clip.getStep(channel, x, y)`, and the ONLY way to point a Clip at a launcher cell is the existing `PinnableCursorClip` cursor-walk: programmatically `slot.select()` → wait for the cursor-clip observer (`getLoopLength()` change is the existing signal in `Observers.java:122-128`) → read NoteSteps → next cell. This **directly contradicts CONTEXT.md D-01's "REJECTED: cursor-clip-walk accumulation"** — but the Javadoc is unambiguous: there is no public Clip-from-Slot accessor. The cursor-walk is therefore not a rejected alternative but the only API-faithful implementation path, and the latency cost (≈100–250 ms per cell × tracks × scenes) must be amortized via the durable `.bw-brain/arrangement-snapshot.json` (D-03) so producers pay it once per `bw-arrange refresh`, not once per analysis call. This is the single highest-risk research item and it CANNOT be resolved autonomously — the in-app capabilities-doc probe must measure the actual cursor-walk latency, observer coalescing behavior, and the `slot.select()` → `getLoopLength()`-fires latency distribution on a real Bitwig project before the bridge-enumeration plan locks.

**The cluster-algorithm adaptation (focus area 2):** the ROADMAP names `librosa.segment.agglomerative` + `recurrence_matrix` as starting concepts `[CITED: librosa.org/doc/latest/segment.html]`. These translate to discrete scenes cleanly: (a) build a per-scene feature vector (note-density, 12-bin pitch-class profile, velocity aggregate, active-track count, length-in-beats) — the MIDI-01 motif-signature feature-extraction pattern (`daemon/src/transforms/motif-signature.ts`) is the direct template; (b) compute a `cosine`-metric affinity self-similarity matrix over scenes (analogue of `recurrence_matrix(mode='affinity', metric='cosine', sym=True)`); (c) adjacent-scene clustering via temporally-constrained agglomerative clustering (Ward linkage, the `agglomerative` default) over the scene-ordered feature matrix → contiguous section boundaries; (d) repetition clusters = transitive closure over the affinity matrix above a profile-supplied threshold (D-06 grouped-cluster output). Same matrix, two cuts: contiguous-cut for sections (D-04), graph-cut for repetition (D-06). Both algorithms port trivially to pure TypeScript (no numpy needed — scene counts are O(10²), not O(10⁵) as in audio-frame MIR); hand-rolled is correct here because pulling `ml-kmeans` or similar would be over-engineering for a 16-scene project.

**Primary recommendation:** structure the plan as four waves — (W1) bridge `get.launcher_clips` cursor-walk + capabilities-doc probe recipe (BLOCKING human checkpoint, mirrors Phase 1 Plan 03 / Phase 2 Plan 02-02 patterns); (W2) daemon arrangement-snapshot + 4 analyzers (pure-function modules + property tests, mirrors `motif-signature.ts` discipline); (W3) `bw-arrange` CLI + daemon `arrange.*` dispatch (mirrors `bw-midi` multicall); (W4) Pi `/review` skill + contract test (mirrors `/vary`). Treat the cursor-walk probe as the trust-spine gate: every downstream analyzer depends on the snapshot, and the snapshot depends on the cursor-walk being correct + fast enough.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-11 — do NOT relitigate)

**Project-Wide Data Acquisition:**
- **D-01** — Bridge `get.launcher_clips` pull handler enumerates the launcher clip-grid (tracks × scenes), returns raw NoteStep content per clip. Additive to the frozen JSON-Lines protocol (no new envelope, no new event type). Bridge stays dumb. REQUIRES in-app capabilities-doc probe of SceneBank/ClipBank (UNPROBED — highest-risk research item).
- **D-02** — Analysis target = LAUNCHER clip-grid (scenes × tracks), NOT arranger timeline. Section detection = scene-grouping + launch-order analysis. Reframes ROADMAP research from continuous-timeline to discrete scenes.
- **D-03** — Durable `.bw-brain/arrangement-snapshot.json` (MEM-01; refreshed on bridge reconnect via `refreshSnapshot` + explicit `bw-arrange refresh`). Atomic temp+rename.

**Section + Repetition + Energy:**
- **D-04** — Section detection (ARRANGE-01) = per-scene feature vector (note-density, pitch-class profile, velocity aggregate, active-track count, length) + self-similarity matrix over scene boundaries + adjacent-scene clustering. Below-threshold = refuse. Reuses MIDI-01 motif-signature feature-extraction pattern.
- **D-05** — Energy curve (ARRANGE-03) = weighted composite (note-density + velocity aggregate + polyphony/voice count + pitch centroid). Weights from genre profile (ARCH-01). Normalized 0-1 against project's own peak.
- **D-06** — Repetition-report (ARRANGE-02) = grouped repetition clusters: sets of similar scenes/sections with similarity score + matched feature dimensions. Drives ARRANGE-04 (repetition gaps = ungrouped scenes).
- **D-07** — Section labels from genre profile (generic: intro/build/peak/breakdown/outro + unknown; techno: drop/break/roll). Profiles enhance, never gate (ARCH-02).

**Track-Role Classification:**
- **D-08** — Track-role classification (ARRANGE-05) = MIDI features (register + rhythm pattern + velocity profile) matched against genre-profile role templates. Below-threshold = 'unknown'.
- **D-09** — `roles.json` = single best-match role + confidence + alternatives per track. Vocabulary genre-extensible. Phase 5 reads `.role` directly.

**Transitions + Pi /review:**
- **D-10** — Transition suggestions (ARRANGE-04) = ADVISORY ONLY (structured observations + assumptions[] + manual-fix hints; NO patch objects). Patch model stays single cursor-clip (P3 D-01).
- **D-11** — Pi `/review` (UX-03) = text skill shelling to `bw-arrange review`, rendering ASCII section timeline + unicode energy sparkline + repetition clusters + transition observations. D-11 P2 state-pane section-label slot populated.

### the agent's Discretion (research these + recommend)

- **Exact `get.launcher_clips` request/response JSON shape (D-01):** binding invariant is "returns every launcher clip's raw notes keyed by track × scene, additive to the frozen protocol, follows the `get.selected_clip` pattern." Specific shape is the researcher's call after the SceneBank/ClipBank probe.
- **SceneBank/ClipBank API probe outcome (D-01):** whether the surface exposes what P4 needs is the live in-app finding. If limited, the researcher documents the constraint + picks the faithful-est fallback within the launcher-scene commitment (D-02) — NOT switching to arranger timeline.
- **Section-detector clustering algorithm specifics (D-04):** binding invariant is "per-scene feature vector → self-similarity matrix → adjacent-scene clustering → genre-profile labels → refuse below threshold." Agglomerative vs sliding-window vs threshold-gap is the researcher's call.
- **Energy-weight normalization curve (D-05):** linear against project-peak vs z-score vs min-max is the researcher's call; invariant is "project-relative, 0-1, weights from genre profile."
- **`bw-arrange` subcommand surface:** SCs name `bw-arrange sections`, `repetition-report`, `energy-curve`; D-11 implies `bw-arrange review` aggregate + a section-label lookup. Exact subcommand set is the planner's call.
- **Arrangement-snapshot refresh trigger (D-03):** invariant is "refreshed on bridge reconnect + explicit `bw-arrange refresh`." Whether it ALSO refreshes on a clip-content-change observer, on a TTL, or only on-demand is the researcher/planner's call.

### Deferred Ideas (OUT OF SCOPE — ignore completely)

- Arranger-timeline reading + analysis (D-02 commits to launcher; reading unprobed)
- Transition suggestions as real patches (D-10 advisory)
- Interactive TUI arrangement pane (D-11 ships ASCII)
- Real-time / always-listening arrangement analysis (Out of Scope per REQUIREMENTS)
- Cross-project arrangement memory (MEM-03, v2)
- Audio-based MIR / spectral analysis (REQUIREMENTS Out of Scope; librosa.segment is concept-adaptation, NOT an audio pipeline)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|------------------------------------|------------------|
| ARRANGE-01 | `bw-arrange sections` performs bottom-up temporal segmentation with confidence scores | D-04 + §Architecture Patterns (scene feature-vector → self-similarity matrix → agglomerative adjacent-scene clustering → genre-profile labels). Refuse-below-threshold inherited from `runAll`. Reframed: scene-grouping, NOT librosa continuous-timeline (D-02). |
| ARRANGE-02 | `bw-arrange repetition-report` produces a self-similarity report | D-06 + §Code Examples (grouped repetition clusters via transitive closure over the affinity matrix above profile threshold). Same matrix as D-04, different cut. |
| ARRANGE-03 | `bw-arrange energy-curve` produces a per-bar energy curve | D-05 + §Code Examples (weighted composite, normalized 0-1 against project peak; per-bar within launched sequence). |
| ARRANGE-04 | Transition suggestions detect energy mismatches and repetition gaps between sections | D-10 (ADVISORY ONLY — no patch objects). Detect: (a) adjacent-section energy delta above threshold; (b) ungrouped scenes from D-06. Output: structured observations + assumptions[] + manual-fix hint. |
| ARRANGE-05 | Track-role classification labels tracks with confidence, persisted to `roles.json` | D-08 + D-09 + §Code Examples (per-track aggregate features → genre-profile role-template matching → argmax above threshold → `roles.json`). Gates Phase 5 automation salience. |
| UX-03 | Pi `/review` skill + arrangement pane render section timeline + energy sparkline | D-11 + §Code Examples (Pi skill shells to `bw-arrange review`; ASCII timeline + unicode block-char sparkline). State-pane section-label slot populated via `bw-arrange current-section`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Launcher clip-grid enumeration (NoteStep walk) | **Bitwig bridge (JVM)** | — | The bridge owns the cursor-clip proxy + controller-thread scheduling; the daemon cannot reach `Clip.getStep`. Bridge stays dumb (raw notes per clip), per PROJECT.md "bridge stays dumb; reasoning lives in the daemon." |
| Scene/clip-grid snapshot persistence | **Daemon (atomic-write)** | — | `.bw-brain/arrangement-snapshot.json` is MEM-01 durable; `atomic-write.ts` (POSIX rename) is the existing primitive. |
| Section/repetition/energy/role derivation | **Daemon (analyzers)** | — | `AnalyzerRegistry` (D-08 P2 framework) is the spine; all 4 new analyzers register there. `runAll` applies `CONFIDENCE_THRESHOLD` for free. |
| Genre-profile data (weights/labels/role-templates) | **Daemon (profiles)** | — | `daemon/src/profiles/{generic,techno}.json` extend additively; ARCH-02 ("enhance never gate") is the contract. |
| Section-label state-pane surfacing | **Daemon (`bw-arrange current-section`)** | Pi state pane (D-11 P2) | Daemon owns the lookup; the state pane consumes via the CLI. |
| ASCII timeline + sparkline rendering | **Pi (`/review` skill)** | CLI (`bw-arrange review`) | Pi wraps the CLI (D-12 P2); CLI emits the JSON payload, skill renders text. Mirrors `/vary`/`/apply`/`/diff`. |
| Section/role/energy confidence gating | **Daemon (`runAll`)** | — | Below 0.5 = drop, not guess. Mechanical, not aspirational. Analyzers don't gate themselves; the registry does. |

## Project Constraints (from AGENTS.md)

- **NodeNext ESM `.js`-import rule** — all daemon-side `.ts` imports use `.js` extensions.
- **Node ≥22.19 (24 LTS preferred) / TS 5.7+** — non-negotiable runtime/version floor.
- **Ajv 2020-12 named-import quirk** — `import { Ajv2020 } from "ajv/dist/2020.js"`; standalone-compiled validators at module load.
- **`addFormats` deliberately NOT used** — no frozen schema uses the `format` keyword.
- **Loopback-only bind** — `127.0.0.1` only; the all-interfaces wildcard is unreachable (`TcpServerTransport` constructor-enforced, Pitfall 5).
- **Stack reuse** — `ajv 8.20.0`, `commander 15.0.0`, `tonal 6.4.3`, `vitest 4.1.9`, `fast-check 4.8.0`. Java side: `extension-api:21`, `jackson-databind 2.22.0`, JUnit 5.
- **Bridge stays dumb** — no musical reasoning in Java; raw notes per clip, daemon derives all features.
- **No background edits; no edit without a patch object; every patch gets an undo label; every suggestion states assumptions** — D-10 transition suggestions honor this by being advisory-only.
- **Profiles enhance, never gate (ARCH-02)** — P4's energy weights / section labels / role templates are profile DATA; generic core runs literally without a profile.
- **MCP deliberately avoided** — thin JSON-Lines bridge is the chosen IPC.
- **Process gates** — `scripts/check-deprecated-bridge.mjs` (catches deprecated API calls like the `getTrack(int)` regression); `scripts/check-bridge-artifact.mjs` (catches stale `.bwextension`); `scripts/check-capabilities-doc.mjs` (capabilities-doc sanity).

## Standard Stack

### Core (no new packages — all reuse from M1/M2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `com.bitwig:extension-api` | 21 | Bitwig cursor-clip + SceneBank + ClipLauncherSlotBank surface | Officially supported path; loaded cleanly on 6.0.6; DrivenByMoss 26.6.2 target. `[VERIFIED: in-app Javadoc 6.0.6]` |
| `jackson-databind` | 2.22.0 | Bridge JSON serialization (existing) | Already on the classpath; thread-safe ObjectMapper. |
| `ajv` (Ajv2020) | 8.20.0 | Daemon boundary validation (existing) | Already compiled-once for existing schemas; new `get.launcher_clips` response validation reuses it. |
| `tonal` | 6.4.3 | Pitch-class / register utilities | Already in stack; used in MIDI-01 motif signature + D-12 harmonic-detect. P4 reuses for D-04 pitch-class profile + D-08 register classification. |
| `commander` | 15.0.0 | `bw-arrange` multicall subcommand parsing | Already in stack; P4 mirrors `bw-midi` shape exactly. |
| `fast-check` | 4.8.0 | Property tests (refuse-below-threshold, atomicity, scene completeness) | Already in devDeps; mirrors atomic-write.test.ts pattern. |

### Supporting (existing — reused, not newly added)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.9 | Test runner (existing) | All P4 unit + property tests. The `include` glob `../pi-pack/skills/**/*.test.ts` (Plan 03-05 BLOCKER-02) already covers the new `/review` skill test. |
| `tsx` | 4.22.4 | Dev runner (existing) | `npm start` / `npm dev` already wired. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled agglomerative + recurrence | `ml-kmeans` / `density-clustering` / `mnemonist` | **Rejected.** Scene counts are O(10²); a 50-line pure-TS implementation is trivially testable + has zero supply-chain surface. Pulling a library would violate the "small toolbelt" stance + add a package-legitimacy gate for no marginal benefit. |
| `ascii-chart` / `sparkly` npm packages for the sparkline | Hand-rolled unicode block chars (`▁▂▃▄▅▆▇█`) | **Rejected.** A 10-line renderer is trivially correct; the libraries add bundle + a legitimacy gate. Unicode block chars render in every terminal Pi supports. |
| `node:cluster` for parallel cursor-walk | Sequential walk | **Rejected.** The cursor clip is a SINGLE shared resource — parallel walks would race the `getLoopLength()` observer. Sequential is correct + the durable snapshot amortizes the cost. |
| Pre-computed `state-cache.json` extension | Separate `arrangement-snapshot.json` | **Considered + rejected by D-03.** The snapshot has a different refresh cadence (on-demand vs debounced event-fold) and a different shape (clip-grid vs raw state). Separate file keeps both clean. |

**Installation:** no `npm install` step. P4 reuses 100% of the existing M1/M2 stack.

**Version verification:** no new packages to verify. The `bridge/pom.xml` (`extension-api:21`) and `daemon/package.json` (ajv 8.20.0 / tonal 6.4.3 / commander 15.0.0 / fast-check 4.8.0) are unchanged.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (no new packages) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none (no new packages proposed).
**Packages flagged as suspicious [SUS]:** none.

*All Phase 4 work reuses the existing M1/M2 stack. The legitimacy gate is therefore a no-op for this phase; the planner does NOT need a `checkpoint:human-verify` install step.*

## Architecture Patterns

### System Architecture Diagram

```
   Bitwig Studio (JVM, extension-api:21)
   ┌────────────────────────────────────────────────────────────────┐
   │  BridgeExtension.init()                                         │
   │    ├─ cursorTrack.createLauncherCursorClip(64,128) [EXISTING]   │
   │    │      └── PinnableCursorClip [SINGLE cursor — the walk      │
   │    │          resource; the daemon drives via slot.select()]    │
   │    ├─ host.createTrackBank(8,0,0)            [EXISTING]         │
   │    ├─ host.createSceneBank(N)                [NEW — D-01 probe] │
   │    │      └── SceneBank → Scene.name()/clipCount()              │
   │    └─ For each track: track.clipLauncherSlotBank() [NEW]        │
   │           └── ClipLauncherSlotBank → ClipLauncherSlot           │
   │                 ↑ slot.hasContent(), slot.select()              │
   └────────────────────────────┬───────────────────────────────────┘
                                │ loopback TCP 127.0.0.1:7878, JSON-Lines
                                │ (pull-only — D-01, D-03 P2 discipline)
                                ▼
   Daemon (TS, NodeNext ESM)
   ┌────────────────────────────────────────────────────────────────┐
   │  PullHandlers dispatch (bridge/.../PullHandlers.java:163)       │
   │    case "get.launcher_clips"  [NEW]                             │
   │      └── buildLauncherGridResponse [NEW pure builder]           │
   │            ← cursor-walk over (trackIdx × sceneIdx) cells:      │
   │              slot.select() → await getLoopLength fire →         │
   │              enumerateNotes(cursorClip) [EXISTING] → next cell  │
   │                                                                  │
   │  boot.ts refreshSnapshot() [EXTENDED]                           │
   │    ├─ correlator.send("get.project_summary") [EXISTING]         │
   │    ├─ correlator.send("get.selected_clip")   [EXISTING]         │
   │    └─ correlator.send("get.launcher_clips")  [NEW — best-effort]│
   │                                                                  │
   │  arrangement-snapshot store [NEW — daemon/src/store/]           │
   │    ├─ loadOrInit(.bw-brain/arrangement-snapshot.json)           │
   │    └─ save() via atomic-write.ts (POSIX rename)                 │
   │                                                                  │
   │  AnalyzerRegistry.runAll() [EXTENDED — M3_ANALYZERS]            │
   │    ├─ IntentAnalyzer           [M1]                             │
   │    ├─ MotifSignatureAnalyzer   [M2]                             │
   │    ├─ SectionDetector          [NEW — ARRANGE-01/D-04]          │
   │    │     ↑ consumes arrangement-snapshot.grid                   │
   │    │     ↓ produces sections (label + confidence + boundaries)  │
   │    ├─ RepetitionReport         [NEW — ARRANGE-02/D-06]          │
   │    │     ↑ consumes grid + sections                             │
   │    │     ↓ produces repetition (grouped clusters)               │
   │    ├─ EnergyCurve              [NEW — ARRANGE-03/D-05]          │
   │    │     ↑ consumes grid                                       │
   │    │     ↓ produces energyCurve (per-bar {bar, value})          │
   │    └─ TrackRoleClassifier      [NEW — ARRANGE-05/D-08]          │
   │          ↑ consumes grid (per-track notes)                      │
   │          ↓ produces trackRoles (best-match + alternatives)      │
   │                                                                  │
   │  All 4 analyzers: CONFIDENCE_THRESHOLD=0.5 inherited (refuse)   │
   │                                                                  │
   │  roles.json [NEW durable — D-09]                                │
   │  transition observations [NEW — ARRANGE-04/D-10, advisory only] │
   │                                                                  │
   │  query-server.ts dispatch [EXTENDED — arrange.* ops]            │
   │    arrange.sections / arrange.repetition_report /               │
   │    arrange.energy_curve / arrange.review /                      │
   │    arrange.current_section / arrange.refresh                    │
   └────────────────────────────┬───────────────────────────────────┘
                                │ UDS (cli-query contract)
                                ▼
   CLI (TS — bw-arrange multicall, replaces M1 stub)
   ┌────────────────────────────────────────────────────────────────┐
   │  bw-arrange sections           → query("arrange.sections")      │
   │  bw-arrange repetition-report  → query("arrange.repetition_report") │
   │  bw-arrange energy-curve       → query("arrange.energy_curve")  │
   │  bw-arrange review             → query("arrange.review")        │
   │  bw-arrange current-section    → query("arrange.current_section") │
   │  bw-arrange refresh            → query("arrange.refresh")       │
   └────────────────────────────┬───────────────────────────────────┘
                                │ exec (D-12 P2 — Pi wraps the CLI)
                                ▼
   Pi /review skill [NEW — UX-03/D-11]
   ┌────────────────────────────────────────────────────────────────┐
   │  Steps: bw-arrange review --json → render                       │
   │    State: ... Section: <label or —>                             │
   │    Timeline: 0:intro 4:build 8:drop 12:break 16:outro           │
   │    Energy:   ▂▃▄▅▆▇█▇▆▅▄▃▂▁   (per-scene unicode block sparkline)│
   │    Repetition: group[0,4,8] sim=0.91 matchedOn=[density,pcp]    │
   │    Transitions: scene4→5 energy drop 0.7→0.3 — consider ...     │
   └────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (additions only)

```
bridge/src/main/java/com/bwbrain/bridge/
├── BridgeExtension.java        [EXTENDED — createSceneBank + per-track slotBank wiring in init()]
├── PullHandlers.java           [EXTENDED — case "get.launcher_clips" + buildLauncherGridResponse()]
├── Observers.java              [EXTENDED — addLauncherObservers() (slot.hasContent + scene.name)]
├── ClipSid.java                [EXTENDED — derive(trackSid, loopBeats, sceneIdx) overload for grid uniqueness]
└── LauncherGridWalker.java    [NEW — the cursor-walk state machine; package-private, JUnit-tested]

schemas/
├── protocol/
│   └── request.schema.json     [EXTENDED — add "get.launcher_clips" to the type enum]
└── (no new schema file needed — see D-13 below: snapshot is a daemon-internal TS interface
    validated via a standalone-compiled Ajv schema in daemon/src/state/arrangement-snapshot.ts)

daemon/src/
├── state/
│   ├── analyzer-registry.ts    [EXTENDED — M3_ANALYZERS; new DerivedFieldName "repetition"]
│   ├── arrangement-snapshot.ts [NEW — load + save + ajv-validated shape]
│   └── describe.ts             [EXTENDED — section slot reads from snapshot, not SECTION_RESERVED]
├── transforms/                 (the analyzer home — mirrors motif-signature.ts discipline)
│   ├── section-detector.ts     [NEW — pure: sceneFeatureVector → selfSimMatrix → agglomerative → labels]
│   ├── repetition-report.ts    [NEW — pure: selfSimMatrix → transitive closure above threshold]
│   ├── energy-curve.ts         [NEW — pure: grid → weighted composite → normalize 0-1]
│   ├── track-role-classifier.ts [NEW — pure: perTrackFeatures → roleTemplateMatch → argmax + alternatives]
│   ├── transition-suggest.ts   [NEW — pure: sections + energyCurve + repetition → advisory observations]
│   ├── scene-features.ts       [NEW — pure: per-scene feature vector (reuses motif-signature primitives)]
│   └── self-similarity.ts      [NEW — pure: cosine affinity matrix (the shared matrix for D-04 + D-06)]
├── profiles/
│   ├── generic.json            [EXTENDED — energyWeights + sectionLabels + roleTemplates]
│   ├── techno.json             [EXTENDED — energyWeights + sectionLabels + roleTemplates]
│   └── profile.schema.json     [EXTENDED — additive optional fields per ARCH-02]
├── query/
│   └── query-server.ts         [EXTENDED — arrange.* op handlers + arrange.refresh snapshot pull]
├── runtime/
│   └── boot.ts                 [EXTENDED — refreshSnapshot pulls get.launcher_clips (best-effort)]
├── cli/commands/
│   └── arrange.ts              [REPLACED — multicall subcommands (was M1 stub)]
└── store/
    └── (atomic-write.ts REUSED — no changes)

pi-pack/skills/
└── review/                     [NEW — UX-03/D-11]
    ├── SKILL.md
    └── skill.test.ts           (structural contract test — mirrors vary/skill.test.ts)

docs/
└── bitwig-capabilities.md      [EXTENDED — §7 SceneBank/ClipBank probe results]

.planning/phases/04-arrangement-intelligence-m3/
└── (probe recipe in RESEARCH.md §Bitwig SceneBank/ClipBank Probe below)
```

### Pattern 1: Pure-function analyzer + I/O split

**What:** every analyzer is a PURE function (no fs, no net, no side effects). I/O-bound wiring (boot/query-server/CLI) is in separate files. Mirrors `motif-signature.ts` discipline.

**When to use:** always for P4 analyzers. Pure modules are trivially property-testable + composable.

**Example:**
```typescript
// daemon/src/transforms/section-detector.ts — the analyzer entry
import type { Analyzer, AnalyzeContext, DerivedField, RawState } from "../state/analyzer-registry.js";
import { sceneFeatureVector } from "./scene-features.js";
import { selfSimilarityMatrix } from "./self-similarity.js";
import { agglomerativeBoundaries } from "./section-detector.js"; // pure
import { labelSections } from "./section-labels.js"; // pure, profile-driven

export const SectionDetector: Analyzer = {
  id: "sections",
  consumes: ["clips"], // the launcher-grid snapshot mirror
  produces: ["sections"],
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const grid = extractLauncherGrid(raw); // pure defensive extract
    if (!grid || grid.scenes.length === 0) return []; // refuse — no scenes
    const features = grid.scenes.map(s => sceneFeatureVector(s, grid.tracks));
    const sim = selfSimilarityMatrix(features); // cosine affinity
    const boundaries = agglomerativeBoundaries(features, sim); // Ward, contiguous
    const labeled = labelSections(boundaries, features, ctx.profile); // generic/techno
    // confidence ∈ [0,1]: average intra-section similarity, refuse < 0.5 via runAll
    const confidence = meanIntraSectionSimilarity(labeled, sim);
    return [{
      field: "sections",
      value: labeled, // [{startScene, endScene, label, energy, avgSimilarity}]
      confidence,
      assumptions: [
        { claim: `derived from ${grid.scenes.length} scenes via cosine-affinity agglomerative`, confidence: 1.0, source: "default" },
      ],
    }];
  },
};
```

### Pattern 2: Self-similarity matrix as the shared substrate

**What:** D-04 (sections) and D-06 (repetition) consume the SAME cosine-affinity matrix. Sections cut it contiguously (Ward); repetition cuts it graph-wise (transitive closure above threshold). One matrix, two cuts.

**When to use:** any analyzer that needs scene-pair similarity. Build once in `self-similarity.ts`, consume twice.

**Example:**
```typescript
// daemon/src/transforms/self-similarity.ts — pure, no I/O
import type { SceneFeatures } from "./scene-features.js";

/** Cosine affinity ∈ [0,1] between every scene pair. Symmetric. */
export function selfSimilarityMatrix(features: SceneFeatures[]): number[][] {
  const n = features.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      // Cosine over the L2-normalized concatenated feature vector.
      const sim = (i === j) ? 1.0 : cosine(features[i].normalized, features[j].normalized);
      m[i][j] = sim;
      m[j][i] = sim;
    }
  }
  return m;
}

// daemon/src/transforms/repetition-report.ts — graph cut on the SAME matrix
/** Transitive closure above threshold → grouped clusters. */
export function repetitionClusters(sim: number[][], threshold: number): RepetitionCluster[] {
  // Union-Find over pairs where sim[i][j] >= threshold.
  // Returns [{ group:[sceneIdx,...], similarity, matchedOn:[featureDim] }]
}
```

### Pattern 3: Cursor-walk state machine (bridge side)

**What:** the bridge cannot read non-cursor clips directly. It walks the grid by programmatically selecting each cell, awaiting the cursor-clip observer, reading NoteSteps, then advancing.

**When to use:** only in `LauncherGridWalker.java` — the bridge-side state machine.

**Example (sketch — full design lands after in-app probe confirms timing):**
```java
// bridge/.../LauncherGridWalker.java — package-private, JUnit-testable
//
// State machine:
//   IDLE  ──start()──▶ SELECTING(cellIdx)
//   SELECTING: trackBank.getItemAt(t).clipLauncherSlotBank().select(s)
//              → moves the PinnableCursorClip to (t,s) if hasContent()
//   AWAITING_LOOPLEN: getLoopLength observer fires → read getStep grid
//   DRAINING: enumerateNotes(cursorClip) → accumulate into grid response
//   ADVANCING: ++cellIdx → SELECTING (or DONE)
//   DONE: emit response line with the full grid
//
// Timeout per cell (e.g. 500ms): on expiry, mark cell empty + ADVANCE
// (a missing clip is NOT a fatal error — producers leave gaps).
```

### Pattern 4: Atomic snapshot persistence (reused)

**What:** `.bw-brain/arrangement-snapshot.json` writes through `atomicWriteJson()` (POSIX rename on same filesystem). The `intent-store.ts` / `state-cache.ts` pattern is the template.

**When to use:** every snapshot save. No exceptions — the temp+rename primitive is the MEM-01 contract.

**Example:**
```typescript
// daemon/src/state/arrangement-snapshot.ts
import { atomicWriteJson } from "../store/atomic-write.js";
import { readFile } from "node:fs/promises";

export interface ArrangementSnapshot {
  version: string;
  pulledAt: string; // ISO timestamp
  sceneCount: number;
  trackCount: number;
  grid: LauncherGrid; // tracks[scenes[ClipView]] + per-scene aggregate features
  derived?: {       // populated after analyzers run; optional (snapshot pre-analysis)
    sections?: unknown;
    repetition?: unknown;
    energyCurve?: unknown;
    trackRoles?: unknown;
  };
}

export async function loadArrangementSnapshot(path: string): Promise<ArrangementSnapshot | null> {
  // ENOENT → null (D-09: no inference). Other I/O errors propagate.
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as ArrangementSnapshot;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveArrangementSnapshot(path: string, snap: ArrangementSnapshot): Promise<void> {
  await atomicWriteJson(path, snap); // temp+rename, same dir, atomic
}
```

### Anti-Patterns to Avoid

- **Hand-rolling your own clustering library** when 50 lines of Ward + union-find suffice — pulls supply-chain surface for zero benefit. The scene-count domain is O(10²); the algorithmic complexity is trivial.
- **Reading NoteSteps outside the cursor clip** — the Javadoc is unambiguous; there is no `Clip`-from-`Slot` accessor. Any "let's just grab the clip" code is fabrication. The cursor-walk is the only API-faithful path.
- **Forgetting the `runAll` threshold gate** — analyzers MUST emit honest confidence ∈ [0,1]; the registry drops sub-0.5 outputs. Don't pre-floor inside the analyzer (the registry owns the floor).
- **Pushing launcher-grid events** — D-01 is pull-only. The bridge already has 5 event types (capabilities §5); adding scene/clip-launch events would expand the protocol envelope, contradicting the "frozen protocol, additive requests" stance. The snapshot freshness is driven by `bw-arrange refresh` + `refreshSnapshot` on reconnect.
- **Mixing section labels into the energy-curve composite** — D-05 weights are profile DATA (energyWeights block); D-07 labels are profile DATA (sectionLabels block). They live in the same profile JSON but they are independent fields. Don't conflate.
- **Routing transition suggestions through `apply.patch`** — D-10 is advisory only. Any code path that mints a patchId for a transition violates the locked decision AND the patch model (single cursor-clip scope, P3 D-01).
- **Using `addFormats`** — explicitly NOT used per AGENTS.md; no frozen schema uses `format:`. The new arrangement-snapshot schema must avoid `format:` keywords (use plain string patterns instead).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file write | Custom `fs.writeFile` + `rename` | `daemon/src/store/atomic-write.ts` `atomicWriteJson()` | POSIX-rename-on-same-filesystem invariant is subtle; the existing primitive is property-tested (N=20 parallel). |
| MIDI feature extraction (PCP / IOI / density) | Re-derive per analyzer | `daemon/src/transforms/motif-signature.ts` primitives | MIDI-01 already solved this; P4 reuses the PCP + IOI + density shape directly. |
| Pitch-class / register utilities | Re-implement | `tonal` (already in stack) | PcSet / Note / Scale are correct + tested. |
| Confidence-gated analyzer registration | New registry | `AnalyzerRegistry.register()` + `runAll()` | The framework is the spine; analyzers inherit `CONFIDENCE_THRESHOLD` + assumptions[] for free. |
| CLI multicall shape | New command structure | `daemon/src/cli/commands/midi.ts` pattern | Subcommand → query → JSON envelope is the stable contract. |
| Pi skill shell-to-CLI | New skill format | `pi-pack/skills/{vary,apply,diff}/SKILL.md` pattern + `skill.test.ts` contract test | BLOCKER-02 vitest-include glob already covers `../pi-pack/skills/**/*.test.ts`. |
| Durable-store read pattern | New load/validate flow | `intent-store.ts` / `state-cache.ts` shape | ENOENT → null; other errors propagate; Ajv-validated at boundary. |
| Stable ID derivation for grid clips | New hash scheme | `bridge/.../ClipSid.java` `derive()` pattern (extend with sceneIdx for disambiguation) | The STATE-04 family pattern `^clip_[0-9a-f]{16}$` is already enforced at the schema level. |

**Key insight:** P4 is a "wire up existing primitives" phase, NOT a "build new infrastructure" phase. The trust-spine (atomic-write, analyzer-registry, Ajv-at-boundary, CLI multicall, Pi skill shell-to-CLI) is already built and battle-tested through M1/M2 + Phase 03.1. The novel work is: (1) the bridge cursor-walk handler + Java state machine; (2) 5 pure-TS analyzer functions; (3) profile schema extensions; (4) `bw-arrange` multicall replacement; (5) `/review` skill. Everything else is reuse.

## Common Pitfalls

### Pitfall 1: Cursor-walk races + observer coalescing

**What goes wrong:** programmatically calling `slot.select()` in a tight loop does NOT produce one `getLoopLength` fire per cell — Bitwig coalesces observer callbacks, so the daemon sees fewer fires than walks and reads stale NoteSteps.

**Why it happens:** Bitwig value observers fire on the controller thread and are documented to batch (`capabilities §5` notes single-fire-on-registration; rapid-fire coalescing is the open question). The existing `Observers.java` already uses `skipFirstFire` guards.

**How to avoid:** the `LauncherGridWalker` MUST (a) await ONE `getLoopLength` fire per `slot.select()`, (b) timeout per cell (500ms budget), (c) on timeout mark the cell empty + advance, (d) NEVER read `getStep` before the awaited fire. The in-app probe (§Probe Recipe below) MUST measure the actual fire-latency distribution before locking the walker's per-cell budget.

**Warning signs:** `bw-arrange refresh` returns a grid where every scene has the same notes (cursor never moved); `bw-arrange refresh` latency is suspiciously constant regardless of project size (timeout firing on every cell).

### Pitfall 2: Bitwig deprecated-API enforcement

**What goes wrong:** the bridge compiles clean (javac warning only) but throws inside `init()` at runtime because Bitwig 6.0.6 enforces `@Deprecated`-since-v2 as ERROR.

**Why it happens:** `TrackBank.getTrack(int)` and `TrackBank.getChannel(int)` are BOTH deprecated; the replacement `Bank.getItemAt(int)` is the terminal accessor. The Phase-2 UAT blocker was exactly this regression class.

**How to avoid:** (a) use `Bank.getItemAt(int)` for ALL bank access (`sceneBank.getItemAt(i)` for `Scene`, `slotBank.getItemAt(i)` for `ClipLauncherSlot`); (b) the existing `scripts/check-deprecated-bridge.mjs` process gate runs in CI/verify; (c) `getScene(int)` and `getItemAt(int)` on SceneBank are both NON-deprecated — prefer `getItemAt` for consistency with the existing TrackBank usage. `Track.getClipLauncherSlots()` and `Track.getClipLauncher()` ARE deprecated (replaced by `Track.clipLauncherSlotBank()`) — use the non-deprecated form.

**Warning signs:** extension fails to load with "Use clipLauncherSlotBank() instead" or similar.

### Pitfall 3: Inventing Scene/Clip accessors

**What goes wrong:** the planner/agent assumes `Scene.getClip(int)` or `ClipLauncherSlot.getClip()` exists and writes code against it; the bridge compiles but throws `NoSuchMethodError`.

**Why it happens:** the Javadoc is dense and the surfaces (Scene, ClipLauncherSlot, Clip) feel like they should expose their contents. They don't.

**How to avoid:** treat §Bitwig SceneBank/ClipBank Probe findings as the canonical surface; if a needed accessor isn't in the Javadoc scan results below, it doesn't exist (capabilities-doc discipline: "observed Bitwig behavior is the deliverable, never fabricated"). The cursor-walk is the ONLY path.

**Warning signs:** `javap`-style assertions that "method X exists" without an in-app verification row in `docs/bitwig-capabilities.md`.

### Pitfall 4: Forgetting the `runAll` threshold gate

**What goes wrong:** analyzer emits `confidence: 0.4` for an ambiguous section label, and the section appears in `/review` output anyway because the analyzer "rounded up."

**Why it happens:** developers add their own floor inside the analyzer (e.g. `Math.max(0.5, computed)`) — defeats the registry's gate AND misrepresents confidence.

**How to avoid:** analyzers emit HONEST confidence ∈ [0,1]; `runAll` drops anything < 0.5. Below-threshold outputs never reach the daemon's derived-state block, never reach the CLI, never reach `/review`. The `unknown` label is the post-drop representation, not a pre-drop one.

**Warning signs:** `/review` shows a section label for a project with one scene (intra-section similarity is undefined / NaN-handled to 0).

### Pitfall 5: Forcing transition suggestions into a patch

**What goes wrong:** the agent extends the transition-suggest output with a `patchId` field "for convenience" — violating D-10.

**Why it happens:** the patch pipeline (P3) is the established mutation path; it's tempting to route everything through it.

**How to avoid:** D-10 is advisory-only. The transition observation is a structured object: `{kind:"energy_drop"|"repetition_gap", from:{scene,label,energy}, to:{scene,label,energy}, delta, assumptions[], manualHint}`. NO `patchId`, NO `operations[]`, NO `risk` field. The producer acts in Bitwig manually. The code review checklist explicitly forbids patch-shape fields on transition outputs.

**Warning signs:** transition-suggest.ts imports anything from `../patch/*`.

### Pitfall 6: Adding launcher-grid events to the protocol

**What goes wrong:** agent adds `scene.name_changed` / `clip.launch_state_changed` event types to `event.schema.json`, expanding the frozen envelope.

**Why it happens:** observers exist (`SlotBank.addHasContentObserver`, `addIsPlayingObserver`, etc.) — it's tempting to wire them as push events.

**How to avoid:** D-01 is pull-only (D-03 P2 "heavy inspection is pulled"). The 5 existing event types stay; the grid is fetched via `get.launcher_clips` request on demand. The OBSERVATIONAL_EVENT_TYPES set in `daemon/src/protocol/reader.ts` stays at 5 entries. If a future phase wants launcher events (e.g. live /review refresh), that's a SEPARATE decision and a CONTEXT.md re-discussion.

**Warning signs:** `event.schema.json` enum grows past 5 entries.

### Pitfall 7: Cursor-walk mutates producer state visibly

**What goes wrong:** `slot.select()` moves the GUI focus as a side effect — the producer's clip editor jumps to a random clip during `bw-arrange refresh`.

**Why it happens:** `slot.select()` is documented to select in the editor; the cursor clip follows GUI selection by design.

**How to avoid:** the in-app probe MUST measure whether `PinnableCursorClip` (pinned) suppresses GUI focus changes. If it doesn't, document this as a known UX cost + surface it via an `assumption` in the snapshot pull ("refresh may briefly move the GUI focus"). The producer's mental model — "the daemon reads my project" — should not be broken by visible focus jumps. Possible mitigation: `host.scheduleTask(runnable, 0)` to batch + minimize visible transitions; OR use a non-pinned cursor clip with `selectClip(...)` if the in-app probe confirms a Clip reference can be obtained some other way (unlikely per Javadoc).

**Warning signs:** producer reports "Bitwig went crazy during /review."

### Pitfall 8: Snap-stale analysis

**What goes wrong:** the producer edits clips, runs `bw-arrange review`, and gets analysis of the OLD arrangement because the snapshot wasn't refreshed.

**Why it happens:** D-03 refreshes on bridge reconnect + explicit `bw-arrange refresh`. There's no automatic clip-content-change trigger (deferred per CONTEXT.md discretion).

**How to avoid:** (a) the snapshot `pulledAt` ISO timestamp is in every `/review` output as an `assumption` ("derived from snapshot pulled at <time>; run `bw-arrange refresh` if the project has changed"); (b) `bw-arrange review --refresh` is an explicit flag that triggers a pull-then-analyze cycle; (c) the `stateFreshness` field (from the watchdog) is surfaced — if `disconnected`, refuse. The producer ALWAYS knows how stale the analysis is.

**Warning signs:** `/review` output omits `pulledAt` from assumptions.

## Bitwig SceneBank/ClipBank Probe (THE highest-risk research item)

> **Status: PENDING — IN-APP PROBE NEEDED.** The Javadoc scan below is the *architectural* surface; the *behavioral* round-trip (cursor-walk latency, observer coalescing, GUI focus side effects) requires a running Bitwig instance and is the trust-spine gate for D-01. The probe recipe is structured for the planner to drop into a plan as a `checkpoint:human-verify` task that mirrors Phase 1 Plan 03 / Phase 2 Plan 02-02 / Phase 03.1 Plan 02 patterns.

### What the Javadoc CONFIRMS (in-app, `/Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/`)

`[VERIFIED: in-app Javadoc 6.0.6 — read live during this research session]`

| Surface | Method (signature) | Return type | Available |
|---------|--------------------|-------------|-----------|
| `ControllerHost` | `createSceneBank(int numScenes)` | `SceneBank` | ✓ |
| `ControllerHost` | `createMainTrackBank(int numTracks, int numSends, int numScenes)` | `TrackBank` | ✓ (alternative to existing `createTrackBank(int,int,int)` — note: this factory creates a bank with explicit scene-count dimension, possibly the better choice for grid work) |
| `SceneBank` | `getItemAt(int index)` (inherited from `Bank<Scene>`) | `Scene` | ✓ non-deprecated |
| `SceneBank` | `getScene(int index)` | `Scene` | ✓ non-deprecated (typed alias) |
| `SceneBank` | `launchScene(int indexInWindow)` | `void` | ✓ |
| `SceneBank` | `addSceneCountObserver(IntegerValueChangedCallback)` | `void` | ✓ `@Deprecated` (prefer `sceneCount()` value-accessor) |
| `SceneBank` | `scrollTo(int)`, `scrollUp()`, `scrollDown()`, `scrollPageUp()`, `scrollPageDown()` | `void` | ✓ (paging) |
| `SceneBank` | `setIndication(boolean)` | `void` | ✓ |
| `Scene` | `name()` | `SettableStringValue` | ✓ — the scene NAME accessor (not deprecated; `getName()` is the deprecated form) |
| `Scene` | `clipCount()` | `IntegerValue` | ✓ — number of clips in the scene (across tracks) |
| `Scene` | `addIsSelectedInEditorObserver(BooleanValueChangedCallback)` | `void` | ✓ |
| `Scene` | `selectInEditor()`, `showInEditor()` | `void` | ✓ |
| `Scene` | `addPositionObserver(IntegerValueChangedCallback)` | `void` | ✓ `@Deprecated` (prefer inherited `position()`) |
| `Track` | `clipLauncherSlotBank()` | `ClipLauncherSlotBank` | ✓ non-deprecated (the canonical accessor) |
| `Track` | `getClipLauncherSlots()` / `getClipLauncher()` | `ClipLauncherSlotBank` | `@Deprecated` (use `clipLauncherSlotBank()` instead) |
| `Track` | `createNewLauncherClip(int slotIndex, int lengthInBeats)` | `void` | ✓ — mutation (out of P4 scope; included for completeness) |
| `Track` | `selectSlot(int)` | `void` | ✓ — alternative to `slotBank.select(int)` |
| `ClipLauncherSlotBank` | `getItemAt(int)` (inherited from `Bank<ClipLauncherSlot>`) | `ClipLauncherSlot` | ✓ |
| `ClipLauncherSlotBank` | `select(int slot)`, `record(int slot)`, `showInEditor(int slot)` | `void` | ✓ — actions |
| `ClipLauncherSlotBank` | `createEmptyClip(int slot, int lengthInBeats)`, `deleteClip(int slot)`, `duplicateClip(int slot)` | `void` | ✓ — mutations (out of scope) |
| `ClipLauncherSlotBank` | `addHasContentObserver(IndexedBooleanValueChangedCallback)` | `void` | ✓ — per-slot hasContent push |
| `ClipLauncherSlotBank` | `addIsPlayingObserver`, `addIsPlaybackQueuedObserver`, `addIsRecordingObserver`, `addColorObserver`, `addIsSelectedObserver`, `addPlaybackStateObserver` | `void` | ✓ — push observers (P4 does NOT use these as protocol events per D-01; they may inform future refresh-trigger logic) |
| `ClipLauncherSlotBank` | `setIndication(boolean)` | `void` | ✓ |
| `ClipLauncherSlot` | `hasContent()` | `BooleanValue` | ✓ |
| `ClipLauncherSlot` | `isPlaying()`, `isPlaybackQueued()`, `isRecording()`, `isRecordingQueued()`, `isStopQueued()`, `isSelected()` | `BooleanValue` | ✓ |
| `ClipLauncherSlot` | `color()` | `SettableColorValue` | ✓ |
| `ClipLauncherSlot` | `select()`, `record()`, `showInEditor()`, `browseToInsertClip()`, `createEmptyClip(int)`, `duplicateClip()` | `void` | ✓ — actions |
| `ClipLauncherSlot` | `selectAction()`, `recordAction()` | `HardwareActionBindable` | ✓ |
| **`Clip`** (the cursor-clip's class) | `getStep(int channel, int x, int y)` | `NoteStep` | ✓ (existing P2/P3 surface) |
| `Clip` | `addStepDataObserver(StepDataChangedCallback)`, `addNoteStepObserver(NoteStepChangedCallback)`, `addPlayingStepObserver(...)` | `void` | ✓ — content-change push (per-cursor-clip) |
| `Clip` | `getLoopLength()`, `getLoopStart()`, `getPlayStart()`, `getPlayStop()` | `BeatTimeValue` | ✓ |
| `Clip` | `getTrack()` | `Track` | ✓ — back-reference |
| `Clip` | `clipLauncherSlot()` | `ClipLauncherSlot` | ✓ — back-reference |
| `Clip` | `setName(String)` | `void` | ✓ — writeable name |
| `Clip` | `scrollToStep(int)`, `setStepSize(double)`, `clearStep(...)`, `setStep(...)`, `toggleStep(...)`, `moveStep(...)`, `transpose(int)`, `quantize(double)` | various | ✓ (existing edit surface — P3 uses these) |
| `CursorClip` | `selectClip(Clip clip)` | `void` | ✓ since API 10 — **but Clip is the parameter, not the return; there is NO public source of arbitrary Clip references** |

### What the Javadoc does NOT expose (the critical gap)

`[VERIFIED: in-app Javadoc 6.0.6 — absence confirmed by directory scan]`

- **NO method on `Scene`, `ClipLauncherSlot`, or `ClipLauncherSlotBank` returns a `Clip` reference.**
- **NO `Bank<Clip>` or equivalent clip-enumeration bank exists.** (`Clip` is a `CursorClip`/`PinnableCursorClip`/`Clip` interface; there is no `ClipBank`.)
- **NO `slotBank.getItemAt(i).getClip()` or similar accessor.** The slot is state-only (hasContent/isPlaying/...) + actions (select/record/...).
- The cursor-clip follows GUI selection: `cursorTrack.createLauncherCursorClip(gridW, gridH)` returns a `PinnableCursorClip` whose `getStep(channel, x, y)` reads whatever launcher clip the producer has selected. Programmatic `slot.select()` moves the cursor clip there.

**Conclusion:** the cursor-walk pattern is the **only API-faithful** implementation of D-01. This contradicts CONTEXT.md D-01's "REJECTED: cursor-clip-walk accumulation" — but the Javadoc is unambiguous, and the alternative paths (cursor-clip-walk was rejected as "slow/manual") are based on a premise the API surface contradicts.

### In-App Probe Recipe (the trust-spine human checkpoint)

**Setup:** Bitwig Studio 6.0.6 running, bw-brain extension installed + controller enabled, a real project with at least 3 tracks × 4 scenes (one track with all-empty slots, others with varied clip content). Daemon running (`npm start` from the daemon dir).

**Probe 1 — Scene enumeration surface (5 min):**
1. Add to `BridgeExtension.init()` (temp probe build): `SceneBank sceneBank = host.createSceneBank(8);` alongside the existing `trackBank`.
2. For each `i ∈ [0,8)`: `Scene s = sceneBank.getItemAt(i); s.name().addValueObserver(name -> host.println("[probe-scene-" + i + "] name=" + name));`
3. Rebuild + reload. Observe: do scene names appear? Do they update when scenes are renamed in Bitwig?
4. Record in `docs/bitwig-capabilities.md §7`: `Observed: PENDING → (live result)`.

**Probe 2 — Per-track slot bank + hasContent grid (10 min):**
1. In the same probe build, for each track `t ∈ [0,8)`: `ClipLauncherSlotBank sb = trackBank.getItemAt(t).clipLauncherSlotBank();` `sb.addHasContentObserver((slotIdx, hasContent) -> host.println("[probe-slot-" + t + "] slot=" + slotIdx + " hasContent=" + hasContent));`
2. Rebuild + reload. Observe: does the observer fire for each cell? On registration (initial state)? On cell-content creation/deletion?
3. Record the (track × slot) grid of hasContent values.

**Probe 3 — Cursor-walk timing (the critical behavioral probe, 20 min):**
1. In the probe build, implement a one-shot `walkGrid()` method:
   - For each `(t, s)` pair where `hasContent[t][s] == true`:
     - `trackBank.getItemAt(t).clipLauncherSlotBank().select(s);`
     - await the next `cursorClip.getLoopLength()` fire (record the wall-clock latency from `select()` to fire)
     - read `enumerateNotes(cursorClip, beatsPerColumn)` (existing helper)
     - record (cellIdx, loopLen, noteCount, latencyMs)
   - Emit a single `{"type":"probe.grid_walk","payload":{"cells":[...]}}` line.
2. Rebuild + reload. Trigger the walk (e.g. via a host binding or a `get.probe_grid` request handler).
3. **Record:**
   - Per-cell latency distribution (min/max/p50/p95).
   - Whether observer coalescing caused missed fires (cell count > fire count).
   - Whether `select()` caused visible GUI focus jumps (does the clip editor visibly toggle through cells?).
   - Whether pinning the cursor clip (`PinnableCursorClip`) suppresses GUI focus changes.
4. Record in `docs/bitwig-capabilities.md §7`: `Observed: PENDING → (live distribution + GUI behavior)`.

**Probe 4 — Slot.select() vs ClipLauncherSlot.select() equivalence (5 min):**
1. In the probe build, also exercise `trackBank.getItemAt(t).selectSlot(s);` and compare its cursor-clip behavior to `clipLauncherSlotBank().select(s)`. Are they equivalent? Is one deprecated?
2. Record which is the canonical non-deprecated form.

**Probe 5 — Scene.name() latency + coalescing (5 min):**
1. Rename scenes rapidly in Bitwig; observe whether each rename fires exactly once or whether there is batching.
2. Record: do scene-name observers fire synchronously on rename?

**Acceptance criteria for the probe (unblocks the bridge plan):**
- Probe 1 confirms scenes are enumerable.
- Probe 2 confirms the hasContent grid is observable.
- Probe 3 confirms the cursor-walk is fast enough: per-cell latency p95 ≤ 250 ms (the snapshot amortizes the total — 8×16=128 cells × 250ms = 32s worst-case, acceptable for a one-shot refresh).
- Probe 3 confirms whether GUI focus jumps are visible (informs the UX caveat).
- Probe 4 settles the canonical select API.
- Probe 5 confirms scene names are observable + non-coalesced.

**Fallback if probe fails (faithful-est within D-02 launcher-scene commitment):**
- If cursor-walk latency p95 > 1s/cell: limit the snapshot to the first N cells (e.g. 64), document the cap in capabilities doc + the `/review` output assumptions, surface a `snapshotTruncated:true` flag. DO NOT switch to arranger timeline (D-02).
- If `select()` causes visible GUI focus jumps that the producer finds disruptive: document as a known UX cost + add a `--no-refresh` flag to `bw-arrange review` that reads the existing snapshot without re-pulling.
- If scenes are NOT enumerable (probe 1 fails): fall back to track-only analysis (no section detection — D-04 refuses; track-role classification + per-track energy still work). This is a major scope reduction — re-discuss in CONTEXT.md before implementing.

## Code Examples (concrete shapes the planner can lift)

### Scene feature vector (D-04 input)

```typescript
// daemon/src/transforms/scene-features.ts — PURE, no I/O
import type { Note } from "../cli/diff-logic.js";

/** A single scene's clip-grid column at a specific scene index. */
export interface SceneColumn {
  sceneIdx: number;
  cells: Array<{
    trackSid: string;
    trackName: string;
    hasContent: boolean;
    notes: Note[]; // empty if !hasContent
    loopBeats: number;
  }>;
}

/** The per-scene feature vector. Reuses motif-signature.ts primitives. */
export interface SceneFeatures {
  sceneIdx: number;
  noteDensity: number;       // notes/beat across all active cells
  pcp: number[];             // 12-bin normalized pitch-class profile (velocity×length weighted)
  velocityAggregate: number; // mean velocity 0-1 across active cells
  activeTrackCount: number;  // number of cells with hasContent
  lengthBeats: number;       // longest loop length in the column (the scene's "duration")
  pitchCentroid: number;     // weighted mean MIDI pitch (0-127)
  polyphony: number;         // max simultaneous notes (peak across cells)
  normalized: number[];      // L2-normalized concatenated vector for cosine similarity
}

export function sceneFeatureVector(column: SceneColumn): SceneFeatures {
  const activeCells = column.cells.filter(c => c.hasContent);
  const allNotes = activeCells.flatMap(c => c.notes);
  // ... (reuse PCP / IOI primitives from motif-signature.ts)
  // normalized = L2-normalize([noteDensity, ...pcp, velocityAggregate, activeTrackCount,
  //                            lengthBeats/16, pitchCentroid/127, polyphony/16])
  // The normalization scheme MUST be deterministic + documented; cosine similarity
  // requires non-zero vectors (guard empty scene → return zero-confidence upstream).
}
```

### Self-similarity matrix + agglomerative boundaries (D-04 + D-06)

```typescript
// daemon/src/transforms/self-similarity.ts — PURE
// Adapted from librosa.segment.recurrence_matrix(mode='affinity', metric='cosine', sym=true)
// [CITED: https://librosa.org/doc/latest/generated/librosa.segment.recurrence_matrix.html]

export function cosineAffinity(u: number[], v: number[]): number {
  // Cosine ∈ [-1,1] remapped to [0,1] via (cos + 1)/2 — same as motif-signature.ts
  let dot = 0, magU = 0, magV = 0;
  for (let i = 0; i < u.length; i++) {
    dot += u[i] * v[i];
    magU += u[i] ** 2;
    magV += v[i] ** 2;
  }
  const denom = Math.sqrt(magU) * Math.sqrt(magV);
  const cos = denom === 0 ? 0 : dot / denom;
  return (cos + 1) / 2;
}

// daemon/src/transforms/section-detector.ts (clustering half) — PURE
// Adapted from librosa.segment.agglomerative (temporally-constrained Ward)
// [CITED: https://librosa.org/doc/latest/generated/librosa.segment.agglomerative.html]
//
// "Temporally-constrained" maps to "scene-index-constrained" — the agglomerative
// merge MUST respect scene order (only adjacent clusters merge). This is the
// "contiguous segmentation" invariant: a section spans [startScene, endScene].

export interface SceneBoundary { startScene: number; endScene: number; }

/**
 * Bottom-up contiguous clustering. Starts with N single-scene clusters; iteratively
 * merges the adjacent pair with highest cosine affinity until k clusters remain OR
 * the best merge affinity drops below minSimilarity (refuse threshold).
 *
 * Returns the boundaries (always includes {startScene:0}).
 */
export function agglomerativeBoundaries(
  features: SceneFeatures[],
  sim: number[][],
  opts: { maxSections?: number; minSimilarity?: number } = {},
): SceneBoundary[] {
  const maxSections = opts.maxSections ?? 8;
  const minSim = opts.minSimilarity ?? 0.6; // tuned via fast-check property test
  // ... Ward-style merge restricted to adjacent clusters
}
```

### Repetition clusters (D-06 — graph cut on the same matrix)

```typescript
// daemon/src/transforms/repetition-report.ts — PURE
// Union-Find over scene pairs where sim[i][j] >= threshold.
// Transitive closure produces grouped clusters (sets of similar scenes).

export interface RepetitionCluster {
  group: number[];           // sceneIdx values
  similarity: number;        // mean pairwise similarity within the group
  matchedOn: string[];       // feature dimensions that matched (e.g. ["pcp","density"])
}

export function repetitionClusters(
  features: SceneFeatures[],
  sim: number[][],
  threshold: number,
): RepetitionCluster[] {
  // Union-Find: for each (i, j) where sim[i][j] >= threshold, union(i, j).
  // Then group by root. Filter singleton groups (a group of one is NOT a repetition).
  // matchedOn: per-pair, which feature dims contributed to the similarity above threshold.
}
```

### Energy curve (D-05)

```typescript
// daemon/src/transforms/energy-curve.ts — PURE
// Weighted composite; weights from genre profile; normalized 0-1 against project peak.

export interface EnergyPoint { bar: number; value: number; }

export interface EnergyWeights {
  noteDensity: number;
  velocityAggregate: number;
  polyphony: number;
  pitchCentroid: number;
  // weights sum to 1.0 (validated in profile.schema.json)
}

/** Linear normalization against the project's own peak. */
function normalizeAgainstPeak(values: number[]): number[] {
  const peak = Math.max(...values, 1e-9); // guard divide-by-zero
  return values.map(v => v / peak);
}

export function energyCurve(
  grid: LauncherGrid,
  weights: EnergyWeights,
): EnergyPoint[] {
  // For each bar in the launched sequence (scenes-in-order, each scene's lengthBeats
  // contributes that many bars):
  //   weighted = w1·density + w2·velocity + w3·polyphony + w4·pitchCentroid
  // Collect per-bar values; normalize against peak; emit {bar, value}.
}
```

### Track-role classification (D-08)

```typescript
// daemon/src/transforms/track-role-classifier.ts — PURE

export interface RoleTemplate {
  role: string;                 // "kick" | "bass" | "lead" | "pad" | "hats" | "percussion" | "fx" | ...
  registerLow: number;          // MIDI pitch floor (e.g. 24 = C1)
  registerHigh: number;         // MIDI pitch ceiling (e.g. 40 = E2)
  rhythmProfile: number[];      // 5-bin IOI histogram (normalized)
  velocityProfile: { mean: number; variance: number };
  minConfidence: number;        // refuse threshold (default 0.5; profile may override)
}

export interface TrackFeatures {
  trackSid: string;
  registerDistribution: number[]; // 128-bin MIDI pitch histogram (normalized)
  rhythmPattern: number[];        // 5-bin IOI histogram (normalized)
  velocityProfile: { mean: number; variance: number };
}

export interface RoleClassification {
  trackSid: string;
  role: string;        // best-match above threshold, or "unknown"
  confidence: number;  // ∈ [0,1]
  alternatives: Array<{ role: string; score: number }>; // sorted desc
}

export function classifyTrackRole(
  features: TrackFeatures,
  templates: RoleTemplate[],
): RoleClassification {
  // For each template: score = weighted cosine over (registerDistribution-masked-by-register-window,
  //                                           rhythmPattern, velocityProfile-as-3-vector).
  // Sort desc; take top above minConfidence; else role:"unknown".
}
```

### `roles.json` shape (D-09)

```json
{
  "version": "1.0",
  "classifiedAt": "2026-07-06T12:34:56.789Z",
  "profile": "techno",
  "tracks": {
    "trk_abc123def4567890": {
      "role": "kick",
      "confidence": 0.94,
      "alternatives": [
        { "role": "percussion", "score": 0.31 },
        { "role": "bass", "score": 0.18 }
      ]
    },
    "trk_def456abc7890123": {
      "role": "unknown",
      "confidence": 0.42,
      "alternatives": [
        { "role": "pad", "score": 0.41 },
        { "role": "fx", "score": 0.39 }
      ],
      "assumption": "no template cleared 0.5"
    }
  }
}
```

### `arrangement-snapshot.json` shape (D-03)

```json
{
  "version": "1.0",
  "pulledAt": "2026-07-06T12:34:56.789Z",
  "profile": "techno",
  "sceneCount": 8,
  "trackCount": 6,
  "grid": {
    "tracks": [
      {
        "trackSid": "trk_abc123def4567890",
        "name": "Kick",
        "scenes": [
          { "sceneIdx": 0, "clipSid": "clip_a1b2c3d4e5f60718", "hasContent": true, "loopBeats": 16, "notes": [...] },
          { "sceneIdx": 1, "clipSid": "clip_0000000000000000", "hasContent": false, "loopBeats": 0, "notes": [] }
        ]
      }
    ],
    "sceneNames": ["Intro", "Build", "Drop 1", "Break", "Drop 2", "Outro", "", ""]
  },
  "derived": {
    "sections": [
      { "startScene": 0, "endScene": 1, "label": "intro", "avgSimilarity": 0.78, "confidence": 0.82 },
      { "startScene": 2, "endScene": 2, "label": "drop", "avgSimilarity": 1.0, "confidence": 0.91 }
    ],
    "repetition": [
      { "group": [2, 4], "similarity": 0.93, "matchedOn": ["pcp", "density"] }
    ],
    "energyCurve": [
      { "bar": 0, "value": 0.42 }, { "bar": 1, "value": 0.48 }
    ],
    "trackRoles": {
      "trk_abc123def4567890": { "role": "kick", "confidence": 0.94, "alternatives": [] }
    }
  }
}
```

### Pi `/review` rendering (D-11)

```
State:
  Section: drop  (confidence: 0.91 — assumed from snapshot pulled 2m ago)
  Freshness: live

Timeline (8 scenes):
  0:intro   1:build   2:drop   3:break   4:drop   5:break   6:outro   7:—
  ▄▄▅▅▆▆▇▇  ▅▅▆▆▇▇██  ████████  ▇▇▅▅▆▆   ████████  ▇▇▅▅▆▆   ▅▅▄▄▃▃   ▁▁▁▁▁▁

Energy sparkline (per-scene aggregate):
  ▃ ▄ ▇ █ ▇ █ ▅ ▂

Repetition clusters:
  - scenes [2, 4] (drop, drop) similarity=0.93 matchedOn=[pcp, density]

Transition observations:
  - scene 2→3 (drop → break): energy drop 0.91 → 0.42 — consider a transition riser
    assumptions: [{claim:"derived from per-scene energy composite", confidence:1.0, source:"default"}]
  - scene 5 is ungrouped (no repetition cluster) — may benefit from variation
    assumptions: [{claim:"repetition threshold 0.6 (techno profile)", confidence:1.0, source:"config"}]

Run `bw-arrange refresh` if the project has changed since 2m ago.
```

### `bw-arrange` subcommands (mirrors `bw-midi`)

```typescript
// daemon/src/cli/commands/arrange.ts — REPLACES the M1 stub
program.name("bw-arrange").description("Arrangement intelligence (M3)");

program.command("sections")
  .description("Bottom-up scene segmentation with confidence (ARRANGE-01)")
  .option("--refresh", "re-pull the launcher grid before analysis")
  .option("--explain")
  .action(async (opts) => { /* query("arrange.sections", {refresh: opts.refresh}) */ });

program.command("repetition-report")
  .description("Self-similarity report (ARRANGE-02)")
  .action(/* query("arrange.repetition_report") */);

program.command("energy-curve")
  .description("Per-bar energy curve (ARRANGE-03)")
  .action(/* query("arrange.energy_curve") */);

program.command("review")
  .description("Aggregate arrangement critique (sections + energy + repetition + transitions)")
  .option("--refresh")
  .option("--explain")
  .action(/* query("arrange.review", {refresh}) */);

program.command("current-section")
  .description("Lookup the section label for the currently-selected scene (D-11 P2 state pane)")
  .action(/* query("arrange.current_section") */);

program.command("refresh")
  .description("Force a launcher-grid re-pull (D-03)")
  .action(/* query("arrange.refresh") */);

program.parse(process.argv);
```

## Code-Base Intel (reusable assets + integration points specific to THIS phase)

### Reusable Assets (the spine P4 plugs into — do NOT fork)

| Asset | Path | Why Reused |
|-------|------|------------|
| `AnalyzerRegistry` + `Analyzer` interface | `daemon/src/state/analyzer-registry.ts` | The D-08 P2 framework. P4 registers 4 new analyzers; `runAll` applies `CONFIDENCE_THRESHOLD=0.5` for free. The `DerivedFieldName` slots `sections`/`trackRoles`/`energyCurve` are RESERVED EMPTY waiting for P4. Add `"repetition"` to the union (additive). |
| `MotifSignatureAnalyzer` + `motifSignature()` | `daemon/src/transforms/motif-signature.ts` | The MIDI-01 feature-extraction template. PCP / IOI / density primitives are the canonical "compute a feature vector from a Note[]" pattern — `scene-features.ts` directly reuses them. |
| `get.selected_clip` grid-walk | `bridge/.../PullHandlers.java:178-231` | The `enumerateNotes(cursorClip, beatsPerColumn)` helper is the exact shape D-01's cursor-walk invokes per cell. The bridge already knows how to convert `getStep(channel, x, y)` → `NoteView`. |
| `ClipSid.derive(trackSid, loopBeats)` | `bridge/.../ClipSid.java` | The V1 clipSid hash. P4 extends with a `sceneIdx` overload: `derive(trackSid, loopBeats, sceneIdx)` for grid uniqueness (the residual same-track-same-length collision documented in P3.1 RESEARCH §D-01(c) becomes resolvable per-cell). |
| `intent-store.ts` (atomic validated read pattern) | `daemon/src/state/intent-store.ts` | The shape `arrangement-snapshot.ts` + `roles.json` follow: ENOENT → null; other I/O errors propagate; Ajv at boundary. |
| `atomic-write.ts` | `daemon/src/store/atomic-write.ts` | POSIX rename primitive. Every P4 durable write (snapshot + roles.json) goes through `atomicWriteJson()`. |
| `bw-midi` multicall shape | `daemon/src/cli/commands/midi.ts` | The subcommand → `query()` → JSON envelope pattern `bw-arrange` mirrors. The `printConnectionError` + `--explain` discipline carries over. |
| `profile-loader.ts` + `mergeProfiles()` | `daemon/src/profiles/profile-loader.ts` | The ARCH-01 deep-merge logic. P4 extends profiles additively with `energyWeights` + `sectionLabels` + `roleTemplates` blocks; the loader deep-merges them per-key. |
| `LineJson.response(id, ok, payload)` | `bridge/.../LineJson.java:38-46` | The pure response builder. `buildLauncherGridResponse` follows the same shape as `buildClipResponse` / `buildProjectSummaryResponse`. |
| `describe.ts` `SECTION_RESERVED` | `daemon/src/state/describe.ts:60` | The em-dash placeholder. Post-P4, the describe() section slot reads from the snapshot's `derived.sections` and finds the section covering `state.selection.sceneIdx` (or the launched-now scene). Until then it stays `—`. |
| `scripts/check-deprecated-bridge.mjs` | `scripts/check-deprecated-bridge.mjs` | The mechanical deprecation gate. P4's bridge additions (`sceneBank.getItemAt(i)`, `track.clipLauncherSlotBank()`) MUST be non-deprecated; this script catches regressions at verify time. |

### Integration Points (where P4 wires in)

| Integration | From → To | Protocol | Additive? |
|-------------|-----------|----------|-----------|
| `get.launcher_clips` request | Daemon → Bridge | TCP JSON-Lines (loopback 7878) | New `get.*` request type — extend `request.schema.json` enum. NO new event type. |
| `get.launcher_clips` response | Bridge → Daemon | TCP JSON-Lines (loopback 7878) | Standard `{ok:true, payload:{grid}}` response. |
| `arrange.*` ops | CLI → Daemon | UDS cli-query | New ops in `query.schema.json` enum (additive). |
| `.bw-brain/arrangement-snapshot.json` | Daemon ↔ disk | file I/O via `atomicWriteJson` | New durable file. |
| `.bw-brain/roles.json` | Daemon ↔ disk | file I/O via `atomicWriteJson` | New durable file (ARRANGE-05). |
| `M3_ANALYZERS` registry | boot.ts → AnalyzerRegistry | in-process | Extends `M2_ANALYZERS` (additive). |
| `bw-arrange refresh` | CLI → Daemon | UDS `arrange.refresh` op | Triggers `correlator.send("get.launcher_clips")` then `runAll` then snapshot save. |
| Pi `/review` skill | Pi → CLI | exec | Mirrors `/vary`/`/apply`/`/diff`. |

### Profiles Extension Schema (D-05/D-07/D-08)

The existing `profile.schema.json` is extended ADDITIVELY (current `additionalProperties:false` means new fields require schema extension). The additions honor ARCH-02: all new fields OPTIONAL; generic core runs literally without them.

```jsonc
// schemas/profile.schema.json (additions)
{
  // ... existing fields unchanged ...
  "energyWeights": {
    "type": "object",
    "additionalProperties": false,
    "required": ["noteDensity", "velocityAggregate", "polyphony", "pitchCentroid"],
    "description": "D-05 energy-curve composite weights. MUST sum to 1.0 (validated).",
    "properties": {
      "noteDensity":         { "type": "number", "minimum": 0, "maximum": 1 },
      "velocityAggregate":   { "type": "number", "minimum": 0, "maximum": 1 },
      "polyphony":           { "type": "number", "minimum": 0, "maximum": 1 },
      "pitchCentroid":       { "type": "number", "minimum": 0, "maximum": 1 }
    }
  },
  "sectionLabels": {
    "type": "array",
    "items": {
      "type": "object",
      "additionalProperties": false,
      "required": ["label", "position", "energyRange"],
      "properties": {
        "label":       { "type": "string", "minLength": 1 },
        "position":    { "enum": ["start", "middle", "end", "any"] },
        "energyRange": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 }
      }
    },
    "description": "D-07 vocabulary for section labeling. Generic ships [intro, build, peak, breakdown, outro, unknown]; techno adds [drop, break, roll]. Position+energy heuristics map a cluster to a label."
  },
  "roleTemplates": {
    "type": "array",
    "items": {
      "type": "object",
      "additionalProperties": false,
      "required": ["role", "registerLow", "registerHigh", "rhythmProfile", "velocityProfile"],
      "properties": {
        "role":             { "type": "string", "minLength": 1 },
        "registerLow":      { "type": "number", "minimum": 0, "maximum": 127 },
        "registerHigh":     { "type": "number", "minimum": 0, "maximum": 127 },
        "rhythmProfile":    { "type": "array", "items": { "type": "number" }, "minItems": 5, "maxItems": 5 },
        "velocityProfile":  {
          "type": "object",
          "additionalProperties": false,
          "required": ["mean", "variance"],
          "properties": {
            "mean":    { "type": "number", "minimum": 0, "maximum": 1 },
            "variance":{ "type": "number", "minimum": 0 }
          }
        },
        "minConfidence":    { "type": "number", "minimum": 0, "maximum": 1, "default": 0.5 }
      }
    },
    "description": "D-08 track-role templates. Generic ships kick/bass/lead/pad/hats/percussion/fx; techno adds tighter register windows."
  }
}
```

**Generic profile additions (`generic.json`):**
```jsonc
{
  // ... existing ...
  "energyWeights": { "noteDensity": 0.35, "velocityAggregate": 0.25, "polyphony": 0.20, "pitchCentroid": 0.20 },
  "sectionLabels": [
    { "label": "intro",      "position": "start",  "energyRange": [0.0, 0.4] },
    { "label": "build",      "position": "any",    "energyRange": [0.3, 0.7] },
    { "label": "peak",       "position": "middle", "energyRange": [0.7, 1.0] },
    { "label": "breakdown",  "position": "any",    "energyRange": [0.2, 0.5] },
    { "label": "outro",      "position": "end",    "energyRange": [0.0, 0.4] }
  ],
  "roleTemplates": [
    { "role": "kick",       "registerLow": 24, "registerHigh": 40, "rhythmProfile": [0.6,0.2,0.2,0,0], "velocityProfile": { "mean": 0.9, "variance": 0.01 } },
    { "role": "bass",       "registerLow": 28, "registerHigh": 52, "rhythmProfile": [0.5,0.3,0.2,0,0], "velocityProfile": { "mean": 0.7, "variance": 0.05 } },
    { "role": "lead",       "registerLow": 60, "registerHigh": 84, "rhythmProfile": [0.3,0.3,0.3,0.1,0], "velocityProfile": { "mean": 0.7, "variance": 0.1 } },
    { "role": "pad",        "registerLow": 48, "registerHigh": 84, "rhythmProfile": [0.1,0.1,0.6,0.1,0.1], "velocityProfile": { "mean": 0.5, "variance": 0.05 } },
    { "role": "hats",       "registerLow": 60, "registerHigh": 84, "rhythmProfile": [0.7,0.2,0.1,0,0], "velocityProfile": { "mean": 0.5, "variance": 0.1 } },
    { "role": "percussion", "registerLow": 40, "registerHigh": 80, "rhythmProfile": [0.4,0.3,0.2,0.1,0], "velocityProfile": { "mean": 0.6, "variance": 0.15 } },
    { "role": "fx",         "registerLow": 0,  "registerHigh": 127,"rhythmProfile": [0.2,0.2,0.2,0.2,0.2], "velocityProfile": { "mean": 0.5, "variance": 0.3 } }
  ]
}
```

**Techno profile additions (`techno.json`):**
```jsonc
{
  "extends": "generic",
  "energyWeights": { "noteDensity": 0.40, "velocityAggregate": 0.25, "polyphony": 0.15, "pitchCentroid": 0.20 },
  "sectionLabels": [
    { "label": "drop",  "position": "middle", "energyRange": [0.85, 1.0] },
    { "label": "break", "position": "any",    "energyRange": [0.3, 0.6] },
    { "label": "roll",  "position": "any",    "energyRange": [0.6, 0.85] }
  ],
  "roleTemplates": [
    { "role": "kick",  "registerLow": 24, "registerHigh": 36, "rhythmProfile": [0.7,0.0,0.3,0,0], "velocityProfile": { "mean": 0.95, "variance": 0.005 } },
    { "role": "bass",  "registerLow": 28, "registerHigh": 48, "rhythmProfile": [0.5,0.3,0.2,0,0], "velocityProfile": { "mean": 0.75, "variance": 0.03 } }
  ]
}
```

## Design Decisions (D-12..D-22 — the structural choices the planner needs pinned)

> D-01..D-11 are LOCKED in CONTEXT.md. The decisions below are the researcher's calls within the discretion areas + the structural specifics the planner needs to commit. Numbering continues from CONTEXT.md.

### D-12 — `get.launcher_clips` request/response shape (within D-01 discretion)

**Decision:** the request is `{version, type:"get.launcher_clips", id, payload:{}}` (no parameters — the bridge returns the WHOLE current grid; paging is a future concern if it ever becomes one). The response payload shape is:

```json
{
  "version": "1.0",
  "type": "response",
  "id": "<echoed>",
  "ok": true,
  "payload": {
    "pulledAt": 1700000000,
    "sceneCount": 8,
    "trackCount": 6,
    "tracks": [
      {
        "trackSid": "trk_abc123def4567890",
        "name": "Kick",
        "slotCount": 8,
        "scenes": [
          {
            "sceneIdx": 0,
            "clipSid": "clip_a1b2c3d4e5f60718",
            "hasContent": true,
            "loopBeats": 16.0,
            "notes": [ {NoteView}, ... ]
          },
          {
            "sceneIdx": 1,
            "clipSid": "clip_0000000000000000",
            "hasContent": false,
            "loopBeats": 0,
            "notes": []
          }
        ]
      }
    ],
    "sceneNames": ["Intro", "Build", "Drop 1", "Break", "Drop 2", "Outro", "", ""]
  }
}
```

**Rationale:** matches the existing `get.selected_clip` (per-clip notes via NoteView) + `get.project_summary` (windowed track list) patterns. The `sceneNames` array is the parallel of `tracks[].name` for scenes. `clipSid` uses the V1 hash extended with sceneIdx (`derive(trackSid, loopBeats, sceneIdx)`) so grid clips are unique even on same-track-same-length collisions. Empty cells carry `clipSid:"clip_0000000000000000"` (pattern-valid fallback, mirroring the existing PullHandlers convention) + `notes:[]`.

**Additive to the frozen protocol:** the request enum gains one entry (`"get.launcher_clips"`); the response shape is open at the envelope level (`{ok, payload}` already supports arbitrary payloads). NO new event type, NO new envelope discriminator.

### D-13 — `arrangement-snapshot.json` schema location (within D-03 discretion)

**Decision:** the snapshot is a **daemon-internal TS interface** validated at boundary via a **standalone-compiled Ajv schema in `daemon/src/state/arrangement-snapshot.ts`** (mirrors `intent-store.ts` pattern). NO new file under `schemas/` — the snapshot does NOT cross the wire (it's a daemon-internal durable), so it does not need to be a cross-language JSON Schema. The bridge and the Pi layer never read it directly; the daemon exposes its content via `arrange.*` CLI ops.

**Rationale:** keeps `schemas/` as the cross-language contract home (per AGENTS.md "schemas are hand-authored files in `/schemas/`, shared as the single source of truth across Java bridge, TS daemon, and the Pi layer"). The snapshot is daemon-only → daemon-internal validator is correct.

### D-14 — Section-detector clustering: contiguous agglomerative with cosine affinity (within D-04 discretion)

**Decision:** D-04's "adjacent-scene clustering" = **contiguous agglomerative clustering with Ward-style linkage restricted to adjacent clusters**, using the cosine-affinity matrix from `self-similarity.ts`. Two refusal thresholds: (a) `minSimilarity=0.6` (best-merge floor — stop merging below this); (b) `CONFIDENCE_THRESHOLD=0.5` (the registry's drop floor — analyzer's emitted confidence = mean intra-section similarity).

**Rationale:** this is the direct adaptation of `librosa.segment.agglomerative` (temporally-constrained Ward) to discrete scenes `[CITED: librosa.org/doc/latest/generated/librosa.segment.agglomerative.html]`. The "temporal axis" becomes the scene-index axis. Ward minimizes within-cluster variance — exactly the "scenes in a section sound similar" intuition. Restricting merges to adjacent clusters preserves the contiguous-segmentation invariant (a section spans `[startScene, endScene]`).

**Alternative rejected (sliding-window):** sliding-window (group every N adjacent scenes) is too rigid (section lengths vary). Threshold-gap (split where consecutive scenes differ by > T) is too sensitive to single noisy scenes. Agglomerative is robust + matches the librosa reference.

### D-15 — Repetition clusters: union-find above profile threshold (within D-06 discretion)

**Decision:** D-06's "grouped repetition clusters" = **union-find over scene pairs where cosine affinity ≥ profile threshold (default 0.7; techno 0.75)**, then filter singleton groups (a group of one is NOT a repetition). Each cluster carries `similarity` (mean pairwise within-group) + `matchedOn` (feature dims that contributed).

**Rationale:** transitive closure is the natural graph cut on the affinity matrix; union-find is O(n²α(n)). The singleton filter is critical: "scene 3 is similar to itself" is not a repetition. The threshold is profile-supplied (generic vs techno may differ) per ARCH-01.

**Alternative rejected (raw similarity matrix output):** dense + hard to read for >10 scenes. Per-scene nearest-neighbor misses transitive groups (A~B, B~C, but A≁C — A,B,C ARE a repetition family).

### D-16 — Energy normalization: linear against project peak (within D-05 discretion)

**Decision:** per-bar energy values are normalized via **linear division by the project's own peak** (`value = raw / max(raws, 1e-9)`). The peak is computed across all bars in the launched sequence.

**Rationale:** the seed shape `{bar, value}` expects 0-1 values; linear-against-peak is the simplest project-relative normalization. Z-score is harder to interpret (negative values, no clear "loudest bar" anchor). Min-max is fragile against outliers (one quiet intro bar makes the rest look uniform). Linear-against-peak is the textbook choice + the most producer-legible ("this bar is at 80% of the project's peak energy").

### D-17 — Per-bar mapping: per-bar within the launched sequence (within D-05 discretion)

**Decision:** the energy curve is **per-bar within the launched sequence**, where "the launched sequence" = scenes-in-index-order, each scene contributing `ceil(scene.loopBeats / beatsPerBar)` bars (default 4 beats/bar from `project.timeSignature`). A scene with `loopBeats=16` (4 bars at 4/4) contributes 4 energy points; an empty scene contributes `ceil(longestSceneLoop / beatsPerBar)` zero-value points (the producer can see the gap).

**Rationale:** matches the producer's mental model (scenes → bars when launched in sequence). The seed shape `{bar, value}` is honored literally. Aggregating to per-scene would lose the within-scene energy variation; aggregating to per-clip would lose the project-level view.

### D-18 — Track-role similarity: weighted cosine over feature vector (within D-08 discretion)

**Decision:** the similarity between a track's aggregate features and a role template = **weighted cosine** over `[registerDistribution (masked by template's register window), rhythmProfile (5-bin), velocityProfile (3-vector: mean, variance, sqrt(variance))]`. Weights default to `[0.4, 0.4, 0.2]` (register + rhythm dominate; velocity is secondary). The argmax above `template.minConfidence` (default 0.5) wins; below threshold → `role:"unknown"`.

**Rationale:** cosine over normalized features is the same shape as motif-similarity (MIDI-01) — proven pattern. The register-window mask is the key novelty: a kick template only "sees" notes in C1-E1; a track with high notes outside that window scores low regardless of rhythm match.

### D-19 — `arrangement-snapshot.json` refresh trigger (within D-03 discretion)

**Decision:** the snapshot refreshes on:
1. **Bridge reconnect** via the existing `refreshSnapshot` path in `boot.ts` (additive `correlator.send("get.launcher_clips")` alongside the existing `get.project_summary` + `get.selected_clip` pulls; best-effort — a failure does NOT block daemon startup).
2. **Explicit `bw-arrange refresh`** (the producer forces a re-pull).
3. **`bw-arrange <op> --refresh`** flag (re-pull-then-analyze for the four analysis ops + review).

**NOT refreshed on:** clip-content-change observers (would require new event types, contradicting D-01 pull-only), TTL (no good default — different projects have different edit cadences).

**Rationale:** D-03's binding invariant ("refreshed on bridge reconnect + explicit refresh") is honored. The `--refresh` flag is the producer's escape hatch for "I just edited clips, refresh before analyzing." The pulledAt timestamp surfaces staleness honestly.

### D-20 — `bw-arrange` subcommand surface (within planner discretion)

**Decision:** six subcommands:
- `bw-arrange sections` (ARRANGE-01)
- `bw-arrange repetition-report` (ARRANGE-02)
- `bw-arrange energy-curve` (ARRANGE-03)
- `bw-arrange review` (aggregate — drives Pi /review per D-11)
- `bw-arrange current-section` (D-11 P2 — state pane lookup)
- `bw-arrange refresh` (D-03 — force re-pull)

All accept `--explain` (pretty-print). The analysis ops + `review` accept `--refresh`.

**Rationale:** the three SC-named commands are mandatory; `review` aggregates for Pi; `current-section` populates the state-pane slot reserved in `describe.ts`; `refresh` is the explicit re-pull. Six subcommands matches `bw-midi`'s five + diff = six surface area.

### D-21 — DerivedFieldName extension (analyzer-registry.ts)

**Decision:** extend the `DerivedFieldName` union with `"repetition"` (additive). The four new analyzers produce:
- `SectionDetector` → `sections`
- `RepetitionReport` → `repetition`
- `EnergyCurve` → `energyCurve`
- `TrackRoleClassifier` → `trackRoles`

(`sections`/`trackRoles`/`energyCurve` are already in the union; only `repetition` is new.)

**Rationale:** the existing reserved slots are filled; repetition needs a slot. The `runAll` post-filter applies uniformly.

### D-22 — Cursor-walk latency budget per cell

**Decision:** the bridge's `LauncherGridWalker` uses **500ms per-cell timeout** (the in-app probe MUST validate this is sufficient; if probe shows p95 > 250ms, increase to 750ms and document the UX cost). On timeout, the cell is marked empty + the walk advances. A missing clip is NEVER a fatal error (producers intentionally leave gaps).

**Rationale:** the snapshot amortizes the cost — 8×16=128 cells × 500ms = 64s worst-case for a one-shot refresh, acceptable. The timeout is the GUARD against observer coalescing / missed fires locking the walk.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section applies.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.9 + fast-check 4.8.0 (already in devDeps) |
| Config file | `daemon/vitest.config.ts` (existing; the `include` glob already covers `../pi-pack/skills/**/*.test.ts` for the new `/review` contract test) |
| Quick run command | `npm test -- --run daemon/src/state/analyzer-registry.test.ts daemon/src/transforms/section-detector.test.ts daemon/src/transforms/repetition-report.test.ts daemon/src/transforms/energy-curve.test.ts daemon/src/transforms/track-role-classifier.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ARRANGE-01 | Scene segmentation: known feature vectors → expected boundaries; refuse-below-threshold | unit + property | `npm test -- --run daemon/src/transforms/section-detector.test.ts` | ❌ Wave 1 |
| ARRANGE-01 | `runAll` drops section field with confidence < 0.5 | unit (existing) | `npm test -- --run daemon/src/state/analyzer-registry.test.ts` | ✅ (extend) |
| ARRANGE-02 | Repetition: known similar scenes → expected clusters; singleton filter | unit + property | `npm test -- --run daemon/src/transforms/repetition-report.test.ts` | ❌ Wave 1 |
| ARRANGE-03 | Energy curve: known note sets → expected per-bar values; normalization against peak | unit + property | `npm test -- --run daemon/src/transforms/energy-curve.test.ts` | ❌ Wave 1 |
| ARRANGE-04 | Transitions: detect energy drop + repetition gap; advisory-only shape (no patch fields) | unit | `npm test -- --run daemon/src/transforms/transition-suggest.test.ts` | ❌ Wave 1 |
| ARRANGE-05 | Track-role: known MIDI patterns → expected role; below-threshold → unknown; roles.json shape | unit + property | `npm test -- --run daemon/src/transforms/track-role-classifier.test.ts` | ❌ Wave 1 |
| UX-03 | Pi `/review` SKILL.md contract (frontmatter + hard rules + shells to bw-arrange + no wire protocol) | contract | `npm test -- --run ../pi-pack/skills/review/skill.test.ts` | ❌ Wave 4 |
| D-01 | `get.launcher_clips` response shape: schema-valid via Ajv | unit | `npm test -- --run daemon/src/state/arrangement-snapshot.test.ts` | ❌ Wave 1 |
| D-03 | Snapshot atomicity: parallel writes never produce half-written file | property (existing pattern) | `npm test -- --run daemon/src/store/atomic-write.test.ts` | ✅ (existing — covered) |
| D-09 | `roles.json` round-trip: save → load → equal | unit | `npm test -- --run daemon/src/state/roles-store.test.ts` | ❌ Wave 1 |
| INV-P4-1 | Additive-protocol: no new event types (OBSERVATIONAL_EVENT_TYPES size unchanged) | unit (grep-verify) | `npm test -- --run daemon/src/protocol/reader.test.ts` | ✅ (extend) |
| INV-P4-2 | Bridge deprecation gate: no deprecated Bitwig API calls | process | `node scripts/check-deprecated-bridge.mjs` | ✅ (existing) |
| INV-P4-3 | Cursor-walk completeness: every hasContent=true cell returns notes (bridge JUnit) | unit (Java) | `mvn -q -pl bridge test -Dtest=LauncherGridWalkerTest` | ❌ Wave 1 (Java) |

### Sampling Rate

- **Per task commit:** the relevant transform's `.test.ts` (fast; <2s per file).
- **Per wave merge:** `npm test -- --run` (full suite, ~30s).
- **Phase gate:** full suite green + `mvn bridge test` green + `node scripts/check-deprecated-bridge.mjs` clean + `node scripts/check-bridge-artifact.mjs` clean (the bridge .bwextension must be up-to-date) BEFORE `/gsd-verify-work`.

### Wave 0 Gaps (framework/bootstrap missing)

- [ ] `daemon/src/transforms/scene-features.ts` — per-scene feature vector (the input to D-04 + D-06 + D-05)
- [ ] `daemon/src/transforms/self-similarity.ts` — cosine affinity matrix (shared by D-04 + D-06)
- [ ] `daemon/src/transforms/section-detector.ts` — agglomerative contiguous clustering + analyzer wrapper
- [ ] `daemon/src/transforms/repetition-report.ts` — union-find clusters + analyzer wrapper
- [ ] `daemon/src/transforms/energy-curve.ts` — weighted composite + normalize + analyzer wrapper
- [ ] `daemon/src/transforms/track-role-classifier.ts` — template matching + analyzer wrapper
- [ ] `daemon/src/transforms/transition-suggest.ts` — advisory observation generator (NO patch imports)
- [ ] `daemon/src/state/arrangement-snapshot.ts` — load/save + Ajv validator (standalone-compiled)
- [ ] `daemon/src/state/roles-store.ts` — load/save roles.json (mirrors intent-store.ts)
- [ ] `daemon/src/state/analyzer-registry.ts` — extend `DerivedFieldName` with `"repetition"` + add `M3_ANALYZERS` export
- [ ] `bridge/src/main/java/com/bwbrain/bridge/LauncherGridWalker.java` — cursor-walk state machine
- [ ] `bridge/src/test/java/com/bwbrain/bridge/LauncherGridWalkerTest.java` — JUnit (mirrors PullHandlersApplyPatchTest pattern)
- [ ] `daemon/src/profiles/generic.json` + `techno.json` — add `energyWeights` + `sectionLabels` + `roleTemplates` (additive per profile.schema.json extension)
- [ ] `pi-pack/skills/review/SKILL.md` + `skill.test.ts` — UX-03 contract test

*(No framework install needed — vitest/fast-check/JUnit 5 are all present.)*

### Property Tests (the trust-spine gates)

```typescript
// fast-check property: refuse-below-threshold is mechanical
fc.property(fc.array(SceneFeaturesArb), (features) => {
  const sim = selfSimilarityMatrix(features);
  const boundaries = agglomerativeBoundaries(features, sim);
  const labeled = labelSections(boundaries, features, genericProfile);
  const analyzer = SectionDetector;
  const out = analyzer.analyze(rawFromGrid(features), ctx);
  // INV: every emitted section has confidence >= 0.5 (runAll would drop lower)
  for (const f of out) if (f.field === "sections") {
    expect(f.confidence).toBeGreaterThanOrEqual(0.5);
  }
});

// fast-check property: self-similarity matrix is symmetric + diagonal=1
fc.property(fc.array(SceneFeaturesArb, { minLength: 1, maxLength: 50 }), (features) => {
  const m = selfSimilarityMatrix(features);
  for (let i = 0; i < features.length; i++) {
    expect(m[i][i]).toBeCloseTo(1.0, 5);
    for (let j = 0; j < i; j++) {
      expect(m[i][j]).toBeCloseTo(m[j][i], 5);
    }
  }
});

// fast-check property: union-find repetition clusters are disjoint + cover all high-similarity pairs
fc.property(fc.array(SceneFeaturesArb), (features) => {
  const sim = selfSimilarityMatrix(features);
  const threshold = 0.7;
  const clusters = repetitionClusters(features, sim, threshold);
  // every pair with sim >= threshold is in the same cluster
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      if (sim[i][j] >= threshold) {
        const ci = clusters.find(c => c.group.includes(i));
        const cj = clusters.find(c => c.group.includes(j));
        expect(ci).toBe(cj); // same cluster reference
      }
    }
  }
});

// fast-check property: energy curve is normalized to [0,1] with peak=1
fc.property(LauncherGridArb, (grid) => {
  const curve = energyCurve(grid, genericProfile.energyWeights);
  if (curve.length === 0) return;
  const values = curve.map(p => p.value);
  expect(Math.max(...values)).toBeCloseTo(1.0, 5);
  for (const v of values) expect(v).toBeGreaterThanOrEqual(0);
  expect(v).toBeLessThanOrEqual(1);
});
```

## Security Domain

> `security_enforcement: true` in `.planning/config.json` — this section applies. ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local-first; no auth surface. The UDS daemon socket is owned by the user (`chmod 0o600`, Pitfall 5). |
| V3 Session Management | no | No sessions; one-shot CLI invocations. |
| V4 Access Control | yes (mild) | The loopback-only bind (Pitfall 5) is the access control. The new `get.launcher_clips` request + `arrange.*` ops inherit it — NO new listener, NO new socket. The bridge TCP listener stays at `127.0.0.1:7878`; the UDS query listener stays at `~/.bw-brain/daemon.sock` mode 0o600. |
| V5 Input Validation | yes | Ajv at every boundary. The new `get.launcher_clips` request is validated against `request.schema.json` (extended enum). The response is validated defensively at the daemon boundary (the snapshot validator). `arrange.*` queries are validated against `query.schema.json` (extended enum). NO `addFormats` (forbidden). |
| V6 Cryptography | no | No crypto in P4. The clipSid hash is SHA-256 (existing) for fingerprinting, not security. |
| V7 Error Handling | yes | Bridge handler NEVER throws into the void (Pitfall 8: single `safeSendErr`). Daemon handlers wrap risky branches in try/catch + log. |
| V8 Data Protection | yes (mild) | The snapshot + roles.json are project-local under `.bw-brain/` (mode inherited from project dir, no secrets). MEM-02 boundary (ephemeral session memory never writes to durable store) is preserved. |
| V12 Files & Resources | yes | `atomicWriteJson` creates the temp file in the destination dir (Pitfall 4: cross-filesystem rename is non-atomic); `mkdir(dir, {recursive:true})` before write. The snapshot path is fixed (no user-controlled path injection). |

### Known Threat Patterns for the Bitwig-bridge + TS-daemon stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Loopback bind bypass | Tampering / Info Disclosure | `TcpServerTransport` constructor-enforced `127.0.0.1` (Pitfall 5). D-01 adds no new listener. |
| Stale socket hijack | Spoofing | `boot.ts:probeStaleSocket` (300ms probe; live → refuse, stale → unlink). Unchanged. |
| Schema-invalid request smuggling | Tampering | Ajv-at-boundary on every inbound line. D-01's new `get.launcher_clips` is gated by the request enum. |
| Snapshot file corruption | Tampering | `atomicWriteJson` POSIX rename — atomic on same filesystem. ENOENT → null; parse error propagates (never paper over corruption). |
| Slop-package supply-chain attack | Tampering | **N/A for P4** — no new npm packages. The legitimacy gate is a no-op. |
| Cursor-walk race mutates producer state | Tampering (accidental) | D-22 per-cell timeout + best-effort walk; visible-GUI-focus-jump caveat surfaced in `/review` assumptions. NOT a security threat; a UX threat. |
| Transition-suggestion patch injection | Tampering | D-10 advisory-only — transition observations carry NO `patchId` / `operations` / `risk` fields. Code review checklist forbids patch-shape fields on transition outputs. |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| librosa.segment over audio frames (continuous STFT) | Discrete-scene feature-vector clustering (this phase) | Adapted for P4 | The librosa *concepts* (self-similarity matrix, agglomerative) port cleanly; the *input model* changes from audio frames to scene columns. No DSP needed; pure TypeScript suffices. |
| Pre-P3 bridge: 4 event types | P3-era: 5 event types + get.selected_clip + apply.patch | M1 → M2 | P4 stays pull-only (D-01 / D-03 P2): the protocol envelope does NOT expand for launcher-grid events. The 5-event enum + the `get.*` request enum is the stable surface. |
| P3 single-cursor-clip patch model | P4 advisory-only transitions (NO patches) | M2 → M3 | D-10 honors the patch model: project-level advice never forces into a clip-scoped patch. The patch schema (P3 D-01) is UNCHANGED in P4. |
| Phase-2-2 capabilities doc §1-6 (track + note + transport + automation + observers + stable IDs) | P4 adds §7 (SceneBank/ClipBank probe) | M1 → M3 | The capabilities-doc discipline continues: observed Bitwig behavior is the deliverable. The §7 probe results are PENDING (the in-app human checkpoint). |
| Pre-P4 profiles: thresholds + humanize + roleSalience + scales + strongBeatGrid | P4 extends: + energyWeights + sectionLabels + roleTemplates | M2 → M3 | The profile.schema.json `additionalProperties:false` requires additive fields; ARCH-02 honored (all new fields OPTIONAL, generic core runs without them). |

**Deprecated/outdated:**
- `Scene.getName()` — deprecated; use `Scene.name()`.
- `Scene.addPositionObserver`, `Scene.addClipCountObserver` — deprecated; use the value-accessor pattern (`Scene.position()` inherited from Bank, `Scene.clipCount()`).
- `Track.getClipLauncherSlots()` / `Track.getClipLauncher()` — deprecated; use `Track.clipLauncherSlotBank()`.
- `Bank.getTrack(int)` / `Bank.getChannel(int)` — deprecated since API v2; Bitwig 6.0.6 enforces deprecation-as-error at runtime. Use `Bank.getItemAt(int)` for all bank access.

## Assumptions Log

> Claims tagged `[ASSUMED]` need user confirmation before becoming locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The cursor-walk pattern (`slot.select()` → await `getLoopLength()` → read `getStep`) reliably enumerates non-cursor launcher clips. | Bitwig SceneBank/ClipBank Probe + Pitfall 1 + D-22 | HIGH — if the in-app probe shows this is unreliable, the entire launcher-grid analysis foundation collapses; D-02 fallback options (track-only or scoped-cell analysis) become necessary. The probe recipe above is the explicit validation. |
| A2 | Per-cell cursor-walk latency p95 ≤ 250ms on a real Bitwig project. | D-22 + Pitfall 1 | MEDIUM — if p95 > 1s, the snapshot UX is poor (refresh takes minutes); mitigations include cell-count caps + the `--no-refresh` review flag. The probe measures this directly. |
| A3 | Bitwig observer coalescing does NOT cause the cursor clip to miss `slot.select()` transitions. | Pitfall 1 + D-22 | MEDIUM — if coalescing IS aggressive, the walker must space calls or use a different ready-signal (e.g. `addStepDataObserver` for content-stable signals). Probe 3 measures the fire count vs cell count. |
| A4 | `PinnableCursorClip` (the pinned variant) suppresses GUI focus changes during programmatic `slot.select()`. | Pitfall 7 | LOW (UX) — if it doesn't, the producer sees focus jumps during refresh; documented as a known UX cost + the `assumption` field surfaces it. Not a security/correctness issue. |
| A5 | `Scene.name()` reflects the producer-authored scene name (the "Intro"/"Build"/"Drop" labels). | Pattern 1 + D-07 | LOW — if scene names are empty by default (producers don't label scenes), D-07 label heuristics still work from energy/position; the `sceneNames` field just carries empty strings. |
| A6 | The 4-on-the-floor kick rhythm profile `[0.7,0.0,0.3,0,0]` (techno role template) is musically representative. | D-18 + Profiles Extension | LOW — the templates are DEFAULTS; producers can override via a future profile editor. The minConfidence floor catches misfits as `unknown` rather than mislabeling. |
| A7 | The hand-rolled Ward-style agglomerative + union-find (≈80 lines combined) is correct for scene counts ≤ 64. | D-14 + D-15 + Validation | LOW — property tests cover symmetry, threshold semantics, and disjointness. If a future project has >64 scenes, the algorithm still works (O(n²) is fine at n=128); only rendering width becomes constrained. |
| A8 | The cursor-walk does not need to handle arranger clips (D-02 commits to launcher-only). | Architecture + Pitfalls | LOW — D-02 is locked. If a producer asks "why can't I analyze my arranger-based project?", the answer is the deferred-ideas list (re-probe arranger reading in a future phase). |
| A9 | Bitwig 6.0.6 is the target host (per existing capabilities doc). | Standard Stack | LOW — the existing extension is built against API 21 and loads cleanly on 6.0.6; P4 reuses the same target. |
| A10 | `addFormats` is NOT needed for any new schema field. | Anti-patterns + Project Constraints | LOW — confirmed per AGENTS.md; the new schema fields use plain `type:number` / `type:string` / `enum`, not `format:`. |

## Open Questions

1. **Cursor-walk behavioral characteristics (the trust-spine unknown).**
   - What we know: the Javadoc confirms the API surface exists (Probe 1-2 are formalities).
   - What's unclear: per-cell latency, observer coalescing, GUI focus behavior (Probe 3-4 are the gate).
   - Recommendation: make Probe 3 a `checkpoint:human-verify` task at the head of Wave 1; do NOT begin Wave 2 (analyzers) until it passes. If it fails, escalate to a CONTEXT.md re-discussion on the launcher-vs-alternative question.

2. **Whether to extend `TrackBank` to `host.createMainTrackBank(N, 0, M)` (with explicit scene count) vs. the existing `host.createTrackBank(8, 0, 0)`.**
   - What we know: both factories exist; the existing bridge uses `createTrackBank(8, 0, 0)`.
   - What's unclear: whether the scene-count param to `createMainTrackBank` makes the slot bank align better with `host.createSceneBank(M)` (consistent M).
   - Recommendation: probe in-app (Probe 1 should also try `createMainTrackBank`); align both banks at M scenes.

3. **Whether `Scene.name()` is the producer-visible scene name or an internal Bitwig identifier.**
   - What we know: the Javadoc says "Returns an object that provides access to the name of the scene."
   - What's unclear: whether empty-by-default scenes return "" or "Scene 1" auto-labels.
   - Recommendation: Probe 5 settles this; the `sceneNames` array handles either case.

4. **Whether track-role classification should consider clip launcher slot STATE (e.g. a track with all-empty slots is "unused").**
   - What we know: D-08 specifies MIDI-content classification.
   - What's unclear: should a track with zero clips be `role:"unknown"` or filtered out entirely?
   - Recommendation: filter out (don't classify); `roles.json` only contains tracks with at least one `hasContent=true` cell. The assumption documents this.

5. **Whether the `bw-arrange current-section` op needs the transport position to map "current scene."**
   - What we know: `state.project.transport.positionBeats` is in the raw state.
   - What's unclear: how to map transport position → scene index when scenes are launched non-linearly (a producer can launch scene 4, then scene 2).
   - Recommendation: the `current-section` op returns the section containing the LAST-LAUNCHED scene (observed via `addIsPlayingObserver` on the slot bank, captured into the snapshot's `currentlyPlaying` field), NOT the transport position. Simpler + matches producer mental model.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bitwig Studio 6.0.6 | Bridge probe (Wave 1 checkpoint) + end-of-phase UAT | ✓ (per Phase 1 verification + capabilities doc header) | 6.0.6 (API 21) | — (hard requirement for live verification) |
| OpenJDK 21 | Bridge build + probe | ✓ (per AGENTS.md + Phase 1) | 21 | — |
| Node 24 LTS | Daemon + CLI + Pi | ✓ (per AGENTS.md) | ≥22.19 (24 LTS preferred) | — |
| `mvn` 3.8.1+ | Bridge build | ✓ (per Phase 1) | 3.8+ | — |
| `tsx` (dev runner) | Daemon dev/test | ✓ (existing devDep) | 4.22.4 | — |
| `vitest` | All TS tests | ✓ (existing devDep) | 4.1.9 | — |
| `fast-check` | Property tests | ✓ (existing devDep) | 4.8.0 | — |
| Bitwig in-app Developer Resources (Javadoc) | Capabilities-doc probe | ✓ (locally at `/Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/`) | 6.0.6 | — (read this session) |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none.

## Sources

### Primary (HIGH confidence)

- **In-app Bitwig extension-api Javadoc 6.0.6** (`/Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/com/bitwig/extension/controller/api/`) — read live during this session:
  - `ControllerHost.html` — `createSceneBank(int)`, `createMainTrackBank(int,int,int)`, `createLauncherCursorClip(int,int)`
  - `SceneBank.html` — `getScene(int)`, `getItemAt(int)` (Bank<Scene>), `launchScene`, scroll methods, `addSceneCountObserver`
  - `Scene.html` — `name()`, `clipCount()`, `selectInEditor`, `addIsSelectedInEditorObserver`; `getName`/`addPositionObserver`/`addClipCountObserver` are `@Deprecated`
  - `Track.html` — `clipLauncherSlotBank()` (non-deprecated), `getClipLauncherSlots`/`getClipLauncher` (`@Deprecated`), `createNewLauncherClip`, `selectSlot(int)`
  - `ClipLauncherSlotBank.html` — `select(int)`, `record(int)`, `deleteClip`, `duplicateClip`, `addHasContentObserver`, `addIsPlayingObserver`, `addPlaybackStateObserver`, `addColorObserver`, `addIsSelectedObserver`
  - `ClipLauncherSlot.html` — `hasContent()`, `isPlaying()`, `isSelected()`, `color()`, `select()`, `record()`, `createEmptyClip(int)`, `duplicateClip()`, `selectAction()`, `recordAction()`
  - `Clip.html` — `getStep(int,int,int)`, `addStepDataObserver`, `addNoteStepObserver`, `getLoopLength`, `getTrack`, `clipLauncherSlot`, `setName`
  - `CursorClip.html` — `selectClip(Clip)` since API 10
  - `PinnableCursorClip.html` — extends CursorClip
  - `Bank.html` — `getItemAt(int)` (the terminal non-deprecated accessor)
- **bw-brain codebase** — read during this session:
  - `daemon/src/state/analyzer-registry.ts` — `Analyzer` interface, `runAll`, `CONFIDENCE_THRESHOLD=0.5`, `DerivedFieldName` (slots `sections`/`trackRoles`/`energyCurve` RESERVED EMPTY), `M2_ANALYZERS`
  - `daemon/src/transforms/motif-signature.ts` — PCP/IOI/density primitives, `MotifSignatureAnalyzer` pattern, pure-function + I/O split
  - `daemon/src/transforms/harmonic-detect.ts` — refuse-below-threshold pattern (`CORRELATION_FLOOR=0.5`)
  - `daemon/src/state/intent-store.ts` — atomic validated read pattern (the snapshot/roles-store template)
  - `daemon/src/store/atomic-write.ts` — POSIX-rename primitive
  - `daemon/src/store/state-cache.ts` — durable payload shape pattern
  - `daemon/src/runtime/boot.ts` — `refreshSnapshot` + `bridgePoll` (the snapshot-refresh hook point)
  - `daemon/src/runtime/dispatcher.ts` — `OBSERVATIONAL_EVENT_TYPES` 5-event enum (DO NOT extend)
  - `daemon/src/cli/commands/midi.ts` — multicall pattern (the `bw-arrange` template)
  - `daemon/src/cli/commands/arrange.ts` — M1 STUB to replace
  - `daemon/src/profiles/{generic,techno}.json` + `profile-loader.ts` — profile shape + deep-merge
  - `daemon/src/state/describe.ts` — `SECTION_RESERVED` (D-11 P2 populates)
  - `daemon/src/query/query-server.ts` — op dispatch + `LIVE_OPS` set (extend additively)
  - `bridge/src/main/java/com/bwbrain/bridge/{BridgeExtension,Observers,PullHandlers,ClipSid,LineJson}.java` — the bridge spine D-01 extends
  - `schemas/protocol/request.schema.json` + `schemas/cli-query/query.schema.json` — the enums D-01 extends (additively)
  - `schemas/project-state.schema.json` — `tracks`/`clips` open objects (D-13 snapshot stays daemon-internal)
  - `schemas/profile.schema.json` — `additionalProperties:false` (extension required)
  - `pi-pack/skills/{analyze,vary,diff}/SKILL.md` + `vary/skill.test.ts` — the skill pattern + contract test discipline
  - `docs/bitwig-capabilities.md` — the capabilities-doc discipline (§1-6 verified; §7 PENDING per the probe recipe above)

### Secondary (MEDIUM confidence)

- **librosa 0.11.0 documentation** — fetched live during this session:
  - `https://librosa.org/doc/latest/segment.html` — module overview (recurrence + clustering)
  - `https://librosa.org/doc/latest/generated/librosa.segment.recurrence_matrix.html` — `mode='affinity'`, `metric='cosine'`, `sym=True`, `bandwidth` semantics (the cosine-affinity matrix adaptation)
  - `https://librosa.org/doc/latest/generated/librosa.segment.agglomerative.html` — temporally-constrained Ward clustering (the contiguous-boundary adaptation)

### Tertiary (LOW confidence — tagged [ASSUMED])

- Cursor-walk latency distribution (Assumption A2 — measured by in-app Probe 3).
- Observer coalescing characteristics on rapid `slot.select()` calls (Assumption A3 — measured by Probe 3).
- `PinnableCursorClip` GUI-focus behavior (Assumption A4 — measured by Probe 3).
- Role-template musical representativeness (Assumption A6 — empirical defaults; overridable via profile).

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — 100% reuse from M1/M2; no new packages.
- Architecture: **HIGH** — `AnalyzerRegistry` is the existing spine; `bw-arrange` multicall mirrors `bw-midi`; Pi skill mirrors `/vary`.
- Bitwig API surface (architectural): **HIGH** — Javadoc read live; methods confirmed present/absent.
- Bitwig API behavior (cursor-walk timing, coalescing, GUI focus): **MEDIUM/PENDING** — in-app probe is the gate; structural decisions are gated behind Probe 3 results.
- Algorithm adaptation (librosa → discrete scenes): **HIGH** — the concepts port cleanly; pure-TS implementation is trivially testable.
- Pitfalls: **HIGH** — every pitfall grounded in either the Javadoc, an existing pattern, or a CONTEXT.md locked decision.

**Research date:** 2026-07-06
**Valid until:** 2026-08-06 (30 days; the in-app probe results may extend this — once Probe 3 lands, the cursor-walk timing assumptions become verified facts)
