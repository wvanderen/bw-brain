---
phase: 01-schema-ipc-spike
plan: 03
subsystem: bitwig
tags: [bitwig, controller-script, jsapi, java-extension, server-socket, loopback, capability-probe, transport-proof, spike, manual-checkpoint]

# Dependency graph
requires:
  - phase: 01-schema-ipc-spike/01
    provides: "the 6 frozen JSON Schema 2020-12 contract files (esp. event.schema.json — the shape the throwaway JS extension must emit) + the daemon/ ESM scaffold + scripts/check-capabilities-doc.mjs (the structural validator this plan's doc skeleton must pass)"
  - phase: 01-schema-ipc-spike/02
    provides: "the daemon reader + bw-brain-spike dump CLI that receive the live selection.changed event over 127.0.0.1:7878; the Transport interface the spike's chosen transport plugs into unchanged"
provides:
  - "spike/bitwig-extension.js — THROWAWAY JS Controller Script (D-07): 6 capability-probe scaffolds (host.println evidence stubs) + selection.changed emission path (addSelectionObserver → JSON-Lines envelope shaped to event.schema.json) + enqueue-not-block drain pattern (Pitfall 3). Transport-send is a documented TODO with the 4 options from the JS-vs-Java tension table; resolved in Task 3."
  - "spike/raw-tcp-probe.java — THROWAWAY Track B ~30-line ServerSocket probe (A1): binds 127.0.0.1 ONLY (Pitfall 5 — Java side), writes one JSON-Lines hello handshake on accept. JDK 21 absent — file documents the OSC-as-proof fallback so Track B's purpose is satisfiable without a JDK install."
  - "docs/bitwig-capabilities.md — KEPT PROBE-01 output skeleton: header (A6 API version + A2 JsApi surface TBD-in-app), 6 required ## sections in order + Transport Decision section, each carrying the verified RESEARCH.md surface + design questions + an explicit Observed: TODO-in-app marker + a DRAFT Mitigation (D-04). Passes scripts/check-capabilities-doc.mjs structurally (exit 0); the truth is pending the in-app probe."
  - "NOT yet delivered (pending manual checkpoints): the in-app observations filling every Observed: field; the Transport Decision outcome; one captured real selection.changed round-trip (SC#1)."
affects: [01-verify-phase, 02-read-only-context-foundation, 03-reversible-midi-patching]

# Tech tracking
tech-stack:
  added: []  # NO new packages — this plan is plain-JS (no npm) + a single .java file compiled against an external jar
  patterns:
    - "Bitwig Controller Script (JsApi) lifecycle: host.defineController/defineMidiPorts at load; top-level init() / flush() / exit() functions; `host` global injected by Bitwig. No npm/import (RESEARCH.md line 72 — 'no npm install')."
    - "Observer-enqueue-then-drain (Pitfall 3 / Pattern 5): Bitwig observers fire on the controller thread; the spike extension writes the event into PENDING_SELECTION_EVENT inside the observer, and flush() (Bitwig-scheduled) emits the JSON-Lines line. NEVER block inside addSelectionObserver."
    - "Loopback-only bind for Java too (Pitfall 5 applied cross-language): spike/raw-tcp-probe.java uses new ServerSocket(PORT, 50, InetAddress.getByName(\"127.0.0.1\")) — explicit loopback literal, never the all-interfaces wildcard. Same invariant the Plan 02 TcpServerTransport enforces in TS."
    - "Decoupled tracks (RESEARCH.md §The JS-vs-Java Spike Tension): Track A (capability probes via JS — D-07 iteration speed) is in spike/bitwig-extension.js; Track B (transport proof via raw java.net OR the OSC-as-proof fallback) is in spike/raw-tcp-probe.java. SC#1 is never hostage to whether JsApi exposes networking."
    - "Capabilities-doc skeleton with explicit TODO markers (D-02): every Observed: field is a literal 'TODO-in-app' pointer to Plan 03 Task 2; structural validation passes because every section already carries a DRAFT Mitigation (D-04), not because truth has been observed."

key-files:
  created:
    - "spike/bitwig-extension.js — THROWAWAY JS Controller Script (D-07): capability probes + selection.changed emission (SC#1 origin path)"
    - "spike/raw-tcp-probe.java — THROWAWAY Track B ServerSocket probe (A1) with JDK-absent fallback documented"
    - "docs/bitwig-capabilities.md — KEPT PROBE-01 skeleton (6 sections + Transport Decision, passes check-capabilities-doc.mjs)"
    - ".planning/phases/01-schema-ipc-spike/01-03-SUMMARY.md — this file"
  modified: []

key-decisions:
  - "Task 1 is the only autonomous task. Tasks 2 (in-app capability probes) and 3 (transport proof + live SC#1 round-trip) are blocking human-verify checkpoints requiring Bitwig Studio open — observed Bitwig behavior is the spike's OUTPUT, not its input (D-02); fabricating observations would defeat the spike's whole purpose."
  - "Every Observed: field in docs/bitwig-capabilities.md is a literal 'TODO-in-app' marker, AND every section already carries a DRAFT Mitigation pre-filled from RESEARCH.md so the structural validator passes WITHOUT fabricating findings. The truth of each Mitigation is also pending observation — they are drafts, not locked decisions."
  - "The spike JS extension's transport-send is deliberately a TODO with the 4 options spelled out (raw socket / file I/O / host.println log-tail / none → pivot to Java). Resolving it requires the A2 in-app finding (does JsApi expose any networking?), which is the single most important spike-day-1 observation."
  - "The Java probe binds loopback via InetAddress.getByName(\"127.0.0.1\") and the bind arg is ALWAYS passed — same constructor-enforced-style invariant as Plan 02's TcpServerTransport, applied cross-language. Pitfall 5 holds on the Bitwig/JVM side too."
  - "STATUS: at-human-checkpoint, NOT complete. PROBE-01 and PROBE-02 are still phase-level requirements pending the manual tasks; this plan CONTRIBUTES the skeleton + throwaway artifacts but does not satisfy either requirement on its own."

patterns-established:
  - "Pattern: spike/ files are THROWAWAY (deleted in Phase 2 per D-05/D-06); docs/ files are KEPT. The directory boundary makes 'reuse vs delete' unambiguous — Phase 2 deletes spike/ and extends the real dirs."
  - "Pattern: in a spike with manual in-app verification, the autonomous executor scaffolds structure + TODO markers but NEVER fabricates observed behavior. Every Observed: field is a literal pointer to the manual probe."
  - "Pattern: when a plan has blocking human-verify tasks, the executor returns `## CHECKPOINT REACHED` (not PLAN COMPLETE) with a precise numbered list of manual steps, so the work surfaces cleanly to the user."

requirements-completed: []  # NEITHER PROBE-01 NOR PROBE-02 is complete after the autonomous half of Plan 03. PROBE-01 requires the in-app Observed: findings (Task 2, manual); PROBE-02 requires the live Bitwig→daemon TCP confirmation + the captured real selection.changed round-trip (Task 3, manual). The skeleton + throwaway artifacts here are PREP for both — they unblock the manual tasks but do not satisfy the requirements on their own. The phase-level /gsd-verify-work gate owns final completion.
requirements-progressed: [PROBE-01, PROBE-02]
manual-checkpoints-pending: [PROBE-01, PROBE-02]

# Metrics
duration: 4min  # autonomous Task 1 only; Tasks 2 + 3 are manual (off-the-clock)
completed: 2026-06-26  # scaffold complete; plan is at human checkpoint, NOT done
status: at-human-checkpoint
---

# Phase 1 Plan 03: Schema & IPC Spike (Bitwig-Side Spike) Summary

**Throwaway JS Controller Script + Java ServerSocket probe + the KEPT capabilities-doc skeleton (6 sections + Transport Decision, passes the structural validator) — autonomous Task 1 scaffolding only; Tasks 2 (in-app capability probes) + 3 (transport proof + live SC#1 round-trip) are blocking human-verify checkpoints requiring Bitwig Studio open.**

## Performance

- **Duration:** 4 min (autonomous Task 1 only)
- **Started:** 2026-06-26T20:04:52Z
- **Completed (Task 1):** 2026-06-26T20:08:25Z
- **Tasks:** 1 of 3 complete autonomously (Tasks 2 + 3 are manual checkpoints — off-the-clock)
- **Files modified:** 3 created

## Accomplishments
- Created `spike/bitwig-extension.js` (THROWAWAY, D-07): a plain-JS Bitwig Controller Script with the standard `host.defineController` + `init()` / `flush()` / `exit()` lifecycle, 6 commented capability-probe scaffolds (undo / note-editing / automation / bank paging / observer granularity / stable IDs) each with a `host.println(...)` evidence-emission stub, and the `selection.changed` emission path that registers `ITrackBank.addSelectionObserver` (verified origin, DrivenByMoss) and emits a JSON-Lines line shaped exactly to `schemas/protocol/event.schema.json`. Observers enqueue into `PENDING_SELECTION_EVENT`; `flush()` drains — Pitfall 3 (never block the controller thread) is enforced structurally even in the throwaway. The transport-send mechanism is a documented TODO with the 4 options from the JS-vs-Java tension table, resolved in Task 3 once A2 is observed.
- Created `spike/raw-tcp-probe.java` (THROWAWAY, Track B): a ~30-line `ServerSocket` probe resolving residual question A1 (does raw `java.net` work in the Bitwig JVM?). Binds `new ServerSocket(PORT, 50, InetAddress.getByName("127.0.0.1"))` — loopback ONLY (Pitfall 5 holds on the Java side too), accepts ONE connection, writes ONE JSON-Lines hello handshake shaped to `handshake.schema.json`, closes. JDK 21 is NOT installed — the file documents the OSC-as-proof fallback so Track B's purpose (confirm the JVM can network) is satisfiable without a JDK install. Compile + load instructions are inline comments.
- Created `docs/bitwig-capabilities.md` (KEPT — PROBE-01 output): the full structural skeleton. Header records A6 (API version) and A2 (JsApi networking surface) as **TODO-in-app**. The 6 required `##` sections in order (Undo Behavior, Note-Editing Scope, Automation Write, Bank Paging, Observer Granularity, Stable IDs) plus a Transport Decision section. Each section carries (a) the verified surface from RESEARCH.md, (b) the design questions, (c) an explicit `Observed: TODO-in-app` marker (D-02 — no fabricated behavior), and (d) a DRAFT Mitigation pre-filled from RESEARCH.md (D-04 — every gap → fact + Mitigation). `node scripts/check-capabilities-doc.mjs` exits 0.
- Verified all Task 1 acceptance criteria: structural validator passes (exit 0); `addSelectionObserver` present in the JS extension (8 matches); `ServerSocket` present + loopback-only bind in the Java probe (6 matches, zero `0.0.0.0`); the Java probe is ≤ ~40 effective lines of code (≈24 LOC + comments) and documents the JDK-21-absent OSC fallback. No observed Bitwig behavior was invented.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold throwaway spike files + capabilities-doc skeleton (autonomous prep)** — `b14a52d` (feat)

2. **Task 2 — BLOCKING HUMAN-VERIFY CHECKPOINT (Track A: in-app capability probes filling docs/bitwig-capabilities.md).** NOT committed — pending manual execution. See "Manual Steps Remaining" below.

3. **Task 3 — BLOCKING HUMAN-VERIFY CHECKPOINT (Track B: transport proof + live SC#1 round-trip).** NOT committed — pending manual execution. See "Manual Steps Remaining" below.

_Plan metadata commit: see "Final commit" below (STATE/ROADMAP/SUMMARY sync, after the SUMMARY is written)._

## Files Created/Modified
- `spike/bitwig-extension.js` — THROWAWAY JS Controller Script: 6 capability-probe scaffolds + selection.changed emission (SC#1 origin path); enqueue-then-drain pattern; transport-send TODO.
- `spike/raw-tcp-probe.java` — THROWAWAY Track B ServerSocket probe; loopback-only bind; JDK-21-absent OSC fallback documented.
- `docs/bitwig-capabilities.md` — KEPT PROBE-01 skeleton; 6 sections + Transport Decision; every Observed: field is a TODO-in-app marker; passes `check-capabilities-doc.mjs` structurally.
- `.planning/phases/01-schema-ipc-spike/01-03-SUMMARY.md` — this file.

## Decisions Made
- **Only Task 1 is autonomous.** Tasks 2 (in-app capability probes) and 3 (transport proof + live SC#1 round-trip) require Bitwig Studio open + the in-app scripting guide (which 404s externally — STATE.md blocker). Observed Bitwig behavior is the spike's OUTPUT, not its input (D-02). The executor returned `## CHECKPOINT REACHED` per the plan's blocking gates rather than fabricating observations.
- **Every Observed: field is a literal `TODO-in-app` marker.** The structural validator passes because each section already carries a DRAFT Mitigation (D-04) — NOT because truth has been observed. The Mitigations are explicitly marked DRAFT (pending observation); their final form depends on what the probes find.
- **The transport-send in the JS extension is a deliberate TODO with 4 options** (raw socket / file I/O / host.println log-tail / none → pivot to Java). It cannot be wired until A2 (does JsApi expose networking?) is observed in-app on spike day 1 — which is also the single most important finding because it determines whether Track A can carry the transport itself or Track B is required.
- **`requirements-completed: []`** — PROBE-01 needs the in-app Observed: findings (Task 2, manual); PROBE-02 needs the live TCP confirmation + captured real selection.changed round-trip (Task 3, manual). Both are phase-level requirements; this plan CONTRIBUTES the skeleton + throwaway artifacts that unblock the manual tasks, but does not satisfy either requirement on its own.
- **STATUS: `at-human-checkpoint` (not `complete`).** The plan is paused at the blocking gates; STATE.md and ROADMAP.md both reflect this so the next session knows to resume the manual work, not to advance the plan counter.

## Deviations from Plan

None — the autonomous Task 1 was executed exactly as specified. All Task 1 acceptance criteria pass:
- `spike/bitwig-extension.js` exists, is plain JS (no `package.json`/`import`), references `addSelectionObserver`, and contains 6 commented probe scaffolds matching the 6 capability items with `host.println` evidence stubs ✓
- `spike/bitwig-extension.js` does NOT fabricate observed API behavior — every Observed/finding field is a TODO marker pointing to Task 2 (D-02) ✓
- `spike/raw-tcp-probe.java` is ≤ ~40 LOC + comments, binds loopback only, documents the JDK-21-absent OSC-as-proof fallback ✓
- `docs/bitwig-capabilities.md` has all 6 required `##` sections + a Transport Decision section, and `node scripts/check-capabilities-doc.mjs` exits 0 ✓
- No observed Bitwig behavior is invented ✓

## Issues Encountered
- **Pre-existing untracked files in the working tree** (`docs/seed.md`, `.gitignore`, `.planning/research/.cache/...`) and a pre-existing modification (`.planning/config.json` — added `_auto_chain_active: false`). All out of scope for this task; left untouched. Only the 3 plan-specified files were staged + committed.

## Manual Steps Remaining (BLOCKING — Tasks 2 + 3)

> These are the exact manual actions a human with **Bitwig Studio 6.0.6 open** + **(optionally) JDK 21 installed** must perform to finish Plan 03 and unblock the phase's `/gsd-verify-work` gate. They are also reproduced in the `## CHECKPOINT REACHED` block returned by this executor.

### Track A — Task 2: in-app capability probes (PROBE-01 / SC#2)

1. **Open Bitwig Studio 6.0.6.** Open the in-app scripting guide: **Bitwig → Help → Developer Resources** (the externally-fetched version 404s — STATE.md blocker). Record the exact Control Surface API version exposed (open question A6 — expected `extension-api:21`, but observe) in `docs/bitwig-capabilities.md`'s header.
2. **Confirm the JsApi JS networking surface** (open question A2): is `host.*` a sandboxed subset with no raw socket / OSC / file I/O, or does it expose some networking? Record the finding in `docs/bitwig-capabilities.md`'s **Transport Decision** section (this determines which option Task 3 uses).
3. **Load `spike/bitwig-extension.js`** into Bitwig's ControllerScripts dir: Bitwig → Settings → Controllers → Add → Generic JS → point at the file.
4. **Drive each of the 6 probe functions** from the Bitwig console / a hotkey binding (uncomment the calls in `init()` or invoke from the console):
   - **Undo Behavior (DEEP, D-01):** `runUndoProbe()` — single `addNote` → `Application.undo()` → observe one-step removal; 5 `addNote` in tight loop → undo once → observe coalescing; probe for a labelled-undo API (`application.undo(label)` / `host.beginUndoTask(name)`). Record timing + exact `host.println` output.
   - **Note-Editing Scope (DEEP, D-01):** `runNoteEditingProbe()` — launcher-clip `addNote` → `getNotes()` round-trip; arbitrary start/length in beats; arranger-clip editability; `PinnableCursorClip` presence.
   - **Automation Write:** `runAutomationProbe()` — `AutomatableParameter.set()` under transport-play vs not; which envelope moves (clip vs track).
   - **Bank Paging:** `runBankPagingProbe()` — `TrackBank.scrollForwards()` / `scrollPageForwards()`; cursor-follows-scroll; 8 remotes/page.
   - **Observer Granularity:** `runObserverGranularityProbe()` — register selection + name observers; rapid mutation; measure fire rate / coalescing / thread.
   - **Stable IDs (D-03):** `runStableIdProbe()` — dump a track's `name+index` (+ any UUID-like property), drag-reorder in the UI, re-dump; did identity follow the track or the slot?
5. **Fill each section's `Observed:` field** in `docs/bitwig-capabilities.md` with the verified in-app finding, and **refine the Mitigation** to match (D-04). Replace every `TODO-in-app` literal with real observations.
6. **Re-run the validator:** `node scripts/check-capabilities-doc.mjs` — must still exit 0, now over real content.

### Track B — Task 3: transport proof + live SC#1 round-trip (PROBE-02 / SC#1)

**B-1 — Transport proof (choose based on the A2 finding from Task 2):**
- **Option A (preferred, expected):** if JsApi exposes raw sockets OR you install **OpenJDK 21** (NOT currently installed — RESEARCH.md §Environment), confirm raw `java.net` by loading `spike/raw-tcp-probe.java` per its inline compile instructions. Verify with `nc 127.0.0.1 7878` (or a one-line node client) — it must print one JSON-Lines hello line. This resolves A1 to VERIFIED and locks TCP.
- **Option B (fallback, no JDK needed):** reuse the already-proven DrivenByMoss OSC server as the transport-proof stand-in (its OSC works per RESEARCH.md), OR if JsApi has file/println I/O, use a relay. Record which path was used + the rationale in the doc's **Transport Decision** section.
- Apply the **Transport Decision Rule** (RESEARCH.md lines 180–186): raw TCP first; OSC-blob rejected unless TCP truly impossible; stdio relay last.

**B-2 — Live SC#1 round-trip:**
1. **Start the daemon dump receiver** (built in Plan 02):
   ```
   cd daemon && npx tsx src/cli/dump.ts --transport tcp --port 7878
   ```
   (it waits for one validated message on `127.0.0.1:7878`).
2. **With Bitwig open and the extension loaded** emitting `selection.changed` over the proven transport (wire the transport-send in `spike/bitwig-extension.js` per the chosen option, replacing the `host.println("[spike] would emit: ...")` stub), **change the selection in the Bitwig UI** (select a different track/clip).
3. **Capture the result:** the dump CLI must print **one validated `selection.changed` JSON line** to stdout and exit 0. The printed line must validate against `schemas/protocol/event.schema.json`.
4. **Record in the doc's Transport Decision section:** the chosen transport + the observed round-trip evidence (which byte path, latency impression, any gotchas). Also confirm any raw-TCP bind was loopback-only (Pitfall 5 holds on the Bitwig side too).

### After both tracks complete

- Commit the manual work:
  ```
  git add docs/bitwig-capabilities.md spike/bitwig-extension.js
  git commit -m "feat(01-03): fill in-app capability findings + wire transport (Task 2 + Task 3 manual checkpoints)"
  ```
- Update this SUMMARY's `status:` from `at-human-checkpoint` to `complete`; mark `requirements-completed: [PROBE-01, PROBE-02]`; advance the plan counter in STATE.md.
- Run `/gsd-verify-phase` (or the phase-level UAT gate) to close Phase 1.

## User Setup Required

**This plan requires MANUAL user setup and in-app verification** (Bitwig Studio + optionally JDK 21). It is NOT fully autonomous.

- **Bitwig Studio 6.0.6** must be open with the in-app scripting guide (Help → Developer Resources) consulted to design + verify the probes (D-02). The externally-hosted guide 404s (STATE.md blocker).
- **OpenJDK 21** is OPTIONAL — only needed if you choose Track B Option A (raw TCP Java probe). Track B Option B (DrivenByMoss OSC stand-in) requires no JDK install.
- See "Manual Steps Remaining" above for the exact in-app + CLI actions.

## Next Phase Readiness
- **NOT YET READY for Phase 2.** The bridge design in Phase 2 (`02-read-only-context-foundation`) locks against `docs/bitwig-capabilities.md` — and the doc currently contains only DRAFT Mitigations + TODO-in-app Observed markers. Until Task 2 runs and Task 3 confirms the transport, Phase 2 would be locking against guesses, not verified reality. That is precisely the failure mode the spike exists to prevent (D-01..D-04).
- **After the manual tasks complete:** the doc becomes design-ready (real observations + refined Mitigations), the Transport Decision is locked with evidence, and SC#1 is satisfied end-to-end with a captured real round-trip. Then Phase 2 can begin.
- **Daemon half is already proven** (Plan 02 — autonomous proof of SC#1's daemon side with an injected stdio message). The only thing standing between the spike and Phase 2 is the in-app Bitwig half documented above.

## Self-Check: PASSED

- Verified created files exist on disk:
  - `spike/bitwig-extension.js` — FOUND (303 lines)
  - `spike/raw-tcp-probe.java` — FOUND (90 lines: ~24 LOC + header/security/JDK-fallback comments)
  - `docs/bitwig-capabilities.md` — FOUND (270 lines, 6 sections + Transport Decision)
  - `.planning/phases/01-schema-ipc-spike/01-03-SUMMARY.md` — FOUND (this file)
- Verified Task 1 commit exists in git log: `b14a52d` FOUND.
- Re-ran Task 1 `<automated>` verification commands:
  - `node scripts/check-capabilities-doc.mjs` → exit 0, "passed structural validation"
  - `rg -c "addSelectionObserver" spike/bitwig-extension.js` → 8 (≥ 1 ✓)
  - `rg -c "ServerSocket" spike/raw-tcp-probe.java` → 6 (≥ 1 ✓)
  - `echo SCAFFOLD_OK` → printed
- Re-ran Task 1 acceptance-criteria structural assertions:
  - JS file is plain JS (no `package.json`/`import`) ✓ — verified by `rg "^import |^const .* = require" spike/bitwig-extension.js` = empty
  - JS file references `addSelectionObserver` + has 6 probe scaffolds with `host.println` evidence stubs ✓ — `runUndoProbe` / `runNoteEditingProbe` / `runAutomationProbe` / `runBankPagingProbe` / `runObserverGranularityProbe` / `runStableIdProbe` all present
  - JS file does NOT fabricate observed API behavior — every Observed/finding field is a TODO ✓ — `rg "Observed:" spike/` = empty (no Observed fields in spike code; the doc carries the TODO markers)
  - Java file binds loopback only ✓ — `rg "0\.0\.0\.0" spike/raw-tcp-probe.java` = empty; `rg 'getByName\("127\.0\.0\.1"\)' spike/raw-tcp-probe.java` = present
  - Java file documents the JDK-21-absent fallback ✓ — header comment block + "OSC-as-proof fallback" present
  - Capabilities doc has all 6 required `##` sections + Transport Decision ✓ — `rg "^## " docs/bitwig-capabilities.md` lists all 7
  - Capabilities doc passes `check-capabilities-doc.mjs` ✓ — exit 0
  - No observed Bitwig behavior is invented ✓ — every `Observed:` literal in the doc is followed by `TODO-in-app`
- **Threat surface scan:** the spike's only network-relevant surface is the `ServerSocket` bind in `spike/raw-tcp-probe.java` (T-3-01, mitigate — loopback-only) and the transport-choice decision (T-3-02, accept — single-user localhost). Both are in the plan's `<threat_model>` and both mitigations are honored (loopback literal; the doc's Transport Decision section will record the chosen transport with rationale). No new surface introduced.

---
*Phase: 01-schema-ipc-spike*
*Autonomous Task 1 completed: 2026-06-26. Plan PAUSED at blocking human-verify checkpoints (Tasks 2 + 3).*

---

## Spike Outcome (2026-06-26) — supersedes the manual-checkpoint status above

The spike's de-risking purpose is **achieved**. What actually happened (vs. the
JS/manual-checkpoint plan documented above):

- **D-07 deviation — pivoted JS → Java.** Empirically confirmed in-app that the
  JS control-surface `host` exposes **no networking and no file I/O** (only
  `println` to an in-app console, no disk log). The live transport therefore
  required a Java `.bwextension`. `spike/java/` (built against
  `Contents/Java/bitwig.jar`) is the real spike artifact; `spike/bitwig-extension.js`
  is retained as a record of the dead-end. JDK 21 installed via Homebrew.
- **SC#1 + SC#3 PROVEN LIVE.** `SpikeProbe.bwextension` registers a `CursorTrack`
  (follows selection), observes `position()`, and writes schema-valid
  `selection.changed` JSON-Lines over a loopback `java.net.Socket` to the daemon's
  `bw-brain-spike dump` CLI. Captured round-trip:
  `{"version":"1.0","type":"selection.changed","timestamp":1782512568,"payload":{"trackId":"trk_1"}}`
- **SC#2 (docs/bitwig-capabilities.md) surface-verified** against the in-app
  Javadoc 6.0.6: TCP confirmed; no labelled-undo API; no native stable-IDs;
  NoteStep-based note surface; `PinnableCursorClip` present; ServiceLoader
  packaging. Structural validator passes.

**Deferred to pre-Phase-3 (recorded in `docs/bitwig-capabilities.md` §Deferred):**
the behavioral probes — undo-coalescing timing, live NoteStep round-trip,
automation target envelope. They mutate a real project and refine Phase 3 UX
only; they do not change any architecture decision and do not gate Phase 2.

**Plan status:** complete (spike goal achieved). **Next:** `/gsd-verify-work`.
