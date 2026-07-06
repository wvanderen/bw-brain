# Phase 4: Arrangement Intelligence (M3) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 4-Arrangement Intelligence (M3)
**Areas discussed:** Project-wide data acquisition, Section + repetition + energy signals, Track-role classification, Transition suggestions + Pi /review surface

---

## Project-Wide Data Acquisition

### Q1 — How should Phase 4 acquire project-wide arrangement data?

| Option | Description | Selected |
|--------|-------------|----------|
| Bridge clip-grid enumeration | Extend bridge with new `get.launcher_clips` pull handler enumerating ALL launcher clips (tracks × scenes) with note content. Richest signal; requires in-app SceneBank/ClipBank capabilities-doc probe. | ✓ |
| Cursor-clip walk accumulation | No bridge change. Producer selects clips one at a time; daemon accumulates project map in `.bw-brain/`. Lower risk but tedious UX. | |
| Thin-signal (current bridge only) | Analyze only track names + cursor clip + transport. No bridge change, no probe. Below the milestone's usefulness bar. | |
| Hybrid: enumerate + fallback | Commit to enumeration target with graceful degradation to thin-signal if probe fails. Best coverage, most effort. | |

**User's choice:** Bridge clip-grid enumeration
**Notes:** Foundational gap — arrangement analysis needs project-wide data; current bridge mirrors only one cursor clip + 8 track names. Matches the probe-then-build discipline.

### Q2 — Which Bitwig view is the analysis target?

| Option | Description | Selected |
|--------|-------------|----------|
| Launcher clip-grid (scenes) | Scene-grouping + launch-order analysis. Matches electronic/techno producer workflow. Bridge enumerates SceneBank + ClipBank. | ✓ |
| Arranger timeline | True temporal segmentation (librosa.model). Requires probing arranger READ (ROADMAP only confirmed can't EDIT). Higher API risk. | |
| Both (launcher + arranger) | Enumerate both, analyze whichever the project uses. ~2× bridge work; overscoped. | |

**User's choice:** Launcher clip-grid (scenes)
**Notes:** Reframes ROADMAP librosa.segment research from continuous-timeline segmentation to structural grouping of discrete scene/clip units.

### Q3 — How should the daemon manage the launcher-grid data?

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand pull, no cache | Fresh `get.launcher_clips` pull per `bw-arrange` call; discard raw grid after analysis. Matches `bw-midi inspect` pattern. | |
| Cached durable snapshot | Pull once, persist `.bw-brain/arrangement-snapshot.json`; freshness check re-pulls on reconnect/explicit refresh. Natural companion to roles.json. | ✓ |
| In-memory session cache | Pull once per session into memory; refresh on reconnect. Conflicts with roles.json durability across restart. | |

**User's choice:** Cached durable snapshot
**Notes:** roles.json (ARRANGE-05) already durable — snapshot is the natural companion. Avoids re-pulling per call.

---

## Section + Repetition + Energy Signals (ARRANGE-01/02/03)

### Q4 — What drives section detection across scenes?

| Option | Description | Selected |
|--------|-------------|----------|
| Scene feature-vector clustering | Per-scene feature vector (density, PCP, velocity, active-track count, length); self-similarity matrix over scene boundaries; cluster adjacent similar scenes. Refuse below threshold. | ✓ |
| Track-activation pattern grouping | Group by which tracks are active per scene. Coarser — same tracks but different content would group. | |
| Authored boundaries (manual) | Producer authors boundaries in `.bw-brain/`; analyzer only labels/validates. Defeats automatic detection. | |

**User's choice:** Scene feature-vector clustering
**Notes:** Adapts ROADMAP librosa.segment concepts to discrete scene units. Reuses MIDI-01 motif-signature feature-extraction pattern.

### Q5 — What defines the per-bar energy value?

| Option | Description | Selected |
|--------|-------------|----------|
| Weighted multi-signal composite | note-density + velocity aggregate + polyphony + pitch centroid; weights from genre profile; normalized 0-1 against project's own peak. | ✓ |
| Note-density only | Count of notes per bar / project-max. Simplest; misses loud single hits as high-energy. | |
| Velocity aggregate only | Sum of velocities / project-max. Captures loudness; misses dense quiet passages. | |

**User's choice:** Weighted multi-signal composite
**Notes:** Single signals under-represent energy. Genre-profile weights reuse ARCH-01. Project-relative normalization avoids cross-project meaninglessness.

### Q6 — What shape does the repetition-report take?

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped repetition clusters | Sets of similar scenes/sections with similarity score + matched feature dimensions. Producer-readable + drives ARRANGE-04 cleanly. | ✓ |
| Raw similarity matrix | NxN matrix over scenes. Most general; dense/hard to read for >10 scenes. | |
| Per-scene nearest-neighbor | Each scene's closest match + score. Simpler; misses transitive groups. | |

**User's choice:** Grouped repetition clusters
**Notes:** Actionable for producer + directly consumable by transition suggestions (repetition gaps = ungrouped scenes). Motifs stay in MIDI-01 (Phase 3).

### Q7 — Where do section labels come from — and how does the genre profile interact?

| Option | Description | Selected |
|--------|-------------|----------|
| Genre-profile label vocabulary | Generic profile: neutral vocab (intro/build/peak/breakdown/outro + unknown). Techno: drop/break/roll + position/energy heuristics. Below-threshold refuses. Profiles enhance, never gate. | ✓ |
| Fixed canonical labels | intro/verse/chorus/bridge/outro baked in. Genre-agnostic but wrong vocab for electronic/techno. | |
| Structural descriptions only | "low-energy opening", "high-density peak" — no named vocabulary. Honest but least producer-legible. | |

**User's choice:** Genre-profile label vocabulary
**Notes:** Reuses ARCH-01 mechanism. Techno producers think in drop/break, not verse/chorus.

---

## Track-Role Classification (ARRANGE-05)

### Q8 — What signals drive track-role classification?

| Option | Description | Selected |
|--------|-------------|----------|
| MIDI-feature + genre templates | Pitch-range/register + rhythm pattern + velocity profile per track; genre profile supplies role templates; classifier matches + emits best role + confidence. Below-threshold = unknown. | ✓ |
| Name-heuristic primary | Regex/keyword on track names (kick/bass/lead/pad); MIDI as secondary confidence. Brittle for unfriendly names. | |
| Authored + validated | Producer authors role map; analyzer validates against MIDI. Defeats automatic classification. | |

**User's choice:** MIDI-feature + genre templates
**Notes:** With D-01 enumeration the MIDI is available (not just names). Genre-profile templates reuse ARCH-01.

### Q9 — What shape does roles.json take per track?

| Option | Description | Selected |
|--------|-------------|----------|
| Single role + alternatives | One best-match role + confidence + short runner-up list. Below-threshold = unknown + surfaced assumption. Phase 5 reads .role directly. Vocabulary genre-extensible. | ✓ |
| Full ranked score vector | Full score vector across all roles per track. Information-preserving; Phase 5 re-picks threshold. | |
| Multi-role tags | One or more role tags per track. Useful for genuine multi-role tracks; complicates Phase 5. | |

**User's choice:** Single role + alternatives
**Notes:** Single-role-per-track is what Phase 5 automation salience needs. Alternatives preserve debuggability. Unknown is honest not hidden.

---

## Transition Suggestions + Pi /review Surface (ARRANGE-04 + UX-03)

### Q10 — How do transition suggestions surface — advisory only, patches where they fit, or always patches?

| Option | Description | Selected |
|--------|-------------|----------|
| Advisory only (no patches) | Structured observations + assumptions[] + manual-fix hints; NOT patch objects. Honors phase's observation/suggestion-only framing; patch model stays single-clip. | ✓ |
| Patches where single-clip fits, advisory otherwise | Hybrid: real P3 patches for single-clip fixes (humanize kick velocity); structural advice stays advisory. | |
| Always patches (cursor-clip routed) | Force every suggestion into single-clip patch model; producer selects target clip first. Loses project-level critique. | |

**User's choice:** Advisory only (no patches)
**Notes:** P3 patch model (D-01) is single cursor-clip scoped; project-level arrangement advice is a category error to force into a clip patch. Honors ROADMAP "observation/suggestion only" framing literally.

### Q11 — What does the Pi /review surface look like?

| Option | Description | Selected |
|--------|-------------|----------|
| /review text skill + ASCII viz | Pi skill shells to `bw-arrange review`; renders ASCII section timeline + unicode energy sparkline + repetition clusters + transition observations. Matches existing Pi skill pattern (D-12 P2). D-11 reserved state-pane section slot populated. | ✓ |
| Interactive TUI pane | Real scrollable interactive TUI. Richer; new TUI framework surface + dependency. Higher build effort. | |
| JSON only (no rendering) | Structured JSON only; producer reads raw or pipes elsewhere. Fails SC#5 "render" literally. | |

**User's choice:** /review text skill + ASCII viz
**Notes:** Matches proven "Pi wraps the CLI" pattern. ASCII timeline is producer-legible. No new TUI framework risk.

---

## the agent's Discretion

Areas intentionally handed to research/planning rather than locked by the user:

- **Exact `get.launcher_clips` request/response JSON shape (D-01)** — binding invariant: returns every launcher clip's raw notes keyed by track × scene, additive to frozen protocol. Researcher pins after SceneBank/ClipBank probe.
- **SceneBank/ClipBank API probe outcome (D-01)** — the live in-app finding is the researcher's deliverable (capabilities doc §4 extension). If surface is limited, researcher documents constraint + picks faithful-est fallback WITHIN the launcher-scene commitment (D-02).
- **Section-detector clustering algorithm specifics (D-04)** — invariant: per-scene feature vector → self-similarity matrix → adjacent-scene clustering → genre-profile labels → refuse below threshold. Whether agglomerative/sliding-window/threshold-gap is researcher's call.
- **Energy-weight normalization curve (D-05)** — invariant: project-relative, 0-1, weights from genre profile. Linear/z-score/min-max is researcher's call.
- **`bw-arrange` subcommand surface** — invariant: the three named SC commands (sections/repetition-report/energy-curve) exist + a /review-driving aggregate. Exact granular-vs-aggregate set is planner's call.
- **Arrangement-snapshot refresh trigger (D-03)** — invariant: refreshed on bridge reconnect via refreshSnapshot + explicit `bw-arrange refresh`. Whether it ALSO refreshes on observer/TTL/on-demand is researcher/planner's call.

## Deferred Ideas

- **Arranger-timeline reading + analysis** — D-02 commits to launcher scene view; arranger reading unprobed. Future phase if arranger-based projects dominate.
- **Transition suggestions as real patches** — D-10 keeps advisory. Future "arrangement edit" capability (scene duplication, clip-launch reorder) could enable patch minting; depends on unprobed Bitwig API.
- **Interactive TUI arrangement pane** — D-11 ships ASCII text. Real TUI pane is a richer future surface if a TUI framework is adopted.
- **Real-time / always-listening arrangement analysis** — explicitly Out of Scope per REQUIREMENTS (burns CPU, fights audio engine). Deliberate non-goal.
- **Cross-project arrangement memory** — ties to MEM-03 (deferred to v2). P4 memory is project-local.
- **Audio-based MIR / spectral analysis** — REQUIREMENTS Out of Scope. P4's librosa.segment reference is concept-adaptation to MIDI, NOT an audio pipeline.
