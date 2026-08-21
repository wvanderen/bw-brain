# Roadmap: bw-brain

## Overview

bw-brain is a local-first intelligence layer for Bitwig, now centered on a verified hybrid CLAP companion. The Java controller bridge remains the authoritative Bitwig reader/mutator; the TypeScript daemon owns normalized state, policy, sessions, proposals, and the bounded Pi reasoning runtime; the CLAP editor is the primary producer-facing workspace; and the CLI remains the stable secondary automation/diagnostic contract. Every mutation still flows through `scope → operations → rationale → reversibility → risk → preview → apply`, and raw audio never leaves the plug-in.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Schema & IPC Spike** - Prove Bitwig TCP access, freeze the JSON-Lines contract, document the verified API surface before any production bridge work (completed 2026-06-26)
- [x] **Phase 2: Read-Only Context Foundation (M1)** - Bridge mirror + daemon normalization + read CLI + memory bootstrap + Pi /analyze — the assistant reliably describes selected context (completed 2026-06-27)
- [ ] **Phase 3: Reversible MIDI Patching (M2)** - Patch/diff/preview/apply/risk backbone + daemon-authoritative undo + motif signature + MIDI transforms + Pi /vary /apply (all 5 plans executed; BLOCKING end-of-phase UAT M1–M5 pending human — status: verifying)
- [x] **Phase 4: Arrangement Intelligence (M3)** - Section/repetition/energy/transition analysis + track-role classification + Pi /review — project-level critique (observation/suggestion only) (completed 2026-07-07)
- [x] **Phase 04.1: CLAP Capability & Host Evidence Gate** - Complete with direct live MIDI sample-offset evidence and reconciled gate traceability
- [x] **Phase 04.2: Hybrid CLAP Companion Product** - Complete thin CLAP companion with two-mode macOS host evidence for D-01–D-16 (completed 2026-08-20)
- [ ] **Phase 04.3: CLAP-First Product Rebaseline** - Reconcile product ownership, bring arrangement review into CLAP, retire obsolete external-Pi UX assumptions, and prepare Phase 5
- [ ] **Phase 5: Automation & Device Workflows (M4)** - CLAP-native device/automation inspection and proposals across native and third-party chains

## Phase Details

### Phase 1: Schema & IPC Spike

**Goal**: Confirm Bitwig JVM localhost TCP access (or lock the stdio-relay fallback), freeze the JSON-Lines protocol contract both halves build against, and document the verified API surface before any production bridge code is written — eliminating the single highest-risk structural unknown.
**Mode**: mvp
**Depends on**: Nothing (first phase)
**Requirements**: PROBE-01, PROBE-02
**Success Criteria** (what must be TRUE):

  1. A throwaway Bitwig extension connects to an external process over a real transport (TCP confirmed, or stdio-relay fallback chosen with rationale) and delivers at least one real `selection.changed` event end-to-end through the daemon to a CLI print.
  2. `docs/bitwig-capabilities.md` exists and is grounded in in-app verification of the scripting guide — documenting note-editing scope, automation write, bank paging, observer granularity, and undo behavior — so bridge design locks against API reality, not assumption.
  3. The JSON-Lines protocol contract (`schemas/protocol/*`) is frozen enough to build against: versioned messages, atomic-line writes, a partial-line buffer, and an explicit backpressure rule.

**Plans**: 2/3 plans executed (Plan 03 at human checkpoint)
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Freeze the JSON-Lines protocol contract (6 JSON Schema 2020-12 files) + daemon ESM scaffold + generated TS types + capabilities-doc validator (autonomous, Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Daemon framing pipe: transport abstraction (localhost-only TCP + stdio) + LineBuffer + version handshake + Ajv-at-boundary reader + bounded-queue backpressure + `bw-brain-spike dump` CLI proof (autonomous, Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [~] 01-03-PLAN.md — Bitwig-side spike: in-app capability probes → docs/bitwig-capabilities.md + transport proof + live SC#1 round-trip. **Task 1 (autonomous scaffold) complete — `b14a52d`; Tasks 2 + 3 are BLOCKING human-verify checkpoints** (Bitwig Studio 6.0.6 + optional JDK 21). PROBE-01 and PROBE-02 are PENDING the manual work. See `01-03-SUMMARY.md` → "Manual Steps Remaining."

**Research needed**: TCP socket access in the Bitwig JVM (the single highest-risk structural unknown — MEDIUM confidence); in-app verification of the Bitwig Developer Resources scripting guide to confirm exact API version + recent additions.

### Phase 2: Read-Only Context Foundation (M1)

**Goal**: The assistant reliably understands and describes the selected Bitwig context (clip/device/region/arrangement) through a stable CLI and a Pi `/analyze` skill — no editing. "Accurate first" made operational.
**Mode**: mvp
**Depends on**: Phase 1
**Requirements**: BRIDGE-01, BRIDGE-02, BRIDGE-03, STATE-01, STATE-02, STATE-03, STATE-04, CLI-01, CLI-02, CLI-03, MEM-01, MEM-02, UX-01, UX-05, UX-06
**Success Criteria** (what must be TRUE):

  1. Producer can select any clip/device/region in Bitwig and `bw-focus export` / `bw-project summary` / `bw-project region` return accurate JSON describing it — meeting a measured read-only accuracy bar (e.g., description matches human judgment >90% across ~20 representative clips; `bw-diff` round-trips 100%).
  2. `bw-midi inspect` returns correct notes/velocity/timing and `bw-device inspect` returns chain/parameters (including loaded VST/AU plugins) for the selected target.
  3. The daemon survives a bridge reload/restart without corrupting state: stable IDs reconcile on reconnect, `state-cache.json` stays consistent (atomic temp+rename), and a watchdog marks state stale (refusing edits) when the bridge is silent.
  4. Pi `/analyze` produces a critique + 2–4 next actions grounded in live selection/section/intent, every suggestion carries an `assumptions[]` field, and the state pane renders selected track/clip/device + section label.
  5. Durable project memory (`.bw-brain/`) and ephemeral session memory stay cleanly separated — experiment threads never write to the durable store (hard architectural boundary).

**Plans**: 8/8 plans complete
**UI hint**: yes
**Research needed**: bridge capability probe (Pitfall 1 — highest-risk item in the project); exact `CursorClip`/`CursorTrack`/`CursorDevice` observer surface; controller-thread scheduling semantics.
Plans:

- [x] 02-07-PLAN.md

**Wave 1** *(parallel — zero file overlap)*

- [x] 02-01-PLAN.md — Wire contracts foundation: 4 new JSON Schemas (project-state, intent, cli-query/{query,result}) + extend event/request enums + gen-types multi-dir + reader OBSERVATIONAL_EVENT_TYPES (Pitfall 1) (autonomous, Wave 1)
- [x] 02-02-PLAN.md — Java `.bwextension` bridge (Maven + ServiceLoader + full observer set + get.* pull handlers + live VST/AU + reload-reconcile human-verify) (autonomous: false — Task 3 blocking checkpoint, Wave 1)

**Wave 2** *(blocked on Wave 1 — trust-spine primitives lock before stateful consumers; zero file overlap between 02-03a and 02-04)*

- [x] 02-03a-PLAN.md — STATE-04 trust-spine PURE primitives: fingerprint + reconcile + atomicWriteJson + state-cache + their SC#3 held-out property tests (20-track reorder reconcile, N=20-parallel atomic write, fingerprint determinism) (autonomous, Wave 2)
- [x] 02-04-PLAN.md — Multicall CLI thin client: `bw-brain` binary + 8 subcommands (5 live + 3 stubs) + UDS query-client + bw-diff pure logic (SC#1 round-trip) + dump.ts deleted (autonomous, Wave 2)

**Wave 3** *(blocked on Waves 1+2 — 02-03b consumes 02-03a primitives; 02-05 consumes 02-03b query-server; full live stack required)*

- [x] 02-03b-PLAN.md — Stateful daemon layer + D-07 UDS query channel: stale-watchdog (SC#3 surfacing) + analyzer-registry (IntentAnalyzer only, D-08) + intent-store (D-09) + normalizer (STATE-01) + MEM-02 boundary (SC#5) + UDS transport (Pitfall 5 0600) + query-server (autonomous, Wave 3)
- [x] 02-05-PLAN.md — Pi `/analyze` pack (SKILL.md wrapping the CLI) + describe() literal grounded description engine + SC#1 ~20-clip accuracy harness (>0.9 token-overlap) + live Pi smoke (D-12) + spike/ deletion (D-05/D-06) (autonomous: false — Task 3 blocking checkpoint, Wave 3)

**Gap Closure** *(post-execution UAT blocker — diagnosis in .planning/debug/extension-load-deprecated-getchannel.md)*

- [x] 02-06-PLAN.md — [GAP CLOSURE] Fix the deprecated `TrackBank` int-indexer call at Observers.java:139 (-> `Bank.getItemAt(int)`) that aborts `init()` and fails the extension load in Bitwig 6.0.6; correct the knowledge-loss comments (lines ~19, ~136-137) + docs/bitwig-capabilities.md §4/§5; add `scripts/check-deprecated-bridge.mjs` process gate so the regression class is caught at verification time, not live UAT; rebuild + live reload human-verify (autonomous: false — Task 2 blocking checkpoint, Wave 1; unblocks UAT Tests 2/3/4)

### Phase 3: Reversible MIDI Patching (M2)

**Goal**: The assistant produces musically sane, motif-preserving, fully reversible MIDI transforms through a preview/diff/apply pipeline with daemon-authoritative undo and risk gating — the trust backbone for every creative feature that follows.
**Mode**: mvp
**Depends on**: Phase 2
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-06, MIDI-01, MIDI-02, MIDI-03, MIDI-04, MIDI-05, UX-02, ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):

  1. Every mutation flows through a validated patch object (`scope → operations → rationale → reversibility → risk`) at every boundary — no direct-mutation path exists — and `bw-edit preview` renders a diff before any apply.
  2. `bw-edit revert <patchId>` fully reverses an applied patch via the authoritative `patch-history.jsonl`; Bitwig native undo is treated as best-effort and caveated, not relied upon.
  3. Risk gating enforces: low-risk edits are one-step, medium/high require explicit confirmation, multi-track = high by definition, and a scope mismatch (`scope.touched ⊋ scope.declared`) hard-errors.
  4. `bw-midi vary` produces A/B/C motif-preserving variants; counterline, voice-leading-fix, and humanization all default to preserve-motif-identity mode, and below-threshold transforms refuse rather than emit "casino MIDI."
  5. Pi `/vary` + `/apply` drive the edit pipeline with a diff pane rendering patch diffs; the genre-profile interface (ARCH-01) is in place with electronic/techno as the first profile, and the generic reasoning core runs without a profile (profiles enhance, never gate).

**Plans**: 5/5 plans complete
**UI hint**: yes
**Research needed**: Bitwig undo-grouping behavior (does the host auto-coalesce consecutive edits on a ~1s window?); motif signature algorithm (chroma/rhythm features adapted from librosa concepts to MIDI).
Plans:

**Wave 1** *(foundation — trust-spine primitives lock before I/O consumers)*

- [x] 03-01-PLAN.md — Trust-spine schema + pure primitives (patch.schema.json + inverse-ops + patch-resolve + risk-classifier + fast-check harness; INV-1..5,9,10) (autonomous, Wave 1)

**Wave 2** *(blocked on Wave 1 — pure primitives lock before I/O + musical knowledge; zero file overlap between 03-02 and 03-03)*

- [x] 03-02-PLAN.md — Trust-spine I/O end-to-end: candidate-store + patch-history + bw-edit preview/apply/revert + daemon edit.* dispatch + bridge handleApplyPatch + smoke (EDIT-02/04/05/06; INV-14) (autonomous, Wave 2)
- [x] 03-03-PLAN.md — Musical knowledge: motif-signature (MIDI-01) + harmonic-detect (D-12) + genre profiles (ARCH-01/02) (autonomous, Wave 2)

**Wave 3** *(blocked on Waves 1+2 — transforms consume primitives + musical knowledge; dispatch consumes Plan 02's query-server)*

- [x] 03-04-PLAN.md — MIDI transforms vary/counterline/voice-leading-fix/humanize → candidate patches + bw-midi extend + midi.* dispatch (MIDI-02..05; INV-7/8/11) (autonomous, Wave 3)

**Wave 4** *(blocked on Waves 2+3 — Pi skills shell to the CLI)*

- [~] 03-05-PLAN.md — Pi /vary /apply /diff skills (UX-02) + end-of-phase manual UAT M1..M5 (autonomous: false — Task 2 blocking checkpoint, Wave 4) — Task 1 done + committed; Task 2 (M1–M5 manual UAT) BLOCKING pending human (CHECKPOINT REACHED)

### Phase 03.1: Gap closure: clip-identity scope, apply pre-flight, bridge auto-reconnect, skill-prompt stale update (INSERTED)

**Goal**: Make "apply silently lands on the wrong clip" impossible, the bridge self-healing, and the Pi prompts honest about the relaxed freshness gate — closing the four trust-spine gaps surfaced by the 2026-07-04 live M4 UAT. The M4 UAT proved the Phase-3 reversible-patching mechanic works end-to-end (vary candidates 0.93–1.0 sim; 20-op apply/revert round-trip green) BUT exposed one critical blocker (apply can silently land on the wrong clip because `state.selection.clipSid` is never populated) plus three secondary gaps (no apply pre-flight, bridge dies on socket loss, Pi prompts contradict the relaxed daemon gate). No new creative capabilities; trust-spine hardening only. Phase 3's M1 (native undo step-count) + M5 (techno profile comparison) live UATs stay explicitly OUT of scope (D-12).
**Requirements**: No new requirement IDs (D-12) — work hardens Phase 3's EDIT-01/04/05, BRIDGE-01/03, STATE-04, UX-02, ARCH-01/02
**Depends on**: Phase 3
**Plans:** 6/6 plans complete

Plans:

**Gap Closure** *(post-UAT — Test [4,5] D-06 CLI surfacing gap; standalone, no deps)*

- [x] 03.1-06-PLAN.md — [GAP CLOSURE] CLI ok:false envelope surfacing: query-client.ts DaemonReplyError preserves the full wrong_clip_targeted envelope (expectedClipSid/actualClipSid/hint + real stateFreshness) + edit.ts catch blocks surface it verbatim (printConnectionError retained for the genuine socket-absent case) + edit.test.ts CLI-layer proof. Daemon UNCHANGED (query-server.test.ts:601-811 proves it correct). Closes UAT Tests [4,5]. (autonomous, Wave 1)

**Wave 1** *(parallel — zero file overlap between 01/02/04)*

- [x] 03.1-01-PLAN.md — [GAP CLOSURE] Bridge auto-reconnect lifecycle: Outbox.reset()+clear() (D-07/Pitfall 2) + BridgeExtension.startConnector while(running) loop + defensive exit() + 2 new JUnit tests + live-Bitwig reconnect checkpoint (autonomous: false — Task 3 blocking checkpoint, Wave 1)
- [x] 03.1-02-PLAN.md — [GAP CLOSURE] clipSid foundation: bridge ClipSid.java V1 sha256(trackSid:loopBeats) derivation (D-01 javap-definitive) + event.schema.json payload field (D-03a) + fold-event.ts push fold (D-03c) + boot.ts refreshSnapshot get.selected_clip pull (D-03d CONTEXT.md correction) + Observers/PullHandlers wiring (D-03a/b) + live-Bitwig clipSid-reads checkpoint (autonomous: false — Task 3 blocking checkpoint, Wave 1)
- [x] 03.1-04-PLAN.md — [GAP CLOSURE] Pi skill freshness-gate realignment: additive ## Freshness gate (D-10) section to vary/apply/diff SKILL.md + ## Wrong-clip targeting (D-04/D-06) section to apply/SKILL.md only + D-10/D-11 contract assertions in all 3 skill.test.ts (autonomous, Wave 1)
- [x] 03.1-05-PLAN.md — [GAP CLOSURE] Bridge-artifact staleness CI/verify gate: new scripts/check-bridge-artifact.mjs (sibling to check-deprecated-bridge.mjs / check-capabilities-doc.mjs) compares bridge/target/bw-brain.bwextension mtime vs newest source commit among the shade-plugin input set + check:bridge-artifact npm wiring in daemon/package.json — prevents the stale-.bwextension recurrence class that caused the Phase-03.1 UAT Test-3 blocker (autonomous, Wave 1)

**Wave 2** *(blocked on Wave 1 — Plan 03 reads selection.clipSid populated by Plan 02)*

- [x] 03.1-03-PLAN.md — [GAP CLOSURE] Apply/revert pre-flight gates: extended safeSendErr(details?) (D-06/Pitfall 8) + candidate-store previewClipSid + patch-history clipSid (D-04/05 plumbing) + handleEditApply + handleEditRevert gates refuse wrong_clip_targeted BEFORE bridge round-trip + CRITICAL blocker-closure tests + live-Bitwig pre-flight checkpoint (autonomous: false — Task 3 blocking checkpoint, Wave 2; unblocks the M4 UAT blocker end-to-end)

### Phase 4: Arrangement Intelligence (M3)

**Goal**: The assistant delivers genuinely useful project-level arrangement critique — sections, repetition, energy, transitions, and track roles — as observation/suggestion only (Bitwig's API cannot edit the arranger, so edits route through launcher clips or remain advisory).
**Mode**: mvp
**Depends on**: Phase 2 (raw model stable); enriched by Phase 3 (suggestions emit reversible patches) — can partially overlap Phase 3 if resourcing allows
**Requirements**: ARRANGE-01, ARRANGE-02, ARRANGE-03, ARRANGE-04, ARRANGE-05
**Success Criteria** (what must be TRUE):

  1. `bw-arrange sections` performs bottom-up temporal segmentation with confidence scores, and every derived section label carries its confidence to the user (below-threshold = refuse rather than guess).
  2. `bw-arrange repetition-report` produces a self-similarity report and `bw-arrange energy-curve` produces a per-bar energy curve over the project.
  3. Transition suggestions detect energy mismatches and repetition gaps between sections and propose small reversible patches — routing through launcher clips or remaining advisory, never touching the arranger directly.
  4. Track-role classification labels tracks (kick/bass/lead/pad/fx/hats/percussion) with confidence, persisted to `roles.json` (gates automation salience in Phase 5).
  5. The legacy Pi `/review` skill contract is retained as historical/CLI coverage; its unverified external arrangement-pane acceptance is superseded by Phase 04.3's CLAP-native UX-03.

**Plans**: 6/6 plans complete
**UI hint**: yes
**Research needed**: librosa.segment algorithm adaptation (`agglomerative`, `recurrence_matrix`) to MIDI/composition-state rather than audio; section-detection threshold tuning.

Plans:

- [x] 04-01-PLAN.md — Bridge cursor-walk (`get.launcher_clips`) + capabilities-doc probe (BLOCKING human-verify)
- [x] 04-02-PLAN.md — Pure primitives (scene-features, self-similarity) + state stores (snapshot, roles) + profile extensions
- [x] 04-03-PLAN.md — Section-detector + repetition-report analyzers (the self-similarity matrix pair)
- [x] 04-04-PLAN.md — Energy-curve + track-role-classifier analyzers (the composite pair)
- [x] 04-05-PLAN.md — M3_ANALYZERS registry + transition-suggest + query-server arrange.* dispatch + bw-arrange multicall CLI + boot/describe wiring
- [x] 04-06-PLAN.md — Pi `/review` skill + contract test (UX-03)

### Phase 04.1: CLAP Capability & Host Evidence Gate (INSERTED)

**Goal:** Produce reproducible toolchain, dependency, CLAP/Bitwig host, Controller API, and Pi package evidence that resolves Q1–Q4 without implementing the companion product.
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04
**Depends on:** Phase 4
**Success Criteria:**

  1. CMake and immutable native dependencies configure in `clap/build-capability`; the pinned validator runs from its deterministic build path.
  2. A throwaway validator-clean bundle records automated and live Bitwig behavior for pass-through, MIDI offsets, GUI, state, parameters, and optional track-info.
  3. A read-only Controller API probe records definitive project/Save As and selected-device metadata availability without changing controller TCP or mutation authority.
  4. The exact Pi package is inspected without installation, human-approved or rejected, and Q1–Q4 are recorded under `## Open Questions (RESOLVED)` with dated evidence.

**Plans:** 4/4 plans complete

Plans:
**Wave 1**

- [x] 04.1-01-PLAN.md — Isolated capability toolchain, immutable dependencies, deterministic validator, and non-installing Pi audit
- [x] 04.1-02-PLAN.md — Throwaway CLAP host/adapter capability probe in the isolated build

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04.1-03-PLAN.md — Read-only Controller API proof, live Bitwig/package evidence, and Q1–Q4 resolution

**Wave 3** *(verification gap closure; blocked on Wave 2 completion)*

- [x] 04.1-04-PLAN.md — Real-time-safe live MIDI offset measurement and final gate/roadmap reconciliation

### Phase 04.2: Hybrid CLAP Companion Product (INSERTED)

**Goal:** Deliver the thin CLAP companion specified by locked decisions D-01–D-16: an in-Bitwig focused workspace, aggregate-only real-time context, exact approved live-MIDI playback, confirmed multi-instance/project sessions, and controller/journal-preserving approval flows.
**Requirements**: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16
**Depends on:** Phase 04.1
**Status:** Complete — verified 2026-08-20
**Plans:** 11/11 plans complete

Plans:
**Wave 1**

- [x] 04.2-01-PLAN.md — Separate product build and frozen bounded CLAP contracts (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04.2-02-PLAN.md — Dedicated connection-aware targeted peer endpoint (Wave 2)
- [x] 04.2-03-PLAN.md — Persistent native instance identity and duplicate rekey (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04.2-04-PLAN.md — Nonce-bound authoritative controller correlation with apply.patch regression (Wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04.2-05-PLAN.md — Durable project/link/focus/fork transaction, lifecycle event, and early shared EditService (Wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04.2-06-PLAN.md — Exact Pi 0.84.0 real adapter, project session lifecycle, and post-fork rebind/rollback (Wave 5)
- [x] 04.2-07-PLAN.md — Aggregate-only RT telemetry and native peer worker (Wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 04.2-08-PLAN.md — Proposal revisions, atomic approval, and shared edit trust spine (Wave 6)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 04.2-09-PLAN.md — Exact phrase scheduler, ordered merge, and owned-note cleanup (Wave 7)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 04.2-10-PLAN.md — Device-panel/editor UI, explicit actions, and global Stop (Wave 8)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 04.2-11-PLAN.md — Cross-platform CI/validator and blocking macOS live UAT (Wave 9)

### Phase 04.3: CLAP-First Product Rebaseline (INSERTED)

**Goal:** Reconcile the product around the verified CLAP-first architecture, move the remaining arrangement-review acceptance surface into Bitwig, explicitly retire obsolete external Pi/TUI assumptions, define provider privacy, and leave Phase 5 with an implementation-ready CLAP-native contract.
**Requirements:** RB-01, RB-02, RB-03, RB-04, RB-05, UX-03
**Depends on:** Phase 04.2
**Success Criteria:**

  1. Project, roadmap, requirements, state, and operator documentation agree that CLAP is the primary UX, Pi is daemon-managed, the bridge owns Bitwig authority, and CLI is a supported secondary contract.
  2. Existing arrangement analyzers are reachable from confirmed CLAP scope and render bounded, readable section/repetition/energy/transition evidence and proposals in the hosted editor.
  3. The legacy Phase 4 external Pi `/review` UAT is classified as superseded or retained as CLI coverage; a focused CLAP arrangement UAT replaces it without rewriting completed history.
  4. Local-first behavior is explicit and testable: raw audio and mutation authority remain local; only bounded confirmed context may reach an explicitly configured remote reasoning provider.
  5. Phase 5 has a CLAP-native device/automation specification that reuses the verified proposal, approval, pre-flight, controller, and journal paths.

**Plans:** 2/5 plans executed
**UI hint:** yes
**Research needed:** map existing arrangement analyzers and legacy UAT to the Phase 04.2 proposal/session seams; determine the smallest readable arrangement presentation in the hosted editor.

Plans:
**Wave 1** *(parallel — zero file overlap)*

- [x] 04.3-01-PLAN.md — Documentation/operator reconciliation: regenerate generated agent instructions from rebaselined sources (incl. STACK.md source-row supersession), pi-pack README dated supersession, provider-policy + arrangement operator notes, historical-seed annotation, wired stale-phrase doc gate, CLI regression proof (RB-01, RB-02, RB-05 docs)
- [x] 04.3-02-PLAN.md — Daemon arrangement review path: additive arrangement.review frozen-schema member + golden negatives, pure bounded chunk-text render module (pure + advisory), transport-free evidence assembly extraction (CLI wire unchanged), confirmed-scope dispatch branch emitting conversation.chunk with zero Pi involvement, resolveAnalysisContext enrichment (RB-03, RB-05, UX-03 daemon half)
- [ ] 04.3-05-PLAN.md — Phase 5 implementation contract: code-grounded DOWNSTREAM-PLAN-NOTES naming the patch-schema automation-operation gap, device-chain reads, preview-edit enums, and mandatory reuse of verified authority seams (RB-04)

**Wave 2** *(blocked on Wave 1 — C++ encoder consumes the 04.3-02 schema contract)*

- [ ] 04.3-03-PLAN.md — CLAP readable presentation: conversation_ Label→TextEditor with the live-verified e8887b4 drawer configuration, diff-guarded scroll-retaining updates, chunk append/reset reducer with fail-closed bounds, hosted Review button + arrangementReview encoder arm (UX-03, RB-03 native half)

**Wave 3** *(blocked on Waves 1+2 — the joined flow is the acceptance surface)*

- [ ] 04.3-04-PLAN.md — Legacy 04-UAT classification (additive-only, committed) + focused 04.3-UAT ledger + blocking live Bitwig arrangement UAT (autonomous: false) (RB-03, UX-03 acceptance)

### Phase 5: Automation & Device Workflows (M4)

**Goal**: The CLAP companion helps with sound design and movement through confirmed device context, automation salience, macro/XY opportunities, and bounded automation proposals across native Bitwig and third-party device chains.
**Mode**: mvp
**Depends on**: Phase 04.3 (CLAP-first product contract), Phase 3 (patch model + risk gating), Phase 4 (energy/section signals + track roles inform salience)
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, UX-04
**Success Criteria** (what must be TRUE):

  1. Confirmed CLAP scope exposes the selected native or third-party device chain and reports per-track automation salience, with CLI inspection retained for diagnostics and scripting.
  2. The proposal drawer presents ranked macro/XY assignments with disambiguation and assumptions, never an unexplained single “best” target.
  3. Bounded automation curves are inspectable proposals and always use the existing candidate/pre-flight/controller/journal path as medium-risk edits requiring explicit confirmation.
  4. Device inspection and automation workflows cover third-party VST/AU plugins loaded in the chain, not just native Bitwig devices.
  5. The CLAP device workspace renders chain summary, parameter targets, macro opportunities, and mutation outcome; Pi remains behind the daemon and the CLI remains a secondary contract.

**Plans**: TBD
**UI hint**: yes
**Research needed**: automation salience statistics; bounded automation generation with genre-profile constraints.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 03.1 → 4 → 04.1 → 04.2 → 04.3 → 5
(Phase 4 may partially overlap Phase 3 — see its Depends-on note — but the default ordering is sequential.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & IPC Spike | 3/3 | Complete    | 2026-06-26 |
| 2. Read-Only Context Foundation (M1) | 8/8 | Complete    | 2026-06-29 |
| 3. Reversible MIDI Patching (M2) | 5/5 | Complete   | 2026-06-30 |
| 4. Arrangement Intelligence (M3) | 6/6 | Complete   | 2026-07-07 |
| 04.1. CLAP Capability & Host Evidence Gate | 4/4 | Complete   | 2026-08-10 |
| 04.2. Hybrid CLAP Companion Product | 11/11 | Complete   | 2026-08-20 |
| 04.3. CLAP-First Product Rebaseline | 2/5 | In Progress|  |
| 5. Automation & Device Workflows (M4) | 0/TBD | Not started | - |
