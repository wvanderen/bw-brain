---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04.3
current_phase_name: CLAP-First Product Rebaseline (INSERTED
status: verifying
stopped_at: "Completed 04.3-04-PLAN.md (live UAT verdict recorded: detection failed, defects A/B/C to gap closure)"
last_updated: "2026-08-21T22:20:41.693Z"
last_activity: 2026-08-21
last_activity_desc: Phase 04.3 execution started
progress:
  total_phases: 9
  completed_phases: 6
  total_plans: 50
  completed_plans: 48
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-20)

**Core value:** The assistant reliably understands and describes the selected Bitwig context and can only change the project through small, previewable, reversible, daemon-authoritative patches — so it never wrecks the song. Accurate first; creative later.
**Current focus:** Phase 04.3 — CLAP-First Product Rebaseline (INSERTED)

## Current Position

Phase: 04.3 (CLAP-First Product Rebaseline (INSERTED)) — EXECUTING
Plan: 5 of 5
Status: Phase complete — ready for verification
Last activity: 2026-08-21 — Phase 04.3 execution started

Progress: [█████████░] 43/44 defined plans complete; Phase 04.3 and Phase 5 unplanned

## Performance Metrics

**Velocity:**

- Total plans completed: 32
- Average duration: ~17 min
- Total execution time: ~2.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Schema & IPC Spike | 3/3 | ~38 min | 13 min |
| 2. Read-Only Context Foundation (M1) | 8/8 | ~70+ min | ~9 min/plan |
| 3. Reversible MIDI Patching (M2) | 5/5 | — | — |
| 03.1 Gap Closure | 6/6 | — | — |
| 4. Arrangement Intelligence (M3) | 6/6 | — | — |
| 04.1 CLAP Capability & Host Evidence Gate | 4/4 | 4 days elapsed across gated sessions | — |
| 04.2 Hybrid CLAP Companion Product | 11/11 | ~2h plus live UAT | — |
| 04.3 CLAP-First Product Rebaseline | 0/TBD | — | — |
| 5. Automation & Device Workflows (M4) | 0/TBD | — | — |
| 02 | 8 | - | - |
| 03.1 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: 02-03b (assembly primitives), 02-04 (CLI contract), 02-05 (Pi /analyze), 02-06 (deprecation fix), 02-07 (daemon boot gap closure)
- Trend: Phase 2 lands cleanly; the daemon is now runnable end-to-end (npm start); Phase-2 UAT 2/3/4 semantically unblocked
- Phase 02 P07: 19 min | 2 tasks | 10 files

*Updated after each plan completion*
| Phase 03 P01 | 95 | 2 tasks | 29 files |
| Phase 03 P02 | 113 min | 3 tasks | 12 files |
| Phase 03 P03 | 88 | 2 tasks | 10 files |
| Phase 03 P04 | 95 | 2 tasks | 12 files |
| Phase 03 P05 | 6 | 2 tasks | 8 files |
| Phase 03.1 P01 | 16 min | 3 tasks | 4 files |
| Phase 03.1 P02 | 6 min | 3 tasks | 10 files |
| Phase 03.1 P04 | 2 min | 2 tasks | 6 files |
| Phase 03.1 P03 | 13 min | 3 tasks | 4 files |
| Phase 03.1 P05 | 5min | 2 tasks | 2 files |
| Phase 03.1 P06 | 4 min | 2 tasks | 3 files |
| Phase 04.1 P01 | 6min | 2 tasks | 6 files |
| Phase 04.1 P02 | 18min | 2 tasks | 8 files |
| Phase 04.1 P03 | 4d | 2 tasks | 10 files |
| Phase 04.1 P04 | 20 min + human verification | 2 tasks | 8 files |
| Phase 04.2 P01 | 15min | 2 tasks | 18 files |
| Phase 04.2 P02 | 6min | 2 tasks | 5 files |
| Phase 04.2 P03 | 3min | 1 tasks | 4 files |
| Phase 04.2 P04 | 7min | 2 tasks | 7 files |
| Phase 04.2 P06 | 9min | 2 tasks | 10 files |
| Phase 04.2 P07 | 13min | 2 tasks | 12 files |
| Phase 04.2 P08 | 5min | 1 tasks | 6 files |
| Phase 04.2 P09 | 16min | 2 tasks | 12 files |
| Phase 04.2 P10 | 20min | 2 tasks | 16 files |
| Phase 04.2 P11 | 1h + live UAT | 2 tasks | 7 files |
| Phase 04.3 P01 | 1h 40m | 2 tasks | 7 files |
| Phase 04.3 P02 | 20 min | 2 tasks | 10 files |
| Phase 04.3 P05 | 8min | 1 tasks | 1 files |
| Phase 04.3 P03 | 12 min | 2 tasks | 5 files |
| Phase 04.3 P04 | 2h 45m | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 5-phase vertical-slice structure (de-risk spike → M1 → M2 → M3 → M4) honoring accurate-first sequencing; large M1/M2 phases kept as single vertical slices (decomposed into plans rather than split into horizontal layers).
- [Roadmap]: Phase 1 leads with PROBE-01 + PROBE-02 — the single highest-risk structural unknown (Bitwig TCP) gates all bridge work.
- [Roadmap]: UX-06 (assumptions[] field) placed in Phase 2 as a foundational guardrail established from M1.
- [Phase 1 / Plan 01]: Frozen protocol breadth = envelope spine + version handshake + 4 seed-example message shapes (selection.changed, get.selected_clip, {id,ok,payload} response, apply.patch); speculative catalog marked Phase 2-extensible per Pitfall 4. Calibrated against SC#3.
- [Phase 1 / Plan 01]: Trust-spine enforced at schema level — edit.schema.json requires payload.undoLabel (minLength 1) + payload.operations (minItems 1); the bridge can refuse unlabeled edits by validation alone. PROJECT.md guardrail + AGENTS.md line 17.
- [Phase 1 / Plan 01]: Codegen via scripts/gen-types.mjs ($id-aware bundler) instead of the literal json2ts CLI — @apidevtools/json-schema-ref-parser cannot resolve cross-file $refs against the absolute https $id scheme and json2ts compiles each file independently. Contract schemas stay pristine; runtime Ajv resolves $ref by $id natively.
- [Phase 1 / Plan 02] Transport interface is the D-05 spine: the reader consumes ONLY Transport.onMessage/send/close, never net.Socket — TcpServerTransport (loopback) + StdioTransport (fallback) make the kept framing reusable regardless of the Transport Decision Rule outcome.
- [Phase 1 / Plan 02] Loopback bind is constructor-enforced (Pitfall 5): TcpServerTransport throws on any host !== 127.0.0.1 AND always passes the host arg to listen — the all-interfaces wildcard is unreachable. lsof confirms 127.0.0.1-only.
- [Phase 1 / Plan 02] Ajv 2020-12 envelope validator compiled ONCE at module load (standalone-compiled, AGENTS.md 64-65); reader enforces explicit backpressure (Pattern 5): observational events drop-oldest + dropped notice, edits/requests never drop.
- [Phase 1 / Plan 02] Under NodeNext, Ajv 2020-12 must be imported as named { Ajv2020 } from ajv/dist/2020.js (ajv 8.20 ships no exports map; .js ext required). addFormats dropped — no frozen schema uses the format keyword (premise false), and its CJS default-export interop is not callable as a static NodeNext import.
- [Phase 1 / Plan 03] Only Task 1 is autonomous; Tasks 2 (in-app capability probes → docs/bitwig-capabilities.md Observed: fields) and 3 (transport proof + live SC#1 round-trip) are blocking human-verify checkpoints. Observed Bitwig behavior is the spike's OUTPUT (D-02) — never fabricated. Skeleton + throwaway artifacts (spike/bitwig-extension.js + spike/raw-tcp-probe.java + capabilities-doc skeleton) committed as b14a52d; the manual work is documented precisely in 01-03-SUMMARY.md → "Manual Steps Remaining."
- [Phase 1 / Plan 03] Decoupled tracks (RESEARCH.md §The JS-vs-Java Spike Tension): Track A (capability probes via JS — D-07 iteration speed) is in spike/bitwig-extension.js; Track B (transport proof via raw java.net OR the OSC-as-proof fallback) is in spike/raw-tcp-probe.java. SC#1 is never hostage to whether JsApi exposes networking — Track B can use DrivenByMoss's proven OSC server as a stand-in if JDK 21 is not installed.
- [Phase 02-07]: Stale-socket probe-and-unlink (not refuse-and-exit): a crashed daemon's stale socket is the COMMON case; the probe (net.createConnection with 300ms timeout) distinguishes live (connect -> refuse + exit 1) from stale (ECONNREFUSED -> unlink + proceed). Matches the Unix daemon convention (dbus/ssh-agent) + RESEARCH.md Pattern 3 'cleaned on daemon exit.'
- [Phase 02-07]: Disconnect detection via 2.5s interval poll + 1-line tcp.ts additive hasConnectedSockets() accessor (Blocker 1 fix): tcp.ts:47 declared 'sockets' private readonly with no accessor + no per-socket-close callback. The additive boolean method is the minimal honest fix (vs a per-socket-close callback that would require a larger edit to a 02-03b-frozen module). Purely additive: returns a boolean only; weakens no invariant.
- [Phase 02-07]: M1 LIMITATION (Minor 3 fix): the bridge's get.project_summary returns ONLY {tracks:[{slot,name}]} — no project metadata. The daemon supplies defaults (name='', tempo=120, timeSignature='4/4'). Pulling project metadata is a Phase-3+ concern (no get.project_meta handler in PullHandlers.java today). Documented in boot.ts + SUMMARY.
- [Phase 02-07]: Handshake wired but non-blocking: the dispatcher's hello branch calls negotiateVersion + replies hello.response WHEN a hello arrives, but the reconnect trigger is NOT 'hello arrived' — it is 'TCP accept + get.project_summary response.' The current bridge (BridgeExtension.startConnector) does NOT emit hello (verified). The hello path is forward-compatible + exercised by the smoke test's fake bridge.
- [Phase 02 UAT]: A1 NEGATED (2026-06-29) — VST/AU parameters do NOT surface via CursorRemoteControlsPage; `CursorDevice` exposes no `getRemoteControls()` in extension-api:21 (verified live with Surge XT + javap). `bw-device inspect` returns empty pages by design. The `cursorDevice.getParameter(int)` direct-enumeration fallback is documented in docs/bitwig-capabilities.md §4 + deferred to Phase 5 (device workflows). All 3 human_verification checkpoints PASSED live (Tests 2/3/4); 5/5 bridge event types now verified end-to-end over loopback TCP (clip.name_changed captured in the /analyze session).
- [Phase ?]: Phase 03-01: Pitfall 2 (before.key===after.key for update_note_field) enforced at TS+runtime+arb layer, NOT JSON Schema — pure 2020-12 cannot express cross-property equality and the $data extension would break the Java bridge's Jackson parser. Runtime guard pinned by INV-1/INV-2 fast-check.
- [Phase ?]: Phase 03-01: note identity = n:${pitch}:${startQuantized} (1/64-beat grid); pitch change = remove_note+add_note, never update_note_field (Pitfall 2 — a different pitch IS a different identity).
- [Phase 03]: Phase 03-02: D-03 inverseOps-at-apply-time (INV-14) — the patch-history.jsonl journal freezes the inverse when the daemon holds authoritative before-state; revert replays the frozen inverse (never re-derives from drifted state). SC#2 mechanical guarantee. — Phase 03-02: D-03 inverseOps-at-apply-time (INV-14) — the patch-history.jsonl journal freezes the inverse when the daemon holds authoritative before-state; revert replays the frozen inverse (never re-derives from drifted state). SC#2 mechanical guarantee.
- [Phase 03]: Phase 03-02: bw-edit preview/apply/revert live; candidate-store (D-05 ephemeral LRU 64) + patch-history.jsonl (D-03) + bridge handleApplyPatch (3-case forever, D-01/Pitfall 7) shipped. EDIT-02/04/05/06 wire contract proven by daemon<->fake-bridge smoke (no live Bitwig). — Phase 03-02: bw-edit preview/apply/revert live; candidate-store (D-05 ephemeral LRU 64) + patch-history.jsonl (D-03) + bridge handleApplyPatch (3-case forever, D-01/Pitfall 7) shipped. EDIT-02/04/05/06 wire contract proven by daemon<->fake-bridge smoke (no live Bitwig).
- [Phase ?]: Phase 03-03: hand-rolled Krumhansl-Schmuckler key detection (tonal Key.majorKey/minorKey are LOOKUP-only — no Key.detect); INV-12 refuse-below-r=0.5 (no silent guess, D-12).
- [Phase ?]: Phase 03-03: genre profiles (generic.json D-14 neutral + techno.json opt-in) + loader; loadProfile() returns generic literally (INV-13 — ARCH-02 literally true).
- [Phase ?]: Phase 03-03: MotifSignatureAnalyzer is the FIRST addition to D-08 (M1->M2, two analyzers); motif signature = PCP+IOI+density (MIDI-01).
- [Phase ?]: BLOCKER-01 INV-10 audit-trail integrity (T-3-18a) closed: vary stamps refused→risk:high at birth + handleMidiVary RE-VALIDATES via classifyRisk({belowBar}) BEFORE mint — patch-history.jsonl can never record a below-bar candidate as medium (Plan 03-04)
- [Phase ?]: Cleanup transforms (voice-leading-fix/humanize) use D-10 self-declared low risk WITHOUT classifyRisk op-count flooring — floor over-penalizes identity-stable update_note_field content mutations; classifyRisk mandate scoped to creative tier (Plan 03-04)
- [Phase ?]: midi.* dispatch DRY preamble (prepareMidiDispatch): watchdog + candidateStore gates + pullLiveClipNotes + loadProfile + resolveHarmonic shared across the 4 handlers (Plan 03-04)
- [Phase 03]: Phase 03-05: Pi /vary /apply /diff skills (UX-02) shipped — 3 SKILL.md shelling to bw-* CLI only (D-15 no inline diffs, D-04/D-09 flag handling, on-demand diff pane) + 3 structural contract tests. BLOCKER-02 vitest-include defense: daemon/vitest.config.ts include extended with ../pi-pack/skills/**/*.test.ts — without it npm test -- skill exits 0 vacuously (vitest 4.x CLI filter does not override include). Proven: Test Files 3 passed (3) under NO_COLOR=1.
- [Phase 03]: Phase 03-05: plan status is pending-uat (NOT complete). Task 1 (Pi skills + contract tests) done + committed; Task 2 (M1–M5 manual UAT) is a blocking human-verify checkpoint — live Bitwig + human ears (casino-MIDI refusal audibility, techno-enhances-not-gates, NoteStep grid-lock, undo coalescing, /vary UX legibility). UX-02 implemented but not verified; requirements-completed stays [] until M2/M3/M4/M5 pass. Phase 3 not yet complete.
- [Phase ?]: [Phase 03.1 P01] D-08 lifecycle loop: startConnector refactored to while(running) delegating to package-private static runConnectorCycle (testable without Bitwig host); pull.join() is the reliable socket-loss signal; Outbox.reset()/clear() defeat Pitfall 2 + drop stale events (D-07); exit() gains defensive socket close.
- [Phase ?]: [Phase 03.1 P02] D-01 V1 clipSid: "clip_" + sha256(trackSid:loopBeats).slice(0,16) — javap-definitive on the absence of a Clip.name() reader in extension-api:21. Closes the OBSERVED M4 UAT failure (4-bar vs 8-bar). Push/pull paths share hash inputs (cursorTrackName + getLoopLength().get()) so they agree. Residual same-track-same-length collision documented (RESEARCH §D-01(c)); V2 deferred.
- [Phase ?]: [Phase 03.1 P02] D-03d refreshSnapshot hardening: also pulls get.selected_clip + folds clipSid on reconnect — CONTEXT.md claim that refreshSnapshot already pulled it corrected (Pitfall 3). Best-effort secondary pull; primary get.project_summary stays authoritative.
- [Phase ?]: [Phase 03.1 P04] D-10 additive skill-prompt realignment: gap was OMISSION not contradiction — purely additive ## Freshness gate (D-10) section appended to /vary /apply /diff SKILL.md after Hard rules.
- [Phase ?]: [Phase 03.1 P04] Per-skill command substitution in D-10 freshness body — vary lists 'bw-midi vary'; diff lists 'bw-diff'; apply lists all three. Literal phrases 'live and stale are BOTH trustworthy' + 'disconnected ... HARD REFUSAL' stay verbatim (contract tests grep them).
- [Phase ?]: [Phase 03.1 P04] Wrong-clip targeting section in apply/SKILL.md ONLY — wrong_clip_targeted is apply+revert per D-06; revert surfaces via bw-edit CLI (no /revert skill). The error code itself is IMPLEMENTED in Plan 03.1-03 (next); this plan only prepares the /apply prompt to surface it gracefully. vary/diff intentionally do NOT carry this section.
- [Phase ?]: [Phase 03.1 P04] Task 2 TDD path (GREEN-from-start): planner split implementation (Task 1) and tests (Task 2) across two tasks in a type:execute plan (not type:tdd). Task 2's contract assertions pass on first run — expected 'feature already exists' path. Single test(03.1-04) commit; no RED applicable.
- [Phase ?]: [Phase 03.1 P04] BLOCKER-02 vitest-include preserved — daemon/vitest.config.ts UNCHANGED. The include '../pi-pack/skills/**/*.test.ts' (Plan 03-05) already covers all three test files; npm test -- --run ../pi-pack/skills runs non-vacuously (Test Files 3 passed, 29/29 green).
- [Phase ?]: Phase 03.1 P03: D-04 apply pre-flight gate refuses wrong_clip_targeted when candidate.previewClipSid ≠ state.selection.clipSid BEFORE the bridge round-trip — M4 UAT critical blocker mechanically closed. D-05 revert gate symmetric. Pitfall 8 honored (single safeSendErr with optional details arg).
- [Phase ?]: Phase 03.1 P03: Pre-fix migration policy symmetric across apply + revert — legacy candidates (previewClipSid undefined) and legacy journal entries (clipSid undefined) proceed with surfaced assumptions ('cursor clip unverified'), preserving recovery paths. Refusing would remove the recovery path with no alternative (Bitwig native undo is unreliable per docs/bitwig-capabilities.md §1).
- [Phase ?]: Phase 03.1 P06: D-06 surface gap closed at CLI layer — DaemonReplyError preserves full ok:false envelope; printResultOrDisconnect surfaces it verbatim; plain-Error asymmetry for genuine-unreachable keeps SC#3 honest. Daemon unchanged; siblings adopt automatically. UAT Tests [4,5] closed.
- [Phase 04.1]: Capability builds use clap/build-capability exclusively; clap/build remains absent and reserved for later product work. — Prevents evidence and production caches from leaking across the phase boundary.
- [Phase 04.1]: Pi SDK candidate 0.84.0 remains SUS pending human approval despite registry signatures and trusted-publisher provenance. — Automated supply-chain evidence does not authorize installation before the explicit package gate.
- [Phase 04.1]: Bare throwaway CLAP capability probe; JUCE and adapter product architecture remain deferred. — Preserves the evidence/product boundary.
- [Phase 04.1]: Copied persisted identity demonstrates duplication ambiguity, not production identity. — Live lease and rekey design remains Phase 04.2 work.
- [Phase 04.1]: Editor and parameter evidence remains pending live Bitwig proof; no Q3 fallback selected. — Plan 03 owns host evidence and branch selection.
- [Phase 04.1]: Q1 track-info is hint-only; controller confirmation remains authoritative because Bitwig supplied an empty name. — Live Bitwig track-info evidence returned channels=2 with an empty name.
- [Phase 04.1]: Q2 uses explicit session.fork confirmation with no display-name heuristic. — Controller API 21 exposes no definitive document identity or Save As event.
- [Phase 04.1]: Q3 keeps status/actions in hosted UI and automation only on musical controls. — Bitwig omitted non-automatable Analyze from the device panel while Generated Mix accepted fractional values.
- [Phase 04.1]: Q4 approves exactly @earendil-works/pi-coding-agent@0.84.0 under the recorded audit scope without gate-time installation. — The user explicitly approved the audited package version and layout.
- [Phase 04.1]: GATE-02 accepted direct Bitwig 6.0.11 together-mode proof: received=32, forwarded=32, count=616, result SAME. — Direct non-zero host evidence replaces inference from transparent forwarding.
- [Phase 04.1]: Phase 04.2 is unblocked for planning but remains unplanned and unimplemented. — Phase 04.1 closes evidence gates only and preserves the product boundary.
- [Phase 04.2 P01]: Product uses clap/build while capability evidence remains isolated in clap/build-capability. — Prevents production and evidence caches or targets from contaminating each other.
- [Phase 04.2 P01]: JUCE release packaging stays gated on explicit AGPLv3 or commercial license selection. — The product build does not silently choose release licensing terms.
- [Phase 04.2 P01]: Five bounded CLAP schemas generate one deterministic daemon/src/gen/clap.ts surface. — Later native and daemon slices consume one closed contract foundation.
- [Phase 04.2]: CLAP peers use a dedicated literal-loopback endpoint with targeted connectionId sends only; controller TcpServerTransport remains unchanged.
- [Phase 04.2]: Only schema-valid handshakes enter the accepted registry; peer-advertised capacities may narrow but never widen daemon bounds.
- [Phase 04.2]: Queue pressure on commands closes/refuses the peer rather than silently dropping identity, approval, Stop, arm, or phrase traffic.
- [Phase 04.2]: Persisted plug-in state is a closed versioned binary record containing only a schema-valid instanceId and bounded musical settings. — Project/session authority remains daemon-owned.
- [Phase 04.2]: Daemon rekey commands compare the expected old ID, require a different schema-valid new ID, and mark host state dirty. — Stale commands cannot replace current identity and successful rekeys persist.
- [Phase 04.2]: Track and device names remain nullable hints; only an exact controller-selected-device tuple can confirm correlation. — Names cannot create controller authority.
- [Phase 04.2]: Every confirmation nonce is single-use, fixed-expiry, and invalidated by disconnect, reconnect, or a newer request. — Prevents replay and cross-controller evidence reuse.
- [Phase 04.2]: The correlation dispatcher recognizes only get.clap_correlation; apply.patch remains in its existing three-case mutation path. — Preserves D-13 controller mutation ownership.
- [Phase 04.2]: Quiet startup persists only an SDK-created session header plus bw-brain metadata; it never fabricates a prompt or model turn. — Pi 0.84.0 defers new-file persistence until an assistant response, but reopen must work with zero prompts.
- [Phase 04.2]: Pi receives four handler-backed tools and no built-in, apply, arm-token, socket, filesystem, or raw-audio authority. — Daemon/controller trust boundaries remain authoritative.
- [Phase 04.2]: The audio callback emits only fixed aggregate snapshots; raw PCM, sysex retention, JSON, logging, sockets, locks, allocation, and arbitrary history remain outside the process seam.
- [Phase 04.2]: Daemon telemetry is a confirmed-scope bounded latest-value cache with no Pi/session-manager dependency, so telemetry never starts reasoning.
- [Phase 04.2]: Proposal revisions retain exact confirmed project/instance/clip scope; approval never consults visible focus. — Prevents focus races from changing an inspected target.
- [Phase 04.2]: Approval tokens are compare-and-delete before side effects; existing edits delegate unchanged to EditService while live MIDI stays outside PatchHistory. — Preserves one-shot authority and the canonical reversible mutation trust spine.
- [Phase 04.2]: Original MIDI remains untouched in the host buffer; only bounded generated events are appended in sample order. — Preserves arbitrary event headers and payloads while keeping generation bounded.
- [Phase 04.2]: Authority queues refuse on pressure and lifecycle disarm uses a non-droppable atomic latch. — Stop and cleanup authority must never inherit observational telemetry drop behavior.
- [Phase 04.2]: Analyze and Stop are hosted commands only; device-panel parameters contain read-only status/pending values and continuous Generated Mix. — Preserves the live-host D-03 supersession and avoids recording actions as automation.
- [Phase 04.2]: Global Stop receives cancellation-only dependencies and cannot access PatchHistory, revert, or conversation deletion APIs. — Generated behavior stops without altering journaled edits or conversation lineage.
- [Phase 04.2]: Product validation uses clap/build while capability evidence remains isolated in clap/build-capability. — Prevents product caches and artifacts from contaminating capability evidence.
- [Phase 04.2]: macOS is live verified from dated two-mode Bitwig evidence; Windows and Linux remain live-host unverified. — Support labels must not exceed observed host evidence.
- [Phase 04.2]: JUCE 8 licensing remains a blocking release decision independent of technical validation. — A green build does not select AGPLv3 or a commercial license.
- [Phase 04.3 P01]: AGENTS.md is regenerated from sources only — STACK.md's two contradictory rows carry dated 2026-08-20 supersession notes so regeneration imports the rebaselined story; the wired check:docs gate (scripts/check-docs-rebaseline.mjs) mechanically blocks the drift class (RB-01)
- [Phase 04.3 P01]: Provider policy is grounded in the inspected Pi 0.84.0 agentDir surface — ~/.pi/agent/{models.json, auth.json, settings.json} with defaultProvider/defaultModel, outside the repo; daemon passes no model/modelRuntime; provider absence/auth failure stays a bounded visible analysis_auth_required / analysis_model_unavailable state (RB-05)
- [Phase 04.3 P01]: pi-pack is classified as a CLI-wrapping asset for alternate agents and headless workflows (dated supersession of the pack-primary-UX claim); Pi version wording reads 0.84.0 daemon-managed; M4 /device row points at the CLAP workspace per superseded UX-04 (RB-02)
- [Phase 04.3]: [Phase 04.3 P02] Disconnected semantics split: CLI arrange.* keeps its unconditional disconnected refusal (byte-identical wire); the CLAP peer path hard-refuses only disconnected+refresh and otherwise renders the durable snapshot with visible freshness + pulledAt — never silent.
- [Phase 04.3]: [Phase 04.3 P02] reviewArrangement is an optional ActionDispatch dependency (unwired = action.error not_implemented); the deterministic arrangement.review branch reuses analysis.status/conversation.chunk/analysis.complete bracketing and never invokes the Pi analyze dependency (RB-05 code half).
- [Phase 04.3]: [Phase 04.3 P02] One transport-free evidence assembly (assembleArrangementReviewEvidence + refreshArrangementSnapshot in query-server.ts) serves both the CLI arrange.review wrapper (byte-identical output) and the peer path via a boot-injected dependency — analyzer logic never duplicated; sparkline per-scene energy comes from SectionSummary.energy with the per-bar curve surfaced as bounded stats.
- [Phase ?]: [Phase 04.3 P05] Phase 5 contract is code-grounded: principal new dependency = patch-schema automation-operation extension (PrimitiveOp is add_note/remove_note/update_note_field only); device-chain reads pair get.selected_device_chain (PullHandlers.java:224/307, empty pages) with the cursorDevice.getParameter(int) A1-NEGATED fallback; binding constraints pin reuse of the verified 04.2 authority seams (RB-04)
- [Phase ?]: [Phase 04.3 P03] ConversationChunkReceived UiEvent keeps chunk append/reset + lastChunkRequestId/lastChunkSequence bookkeeping atomic inside the copy-on-write reducer — no decoder-side TOCTOU; bounds fail closed (requestId non-empty, sequence 0-65535, text <=512)
- [Phase ?]: [Phase 04.3 P03] analysis.complete ok preserves accumulated chunk text only when its requestId matches the accumulated chunk request; ok-without-chunks and error/aborted paths keep existing surfacing verbatim
- [Phase ?]: [Phase 04.3 P03] Review is a hosted button command enqueuing arrangementReview(scope, refresh=true) per the locked local-first decision — never an automatable parameter (T-04.3-12); conversation readability via wrap+scroll in unchanged bounds, never editor widening
- [Phase ?]: [Phase 04.3 P04] UAT verdict recorded honestly as failed (11/12 rows pass; detection row failed): RB-03/UX-03 stay open until defects A/B/C are gap-closed and row 1 re-run live — approval withheld, platform discipline intact.
- [Phase ?]: [Phase 04.3 P04] Detection failure attributed to pre-existing bridge/daemon defect chain (A: launcher grid pull race/3000ms timeout with dropped late responses; B: schema-invalid snapshot persisted unvalidated; C: unhandled loadArrangementSnapshot throw crashes daemon on arrange.review) — NOT the new CLAP path; clip-level Analyze through the same editor produced a correct existing_edit proposal.
- [Phase ?]: [Phase 04.3 P04] Legacy 04-UAT.md classified additive-only (rows 1-4, 6-14 retained-CLI; row 5 superseded-UI; zero product-gap) and committed — acceptance history classified, never falsified; 04.3-UAT.md replaces the obsolete external-Pi /review acceptance surface.

### Pending Todos

- 1 pending — see `.planning/todos/pending/2026-08-09-design-first-class-bitwig-grid-integration.md`.

### Blockers/Concerns

- *(Phase 1 blockers all resolved — spike goal achieved.)* Bitwig loopback TCP access: CONFIRMED live (Java `.bwextension`, captured `selection.changed` round-trip). JDK 21: installed via Homebrew. In-app scripting guide / Javadoc 6.0.6: consulted; capability surface recorded in `docs/bitwig-capabilities.md`. JS-vs-Java tension: resolved — JS `host` has no networking, Java `.bwextension` is the mandatory transport.
- *(Phase 2 — resolved 2026-06-29 UAT):* STATE-04 fingerprint-mapping implemented + verified live (reload-reconcile smoke passed). The deferred behavioral probes (BRIDGE-02 5th event clip.name_changed, SC#3 reload-reconcile, Pi /analyze runtime) all PASSED in the end-of-phase UAT — 5/5 bridge events now live, /analyze produces grounded output + assumptions[] + stateFreshness surfacing.
- [Phase 3 — RESOLVED 2026-07-06]: M2 introduces the patch/preview/apply flow + MIDI transforms. The edit trust-spine (patch object w/ undoLabel + risk-gated apply) is the critical invariant — Phase 3 must not let any mutation bypass it. VST param enumeration (A1 NEGATED) stays out of scope until Phase 5. Trust-spine verified end-to-end in Phase 03.1 UAT (D-04/D-05 wrong-clip-targeting gates fire before bridge round-trip; D-06 surface reaches the CLI via DaemonReplyError + printResultOrDisconnect — Plan 06).
- [Phase 03.1 — RESOLVED 2026-07-06]: Phase 03 UAT pending items (M1–M5 manual checkpoints) — closed by Phase 03.1 work + the 2026-07-06 end-of-phase UAT (Tests 3/4/5 all pass; VERIFICATION 28/28; 03.1 6/6 plans complete). docs/bitwig-capabilities.md §1/§2 PENDING slots can now be updated with the live-verified clipSid behavior.
- [Phase 04.3]: The CLAP editor is the primary producer UX; Pi is daemon-managed and headless; the CLI remains the stable secondary automation, diagnostic, and recovery contract.
- [Phase 04.3]: Local-first means DAW authority, raw state, persistence, and mutation remain local; explicit reasoning may use a local or remote provider with bounded confirmed context, never raw audio.
- [Phase 04.3]: Phase 4 arrangement analyzers are retained, while external Pi `/review` UI acceptance is superseded by a CLAP-native arrangement review and proposal flow.
- [Phase 04.3 — OPEN, routes to /gsd-plan-phase 4.3 --gaps] Live arrangement UAT (2026-08-21) failed row 1: every detection dimension empty. DEFECT A (bridge/daemon): get.launcher_clips walk races bank sync and exceeds the 3000ms pull timeout — snapshot has empty trackSids (tracks 4-7) and all 128 cells hasContent:false; late bridge responses dropped by correlator. DEFECT B (daemon): snapshot write path persists schema-invalid content (no save validation). DEFECT C (daemon): loadArrangementSnapshot throw unhandled on the arrange.review path — one bad snapshot file crashes the daemon (arrangement-snapshot.ts:246, query-server.ts:1114/1208; boot resilient, query fatal). RB-03/UX-03 acceptance blocked on closure + live re-run.

### Roadmap Evolution

- Phase 03.1 inserted after Phase 3: Gap closure: clip-identity scope, apply pre-flight, bridge auto-reconnect, skill-prompt stale update (URGENT)
- Phase 04.1 inserted after Phase 4: Hybrid CLAP Integration Foundation — thin CLAP companion for in-Bitwig UI and real-time MIDI/audio; controller/daemon/CLI trust spine and external Pi remain authoritative (URGENT)
- Phase 04.1 narrowed to the CLAP capability/host evidence gate; Phase 04.2 inserted as the blocked Hybrid CLAP Companion Product owner for D-01–D-16.
- Phase 04.3 inserted after Phase 04.2: CLAP-first product rebaseline and roadmap reconciliation (URGENT)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-21T22:20:29.835Z
Stopped at: Completed 04.3-04-PLAN.md (live UAT verdict recorded: detection failed, defects A/B/C to gap closure)
Resume file: None
