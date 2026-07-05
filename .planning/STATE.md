---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03.1
current_phase_name: gap-closure-clip-identity-scope-apply-pre-flight-bridge-auto
status: verifying
stopped_at: Completed 03.1-03-PLAN.md (apply/revert pre-flight gates — Phase 03.1 code-complete)
last_updated: "2026-07-05T01:59:30.560Z"
last_activity: 2026-07-05
last_activity_desc: Phase 03.1 plan 02 complete (clipSid live)
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 20
  completed_plans: 20
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-29)

**Core value:** The assistant reliably understands and describes the selected Bitwig context and can only change the project through small, previewable, reversible, daemon-authoritative patches — so it never wrecks the song. Accurate first; creative later.
**Current focus:** Phase 03.1 — gap-closure-clip-identity-scope-apply-pre-flight-bridge-auto

## Current Position

Phase: 03.1 (gap-closure-clip-identity-scope-apply-pre-flight-bridge-auto) — EXECUTING
Plan: 4 of 4
Status: Phase complete — ready for verification
Last activity: 2026-07-05 — Phase 03.1 plan 02 complete (clipSid live)

Progress: [█████████░] 90% — 18/20 plans complete; 03.1 plan 02 (clipSid) shipped; plans 03 (apply pre-flight) + 04 (skill-prompt realignment) remain before end-of-phase UAT

## Performance Metrics

**Velocity:**

- Total plans completed: 19 (3 in Phase 1 + 8 in Phase 2)
- Average duration: ~17 min
- Total execution time: ~2.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Schema & IPC Spike | 3/3 | ~38 min | 13 min |
| 2. Read-Only Context Foundation (M1) | 8/8 | ~70+ min | ~9 min/plan |
| 3. Reversible MIDI Patching (M2) | 0/TBD | — | — |
| 4. Arrangement Intelligence (M3) | 0/TBD | — | — |
| 5. Automation & Device Workflows (M4) | 0/TBD | — | — |
| 02 | 8 | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

- *(Phase 1 blockers all resolved — spike goal achieved.)* Bitwig loopback TCP access: CONFIRMED live (Java `.bwextension`, captured `selection.changed` round-trip). JDK 21: installed via Homebrew. In-app scripting guide / Javadoc 6.0.6: consulted; capability surface recorded in `docs/bitwig-capabilities.md`. JS-vs-Java tension: resolved — JS `host` has no networking, Java `.bwextension` is the mandatory transport.
- *(Phase 2 — resolved 2026-06-29 UAT):* STATE-04 fingerprint-mapping implemented + verified live (reload-reconcile smoke passed). The deferred behavioral probes (BRIDGE-02 5th event clip.name_changed, SC#3 reload-reconcile, Pi /analyze runtime) all PASSED in the end-of-phase UAT — 5/5 bridge events now live, /analyze produces grounded output + assumptions[] + stateFreshness surfacing.
- [Phase 3 — to watch]: M2 introduces the patch/preview/apply flow + MIDI transforms. The edit trust-spine (patch object w/ undoLabel + risk-gated apply) is the critical invariant — Phase 3 must not let any mutation bypass it. VST param enumeration (A1 NEGATED) stays out of scope until Phase 5.
- Phase 03 UAT pending: M1–M5 manual checkpoints (Plan 03-05 Task 2) require live Bitwig 6.0.6 + human ears + Pi. M2/M3/M4/M5 BLOCKING; M1 non-blocking. docs/bitwig-capabilities.md §1/§2 PENDING slots marked. Until these pass, Phase 3 is NOT complete (status: ready_for_verification / pending-uat). If M4 finds NoteStep.start grid-locked, flag to planner — bridge write path changes.

### Roadmap Evolution

- Phase 03.1 inserted after Phase 3: Gap closure: clip-identity scope, apply pre-flight, bridge auto-reconnect, skill-prompt stale update (URGENT)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-05T01:59:30.553Z
Stopped at: Completed 03.1-03-PLAN.md (apply/revert pre-flight gates — Phase 03.1 code-complete)
Resume file: None
