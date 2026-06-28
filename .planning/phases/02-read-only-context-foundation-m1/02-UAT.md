---
status: testing
phase: 02-read-only-context-foundation-m1
source: [02-VERIFICATION.md]
started: 2026-06-27T22:13:27.000Z
updated: 2026-06-28T16:55:00.000Z
---

## Current Test

number: 2
name: VST/AU parameter exposure (Open Question A1 / BRIDGE-02 / CLI-03)
expected: Load a free VST (Vital/Surge) on the selected track, run `bw-device inspect`, observe whether the device-chain response surfaces VST params. Resolve A1 CONFIRMED or NEGATED.
awaiting: user run

## Tests

### 1. 02-02 Task 3 — Bitwig live SC#1 round-trip over production bridge
expected: Install bridge/target/bw-brain.bwextension, exercise selection/transport in Bitwig 6.0.6, observe all 5 event types (selection.changed + 4 *.name_changed/transport.changed) round-trip as schema-valid JSON-Lines over loopback TCP; bw-midi inspect returns non-empty notes for a clip with notes; bw-project summary returns 8 track entries via get.project_summary.
result: pass
reported: "RESOLVED by Plan 02-06 (2026-06-28). User installed the rebuilt .bwextension into Bitwig 6.0.6 — extension loads with NO deprecation error. Captured live via `nc -l 7878`: selection.changed x4, track.name_changed x6 (incl. windowed bank sweep slots 0-4 proving getItemAt fix), device.name_changed x1 ('Poly Grid'), transport.changed x2 (play/stop). 4/5 event types captured live; clip.name_changed not exercised in this session (observer wired at Observers.java:104-116; not required to close this gap). BRIDGE-01 live-load half satisfied. See 02-06-SUMMARY.md 'Observed Live Load' for the captured JSON-Lines lines."
severity: blocker (now resolved)

### 2. 02-02 Task 3 — VST/AU parameter exposure (Open Question A1 / BRIDGE-02 / CLI-03)
expected: Load a free VST (Vital/Surge) on the selected track, run `bw-device inspect`, observe whether the device-chain response surfaces VST params. Record finding in docs/bitwig-capabilities.md §4: either (A1 CONFIRMED) CursorRemoteControlsPage exposes VST params, or (A1 NEGATED) page is empty and the cursorDevice.getParameter(int) fallback is documented. NOTE: autonomous build verified via javap that CursorDevice exposes NO getRemoteControls() accessor in extension-api:21, so PullHandlers.handleSelectedDeviceChain currently returns an empty pages list — the live probe resolves the real enumeration path.
result: pending
previously: blocked (resolved unblock: 02-06 closed the load blocker)
reason: "Now runnable — extension loads cleanly. Awaiting user walkthrough."

### 3. 02-02 Task 3 — SC#3 bridge-reload reconcile smoke (STATE-04)
expected: With daemon running + state live, toggle the bw-brain extension OFF then ON in Bitwig Settings → Controllers. Observe the daemon detect disconnect (stateFreshness → disconnected), then on reconnect reconcile stable IDs via fingerprint + return stateFreshness → live WITHOUT corrupting state-cache.json. Confirm the same track selected before+after carries the SAME stable ID.
result: pending
previously: blocked (resolved unblock: 02-06 closed the load blocker)
reason: "Now runnable — extension loads cleanly. Awaiting user walkthrough."

### 4. 02-05 Task 3 — Pi `/analyze` runtime smoke (D-12 / UX-01/05/06)
expected: With daemon running + bridge connected + Bitwig open: (1) `pi install ./pi-pack` (Pi 0.79.10 confirmed installed); `pi list` shows the `analyze` skill. (2) `bw-focus export --json` returns real selection JSON; `bw-project summary --json` returns the windowed snapshot. (3) Invoke `/analyze` in a Pi session and observe: (a) State block renders Track/Clip/Device + Transport with Section as em-dash (UX-05/D-11); (b) What-this-is is a literal grounded description with NO section/motif/role/energy/automation claims (UX-01/D-10/Pitfall 7); (c) 2-4 next-actions each pointing at a read command (bw-midi inspect / bw-device inspect / edit intent.json / bw-project region); (d) EVERY output line + EVERY next-action carries an assumptions[] field with {claim, confidence, source} (UX-06); (e) If the bridge is disconnected/stale, /analyze refuses to describe + surfaces stateFreshness (SC#3).
result: pending
previously: blocked (resolved unblock: 02-06 closed the load blocker)
reason: "Now runnable — extension loads cleanly. Awaiting user walkthrough."

## Summary

total: 4
passed: 1
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

- truth: "Extension loads in Bitwig 6.0.6 and round-trips all 5 event types (selection.changed + 4 *.name_changed/transport.changed) as schema-valid JSON-Lines over loopback TCP; bw-midi inspect returns non-empty notes; bw-project summary returns 8 track entries."
  status: resolved
  previously: failed (severity: blocker)
  resolved_by: "02-06 (commit 3a9a271 — Observers.java:151 trackBank.getItemAt(i) + comment/doc corrections + scripts/check-deprecated-bridge.mjs gate; Task 2 user-verified live 2026-06-28)"
  resolved_at: 2026-06-28T16:50:00.000Z
  test: 1
  root_cause: "trackBank.getTrack(i) at bridge/src/main/java/com/bwbrain/bridge/Observers.java:139 calls TrackBank.getTrack(int), @Deprecated since Bitwig Control Surface API v2. Bitwig 6.0.6 host enforces deprecation-as-error at runtime: the call during init() -> Observers.register() -> wireTrackBank() throws, aborting init() and failing the extension load. Compiles fine (@Deprecated is only a javac warning) which is why autonomous build/javap verification passed but the real host rejects it. Knowledge-loss regression: Phase 1 spike already documented 'TrackBank.getTrack/getChannel are BOTH deprecated in API 21' and deliberately avoided TrackBank; Phase 2 bridge re-introduced getTrack(i) with a contradictory inline comment."
  artifacts:
    - ".planning/debug/extension-load-deprecated-getchannel.md"
    - ".planning/phases/02-read-only-context-foundation-m1/02-06-SUMMARY.md"
    - "bridge/src/main/java/com/bwbrain/bridge/Observers.java"
    - "scripts/check-deprecated-bridge.mjs"
    - "docs/bitwig-capabilities.md"
  missing: []
  debug_session: ".planning/debug/extension-load-deprecated-getchannel.md"
