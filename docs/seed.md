> **Historical seed — classification note (added 2026-08-20).** This document is the original pre-CLAP project seed, kept for provenance only. Its UX wording (Pi package / TUI panes as the product surface) and its version/ecosystem wording predate the CLAP-first product rebaseline accepted 2026-08-20 after Phase 04.2 live verification: the hosted CLAP editor inside Bitwig is the primary producer surface, Pi 0.84.0 is the daemon-managed headless reasoning runtime, and the CLI is the stable secondary contract. The body below is unmodified history — see `CONTEXT.md` and `docs/adr/` for the current product truth.

Good. Then let’s make it concrete.

What you want is not a chatbot feature. It’s a **local Bitwig intelligence layer** with a Pi-native shell on top. Pi is a good fit here because it is intentionally small, extension-oriented, and comfortable with session persistence, skills, slash commands, and custom terminal UI, while OpenClaw’s current runtime and docs show Pi already sits in a broader CLI/session architecture rather than a giant monolith. ([Armin Ronacher's Thoughts and Writings][1])

Bitwig is also a solid substrate for this because it has an open controller extension API, an official public extensions repo, and Bitwig’s docs still point developers to in-app “Developer Resources” for the scripting guide and API reference. ([www.bitwig.com][2])

## The build target

Build a project called something like:

**bw-brain**
*A local-first Bitwig copilot runtime driven by CLI tools, with a Pi package as the primary UX.*

The core principle:

**The stable interface is the CLI, not the agent.**
Pi gets the best UX. Other coding agents can still use the same commands, files, and docs. That matches the “bash and code are composable” argument against overusing MCP, and it also matches Pi’s extension-heavy philosophy. ([Mario Zechner][3])

---

## System architecture

### 1) Bitwig bridge

A Java `.bwextension` running inside Bitwig.

Responsibilities:

* observe project state
* observe selection/focus/transport changes
* expose a narrow edit surface
* publish snapshots/events to a local bridge
* apply edits in small, undo-safe units

Why Java extension first:

* sturdier long-running bridge than a quick script
* fits Bitwig’s official extension path
* you can still prototype with JS if needed, then harden in Java later ([www.bitwig.com][4])

### 2) Local daemon

A local process outside Bitwig, probably TypeScript first.

Responsibilities:

* receive snapshots/events from Bitwig
* normalize them into a composition-state model
* maintain disk-backed cache
* run analyzers and transforms
* serve CLI commands
* emit patch proposals and diffs

### 3) CLI surface

A set of small commands with predictable JSON I/O.

Responsibilities:

* export context
* inspect selected clip/device/region
* analyze structure/motifs/automation
* generate reversible transforms
* preview/apply diffs

This is the stable automation contract that Pi, Claude Code, OpenCode, or plain shell scripts can all use. That is exactly the “small toolbelt” advantage Mario argues for over large tool registries. ([Mario Zechner][3])

### 4) Pi package

This is your first-class UX.

Responsibilities:

* slash commands
* skill docs/instructions
* session memory helpers
* TUI views for state, diffs, and previews
* workflow composition

Pi extensions can render custom TUI components and persist state, which is ideal for surfacing arrangement summaries, edit previews, and track-role annotations. ([Armin Ronacher's Thoughts and Writings][1])

---

## Repo layout

```text
bw-brain/
  README.md

  bitwig-bridge/
    extension/
      src/main/java/...
      pom.xml
    protocol/
      messages.md
      schema/

  daemon/
    src/
      ingest/
      state/
      analysis/
      transforms/
      patch/
      cli/
    package.json

  schemas/
    project-state.schema.json
    selected-clip.schema.json
    patch.schema.json
    diff.schema.json
    role-map.schema.json
    intent.schema.json

  cli/
    bin/
      bw-focus
      bw-project
      bw-device
      bw-midi
      bw-arrange
      bw-automation
      bw-edit
      bw-diff

  pi-package/
    skills/
      analyze-current.md
      suggest-next-edits.md
      inspect-device.md
      review-arrangement.md
      vary-midi.md
      apply-patch.md
    slash/
      analyze.ts
      suggest.ts
      apply.ts
      roles.ts
      energy.ts
    tui/
      state-pane.tsx
      diff-pane.tsx
      arrangement-pane.tsx
      clip-pane.tsx
    package.json

  examples/
    sample-state/
    sample-patches/
    prompt-recipes/

  docs/
    architecture.md
    command-contracts.md
    guardrails.md
    mvp-plan.md
```

---

## The data model

This is the heart of it. If this layer is weak, the whole thing becomes “LLM flailing at a DAW.”

### A. Raw project state

This is as close to Bitwig as possible.

```json
{
  "project": {
    "name": "track_17",
    "tempo": 128,
    "timeSignature": "4/4",
    "keySignature": "D minor",
    "transport": {
      "playing": false,
      "positionBeats": 129.0,
      "loop": { "enabled": true, "start": 128.0, "length": 32.0 }
    }
  },
  "selection": {
    "trackId": "trk_5",
    "clipId": "clip_19",
    "deviceId": "dev_2",
    "region": { "start": 128.0, "end": 160.0 }
  },
  "tracks": [],
  "clips": [],
  "devices": [],
  "automation": []
}
```

### B. Derived composition state

This is where musical reasoning starts.

```json
{
  "sections": [
    { "id": "sec_a", "label": "build", "start": 96.0, "end": 128.0, "confidence": 0.74 },
    { "id": "sec_b", "label": "drop", "start": 128.0, "end": 160.0, "confidence": 0.88 }
  ],
  "trackRoles": [
    { "trackId": "trk_1", "role": "kick", "confidence": 0.97 },
    { "trackId": "trk_5", "role": "lead", "confidence": 0.71 }
  ],
  "motifs": [
    { "id": "motif_3", "trackId": "trk_5", "bars": [33, 34], "signature": "pc[2,5,9]-rhythm[a8,a8,q]" }
  ],
  "energyCurve": [
    { "bar": 33, "value": 0.61 },
    { "bar": 34, "value": 0.63 }
  ],
  "automationSalience": [
    { "trackId": "trk_5", "parameter": "filter_cutoff", "value": 0.81 }
  ]
}
```

### C. Intent state

This is what keeps the assistant from ruining the song.

```json
{
  "projectIntent": {
    "summary": "Hypnotic melodic techno tool with patient tension growth.",
    "constraints": [
      "Keep bass motif identity intact",
      "No extra harmonic complexity in first drop",
      "Avoid over-busy hats"
    ],
    "targets": [
      "Second drop should feel wider",
      "Transition into breakdown needs more anticipation"
    ]
  }
}
```

### D. Patch and diff model

Never let the assistant mutate directly without a patch object.

```json
{
  "patchId": "patch_2026_03_14_001",
  "scope": {
    "trackIds": ["trk_5"],
    "clipIds": ["clip_19"]
  },
  "operations": [
    {
      "type": "midi_velocity_scale",
      "target": "clip_19",
      "range": { "startBeat": 0, "endBeat": 8 },
      "amount": 0.12
    },
    {
      "type": "insert_notes",
      "target": "clip_19",
      "notes": [
        { "pitch": 74, "start": 7.5, "length": 0.25, "velocity": 92 }
      ]
    }
  ],
  "rationale": "Add a mild answer phrase at the end of the 8-bar unit without changing harmonic center.",
  "reversible": true
}
```

---

## Command set for MVP

Keep v1 tiny.

### Context export

```bash
bw-focus export --json
bw-project summary --json
bw-project region --start 128 --end 160 --json
```

### Device inspection

```bash
bw-device inspect --selected --json
bw-device macros-suggest --selected --json
```

### MIDI inspection and transforms

```bash
bw-midi inspect --selected --json
bw-midi vary --selected --mode subtle --json
bw-midi counterline --selected --density low --json
bw-midi voice-leading-fix --selected --json
```

### Arrangement analysis

```bash
bw-arrange sections --json
bw-arrange repetition-report --json
bw-arrange energy-curve --json
```

### Automation support

```bash
bw-automation inspect --region 128:160 --json
bw-automation propose --target selected-device:param/filter_cutoff --json
```

### Edit pipeline

```bash
bw-edit preview patch.json
bw-edit apply patch.json
bw-diff state-before.json state-after.json
```

Each command should:

* read from live daemon state or explicit JSON file
* emit compact JSON
* fail clearly
* avoid prose unless `--explain` is set

---

## Bitwig bridge responsibilities

Keep the bridge dumb. That’s important.

### The bridge should do

* mirror live selection
* mirror tracks/clips/devices/params that you care about
* expose edit primitives
* label operations for undo
* emit change events
* provide stable IDs per observed object where possible

### The bridge should not do

* heavy musical reasoning
* model inference
* long-term project memory
* huge text generation
* policy decisions about “what is a good arrangement”

That belongs in the daemon and Pi layer.

---

## Proposed local protocol

No MCP. Just a thin bridge.

Use newline-delimited JSON over localhost socket or stdio relay.

### Event example

```json
{
  "type": "selection.changed",
  "timestamp": 1773501001,
  "payload": {
    "trackId": "trk_5",
    "clipId": "clip_19",
    "deviceId": "dev_2"
  }
}
```

### Request example

```json
{
  "id": "req_91",
  "type": "get.selected_clip"
}
```

### Response example

```json
{
  "id": "req_91",
  "ok": true,
  "payload": {
    "clipId": "clip_19",
    "notes": [...]
  }
}
```

### Edit request example

```json
{
  "id": "req_92",
  "type": "apply.patch",
  "payload": {
    "undoLabel": "bw-brain: subtle variation",
    "operations": [...]
  }
}
```

---

## Pi package design

This is the part that should feel good to use.

Pi’s current shape is good for this because Pi/OpenClaw already operate with sessions, CLI/runtime surfaces, and extension/skill concepts, while Pi specifically is presented as a layered toolkit with sessions, tools, extensibility, and TUI support. ([GitHub][5])

### First six skills

**1. analyze-current**
Reads current selection, section context, and intent. Produces:

* what this thing is doing
* what is working
* what is weak
* 2–4 next actions

**2. inspect-device**
For current device chain:

* explain chain
* identify exposed vs hidden control opportunities
* propose macro map ideas
* propose automation targets

**3. vary-midi**
For current clip:

* preserve motif identity
* create 3 constrained variants
* output patch candidates, not direct edits

**4. review-arrangement**
For current region/project:

* repetition report
* contrast opportunities
* transition opportunities
* energy mismatch notes

**5. suggest-next-edits**
A triage skill:

* ranks highest-leverage reversible edits
* keeps suggestions small and musically legible

**6. apply-patch**
Takes a proposed patch:

* runs preview
* shows diff pane
* asks for execution only if risk level exceeds threshold

### First slash commands

* `/analyze`
* `/device`
* `/vary`
* `/review`
* `/apply`
* `/roles`
* `/intent`

### TUI panes

Pi extensions can render custom terminal components, so make this visual enough to be useful: ([Armin Ronacher's Thoughts and Writings][1])

* **State pane**: selected track/clip/device + section label
* **Diff pane**: notes added/removed/changed, automation targets touched
* **Arrangement pane**: section timeline + energy sparkline
* **Device pane**: chain summary + exposed macro opportunities

---

## Guardrails

This system lives or dies on trust.

### Hard rules

* no background edits
* no multi-track mutation unless explicitly scoped
* no edit without patch object
* no patch without preview unless user forces it
* every applied patch gets an undo label
* every suggestion states assumptions
* every transform has a “preserve motif identity” mode

### Risk classes

* **low**: velocity/timing humanization, note-length cleanup, macro suggestions
* **medium**: add/remove a few notes, automation curves on selected parameter, section duplication
* **high**: reharmonization, broad arrangement edits, multi-track transforms

Only low-risk edits should be one-step.

---

## How session memory should work

OpenClaw’s session docs show the general model is transcript + session metadata, with compaction and persistence handled explicitly. That’s useful here because musical-assistant memory should be deliberate, not accidental. ([OpenClaw][6])

You want two memory classes:

### Durable project memory

Stored in project-local files:

* track roles
* project intent
* accepted/rejected ideas
* motif identities
* recurring constraints

Example:

```json
{
  "projectId": "track_17",
  "acceptedPatterns": [
    "8-bar lead answer phrase ending on scale degree 5",
    "filter opening over last 4 bars before drop"
  ],
  "rejectedPatterns": [
    "busy snare fills every 2 bars",
    "extra chord tones in bass"
  ]
}
```

### Ephemeral session memory

Stored in Pi session flow:

* current experiment thread
* last analyses
* candidate patches
* branch summaries

This lets you try ideas without contaminating the project’s durable musical identity.

---

## MVP build plan

### Milestone 1: bridge + read-only context

Ship:

* Bitwig extension
* daemon
* `bw-focus export`
* `bw-midi inspect`
* `bw-device inspect`
* `bw-project summary`
* Pi `/analyze`

Success means:

* assistant can reliably describe selected clip/device/region
* no editing yet
* session memory already useful

### Milestone 2: reversible MIDI patching

Ship:

* patch schema
* preview/diff/apply flow
* subtle variation tool
* counterline generation
* voice-leading cleanup
* Pi `/vary` and `/apply`

Success means:

* assistant can produce musically sane A/B/C variants
* edits are transparent and reversible

### Milestone 3: arrangement intelligence

Ship:

* section detection
* repetition report
* energy curve
* transition suggestions
* Pi `/review`

Success means:

* project-level critique becomes genuinely useful

### Milestone 4: automation and device workflows

Ship:

* automation inspection
* parameter-target suggestions
* macro exposure proposals
* bounded automation generation
* Pi `/device`

Success means:

* assistant starts helping with sound design and movement, not just notes

---

## Recommended implementation choices

### Languages

* **Bitwig bridge:** Java
* **daemon + CLI + Pi package:** TypeScript

Why:

* Java matches Bitwig extension reality
* TypeScript matches Pi/OpenClaw ecosystem and likely lowers friction for the Pi package side, given Pi is described as a TypeScript toolkit layered across agent, coding-agent, and TUI packages. ([Gist][7])

### IPC

* start with localhost TCP or stdio relay
* JSON Lines
* version every message

### Storage

* project-local `.bw-brain/`
* files:

  * `state-cache.json`
  * `intent.json`
  * `roles.json`
  * `patch-history.jsonl`

---

## The first spec I would actually write

If you want a crisp starting point, write these four docs first:

### `docs/architecture.md`

* bridge
* daemon
* CLI
* Pi package
* data flow

### `docs/command-contracts.md`

For each CLI command:

* inputs
* outputs
* exit codes
* examples

### `schemas/project-state.schema.json`

A real schema for:

* project
* selection
* tracks
* clips
* devices
* automation

### `schemas/patch.schema.json`

A real schema for:

* scope
* operations
* rationale
* reversibility
* risk

That is enough to start coding without handwaving.

---

## My blunt recommendation on sequencing

Do **not** start by trying to make the assistant “creative.”

Start by making it **accurate**.

The first version should be boringly good at:

* understanding selected context
* explaining it
* producing clean diffs
* keeping memory straight
* not wrecking the project

Once that works, the creative layer becomes valuable. Before that, it’s just casino MIDI.

## Best next move

I’d make the next step a real scaffold:

* the exact JSON schemas
* the initial CLI contract
* the Pi skill markdown files
* a stubbed repo tree with placeholder implementations

I can draft that whole starter pack in one pass.

[1]: https://lucumr.pocoo.org/2026/1/31/pi/ "Pi: The Minimal Agent Within OpenClaw | Armin Ronacher's Thoughts and Writings"
[2]: https://www.bitwig.com/support/technical_support/community-controller-extensions-and-scripts-29/ "Support | Bitwig"
[3]: https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/ "What if you don't need MCP at all?"
[4]: https://www.bitwig.com/support/technical_support/how-do-i-add-a-controller-extension-or-script-17/?utm_source=chatgpt.com "How do I add a controller extension or script?"
[5]: https://github.com/openclaw/openclaw "GitHub - openclaw/openclaw: Your own personal AI assistant. Any OS. Any Platform. The lobster way.  · GitHub"
[6]: https://docs.openclaw.ai/reference/session-management-compaction "Session Management Deep Dive - OpenClaw"
[7]: https://gist.github.com/dabit3/e97dbfe71298b1df4d36542aceb5f158 "How to Build a Custom Agent Framework with PI: The Agent Stack Powering OpenClaw · GitHub"
