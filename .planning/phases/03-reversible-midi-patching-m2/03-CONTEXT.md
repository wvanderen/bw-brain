# Phase 3: Reversible MIDI Patching (M2) - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The M2 **trust-spine + creative-MIDI** milestone. The assistant produces musically sane, motif-preserving, fully reversible MIDI transforms through a preview/diff/apply pipeline with **daemon-authoritative undo** and risk gating — the trust backbone for every creative feature that follows. 14 requirements: EDIT-01..06 (patch schema + preview/diff/apply/revert + risk gating), MIDI-01..05 (motif signature + vary/counterline/voice-leading-fix/humanization), UX-02 (Pi `/vary` + `/apply` + diff pane), ARCH-01/02 (genre-profile interface + generic core). Success criteria are in `.planning/ROADMAP.md` §Phase 3.

**Scope anchor (from discussion):** every mutation flows through a validated patch object at every boundary (no direct-mutation path exists); revert is daemon-authoritative via `patch-history.jsonl` (Bitwig native undo is caveated, NOT relied on — capabilities §1 verified there is NO labelled-undo API); transforms default to preserve-motif-identity and below-threshold = refuse rather than guess. MIDI-only in P3 — automation stays EMPTY (P2 D-04; AUTO-01 is Phase 5). Single cursor-clip blast radius (multi-clip/multi-track deferred).

**What P3 is NOT:** no arrangement intelligence (P4), no automation workflows (P5), no multi-clip/multi-track edits (deferred), no VST param enumeration (A1 NEGATED in P2; deferred to P5).

</domain>

<decisions>
## Implementation Decisions

### Patch Operation Catalog (EDIT-01)
- **D-01 — Hybrid catalog (primitives canonical, semantics as metadata):** The patch operation union is **primitive CRUD**: `add_note`, `remove_note`, `update_note_field` (carrying before+after). These are the CANONICAL wire format the bridge applies, the diff understands, and revert inverts. Semantic transform names (`humanize`, `voice_lead_fix`, `counterline`, `midi_velocity_scale`, … from seed §data model) ride in a separate **`transformIntent` metadata field** for human/audit readability — the bridge NEVER branches on them. Rationale: compact intent + uniform execution; the bridge `apply.patch` handler stays tiny (3 primitive cases); diff/revert logic is single-mechanism. The envelope-level trust-spine (P1 `edit.schema.json`: `undoLabel` required + `operations` non-empty) is unchanged; P3 tightens the operation `items` from `{type:object}` to the discriminated primitive union.
- **D-02 — Single cursor-clip scope (multi deferred):** P3 patches target the currently-selected/pinned clip ONLY. `scope.clipSid` is REQUIRED and MUST match the live cursor clip; a patch declaring >1 `trackSid` is a hard error (SC#3 "multi-track = high by definition" enforced as reject, not gated). Multi-clip (sibling launcher clips on the cursor track) and multi-track are explicitly **deferred** — the bridge has ONE `PinnableCursorClip` today; adding clip-enumeration/re-target surface is out of P3 scope. Counterline writes its new voice into the SAME clip as the source.
- **D-03 — Self-reversing primitive ops (EDIT-05):** Each primitive op is **self-inverting at creation time**: `add_note` carries the note (inverse = `remove_note`); `remove_note` carries the note (inverse = `add_note`); `update_note_field` carries both `before` and `after` (inverse = swap). `patch-history.jsonl` records applied patches in order; `bw-edit revert <patchId>` replays inverse ops in reverse. No snapshot storage, no computed-at-revert ambiguity. Aligns with capabilities §1 (daemon-authoritative, no native labelled undo).

### Preview → Apply Workflow (EDIT-02/04/06)
- **D-04 — Two-step explicit, NO interactive prompt:** `bw-edit preview <patch>` emits a preview JSON (diff + risk class + `patchId`); `bw-edit apply <patchId>` is a SEPARATE call that does the apply. There is no `y/N` interactive prompt anywhere in the CLI. Low-risk: apply is one extra explicit call; medium/high: `apply` requires a `--confirm` flag (still explicit, no prompt). Rationale: shell-composable, Pi-friendly (Pi `/apply` IS the second step), honors "no background edits" — every apply is a deliberate second action. `--force` on apply bypasses the medium/high `--confirm` gate (the apply is still explicit and still recorded in history); researcher/planner pins exact flag names, the invariant is "no interactive prompt, every apply deliberate, med/high need an explicit override flag."
- **D-05 — Daemon in-memory candidate store (ephemeral):** Candidate patches live in a **daemon in-memory ephemeral store keyed by `patchId`**, minted at preview time. `bw-edit apply <patchId>` looks it up. Lost on daemon restart — acceptable because candidates are ephemeral per MEM-02. `bw-midi vary` returns 3 `patchId`s (A/B/C); the user picks one to apply. `patch-history.jsonl` records ONLY applied patches, NEVER candidates. This satisfies the MEM-02 hard boundary (ephemeral session memory never writes to the durable store) and D-07 (daemon = single source of truth).
- **D-06 — Preview reuses `computeStateDiff`:** `bw-edit preview` resolves the patch ops against the current clip state in-memory, then calls the EXISTING `computeStateDiff(before, after)` from `daemon/src/cli/diff-logic.ts`. Preview output is a **`StateDiff`** (`notesAdded`/`notesRemoved`/`notesChanged` + `automationTouched` + `scopeTrackSids`) — the SAME shape `bw-diff` emits. `bw-diff` stays state-vs-state (two raw-state files, P2 D-05); `preview` is patch-vs-live-state. The UX-02 diff pane renders ONE shape. SC#1's round-trip property (proven by `diff-logic.test.ts`) covers preview too.
- **D-07 — Risk class: author declares, daemon floors (EDIT-06):** Each transform mints its patch WITH a self-declared risk class (`humanize`→low, `voice-leading-fix`→low, `counterline`→medium, broad rewrites→high). The daemon VALIDATES the declaration against a fixed ruleset (note count touched, field types, blast radius) and may **UPGRADE (never downgrade)** if content warrants higher risk. A scope mismatch (`scope.touched ⊋ scope.declared`) hard-errors regardless of declared class. Risk IS an assumption (UX-06) — it surfaces in `assumptions[]`.

### Transform Refusal Shape (MIDI-01/02)
- **D-08 — Refuse + show near-miss:** When nothing clears the motif-preservation bar, the transform emits an **empty primary result** (`status: "refused"` + refusal reason + `assumptions[]`) AND additionally surfaces the **closest near-miss as a tagged `belowBarCandidate`** with its motif-similarity score + a caveat. Default path refuses; the near-miss is visibility, not an applicable candidate. Honors the strict "below-threshold = refuse rather than guess" stance while giving the producer margin awareness.
- **D-09 — Below-bar override = HIGH risk + audit:** A below-bar near-miss CAN be applied ONLY via an explicit `--allow-below-bar` flag that **reclassifies the patch as HIGH-risk** (still requires `--confirm`) AND stamps the patch metadata `belowBar: true` + the motif-similarity score into `patch-history.jsonl`. The default path still refuses; the override is a deliberate, auditable, high-risk escape hatch. No silent degradation.
- **D-10 — Tiered motif check (creative vs cleanup):** "Creative" transforms (`vary`, `counterline`) run the FULL motif-preservation check with a meaningful threshold and CAN refuse. "Cleanup" transforms (`voice-leading-fix`, `humanize`) run a TRIVIAL/relaxed check (or skip the creative gate) — MIDI-04/05 are documented low-risk; a humanize that refused because it "changed the motif" would be a bug, not a feature. The motif signature itself is computed over the source clip (or the declared region) — see D-11.
- **D-11 — Region-aware transform target:** Default is whole clip, BUT if the patch `scope` declares a `region: {start, end}` in beats (already in the P2 `project-state.schema.json` selection shape), the transform operates ONLY there. The motif signature is computed over the region with the full clip available as CONTEXT. Reuses the existing region field; non-breaking default.

### Musical Knowledge Source (MIDI-03/04, ARCH-01/02, UX-02)
- **D-12 — Harmonic center: authored default + inferred fallback:** Default source is **user-authored in `intent.json`** — extend STATE-03 with an optional `harmonicCenter: {key, mode}` field (e.g. `{key: "A", mode: "minor"}`). If `harmonicCenter` is absent, a transform MAY run a **one-shot inference** (tonal `Key`/`Scale` detection over the clip's pitch-class profile) with an explicit `assumptions[]` entry `"harmonicCenter: inferred, confidence: X"` stamped on the patch — and only for low-risk-tolerant transforms. Producer opts into inference by leaving `intent.json` blank; the patch history records which patches used inferred harmony. No silent guessing.
- **D-13 — Genre profile = data + optional hooks (ARCH-01):** A profile is a **declarative JSON config of constants** (default motif-similarity thresholds per transform type, typical velocity-humanize curves, role→motif-salience weights, preferred scales/modes for the inferred-harmony fallback) **PLUS a small, fixed set of OPTIONAL override hooks** for genre-specific constraints that cannot be expressed as data. The generic core reads the config; if a hook is present, calls it; if absent, uses the data default. `electronic/techno` v1 ships **JSON-only** (no hooks) — the hook contract is exercised only when a real need emerges. ARCH-02 satisfied: no profile = all hardcoded neutral defaults.
- **D-14 — Generic default, techno opted-in (ARCH-02):** The daemon ships a STRICT generic core (hardcoded neutral defaults, no genre flavor). `electronic/techno` is a **SEPARATE profile the producer OPTS INTO** via `intent.json` (`profile: "techno"`). If no profile is named, the generic core runs as-is — ARCH-02 ("generic core runs without a profile") is literally true. The `electronic/techno` profile ships inside the daemon package (e.g. `daemon/src/profiles/techno.json`) so the daemon can load it directly.
- **D-15 — Pi `/vary` summaries + on-demand diff pane (UX-02):** `/vary` runs `bw-midi vary` and lists the A/B/C candidates each as a SUMMARY line (label + transform type + risk + motif-similarity + one-line description + `patchId`) — NO inline diffs. The user picks (`apply B` or by number); `/apply <patchId>` runs `bw-edit apply` (`--confirm` for med/high). The DIFF PANE renders ON-DEMAND when the user asks (`/diff <patchId>` or "preview B") — showing the `StateDiff`. Maps 1:1 to the two-step CLI; keeps the picking signal (motif-similarity) visible instead of buried under note detail.

### the agent's Discretion
- **Note identity mechanism (D-01/D-03):** binding invariants — must be **consistent with the existing `diff-logic.ts` `Note.key`** (so `bw-edit preview` diff and `bw-diff` share identity), must let `revert` mechanically find the same note, and must NOT over-engineer note-sids if a content-key suffices for single-clip scope. Researcher/planner pins the exact key scheme.
- **`--force` vs `--confirm` exact flag names (D-04):** the binding intent is captured above; researcher/planner finalizes names. Invariant: "no interactive prompt; every apply is a deliberate action; med/high need an explicit override flag."
- **Motif signature caching (MIDI-01):** MIDI-01 is the FIRST analyzer plugged into the P2 D-08 analyzer-registry framework. Whether the signature caches in durable derived state (`state-cache.json`) vs ephemeral is the researcher/planner's call; binding invariant: "reuses the D-08 analyzer-plugin interface, does NOT invent a parallel pipeline."
- **ARCH-01 hook set (D-13):** "small fixed set of optional override hooks" — the researcher designs which hooks (candidates surfaced in discussion: `motifSalience`, `constrainTransform`, `defaultThreshold`). `electronic/techno` v1 ships JSON-only so the hook contract is exercised only when a real need emerges; the interface is designed to be additive.
- **Bitwig undo-coalescing + motif signature ALGORITHM:** ROADMAP-flagged research items. The undo-coalescing probe (capabilities §1, PENDING in-app) refines the user-facing "undo step count" caveat ONLY — it does NOT change the daemon-authoritative spine (D-03). The motif signature algorithm specifics (chroma/rhythm features adapted from librosa concepts to MIDI) are the researcher's domain.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bitwig capability surface (design-lock inputs — start here)
- `docs/bitwig-capabilities.md` §1 Undo Behavior — **VERIFIED: NO labelled-undo API** (`undoAction()` returns an unlabelled action; no `undo(label)`/`beginUndoTask(name)`). Consequence: `undoLabel` in `edit.schema.json` is bw-brain's own label (recorded in `patch-history.jsonl`), NOT a Bitwig label. Daemon-authoritative revert (D-03) is the ONLY reliable path. The coalescing-window + per-note-vs-batch undo-step probe is PENDING in-app but refines ONLY the user-facing caveat, not the spine.
- `docs/bitwig-capabilities.md` §2 Note-Editing Scope — **VERIFIED: `NoteStep`-based** (`velocity`, `duration`, `pressure`, `start`, `pitch` + setters; `Clip.scrollToStep(int)`). `PinnableCursorClip extends CursorClip`. The P3 bridge `apply.patch` handler uses this surface. Free-beat-vs-grid-locked + launcher-vs-arranger round-trip probe is PENDING; mitigation already documented (route launcher-only; size gridWidth to shortest note if grid-locked).
- `docs/bitwig-capabilities.md` §6 Stable IDs — Bitwig exposes NO native note id → note identity (D-01 agent discretion) must be content-derived or daemon-synthesized.

### Frozen schemas (the contracts P3 tightens/extends)
- `schemas/protocol/edit.schema.json` — the trust-spine envelope. P3 tightens `payload.operations.items` from `{type:object}` to the primitive discriminated union (D-01) and adds the `transformIntent` metadata field. `undoLabel` + non-empty `operations` stay MANDATORY.
- `schemas/project-state.schema.json` — the raw-state model. `selection.region: {start, end}` (beats) is the field D-11 region-aware transforms reuse. `clips` items are open objects ("element shape tightened in Phase 3") — P3 reconciles the clip/note shape against `daemon/src/cli/diff-logic.ts` `Note`.
- `schemas/intent.schema.json` — STATE-03 intent. P3 extends with optional `harmonicCenter: {key, mode}` (D-12) and `profile: "techno"` (D-14).
- `schemas/protocol/{envelope,event,request,response,handshake}.schema.json` — the rest of the frozen JSON-Lines contract. P3 adds NO new bridge envelopes; `apply.patch` already exists.

### Existing daemon + CLI spine (reuse, do not fork)
- `daemon/src/cli/diff-logic.ts` — **the pure diff logic P3 reuses verbatim** (D-06). `Note = {key, pitch, start, length, velocity}`, `computeStateDiff(a,b)` → `StateDiff`, `applyDiff(base, diff)` lossless round-trip. P3's `bw-edit preview` calls `computeStateDiff` after resolving patch ops against live state. SC#1 property test (`diff-logic.test.ts`) covers preview.
- `daemon/src/cli/commands/edit.ts` — the **M1 STUB** P3 replaces. `emitStub({name:"bw-edit", availableFrom:"M2"})`. P3 implements `preview`, `apply`, `revert` subcommands.
- `daemon/src/cli/commands/midi.ts` — the **live `bw-midi inspect`** pattern P3 extends with `vary`/`counterline`/`voice-leading-fix`/`humanize` subcommands (queries daemon via `query-client`).
- `daemon/src/cli/commands/diff.ts` — the live state-vs-state `bw-diff` (stays as-is per D-06).
- `daemon/src/cli/query-client.ts` — the UDS thin-client all live CLI commands use to query the daemon (D-07 P2).
- `daemon/src/state/analyzer-registry.ts` — the D-08 analyzer-plugin interface. MIDI-01 motif signature is the FIRST analyzer plugged in here (binding: reuse, no parallel pipeline).
- `daemon/src/state/intent-store.ts` — the atomic validated read for `intent.json`. P3 extends the schema + store for `harmonicCenter` + `profile`.
- `daemon/src/store/atomic-write.ts` — atomic temp+rename used by `state-cache.json`; `patch-history.jsonl` MUST use the same atomic-write discipline (append-only line journal + atomic rename on rotate).
- `daemon/src/store/boundary.ts` — the MEM-02 hard boundary (ephemeral session memory never writes to durable). The candidate store (D-05) lives on the daemon side as IN-MEMORY; it MUST NOT cross into `.bw-brain/`.

### Bridge (P3 adds the apply.patch handler)
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` — **NO `apply.patch` case exists today** (only `get.selected_clip`/`get.selected_device_chain`/`get.project_summary`). P3 adds the `case "apply.patch"` branch that consumes primitive ops and mutates `PinnableCursorClip` via `NoteStep` setters. The `handleSelectedClip` grid-walk (`getStep(x,y,0)`, velocity>0 → `NoteView`) is the read pattern the apply path mirrors for write.
- `bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java` — `cursorTrack.createLauncherCursorClip(16, 128)` (GRID_W=16, GRID_H=128). The apply handler reuses this cursor clip reference.
- `bridge/src/main/java/com/bwbrain/bridge/LineJson.java` — the response/error line builders the apply handler replies with.

### Project intent & constraints (do not re-litigate)
- `.planning/PROJECT.md` §Constraints + §Key Decisions + §Guardrails — patch model (scope/operations/rationale/reversibility/risk); trust model (low one-step, med/high confirm); risk classes (low: humanize/cleanup/macro; medium: add/remove few notes, section dup; high: reharmonization, broad arrangement, multi-track); "CLI is the stable interface, not the agent"; "no background edits; no edit without a patch object; every patch gets an undo label; every suggestion states assumptions."
- `.planning/REQUIREMENTS.md` — Phase 3's 14 requirements: EDIT-01..06, MIDI-01..05, UX-02, ARCH-01, ARCH-02.
- `.planning/ROADMAP.md` §Phase 3 — goal, 5 success criteria, UI hint: yes, research items (undo-coalescing, motif signature algorithm).
- `.claude/AGENTS.md` — repo engineering rules: NodeNext ESM `.js` import rule; Node ≥22.19 / TS 5.7+; Ajv 2020-12 named-import quirk (`import { Ajv2020 } from "ajv/dist/2020.js"`); standalone-compiled validators; loopback-only bind invariant; `addFormats` deliberately NOT used.

### Seed design (the vision this phase realizes)
- `docs/seed.md` §"The data model" §D (Patch & diff model: `scope → operations → rationale → reversibility`) — the patch shape EDIT-01 operationalizes.
- `docs/seed.md` §"Proposed local protocol" — the `apply.patch` example with `undoLabel` (already frozen in `edit.schema.json`).
- `docs/seed.md` §"MVP build plan / Milestone 2" — the M2 ship list (patch schema, preview/diff/apply, subtle variation, counterline, voice-leading cleanup, Pi `/vary` + `/apply`).

### Prior phase context (the spine P3 extends — do not re-litigate)
- `.planning/phases/02-read-only-context-foundation-m1/02-CONTEXT.md` — Phase 2 decisions. **Critical:** D-04 (automation reserved EMPTY in M1 — P3 is MIDI-only, automation is P5); D-07 (daemon = source of truth, CLI = thin client over UDS separate from bridge port 7878); D-08 (analyzer-plugin interface exists, MIDI-01 plugs in here); D-09 (intent user-authored, no inference — P3's D-12 adds a disclosed fallback); D-10 (assumptions[] on every suggestion); D-12 (Pi wraps the CLI; CLI contract tested, Pi smoke-validated).
- `.planning/phases/01-schema-ipc-spike/01-CONTEXT.md` — Phase 1 decisions (the kept daemon spine, transport decision rule, protocol freeze). Trust-spine enforcement at schema level.

### To Be Produced (this phase's outputs)
- `schemas/patch.schema.json` (EDIT-01) — the patch object contract (scope → operations → rationale → reversibility → risk) with the primitive operation discriminated union + `transformIntent` metadata.
- The daemon in-memory candidate store + `bw-edit preview`/`apply`/`revert` + the motif-signature analyzer (MIDI-01) + the four MIDI transform subcommands + the genre-profile loader.
- The bridge `apply.patch` handler in `PullHandlers.java`.
- The `electronic/techno` profile JSON (shipped inside the daemon package).
- The Pi `/vary` + `/apply` skills + the diff pane.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`computeStateDiff` / `applyDiff`** (`daemon/src/cli/diff-logic.ts`) — the pure diff P3's `bw-edit preview` reuses verbatim (D-06). `Note` shape + `StateDiff` shape already defined and property-tested. Do NOT fork a patch-vs-state diff; resolve ops → state, then diff.
- **`query-client` UDS thin client** (`daemon/src/cli/query-client.ts`) — every live `bw-*` command queries the daemon through it. `bw-edit`/`bw-midi vary` follow the same pattern.
- **`analyzer-registry`** (`daemon/src/state/analyzer-registry.ts`) — the D-08 plugin interface. MIDI-01 motif signature registers here; no parallel pipeline.
- **`intent-store`** (`daemon/src/state/intent-store.ts`) — atomic validated read of `intent.json`. Extend for `harmonicCenter` + `profile`.
- **`atomic-write`** (`daemon/src/store/atomic-write.ts`) — temp+rename discipline. `patch-history.jsonl` MUST use it (append-only journal + atomic rename on rotate).
- **Ajv 2020-12 standalone-compiled validators** — the boundary-validation pattern (compiled once at boot). The new `patch.schema.json` validator follows it.
- **`scripts/gen-types.mjs`** — the `$id`-aware JSON-Schema → TS bundler. The new patch schema MUST go through it, not literal json2ts.
- **Bridge `NoteView`/`handleSelectedClip` grid-walk** (`PullHandlers.java`) — the read pattern (`getStep(x,y,0)`, velocity>0) the `apply.patch` write path mirrors via `NoteStep` setters.
- **`tonal` 6.4.3** (STACK.md) — already chosen for M2+ motif pitch-class / scale-degree / Key detection (D-12 inferred-harmony fallback, MIDI-01 signature).

### Established Patterns
- **Validate at every boundary** — Ajv-compiled-once; never let invalid structures reach handler logic. The patch object is validated at daemon entry, CLI emit, AND bridge apply (EDIT-01).
- **Loopback-only security invariant (Pitfall 5)** — any listener REFUSES non-loopback hosts. P3 adds no new listener (uses the existing bridge TCP 7878 for apply.patch daemon→bridge; UDS for CLI→daemon), but the invariant still governs.
- **NodeNext ESM `.js`-import rule** — all relative imports in `.ts` sources MUST end in `.js`.
- **Trust-spine at schema level** — `edit.schema.json` enforces `undoLabel` + non-empty `operations`; P3's primitive union inherits this enforcement.
- **Pure-function + I/O split** — diff-logic.ts is the canonical example (pure logic in its own file, property-tested; I/O-bound commander wrapper separate). MIDI transforms + risk-classifier + motif signature should follow the same split.
- **Stack:** Node ≥22.19, TS 5.7+, strict, vitest, commander 15, ajv 8.20, tonal 6.4.3. `daemon/package.json` is ESM (`"type": "module"`).

### Integration Points
- **Bridge ↔ daemon:** `127.0.0.1:7878` TCP, JSON-Lines. P3 adds the daemon→bridge `apply.patch` request (already in the frozen `edit.schema.json` envelope) + the bridge `case "apply.patch"` handler. The bridge TCP port stays bridge-only (D-07 P2).
- **CLI ↔ daemon:** UDS (the existing query channel). `bw-edit preview`/`apply`/`revert` and `bw-midi vary`/etc. query the daemon via `query-client`. The daemon holds the in-memory candidate store + writes `patch-history.jsonl`.
- **Pi ↔ CLI:** the Pi `/vary` + `/apply` + `/diff` skills shell out to the `bw-*` CLI (D-12 P2); no direct Pi↔daemon path.
- **Memory:** `.bw-brain/patch-history.jsonl` is the durable append-only applied-patch journal (daemon-authoritative undo spine, D-03). Candidate patches are EPHEMERAL in-memory only (D-05, MEM-02 boundary). `intent.json` gains `harmonicCenter` + `profile`.

</code_context>

<specifics>
## Specific Ideas

- The user's recurring stance — *"below-threshold = refuse rather than guess"* — governs every P3 transform: refuse + show near-miss (D-08), override = high-risk + audit (D-09), tiered creative/cleanup check (D-10), and the authored-default + inferred-FALLBACK harmonic center with disclosed assumptions (D-12). No silent guessing anywhere.
- *"Accurate first; creative later"* (PROJECT Core Value) is the reason P3 ships the full trust-spine (patch schema + preview + daemon-authoritative revert + risk gating) BEFORE the creative transforms lean on it — the spine is the deliverable; the transforms prove it.
- The hybrid operation catalog (D-01) is deliberate: the user wants compact intent (`transformIntent: "counterline"`) WITHOUT forcing the bridge/diff/revert to understand a growing semantic catalog. Primitives are the contract; semantics are the label.
- Two-step explicit (D-04) over interactive prompt: the user wants every apply to be a deliberate second action — "no background edits" operationalized as "no implicit apply, ever."
- Generic-default-techno-opted-in (D-14) over techno-as-default: ARCH-02 ("generic core runs without a profile") must be literally true, not a fiction where the "generic" defaults are secretly techno-flavored.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-clip / multi-track patch scope** — P3 ships single cursor-clip only (D-02). Multi-clip (sibling launcher clips on the cursor track) and multi-track edits are explicitly deferred — the bridge has ONE `PinnableCursorClip` today; adding clip-enumeration/re-target surface is its own later phase. SC#3 "multi-track = high" is enforced as a hard error in P3 (reject, not gate). Noted for the roadmap backlog.
- **Profile hook implementations beyond JSON** — `electronic/techno` v1 ships JSON-only (D-13). The optional override-hook mechanism is designed but exercised only when a real genre-specific constraint emerges that data cannot express.
- **Per-project profile customization** — profiles ship inside the daemon package (D-14). Per-project profile crafting in `.bw-brain/` is a later concern (ties to MEM-03 cross-project memory, far future).

None of these are new capabilities within P3's domain — all are intentionally left for later phases or the roadmap backlog.

</deferred>

---

*Phase: 3-Reversible MIDI Patching (M2)*
*Context gathered: 2026-06-29*
