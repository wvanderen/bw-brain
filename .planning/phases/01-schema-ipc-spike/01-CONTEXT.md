# Phase 1: Schema & IPC Spike - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove Bitwig↔daemon transport, freeze the JSON-Lines protocol contract, and document the verified Bitwig API surface — **pure de-risking, no production features.** This phase eliminates the single highest-risk structural unknown (Bitwig JVM localhost socket access) and locks the contract + API reality that all of Phase 2's bridge work builds against. Requirements: PROBE-01, PROBE-02. Success criteria are in `.planning/ROADMAP.md` §Phase 1.

**This is a spike:** the technical findings (TCP works / doesn't; exact API behavior) are the spike's *output*, not pre-discussion. The decisions below shape HOW the spike runs and what it hands to Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Capability Probe Priorities (PROBE-01 → `docs/bitwig-capabilities.md`)
- **D-01 — Deep-verify trust-critical items:** `undo behavior` and `note-editing scope` get deep verification (every Phase 2+ edit and the entire daemon-authoritative revert model depend on them). `automation write`, `bank paging`, and `observer granularity` get standard single-pass confirmation. Matches the accurate-first + trust-spine sequencing.
- **D-02 — Verification method is code-probes + guide:** Write tiny probe code that actually exercises the deep items (add a note → undo → observe what's labelled/coalesced; set a param → undo → observe). Open the in-app scripting guide to *design* the probes, but trust observed behavior over docs (the guide is 404-prone externally and has never been fetched — STATE.md blocker). Observed reality is the whole point of a spike.
- **D-03 — Probe scope is the 5 named items + stable-ID availability:** Verify whether Bitwig exposes any stable object IDs for tracks/clips/devices, in addition to the 5 named items. This directly determines whether Phase 2's fingerprint-mapping (STATE-04) is needed at all. Cheap to check during the same probe, high downstream value.
- **D-04 — Gap policy is fact + mitigation:** When the probe finds a capability missing or limited, `bitwig-capabilities.md` records the verified fact AND a proposed mitigation/workaround (e.g. "no reliable native undo → daemon-authoritative revert becomes the only path; native undo caveated harder"). Makes the doc design-ready — Phase 2 can treat it as a lockable design input, not just raw evidence.

### Spike Code Disposition
- **D-05 — Keep daemon-side scaffolding; extension is throwaway:** The Bitwig extension is throwaway (success criteria says so). The daemon-side scaffolding — JSON-Lines reader, partial-line buffer, version check, framing — is KEPT as Phase 2's real starting point. Write it with light discipline (TypeScript types, clear structure) but no premature hardening (no full test suite, no watchdog). This code is transport-agnostic and reusable regardless of which transport wins.
- **D-06 — Repo layout is `spike/` + real dirs:** Throwaway extension lives in a clearly-marked `spike/` directory. Kept code (daemon scaffolding, `schemas/protocol/*`) lives in the real repo structure (`daemon/`, `schemas/`) from day one. Phase 2 deletes `spike/` and extends the real dirs. Physical separation makes "reuse vs delete" unambiguous.
- **D-07 — Spike extension is a JavaScript prototype:** Write the spike extension in JS (Bitwig supports JS scripting) for iteration speed. API findings transfer to Java because it's the same Bitwig API surface. PROJECT.md explicitly permits "JS prototyping, harden in Java later." The `.bwextension` Java build/packaging de-risk is deferred to Phase 2.
- **D-08 — End-to-end demo is a raw proof print:** Success criteria #1's "CLI print" is a raw `bw-brain-spike dump`-style command that prints the received `selection.changed` event as validated JSON — proves the pipe works end-to-end with no pretense of being a real command. Phase 2 designs the real `bw-focus` / `bw-project` commands fresh against the frozen schema. Cleanest separation of "proof" vs "contract."

### Agent's Discretion
- **Transport decision rule (TCP vs stdio):** Left OPEN deliberately — the choice depends on spike findings, so pre-deciding a threshold would be guessing. The researcher/planner should frame the decision criteria once TCP behavior is observed. Both transports are pre-accepted as valid outcomes (PROJECT Constraints); STATE.md flags TCP as MEDIUM confidence with stdio fallback ready.
- **Protocol freeze breadth:** Left OPEN — how much of the JSON-Lines contract to freeze now (envelope + ~4 seed example messages vs. a fuller Phase 2+ catalog) depends on what the 1-event spike can honestly support. Over-freezing from a thin spike risks locking guesses. Planner calibrates breadth against the freeze-quality bar in success criteria #3 (versioned messages, atomic-line writes, partial-line buffer, backpressure rule).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Protocol Intent
- `docs/seed.md` §"Proposed local protocol" (lines 362-415) — the sketched JSON-Lines envelope (`type`/`id`/`timestamp`/`ok`/`payload`), event/request/response shapes, and the `apply.patch` + `undoLabel` edit example. The spike freezes this into real schemas.
- `docs/seed.md` §"4 components" / data model — bridge/daemon/CLI/Pi split and the raw→derived→intent→patch state layers.
- `.planning/PROJECT.md` §Constraints + §Key Decisions — locked constraints (no MCP; local-first; Java bridge first; JSON-Lines over localhost TCP or stdio; patch model; trust model). Do not re-litigate.
- `.planning/REQUIREMENTS.md` — PROBE-01, PROBE-02 (this phase) + STATE-04 (the fingerprint-mapping decision D-03 feeds).
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria (3), and the named research items.

### In-App Reference (must be opened during the spike)
- **Bitwig Developer Resources / scripting guide** — opened *in-app* (external web fetches are 404-prone; STATE.md blocker). Authoritative API reference for designing the capability probes (D-02).

### To Be Produced (this phase's outputs)
- `docs/bitwig-capabilities.md` — the verified API surface doc (D-01..D-04).
- `schemas/protocol/*` — the frozen JSON-Lines contract (success criteria #3).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None.** Greenfield repository — only `docs/seed.md`, `.planning/`, and `.claude/` exist. No source code, no schemas yet. This phase creates the first real code artifacts.

### Established Patterns
- **Protocol envelope** (from `docs/seed.md`): newline-delimited JSON; envelope fields `type`/`id`/`timestamp`/`ok`/`payload`; events like `selection.changed`; requests like `get.selected_clip`; edits `apply.patch` with `undoLabel`. The frozen schema generalizes this.
- **Trust-model spine** (from PROJECT.md): every edit is a patch object; daemon-authoritative undo; native Bitwig undo is best-effort/caveated. The probe's deep-verify of undo behavior (D-01) directly serves this.

### Integration Points
- `spike/` — throwaway JS Bitwig extension (emits events, runs capability probes).
- `daemon/` — kept TypeScript scaffolding: JSON-Lines reader, partial-line buffer, version check, framing, raw dump CLI (D-05, D-06, D-08).
- `schemas/protocol/*` — frozen contract both halves build against (D-06).
- `docs/bitwig-capabilities.md` — design-lock input for Phase 2 bridge work (D-01..D-04).

</code_context>

<specifics>
## Specific Ideas

- The user's repeated stance across the project — "below-threshold = refuse rather than guess" (sections, transforms) — applies in spirit to the capability doc: record what's verified, propose a mitigation for gaps, and let Phase 2 lock design only against verified reality (D-04).
- "Accurate first; creative later" (PROJECT Core Value) is the reason undo + note-editing are the deep-verify items (D-01): accuracy of every future edit and the revert model both hinge on them.

</specifics>

<deferred>
## Deferred Ideas

- **Transport decision threshold (TCP vs stdio tie-breaker)** — offered as a gray area, not selected. Belongs to the researcher/planner once spike findings exist; not deferred to a later phase, just not pre-decided here.
- **Protocol freeze breadth** — offered as a gray area, not selected. Calibrated by the planner against success criteria #3.
- **`.bwextension` Java build/packaging de-risk** — confirmed out of this spike's scope; deferred to Phase 2 (D-07).

None of these are new capabilities — all are within Phase 1's domain, intentionally left for the research/planning steps that follow.

</deferred>

---

*Phase: 1-Schema & IPC Spike*
*Context gathered: 2026-06-26*
