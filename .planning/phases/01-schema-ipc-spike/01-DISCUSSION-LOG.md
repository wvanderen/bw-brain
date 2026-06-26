# Phase 1: Schema & IPC Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 1-Schema & IPC Spike
**Areas discussed:** Capability probe priorities, Spike code disposition

---

## Gray-Area Selection

| Area | Selected |
|------|----------|
| Spike code disposition | ✓ |
| Transport decision rule | — (not selected; depends on spike findings) |
| Protocol freeze breadth | — (not selected; calibrated by planner) |
| Capability probe priorities | ✓ |

---

## Capability Probe Priorities

### Q1 — Which of the 5 capability items are must-verify-deeply vs standard confirmation?

| Option | Description | Selected |
|--------|-------------|----------|
| Undo + note-editing deep | Trust-critical (every Phase 2+ edit + daemon-authoritative revert depend on them); others get standard verification. | ✓ |
| All five equally deep | Verify all 5 deeply; slowest but leaves no gap. | |
| Undo only is critical | Only undo is deal-breaker; treat other 4 as confirm-exists. Fastest, riskiest. | |

**User's choice:** Undo + note-editing deep
**Notes:** Matches accurate-first + the trust spine.

### Q2 — How should the deep items actually be verified?

| Option | Description | Selected |
|--------|-------------|----------|
| Code probes + guide | Write tiny probe code exercising deep items; read scripting guide to design probes; trust observed behavior over docs. | ✓ |
| Guide-first, code if unclear | Read in-app guide carefully; write probe code only if guide is ambiguous. | |
| You decide | Defer rigor call to researcher/planner. | |

**User's choice:** Code probes + guide
**Notes:** Scripting guide is 404-prone externally and never fetched (STATE.md blocker); observed reality is the point of a spike.

### Q3 — Should the doc also verify stable-ID availability, or stick to the 5 named items?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 items + stable IDs | Adds stable-ID availability check; feeds Phase 2 STATE-04 fingerprint-mapping decision. | ✓ |
| Strictly the 5 items | Stable-ID verification waits for Phase 2. | |

**User's choice:** 5 items + stable IDs

### Q4 — When a capability is missing/limited, what should the doc record?

| Option | Description | Selected |
|--------|-------------|----------|
| Fact + mitigation | Record verified fact AND proposed mitigation; design-ready for Phase 2. | ✓ |
| Facts only | Record only verified facts/evidence; mitigation design all downstream. | |
| Fact + mitigation + block-flag | Also mark which gaps are Phase-2-blocking vs non-blocking. | |

**User's choice:** Fact + mitigation

---

## Spike Code Disposition

### Q1 — Daemon-side scaffolding + CLI demo: keep or disposable?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep daemon scaffolding | JSON-Lines reader, partial-line buffer, version check, framing kept as Phase 2 start; light discipline, no premature hardening. Extension stays throwaway. | ✓ |
| All throwaway | Daemon + CLI demo also disposable; Phase 2 starts daemon from scratch. | |
| Keep + production-grade | Daemon kept AND built to production-grade (tests, watchdog stub). | |

**User's choice:** Keep daemon scaffolding
**Notes:** Daemon-side code is transport-agnostic and reusable regardless of which transport wins.

### Q2 — How should throwaway vs kept code be laid out?

| Option | Description | Selected |
|--------|-------------|----------|
| spike/ + real dirs | Throwaway extension in clearly-marked spike/; kept code in real repo structure (daemon/, schemas/) from day one. | ✓ |
| All in spike/ then promote | Everything starts in spike/; Phase 2 promotes keepable parts. | |
| You decide | Planner decides exact layout. | |

**User's choice:** spike/ + real dirs

### Q3 — Spike extension language?

| Option | Description | Selected |
|--------|-------------|----------|
| JS prototype | JS for iteration speed; API findings transfer to Java (same Bitwig API). | ✓ |
| Java from the start | Also de-risks .bwextension build/packaging; slower. | |
| JS probes + Java smoke | JS probes then tiny Java packaging smoke-test at end. | |

**User's choice:** JS prototype
**Notes:** .bwextension Java packaging de-risk deferred to Phase 2.

### Q4 — How real is the end-to-end CLI print?

| Option | Description | Selected |
|--------|-------------|----------|
| Raw proof print | bw-brain-spike dump-style command prints received event as validated JSON; proves the pipe. | ✓ |
| Minimal bw-focus stub | Shape demo as minimal bw-focus export stub Phase 2 extends. | |
| You decide | Planner decides demo shape. | |

**User's choice:** Raw proof print
**Notes:** Cleanest separation of "proof" vs "contract"; Phase 2 designs real bw-* commands fresh against the frozen schema.

---

## Agent's Discretion

- **Transport decision rule (TCP vs stdio tie-breaker):** intentionally left open — depends on spike findings; researcher/planner frames criteria once TCP behavior is observed.
- **Protocol freeze breadth:** intentionally left open — planner calibrates against success criteria #3 once the 1-event spike establishes what can honestly be frozen.

## Deferred Ideas

- **`.bwextension` Java build/packaging de-risk:** confirmed out of this spike's scope; deferred to Phase 2.
