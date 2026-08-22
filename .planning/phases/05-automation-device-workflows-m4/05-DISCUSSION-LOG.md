# Phase 5: Automation & Device Workflows (M4) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-22
**Phase:** 5-Automation & Device Workflows (M4)
**Areas discussed:** Salience evidence source, Automation write gating, Macro proposal mode, Curve vocabulary & bounds

---

## Todo Triage (cross-reference)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to backlog | Keep Phase 5 focused on M4; Grid todo stays pending for its own future phase | ✓ |
| Fold into Phase 5 | Treat Grid integration as Phase 5 scope (substantially enlarges phase) | |
| Review only | Mark reviewed, no action | |

**User's choice:** Defer to backlog
**Notes:** Pending todo "Design first-class Bitwig Grid integration" (score 0.6) matched Phase 5; classified as a large new capability beyond M4's inspect/propose scope.

---

## Salience evidence source

| Option | Description | Selected |
|--------|-------------|----------|
| Observed movement | Bridge observes live param value changes; salience = movement stats + roles/energy priors; verified observer API only | ✓ |
| Envelope read | Read existing automation envelopes (capability risk; silent degradation for unplayed params) | |
| Probe-gated hybrid | Observed movement primary; envelope read as probed enhancement | |

**User's choice:** Observed movement

| Option | Description | Selected |
|--------|-------------|----------|
| All tracks, bounded | Observe every track with per-device param budget; matches "per-track" wording | |
| Selected track chain | Observe the selected track's full chain; coverage builds as producer moves between tracks | ✓ |
| Cursor device only | Focused-device only; lightest but no per-track coverage | |

**User's choice:** Selected track chain

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded + ranked | Enumerate ≤ ~128 via getParameter(i), surface top 8–16 by salience | ✓ |
| Full enumeration | Enumerate everything (VSTs expose 500+; floods events/identity) | |
| Name-filtered | Filter by param-name heuristics (brushes "never infer from names") | |

**User's choice:** Bounded + ranked — plus free-text: "thinking about how VST plugins can be exposed by Macro modulators. This is how I send CC values from Bitwig devices to TouchDesigner already and it can allow the user to proactively expose the params they want to modulate."
**Notes:** Native macro-modulator knobs adopted as first-class observed targets (producer's explicit exposure = strongest intent signal). Follow-up free-text: "it's not just a macro modulator for TouchDesigner but the CV is mapped to macro modulator which is then mapped to a remote control." → CV → macro → remote-controls chain; the macro knob on CursorRemoteControlsPage is the observable choke point; CV source itself unobserved.

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot + freshness | Reuse 04.3 arrangement-snapshot pattern (freshness + pulledAt, stale-but-readable) | ✓ |
| Always-live compute | Recompute per request; no durable answer when disconnected | |
| CLI only | No CLAP persistence | |

**User's choice:** Snapshot + freshness

---

## Automation write gating

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse visibly | Apply checks transport/write conditions; named-reason refusal (e.g. transport_stopped) | ✓ |
| Queue until play | Approved proposals queue for next-bar landing once transport runs | |
| Value-set when stopped | Param-value set only when stopped; curve writes require play | |

**User's choice:** Refuse visibly

| Option | Description | Selected |
|--------|-------------|----------|
| Probe pins, refuse rest | Probe pins clip-vs-track per param type into capabilities doc; ambiguous → named refusal | ✓ |
| Write and observe | Learn by mutating (violates trust model) | |
| Single envelope type | One envelope type up front regardless of param type | |

**User's choice:** Probe pins, refuse rest

| Option | Description | Selected |
|--------|-------------|----------|
| Author-aware inverse | Journal stores "remove exactly these authored points / restore prior value" — no envelope reads | ✓ |
| Envelope snapshot | Requires reading envelopes (ruled out as dependency) | |
| Best-effort caveat | Weakens the never-wrecks-the-song promise for the new mutation class | |

**User's choice:** Author-aware inverse

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate on approval | Writes land immediately subject to gates; no launch machinery | ✓ |
| Next-bar boundary | Mirror D-14 phrase-launch discipline | |
| Per-proposal choice | Timing choice per proposal | |

**User's choice:** Immediate on approval

---

## Macro proposal mode

| Option | Description | Selected |
|--------|-------------|----------|
| Advisory only | Ranked evidence-backed suggestions; producer wires by hand; no mutation risk | ✓ |
| Probe-gated applicable | Probe controller macro-creation; applicable patches if API allows | |
| Both tiers | Advisory now + apply-mapping attempts; partial-apply states | |

**User's choice:** Advisory only

| Option | Description | Selected |
|--------|-------------|----------|
| Medium risk | Macro knob = ONE producer-exposed control; same class as selected param | ✓ |
| High risk | Macro drives N params → broad edit | |
| Mapping-count scaled | Risk by observed mapping count | |

**User's choice:** Medium risk

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence line each | Param+device, movement evidence, assumptions[], ≥1 alternative per suggestion | ✓ |
| Scores only | Ranked scores, minimal per-item evidence | |
| Comparison table | Table view in bounded 360–620px drawer (layout risk) | |

**User's choice:** Evidence line each

| Option | Description | Selected |
|--------|-------------|----------|
| Include XY pairs | Pair two expressive params on X/Y axes; advisory, same format | ✓ |
| Macro knobs only | Defer XY pairing | |

**User's choice:** Include XY pairs

---

## Curve vocabulary & bounds

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed shape set | ramp up/down, dip-and-recover, rise-fall, slow cycle, hold-then-move; depth/rate/length params; profiles bias never gate | ✓ |
| Free-form composition | Composable primitives; hard to bound/read | |
| Single generic shape | One flexible ramp/cycle only | |

**User's choice:** Fixed shape set

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed hard bounds | 1 param/patch, ≤16 bars, ≤64 points, single device; schema-checkable | ✓ |
| Profile-driven bounds | Genre profiles set bounds | |
| User-adjustable | Producer sets bounds per proposal | |

**User's choice:** Fixed hard bounds

| Option | Description | Selected |
|--------|-------------|----------|
| From salience list | Tap ranked param → propose automation; bounded param browse fallback | ✓ |
| Manual browse | Producer browses chain params manually | |
| Proactive on Analyze | Auto-propose top-salience during Analyze (violates D-04 quiet-start) | |

**User's choice:** From salience list

| Option | Description | Selected |
|--------|-------------|----------|
| Fold in project_meta | Add get.project_meta handler (tempo/time-sig); closes M1 gap; serves bar/region math | ✓ |
| Beat-relative only | No absolute time; leave get.project_meta deferred | |
| Default + caveat | Ship tempo=120 default with documented inaccuracy | |

**User's choice:** Fold in project_meta

---

## the agent's Discretion

- Salience formula/statistics and snapshot schema details
- Number of ranked suggestions surfaced (top-N) within drawer bounds
- Shape parameter ranges, curve point placement, preview rendering format
- CLI flag design for bw-automation / bw-device
- Parameter-index identity mapping approach (fingerprint/ClipSid discipline)
- Probe evidence table format in docs/bitwig-capabilities.md
- Exact transport/write-condition checks behind the refusal gate

## Deferred Ideas

- First-class Bitwig Grid integration (todo deferred to backlog — own future phase)
