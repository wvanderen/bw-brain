# Phase 5: Automation & Device Workflows (M4) - Research

**Researched:** 2026-08-22
**Domain:** Bitwig Control Surface API device/automation surface + daemon salience analytics + bounded curve generation through the verified 04.2 authority path
**Confidence:** HIGH (code-grounded: javap against `extension-api-21.jar`, in-app Javadoc 6.0.11, direct reads of every seam in DOWNSTREAM-PLAN-NOTES.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Salience evidence**
- **D-05-01:** Salience is computed from **observed live parameter movement** (bridge observers) boosted by `roles.json` + energy-curve priors. No dependency on reading existing automation envelopes — verified observer API only, honest evidence only.
- **D-05-02:** Observation scope = the **selected track's full device chain** (all devices). Per-track coverage accumulates as the producer moves between tracks. Existing drop-oldest observational backpressure absorbs event volume.
- **D-05-03:** VST/AU parameter enumeration is **bounded + ranked** via `cursorDevice.getParameter(i)` (e.g. enumerate ≤ ~128, surface top 8–16 by salience). **Native macro-modulator knobs are first-class observed targets**: the producer's own exposure (CV → macro modulator → remote-controls page chain) ranks at/near the top of salience because explicit intent beats inference. Observing remote-control page knobs (`CursorRemoteControlsPage` — verified surface for native devices) is the choke point that captures hand/hardware tweaks and CV-driven mappings; the CV source itself is unobserved. Automation proposals may target a macro knob as a single control point for everything it drives.
- **D-05-04:** Salience persists via the **04.3 snapshot + freshness pattern** (durable snapshot with visible freshness + `pulledAt`, stale-but-readable when disconnected, bounded `snapshot_invalid` refusal on corrupt data).

**Automation write gating**
- **D-05-05:** If the in-phase probe confirms writes require transport-play/record-mode, apply **refuses visibly with a named reason** (e.g. `transport_stopped`) when conditions are unmet. No queueing, no silent no-ops, no value-set-when-stopped side behavior.
- **D-05-06:** The in-phase probe **pins clip-vs-track envelope targeting per parameter type** into `docs/bitwig-capabilities.md`; parameters still ambiguous after probing are automation-**refused with a named reason** — never a guess-write.
- **D-05-07:** Revert for applied automation patches is **author-aware inverse**: bw-brain authored the exact curve written, so the frozen-inverse journal stores "remove exactly these authored points / restore prior param value". No envelope-read needed for revert (consistent with D-05-01).
- **D-05-08:** Approved automation writes execute **immediately** (subject to the transport gate) — no bar-boundary launch machinery (that discipline stays specific to D-14 live MIDI).

**Macro proposal mode**
- **D-05-09:** `macros-suggest` is **advisory only**: ranked, evidence-backed suggestions; the producer wires macros by hand exactly as today. No mutation risk; ships regardless of any probe outcome.
- **D-05-10:** Automation targeting a **macro knob = medium risk** (same class as automation on a selected param): it is ONE selected control the producer explicitly exposed; blast radius is the producer's own visible mapping choice.
- **D-05-11:** Every macro/XY suggestion carries an **evidence line**: param identity + device, expressiveness evidence (movement count, sections where it moved, role/energy context), `assumptions[]`, and **at least one alternative candidate** (SC#2 disambiguation duty).
- **D-05-12:** **XY pairs included in v1**: pair two independently expressive params onto X/Y axes (e.g. cutoff × resonance) for perform control. Advisory, same evidence format.

**Curve vocabulary & bounds**
- **D-05-13:** Fixed musically-named shape set — ramp up/down, dip-and-recover, rise-fall, slow cycle (LFO-style), hold-then-move — each parameterized by depth/rate/length. Genre profiles **bias shape choice and parameters; they never gate** (ARCH-02 discipline).
- **D-05-14:** **Fixed hard bounds enforced at patch creation**: 1 param per patch, region ≤ 16 bars, ≤ 64 authored points, single device. Bounded = checkable at schema/validation level.
- **D-05-15:** Target designation **from the salience list** (tap a ranked param → "propose automation", evidence flows into the proposal); the full bounded parameter list stays browsable as fallback for unobserved params. No proactive proposals on Analyze (D-04 quiet-start honored).
- **D-05-16:** **`get.project_meta` folds into Phase 5**: the small bridge handler (tempo/time-signature) closes the outstanding M1 gap (daemon currently defaults tempo=120) and is what bar/region math for automation curves depends on.

### the agent's Discretion
- Salience formula/statistics (movement counts, variance, priors weighting) and snapshot schema details.
- Number of ranked suggestions surfaced (macro/XY and salience top-N) within the bounded-drawer constraint.
- Shape parameter ranges, exact curve point placement, and preview rendering format inside the drawer (bounded text surface, 360–620 px).
- CLI flag design for `bw-automation` / `bw-device` extensions (currently stubs).
- Parameter-index identity mapping approach across sessions (fingerprint/ClipSid discipline applies).
- Probe evidence table format appended to `docs/bitwig-capabilities.md` (dated Observed-field convention applies).
- Exact transport/write-condition checks behind the D-05-05 refusal gate.

### Deferred Ideas (OUT OF SCOPE)
- **First-class Bitwig Grid integration** — Grid as a sound-design programming medium (agent-native representation, sound-design skill, listening gates, reusable Grid-block library). Large new capability; todo remains pending in `.planning/todos/pending/2026-08-09-design-first-class-bitwig-grid-integration.md` for a future phase (reviewed 2026-08-22, not folded).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTO-01 | `bw-automation inspect` reports per-track automation salience (most expressive parameters) | Verified observer surface (`Parameter.addValueObserver` via `Value`, `Device.getParameter(int)`); snapshot+freshness pattern to clone (04.3-02/P07); salience-statistics design below (discretion area) |
| AUTO-02 | `bw-device macros-suggest` proposes macro/XY assignments ranked by observed expressiveness | `CursorRemoteControlsPage` (implements `ParameterBank.getParameter(int)`) verified surface for native macro knobs; `Macro.getAmount()` → Parameter; evidence-line format (D-05-11); advisory-only — zero mutation risk |
| AUTO-03 | `bw-automation propose` generates a bounded automation curve patch for a selected parameter/region (medium risk → confirmation required) | patch.schema.json PrimitiveOp extension path verified (:109 oneOf, frozen $comment :6); authority path verified end-to-end (approval-store, proposal-dispatch, edit-service, patch-history, action-dispatch); automation-write API surface verified (`Parameter.touch/set`, Transport automation-write states); behavioral probe remains (D-05-05/06) |
| AUTO-04 | Device inspection and automation workflows cover third-party VST/AU plugins, not just native Bitwig devices | A1 NEGATED fallback path is `cursorDevice.getParameter(i)` direct enumeration (locked D-05-03); `Device.isPlugin()` BooleanValue verified (VST/AU detection); `DeviceBank` chain walk via `Channel`→`DeviceChain.createDeviceBank(int)` verified |
| UX-04 | CLAP device workspace renders confirmed chain context, automation salience, macro opportunities, and inspectable bounded automation proposals | 04.3 arrangement-review template verified (action-dispatch :80–88 → `conversation.chunk` sequence → `analysis.complete`; `renderArrangementReview` bounded-text pattern); drawer = live-verified TextEditor (360–620 px); UiAction additive-member pattern (`arrangementReview` precedent) |
</phase_requirements>

## Summary

Phase 5 extends a fully-verified spine rather than inventing one. Every mutation seam the automation path must flow through (patch schema → candidate store → pre-flight gates → controller apply → frozen-inverse journal → approval/peer dispatch → CLAP drawer) exists and was live-verified in Phases 3–04.3; the phase's real novelty is (a) the **device/parameter read + observation surface** in the Java bridge, (b) a **new automation-salience analyzer** in the daemon, (c) **bounded curve-shape generation** as new pure TS transforms, and (d) a **protocol schema extension** (new request/event/patch-op enums). The DOWNSTREAM-PLAN-NOTES seam inventory was re-verified this session and is accurate — with one stale-doc correction this research adds: **`AutomatableParameter` and `Automation` classes do NOT exist in extension-api:21** (javap + in-app Javadoc 6.0.11 confirm); the real write surface is `Parameter` (extends `SettableRangedValue`: `set(double)`, `setImmediately`, `setRaw`) plus `Parameter.touch(boolean)` — documented as "Touch (or un-touch) the value for **automation recording**" — and `Transport` exposes the complete automation-write state (`automationWriteMode()`, `isArrangerAutomationWriteEnabled()`, `isClipLauncherAutomationWriteEnabled()`, `isAutomationOverrideActive()`, `isPlaying()`, overdub states) that gives the D-05-05 refusal gate an exact named-condition vocabulary.

Two structural discoveries shape the plan. First, the bridge's `handleApplyPatch` dispatch (`applyOps`, PullHandlers.java:368) is note-grid-only and receives only `cursorClip` — **`cursorDevice` must be plumbed into the dispatch** (`BridgeExtension.java:84` creates it; `PullHandlers.handle` doesn't take it) for any parameter write, and the "3-case forever" comment requires deliberate revision as automation op kinds join the union (the Pitfall-7 discipline — never branch on `transformIntent` — is what actually stays forever). Second, the patch `Scope` is clip-locked (`required: ["clipSid"]`, `additionalProperties: false`) and `EditService`'s `wrong_clip_targeted` pre-flight is clip-specific — automation patches need a **sibling scope kind** (device/parameter/region) with symmetric wrong-target pre-flight, not an overload of the clip scope.

On the two ROADMAP "research needed" topics: **no established academic or industry standard exists for parameter-movement salience** (practitioner literature consistently ranks macro targets by observed movement — cutoff, FX mix, wavetable position — validating D-05-01's evidence model), so the formula is first-principles TS statistics (movement count, variance/range, section spread, role/energy priors) — an agent-discretion design detailed below. **Bounded curve generation is textbook math** (named shapes parameterized by depth/rate/length → point lists with linear/smooth interpolation); no library is warranted; D-05-14 bounds are enforced at schema level.

**Primary recommendation:** Structure the phase as (1) protocol/schema extension wave (patch automation ops + scope kind + request/event enums + profile automation-bias field), (2) bridge read wave (`get.project_meta` D-05-16, device-chain enumeration + parameter observers, non-mutating), (3) daemon analytics wave (salience analyzer + snapshot + macro/XY suggest + curve shapes, all pure/advisory), (4) write wave gated on the live automation-write probe (touch/set semantics, clip-vs-track, transport conditions → capabilities-doc Observed fields → refusal vocabulary), then (5) CLAP drawer surfacing + CLI + end-of-phase live UAT — mirroring the wave discipline of 04.2/04.3.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parameter movement observation | Bitwig bridge (Java, controller thread → enqueue-then-drain) | — | Only the bridge can subscribe Bitwig observers; observers must never block the audio engine (Pitfall 3, proven pattern) |
| Device-chain enumeration (native + VST/AU) | Bitwig bridge (PullHandlers pull handlers) | daemon (fold into state cache) | `get.selected_device_chain` exists as a request; bridge owns the A1-NEGATED `getParameter(i)` fallback |
| Salience computation | Daemon (analyzer-registry analyzer) | — | Pure statistics over observed movement + `roles.json`/energy priors; CPU work never in the bridge (AGENTS.md constraint) |
| Salience persistence | Daemon (`.bw-brain/` durable snapshot) | — | D-05-04 clone of arrangement-snapshot pattern; MEM-01 atomic-write discipline |
| Macro/XY suggestions | Daemon (pure advisory transform) | CLAP drawer (render only) | D-05-09 advisory-only; zero mutation surface |
| Curve generation (shapes → points) | Daemon (pure TS transform) | — | Bounded math, fast-check testable; never in the bridge |
| Automation write execution | Bitwig bridge (controller mutation authority) | daemon EditService (pre-flight + journal) | The bridge stays the only project mutator (RB-04/apply.patch path) |
| Transport/write-condition gate | Bridge (reads Transport state) + daemon (named refusal) | — | Bridge reports state; daemon names refusals (`transport_stopped` etc.) per D-05-05 |
| Project meta (tempo/timeSig) | Bridge (`get.project_meta` handler) | daemon boot (replaces DEFAULT_PROJECT tempo=120) | D-05-16; Transport.tempo()/timeSignature() verified |
| Drawer surfacing (UX-04) | CLAP editor + peer action-dispatch | daemon (deterministic render branch, zero Pi) | 04.3 arrangementReview template: conversation.chunk sequence; Pi stays behind daemon |
| CLI contract | Daemon query-server + `bw-automation`/`bw-device` | — | CLI-01 stub→live pattern; secondary contract (RB-02) |

## Project Constraints (from .claude/AGENTS.md — generated project instructions)

- **No MCP** — thin JSON-Lines over localhost TCP is the IPC; keep it inspectable.
- **Edit model:** all mutations flow through patch objects (scope/operations/rationale/reversibility/risk); preview before apply; undo labels mandatory; medium/high risk require explicit confirmation.
- **Local-first:** all DAW authority, state, persistence, mutation stay local; only bounded confirmed context may reach an explicitly configured reasoning provider; raw audio never leaves the plug-in.
- **Stack boundaries:** Java `.bwextension` bridge (extension-api:21, JDK 21, Maven shade); TypeScript daemon/CLI (Node ≥22.12 for commander 15, Ajv 2020-12, Vitest); C++17/CMake CLAP+JUCE (release licensing stays gated).
- **Schemas are hand-authored JSON Schema 2020-12 in `/schemas/`** — single source of truth across Java/TS; `gen-types.mjs` regenerates TS; never Zod/TypeBox for the wire contract.
- **No UI in the Java bridge** (host popups/println only); the hosted CLAP editor is the product UI surface.
- **Heavy musical reasoning never inside the bridge** (stalls audio engine; bridge crashes take down Bitwig).
- **Background auto-edits are out of scope** (trust model); no direct mutation without a patch object.

## Standard Stack

### Core (all existing — zero new packages this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `com.bitwig:extension-api` | 21 (provided) | Device/parameter/automation surface | The only official path; verified locally via javap + in-app Javadoc 6.0.11 [VERIFIED: javap + in-app Javadoc] |
| `ajv` | 8.20.0 (installed) | Validate extended patch/protocol schemas at boundaries | Project standard; NodeNext import discipline already established (STATE.md) |
| `commander` | 15.0.0 (installed) | `bw-automation` / `bw-device` CLI extensions | Existing CLI pattern (stub → live) |
| `vitest` | 4.x (installed) | Daemon test runner for new analyzers/transforms | 63 existing test files; include-glob discipline (BLOCKER-02 defense) |
| JUnit 5 | 5.11.x (installed) | Bridge tests (pure dispatch logic, recording writers) | `PullHandlersApplyPatchTest` pattern — no Mockito |
| CMake/ctest + JUCE | existing pins | CLAP drawer + UiState reducer tests | 04.2/04.3 product build discipline (clap/build for product) |

### Supporting (existing, relevant this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tonal` | 6.4.3 | (not needed for automation math) | Avoid adding dependencies to this phase's pure transforms |
| `@earendil-works/pi-coding-agent` | 0.84.0 | Pi tool surface (preview_edit param targets) | Only if Pi-driven automation proposals are wired; the 04.3 deterministic-branch pattern needs NO Pi for device review |

**Installation:** none — this phase adds zero external packages. All new code is pure TS/Java/C++ against existing dependencies.

**Version verification (environment):** Node v22.22.3 ✓ (commander 15 requires ≥22.12), npm 10.9.8 ✓, JDK 21.0.11 (`/opt/homebrew/opt/openjdk@21`; not on default shell PATH — export JAVA_HOME for javac/javap), Maven 3.9.16 ✓, Bitwig Studio 6.0.11 ✓ (with `bw-brain.bwextension` installed in `~/Documents/Bitwig Studio/Extensions/`).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — no new packages) | — | — | — | — | — | N/A |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    OBSERVATION (read-only, continuous)
 Bitwig Studio ──►  Bridge observers (init()-registered, enqueue-then-drain)
  device chain       ├─ cursorDevice name/isPlugin/pageNames
  params moving      ├─ getParameter(0..N) .addValueObserver  (VST/AU — A1 fallback, D-05-03)
  transport          ├─ CursorRemoteControlsPage knobs         (native macros, D-05-03)
                    └─ per-param last-value coalesce ──► parameter.changed events (drop-oldest)
                                                             │
                                                             ▼
                    Daemon: fold-event ──► salience analyzer (movement count, variance,
                    range, section spread × roles.json + energy-curve priors)
                                             │
                                             ▼
                    Durable salience snapshot (.bw-brain/, pulledAt, snapshot_invalid refusal)
                        │                          │
                        ▼                          ▼
             CLI: bw-automation inspect      CLAP peer path: device review action
             bw-device macros-suggest       (conversation.chunk sequence — 04.3 template)
                        │                          │
                        └──────────┬───────────────┘
                                   ▼  producer taps a ranked param
                    PROPOSAL (medium risk, inspectable — authority path)
                    curve shapes (ramp/dip/rise-fall/cycle/hold) ──► patch (1 param, ≤16 bars,
                    ≤64 points, single device — schema-enforced D-05-14)
                        │
                        ▼
                    candidate store ──► proposal.publish (revision+digest) ──► drawer render
                        │                                                        │
                        ▼                                                        ▼
                    approval.issue ◄── drawer Approve ──► approval.consume (one-shot, scope-checked)
                        │
                        ▼
                    EditService pre-flight (wrong-param/device gate + transport-gate:
                    named refusals transport_stopped / write_mode_off / ambiguous_target)
                        │
                        ▼
                    Bridge apply.patch automation ops ──► Parameter.touch()/set() writes
                    (prior value captured first → author-aware inverse D-05-07)
                        │
                        ▼
                    patch-history.jsonl ──► revert = restore prior value / remove authored points
```

### Recommended Project Structure (new files; everything else extends in place)

```
schemas/
├── patch.schema.json            # $defs.PrimitiveOp + new AutomationOp kinds + Scope sibling kind
├── profile.schema.json          # additive optional automationShapeBias field (ARCH-02)
└── protocol/
    ├── event.schema.json        # EventType enum += parameter.changed (bridge→daemon observation)
    └── request.schema.json      # request enum += get.project_meta (D-05-16)
bridge/src/main/java/com/bwbrain/bridge/
├── PullHandlers.java            # get.project_meta handler; handleSelectedDeviceChain enumeration;
│                                #   automation ops in apply dispatch (cursorDevice plumbed in)
└── Observers.java               # eager init() device-parameter/page/transport-automation observers
daemon/src/
├── transforms/
│   ├── automation-salience.ts   # pure: movement stats → ranked salience (AUTO-01)
│   ├── curve-shapes.ts          # pure: named shapes × depth/rate/length → point lists (AUTO-03)
│   └── macro-suggest.ts         # pure advisory: ranked macro/XY + evidence lines + alternatives (AUTO-02)
├── state/
│   └── salience-snapshot.ts     # D-05-04 clone of arrangement-snapshot.ts (atomic, validated)
├── patch/
│   └── inverse-ops.ts           # author-aware inverse for automation ops (D-05-07)
└── sessions/pi-tools.ts         # PREVIEW_EDIT_PARAMETERS parameter-target extension
clap/src/
├── model/UiState.h              # UiAction additive member (deviceReview pattern: arrangementReview precedent)
└── PluginEditor.cpp             # hosted Devices button; drawer renders salience/macros/proposals
```

### Pattern 1: Snapshot + Freshness Clone (D-05-04)
**What:** Durable salience snapshot in `.bw-brain/` with `pulledAt`, visible freshness, stale-but-readable when disconnected, bounded `snapshot_invalid` refusal on corrupt data.
**When to use:** every salience read surface (CLI + peer).
**Example:** clone `daemon/src/state/arrangement-snapshot.ts` + the 04.3-07 hardening (validate-before-persist in save; failed-save→null refresh; `snapshot_invalid` on load paths — DEFECT B/C closure) [VERIFIED: query-server.ts:1007–1030, STATE.md 04.3 P07].

### Pattern 2: Automation Ops Through the Frozen Trust Spine (AUTO-03)
**What:** New operation kinds (e.g. `set_parameter_value` / `automation_points`) join `PrimitiveOp`'s `oneOf`; a sibling `AutomationScope` (deviceSid + paramId + region in beats/bars) joins `Scope`. D-05-14 bounds encoded as schema constraints (maxItems 64, region ≤ 16 bars via beats bound, single-param oneOf shape).
**When to use:** every automation mutation — there is no other write path.
**Example:** `schemas/patch.schema.json` `$defs.PrimitiveOp` (:109) oneOf extension; update the `$comment` (:6) trust-spine note + `PullHandlers.applyOps` "3-case forever" comment deliberately — the *Pitfall-7 invariant* (never branch on `transformIntent`) is permanent, the case count is not [VERIFIED: file reads].

### Pattern 3: Bounded Enumeration + Ranked Surfacing (D-05-03/D-05-15)
**What:** Enumerate ≤ ~128 params via `cursorDevice.getParameter(i)` (terminate on `!exists()` — `Parameter extends ObjectProxy`); surface top 8–16 by salience; full bounded list browsable as fallback. Remote-page knobs for native devices rank first (explicit intent beats inference).
**When to use:** all device reads + salience lists.
**Example:** `Device.getParameter(int)` returns `Parameter`; `ObjectProxy.exists()` bounds the walk; `Device.isPlugin()` gates the native-vs-VST observation strategy [VERIFIED: javap].

### Pattern 4: Named-Refusal Gate Vocabulary (D-05-05)
**What:** Refuse automation applies with named reasons drawn from verified Transport state: `transport_stopped`, `automation_write_disabled` (arranger/launcher variants), `automation_override_active`, `ambiguous_target` (D-05-06 unresolved params), `state_disconnected`.
**When to use:** pre-flight immediately before bridge round-trip (mirrors `wrong_clip_targeted` at edit-service.ts:47–49).
**Example:** `Transport.isPlaying()`, `isArrangerAutomationWriteEnabled()`, `isClipLauncherAutomationWriteEnabled()`, `isAutomationOverrideActive()`, `automationWriteMode()` — all with observers [VERIFIED: javap + Javadoc].

### Pattern 5: Eager init() Observer Registration + Bridge-Side Coalescing
**What:** ALL parameter/page/automation-mode observers register during `init()` on fixed proxies (cursorDevice, its remote-controls page, a fixed getParameter(0..127) window); runtime observer registration throws in Bitwig (verified Phase 4 §7 finding 3: "This can only be called during driver initialization"). Parameter events coalesce per-param (last-value-wins) on the controller thread before enqueue to avoid control-rate floods.
**When to use:** the observation wave.
**Example:** `Observers.wireClipLauncherSlotsEager` precedent (commit 4903bc4); enqueue-then-drain proven to never stall the audio engine [VERIFIED: capabilities doc §7].

### Pattern 6: Deterministic Drawer Surfacing, Zero Pi (UX-04)
**What:** A hosted button (e.g. "Devices") enqueues a `deviceReview`-style UiAction; the daemon's confirmed-scope action branch assembles salience/macro/chain evidence transport-free and renders bounded text via `conversation.chunk` sequence + `analysis.complete` — exactly the 04.3 arrangementReview path.
**When to use:** UX-04 drawer surfacing; automation *proposals* additionally ride `proposal.publish` → drawer `ProposalView` (UiState.h:12) → Approve → `approval.consume`.
**Example:** action-dispatch.ts:80–88 chunk loop; `renderArrangementReview` bounded-text module pattern (pure + advisory) [VERIFIED: file reads].

### Anti-Patterns to Avoid
- **Reading existing automation envelopes for salience** — D-05-01 forbids; observer evidence only.
- **Silent no-op or value-set-when-stopped writes** — D-05-05 requires visible named refusal.
- **Guess-writing an ambiguous clip-vs-track target** — D-05-06: refuse with named reason.
- **Proactive proposals on Analyze** — D-04 quiet start; D-05-15 tap-to-propose only.
- **A single unexplained "best" macro target** — SC#2: ranked list with evidence + ≥1 alternative (D-05-11).
- **Registering Bitwig observers lazily (post-init)** — throws at runtime (Phase 4 verified).
- **New approval/mutation authority** — RB-04: reuse the verified 04.2 path verbatim.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable snapshot persistence | New file format/writer | Clone `arrangement-snapshot.ts` + `atomicWriteJson` (MEM-01) | 04.3-07 hardening already solved validate-before-persist + atomic rename |
| Approval / one-shot confirmation | New token scheme | `ApprovalStore` compare-and-delete + `ProposalDispatch` revisions | Live-verified 04.2 authority path (RB-04 mandate) |
| Stable parameter identity | New ID scheme | STATE-04 fingerprint discipline (deviceSid + index + name hash; ClipSid V1 precedent) | Reconnect/reorder reconciliation already exists |
| Parameter-value statistics (count/variance/range) | A statistics library | Plain TS arithmetic (≤ ~30 lines over rolling windows) | Zero-dependency project convention; fast-check testable |
| Schema validation | Hand-rolled checks | Ajv 2020-12 at boundaries (existing compiled validators) | Trust-spine invariant; D-05-14 bounds must be schema-checkable |
| Curve rendering in the drawer | Graphics/plots | Bounded text evidence lines (existing TextEditor drawer) | 360–620 px clamp; 04.3 live-verified readability pattern |

**Key insight:** the curve *math* is hand-rolled by design (it is the product); everything around it — persistence, approval, identity, validation, rendering — reuses verified seams. The one place hand-rolling tempts is the bridge write loop; resist adding scheduling intelligence there — it executes validated ops, nothing more.

## Common Pitfalls

### Pitfall 1: Stale API doc — `AutomatableParameter` does not exist
**What goes wrong:** capabilities doc §3 and STACK.md cite "`AutomatableParameter.set(value, ...)`, `Automation` envelope" — **no such classes exist in extension-api:21** (javap + in-app Javadoc 6.0.11 both confirm; `Parameter`'s only subinterfaces are `RemoteControl` and `Send`).
**Why it happens:** original research drew from remembered/older API docs.
**How to avoid:** write against `Parameter`/`SettableRangedValue` (`set(double)`, `setImmediately(double)`, `setRaw(double)`) + `Parameter.touch(boolean)`; correct §3 with a dated Observed field this phase (agent-discretion: probe table format).
**Warning signs:** any Java import referencing `AutomatableParameter`/`Automation`.

### Pitfall 2: Real-time capture vs instant graph write (THE probe question)
**What goes wrong:** assuming an approved 64-point curve can be written instantaneously like note ops. The API's automation model is hardware-knob emulation: `touch(true)` → `set(v)` **while transport plays** (with automation write mode armed) records points **at the playhead** — i.e., a 16-bar curve may require 16 bars of playback to author. `set()` with transport stopped likely just moves the current value (the "value-set-when-stopped side behavior" D-05-05 explicitly refuses to allow silently).
**Why it happens:** note ops are single-shot request/response; automation is timeline-stateful.
**How to avoid:** the in-phase probe (D-05-05/06) MUST test: `touch+set` under {playing, stopped} × {write-mode on/off}; whether envelope points appear ahead of/behind the playhead; `setImmediately` vs `set` vs `setRaw` differences; clip-launcher vs arranger write targets. Product consequence to surface in the plan: if only real-time capture works, the drawer must present an honest "arming" UX (approved patch = armed capture that lands as playback crosses the region) — D-05-08's "execute immediately (subject to transport gate)" already accommodates a gate but the plan must define what "execute" means per probe outcome.
**Warning signs:** plan tasks that treat automation apply as fire-and-forget over one request/response.

### Pitfall 3: `cursorDevice` not plumbed into the apply dispatch
**What goes wrong:** automation ops cannot reach a `Parameter` — `PullHandlers.handle` receives only `(line, outbox, cursorClip, observers, walker)`.
**Why it happens:** Phase 3's writer was clip-only by design.
**How to avoid:** extend the `handle` signature (and `BridgeExtension`'s call) to pass the cursorDevice created at BridgeExtension.java:84; keep `applyOps` pure with an injectable writer interface (recording-writer JUnit pattern, no Mockito) — add a `ParameterWriter` sibling to `NoteStepWriter`.
**Warning signs:** any plan task editing `applyOps` without touching `handle`/`BridgeExtension`.

### Pitfall 4: Clip-locked Scope and pre-flight gates
**What goes wrong:** reusing `Scope.clipSid` for automation patches breaks validation (`required: ["clipSid"]`, pattern `^clip_[0-9a-f]{16}$`), and `wrong_clip_targeted` gates don't protect against wrong-device/wrong-param writes.
**Why it happens:** D-02 single-cursor-clip scope was correct for MIDI; automation targets devices.
**How to avoid:** sibling `AutomationScope` (deviceSid + paramId + region); symmetric pre-flight (`wrong_device_targeted` / param-identity re-check at apply); `EditService.apply`'s `previewClipSid` compare generalizes to a target-binding compare; `patch-history` entries carry the automation binding for D-05-07 revert.
**Warning signs:** `scope.clipSid` appearing in automation patches.

### Pitfall 5: Control-rate observer floods
**What goes wrong:** a knob turn fires value observers at high frequency; 128 observed params × per-change events can saturate the JSON-Lines socket and the daemon queue even with drop-oldest.
**Why it happens:** `Parameter.addValueObserver` fires per value change (no documented coalescing).
**How to avoid:** bridge-side per-param last-value-wins buffer + periodic flush (e.g. 50–100 ms) on the writer thread; daemon `fold-event` accumulates movement *statistics* (count/last/delta), not raw streams — the snapshot stores aggregates, never event history.
**Warning signs:** `parameter.changed` events carrying raw per-tick values.

### Pitfall 6: Normalized value scale mismatches
**What goes wrong:** passing 0–127 (MIDI convention) or percent into `set()` that expects normalized 0.0–1.0 — the exact class of the live `setVelocity` 0–127 vs 0.0–1.0 bug (capabilities §2 finding 4).
**Why it happens:** project contracts use MIDI scales elsewhere.
**How to avoid:** pin the automation patch contract to normalized [0,1] (matches `Parameter.set(double)` + `addDirectParameterNormalizedValueObserver` naming); convert only at the bridge boundary if a probe shows otherwise; fast-check property: all curve values ∈ [0,1].
**Warning signs:** integer velocity-style fields in automation op schemas. [ASSUMED — `set(double)` normalized range is strongly implied by the API but not yet behaviorally verified; probe line item]

### Pitfall 7: Post-init observer registration throws
**What goes wrong:** lazily subscribing parameter observers when a device becomes selected throws `This can only be called during driver initialization` (live-verified Phase 4 §7 finding 3).
**How to avoid:** register ALL observers eagerly in `init()` over cursor proxies (`cursorDevice`, one `createCursorRemoteControlsPage`, the fixed `getParameter(0..N)` window); proxies rebind as selection moves — the observation set is fixed, the target follows the cursor. Bank-item subscriptions (per-device pages across a whole bank) need init-time creation via `DeviceBank` + `Device.createCursorRemoteControlsPage(int)` if full-chain observation is required — cost grows with bank size, so prefer cursor-scope observation (D-05-02: selected track's chain — enumerate chain membership via bank reads, observe movement via cursor proxies).
**Warning signs:** any `addValueObserver` call reachable after `init()` returns.

### Pitfall 8: Closed protocol enums reject new messages
**What goes wrong:** bridge emits `parameter.changed` or handles `get.project_meta` → daemon's Ajv-at-boundary reader rejects the line (EventType enum is a frozen 5-member list; request types are enumerated).
**How to avoid:** schema-first wave ordering: extend `event.schema.json`/`request.schema.json` enums + regenerate types BEFORE bridge changes; version-handshake compatibility note (additive enum members, same envelope version — consistent with the Phase-1 frozen-contract discipline; check `handshake.schema.json` negotiation semantics for min-version bumps).
**Warning signs:** bridge code emitting event types absent from the schema.

### Pitfall 9: Profile schema is `additionalProperties: false`
**What goes wrong:** adding `automationShapeBias` to `techno.json` without extending `profile.schema.json` fails validation at load.
**How to avoid:** additive optional field (e.g. `automationShapes: { shapeBias: {...}, depthRange: [...], rateRange: [...] }`) — optional, enhance-never-gate (ARCH-02); generic core runs literally without it (INV-13 pattern).
**Warning signs:** profile JSON edits without a schema edit in the same task.

### Pitfall 10: "3-case forever" comment churn breaks intent
**What goes wrong:** extending `applyOps` while leaving (or deleting) the Pitfall-7 comment erodes the real invariant.
**How to avoid:** update comments + the schema `$comment` (:6) in the same task as the op extension; the invariant to preserve verbatim: *the bridge never branches on `transformIntent`; it dispatches only on the primitive op discriminant*.
**Warning signs:** apply-dispatch code reading `transformIntent`.

### Pitfall 11: D-05-07 revert needs the PRIOR value at apply time
**What goes wrong:** an inverse of "author these points" requires "restore prior param value" — unobtainable after the fact without an envelope read (forbidden by D-05-01's spirit).
**How to avoid:** capture `Parameter.value().get()` (or the folded last-observed value) BEFORE writes in the apply pre-flight; freeze it into the journal's `inverseOperations` exactly like `inverseOps` freezing today (INV-14 discipline).
**Warning signs:** journal entries lacking a prior-value field for automation ops.

## Code Examples

### Device chain walk + parameter enumeration (bridge — verified surface)
```java
// Source: javap session 2026-08-22 against extension-api-21.jar + in-app Javadoc 6.0.11
// Chain membership: Track IS-A Channel IS-A DeviceChain (verified)
final DeviceBank deviceBank = cursorTrack.createDeviceBank(16);       // fixed window, init()-time
deviceBank.addDeviceCountObserver(count -> /* cache chain length */);
for (int i = 0; i < window; i++) {
    final Device d = deviceBank.getDevice(i);
    d.name().addValueObserver(name -> /* cache */);                    // StringValue
    d.isPlugin().addValueObserver(isPlugin -> /* VST/AU vs native */); // BooleanValue
}
// VST/AU bounded enumeration (A1-NEGATED fallback, D-05-03):
//   Parameter extends ObjectProxy — exists() terminates the walk
for (int i = 0; i < 128; i++) {
    final Parameter p = cursorDevice.getParameter(i);   // Device.getParameter(int) — verified
    p.exists().addValueObserver(has -> { if (!has) return; /* mark bound */ });
    p.addValueObserver(v -> { /* v: DoubleValueChangedCallback — normalized value */ });
    p.name().addValueObserver(n -> { /* param identity for fingerprinting */ });
}
```

### Automation write + gate state (bridge — verified surface; behavior probe pending)
```java
// Source: in-app Javadoc 6.0.11 Parameter.html / Transport.html
// "touch(boolean isBeingTouched): Touch (or un-touch) the value for automation recording."
// "restoreAutomationControl(): Restores control of this parameter to automation playback."
final Parameter p = cursorDevice.getParameter(index);
final double prior = p.value().get();            // capture BEFORE writes (D-05-07)
p.touch(true);                                   // begin automation touch
p.set(0.75);                                     // SettableRangedValue.set(double) — normalized
p.touch(false);
// Gate states (D-05-05 vocabulary) — all verified on Transport:
transport.isPlaying().get();                          // → transport_stopped refusal
transport.isArrangerAutomationWriteEnabled().get();   // → write_mode refusal (arranger)
transport.isClipLauncherAutomationWriteEnabled().get();// → write_mode refusal (launcher)
transport.isAutomationOverrideActive().get();         // → override refusal
transport.automationWriteMode().get();                // SettableEnumValue (latch/touch/write)
```

### get.project_meta handler content (D-05-16 — verified surface)
```java
// Source: javap session 2026-08-22 — Transport methods
final double tempo = transport.tempo().value().get();        // Parameter → SettableRangedValue
final String timeSig = transport.timeSignature().get();      // TimeSignatureValue.get() → "4/4"
// → response { name, tempo, timeSignature } — closes boot.ts DEFAULT_PROJECT tempo=120 hole
// (boot.ts:127) and supplies beatsPerBar for curve/bar math.
```

### Salience statistics sketch (daemon — pure, discretion area)
```typescript
// Proposal (agent-discretion design; no external prior art exists — verified by search)
export interface ParamObservation {
  movementCount: number;        // observer fires with value delta > epsilon
  valueVariance: number;        // rolling window
  valueRange: number;           // max - min (normalized)
  sectionsMovedIn: Set<string>; // section labels active when movement occurred
  lastValue: number;            // folded current value
}
export function automationSalience(
  obs: ParamObservation,
  ctx: { roleSalience?: number; energyAtMovement?: number; isUserExposedMacro: boolean },
): number {
  // Explicit intent beats inference (D-05-03): macro/page knobs rank at/near top.
  const base = obs.isUserExposedMacro
    ? 1.0 + 0.5 * Math.log1p(obs.movementCount)
    : 0.4 * Math.log1p(obs.movementCount) + 0.3 * obs.valueRange + 0.3 * Math.min(1, obs.valueVariance * 4);
  const prior = (ctx.roleSalience ?? 0.5) * 0.2 + (ctx.energyAtMovement ?? 0.5) * 0.2;
  return Number((Math.min(1, base * (1 + prior))).toFixed(3));
}
```

### Curve shapes sketch (daemon — pure, D-05-13/D-05-14)
```typescript
// Proposal — shapes are the product (hand-rolled by design); all values normalized [0,1]
export type ShapeName = "ramp_up" | "ramp_down" | "dip_recover" | "rise_fall" | "slow_cycle" | "hold_then_move";
export interface CurveSpec { shape: ShapeName; depth: number; rate: number; lengthBars: number; startBeat: number; }
export function buildCurve(spec: CurveSpec, beatsPerBar: number, maxPoints = 64): Array<{ beat: number; value: number }> {
  // linear/eased interpolation between shape control points; slow_cycle = triangle/sine generator;
  // hard bounds: points.length ≤ 64, region ≤ 16 bars, values clamped [0,1] — also schema-enforced
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "`AutomatableParameter.set(value, ...)`, `Automation` envelope" (capabilities §3 + STACK.md) | `Parameter` extends `SettableRangedValue` (`set(double)` normalized); `touch(boolean)` for automation recording; no Automation class in API 21 | Verified this session (javap + Javadoc 6.0.11) | Bridge writes + §3 doc correction; no behavior lost — the touch/set model is the hardware-knob emulation the API always used |
| Empty `pages` by design for VST/AU (Phase 2, A1 NEGATED) | `cursorDevice.getParameter(int)` bounded enumeration fallback (D-05-03) | A1 NEGATED live 2026-06-29; implementation lands this phase | AUTO-04 becomes real: `bw-device inspect` returns actual VST/AU params |
| External Pi `/device` pane (UX-04 original wording) | CLAP drawer surfacing (superseded 2026-08-20) | 04.3 rebaseline | UX-04 acceptance is in-Bitwig |
| daemon DEFAULT_PROJECT tempo=120 (M1 LIMITATION) | `get.project_meta` handler (D-05-16) | this phase | bar/region math for curves gets real tempo/timeSig |

**Deprecated/outdated:**
- Capabilities §3 "AutomatableParameter" citation — stale, correct with dated Observed field.
- `TrackBank.getTrack/getChannel` deprecation-as-error — already gated by `scripts/check-deprecated-bridge.mjs`; new bridge code must use `Bank.getItemAt(int)`/canonical forms only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Parameter.set(double)` takes a normalized 0.0–1.0 value (implied by API naming; not behaviorally verified) | Pitfall 6, Code Examples | Scale mismatch bug class (setVelocity precedent); probe line item |
| A2 | `cursorDevice.getParameter(i)` indexes the device's full parameter list (page-independent), bound discoverable via `exists()` | Pattern 3, Pitfalls | Enumeration window wrong or page-locked → salience coverage gap; probe |
| A3 | `DeviceBank`-based chain reads do not steal GUI focus (unlike the launcher `select()` walk) | Pattern 3 | UX cost only; probe nice-to-have |
| A4 | `addDirectParameterIdObserver`/`addDirectParameterNormalizedValueObserver` fire for third-party VSTs — a potentially cheaper observation path than index fan-out (NOT the locked D-05-03 path; probe candidate only) | Open Questions | Missing a simpler design; no plan risk if unused |
| A5 | `touch(true)+set()` during playback with write-mode armed records envelope points at the playhead (real-time capture model); stopped/`setImmediately` behavior differs | Pitfall 2 | Product-UX consequence: curves may author only in real time; the probe is a locked decision anyway (D-05-05/06) |
| A6 | Node 22.22.3 satisfies the runtime (STACK recommends 24 LTS; commander 15 needs ≥22.12 — satisfied) | Environment | None observed; all 63 test files green on 22.x historically |
| A7 | Practitioner consensus: macro targets are chosen by observed movement (cutoff/FX-mix/wavetable first) — websearch tier (LOW per seam), consistent across 2025–2026 tutorial literature | Summary | None to plan structure; validates D-05-01 weighting only |
| A8 | Proposed salience formula weights (log-scaled count, range, variance; macro prior; role/energy boosts) are a first-draft discretion design needing live-UAT tuning | Code Examples | Rankings feel wrong → tunable constants, no architecture change |
| A9 | Surge XT (or equivalent third-party VST/AU) is available in the live Bitwig environment for the AUTO-04 checkpoint (used in the 2026-06-29 probe; no user VST dirs populated — availability via Bitwig library unconfirmed for this session) | Environment | AUTO-04 live verification blocked → human checkpoint precondition |

## Open Questions (RESOLVED — Q1-3 via in-phase probe 05-02 per locked D-05-05/06; Q4 not adopted, D-05-03 locked enumeration stands; Q5 v1 rule adopted in 05-07)

1. **Automation write semantics (probe, locked D-05-05/06)**
   - What we know: verified API surface (`touch`/`set`/Transport states); Javadoc explicitly frames `touch` as automation recording.
   - What's unclear: clip-vs-track envelope per parameter type; transport-play requirement; whether points can be authored ahead of the playhead; `setImmediately` semantics.
   - Recommendation: early bridge probe task with dated Observed fields in §3 BEFORE the write-wave plans finalize; refusal vocabulary derives from the outcome.
2. **`getParameter(i)` indexing semantics**
   - What we know: the accessor exists and `exists()` is available for walk termination.
   - What's unclear: full-list vs current-page indexing; max realistic VST param counts vs the 128 window (Surge XT has ~100s).
   - Recommendation: fold into the same probe; adjust window/ranking constants (discretion).
3. **Native remote-page ↔ macro-modulator mapping**
   - What we know: `createCursorRemoteControlsPage` exists on Device; A1 NEGATED showed VST pages empty; producer's TouchDesigner chain surfaces macros via pages.
   - What's unclear: whether the producer's macro knobs appear on the *device's* page vs the *track's* page surface (both are creatable: `cursorTrack.channel()` vs `device.createCursorRemoteControlsPage`).
   - Recommendation: probe both creation sites once with the producer's actual project; observation target follows.
4. **Direct-parameter-ID observer viability (A4)** — one probe line: if `addDirectParameterIdObserver` returns full VST param IDs + value callbacks, it may replace index fan-out for VSTs (locked enumeration stays the spec; this is an implementation optimization to raise with the planner, not a decision flip).
5. **XY evidence sufficiency (D-05-12)**
   - What we know: pairs must be independently expressive; same evidence format.
   - What's unclear: minimum evidence bar for a pair (both top-N? orthogonal movement patterns?).
   - Recommendation: v1 rule = both params individually in the top 16 + no name-collision; revisit at live UAT.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bitwig Studio | live probes, UAT | ✓ | 6.0.11 | — |
| JDK 21 | bridge build/javap | ✓ | 21.0.11 (`/opt/homebrew/opt/openjdk@21`; not on default PATH) | export JAVA_HOME |
| Maven | bridge build | ✓ | 3.9.16 | — |
| Node.js | daemon/CLI/tests | ✓ | 22.22.3 (≥22.12 needed) | — |
| `bw-brain.bwextension` installed | bridge ↔ Bitwig | ✓ | current (installed in `~/Documents/Bitwig Studio/Extensions/`) | rebuild + `check:bridge-artifact` gate |
| Third-party VST/AU (e.g. Surge XT) | AUTO-04 checkpoint | ✓ (per prior live probes) | — | verify at checkpoint; Bitwig bundled plug-ins as backup |
| Live human checkpoints | probe + UAT | human_verify_mode: end-of-phase | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (daemon, 63 existing test files); JUnit 5 (bridge, 11 classes); CMake ctest (clap product tests) |
| Config file | `daemon/vitest.config.ts` (include-glob discipline — external test paths MUST be added to `include`); `bridge/pom.xml`; `clap/cmake/*Tests.cmake` |
| Quick run command | `npm test -- --run src/transforms/automation-salience.test.ts` (daemon dir) |
| Full suite command | `npm test` (daemon) + `mvn test` (bridge) + clap ctest per ProductUiTests.cmake |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTO-01 | Salience ranking from movement stats + priors | unit (property) | `npm test -- --run src/transforms/automation-salience.test.ts` | ❌ Wave 0 |
| AUTO-01 | Snapshot persist/load/`snapshot_invalid` refusal | unit | `npm test -- --run src/state/salience-snapshot.test.ts` | ❌ Wave 0 |
| AUTO-02 | Macro/XY suggestions ranked + evidence + ≥1 alternative | unit | `npm test -- --run src/transforms/macro-suggest.test.ts` | ❌ Wave 0 |
| AUTO-03 | Curve shapes respect D-05-14 bounds; values ∈ [0,1] | unit (property, fast-check) | `npm test -- --run src/transforms/curve-shapes.test.ts` | ❌ Wave 0 |
| AUTO-03 | Patch schema accepts automation ops; rejects out-of-bounds (65 points, >16 bars, 2 params) | unit | `npm test -- --run src/patch/patch-schema.test.ts` (extend) | ✅ extend (exists on disk; 05-05 extends it) |
| AUTO-03 | Author-aware inverse freezes prior value (D-05-07) | unit | `npm test -- --run src/patch/inverse-ops.test.ts` (extend) | ✅ extend |
| AUTO-03 | EditService automation pre-flight (transport refusals, wrong-device) | unit | `npm test -- --run src/runtime/edit-service.test.ts` (extend/new) | ❌ Wave 0 |
| AUTO-04 | Bridge dispatch: parameter enumeration + automation ops via recording ParameterWriter | unit (JUnit) | `mvn test -Dtest=PullHandlersAutomationTest` (bridge) | ❌ Wave 0 |
| AUTO-04/UX-04 | Live VST chain + drawer flow | manual-only (live Bitwig + human ears/eyes) | end-of-phase UAT ledger (04.3-04 precedent) | ❌ by design |
| UX-04 | UiState reducer accepts device-review events within bounds | unit (ctest) | clap product tests per `ProductUiTests.cmake` (extend) | ✅ extend pattern |

### Sampling Rate
- **Per task commit:** daemon `npm test` (fast subset via CLI filter) + `mvn test` for bridge tasks
- **Per wave merge:** full daemon suite + bridge suite + clap ctest
- **Phase gate:** full suites green + live UAT ledger rows pass before `/gsd-verify-work` (human_verify_mode: end-of-phase)

### Wave 0 Gaps
- [ ] `daemon/src/transforms/automation-salience.test.ts` — covers AUTO-01
- [ ] `daemon/src/state/salience-snapshot.test.ts` — covers AUTO-01 (D-05-04)
- [ ] `daemon/src/transforms/macro-suggest.test.ts` — covers AUTO-02 (D-05-11/12)
- [ ] `daemon/src/transforms/curve-shapes.test.ts` — covers AUTO-03 (D-05-13/14)
- [ ] `daemon/src/patch/patch-schema.test.ts` — automation-op schema bounds (exists ✅ — extension only; extend `inverse-ops.test.ts` for D-05-07)
- [ ] `bridge/src/test/java/com/bwbrain/bridge/PullHandlersAutomationTest.java` — recording ParameterWriter dispatch
- [ ] `daemon/src/sessions/pi-tools.test.ts` — extend for parameter-target PREVIEW_EDIT_PARAMETERS (exists ✅ — extension)

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; peer handshake + nonce correlation reused verbatim (04.2) |
| V3 Session Management | no | Session/instance lifecycle unchanged |
| V4 Access Control | yes | Confirmed-scope + one-shot compare-and-delete approval reused for automation proposals; no new authority path (RB-04); transport-gate named refusals prevent unattended writes |
| V5 Input Validation | yes | Ajv 2020-12 at every boundary; D-05-14 bounds schema-checkable (≤64 points, ≤16 bars, 1 param, single device); enumeration windows bounded (≤128); drawer text bounded (chunk ≤512 chars, 360–620 px surface discipline) |
| V6 Cryptography | no | Existing token randomness (`randomBytes`) reused; nothing new hand-rolled |

### Known Threat Patterns for Bitwig bridge + local daemon

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Observer-event flood → daemon CPU/queue exhaustion (DoS-ish, self-inflicted) | DoS | Drop-oldest observational backpressure (never for edits/requests) + bridge-side per-param coalescing (Pitfall 5) |
| Automation write while transport unattended | Tampering | Transport/write-mode named-condition gate (D-05-05); explicit confirmation for medium risk (EDIT-06) |
| Malformed/inflated patch (65+ points, multi-param) | Tampering | Schema validation at daemon entry, candidate mint, and bridge boundary (trust-spine) |
| Wrong-target automation (wrong device/param after reconnect) | Tampering | Stable-ID fingerprint re-check at apply pre-flight (wrong_device_targeted pattern); revision+digest approval binding |
| Loopback-only invariant erosion | Information Disclosure | Bridge connects 127.0.0.1 only; daemon binds loopback only (Pitfall 5 discipline — unchanged this phase) |
| Raw-audio/context exfiltration | Information Disclosure | Salience snapshots store bounded aggregates only — never event streams or audio (local-first/RB-05) |

## Sources

### Primary (HIGH confidence)
- javap session 2026-08-22 against `~/.m2/repository/com/bitwig/extension-api/21/extension-api-21.jar` — CursorDevice, Device, Parameter, SettableRangedValue, RangedValue, Value, Transport, Macro, CursorRemoteControlsPage, ParameterBank, DeviceBank, DeviceChain, Channel, Track, TimeSignatureValue, DirectParameter* callbacks
- In-app Bitwig Studio 6.0.11 Javadoc (`/Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/`) — Parameter/RemoteControl/CursorRemoteControlsPage/TimeSignatureValue method semantics ("touch … for automation recording")
- Codebase seam reads (this session): `schemas/patch.schema.json`, `schemas/profile.schema.json`, `schemas/protocol/{event,request}.schema.json`, `daemon/src/sessions/pi-tools.ts`, `daemon/src/proposals/{approval-store,proposal-dispatch}.ts`, `daemon/src/runtime/edit-service.ts`, `daemon/src/peers/action-dispatch.ts`, `daemon/src/query/query-server.ts` (:473–538, :900–1030), `daemon/src/state/roles-store.ts`, `daemon/src/cli/{stubs.ts,commands/automation.ts,commands/device.ts}`, `daemon/vitest.config.ts`, `bridge/src/main/java/com/bwbrain/bridge/{PullHandlers,Observers,BridgeExtension}.java`, `clap/src/model/UiState.h`, `clap/src/PluginEditor.cpp`
- `.planning/phases/04.3-.../DOWNSTREAM-PLAN-NOTES.md` — re-verified accurate (line refs hold)
- `docs/bitwig-capabilities.md` §3/§4/§7 — probe history + A1 NEGATED + post-init registration constraint

### Secondary (MEDIUM confidence)
- DuckDuckGo practitioner-literature scan (MusicRadar macro-assignment guide; mind-flux Serum 2 performance-macro article 2025-11; modulation tutorials 2025–2026) — movement-first macro selection consensus

### Tertiary (LOW confidence)
- None retained — the salience-prior-art search produced no formal standard (reported honestly as a negative finding)

## Metadata

**Confidence breakdown:**
- Bitwig API surface: HIGH — javap + in-app Javadoc (authoritative local artifacts; project-recognized evidence class)
- Seam inventory: HIGH — every file:line from DOWNSTREAM-PLAN-NOTES re-read this session
- Authority-path reuse design: HIGH — live-verified in 04.2/04.3
- Automation write behavior (clip-vs-track, transport): MEDIUM-LOW by design — locked in-phase probe (D-05-05/06) is the resolution mechanism
- Salience statistics: MEDIUM — no external standard exists (verified negative); first-principles design within locked constraints
- Environment: HIGH — direct probes this session

**Research date:** 2026-08-22
**Valid until:** 2026-09-21 (stable local-first surface; Bitwig app version pinned 6.0.11 — re-verify javap findings if Bitwig upgrades)
