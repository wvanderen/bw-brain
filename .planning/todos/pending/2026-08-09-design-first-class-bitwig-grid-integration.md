---
created: 2026-08-09T18:51:24.958Z
title: Design first-class Bitwig Grid integration
area: general
files:
  - .planning/PROJECT.md:30
  - .planning/PROJECT.md:69
  - .planning/ROADMAP.md:217
---

## Problem

bw-brain's planned device and automation workflows can inspect devices, suggest macro exposure, and generate bounded automation, but they do not yet treat Bitwig's Grid as a first-class sound-design medium. The Grid could become a sound-design programming language for bw-brain: human-readable and directly editable by a producer, expressible in code, and structured enough for an agent to construct, explain, revise, and reuse.

Without a deliberate Grid representation and workflow, agent-generated patches risk being opaque piles of modules, difficult to refine manually, and unable to accumulate reusable sound-design knowledge. The integration also needs an explicit human boundary: the agent should identify parameters, balances, and perceptual decisions that require listening and manual adjustment instead of pretending those choices can be completed autonomously.

The longer-term value is compounding. Reusable Grid subgraphs ("Grid blocks") should form a macro library that grows over time and can be named, documented, searched, composed, versioned, and referenced by agents in later sound-design sessions.

## Solution

Research and design a first-class Grid layer with four connected parts:

1. Define an agent-native, human-readable Grid representation that can round-trip between code and a Bitwig Grid patch while preserving module identity, wiring, parameter values, layout intent, exposed controls, and explanatory metadata. Verify the actual Bitwig extension/API capabilities before selecting a write path; do not assume full Grid graph mutation is exposed.
2. Add an integrated sound-design skill containing proven synthesis, modulation, sequencing, audio-rate, feedback, and experimentation patterns. The skill should explain why a pattern works, propose bounded variations, and distinguish deterministic construction from exploratory listening.
3. Make human gates part of the output contract. Generated designs should explicitly call out listening checkpoints and manual-tweak targets such as gain staging, feedback thresholds, modulation depth, filter resonance, nonlinear sweet spots, stereo balance, and macro ranges.
4. Establish a persistent Grid-block library. Each block should have a stable name and version, typed inputs/outputs, parameters and safe ranges, macro mappings, assumptions, sonic intent, usage examples, dependencies, preview cues, and provenance. Agents should be able to discover and compose existing blocks before inventing new ones.

Initial spike questions:

- What Grid graph state can the current Bitwig controller-extension API inspect or mutate, and what requires a template, preset, CLAP companion, or human action?
- What textual format is readable enough for producers while remaining deterministic and diffable for agents?
- How should graph layout be separated from audio semantics so harmless visual movement does not create noisy diffs?
- Which edits can use bw-brain's preview/apply/revert trust spine, and which must remain guided manual operations?
- What is the smallest end-to-end demonstration: construct or instantiate one reusable block, expose macros, render an explanation, flag listening gates, and save it back to the library?
