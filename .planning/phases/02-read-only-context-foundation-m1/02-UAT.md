---
status: testing
phase: 02-read-only-context-foundation-m1
source: [02-VERIFICATION.md]
started: 2026-06-27T22:13:27.000Z
updated: 2026-06-27T22:13:27.000Z
---

## Current Test

number: 1
name: 02-02 Task 3 — Bitwig live SC#1 round-trip over production bridge
expected: |
  Install bridge/target/bw-brain.bwextension, exercise selection/transport in Bitwig 6.0.6, observe all 5 event types (selection.changed + 4 *.name_changed/transport.changed) round-trip as schema-valid JSON-Lines over loopback TCP; bw-midi inspect returns non-empty notes for a clip with notes; bw-project summary returns 8 track entries via get.project_summary.
awaiting: user response

## Tests

### 1. 02-02 Task 3 — Bitwig live SC#1 round-trip over production bridge
expected: Install bridge/target/bw-brain.bwextension, exercise selection/transport in Bitwig 6.0.6, observe all 5 event types (selection.changed + 4 *.name_changed/transport.changed) round-trip as schema-valid JSON-Lines over loopback TCP; bw-midi inspect returns non-empty notes for a clip with notes; bw-project summary returns 8 track entries via get.project_summary.
result: [pending]

### 2. 02-02 Task 3 — VST/AU parameter exposure (Open Question A1 / BRIDGE-02 / CLI-03)
expected: Load a free VST (Vital/Surge) on the selected track, run `bw-device inspect`, observe whether the device-chain response surfaces VST params. Record finding in docs/bitwig-capabilities.md §4: either (A1 CONFIRMED) CursorRemoteControlsPage exposes VST params, or (A1 NEGATED) page is empty and the cursorDevice.getParameter(int) fallback is documented. NOTE: autonomous build verified via javap that CursorDevice exposes NO getRemoteControls() accessor in extension-api:21, so PullHandlers.handleSelectedDeviceChain currently returns an empty pages list — the live probe resolves the real enumeration path.
result: [pending]

### 3. 02-02 Task 3 — SC#3 bridge-reload reconcile smoke (STATE-04)
expected: With daemon running + state live, toggle the bw-brain extension OFF then ON in Bitwig Settings → Controllers. Observe the daemon detect disconnect (stateFreshness → disconnected), then on reconnect reconcile stable IDs via fingerprint + return stateFreshness → live WITHOUT corrupting state-cache.json. Confirm the same track selected before+after carries the SAME stable ID.
result: [pending]

### 4. 02-05 Task 3 — Pi `/analyze` runtime smoke (D-12 / UX-01/05/06)
expected: With daemon running + bridge connected + Bitwig open: (1) `pi install ./pi-pack` (Pi 0.79.10 confirmed installed); `pi list` shows the `analyze` skill. (2) `bw-focus export --json` returns real selection JSON; `bw-project summary --json` returns the windowed snapshot. (3) Invoke `/analyze` in a Pi session and observe: (a) State block renders Track/Clip/Device + Transport with Section as em-dash (UX-05/D-11); (b) What-this-is is a literal grounded description with NO section/motif/role/energy/automation claims (UX-01/D-10/Pitfall 7); (c) 2-4 next-actions each pointing at a read command (bw-midi inspect / bw-device inspect / edit intent.json / bw-project region); (d) EVERY output line + EVERY next-action carries an assumptions[] field with {claim, confidence, source} (UX-06); (e) If the bridge is disconnected/stale, /analyze refuses to describe + surfaces stateFreshness (SC#3).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
