# Feature Research

**Domain:** Local-first DAW-intelligence layer / copilot runtime for Bitwig (CLI-stable contract + Pi UX shell, not a chatbot)
**Researched:** 2026-06-25
**Confidence:** HIGH (competitive landscape + technical feasibility both cross-checked against primary sources)

## Feature Landscape

### Table Stakes (Users Expect These)

Without these, the tool is either useless (no read surface) or untrustworthy (no patch/diff). Most are explicitly enumerated as Active Requirements in `PROJECT.md` and as hard rules in `docs/seed.md`.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live context export (`bw-focus export`, `bw-project summary`, `bw-project region`) | The entire premise is "reliably understand and describe the selected Bitwig context." No export → no assistant. | MEDIUM | Requires Java `.bwextension` bridge running, selection/transport/track/clip mirror, JSON Lines over localhost. DrivenByMoss (763★) and WigAI both prove this surface is reachable via the official Bitwig API. |
| Normalized composition-state model (raw → derived → intent) | Reasoning needs a stable shape; raw Bitwig objects drift between versions. Normalization is the contract that lets analyzers/transforms be written once. | MEDIUM | Disk-backed cache; schema-validated (`schemas/project-state.schema.json`). Single source of truth for all CLI commands. |
| Stable CLI with predictable JSON I/O | PROJECT.md's central decision: "the stable interface is the CLI, not the agent." Pi is the best UX but any agent/shell must drive the same commands. | LOW | 8 commands (`bw-focus`, `bw-project`, `bw-device`, `bw-midi`, `bw-arrange`, `bw-automation`, `bw-edit`, `bw-diff`). Compact JSON, clear failures, no prose unless `--explain`. |
| Patch object schema (`scope → operations → rationale → reversibility → risk`) | "No edit without a patch object" is a hard rule. Without this, every later feature (transforms, automation, arrangement edits) is undefined. | MEDIUM | Typed operations (`midi_velocity_scale`, `insert_notes`, `automation_set_curve`, `section_duplicate`, …). Schema at `schemas/patch.schema.json`. |
| Preview-before-apply flow (`bw-edit preview` + `bw-diff`) | "No patch without preview unless forced." This is the trust baseline — the producer must see what will change before it changes. | MEDIUM | Diff must surface notes added/removed/changed, automation targets touched, scope (track/clip/region). |
| Undo label on every applied patch | Bitwig native undo is the safety net. bw-brain must label every operation so the user can roll back in Bitwig's own history without losing track of what happened. | LOW | `undoLabel` mandatory field in `apply.patch` request. |
| Risk class gating (low / medium / high) | "Only low-risk edits should be one-step." Medium/high require explicit confirmation. Without this, an ambitious suggestion could wreck the song in one keystroke. | LOW | Classification rule table in `docs/seed.md`. Enforced in `bw-edit apply`. |
| Project memory: track roles + project intent + accepted/rejected patterns + motif identities | "Keeps the assistant from ruining the song." Durable, project-local `.bw-brain/`. Without this, every session starts from scratch and the assistant re-suggests things the producer already rejected. | MEDIUM | Files: `state-cache.json`, `intent.json`, `roles.json`, `patch-history.jsonl`. Append-only patch history. |
| MIDI inspection (`bw-midi inspect --selected`) | Minimum read surface. Notes, velocity, timing, length, channel, per-clip. Without this, no transform can be reasoned about. | LOW | Reads from normalized state, not directly from bridge on every call. |
| Device inspection (`bw-device inspect --selected`) | Minimum read surface for sound-design help. Chain, devices, exposed parameters, current values. | LOW | Same source as above. |
| Suggestion assumption statements | "Every suggestion states assumptions." A suggestion without stated assumptions is just "casino MIDI" — the producer cannot judge it. | LOW | Enforced in transform/suggestion output shape (assumptions[] field). |
| `--explain` opt-in prose mode | CLI default is compact JSON; prose is opt-in. Prevents the CLI from becoming a chatbot. | LOW | Flag on every command. |

### Differentiators (Competitive Advantage)

These are where bw-brain competes. None of the surveyed commercial plugins (LANDR Composer / Scaler 3 / Captain Plugins Epic) or community Bitwig extensions (WigAI, BitwigBuddy, openwig, DrivenByMoss) combine analysis of existing material + durable memory + reversible patching + local-first copilot. WigAI is the closest and it is a dumb MCP control surface (transport, device params, clip/scene launch) with **no analysis, no patch model, no memory, no risk gating**.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Motif identity preservation across all transforms | "Every transform has a preserve-motif-identity mode." Without this, variation/counterline tools degrade into random generation. This is the "accurate first" stance made operational. | HIGH | Requires motif signature (pitch-class + rhythm quantization, e.g. `pc[2,5,9]-rhythm[a8,a8,q]`), matching across bars, and per-transform constraint solver. Backed by chroma/rhythm features (librosa.segment concepts). |
| Subtle MIDI variation generator (`bw-midi vary --mode subtle`) | Producer wants A/B/C variants of an existing phrase that *still sound like the same phrase*. Every competitor generates from scratch; bw-brain varies existing material. | HIGH | Depends on motif signature + preserve-motif mode. Emits patch candidates, never edits directly. |
| Counterline generation (`bw-midi counterline --density low`) | Companion voice for an existing lead/bass that respects harmonic center and motif identity. Differentiator because it works *on* existing material, not from a chord pack. | HIGH | Constraint-based; depends on key detection + motif preservation. |
| Voice-leading cleanup (`bw-midi voice-leading-fix`) | "Boringly good at cleanup" — fix parallel fifths, resolve leading tones, tighten spacing. No competitor offers this as a reversible patch on existing MIDI. | MEDIUM | music21-style rules, ported to daemon. Low risk class → one-step ok. |
| Velocity/timing humanization (low-risk) | Un-quantize, swing, accent patterns, micro-timing. Captain Plugins and Mixed-In-Key "Human Plugins" do this on their own generated material; bw-brain does it on the producer's existing clips as a previewable patch. | LOW | Low risk class. First transform users will trust. |
| Section detection (`bw-arrange sections`) | Bottom-up temporal segmentation of the project (intro/build/drop/breakdown/outro) with confidence. librosa.segment.agglomerative is the algorithmic basis; bw-brain adapts to MIDI/state rather than audio. | HIGH | Requires derived-state energy + density features per bar. Confidence scores attached. |
| Repetition report (`bw-arrange repetition-report`) | Self-similarity matrix over the arrangement; surfaces where the same material recurs and where it does not. Producer-visible "is this section repeating too much / too little." | MEDIUM | Built on librosa.segment.recurrence_matrix concept, applied to MIDI motifs + bar features. |
| Energy curve analysis (`bw-arrange energy-curve`) | Per-bar energy (density × velocity × active-track count × spectral proxy). The backbone of "is this build actually building." | MEDIUM | Derived-state feature; sparkline in TUI arrangement pane. |
| Transition suggestions | Detect energy mismatches and repetition gaps between sections; propose small reversible edits (fill, riser automation, filter sweep) to smooth transitions. | HIGH | Depends on section detection + energy curve + repetition report. |
| Automation salience (`bw-automation inspect` derived) | Per track: which parameters are most expressive (variance × range × modulation rate). Tells the producer "your filter cutoff is doing all the work on this lead." | HIGH | Statistical analysis of automation envelopes across the project. |
| Macro exposure proposals (`bw-device macros-suggest`) | Propose which parameters deserve a macro knob / XY pad assignment, ranked by salience. BitwigBuddy does macros but not from analysis; bw-brain proposes *from observed expressiveness*. | MEDIUM | Consumes automation salience output. Patch-emitting, not direct-mutating. |
| Bounded automation generation (`bw-automation propose`) | Generate a filter/level/pitch automation curve on a selected parameter within a selected region, bounded by genre profile + intent. Always a patch, always previewable. | HIGH | Depends on automation salience + intent state + genre profile. Medium risk → confirm required. |
| Track-role classification (with confidence) | kick / bass / lead / pad / fx / hats / percussion, with confidence. Generic core + swappable genre profiles (electronic/techno first). | MEDIUM | Feature-based (note density, register, rhythmic role) + memory override. Stored in `roles.json`. |
| Genre-pluggable profiles with generic reasoning core | Architectural differentiator. Avoids hard-coding genre assumptions; profiles supply heuristics (acceptable velocity ranges, motif preservation strength, transition idioms). | HIGH | Profile interface contract; electronic/techno is v1 profile, not the architecture. |
| Durable vs ephemeral memory split | Project-local `.bw-brain/` (durable musical identity) vs Pi session memory (current experiment thread, candidate patches). Lets the producer try ideas without contaminating the project. | MEDIUM | OpenClaw session model is the reference for ephemeral side; project-local files for durable side. |
| TUI panes: state / diff / arrangement / device | Pi extensions can render custom terminal components. Visual enough to be useful: state pane (selected + section), diff pane (notes/automation touched), arrangement pane (section timeline + energy sparkline), device pane (chain + macro opportunities). | MEDIUM | Pi/OpenClaw TUI support confirmed in seed.md; first-class UX is in scope from M1. |
| Suggest-next-edits triage skill | Ranks highest-leverage reversible edits for current context. Not "do this for me" but "here are 3 small things worth trying, in priority order." | MEDIUM | Composite skill: consumes analysis outputs, ranks by impact × reversibility. |
| Risk-gated apply flow with explicit confirmation for medium/high | Most assistants either block everything or do everything. bw-brain's three-class system makes low-risk frictionless and high-risk deliberately slow. | LOW | Already a hard rule; the implementation is the differentiator. |
| Analyze-current skill (what's working / what's weak / next actions) | The flagship Pi skill. Reads selection, section context, intent. Produces critique + 2–4 next actions. | MEDIUM | Composite: derived state + intent + analysis. Output shape enforced. |
| Patch-history JSONL (audit trail) | Every applied patch is appended. Producer can see what was tried, when, with what rationale. Enables "undo this kind of edit" later. | LOW | Append-only log in `.bw-brain/patch-history.jsonl`. |

### Anti-Features (Commonly Requested, Often Problematic)

These are deliberate non-goals. Documenting them prevents scope creep and protects the trust model.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Background auto-edits (heuristic edits without explicit user action) | "It would be cool if it just fixed things while I work." | Destroys the trust model. The producer can no longer tell which changes are theirs. A single bad heuristic wrecks the song silently. | All edits go through patch objects with preview + undo label. The assistant proposes; the producer disposes. |
| Cloud dependency / remote model calls | "Use GPT/Claude for the musical reasoning." | Violates local-first defining constraint. Latency, privacy, offline-work breaks. Drift between runs. | Local daemon + TS analyzers. Optional local model later, never remote. |
| MCP (Model Context Protocol) integration | "MCP is the standard now, WigAI uses it." | WigAI proves it is *possible* but MCP is a large tool registry that fights the "small toolbelt, bash-and-code-are-composable" stance. Makes the contract less inspectable. | Thin JSON-Lines bridge over localhost. CLI is the stable contract. |
| Direct mutation without patch object | "Just write the notes, why the ceremony." | No preview, no undo label, no risk class, no audit trail. One bad call = wrecked song. | Patch → preview → apply → undo-labelled. Always. |
| Genre-specific hard-coding | "Just bake in techno assumptions." | Couples the architecture to one genre; future profiles become forks; reasoning core becomes unmaintainable. | Generic core + pluggable genre profiles. Electronic/techno is profile v1. |
| Heavy musical reasoning inside the Bitwig bridge | "Why have a separate daemon?" | Bitwig runs the bridge in-process; heavy work stalls the audio engine. Bridge crashes take down Bitwig. | Bridge stays dumb (mirror + edit primitives + events). Reasoning lives in TS daemon. |
| Generative "casino MIDI" (random generation without motif preservation) | "Surprise me." | Before accuracy works, creativity is just noise (seed.md: "casino MIDI"). Pollutes the session with unmemorable material. | Every creative transform runs in preserve-motif-identity mode by default. |
| Auto-mastering / audio processing | "LANDR does it." | Out of scope. bw-brain is MIDI/state/automation intelligence, not audio DSP. Scope creep kills focus. | Producer uses LANDR/Ozone separately. bw-brain exports clean state for handoff if useful. |
| Stem separation / audio-MIR | "Moises/RipX do stem separation." | bw-brain's MIR is on MIDI + composition state, not rendered audio. Audio MIR is a different product. | If ever needed: optional renderer hook that exports audio for an external tool, never in core. |
| Mobile/web client | "I want to check on my phone." | Terminal-first is the stance. A web client doubles the surface area and breaks local-first. | CLI + Pi TUI. SSH from anywhere if remote access is needed. |
| Real-time / always-listening mode | "React to every note I play." | Constant analysis burns CPU, fights the audio engine, and produces a stream of low-value suggestions. | On-demand via slash command / CLI call. Cached derived state refreshes on save or explicit `bw-project refresh`. |
| Multi-track mutation without explicit scope | "Just rebalance the whole mix." | Unbounded scope = unbounded risk. Breaks the patch model. | Every patch declares scope (`trackIds`, `clipIds`, `region`). Multi-track = high risk = explicit confirm. |
| Patch without preview unless forced | "Just apply it, I trust you." | Trust is earned, not assumed. A forced apply with no preview is the failure mode the whole architecture exists to prevent. | `--force` flag exists for the rare case; default is always preview. |
| Chatbot / conversational prose interface | "Make it talk." | PROJECT.md's first line of defense: "not a chatbot feature." Prose obscures state. The producer needs diffs, not dialogue. | Pi skills emit structured output; `--explain` is opt-in. |

## Feature Dependencies

```
[Java .bwextension bridge]
    └──requires──> [localhost JSON-Lines protocol]
    └──requires──> [Raw project state model]
                       └──requires──> [Normalized composition-state model]
                                          ├──enables──> [Derived state: sections, trackRoles, motifs, energyCurve, automationSalience]
                                          │                 ├──enables──> [Section detection]
                                          │                 │                 ├──enables──> [Repetition report]
                                          │                 │                 ├──enables──> [Energy curve]
                                          │                 │                 └──requires──> [Transition suggestions]  (needs all three)
                                          │                 ├──enables──> [Track-role classification]
                                          │                 │                 └──enables──> [Automation salience]
                                          │                 │                                      └──enables──> [Macro exposure proposals]
                                          │                 │                                      └──enables──> [Bounded automation generation]
                                          │                 └──enables──> [Motif signature + identity]
                                          │                                      └──requires──> [Preserve-motif-identity mode]
                                          │                                      └──enables──> [Subtle variation]
                                          │                                      └──enables──> [Counterline generation]
                                          │                                      └──enables──> [Voice-leading cleanup] (loosely)
                                          ├──enables──> [Intent state]  (projectIntent: summary, constraints, targets)
                                          │                 └──enhances──> [every transform and suggestion]
                                          └──enables──> [Patch object schema]
                                                          ├──requires──> [Preview flow]
                                                          │          └──requires──> [Diff view]
                                                          │                      └──requires──> [Apply with undo label]
                                                          │                                  └──requires──> [Risk class gating]
                                                          └──enables──> [Patch-history JSONL]

[Stable CLI surface] ──requires──> [Normalized composition-state model + Patch schema]
[Project memory store] ──requires──> [.bw-brain/ files: state-cache, intent, roles, patch-history]
[Genre profiles] ──enhances──> [Derived state analyzers + transforms]
[Pi package: skills + slash + TUI] ──requires──> [Stable CLI surface]
[Suggest-next-edits] ──requires──> [all analysis outputs + intent]
[Analyze-current] ──requires──> [Derived state + Intent + section context]

[Ephemeral session memory] ──complements──> [Project memory store]  (never contaminates durable)
```

### Dependency Notes

- **All transforms require the patch schema first.** Variation, counterline, voice-leading, automation generation, section duplication — none can ship before `scope → operations → rationale → reversibility → risk` is defined, because they all emit patch candidates. This is why M2 (patching) must precede M3 (arrangement) and M4 (automation).
- **Motif signature is the keystone of the "accurate first" stance.** Without it, every creative transform is casino MIDI. It gates variation/counterline/voice-leading and informs repetition report.
- **Section detection must precede transition suggestions.** You cannot suggest transitions without sections, and you cannot rank them without energy curve + repetition report. M3 ordering is internal: sections → repetition → energy → transitions.
- **Track-role classification gates automation salience.** You can only meaningfully propose macro exposure and bounded automation after you know which track is a lead vs a pad.
- **Genre profiles enhance, never gate.** The reasoning core runs without a profile (defaults to "generic electronic"); a profile tightens heuristics. This keeps the architecture composable and avoids hard-coded genre forks.
- **Bridge stability gates everything.** If the bridge cannot reliably export selection + clips + devices + parameters, the entire downstream stack is built on sand. M1 exists primarily to de-risk this.
- **Ephemeral session memory must never write to durable store.** Trying ideas contaminates project identity. The split is a hard architectural boundary, not a convenience.
- **Preview/diff/apply is a strict pipeline.** Skipping preview (except via explicit `--force`) breaks the trust model. The pipeline is one feature with stages, not three independent features.

## MVP Definition

### Launch With (v1) — M1: bridge + read-only context

Validates the foundation: can the assistant *accurately describe* what is selected?

- [ ] Java `.bwextension` bridge — selection/transport/tracks/clips/devices/params mirror, JSON-Lines over localhost
- [ ] Local TS daemon — ingests snapshots, normalizes into composition-state model, disk-backed cache
- [ ] `bw-focus export` — selected track/clip/device/region as JSON
- [ ] `bw-project summary` — project + transport + track list as JSON
- [ ] `bw-midi inspect --selected` — notes/velocity/timing of selected clip
- [ ] `bw-device inspect --selected` — chain + parameters of selected device
- [ ] Project memory bootstrap — `.bw-brain/state-cache.json`, `intent.json`, `roles.json`
- [ ] Pi `/analyze` skill + state pane (read-only) — first-class UX from day one
- [ ] Suggestion assumption statements enforced in output shape

**Success:** Assistant reliably describes selected clip/device/region. No editing. Session memory already useful.

### Add After Validation (v1.x) — M2: reversible MIDI patching

Once accuracy is proven, add the smallest possible *trustworthy* edit surface.

- [ ] Patch object schema + validation
- [ ] `bw-edit preview` / `bw-edit apply` / `bw-diff`
- [ ] Undo labels on every applied patch
- [ ] Risk class gating (low/medium/high)
- [ ] Motif signature + preserve-motif-identity mode
- [ ] Subtle variation, counterline, voice-leading cleanup
- [ ] Velocity/timing humanization (low-risk)
- [ ] Patch-history JSONL
- [ ] Pi `/vary` + `/apply` + diff pane

**Success:** Musically sane A/B/C variants; transparent, reversible edits.

### Add After Validation (v1.x) — M3: arrangement intelligence

Project-level critique becomes useful. Depends on M1 (state) and benefits from M2 (patches to act on critique).

- [ ] `bw-arrange sections` (bottom-up segmentation, confidence-scored)
- [ ] `bw-arrange repetition-report` (self-similarity)
- [ ] `bw-arrange energy-curve`
- [ ] Transition suggestions (energy mismatch + repetition gap)
- [ ] Pi `/review` + arrangement pane (section timeline + energy sparkline)

**Success:** Project-level critique genuinely useful.

### Future Consideration (v2+) — M4: automation & device workflows

Sound-design help, not just notes. Highest-complexity milestone; defer until M1–M3 are stable.

- [ ] `bw-automation inspect` (automation salience per track)
- [ ] `bw-device macros-suggest` (macro exposure proposals)
- [ ] `bw-automation propose` (bounded automation generation)
- [ ] Pi `/device` + device pane (chain summary + macro opportunities)
- [ ] Genre profile v2+ expansion beyond electronic/techno

**Success:** Assistant helps with sound design and movement, not just notes.

### Deferred / Out of Scope

- Cloud model integration, MCP server, mobile/web client, audio mastering, stem separation, real-time always-listening — see Anti-Features.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Live context export (bridge) | HIGH | HIGH | P1 |
| Normalized composition-state model | HIGH | MEDIUM | P1 |
| Stable CLI surface | HIGH | LOW | P1 |
| MIDI / device inspection | HIGH | LOW | P1 |
| Project memory (roles + intent) | HIGH | MEDIUM | P1 |
| Patch schema + preview/apply/diff/undo/risk | HIGH | HIGH | P1 (M2) |
| Suggestion assumption statements | HIGH | LOW | P1 |
| Pi `/analyze` + state pane | HIGH | MEDIUM | P1 |
| Motif signature + preserve-motif mode | HIGH | HIGH | P1 (M2) |
| Subtle variation / counterline / voice-leading | HIGH | HIGH | P1 (M2) |
| Velocity/timing humanization | MEDIUM | LOW | P1 (M2) |
| Section detection | HIGH | HIGH | P2 (M3) |
| Repetition report | MEDIUM | MEDIUM | P2 (M3) |
| Energy curve | MEDIUM | MEDIUM | P2 (M3) |
| Transition suggestions | HIGH | HIGH | P2 (M3) |
| Pi `/review` + arrangement pane | HIGH | MEDIUM | P2 (M3) |
| Track-role classification | HIGH | MEDIUM | P2 (M3) |
| Automation salience | MEDIUM | HIGH | P3 (M4) |
| Macro exposure proposals | MEDIUM | MEDIUM | P3 (M4) |
| Bounded automation generation | HIGH | HIGH | P3 (M4) |
| Pi `/device` + device pane | MEDIUM | MEDIUM | P3 (M4) |
| Genre-pluggable profiles | MEDIUM | HIGH | P3 (architecture early, profiles expand M2+) |
| Suggest-next-edits triage | MEDIUM | MEDIUM | P2 (composite, after analysis exists) |
| TUI diff / arrangement / device panes | MEDIUM | MEDIUM | P1 (diff) / P2 (arrangement) / P3 (device) |
| Patch-history JSONL audit trail | LOW | LOW | P1 (M2) |

**Priority key:**
- P1: Must have for launch (M1 or M2)
- P2: Should have, add when M1/M2 validated (M3)
- P3: Nice to have / highest complexity, defer until foundation stable (M4+)

## Competitor Feature Analysis

| Feature | LANDR Composer (was Orb Producer) | Scaler 3 | Captain Plugins Epic | WigAI (Bitwig ext) | bw-brain (our plan) |
|---------|-----------------------------------|----------|----------------------|--------------------|---------------------|
| **Integration model** | Plugin-in-DAW (VST/AU/AAX) | Plugin-in-DAW | Plugin-in-DAW (5 connected plugins) | Java `.bwextension` + MCP server | Java `.bwextension` bridge + TS daemon + CLI + Pi shell |
| **Local-first** | Yes (plugin) | Yes (plugin) | Yes (plugin) | Yes (localhost MCP) | Yes (no cloud, no MCP, thin JSON-Lines) |
| **Stable CLI contract** | No (GUI only) | No (GUI only) | No (GUI only) | No (MCP only) | Yes (8 commands, JSON I/O) |
| **Analysis of *existing* material** | No (generation only) | Partial (Scaler Detector detects key/chords from audio/MIDI) | No (generation only) | No (control only) | Yes (sections, repetition, energy, motifs, roles, automation salience) |
| **MIDI generation target** | Chords, bass, melody, arp (from scratch) | Chord progressions, melody, voice leading (from scratch) | Chords, melody, bass, drums (from scratch) | None | Variation/counterline/voice-leading on *existing* clips, motif-preserving |
| **Patch / diff / preview / apply** | Drag-and-drop MIDI only | Drag-and-drop MIDI only | Drag-and-drop MIDI + audio render | Direct mutation (no patch) | Patch object → preview → diff → apply → undo label |
| **Risk class gating** | No | No | No | No | Yes (low/medium/high) |
| **Project memory (durable)** | No | Presets only | Presets only | No | Yes (`.bw-brain/`: roles, intent, accepted/rejected, motifs) |
| **Ephemeral session memory** | No | No | No | No (stateless) | Yes (Pi session, never contaminates durable) |
| **Genre-pluggable architecture** | No (preset categories) | No (scale/mode library) | No (genre preset filters) | No | Yes (generic core + profiles) |
| **Humanization** | Yes (polyphony, humanization modifiers) | No | Yes (Space/Strum/Swing) | No | Yes (velocity/timing, low-risk patch) |
| **Macro / automation proposals** | No | No | No | No | Yes (automation salience + macro exposure) |
| **Arrangement intelligence** | Scenes + song mode (manual) | No | Workspaces (manual verse/chorus) | No | Section detection, repetition report, energy curve, transition suggestions |
| **TUI / state visualization** | Plugin GUI | Plugin GUI | Plugin GUI | None | Pi TUI panes (state/diff/arrangement/device) |
| **Trust model** | Producer edits in plugin, drags out | Same | Same | AI sends text commands → Bitwig mutates | Patch-first, preview mandatory, every suggestion states assumptions |
| **Active maintenance (2026)** | Yes (LANDR) | Yes (Scaler 3 just shipped) | Yes (Epic 7) | Yes (v0.10.1 Aug 2025) | Greenfield |

**Net positioning:** bw-brain occupies an unoccupied cell — *local-first, analysis-of-existing-material, patch-first, memory-aware, CLI-stable copilot for Bitwig specifically*. Every competitor is either (a) a generation plugin with no memory/patching, (b) a cloud SaaS, or (c) a dumb control surface (WigAI). None combine all five axes.

## Sources

- **Scaler Music** (scalermusic.com, primary) — Scaler 3 feature surface: chord progression workstation, scale/key detection (Scaler Detector), voice leading, melody suggestion, Carbon Electra 2 synthesis. Confidence: HIGH. Fetched 2026-06-25.
- **Mixed In Key / Captain Plugins Epic** (mixedinkey.com/captain-plugins, primary) — 5 connected plugins (Chords/Melody/Deep/Beat/Play), workspaces for song sections, humanize (Space/Strum/Swing), Roman numeral genre filtering, MIDI drag-and-drop, Phase Plant presets. Confidence: HIGH. Fetched 2026-06-25.
- **LANDR Composer** (landr.com/plugins/landr-composer, primary) — formerly Orb Producer Suite; AI chord progression generator, smart MIDI for chords/bass/melodies/arp, humanization modifiers, scenes + song mode, preset sounds, DAW sync. Confirms Orb → LANDR acquisition. Confidence: HIGH. Fetched 2026-06-25.
- **WigAI** (github.com/fabb/WigAI, primary) — Java `.bwextension` + MCP server, v0.10.1 Aug 2025, 41★. Features: transport control, device parameter control, clip/scene launching. No analysis, no patch/diff, no memory, no risk gating. The only direct "AI + Bitwig extension" competitor. Confidence: HIGH. Fetched 2026-06-25.
- **DrivenByMoss** (github.com/git-moss/DrivenByMoss, primary) — 763★, 159 releases, current for Bitwig 5.3+ (Jun 2026). Canonical reference for what the Bitwig Java extension API exposes: transport, tracks, clips, scenes, cursor track/clip/device, parameters, automation, MIDI I/O, OSC. Confidence: HIGH. Fetched 2026-06-25.
- **Bitwig Controller Scripting / Extension install docs** (bitwig.com/support, primary) — confirms `.js` controller scripts and `.bwextension` Java files as the two extension paths, install locations per OS. Confidence: HIGH. Fetched 2026-06-25.
- **Bitwig community GitHub topic** (github.com/topics/bitwig, primary) — survey of 77 repos: BitwigBuddy (drums+velocity+macros, Java), openwig (Python algorithmic composition), bitwig-randomizer, taktil (TS control-surface framework), LibreArp (pattern arp VST). None combine analysis + memory + reversible patching. Confidence: HIGH. Fetched 2026-06-25.
- **librosa.segment** (librosa.org/doc/0.11.0/segment, primary) — `recurrence_matrix`, `cross_similarity`, `agglomerative`, `subsegment`, `path_enhance`. Algorithmic basis for section detection, repetition report, energy curve. Confidence: HIGH. Fetched 2026-06-25.
- **PROJECT.md + docs/seed.md** (project-local, primary) — bw-brain's own stance: "accurate first, creative later"; patch-first; CLI-stable; local-first; no MCP; genre-pluggable; durable vs ephemeral memory; risk classes. Confidence: HIGH (authoritative for product intent).
- **OpenClaw session docs + Pi layer writeups** (referenced in seed.md) — ephemeral session memory model (transcript + metadata, explicit compaction). Confidence: MEDIUM (secondary, via seed.md citations).

---
*Feature research for: local-first DAW-intelligence layer / Bitwig copilot runtime*
*Researched: 2026-06-25*
