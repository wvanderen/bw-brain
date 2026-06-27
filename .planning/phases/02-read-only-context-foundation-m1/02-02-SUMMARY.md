---
phase: 02-read-only-context-foundation-m1
plan: 02
subsystem: bitwig-bridge
tags: [java, bitwig, bwextension, maven, controller-extension, service-loader, observers, json-lines, loopback-tcp, jackson, junit, shade-plugin]

# Dependency graph
requires:
  - phase: 02-read-only-context-foundation-m1/01
    provides: "the Plan-01-extended event.schema.json (5-event enum) + request.schema.json (3 get.* enum) + response.schema.json ({id,ok,payload} shape) the bridge emits against"
  - phase: 01-schema-ipc-spike/03
    provides: "the proven Phase-1 spike pattern (CursorTrack.position() observer + LinkedBlockingQueue outbox + loopback java.net.Socket + ServiceLoader registration) replicated into production Java"
provides:
  - "bridge/target/bw-brain.bwextension — the Maven-built production Java bridge (shade-packaged, ServiceLoader-discovered, extension-api:21 excluded)"
  - "BridgeDefinition (ControllerExtensionDefinition, getName bw-brain, API 21) + BridgeExtension (ControllerExtension: loopback socket + observer registration + pull-handler dispatch)"
  - "Observers — CursorTrack.position/name + PinnableCursorClip + CursorDevice.name + Transport.isPlaying + windowed TrackBank[N=8] observers (all 5 event types, all outbox.offer non-blocking)"
  - "PullHandlers — get.selected_clip (Clip.getStep grid walk) / get.selected_device_chain (deferred A1) / get.project_summary dispatch over the shared loopback socket"
  - "Outbox (LinkedBlockingQueue + daemon writer thread) + LineJson (Jackson event/response/error builders)"
  - "JUnit pure-logic tests (15 green) for Outbox/LineJson/PullHandlers"
  - "event.schema.json payload extended additively (slot/name/playing) so the 5-event set validates"
affects: [02-03a, 02-03b, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: [maven@3.9.16, com.bitwig:extension-api@21, jackson-databind@2.22.0, junit-jupiter@5.11.0, maven-shade-plugin@3.6.2, maven-compiler-plugin@3.15.0]
  patterns:
    - "Maven shade -> copy-rename to .bwextension (DrivenByMoss reference transcribed verbatim; AGENTS.md Pitfall 9 — Maven over Gradle)"
    - "ServiceLoader discovery: META-INF/services/com.bitwig.extension.ExtensionDefinition one-line FQCN (capabilities doc §Transport Decision — NOT manifest, NOT class scanning)"
    - "Observer-enqueue-never-block (Pitfall 3 / capabilities doc §5): every observer calls outbox.offer() ONLY; grep-verified zero socket.write in Observers.java (T-2-02-D)"
    - "Loopback-only socket (Pitfall 5 / T-2-02-T): LOOPBACK=\"127.0.0.1\" constant, never the wildcard"
    - "skipFirstFire guard per observer (spike lines 73-77): Bitwig observers fire once on registration with boot state; skip so the daemon's first line is a real change"
    - "Connector-thread retry-until-daemon-up (spike pattern): the socket lifecycle is owned by BridgeExtension; Outbox only drains a passed-in connected socket"
    - "Shared socket, two directions: Outbox writes events+responses; PullHandlers reads get.* requests on the same loopback socket"
    - "Pure-logic response builders (NoteView/PageView/TrackView records) decoupled from the Bitwig API so PullHandlersTest runs without live Bitwig (RESEARCH.md Manual-Only table)"

key-files:
  created:
    - "bridge/pom.xml"
    - "bridge/src/main/java/com/bwbrain/bridge/BridgeDefinition.java"
    - "bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java"
    - "bridge/src/main/java/com/bwbrain/bridge/Observers.java"
    - "bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java"
    - "bridge/src/main/java/com/bwbrain/bridge/Outbox.java"
    - "bridge/src/main/java/com/bwbrain/bridge/LineJson.java"
    - "bridge/src/main/resources/META-INF/services/com.bitwig.extension.ExtensionDefinition"
    - "bridge/src/test/java/com/bwbrain/bridge/OutboxTest.java"
    - "bridge/src/test/java/com/bwbrain/bridge/LineJsonTest.java"
    - "bridge/src/test/java/com/bwbrain/bridge/PullHandlersTest.java"
    - "bridge/.gitignore"
    - "bridge/target/bw-brain.bwextension (built artifact)"
  modified:
    - "schemas/protocol/event.schema.json (additive payload-union extension)"
    - "daemon/src/gen/event.ts (regenerated)"
    - "daemon/src/protocol/schemas.test.ts (4 new payload-union test cases)"
    - "docs/bitwig-capabilities.md (Phase-2 Task-3 Pending Live Verification section)"

key-decisions:
  - "Cursor clip is created FROM the cursor track via cursorTrack.createLauncherCursorClip(16,128) -> PinnableCursorClip; host.createCursorClip(int,int) returns a plain Clip without the pin surface. CursorDevice via cursorTrack.createCursorDevice() -> PinnableCursorDevice (IS-A CursorDevice). Confirmed via extension-api:21 javap."
  - "Transport observer uses isPlaying() (BooleanValue) — the plan's playState() does not exist on Transport in extension-api:21. Confirmed via javap."
  - "clip.name_changed uses PinnableCursorClip.getLoopLength() as the clip-selection-change proxy — the public Clip/CursorClip surface has no name() accessor (Clip extends ObjectProxy); the launcher-clip NAME accessor is pending Task-3 live verification. The event TYPE is emitted; the name string is filled by the live probe."
  - "get.selected_clip enumerates Clip.getStep(x,y,0) over the 16x128 grid with a velocity>0 heuristic — there is NO getNotes() returning a NoteStep[] dump in the public API (only step-based getStep). The exact note-vs-rest semantics are confirmed live in Task 3."
  - "get.selected_device_chain returns an empty pages list in M1 — CursorDevice exposes NO getRemoteControls()/parameter-page accessor in extension-api:21 (verified via javap). This is the Open Question A1 / Pitfall 10 live-verify item; the real parameter-walk path (incl. VST/AU exposure) is resolved by the Task-3 human-verify checkpoint."
  - "Observers is instantiated (not a static register) so it can hold a thread-safe snapshot cache (volatile scalars + ConcurrentHashMap) shared with PullHandlers for get.project_summary — the plan's static-register signature couldn't share the cursor/bank state the pull handlers read."
  - "event.schema.json payload extended ADDITIVELY (slot/name/playing optional fields) — the Phase-1 payload was selection.changed-only and could not represent a transport flag or a name; additionalProperties stays false (trust-spine T-2-02-E preserved), the Pitfall-1 enum gate is unaffected (56 daemon schema tests pass)."

patterns-established:
  - "Pattern: the production bridge is a dumb transport (observers enqueue, writer drains, pull handlers answer) — all musical intelligence lives in the daemon (PROJECT.md 'the bridge stays dumb')."
  - "Pattern: pure-logic response builders (view records + static build*Response methods) decouple the testable response-shape logic from the Bitwig-API enumeration that needs a live host — the bridge's unit tests run in CI without Bitwig."
  - "Pattern: additive-only schema extension preserves the trust-spine (additionalProperties:false) while letting the 5-event observational set carry real state — never relax to additionalProperties:true as a shortcut."

requirements-completed: []  # The autonomous build is done but BRIDGE-01/02/03 require live Bitwig confirmation (Task 3, deferred to end-of-phase UAT). Nothing here is live-confirmed.
requirements-progressed: [BRIDGE-01, BRIDGE-02, BRIDGE-03]
manual-checkpoints-pending: [BRIDGE-01, BRIDGE-02, BRIDGE-03]

# Metrics
duration: ~50 min
completed: 2026-06-27
status: complete
---

# Phase 02 Plan 02: Production Java `.bwextension` Bridge Summary

**Maven-built Java bridge (ServiceLoader-discovered, shade-packaged) mirroring the full Phase-2 observer set (cursor triple + transport + windowed TrackBank[N=8]) over loopback JSON-Lines TCP + 3 get.* pull handlers, with 15 pure-logic JUnit tests green — the live Bitwig verification (Task 3) deferred to end-of-phase UAT per `workflow.human_verify_mode`.**

## Performance

- **Duration:** ~50 min (autonomous Tasks 1 + 2 + Task-3 deferral; Tasks 1+2 build + test + package)
- **Started:** 2026-06-27 (Wave 0 env setup)
- **Completed (autonomous scope):** 2026-06-27
- **Tasks:** 2 of 3 complete autonomously (Task 3 is a blocking human-verify checkpoint — deferred to end-of-phase UAT)
- **Files modified:** 16 (13 created, 4 modified)

## Accomplishments
- Built the production Java `.bwextension` bridge replacing the Phase-1 throwaway spike: Maven project (DrivenByMoss-reference pom.xml), ServiceLoader discovery, BridgeDefinition (API 21, name "bw-brain", version 0.1.0), and the full BridgeExtension lifecycle.
- Wired the complete Phase-2 observer set (D-01) verified against the extension-api:21 Javadoc: `CursorTrack.position()/name()`, `PinnableCursorClip` (via `cursorTrack.createLauncherCursorClip`), `CursorDevice.name()` (via Device), `Transport.isPlaying()`, and windowed `TrackBank[8]` track names — every observer uses `outbox.offer()` only (grep-verified zero socket writes, T-2-02-D) with per-observer skipFirstFire guards.
- Implemented the 3 get.* pull handlers (D-03) over the shared loopback socket: `get.selected_clip` (Clip.getStep grid walk), `get.selected_device_chain` (deferred to Task 3 — A1/Pitfall 10), `get.project_summary` (windowed TrackBank snapshot) — with pure-logic response builders tested in isolation.
- Extended `event.schema.json` payload additively (slot/name/playing) so the 5-event observational set validates against the contract (the Phase-1 payload was selection.changed-only); 56 daemon schema tests pass including 4 new payload-union cases, Pitfall-1 enum gate holds.
- Packaged `bridge/target/bw-brain.bwextension` (2.3 MB, ServiceLoader resource present, `com/bitwig/` excluded — extension-api:21 provided; supply-chain tree clean per T-2-02-SC audit).
- Deferred Task 3 (live Bitwig verification: SC#1 round-trip + VST/AU exposure A1 + SC#3 reload-reconcile) to end-of-phase UAT — recorded as PENDING HUMAN OBSERVATION in `docs/bitwig-capabilities.md` (Phase-1 D-02 discipline: no fabricated findings).

## Task Commits

Each task was committed atomically:

1. **Task 1: Maven skeleton + Outbox/LineJson + ServiceLoader + JUnit tests (BRIDGE-01 spine)** — `63ca8c6` (feat)
2. **Task 2: Full observer set + get.* pull handlers + Rule-3 event payload extension (BRIDGE-01/02/03)** — `af96ea1` (feat)
3. **Task 3: Live-verification checks recorded as PENDING (deferred to end-of-phase UAT)** — `0f84cdf` (docs)

_The plan-metadata commit follows this SUMMARY (orchestrator owns STATE/ROADMAP; this plan only commits SUMMARY + capabilities doc)._

## Files Created/Modified
- `bridge/pom.xml` — Maven build (extension-api:21 provided, jackson 2.22.0, junit 5.11, shade -> bw-brain.bwextension).
- `bridge/src/main/java/com/bwbrain/bridge/BridgeDefinition.java` — ControllerExtensionDefinition (bw-brain, 0.1.0, API 21).
- `bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java` — ControllerExtension: loopback socket + connector thread + observer/pull-handler wiring.
- `bridge/src/main/java/com/bwbrain/bridge/Observers.java` — the 5 observer groups + thread-safe snapshot cache.
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` — get.* dispatch + pure response builders.
- `bridge/src/main/java/com/bwbrain/bridge/Outbox.java` — LinkedBlockingQueue + daemon writer thread.
- `bridge/src/main/java/com/bwbrain/bridge/LineJson.java` — Jackson event/response/error line builders.
- `bridge/src/main/resources/META-INF/services/com.bitwig.extension.ExtensionDefinition` — ServiceLoader FQCN.
- `bridge/src/test/java/com/bwbrain/bridge/{Outbox,LineJson,PullHandlers}Test.java` — 15 pure-logic JUnit tests.
- `bridge/target/bw-brain.bwextension` — the built artifact (installed into Bitwig at Task 3).
- `schemas/protocol/event.schema.json` — additive payload-union extension (slot/name/playing).
- `daemon/src/gen/event.ts` — regenerated.
- `daemon/src/protocol/schemas.test.ts` — 4 new payload-union test cases.
- `docs/bitwig-capabilities.md` — Phase-2 Task-3 "Pending Live Verification" section.

## Decisions Made
See `key-decisions` frontmatter above. The headline calls: (1) cursor clip from cursor track not host; (2) isPlaying() not playState(); (3) clip.name_changed via loopLength proxy (name accessor pending live); (4) getStep grid walk not getNotes; (5) device-chain deferred (no accessor in API 21 — A1); (6) Observers instantiated for shared snapshot cache; (7) additive schema extension preserves trust-spine.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `event.schema.json` payload additively so the 5-event set validates**
- **Found during:** Task 2 (wiring observers to emit the 5 event types)
- **Issue:** The Plan-01-frozen `event.schema.json` payload was `additionalProperties:false` with only `trackId/clipId/deviceId` (selection.changed-only). The 4 new event types cannot carry their observed state under that schema — `transport.changed {playing}` and `track.name_changed {name}` would be rejected by the daemon's Ajv validator. The plan's own Task 2 action text built payloads (`Map.of("playing", ...)`, `Map.of("name", ...)`) that violate the frozen payload.
- **Fix:** Added optional `slot` (integer), `name` (string), `playing` (boolean) fields to the payload. Kept `additionalProperties:false` (trust-spine T-2-02-E preserved) and the existing `trackId/clipId/deviceId` (additive — selection.changed still validates). Regenerated `event.ts`; the Pitfall-1 enum gate is unaffected (enum unchanged).
- **Files modified:** schemas/protocol/event.schema.json, daemon/src/gen/event.ts, daemon/src/protocol/schemas.test.ts (4 new cases)
- **Verification:** 56 daemon schema tests pass (52 prior + 4 new payload-union cases); `npx tsc --noEmit` clean.
- **Committed in:** af96ea1 (Task 2 commit)

**2. [Rule 3 - Blocking] Created a minimal `BridgeExtension` stub in Task 1 so the skeleton compiles**
- **Found during:** Task 1 (`mvn test` compile)
- **Issue:** `BridgeDefinition.createInstance` returns `new BridgeExtension(...)`, but the plan's Task 1 file list omits `BridgeExtension` (it's a Task 2 file). The skeleton cannot compile without the class.
- **Fix:** Added a minimal `BridgeExtension` stub (constructor + empty init/exit/flush) in Task 1; Task 2 replaced it with the full implementation.
- **Files modified:** bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java
- **Committed in:** 63ca8c6 (Task 1), replaced in af96ea1 (Task 2)

**3. [Rule 3 - Blocking] API-reality corrections vs plan assumptions (deferred detail to Task 3)**
- **Found during:** Task 2 (compiling observers/pull-handlers against extension-api:21)
- **Issue:** The plan assumed several API calls that don't match extension-api:21's public surface: `transport.playState()` (actual: `isPlaying()`), `cursorClip.getNotes()` returning a NoteStep[] dump (actual: step-based `getStep(x,y,scene)`), `cursorDevice.getRemoteControls()` (does not exist in API 21), `host.createCursorClip` returning PinnableCursorClip (actual: returns plain Clip; the pin surface comes from `cursorTrack.createLauncherCursorClip`).
- **Fix:** Implemented against the verified signatures (isPlaying, getStep grid walk, createLauncherCursorClip). The device-chain walk (no accessor) and the exact clip-name accessor are deferred to the Task-3 live probe (Open Question A1 / capabilities doc §2 — exactly the live-verification items the plan flagged).
- **Files modified:** Observers.java, PullHandlers.java, BridgeExtension.java
- **Verification:** bridge compiles + 15 tests green; mvn package produces bw-brain.bwextension.
- **Committed in:** af96ea1 (Task 2 commit)

**4. [Rule 3 - Blocking] `Observers` instantiated (not static) to share the snapshot cache with `PullHandlers`**
- **Found during:** Task 2 (design)
- **Issue:** The plan's `Observers.register(host, outbox)` static signature creates the cursors internally, but `PullHandlers` needs the same cursor instances (PinnableCursorClip for getStep, TrackBank snapshot for project_summary). A static register couldn't share them.
- **Fix:** `BridgeExtension.init()` creates the cursor triple + transport + trackBank and passes them to both `Observers.register(...)` (instance, wires observers + maintains a snapshot cache) and `PullHandlers.start(...)` (reads the cache + cursorClip). The cursor creation calls match the plan's intent; only the ownership/signature moved.
- **Committed in:** af96ea1 (Task 2 commit)

**5. [Rule 2 - Missing Critical] Added `bridge/.gitignore` (`/target/`, `dependency-reduced-pom.xml`)**
- **Found during:** Task 1 (staging)
- **Issue:** Without it, `git add bridge/` would commit the 2.3 MB build artifacts + the shade-plugin byproduct.
- **Fix:** Added a 2-line `.gitignore`.
- **Committed in:** 63ca8c6 (Task 1 commit)

---

**Total deviations:** 5 auto-fixed (4 Rule-3 blocking enablers, 1 Rule-2 hygiene). **Impact on plan:** All auto-fixes were necessary for the bridge to compile, emit schema-valid events, and keep build artifacts out of git. The API-reality corrections (deviation 3) surface genuine findings that the plan itself flagged as Task-3 live-verification items — none represent scope creep; all keep the bridge dumb and defer the uncertain surfaces to the human-verify checkpoint exactly as the plan designed.

## Deferred to end-of-phase UAT (Task 3 — blocking human-verify)

> This plan runs under `workflow.human_verify_mode: end-of-phase`. Task 3 is a
> `checkpoint:human-verify` with `gate="blocking"` that requires Bitwig Studio
> 6.0.6 open — it CANNOT be done autonomously. The 3 sub-checks are recorded as
> **PENDING HUMAN OBSERVATION** in `docs/bitwig-capabilities.md` (Phase-2 Task-3
> section). The verifier harvests them into `02-UAT.md` at end-of-phase.

The user must, with Bitwig open, perform:
1. **SC#1 round-trip (BRIDGE-01/03):** install `bridge/target/bw-brain.bwextension`, exercise selection + transport, confirm all 5 event types round-trip as schema-valid JSON-Lines over the production bridge; confirm `bw-midi inspect` + `bw-project summary` return real data.
2. **VST/AU exposure (Open Question A1 / BRIDGE-02 / CLI-03):** load a VST, run `bw-device inspect`, observe whether the device-chain response surfaces VST params. The bridge's `get.selected_device_chain` returns an empty pages list until the live probe resolves the real parameter-enumeration path (CursorDevice has no `getRemoteControls()` in extension-api:21 — A1/Pitfall 10).
3. **SC#3 reload-reconcile (STATE-04):** toggle the extension off/on, confirm the daemon reconciles stable IDs via fingerprint and returns `stateFreshness` to live without `state-cache.json` corruption.

**No Bitwig behavior is fabricated.** Every item above is a pending observation, recorded for the end-of-phase UAT gate.

## Issues Encountered
- **OutboxTest FIFO test** initially offered raw strings without trailing newlines; the writer contract (LineJson + spike) is that offered strings are complete JSON-Lines lines including `\n`. Fixed the test to offer `"event i\n"`. (Test-only fix, not a code bug.)
- **`dependency-reduced-pom.xml`** (shade-plugin byproduct) appeared untracked — added to `bridge/.gitignore`.

## User Setup Required

**This plan requires MANUAL user setup for Task 3** (Bitwig Studio 6.0.6 open). See "Deferred to end-of-phase UAT" above and the `user_setup` frontmatter in 02-02-PLAN.md. The autonomous Tasks 1 + 2 require only `brew install maven` + `JAVA_HOME=/opt/homebrew/opt/openjdk@21` (both done in Wave 0).

## Next Phase Readiness
- The production bridge compiles, unit-tests green (15), and packages. It is ready to load into Bitwig for the Task-3 live verification.
- Plans 03a/03b (daemon ingest + STATE-04) consume the 5 event types + 3 get.* responses this bridge emits; the schema contract is locked (Plan 01 + this plan's additive extension).
- Plan 04 (CLI) serves `bw-midi inspect` / `bw-device inspect` / `bw-project summary` by issuing the get.* requests this bridge answers.
- **Blocker until Task 3 runs:** the device-chain parameter walk (get.selected_device_chain) returns empty pages until the live probe resolves the CursorRemoteControlsPage accessor — the bridge's autonomous half cannot resolve Open Question A1.

## Self-Check: PASSED

**Created files exist on disk:**
- FOUND: bridge/pom.xml
- FOUND: bridge/src/main/java/com/bwbrain/bridge/BridgeDefinition.java
- FOUND: bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java
- FOUND: bridge/src/main/java/com/bwbrain/bridge/Observers.java
- FOUND: bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java
- FOUND: bridge/src/main/java/com/bwbrain/bridge/Outbox.java
- FOUND: bridge/src/main/java/com/bwbrain/bridge/LineJson.java
- FOUND: bridge/src/main/resources/META-INF/services/com.bitwig.extension.ExtensionDefinition
- FOUND: bridge/src/test/java/com/bwbrain/bridge/OutboxTest.java
- FOUND: bridge/src/test/java/com/bwbrain/bridge/LineJsonTest.java
- FOUND: bridge/src/test/java/com/bwbrain/bridge/PullHandlersTest.java
- FOUND: bridge/target/bw-brain.bwextension (2,387,920 bytes)

**Commits exist:**
- FOUND: 63ca8c6 (feat(02-02): Maven bridge skeleton + Outbox/LineJson + ServiceLoader + JUnit tests)
- FOUND: af96ea1 (feat(02-02): full observer set + get.* pull handlers + Rule-3 event payload extension)
- FOUND: 0f84cdf (docs(02-02): record Task-3 live-verification checks as PENDING in capabilities doc)

**Plan-level `<verification>` re-run:**
- `cd bridge && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` → 15/15 green (Outbox 3 + LineJson 6 + PullHandlers 6). PASS.
- `cd bridge && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn package` → target/bw-brain.bwextension produced (2.3 MB). PASS.
- `cd bridge && mvn dependency:tree` → only extension-api:21 (provided) + jackson trio + junit (test) + jsr305 (provided, transitive of extension-api). No unexpected transitive deps. PASS (T-2-02-SC).
- `jar tf target/bw-brain.bwextension | grep -c com/bitwig/` → 0 (extension-api excluded by shade filter). PASS.
- `cd daemon && npx vitest run src/protocol/schemas.test.ts` → 56/56 pass (Pitfall-1 gate holds). PASS.

**Acceptance criteria:** all Task-1 + Task-2 criteria verified inline; the device-chain-walk criterion (8 remotes/page) is the one explicitly deferred to Task 3 (A1 — no accessor in API 21). Documented honestly.

---
*Phase: 02-read-only-context-foundation-m1*
*Autonomous Tasks 1 + 2 completed: 2026-06-27. Task 3 deferred to end-of-phase UAT.*
