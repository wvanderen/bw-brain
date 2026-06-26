---
status: complete
phase: 01-schema-ipc-spike
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md]
started: 2026-06-26T23:23:50Z
updated: 2026-06-26T23:32:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Frozen protocol contract (6 schemas)
expected: Six JSON Schema Draft 2020-12 files under schemas/protocol/ (envelope, event, request, response, edit, handshake); all declare 2020-12; envelope additionalProperties:false + oneOf into 5 message types; edit schema enforces trust-spine (payload.undoLabel minLength 1 + payload.operations minItems 1).
result: pass
evidence: 6/6 files present; 6/6 declare 2020-12; envelope oneOf=5 + additionalProperties:false; edit payload.required=[undoLabel,operations], undoLabel.minLength=1, operations.minItems=1

### 2. Generated TS types are idempotent
expected: `cd daemon && npm run gen:types` completes; re-running it produces zero diff (codegen is deterministic).
result: pass
evidence: npm run gen:types exit 0; regenerated src/gen byte-identical to committed (IDEMPOTENT_ZERO_DIFF); deterministic on 2nd run.

### 3. Schema validation suite green
expected: `cd daemon && npx vitest run schemas` exits 0 with 22/22 assertions passing — every schema validates its valid example and rejects malformed counter-examples.
result: pass
evidence: vitest run schemas → 22 passed (22), exit 0.

### 4. Daemon framing suite green
expected: `cd daemon && npx vitest run` exits 0 with 31/31 tests passing — schemas (22) + LineBuffer property test (6, 500 random byte-split lines reassembled) + handshake version-negotiation (3).
result: pass
evidence: vitest run → 31 passed (31): handshake 3 + line-buffer 6 + schemas 22, exit 0.

### 5. TypeScript compiles (NodeNext ESM)
expected: `cd daemon && npx tsc --noEmit` exits 0 — no unresolved deep imports, no type errors under module:NodeNext + .js import extensions.
result: pass
evidence: user-confirmed.

### 6. dump CLI autonomous proof (SC#1 daemon half, no Bitwig)
expected: Feeding a valid selection.changed over stdio (`printf '...\n' | npx tsx src/cli/dump.ts --transport stdio`) prints the VALIDATED message as JSON and exits 0. A malformed line is dropped (no stdout, no crash); a subsequent valid line is still processed.
result: pass
evidence: valid → printed validated JSON, exit 0; malformed → 0 bytes stdout, no crash, exit 0; malformed-then-valid → dropped bad, printed good, exit 0.

### 7. TCP transport binds loopback only (Pitfall 5)
expected: The dump CLI in TCP mode (`npx tsx src/cli/dump.ts --transport tcp --port 7878`) binds 127.0.0.1:7878 ONLY — a socket check (lsof/netstat) shows the listener on 127.0.0.1, never 0.0.0.0.
result: pass
evidence: lsof shows `127.0.0.1:17878 (LISTEN)`; no 0.0.0.0 in lsof or src/transport/tcp.ts; port released on kill.

### 8. Capabilities-doc passes structural validator
expected: `node scripts/check-capabilities-doc.mjs` exits 0 — the 6 required ## sections + Transport Decision are present, each with a non-empty Mitigation, validated over the real spike-outcome doc content.
result: pass
evidence: validator exit 0 ("passed structural validation"); 7 sections present (Header + 6 + Transport Decision). 4 TODO-in-app markers remain = intentionally deferred behavioral probes recorded in §Deferred (pre-Phase-3, non-blocking).

### 9. Spike artifacts present + loopback Java probe
expected: spike/bitwig-extension.js (throwaway JS controller script) and spike/raw-tcp-probe.java (Track B ServerSocket probe) both exist; the Java probe binds via InetAddress.getByName("127.0.0.1") with no 0.0.0.0 wildcard.
result: pass
evidence: both spike files present; bitwig-extension.js plain JS (7 addSelectionObserver refs, 0 imports); raw-tcp-probe.java loopback (2 getByName refs, 0 wildcards); spike/java/ (.bwextension) also present.

### 10. LIVE SC#1 round-trip (requires Bitwig)
expected: With Bitwig Studio open and the SpikeProbe.bwextension loaded, the daemon dump CLI in TCP mode receives a real selection.changed over loopback and prints one validated JSON line + exit 0. (Spike outcome says captured 2026-06-26.) If Bitwig is not available right now, report as blocked (not a code issue).
result: pass
evidence: live round-trip confirmed with fresh timestamp — `{"version":"1.0","type":"selection.changed","timestamp":1782516730,"payload":{"trackId":"trk_1"}}` (newer than spike's captured 1782512568), so the real Bitwig→daemon loopback path works now.

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
