# Phase 3: Reversible MIDI Patching (M2) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** 3-Reversible MIDI Patching (M2)
**Areas discussed:** Patch operation catalog, Preview → apply workflow, Transform refusal shape, Musical knowledge source

---

## Patch operation catalog

### Q1 — What shape is the EDIT-01 operation catalog?

| Option | Description | Selected |
|--------|-------------|----------|
| Primitive-composable | Small set of CRUD primitives (add_note/remove_note/update_note_field); every transform composes from them. Bridge handler tiny; revert mechanical; diff uniform. 50-note humanize = 50-op array. | |
| Semantic-named | Seed's named transforms are first-class ops (humanize, voice_lead_fix, counterline...). Patches read as intent; compact. Bridge handler grows per transform; per-op revert logic. | |
| Hybrid (Recommended) | Primitive ops are CANONICAL wire format; semantic names ride in `transformIntent` metadata the bridge never branches on. Compact intent + uniform execution. | ✓ |

**User's choice:** Hybrid (Recommended)
**Notes:** The bridge `apply.patch` handler stays at 3 primitive cases; diff/revert single-mechanism; semantic label preserved for audit.

### Q2 — How does a patch operation IDENTIFY the note it touches?

| Option | Description | Selected |
|--------|-------------|----------|
| Content key (diff-logic) | Content-derived key matching diff-logic.ts Note.key (pitch+start+channel hash). Reuses existing identity; survives reorder. Collision risk on identical notes. | |
| STATE-04 note sid | STATE-04-style fingerprint (trk_/clip_ pattern) per note. Stable across reconnect; no collision. Adds note-fingerprint layer. | |
| Musical address | Reference by pitch + start beat. Human-readable. Same collision issue; doesn't survive transposition. | |
| You decide | Researcher/planner pins, bound by: consistent with diff-logic.ts Note.key, revert can find the note, don't over-engineer note-sids for single-clip. | ✓ |

**User's choice:** You decide
**Notes:** Binding invariants recorded; the agent pins the exact key scheme during research/planning.

### Q3 — What clip/track blast radius can a P3 patch declare?

| Option | Description | Selected |
|--------|-------------|----------|
| Single cursor-clip | Every patch targets selected/pinned clip only. Zero new bridge surface. Counterline writes into SAME clip. | |
| Multi-clip / single track | Patch targets N launcher clips on cursor track. Counterline to sibling clip. Bridge needs clip-enumeration surface it lacks. | |
| Single clip, defer multi (Recommended) | P3 ships single cursor-clip. Multi-clip deferred. SC#3 multi-track = high enforced as hard error. | ✓ |

**User's choice:** Single clip, defer multi (Recommended)
**Notes:** Bridge has ONE PinnableCursorClip today; multi-clip deferred to a later phase.

### Q4 — How is revert computed in patch-history.jsonl (EDIT-05)?

| Option | Description | Selected |
|--------|-------------|----------|
| Self-reversing ops (Recommended) | Each primitive op self-inverts at creation (add_note carries note; update_note_field carries before+after). patch-history records in order; revert = inverse ops in reverse. Mechanical, auditable. | ✓ |
| Snapshot-restore | Daemon snapshots pre-state of touched scope; revert = restore. Always correct; heavier storage; doesn't surface what changed. | |
| Computed-at-revert | Daemon computes inverse from op type at revert time. Compact history; brittle if state drifted. | |

**User's choice:** Self-reversing ops (Recommended)
**Notes:** Aligns with capabilities §1 (daemon-authoritative, no native labelled undo).

---

## Preview → apply workflow

### Q1 — How does a patch move from proposed to applied?

| Option | Description | Selected |
|--------|-------------|----------|
| Interactive y/N prompt | CLI prints diff + y/N prompt. Low-risk can skip with --yes. Breaks shell pipelines; Pi shelling out hits a wall. | |
| Two-step explicit (Recommended) | `bw-edit preview` emits JSON (diff+risk+patchId); `bw-edit apply <patchId>` is separate. No prompt anywhere. Med/high need --confirm. Scriptable, Pi-friendly. | ✓ |
| CLI applies, Pi confirms | CLI non-interactive, applies immediately for low, errors for med/high. Pi handles all confirmation. Violates EDIT-02 as first-class CLI. | |

**User's choice:** Two-step explicit (Recommended)
**Notes:** Pi /apply IS the second step; "no background edits" = every apply is a deliberate second action.

### Q2 — Where do CANDIDATE patches live between preview and apply?

| Option | Description | Selected |
|--------|-------------|----------|
| Daemon in-memory store (Recommended) | Daemon holds ephemeral candidate store keyed by patchId. Lost on restart (ephemeral per MEM-02). `bw-midi vary` returns 3 patchIds. patch-history records ONLY applied. | ✓ |
| Stateless (caller holds JSON) | Preview emits full patch JSON; caller passes it back to apply. Daemon stateless on candidates. Caller must round-trip JSON. | |
| Candidate files in .bw-brain/ | Candidate patches as temp files. Survives restart; inspectable. Blurs MEM-02 durable/ephemeral boundary; needs GC. | |

**User's choice:** Daemon in-memory store (Recommended)
**Notes:** Satisfies MEM-02 hard boundary + D-07 (daemon = source of truth).

### Q3 — What does `bw-edit preview`'s diff look like, and how does it relate to bw-diff?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse computeStateDiff (Recommended) | Preview resolves ops vs current clip state, calls existing computeStateDiff(before, after). Output is StateDiff (same shape bw-diff emits). bw-diff stays state-vs-state. One shape for UX-02 pane. | ✓ |
| Ops + diff (two views) | Preview emits BOTH ops + resolved diff. Richer; diff pane must handle two shapes; bw-diff and preview diverge. | |
| Unify into bw-diff | Promote bw-diff to also accept --patch. Risks the clean P2 SC#1 contract. | |

**User's choice:** Reuse computeStateDiff (Recommended)
**Notes:** Maximum reuse; SC#1 round-trip property covers preview.

### Q4 — Who assigns the EDIT-06 risk class, and can it be overridden?

| Option | Description | Selected |
|--------|-------------|----------|
| Author declares, daemon floors (Recommended) | Transform self-declares; daemon validates + may UPGRADE (never downgrade). Scope-mismatch hard-errors. Risk IS an assumption (UX-06). | ✓ |
| Daemon computes from content | Daemon computes purely from content (ruleset). Deterministic; loses transform intent. | |
| Author declares, daemon trusts | Transform declares; daemon trusts (only scope-mismatch). Simplest; a buggy transform could mint a "low-risk" patch that nukes the clip. | |

**User's choice:** Author declares, daemon floors (Recommended)
**Notes:** Defense-in-depth on the trust spine.

---

## Transform refusal shape

### Q1 — What does a transform emit when NOTHING clears the motif bar?

| Option | Description | Selected |
|--------|-------------|----------|
| Empty + reason (strict refuse) | Empty result with status:refused + reason + assumptions[]. No closest-match. Strictest; user doesn't see how close the near-miss was. | |
| Refuse + show near-miss (Recommended) | Empty primary (refused) AND tagged belowBarCandidate with motif-similarity score + caveat. Default refuses; near-miss is visibility. | ✓ |
| No-op (return original) | Return original unchanged labelled no-op. Silent; violates explicit refusal stance. | |

**User's choice:** Refuse + show near-miss (Recommended)
**Notes:** Producer gets margin awareness while the default still refuses.

### Q2 — Can a below-bar near-miss candidate ever be APPLIED?

| Option | Description | Selected |
|--------|-------------|----------|
| No apply path | Below-bar candidates display-only. Zero applicable variants if nothing clears. | |
| Override = high-risk + audit (Recommended) | Only via --allow-below-bar that reclassifies as HIGH-risk (--confirm) + stamps belowBar:true + score in history. Default still refuses. | ✓ |
| Re-run with lower threshold | Re-run transform with --threshold. Exposes raw musical decision to user. | |

**User's choice:** Override = high-risk + audit (Recommended)
**Notes:** Deliberate, auditable escape hatch; no silent degradation.

### Q3 — Do voice-leading-fix/humanize run the SAME motif check as vary/counterline?

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform check, one signature | Every transform runs same check against one per-clip signature. Cleanups trivially clear. | |
| Tiered: creative vs cleanup (Recommended) | Creative (vary, counterline) full check + can refuse; cleanup (voice-leading-fix, humanize) trivial/relaxed. MIDI-04/05 documented low-risk. | ✓ |
| Per-transform predicate | Each transform ships own preservation predicate. No shared contract; more surface. | |

**User's choice:** Tiered: creative vs cleanup (Recommended)
**Notes:** A humanize that refused because it "changed the motif" would be a bug, not a feature.

### Q4 — What does a transform operate on — whole clip, a region, or note-selection?

| Option | Description | Selected |
|--------|-------------|----------|
| Whole clip | Transform operates on entire selected clip. Matches bridge clip-level cursor surface. Can't vary just a section. | |
| Region-aware (Recommended) | Default whole clip, but patch scope region {start,end} (beats, already in selection schema) targets only there. Motif signature over region with full clip as context. | ✓ |
| Note-level selection | Operate on note-level GUI selection. Bridge mirrors clip-level cursor, not notes — out of P3 scope. | |

**User's choice:** Region-aware (Recommended)
**Notes:** Reuses existing region field; non-breaking default.

---

## Musical knowledge source

### Q1 — Where does 'harmonic center' come from for counterline + voice-leading-fix?

| Option | Description | Selected |
|--------|-------------|----------|
| intent.json (user-authored) | Harmonic center user-authored in intent.json (extend STATE-03). If absent, refuse. Matches D-09 (no inference). | |
| Inferred at transform time | Minimal key-detector (tonal) over clip pitch-class profile. Low confidence = refuse. Adds key-detection analyzer to P3 — scope-creep risk. | |
| Authored default + inferred fallback (Recommended) | Default user-authored; if absent, one-shot inference with explicit assumption stamped, only for low-risk-tolerant transforms. Producer opts in by leaving intent blank. | ✓ |

**User's choice:** Authored default + inferred fallback (Recommended)
**Notes:** Full disclosure in patch history which patches used inferred harmony.

### Q2 — What IS a genre profile (ARCH-01 contract that every future profile implements)?

| Option | Description | Selected |
|--------|-------------|----------|
| Constants (data-only) | Profile is JSON config of constants. Profiles are pure data; easy to author. Genre-specific non-data rules can't be added without code change. | |
| Hooks (code interface) | Profile is TS module exporting fixed hook functions. Most flexible; heaviest to version; profile authors write code. | |
| Data + optional hooks (Recommended) | Declarative JSON config PLUS small fixed set of OPTIONAL override hooks. Core reads config; hook present→call, absent→data default. techno v1 = JSON only. | ✓ |

**User's choice:** Data + optional hooks (Recommended)
**Notes:** ARCH-02 satisfied: no profile = all defaults.

### Q3 — Where does electronic/techno live, and how is the active profile chosen?

| Option | Description | Selected |
|--------|-------------|----------|
| Techno = daemon default | techno auto-loaded; generic defaults ARE techno constants. profile:null forces profile-free mode. | |
| Generic default, techno opted-in (Recommended) | Daemon ships strict generic core (neutral defaults). techno is a SEPARATE profile opted into via intent.json (profile:"techno"). ARCH-02 literally true. | ✓ |
| Per-project in .bw-brain/ | Profile lives per-project; intent.json names active. M3 cross-project is far; first profile should ship with bw-brain. | |

**User's choice:** Generic default, techno opted-in (Recommended)
**Notes:** Out-of-box is "generic neutral"; producer authors intent.json before transforms feel genre-appropriate.

### Q4 — How does Pi /vary + /apply + the diff pane present the A/B/C variants (UX-02)?

| Option | Description | Selected |
|--------|-------------|----------|
| Summaries + on-demand diff (Recommended) | /vary lists A/B/C as summary lines (label + transform + risk + motif-similarity + patchId), no inline diffs. /apply <patchId> runs apply (--confirm med/high). Diff pane on-demand via /diff <patchId>. | ✓ |
| Inline diffs for all | /vary renders all 3 variants' full diffs inline. Everything visible; dense; motif score buried. | |
| Auto-render best candidate | /vary auto-renders first/best diff, re-renders on highlight. Presumes TTY pane model Pi may not support cleanly. | |

**User's choice:** Summaries + on-demand diff (Recommended)
**Notes:** Maps 1:1 to the two-step CLI; keeps picking signal (motif-similarity) visible.

---

## the agent's Discretion

- **Note identity mechanism** — binding invariants: consistent with diff-logic.ts Note.key, revert can mechanically find the note, don't over-engineer note-sids for single-clip scope. Researcher/planner pins exact scheme.
- **`--force` vs `--confirm` exact flag names** — invariant: "no interactive prompt; every apply deliberate; med/high need explicit override flag." Researcher/planner finalizes names.
- **Motif signature caching** — MIDI-01 is the FIRST analyzer plugged into P2 D-08 analyzer-registry. Durable vs ephemeral caching is researcher/planner's call; invariant: "reuses D-08 interface, no parallel pipeline."
- **ARCH-01 hook set** — "small fixed set of optional override hooks" — researcher designs which hooks; electronic/techno v1 ships JSON-only so the contract is exercised only when a real need emerges.
- **Undo-coalescing probe + motif signature algorithm** — ROADMAP-flagged research items; the agent handles them.

## Deferred Ideas

- **Multi-clip / multi-track patch scope** — P3 ships single cursor-clip only. Multi-clip and multi-track deferred to a later phase (bridge has ONE PinnableCursorClip today; adding clip-enumeration/re-target surface is its own phase). SC#3 multi-track = high enforced as hard error in P3.
- **Profile hook implementations beyond JSON** — electronic/techno v1 ships JSON-only; optional override-hook mechanism is designed but exercised only when a real non-data constraint emerges.
- **Per-project profile customization** — profiles ship inside the daemon package; per-project crafting in .bw-brain/ ties to MEM-03 cross-project memory (far future).
