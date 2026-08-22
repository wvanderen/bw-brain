# Phase 5: Automation & Device Workflows (M4) - Context

**Gathered:** 2026-08-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The CLAP companion helps with sound design and movement through confirmed device context: automation salience reporting, advisory macro/XY suggestions, and bounded automation curve proposals across native Bitwig and third-party (VST/AU) device chains. All mutation flows through the 04.2-verified authority path (confirmed scope → proposal revisions → one-shot approval → candidate/pre-flight → controller mutation → journal/revert). The CLI retains `bw-automation` / `bw-device` as the diagnostics/scripting contract (AUTO-01..04, UX-04).

Not in this phase: Grid-as-sound-design-medium, envelope reading, proactive/background suggestions, new mutation authority, arranger editing.

</domain>

<decisions>
## Implementation Decisions

### Salience evidence
- **D-05-01:** Salience is computed from **observed live parameter movement** (bridge observers) boosted by `roles.json` + energy-curve priors. No dependency on reading existing automation envelopes — verified observer API only, honest evidence only.
- **D-05-02:** Observation scope = the **selected track's full device chain** (all devices). Per-track coverage accumulates as the producer moves between tracks. Existing drop-oldest observational backpressure absorbs event volume.
- **D-05-03:** VST/AU parameter enumeration is **bounded + ranked** via `cursorDevice.getParameter(i)` (e.g. enumerate ≤ ~128, surface top 8–16 by salience). **Native macro-modulator knobs are first-class observed targets**: the producer's own exposure (CV → macro modulator → remote-controls page chain) ranks at/near the top of salience because explicit intent beats inference. Observing remote-control page knobs (`CursorRemoteControlsPage` — verified surface for native devices) is the choke point that captures hand/hardware tweaks and CV-driven mappings; the CV source itself is unobserved. Automation proposals may target a macro knob as a single control point for everything it drives.
- **D-05-04:** Salience persists via the **04.3 snapshot + freshness pattern** (durable snapshot with visible freshness + `pulledAt`, stale-but-readable when disconnected, bounded `snapshot_invalid` refusal on corrupt data).

### Automation write gating
- **D-05-05:** If the in-phase probe confirms writes require transport-play/record-mode, apply **refuses visibly with a named reason** (e.g. `transport_stopped`) when conditions are unmet. No queueing, no silent no-ops, no value-set-when-stopped side behavior.
- **D-05-06:** The in-phase probe **pins clip-vs-track envelope targeting per parameter type** into `docs/bitwig-capabilities.md`; parameters still ambiguous after probing are automation-**refused with a named reason** — never a guess-write.
- **D-05-07:** Revert for applied automation patches is **author-aware inverse**: bw-brain authored the exact curve written, so the frozen-inverse journal stores "remove exactly these authored points / restore prior param value". No envelope-read needed for revert (consistent with D-05-01).
- **D-05-08:** Approved automation writes execute **immediately** (subject to the transport gate) — no bar-boundary launch machinery (that discipline stays specific to D-14 live MIDI).

### Macro proposal mode
- **D-05-09:** `macros-suggest` is **advisory only**: ranked, evidence-backed suggestions; the producer wires macros by hand exactly as today. No mutation risk; ships regardless of any probe outcome.
- **D-05-10:** Automation targeting a **macro knob = medium risk** (same class as automation on a selected param): it is ONE selected control the producer explicitly exposed; blast radius is the producer's own visible mapping choice.
- **D-05-11:** Every macro/XY suggestion carries an **evidence line**: param identity + device, expressiveness evidence (movement count, sections where it moved, role/energy context), `assumptions[]`, and **at least one alternative candidate** (SC#2 disambiguation duty).
- **D-05-12:** **XY pairs included in v1**: pair two independently expressive params onto X/Y axes (e.g. cutoff × resonance) for perform control. Advisory, same evidence format.

### Curve vocabulary & bounds
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 contract (binding)
- `.planning/phases/04.3-clap-first-product-rebaseline-and-roadmap-reconciliation/DOWNSTREAM-PLAN-NOTES.md` — the code-grounded Phase 5 contract: required slices, binding constraints, and seam inventory with file:line references (ground-verified 2026-08-21). The single most important input.
- `.planning/ROADMAP.md` §Phase 5 (line ~300) — goal, AUTO-01..04 + UX-04, success criteria 1–5.
- `.planning/REQUIREMENTS.md` — AUTO-01–04, UX-04 (superseded CLAP-native wording), ARCH-01/02 (profile discipline).
- `.planning/phases/04.2-hybrid-clap-companion-product/04.2-CONTEXT.md` — product decisions D-01–D-16 (the authority path Phase 5 reuses).
- `.planning/phases/04.3-clap-first-product-rebaseline-and-roadmap-reconciliation/04.3-CONTEXT.md` — §"Phase 5 contract" locked decisions (reuse verified seams; honest unsupported metadata).

### Capability evidence & probes
- `docs/bitwig-capabilities.md` §3 "Automation Write" (~line 175) — verified write surface (`AutomatableParameter.set`), open clip-vs-track + transport-play questions, probe recipe, DRAFT mitigation this phase finalizes.
- `docs/bitwig-capabilities.md` §4 "Bank Paging" (~line 201) — A1 NEGATED history (VST/AU params do not populate CursorRemoteControlsPage; `cursorDevice.getParameter(int)` direct enumeration is the documented fallback).
- `docs/bitwig-clap-capabilities.md` — dated Bitwig/adapter/controller/package evidence (04.2 input).

### Seams to extend (from DOWNSTREAM-PLAN-NOTES, ground-verified)
- `schemas/patch.schema.json` — `$defs.PrimitiveOp` (:109): MIDI-note-only today; automation-operation kinds extend here under the frozen trust-spine discipline recorded in the file's `$comment` (:6).
- `daemon/src/sessions/pi-tools.ts` (:55, :127–137) — `PREVIEW_EDIT_PARAMETERS` bounds and the four bounded Pi tools to extend for parameter targets.
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` (:224, :307, :238) — `get.selected_device_chain` dispatch (returns empty pages by design today), `apply.patch` controller mutation path; `get.project_meta` handler lands here (D-05-16).
- `daemon/src/proposals/approval-store.ts` (:13) — one-shot compare-and-delete approval.
- `daemon/src/proposals/proposal-dispatch.ts` (:37–38) — proposal revisions + digest.
- `daemon/src/runtime/edit-service.ts` (:47–49, :69) — apply/revert pre-flight gates.
- `daemon/src/patch/patch-history.ts` — frozen-inverse journal (author-aware inverse lands here, D-05-07).
- `daemon/src/peers/action-dispatch.ts` (:94–110) — approval peer dispatch the CLAP drawer drives.
- `clap/src/PluginEditor.cpp` + `clap/src/model/UiState.h` (:15) — the proposal drawer (360–620 px clamp) where device/automation proposals surface.
- `daemon/src/query/query-server.ts` (:954, :910) — `assembleArrangementReviewEvidence` + `SectionSummary.energy`: the snapshot/freshness pattern D-05-04 reuses; energy/arrangement signals.
- `daemon/src/transforms/track-role-classifier.ts` — `roles.json` persistence (salience prior input).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **04.3 snapshot + freshness machinery** (`refreshArrangementSnapshot`, durable store, `snapshot_invalid` vocabulary) — clone for the salience snapshot (D-05-04).
- **04.2 authority path** (approval-store, proposal-dispatch, edit-service pre-flight, patch-history, action-dispatch) — reused verbatim per RB-04; automation patches are "just" new operation kinds through it.
- **Phase 4 analyzers** — energy-curve, track-role-classifier (`roles.json`) feed salience priors; analyzer-registry pattern for the new automation-salience analyzer.
- **CLAP proposal drawer** — live-verified TextEditor presentation with chunk append/reset reducer; device/automation proposals render here, no new native UI paradigm needed.
- **Observational backpressure** (drop-oldest + dropped notice) — absorbs parameter-observation event volume; edits/requests still never drop.

### Established Patterns
- Trust-spine schema discipline: every mutation is a validated patch object; schema `$comment` records the frozen reuse contract any PrimitiveOp extension must preserve.
- Honest-absence pattern: unsupported/unprobeable surfaces are shown as explicitly absent, never inferred from names (A1 NEGATED precedent, Q1–Q4 gate precedent).
- Dated evidence convention in `docs/bitwig-capabilities.md` — probe results land as dated `Observed:` fields.
- Profiles enhance, never gate (generic.json always works; techno.json biases).
- Daemon-default hole: tempo=120 default in boot.ts (M1 LIMITATION) — closed by D-05-16.

### Integration Points
- `PullHandlers` request switch — new `get.project_meta` handler + `handleSelectedDeviceChain` parameter-enumeration fallback.
- `patch.schema.json` PrimitiveOp + risk classifier — new automation operation kinds with fixed bounds (D-05-14).
- `pi-tools.ts` — `PREVIEW_EDIT_PARAMETERS` extension for parameter targets.
- `bw-automation` / `bw-device macros-suggest` CLI stubs → live commands (CLI-01 stub pattern).
- CLAP drawer + peer action dispatch — device context, salience, macro suggestions, automation proposals.

</code_context>

<specifics>
## Specific Ideas

- The producer's existing **TouchDesigner workflow** is the mental model for macro exposure: CV is mapped to a macro modulator, which is mapped to a remote-controls page, which sends CC out. bw-brain treats the macro knob (surfaced on `CursorRemoteControlsPage`) as the observable choke point for that whole chain — user-exposed params rank highest in salience because explicit intent beats inference.
- A macro knob can be the **single control point** an automation proposal targets — one write moves everything the macro drives (D-05-10 keeps this medium risk).
- The drawer is a bounded text surface (360–620 px): evidence lines, not tables; ranked lists, never a single unexplained "best" target.

</specifics>

<deferred>
## Deferred Ideas

- **First-class Bitwig Grid integration** — Grid as a sound-design programming medium (agent-native representation, sound-design skill, listening gates, reusable Grid-block library). Large new capability; todo remains pending in `.planning/todos/pending/2026-08-09-design-first-class-bitwig-grid-integration.md` for a future phase (reviewed 2026-08-22, not folded).

</deferred>

---

*Phase: 5-Automation & Device Workflows (M4)*
*Context gathered: 2026-08-22*
