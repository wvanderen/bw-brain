---
phase: 02-read-only-context-foundation-m1
plan: 07
subsystem: daemon
tags: [daemon, boot, uds, tcp, correlator, fold-event, dispatcher, smoke-test, gap-closure, bitwig]

requires:
  - phase: 02-read-only-context-foundation-m1
    provides: Plan 02-03a/03b's 206 isolated unit tests (transports, reader, normalizer, reconcile, stale-watchdog, intent-store, atomic-write, state-cache, query-server, cli). All modules were built + tested in isolation; the assembly step was never written.
  - phase: 02-read-only-context-foundation-m1
    provides: Plan 02-06's deprecation-fixed bridge that emits all 5 event types over loopback TCP + answers get.project_summary/get.selected_clip/get.selected_device_chain.
provides:
  - "Runnable daemon: npm start in daemon/ boots a long-running process that opens UDS at ~/.bw-brain/daemon.sock (mode 0o600) + TCP on 127.0.0.1:7878 + stays up until SIGINT/SIGTERM. Closes the Phase-2 UAT blocker — every bw-* CLI was fail-closed because the socket never existed."
  - "foldEvent: PURE event->RawState fold for the 5 observational event types (mirrors normalizer.ts purity, NOT reconcile.ts in-place mutation). clip.name_changed empty payload is a documented no-op (Observers.java:104-116)."
  - "RequestCorrelator: get.* request/response-by-id with 3s timeout. send() wraps transport.send in try/catch (Minor 4 fix — TcpServerTransport.send throws synchronously when sockets.size===0; without the catch the pending {resolve,reject,timer} entry would leak with a dangling 3s timer)."
  - "Dispatcher: the onMessage branch — hello (forward-compatible), response (routes to correlator), 5 event types (fold + watchdog + onSnapshot debounced persist). Handler never throws + never does sync disk I/O (Pitfall 3)."
  - "Boot wiring: stale-socket probe-and-unlink (dbus/ssh-agent pattern), persisted-state load, intent load (null on malformed — user-fixable), watchdog/transports/correlator construction, 2.5s interval poll for disconnect/reconnect, debounced 1s state-cache persistence, SIGINT/SIGTERM graceful shutdown."
  - "tcp.ts additive hasConnectedSockets() accessor (Blocker 1 fix — purely additive boolean; weakens no invariant)."
  - "query-server.ts on-demand device/clip pull deps (Major 2 fix — pullDeviceChain? + pullSelectedClip? optional fields; device.inspect/midi.inspect await the pull when state live + cursor selection exists; on failure fall back to folded cache + degradation Assumption)."
  - "Fake-bridge smoke test (6 assertions, NO live Bitwig): boots daemon + asserts UDS 0600, schema-valid bw-focus envelope, selection.changed fold trackSid pattern, state-cache round-trip across restart, device.inspect on-demand pull surfaces fresh pages (Major 2 gate) + soft-fallback case."
affects: [02-uat, 02-verification, phase-3-reversible-midi-patching, phase-4-arrangement-intelligence, phase-5-automation-device-workflows, pi-package, daemon, bridge]

tech-stack:
  added: []
  patterns:
    - "Pure event fold (mirrors normalizer.ts): every branch returns a NEW shallow-spread RawState; the input is never mutated. Distinct from reconcile.ts caller-owned-map in-place mutation. The dispatcher does state = foldEvent(state, event, ctx) (reassignment)."
    - "Correlator send() transport-thrown cleanup (Minor 4): wrap transport.send in try/catch; on throw clear timer + delete pending + reject. Promise rejection is the only signal the caller sees (no re-throw)."
    - "Async-fire-and-forget for on-demand pulls (Major 2): the LineBuffer callback is sync-invoked but device.inspect/midi.inspect arms are async; transport.send runs from the async continuation wrapped in safeSend (try/catch — a SIGINT during a pull must not throw into the void)."
    - "Stale-socket probe-and-unlink (Unix daemon convention): net.createConnection with 300ms timeout; connect->refuse a second instance, ECONNREFUSED->unlink a stale file. Matches dbus/ssh-agent + RESEARCH.md Pattern 3 'cleaned on daemon exit.'"
    - "Lazy correlator slot (let + thunk deps): boot swaps the correlator on bridge disconnect; dispatcher + query-server pull callbacks read the slot lazily so the swap is transparent. No further rewiring needed."
    - "Debounced persistence (Pitfall 3): schedulePersist sets a 1s setTimeout on first call + no-ops until it fires; coalesces a burst of events into one atomic temp+rename write."
    - "Additive boolean accessor (Blocker 1): when a frozen module declares a private field with no public accessor + the assembly needs to observe its size, add a method that returns a boolean ONLY (no Set/socket exposure); weakens no invariant."

key-files:
  created:
    - daemon/src/ingest/fold-event.ts
    - daemon/src/ingest/fold-event.test.ts
    - daemon/src/protocol/correlator.ts
    - daemon/src/protocol/correlator.test.ts
    - daemon/src/runtime/boot.ts
    - daemon/src/runtime/dispatcher.ts
    - daemon/src/runtime/smoke.test.ts
  modified:
    - daemon/src/transport/tcp.ts
    - daemon/src/query/query-server.ts
    - daemon/package.json

key-decisions:
  - "Stale-socket probe-and-unlink (not refuse-and-exit): a crashed daemon's stale socket is the COMMON case; refusing to start would require the user to manually rm the socket after every crash — hostile. The probe (net.createConnection with 300ms timeout) distinguishes live (connect -> refuse + exit 1) from stale (ECONNREFUSED -> unlink + proceed). Matches the Unix daemon convention (dbus/ssh-agent) + RESEARCH.md Pattern 3 'cleaned on daemon exit.'"
  - "Disconnect detection via 2.5s interval poll + 1-line tcp.ts additive accessor (Blocker 1 fix): TcpServerTransport declared its `sockets` Set `private readonly` (tcp.ts:47) with no public accessor + no per-socket-close callback. The boot needs to observe 'any bridge sockets connected?' to fire watchdog.onBridgeDisconnect() on the true->false transition. Added ONE additive public method `hasConnectedSockets(): boolean` (body: `return this.sockets.size > 0;`) immediately after send. Purely additive: returns a boolean only, weakens no invariant (loopback guard + send-throws-on-empty both stay byte-for-byte), adds no behavior. The alternative (per-socket-close callback) would require a larger edit to a 02-03b-frozen module."
  - "Handshake wired but non-blocking: the dispatcher's hello branch calls negotiateVersion + replies hello.response WHEN a hello arrives, but the reconnect trigger is NOT 'hello arrived' — it is 'TCP accept + get.project_summary response.' The current bridge (BridgeExtension.startConnector:80-103) does NOT emit hello (verified by grep + Observers.java wire* methods); the daemon must work against it today. The hello path is forward-compatible (a future bridge that sends hello negotiates correctly) + exercised by the smoke test's fake bridge. This is an honest reading of the task brief's 'on receiving a hello envelope' (conditional)."
  - "fold-event purity (returns new objects, matches normalizer not reconcile): events are applied in sequence + the intermediate states are debuggable; a pure fold is trivially testable; the dispatcher does state = foldEvent(state, event, ctx) (reassignment). The clip.name_changed empty-payload event is a documented no-op (the bridge emits the type via cursorClip.getLoopLength but cannot fill the name — Observers.java:104-116; the daemon's selection.clipSid comes from the snapshot/reconcile path only)."
  - "Pull path = on-(re)connect snapshot refresh + on-demand device/clip pulls (Major 2 fix in-scope): the daemon proactively sends get.project_summary on every TCP (re)connect; the response seeds the baseline RawState + summaryTracks. ADDITIONALLY, device.inspect/midi.inspect issue get.selected_device_chain/get.selected_clip via the correlator WHEN state is live + a cursor selection exists + the optional pull dep is wired; the LineBuffer callback in query-server.ts:150 is async-fire-and-forget + transport.send fires from the async continuation. Rationale: UAT Test 2 exists to let the human observe whether VST params surface via bw-device inspect; without the on-demand pull, state.devices carries only {name,cursor:true} from device.name_changed folds -> no pages array -> Test 2 cannot resolve. The snapshot + fold combination stays the floor for the SYNCHRONOUS query-server arms (focus.export/project.summary/project.region)."
  - "M1 LIMITATION (DEFAULT_PROJECT — Minor 3 fix): the bridge's get.project_summary response (PullHandlers.java:91-100, 193-200) returns ONLY { tracks: [{slot,name}, ...] } — it does NOT carry version, project, or selection. Since normalize() requires a schema-valid RawState, the daemon supplies defaults: name='', tempo=120, timeSignature='4/4'. Pulling project metadata is a Phase-3+ concern (PullHandlers.java:146-150 dispatches ONLY get.selected_clip/get.selected_device_chain/get.project_summary — no get.project_meta handler exists today). Documented here + in boot.ts header + DEFAULT_PROJECT constant."
  - "Correlator send() transport-thrown cleanup (Minor 4 fix): RequestCorrelator.send wraps transport.send() in try/catch — TcpServerTransport.send (tcp.ts:88-92) throws synchronously when sockets.size===0; without the catch the registered {resolve,reject,timer} entry would leak with a dangling 3s timer. On throw: clearTimeout + pending.delete + reject with the underlying error. The catch MUST NOT re-throw — the promise rejection is the only signal the caller sees."

patterns-established:
  - "Daemon main() assembly lives in src/runtime/boot.ts (importable for tests + runnable via tsx). Main-entry guard: import.meta.url === pathToFileURL(process.argv[1]).href. Returns { shutdown } so callers (smoke test, harness) can tear down cleanly."
  - "Dispatcher createDispatcher(deps) returns the onMessage handler; deps use thunks for lazy-read fields (correlator, getState, summaryTracks) so boot can swap them transparently. Handler body never throws (wrap risky branches in try/catch + log)."
  - "Persistence is DEBOUNCED 1s (Pitfall 3) — never sync disk I/O on the event path. The dispatcher's onSnapshot hook is the boot's debounced entry point."
  - "Async-fire-and-forget for query-server pull arms: handleDeviceInspect/handleMidiInspect are async; the LineBuffer callback is sync-invoked but `void handle*()` runs them async; transport.send fires from the async continuation wrapped in safeSend (try/catch)."
  - "Boot's StableIdMap <-> StateCachePayload conversion helpers live as private functions in boot.ts (stableIdsToPayload/stableIdsFromPayload). Pure; exercised indirectly by the smoke test's restart round-trip."

requirements-completed: [STATE-01, STATE-04, CLI-01]

duration: 19min
completed: 2026-06-29
status: complete
---

# Phase 02 Plan 07: Daemon Boot main() + fold-event + correlator + dispatcher Summary

**Runnable daemon assembly (boot.ts + dispatcher.ts + fold-event + RequestCorrelator) closing the 02-03b deferral that blocked every Phase-2 bw-* CLI at the socket layer — plus the additive tcp.ts hasConnectedSockets() accessor (Blocker 1) + on-demand device/clip pull wiring in query-server.ts (Major 2)**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-06-29T02:16:21Z
- **Completed:** 2026-06-29T02:35:33Z
- **Tasks:** 2/2 complete
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments

- **Task 1 (TDD RED→GREEN):** fold-event.ts + correlator.ts pure primitives + 18 unit tests (10 fold + 8 correlator). foldEvent covers all 5 observational event types PURELY (every branch returns a new shallow-spread RawState; input never mutated — mirrors normalizer.ts purity, NOT reconcile.ts in-place map mutation). RequestCorrelator send/resolve/timeout/close with DEFAULT_CORRELATOR_TIMEOUT_MS=3000 + the Minor 4 transport-throws cleanup gate.
- **Task 2 (assembly):** boot.ts main() + dispatcher.ts + tcp.ts additive accessor + query-server.ts on-demand pulls + package.json npm script + fake-bridge smoke test (6 assertions). `npm start` in daemon/ now boots a long-running process; SIGINT triggers graceful shutdown; the UDS socket opens at mode 0o600 + TCP listens on 127.0.0.1:7878 (loopback-only per Pitfall 5).
- **Blocker 1 closed:** tcp.ts additive `hasConnectedSockets(): boolean` accessor enables the boot's 2.5s interval poll to detect bridge socket-loss -> watchdog.onBridgeDisconnect() + correlator rebuild + (on reconnect) refreshSnapshot() with reconcile(). UAT Test 3 (reconcile-on-reconnect) is now mechanically reachable.
- **Major 2 closed:** query-server.ts on-demand `pullDeviceChain?` / `pullSelectedClip?` deps wire device.inspect/midi.inspect to the correlator's get.selected_device_chain/get.selected_clip pulls. UAT Test 2 (VST params via bw-device inspect) is now semantically runnable — the human can observe whether the bridge surfaces VST params + resolve Open Question A1.
- **Phase-2 UAT unblocked:** the daemon is runnable (UAT Test 4); a bw-* CLI returns a schema-valid envelope end-to-end (the 02-04 contract becomes reachable, not fail-closed); disconnect/reconnect fires reconcile via the interval+accessor (Test 3); device.inspect pulls fresh pages (Test 2).

## Task Commits

Each task was committed atomically. Task 1 is TDD (RED→GREEN):

1. **Task 1 RED: failing tests for fold-event + correlator primitives** — `f7091c9` (test)
2. **Task 1 GREEN: implement fold-event + correlator primitives** — `30dce17` (feat)
3. **Task 2: daemon boot main() + dispatcher + npm start + fake-bridge smoke** — `539722c` (feat)

**Plan metadata:** this SUMMARY commit (docs) — see below.

## Files Created/Modified

- `daemon/src/ingest/fold-event.ts` — PURE event->RawState fold for the 5 observational event types (selection.changed, track.name_changed windowed + cursor forms, clip.name_changed no-op, device.name_changed, transport.changed). Imports RawState/StableIdMap from reconcile.js; exports FoldContext + foldEvent.
- `daemon/src/ingest/fold-event.test.ts` — 10 tests: one per event type + the clip.name_changed no-op gate + the unknown-type defensive branch + the final purity gate across all branches. Asserts every branch returns a new object AND the input is byte-for-byte unchanged.
- `daemon/src/protocol/correlator.ts` — RequestCorrelator class. send(type,payload?) generates uuid, registers {resolve,reject,timer}, arms 3s setTimeout, calls transport.send WRAPPED in try/catch (Minor 4 fix). resolve(id,payload) on unknown id logs + drops (T-2-07-R). close() rejects all pending with Error("correlator closed") + clears timers (T-2-07-E).
- `daemon/src/protocol/correlator.test.ts` — 8 tests incl. case 7 (Minor 4 transport-throws gate: throws -> promise rejects + outstanding()===0 + no dangling timer after advanceTimersByTime(10_000)).
- `daemon/src/runtime/boot.ts` — Daemon main(). Exports OUR_VERSION="1.0", DEFAULT_TCP_PORT=7878, DEFAULT_STATE_CACHE_PATH, DEFAULT_INTENT_PATH, boot(opts?) -> Promise<{shutdown}>. Stale-socket probe, persisted-state load, intent load, watchdog/transports/correlator construction, reader+dispatcher wiring, 2.5s interval bridge-alive poll, debounced 1s persistence, SIGINT/SIGTERM graceful shutdown, main-entry guard.
- `daemon/src/runtime/dispatcher.ts` — createDispatcher(deps) returns the onMessage handler. Branches: hello (forward-compatible handshake negotiation), response (routes to correlator), 5 event types (fold + watchdog.onBridgeMessage + onSnapshot hook). Handler never throws + never does sync disk I/O.
- `daemon/src/runtime/smoke.test.ts` — 6 assertions against a fake bridge over loopback TCP. Proves the daemon boots + listens + answers a CLI query + round-trips state-cache + the device.inspect on-demand pull surfaces fresh pages — all WITHOUT a live Bitwig host.
- `daemon/src/transport/tcp.ts` — additive `hasConnectedSockets(): boolean` accessor immediately after send (Blocker 1 fix). Purely additive; weakens no invariant.
- `daemon/src/query/query-server.ts` — extended QueryServerDeps with optional pullDeviceChain? + pullSelectedClip?. device.inspect/midi.inspect arms now async-fire-and-forget via handleDeviceInspect/handleMidiInspect; await the pull when state live + cursor selection exists; on failure fall back to folded cache + degradation Assumption. safeSend wraps transport.send in try/catch.
- `daemon/package.json` — added `start` + `dev` scripts running `tsx src/runtime/boot.ts`.

## Decisions Made

See the `key-decisions` frontmatter block above. The six documented decisions are:

1. **Stale-socket probe-and-unlink** (not refuse-and-exit) — the Unix daemon convention.
2. **Disconnect detection via 2.5s interval poll + 1-line tcp.ts additive accessor** (Blocker 1).
3. **Handshake wired but non-blocking** — the current bridge sends no hello; reconnect trigger is TCP accept + get.project_summary response.
4. **fold-event purity** — returns new objects (matches normalizer.ts, NOT reconcile.ts in-place mutation).
5. **Pull path = on-(re)connect snapshot refresh + on-demand device/clip pulls** (Major 2 in-scope).
6. **M1 LIMITATION: project name/tempo NOT pulled from Bitwig** — DEFAULT_PROJECT literal supplies them (Minor 3); Phase-3+ concern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] enrichSummaryTracks — the boot must construct ObservedObject shape from {slot, name}**
- **Found during:** Task 2 (smoke test assertion 3 failing — selection.trackSid undefined)
- **Issue:** The bridge's `get.project_summary` returns ONLY `{slot, name}` (PullHandlers.java:91-100), but `reconcile()` casts tracks blindly to `ObservedObject` and reads `obj.name/obj.type/obj.neighbors/obj.contentHash`. With the raw summary, `type` is undefined -> `nameKey(obj)` returns `"undefined:Kick"` instead of `"track:Kick"`, so the fold's `stableIds.byNameAndType.get("track:Kick")` resolution failed -> `selection.trackSid` was omitted -> the smoke test's selection.changed assertion failed.
- **Fix:** Added `enrichSummaryTracks()` helper in boot.ts. Each summary track becomes `{name, type:"track", neighbors: sorted[prev,next] names, contentHash: "track-m1-"+name, slot}`. The enrichment shape mirrors `reconcile.test.ts:35-47 buildTrackState` (type/neighbors/contentHash fields). contentHash is a stable M1 placeholder (Phase 3+ will populate clip-derived content).
- **Files modified:** daemon/src/runtime/boot.ts (added enrichSummaryTracks helper + called it inside refreshSnapshot before normalize).
- **Verification:** Smoke test assertion 3 passes — selection.changed folds to a trackSid matching `^trk_[0-9a-f]{16}$`. Full suite stays green (265 tests).
- **Committed in:** 539722c (Task 2 commit)

**2. [Rule 2 - Missing Critical] boot mkdir's the socket parent dir before listen**
- **Found during:** Task 2 (manual `npm start` failed EACCES on a fresh ~/.bw-brain/ path)
- **Issue:** node's `net.Server.listen(path)` does NOT create the parent directory. The default `~/.bw-brain/daemon.sock` path failed EACCES on a fresh machine because `~/.bw-brain/` didn't exist. The smoke test passed because it uses an existing temp dir; production `npm start` would fail without this.
- **Fix:** Added `fs.mkdirSync(dirname(socketPath), { recursive: true })` in boot.ts before constructing the UDS transport. Mirrors the `atomic-write.ts:47` pattern (mkdir before write).
- **Files modified:** daemon/src/runtime/boot.ts (one line in step d).
- **Verification:** `npm start` boots cleanly: `srw------- 1 eggfam staff 0 ... daemon.sock` (mode 0600) + `[boot] bw-brain daemon up: uds=...daemon.sock tcp=127.0.0.1:7878`. SIGINT triggers graceful shutdown.
- **Committed in:** 539722c (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 2 — missing-critical functionality the plan underspecified; both necessary for the boot to actually work end-to-end).
**Impact on plan:** Both auto-fixes necessary for correctness. The first is a shape-completion the plan implied but didn't spell out (reconcile needs ObservedObject, the bridge sends only {slot,name}); the second is a one-line mkdir the plan assumed the listener would handle. Neither expands scope — both close gaps the plan's "the daemon boots + listens" success criterion requires.

## TDD Gate Compliance

Task 1 is `tdd="true"`. Gate sequence verified in git log:

- **RED gate:** `f7091c9` — `test(02-07): add failing tests for fold-event + correlator primitives` (test commit BEFORE any implementation; tests failed at import-time — module-not-found, the canonical RED state).
- **GREEN gate:** `30dce17` — `feat(02-07): implement fold-event + correlator primitives` (feat commit AFTER RED; tests pass: 18/18).
- **REFACTOR gate:** N/A (no refactor needed; the GREEN implementations are already minimal + the purity discipline prevents incidental cleverness).

No violations. The fail-fast rule held: the RED tests failed for the right reason (missing module), not for an unrelated cause.

## Issues Encountered

- **Vitest unhandled-rejection warnings from correlator test cleanups:** initial correlator test draft had three tests (timeout / close / uniqueness) whose `c.close()` rejected promises that the test never attached `.catch` handlers to. Fixed by attaching rejection handlers up-front (`p.then(() => ..., (e) => e as Error)` typed as Promise<Error>). Test-only change, no implementation impact.
- **TypeScript narrowing on `.catch((e: Error) => e)` return type:** under NodeNext strict, `Promise<object>.catch(handler)` returns `Promise<object | Error>` (handler widens), so `err.message` failed typecheck. Fixed by typing the caught promise explicitly as `Promise<Error>` with a two-arg `.then(onResolve, onReject)` form. Test-only change.

## Smoke Test Outcome (the PROOF — NO live Bitwig required)

All 6 assertions PASS:

```
✓ assertion 1: UDS socket exists at mode 0o600 (Pitfall 5)                              46ms
✓ assertion 2: bw-focus query returns a schema-valid cli-query envelope               2588ms
✓ assertion 3: selection.changed -> fold -> focus.export selection.trackSid
               matches ^trk_[0-9a-f]{16}$                                              2800ms
✓ assertion 4: state-cache.json persists across a daemon restart                      2590ms
✓ assertion 5 (Major 2): device.inspect triggers an on-demand
               get.selected_device_chain pull + surfaces the fresh pages payload       2796ms
✓ assertion 5 soft-fallback: device.inspect with NO bridge -> ok:true +
               devices from folded cache + pull-failed assumption                      3069ms
```

**What this proves end-to-end without Bitwig:**
- The daemon boots, opens both listeners (UDS 0o600 + TCP loopback 7878), and stays up until SIGINT/SIGTERM.
- A bw-* CLI invocation against the running daemon returns a schema-valid cli-query result envelope (the 02-04 CLI contract becomes reachable, not fail-closed).
- The 5 bridge event types fold PURELY into RawState; a `selection.changed {slot:0}` event resolves to a fingerprint-minted trackSid matching `^trk_[0-9a-f]{16}$` (STATE-04 end-to-end without Bitwig).
- Daemon restart preserves project memory (state-cache.json round-trips across a shutdown+reboot).
- `device.inspect` triggers an on-demand `get.selected_device_chain` pull against the fake bridge AND the result carries the canned `{pages:[{name:"OSC", remotes:[...]}]}` payload (Major 2 gate — proves VST-param-shaped data surfaces end-to-end). The soft-fallback case (no bridge) returns the folded cache + a `device-chain pull failed` assumption.

**Manual `npm start` verification (post-task-2):**
```
> bw-brain-daemon@0.0.0 start
> tsx src/runtime/boot.ts
[boot] bw-brain daemon up: uds=/Users/eggfam/.bw-brain/daemon.sock tcp=127.0.0.1:7878
srw-------@ 1 eggfam staff 0 Jun 28 21:34 /Users/eggfam/.bw-brain/daemon.sock   # mode 0600
[boot] shutting down...                                                        # SIGINT
```

## UAT Tests 2/3/4 — SEMANTICALLY RUNNABLE (the human's job with real Bitwig)

- **UAT Test 2 (VST/AU exposure / Open Question A1):** SEMANTICALLY RUNNABLE via the on-demand `device.inspect` pull (Major 2 wiring). The human runs `bw-device inspect` against a live Bitwig host; the daemon issues `get.selected_device_chain`; the CLI surfaces whatever the bridge returns. NOTE: PullHandlers.java:181-191 currently returns an EMPTY pages list (Open Question A1 / Pitfall 10 — CursorDevice exposes no getRemoteControls() in extension-api:21); this plan's on-demand pull surfaces whatever the bridge returns, including the current empty list. The human CAN observe the bridge's response (empty-or-not) and resolve Open Question A1 — the daemon no longer masks the bridge's response.
- **UAT Test 3 (SC#3 reload-reconcile):** SEMANTICALLY RUNNABLE via the `hasConnectedSockets()` accessor (Blocker 1) + 2.5s interval. The human triggers a bridge reload (toggle the controller extension OFF/ON in Bitwig); the boot's interval detects the true->false transition -> `watchdog.onBridgeDisconnect()` + correlator rebuild; on the false->true transition -> `refreshSnapshot()` -> `reconcile()` rebinds stable IDs via the 3-stage fuzzy fallback. The 20-track reorder property (already proven in 02-03a's held-out test) is now reachable from a real bridge.
- **UAT Test 4 (the daemon runs end-to-end):** RUNNABLE via `npm start`. The human launches the daemon, then exercises the bw-* CLIs against a live Bitwig host. No more fail-closed.

## Self-Check

- [x] Task 1 RED commit exists (`f7091c9` — `test(02-07): add failing tests...`)
- [x] Task 1 GREEN commit exists after RED (`30dce17` — `feat(02-07): implement fold-event + correlator...`)
- [x] Task 2 commit exists (`539722c` — `feat(02-07): daemon boot main() + dispatcher + npm start + fake-bridge smoke`)
- [x] `cd daemon && npx tsc --noEmit` exits 0 (NodeNext strict — all 10 modified/created files compile clean)
- [x] `cd daemon && npx vitest run` -> 265/265 passing (241 baseline + 18 fold/correlator + 6 smoke; NO regressions in 02-01..02-06 work)
- [x] `cd daemon && npm start` boots a long-running daemon at ~/.bw-brain/daemon.sock (mode 0600) + 127.0.0.1:7878
- [x] SIGINT triggers graceful shutdown (`[boot] shutting down...` + socket unlinked)
- [x] Smoke test all 6 assertions PASS without live Bitwig (assertion 5 is the Major 2 device-chain pull gate; assertion 5-soft is the fallback-with-degradation-assumption case)
- [x] foldEvent purity gate passes (input state byte-for-byte unchanged across all 7 fold branches)
- [x] RequestCorrelator Minor 4 gate passes (transport.send thrower -> promise rejects + outstanding()===0 + no dangling timer after advanceTimersByTime(10_000))
- [x] tcp.ts additive hasConnectedSockets() accessor is purely additive (returns boolean only; no Set/socket exposure; send-throws-on-empty + loopback guard unchanged)
- [x] query-server.ts pullDeviceChain?/pullSelectedClip? deps are OPTIONAL (existing tests + no-bridge path work when absent)

## Self-Check: PASSED

## User Setup Required

None — the daemon is a local-only process. To run it manually:

```bash
cd daemon && npm start
# Daemon listens on:
#   - UDS at ~/.bw-brain/daemon.sock (mode 0o600)
#   - TCP at 127.0.0.1:7878 (loopback only — bridge listener)
# Ctrl-C (SIGINT) triggers graceful shutdown.

# To exercise the bw-* CLIs against the running daemon:
bw-focus export        # -> JSON envelope with selection + transport
bw-project summary     # -> JSON envelope with project metadata (M1 defaults)
bw-device inspect      # -> JSON envelope with cursor-device pages (Major 2 pull)
```

## Next Phase Readiness

- **Plan 02-07 is COMPLETE.** Both tasks committed atomically; the smoke test is the autonomous verify bar; the daemon boots + listens + answers a CLI query end-to-end without a human or Bitwig.
- **The Phase-2 UAT blocker is CLOSED.** Until this plan landed, every bw-* CLI failed-closed with `{ok:false, stateFreshness:"disconnected"}` because `~/.bw-brain/daemon.sock` never existed. Now the daemon is runnable via `npm start`.
- **UAT Tests 2/3/4 are SEMANTICALLY RUNNABLE** as the follow-up UAT — they require a live Bitwig host. The natural next step is `/gsd-verify-work 02` to walk through them.
- **Phase 3+ dependencies satisfied:** the boot assembly, the dispatcher's fold path, the correlator's pull path, and the additive tcp.ts accessor are all in place for M2 (reversible MIDI patching) to layer on.

---
*Phase: 02-read-only-context-foundation-m1*
*Plan: 07 (gap-closure)*
*Completed: 2026-06-29*
