# Phase 2: Read-Only Context Foundation (M1) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 2-Read-Only Context Foundation (M1)
**Areas discussed:** Bridge mirror coverage, CLI surface & daemon shape, Derived-state & intent floor, Pi /analyze & package delivery

---

## Bridge Mirror Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor + windowed TrackBank | CursorTrack + PinnableCursorClip + CursorDevice follow GUI selection (proven), PLUS a windowed TrackBank so bw-project summary enumerates the project without full fan-out | ✓ |
| Cursor-only (minimal) | Mirror ONLY the GUI selection; lightest, all-proven surface | |
| Full project enumeration | Mirror every track/clip/device via full-size TrackBank; heaviest, bank-paging still TODO-in-app | |

**User's choice:** Cursor + windowed TrackBank
**Notes:** Bounds observer cost while enabling the project view; bank-paging page size left to research.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor device chain + VST/AU params | CursorDevice + parameter pages (CursorRemoteControlsPage) incl. loaded VST/AU plugins; meets CLI-03 | ✓ |
| Native device params only | Native Bitwig devices only; defer VST/AU until §3 probe confirms; under-delivers CLI-03 | |
| Full chain + VST/AU params | Every device in the selected track's full chain + params; heaviest | |

**User's choice:** Cursor device chain + VST/AU params
**Notes:** VST/AU params ride the same parameter-page surface as native devices.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: push selection/transport, pull verbose | Observers push lightweight/volatile state; heavy inspection pulled on-demand via get.*; reuses both frozen envelopes | ✓ |
| Push everything | Observers push all mirrored state; simplest model, high fan-out | |
| Pull everything (poll) | Daemon polls on CLI invocation; loses live selection.changed reactivity | |

**User's choice:** Hybrid: push selection/transport, pull verbose
**Notes:** Matches the bounded-queue drop-oldest-observational backpressure already implemented.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Skip automation mirror (slot reserved) | raw-state keeps `automation` slot empty in M1; AUTO-01 is Phase 5, §3 probe deferred | ✓ |
| Selected-parameter automation only | Mirror automation envelope of the single selected parameter read-only | |
| All automation read-only | Mirror all track/clip automation; overlaps Phase 5 scope | |

**User's choice:** Skip automation mirror (slot reserved)
**Notes:** Keeps M1 focused on notes/devices/structure.

---

## CLI Surface & Daemon Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Read commands live + 4 stubs | bw-focus/bw-project/bw-midi/bw-device live; bw-arrange/bw-automation/bw-edit/bw-diff stubs emitting clear not-implemented JSON | ✓ |
| Read commands only (no stubs) | Only the 4 read commands; arguably under-delivers CLI-01 "eight commands" | |
| Read commands + bw-diff live | 4 read + bw-diff live (SC#1), stub only bw-arrange/bw-automation/bw-edit | |

**User's choice:** Read commands live + 4 stubs (initial)
**Notes:** Followed by a reconciliation question (below) that promoted bw-diff to live.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Promote bw-diff to live (satisfies SC#1) | bw-diff as a live M1 read command (diff two raw-state snapshots, NOT patches); satisfies SC#1's "bw-diff round-trips 100%" | ✓ |
| Keep bw-diff stubbed | bw-diff stays a stub; SC#1's bw-diff criterion deferred/reinterpreted to M2 | |

**User's choice:** Promote bw-diff to live (satisfies SC#1)
**Notes:** Raised because the initial choice stubbed bw-diff, conflicting with binding SC#1. Final M1 CLI = 5 live (focus/project/midi/device/diff) + 3 stubs (arrange/automation/edit).

---

| Option | Description | Selected |
|--------|-------------|----------|
| Multicall binary + bw-* shims | One `bw-brain` binary dispatched by argv[0]; bw-focus/bw-project/etc as shims; both `bw-focus export` and `bw-brain focus export` work | ✓ |
| Single bw-brain binary, nested only | `bw-brain focus export` only; cleanest install, deviates from seed spelling | |
| Separate binaries | Genuinely separate bins; matches seed exactly, more shared-code plumbing | |

**User's choice:** Multicall binary + bw-* shims
**Notes:** git-style; honors seed's `bw-focus` naming and keeps one install.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Long-running daemon, CLI = thin client (separate channel) | Daemon is source of truth (state-cache.json, reconcile, stale watchdog per SC#3); CLI queries over a separate daemon-local channel; bridge TCP port stays bridge-only | ✓ |
| Long-running daemon, CLI reuses bridge protocol | CLI reuses the frozen JSON-Lines request/response protocol as another 127.0.0.1 peer; one protocol, mixes CLI+bridge traffic | |
| CLI reads state-cache.json directly | Daemon writes cache, CLI reads it; simplest CLI, stale risk, can't pull on-demand | |

**User's choice:** Long-running daemon, CLI = thin client (separate channel)
**Notes:** SC#3's "daemon survives bridge reload" implies long-running daemon; separating CLI-query from bridge-protocol keeps the two contracts independently evolvable.

---

## Derived-State & Intent Floor

| Option | Description | Selected |
|--------|-------------|----------|
| Framework-only + intent (no analyzers) | Build the derivation pipeline + confidence/assumptions plumbing; sections/motifs/energy/salience/roles all empty until their phase; intent is the only M1 derived output | ✓ |
| Framework + intent + light structural facts | Also surface tempo/key/track-count/clip-length as derived context without heavy analysis | |
| Framework + intent + one pulled-forward analyzer | Pull e.g. a trackRole heuristic forward; overlaps Phase 4 (ARRANGE-05) | |

**User's choice:** Framework-only + intent (no analyzers)
**Notes:** Every STATE-02 analyzer is explicitly a later phase; pulling forward = scope creep. M1 delivers the substrate.

---

| Option | Description | Selected |
|--------|-------------|----------|
| User-authored in intent.json | User authors .bw-brain/intent.json; M1 ships schema + validated read; no inference | ✓ |
| User-authored + light inferred defaults | Daemon seeds a summary guess the user edits; risks premature guessing | |
| Fully daemon-inferred | Daemon infers intent from the project; conflicts with accurate-first | |

**User's choice:** User-authored in intent.json
**Notes:** Accurate-first; inference is a later creative layer. Intent-edit UX is the agent's discretion.

---

## Pi /analyze & Package Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Descriptive + read-actions, assumptions[] on each | Accurate description of literal selection + how it maps to intent + 2-4 next actions pointing at read commands available now; no invented musical critique; assumptions[] on each | ✓ |
| Pure description only | Literal description, no next-actions critique; risks under-delivering UX-01 | |
| Description + heuristic critique | Light heuristic musical critique now; conflicts with framework-only and accurate-first | |

**User's choice:** Descriptive + read-actions, assumptions[] on each
**Notes:** Honors UX-01 + UX-06 at the honest M1 floor; the "below-threshold = refuse rather than guess" stance governs.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Render T/C/D + transport; section slot reserved | State pane renders selected track/clip/device + transport now; section-label slot reserved empty until Phase 4 | ✓ |
| Render T/C/D only (no section slot) | Render T/C/D; drop the section slot entirely (add in Phase 4) | |
| Defer state pane to Phase 4 | Ship only /analyze in M1; under-delivers UX-05 | |

**User's choice:** Render T/C/D + transport; section slot reserved
**Notes:** No fake section; the pane ships in M1 without inventing a section it can't derive.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Pi wraps CLI; CLI tested, Pi manual smoke | Pi pack invokes the CLI; CLI contract tested rigorously; Pi validated by manual runtime smoke, no automated live-Pi dependency | ✓ |
| Pi delivered, only CLI tested | Deliver Pi pack but defer all Pi-runtime validation (even manual) | |
| Automated live-Pi tests in Phase 2 | Automated tests against a live Pi/OpenClaw runtime in CI; strongest, adds test dependency | |

**User's choice:** Pi wraps CLI; CLI tested, Pi manual smoke
**Notes:** Matches PROJECT's locked "CLI is the stable interface, Pi gets best UX" + "Pi/OpenClaw is a real, installed runtime".

---

## the agent's Discretion

The following within-Phase-2 items were intentionally handed to research/planning rather than locked by the user:
- TrackBank page size (D-01) — bank paging still TODO-in-app.
- Daemon-local query channel: unix socket vs second loopback port; new schema vs subset (D-07).
- Intent editing UX — `/intent` command vs hand-edit-only (D-09).
- Analyzer-plugin interface contract (D-08) — M1 needs it to exist and be empty.
- `assumptions[]` JSON shape (UX-06 / D-10) — M1 needs it attached from day one.
- Pi package repo location + discovery/manifest (D-12).
- Stable-ID reconcile + stale-watchdog exact behavior (SC#3 / STATE-04) — design path locked, mechanics left to research.
- Java bridge build/packaging (Gradle, bridge/ location, ServiceLoader assembly) — the Phase-1 D-07 de-risk landing now.

## Deferred Ideas

None — discussion stayed within Phase 2 scope. Items above marked "the agent's discretion" are within Phase 2's domain and intentionally not pre-decided here; they are not deferrals to other phases.
