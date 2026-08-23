---
phase: 05-automation-device-workflows-m4
plan: "02"
subsystem: docs
tags: [bitwig, automation-write, live-probe, controller-script, capabilities-evidence, refusal-vocabulary]

# Dependency graph
requires:
  - phase: 05-automation-device-workflows-m4 (research)
    provides: RESEARCH Pitfall 1 stale-citation correction (AutomatableParameter does not exist), verified Parameter/SettableRangedValue + Transport automation-write surface, probe question set (Open Questions 1-3, Pitfall 2/6)
provides:
  - "docs/bitwig-capabilities.md §3 dated Observed fields pinning automation-write semantics: write-arm (not transport) is the gate; armed cells land points at exact target values on the ARRANGER TRACK lane; not-armed = silent envelope no-op; set/setImmediately/setRaw all work normalized 0..1; value readback ASYNC"
  - "FINAL refusal vocabulary (D-05-05): automation_write_disabled/arranger+launcher are the operative pre-flight gates; transport_stopped RETIRED as a refusal trigger (evidence-driven revision); ambiguous_target keeps clip-targeted automation refused (D-05-06, launcher cells UNVERIFIED)"
  - "Execute-semantics consequence row (D-05-08) binding 05-05/05-06: instant write when write-arm ON (playing OR stopped, latch), mandatory pre-flight refusal before dispatch, async-readback verification constraint for the bridge"
  - "§4 A2 verdict: Device.getParameter(int) NEGATED live in the JS API (hard-throws deprecated-since-v2; 128-walk yields all-'?'); JS parameter surface = device-site CursorRemoteControlsPage; Java-side graceful-degradation check flagged for end-of-phase UAT (05-10)"
  - "Throwaway probe artifact preserved at commit cc73913 (spike/automation-write-probe.control.js — .control.js naming + loadAPI(21) + remote-page knob write target + observer-cached readback)"
affects: [05-05 daemon named-refusal gates, 05-06 bridge write path, 05-08 curve targets, 05-10 end-of-phase UAT]

# Tech tracking
tech-stack:
  added: []  # zero new packages (T-05-SC accept)
  patterns:
    - "Blocking human-verify probe pattern: agent prepares throwaway script + PENDING evidence template → producer runs the live matrix across sessions → agent transcribes verbatim into dated Observed fields (never infers; UNVERIFIED for unexercised cells)"
    - "Evidence-driven vocabulary revision: live evidence supersedes plan-anticipated gate wording, recorded as a dated RETIRED note in the vocabulary table rather than silently rewritten"

key-files:
  created:
    - spike/automation-write-probe.control.js  # renamed from .js during live session; working-tree copy since removed by producer — preserved at cc73913
    - .planning/phases/05-automation-device-workflows-m4/deferred-items.md
  modified:
    - docs/bitwig-capabilities.md

key-decisions:
  - "Refusal vocabulary centers on automation_write_disabled (write-arm off) — transport_stopped RETIRED as a refusal trigger: armed+stopped WRITES points (latch; STEP#1 evidence), not-armed is a silent envelope no-op regardless of transport. This is the evidence-derived revision of D-05-05's draft transport-gate wording, recorded dated in §3."
  - "Clip/launcher-targeted automation stays refused with named reason ambiguous_target — launcher-armed cells were never exercised (launchWrite stayed 0 across all 21 steps), so per D-05-06 (probe pins, refuse rest) no clip-targeted write ships pending evidence."
  - "The JS-API write surface is the device-site CursorRemoteControlsPage parameter (Surge XT M1–M8, exists=1, knob names reflect macro mappings); cursorDevice.getParameter(int) is JS-blocked outright and cursorTrack.channel() does not exist in JS."
  - "Execute-immediately (D-05-08) is literal: points land instantly at authored values when write-arm is ON (transport stopped or playing); the automation_write_disabled pre-flight refusal BEFORE dispatch is mandatory because not-armed is silent."
  - "AUTO-03/AUTO-04 left unchecked in REQUIREMENTS.md: this plan delivers the binding evidence, not the AUTO-03 CLI or the AUTO-04 workflow end-to-end; those land in 05-05/05-06 (+ Java-side getParameter check at 05-10 UAT) per the live-unverified discipline (05-03 precedent)."

patterns-established:
  - "Dated RETIRED-note convention for evidence-driven vocabulary revisions (transport_stopped row kept in the table with its retirement recorded — grep-able contract strings survive, honesty preserved)"
  - "Async-readback awareness: bridge write verification must not use synchronous value().get() (valueBefore==valueAfter in-step; written value surfaces next observer tick; during playback the knob follows the recorded envelope)"

requirements-completed: []  # AUTO-03/AUTO-04 intentionally deferred — see key-decisions

# Metrics
duration: 3h 43m elapsed across the blocking human-verify checkpoint + three live producer sessions (continuation transcription ~5 min)
completed: 2026-08-22
status: complete
---

# Phase 5 Plan 02: Automation-Write Live Probe (D-05-05/D-05-06) Summary

**Live-probed automation-write semantics pinned into docs/bitwig-capabilities.md: write-arm (not transport) is the operative gate — armed+stopped writes points at exact normalized target values on the arranger track lane, not-armed is a silent no-op — yielding the FINAL refusal vocabulary (automation_write_disabled; transport_stopped retired) that binds 05-05's gates and 05-06's write path.**

## Performance

- **Duration:** 3h 43m elapsed (Task 1 → Task 3 across the blocking checkpoint); continuation transcription session ~5 min
- **Started:** 2026-08-22T20:29:39Z (Task 1 commit 37565d4)
- **Completed:** 2026-08-23T00:12:10Z (Task 3 commit 95c977e)
- **Tasks:** 3 (2 auto + 1 blocking human-verify executed live by the producer)
- **Files modified:** 2 (1 created-and-since-removed-in-working-tree probe artifact + docs/bitwig-capabilities.md; + deferred-items.md)

## Accomplishments
- **The write wave's binding input is pinned with honest live evidence** (D-05-05/D-05-06): 21 matrix steps across stopped/arranger-armed, stopped/not-armed, playing/arranger-armed, playing/not-armed cells (override on/off mix); launcher-armed cells explicitly UNVERIFIED — never inferred.
- **Core verdict:** only armed cells wrote points; transport state is NOT the gate. Producer inspected envelopes: points landed at exactly the target values on the ARRANGER TRACK automation lane (track automation, consistent with arrWrite armed). Stopped+not-armed moved only the knob's current value — silent no-op.
- **Stale §3 citation corrected** (RESEARCH Pitfall 1): `AutomatableParameter`/`Automation` do not exist in extension-api:21; the real surface is `Parameter` (SettableRangedValue set/setImmediately/setRaw) + `Parameter.touch(boolean)` + the Transport automation-write states — all five gate observers verified live (writeMode observed "latch").
- **Refusal vocabulary FINAL + execute-semantics consequence row recorded** — 05-05/05-06 implement exactly this: instant write when armed, mandatory pre-flight refusal before dispatch, async-readback constraint for the bridge.
- **§4 A2 verdict recorded:** `Device.getParameter(int)` NEGATED live in the JS API (hard-throw, not graceful); the 128-walk bound 128 slots but all names stayed "?" — the walk provides nothing in JS; Java-side check flagged for the end-of-phase UAT.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the throwaway probe script + evidence template** - `37565d4` (feat) — plus three live-session fixes: `7dbde0b` (rename to .control.js + loadAPI(21)), `c5f3001` (retarget writes to remote-page knob M1), `cc73913` (observer-cached readback via init-time value observers)
2. **Task 2: Run the live probe matrix in Bitwig (blocking human-verify)** - executed live by the producer across three sessions (no agent code commit; the fix commits above landed during it)
3. **Task 3: Transcribe probe results into dated Observed fields + finalize refusal vocabulary** - `95c977e` (docs)

**Plan metadata:** (final docs commit below)

## Files Created/Modified
- `docs/bitwig-capabilities.md` - §3 corrected surface + live matrix evidence + FINAL refusal vocabulary + consequence row; §4 A2 verdict; header status updated
- `spike/automation-write-probe.control.js` - throwaway JsApi probe (threat T-05-05; nothing imports it; preserved at `cc73913`; producer removed the working-tree copy post-session)
- `.planning/phases/05-automation-device-workflows-m4/deferred-items.md` - out-of-scope discoveries + evidence follow-ups

## Decisions Made
- See key-decisions (vocabulary revision, clip-target refusal, JS surface pin, execute-immediately semantics, requirements deferral).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Probe script did not load cleanly in live Bitwig**
- **Found during:** Task 2 (live checkpoint, producer sessions)
- **Issue:** Bitwig refused the script name; `loadAPI(1)` blocked v2+ surfaces; `cursorDevice.getParameter(0)` write target hard-threw; value readback threw without interested-marking
- **Fix:** three live commits — `7dbde0b` (rename to `.control.js`, pin `loadAPI(21)`), `c5f3001` (retarget to remote-page knob M1), `cc73913` (init-time `value().addValueObserver` for cached readback)
- **Files modified:** spike/automation-write-probe.control.js
- **Verification:** probe loaded, executed all 21 steps, printed STATE/STEP/WALK/PAGE lines
- **Committed in:** 7dbde0b, c5f3001, cc73913

**2. [Evidence-driven revision] transport_stopped retired as a refusal trigger**
- **Found during:** Task 3 (transcription)
- **Issue:** the plan's must_haves and 05-05-PLAN prose anticipated `transport_stopped`-class refusals ("the exact conditions that produce transport_stopped-class refusals"); live evidence shows armed+stopped WRITES — the operative gate is write-arm
- **Fix:** vocabulary table records `transport_stopped` as RETIRED (dated, with the reason); `automation_write_disabled/arranger+launcher` finalized as the operative gates; a binding note in §3 tells 05-05/05-06 the table supersedes the plan prose
- **Files modified:** docs/bitwig-capabilities.md
- **Verification:** grep contract strings preserved (transport_stopped ×4, automation_write_disabled ×5)
- **Committed in:** 95c977e

**3. [Deliberate skip] requirements.mark-complete not run for AUTO-03/AUTO-04**
- **Issue:** plan frontmatter lists `requirements: [AUTO-03, AUTO-04]`, but this plan delivers evidence, not the AUTO-03 CLI or AUTO-04 workflow; both remain live-unverified (Java-side getParameter check + end-of-phase UAT pending — 05-03 precedent keeps them unchecked)
- **Fix:** requirements-completed: [] with rationale; REQUIREMENTS.md untouched

---

**Total deviations:** 2 auto-fixed (Rule 1 live-session fixes + the evidence-driven vocabulary revision) + 2 deliberate documented skips (requirements deferral; USER-SETUP not generated — see below)
**Impact on plan:** All fixes necessary for honest evidence capture. The vocabulary revision is the plan working as designed (D-02: observed behavior is the deliverable, never fabricated). No scope creep.

## Issues Encountered
- The producer deleted the working-tree copy of the probe post-session (unstaged ` D spike/automation-write-probe.control.js`). Not swept into any commit; logged in `deferred-items.md` with the recovery command (`git checkout cc73913 -- spike/automation-write-probe.control.js`). Producer decision at close-out (Phase-1 precedent `618ab0c`).

## User Setup Required
None pending — the plan's `user_setup` (bitwig-studio live probe preconditions) was consumed: the producer ran the matrix live across three sessions. The end-of-phase UAT (05-10) will need Bitwig Studio + a throwaway project again (Java-side getParameter(int) behavior + launcher-armed cells if exercised).

## Raw Producer Observations (verbatim, as required by the plan output spec)

> Transcribed dated 2026-08-22, Bitwig Studio 6.0.11, host macOS, device Surge XT on "Surge XT" track, probe spike/automation-write-probe.control.js.
>
> **Probe fixes required during the live session (commit history 7dbde0b → c5f3001 → cc73913):**
> 1. Bitwig refused to load the script until renamed with the `.control.js` suffix (controller-script naming standard).
> 2. `loadAPI(1)` produced: "This cannot be called when specifying API version 1. This is only available for APIs after version 2" — probe pinned to `loadAPI(21)`.
> 3. Write steps originally targeted `cursorDevice.getParameter(0)` — see A2 below, retargeted to remote-page knob 0.
> 4. Value readback threw "Either call markInterested() or add at least one observer in init" — fixed by adding `p.value().addValueObserver` at init (observer-cached readback).
>
> **A2 — Device.getParameter(int) in the JS API: NEGATED (live).**
> Every call hard-throws: `Hru: This has been deprecated since API version 2: Use remote controls instead`. This is not graceful degradation — the JS API blocks the surface outright. The 128-window walk bound 128 slots but ALL names stayed "?" with exists never observed true — the walk provides nothing in the JS API. (NOTE: the JAVA extension-api path in 05-03 compiled with a deprecation warning and graceful per-index try/catch — whether the Java host behaves identically is a separate live check for the end-of-phase UAT; record the JS verdict here and flag the Java follow-up.)
>
> **Remote-page surfaces (live):**
> - `cursorDevice.createCursorRemoteControlsPage(size)` — WORKS. Surge XT exposes 8 macros M1–M8, all `exists=1`. Page knob NAMES reflect macro mapping targets: knob 0 read "M1: -" unmapped, then "M1: Shape" after the producer mapped it.
> - `cursorTrack.channel()` — DOES NOT EXIST in the JS API: `TypeError: invokeMember (channel) on com.bitwig.flt.control_surface.proxy.CursorTrackProxy failed due to: Unknown identifier: channel`. Track-site page uncreatable from JS.
>
> **Transport / automation-write gate observers (live, all five work):**
> playing, isArrangerAutomationWriteEnabled, isClipLauncherAutomationWriteEnabled, isAutomationOverrideActive, automationWriteMode (observed value: "latch"). All transition lines logged correctly.
>
> **Write semantics matrix (the core evidence):**
> - All three variants — `Parameter.set(0.75)`, `setImmediately(0.25)`, `setRaw(0.5)` — executed against page knob M1 with ZERO throws (touch(true) before, touch(false) after each).
> - Producer inspected the envelopes and confirmed: **envelope points landed at exactly the target values, on the ARRANGER TRACK automation lane** (track automation — consistent with arrWrite being the armed mode).
> - **Only armed cells wrote points.** Cells with arrWrite lit (INCLUDING transport STOPPED — STEP#1 was stopped/arranger-armed and wrote) recorded points. Stopped+not-armed steps moved only the knob's current value — silent no-op on the envelope.
> - **Launcher/clip automation: UNVERIFIED** — launchWrite was never armed during the session (stayed 0 in all 21 steps). Per D-05-06 (probe pins, refuse rest): clip-targeted automation stays refused with a named reason pending evidence.
> - **Transport state is NOT the gate** — write-arm is. Armed+stopped writes points (latch mode). This REVISES the D-05-05 draft mitigation wording: the refusal vocabulary centers on `automation_write_disabled` (write-arm off), not `transport_stopped`.
> - Value readback timing is ASYNC: within a step valueBefore==valueAfter; the written value appears in the NEXT step's before (STEP#2 target=0.25 → STEP#3 before=0.25). During playback the knob follows the recorded envelope (observed interpolated values 0.375, 0.39633357524871826, 0.395...).
> - Automation override latches on once engaged (override=1 from mid-session onward) and stays observable.
> - Normalization: normalized values map to parameter range (0.25 target → before-read 0.24999999999999956 ≈ exact; 0.75/0.5 likewise appear verbatim in readbacks) — set() takes normalized 0..1. (Producer's first-session note: got Surge params out through remote controls and recorded automation manually.)
>
> **21 steps executed across cells:** stopped/arranger-armed, stopped/not-armed, playing/arranger-armed, playing/not-armed (with override on/off mix); launcher-armed cells never exercised.

## Next Phase Readiness
- **05-05 (daemon gates) + 05-06 (bridge write path) are unblocked** — their BINDING input is on disk: `docs/bitwig-capabilities.md` §3 vocabulary table + consequence row. Note for their executors: the dated table SUPERSEDES the 05-05-PLAN prose that anticipated `transport_stopped` gating (gate on write-arm state in `state.transport.automationWrite`, not on playing).
- 05-08 consumes the remote-page target pin (macro knobs as automation targets, D-05-10/D-05-15).
- End-of-phase UAT (05-10) carries two flagged live checks: Java-side `getParameter(int)` behavior, and (optionally) launcher-armed cells + the unstaged probe deletion decision.

## Self-Check: PASSED

- docs/bitwig-capabilities.md exists and carries the dated Observed fields (verified: 12 × `Observed (2026-08-22)`)
- Task 3 verify green: transport_stopped=4, automation_write_disabled=5, UNVERIFIED|ambiguous=11
- All six named reasons present in the vocabulary table; stale citation appears only inside the correction note
- Commits verified in history: 37565d4, 7dbde0b, c5f3001, cc73913, 95c977e
- No production source references the probe (grep bridge/daemon/clap/schemas: 0)

---
*Phase: 05-automation-device-workflows-m4*
*Completed: 2026-08-22*
