---
phase: 05-automation-device-workflows-m4
plan: 10
status: pending-live-session
created: 2026-08-23
host: Bitwig Studio 6.0.11 on macOS
---

# Phase 5 Live UAT Ledger (U1–U10)

End-of-phase acceptance evidence for AUTO-01..04 + UX-04 and the five ROADMAP
success criteria, executed against live Bitwig with native + third-party
chains. **Honesty contract (04.3 P04 precedent):** every row below starts
`[pending]`; a verdict is recorded ONLY from a direct producer observation in
the host. Failures keep FAIL verdicts with defect notes and named follow-ups —
never re-run to green without a fix landing. Nothing in this ledger is inferred.

## Environment block

| Property | Value |
|----------|-------|
| **Host DAW** | Bitwig Studio 6.0.11, macOS |
| **Bridge artifact** | `bridge/target/bw-brain.bwextension` — sha256 `92b05c3ca1865b625e45b88d7a5a716c8b20da742712b9d0e05302047fd5ab94` |
| **Bridge freshness gate** | PASSED 2026-08-23T16:10:27Z (artifact newer than newest source commit `Observers.java` @ 2026-08-23T16:05:27Z; `node scripts/check-bridge-artifact.mjs` green after a clean `mvn -f bridge/pom.xml clean package`) |
| **Installed extension** | `~/Documents/Bitwig Studio/Extensions/bw-brain.bwextension` — fresh artifact installed 2026-08-23 (prior Aug-22 stale copy backed up as `bw-brain.bwextension.stale-20260823`). **Producer must restart Bitwig (or toggle the bw-brain controller) to load it — the installed copy now carries the `selection.deviceSid` fold + apply-wire scope threading.** |
| **CLAP plugin** | `clap/build/bw_brain_product_artefacts/Release/CLAP/bw-brain.clap` (bundle binary 2026-08-22 16:24 — newer than every clap source; contains the 05-09 Devices drawer) |
| **Daemon** | `npm start` — loopback `127.0.0.1:7878`, running since 2026-08-23 (~16:11Z, PID 49310) |
| **Suites at handoff** | daemon vitest **1053/1053** (78 files); bridge JUnit via `mvn -q -f bridge/pom.xml test` exit 0 |
| **Project under test** | a real project with: native devices whose macro modulators are mapped to remote-controls pages, at least one third-party VST/AU (Surge XT class), controllable transport, and a **non-default tempo/time signature** (needed by U9) |

## Pre-handoff automated verification (2026-08-23, plan 05-10 Task 2 agent side)

Recorded before the blocking live-session checkpoint; all machine-checkable
preconditions verified, two deviations auto-fixed (Rule 3 — blocking):

- **Daemon suite:** `npm --prefix daemon test` — **1053/1053** (78 test files),
  exit 0.
- **Bridge suite:** `mvn -q -f bridge/pom.xml test` — exit 0.
- **Bridge freshness gate:** initially **FAILED** — the packaged artifact's
  mtime (16:04:59Z) prededed the newest source commit timestamp
  (`Observers.java` @ 16:05:27Z, the `selection.deviceSid`-fold commit
  dfbaff8) because the gap-closure flow packaged seconds before committing;
  content was current but the mtime gate could not see it. Auto-fix: forced
  `mvn -f bridge/pom.xml clean package` → gate **PASSED** (artifact mtime
  2026-08-23T16:10:27Z; sha256 `92b05c3c…` recorded in the environment block).
- **Installed extension:** was the stale Aug-22 build (`ad75c512…` — missing
  the `selection.deviceSid` fold + apply-wire scope threading). Auto-fix:
  fresh artifact copied into `~/Documents/Bitwig Studio/Extensions/`, prior
  copy backed up as `bw-brain.bwextension.stale-20260823`. **Loading it
  requires a Bitwig restart / controller toggle — a live-host action that
  remains a producer pre-flight step.**
- **CLAP bundle freshness:** `bw-brain.clap` binary (2026-08-22 16:24) newer
  than every clap source — contains the 05-09 Devices drawer.
- **Daemon runtime:** `npm start` running, listening on loopback
  `127.0.0.1:7878` (PID 49310), left up through the checkpoint.

## Pre-flight checklist (producer, before row U1)

1. Restart Bitwig (or toggle the bw-brain controller off/on) so the fresh
   extension from the environment block is loaded — verify no controller error
   in Bitwig's controller log.
2. Daemon running (`npm start`; it is already up on this host — if it died,
   restart it and note the time).
3. Open the real project named in the environment block.
4. Know the write-arm control: **arranger automation write arm** is the
   operative gate for U5/U6/U10 (docs/bitwig-capabilities.md §3, dated
   2026-08-22 vocabulary table).

## Ten-row matrix

| Row | Steps (live) | Expected | Observed | Verdict |
|-----|--------------|----------|----------|---------|
| U1 — salience live (AUTO-01, SC#1) | Select the track; perform exaggerated knob movements — a remote-page macro knob several times, then 3–4 VST params; run `bw-automation inspect --refresh --explain` | The moved params rank top with the macro knob at/near first; fresh `pulledAt`; assumptions visible | [pending — live session] | [PENDING] |
| U2 — VST chain inspection (AUTO-04, SC#1/4) | Select the third-party VST (Surge XT class); run `bw-device inspect --explain` | Enumerated bounded parameters (indices, names where exposed, values) — not empty pages; record the Java-side `getParameter(int)` behavior (graceful per-index degradation vs hard-throw — the §4 A2 follow-up flagged for this UAT) | [pending — live session] | [PENDING] |
| U3 — macros-suggest (AUTO-02, SC#2) | On the worked session (after U1 movement); run `bw-device macros-suggest --refresh --explain` | Ranked list; EVERY suggestion carries evidence + assumptions + ≥1 alternative; an XY pair appears when two independently expressive params moved | [pending — live session] | [PENDING] |
| U4 — drawer device review (UX-04, SC#5) | Click the Devices button in the CLAP editor | Chain summary, ranked parameter targets, macro opportunities, and a `pulledAt` line render in the bounded drawer — no layout breakage | [pending — live session] | [PENDING] |
| U5 — propose→preview→apply during playback (AUTO-03, SC#3) | Transport PLAYING **and arranger automation write ARMED**; pick a ranked paramKey from U1; `bw-automation propose --param <key> --shape ramp_up --length-bars 4`; preview = the propose result's `curve.points` (see known-gap note); `bw-edit apply <patchId> --confirm` | Per §3 pinned semantics (write-arm is the gate): envelope points land at exactly the authored target values on the **arranger track automation lane** for the intended target device; no silent current-value-only move | [pending — live session] | [PENDING] |
| U6 — unarmed write refusal (D-05-05, AUTO-03, SC#3) | Automation write DISARMED (transport stopped or playing — both are unarmed no-op states per §3); propose + approve another patch via `bw-edit apply <patchId> --confirm` | Named refusal `automation_write_disabled` (arranger variant) surfaces BEFORE dispatch; NO parameter or envelope mutation. NOTE: the plan's literal "transport_stopped" wording is superseded by the dated §3 vocabulary table — transport state is NOT the gate; write-arm is (armed + stopped writes points) | [pending — live session] | [PENDING] |
| U7 — revert applied automation (D-05-07, AUTO-03, SC#3) | Run `bw-edit revert <patchId>` against the U5 apply; then (recovery check) Bitwig ⌘Z | Prior value restored / authored points removed. KNOWN GAP (deferred-items 05-06): the bridge refuses `remove_automation_points` (`removal_surface_unverified`) — the daemon revert of applied automation is expected to surface `apply_failed`, with ⌘Z as the documented recovery. Record the actual behavior verbatim; this row doubles as the 05-10 removal-surface question | [pending — live session] | [PENDING] |
| U8 — freshness honesty (D-05-04) | Disconnect the bridge (close Bitwig or toggle the controller); run `bw-automation inspect`; reconnect and refresh; optionally reproduce the corrupt-snapshot case | Stale-but-readable snapshot with a visible `pulledAt` (never silently fresh); reconnect+refresh works; corrupt snapshot (if reproduced) refuses with `snapshot_invalid` | [pending — live session] | [PENDING] |
| U9 — project meta (D-05-16) | With the bridge connected and the project at a NON-default tempo/time signature, restart the daemon; check `state.project` (e.g. `bw-project summary` / focus export) | Daemon tempo/timeSig match the actual project values — not the 120 / 4-4 defaults | [pending — live session] | [PENDING] |
| U10 — drawer proposal round-trip (UX-04, AUTO-03, SC#3/5, RB-04) | Publish the automation candidate (from U5 or a fresh `bw-automation propose`) to the hosted session via the existing `proposal.publish` path; open the drawer ProposalView; approve/apply from the drawer with transport playing **and write-arm ON** | ProposalView renders digest + assumptions (kind-agnostic proposal rendering exercised live); the mutation outcome surfaces in the drawer/session (apply result / outcome message) — never a silent parameter change | [pending — live session] | [PENDING] |

## Per-row known-gap notes (bind the honesty contract to the live run)

- **U5 preview:** `previewPatch` is note-only for automation ops (deferred-items
  05-05/05-08) — `bw-edit preview` on an automation patch yields an empty
  diff. The preview signal for proposals is the propose result's `curve`
  block (`points`, `pointCount`, `valueMin/valueMax`, `beatSpanBeats`,
  bounded ≤ 64 points). Judge the preview step against the propose result.
- **U5/U10 write-arm:** the 2026-08-22 live probe (§3) proved write-arm — not
  transport — is the gate. Armed (arranger) + playing OR stopped lands points
  at exact target values on the arranger track lane; unarmed is a silent
  envelope no-op, which is exactly why the `automation_write_disabled`
  pre-flight refusal (U6) must fire before dispatch. Value readback is async —
  do not expect the written value synchronously.
- **U6 vocabulary:** `transport_stopped` is RETIRED as a refusal trigger. The
  row deliberately tests the unarmed refusal; recording which named reason
  actually fires is the acceptance evidence for D-05-05.
- **U7 removal surface:** if `apply_failed` fires, record the refusal verbatim
  and verify ⌘Z restores the prior state — the verdict reflects the honest
  observation (FAIL stays FAIL until a verified removal surface lands;
  04.3 P04 precedent).
- **U2 Java-side `getParameter(int)`:** the JS API hard-throws (§4 A2, live
  2026-08-22). Whether the Java extension host degrades gracefully per-index
  is exactly what this UAT observes — record enumerated params vs empty
  pages vs errors, and whether `device_parameter`-sourced params surface at
  all alongside `remote_page` macros.
- **Clip/launcher-targeted automation stays refused** (`ambiguous_target`,
  launcher-armed cells UNVERIFIED — D-05-06). No U1–U10 row asks for a
  clip-targeted write; if one is attempted anyway, the named refusal is the
  expected outcome, never a bug.

## Requirement → row matrix

| Requirement | Rows | Completion rule |
|-------------|------|-----------------|
| AUTO-01 | U1 (+U8 freshness semantics) | flips complete only on a passed U1 |
| AUTO-02 | U3 | flips complete only on a passed U3 |
| AUTO-03 | U5, U6, U7, U10 | flips complete only on passed write/refusal/revert evidence |
| AUTO-04 | U2 | flips complete only on a passed U2 |
| UX-04 | U4, U10 | flips complete only on passed drawer evidence |

## Success-criteria → row map (ROADMAP §Phase 5)

| SC | Statement (abridged) | Backing rows |
|----|----------------------|--------------|
| SC#1 | Confirmed scope exposes the device chain + per-track automation salience, CLI retained | U1, U2 |
| SC#2 | Ranked macro/XY with disambiguation + assumptions, never an unexplained single "best" | U3 |
| SC#3 | Bounded automation = inspectable proposals via the candidate/pre-flight/controller/journal path, medium risk | U5, U6, U7, U10 |
| SC#4 | Coverage extends to third-party VST/AU chains | U2 |
| SC#5 | CLAP device workspace renders chain summary, targets, macro opportunities, mutation outcome | U4, U10 |

## Defect notes

*(empty — filled only from live observations; a FAIL row must land here with a
named follow-up before any re-run)*

## Live observations log

*(dated entries recorded during the live session — attempt number, row,
observed behavior, verbatim refusal strings where they fire)*

## Completion verdict

**PENDING — awaiting the live producer session (plan 05-10 Task 2, blocking
human-verify).** Verdicts are transcribed only from actual observations
(Task 3); no row may be marked PASS without a recorded live observation.
