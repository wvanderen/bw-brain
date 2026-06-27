---
phase: 02-read-only-context-foundation-m1
plan: 03a
type: execute
wave: 2
depends_on: [02-01]
files_modified:
  - daemon/src/state/fingerprint.ts
  - daemon/src/state/fingerprint.test.ts
  - daemon/src/state/reconcile.ts
  - daemon/src/state/reconcile.test.ts
  - daemon/src/store/atomic-write.ts
  - daemon/src/store/atomic-write.test.ts
  - daemon/src/store/state-cache.ts
  - daemon/src/store/state-cache.test.ts
autonomous: true
requirements: [STATE-04, MEM-01]
must_haves:
  truths:
    - "Stable IDs are synthesized via fingerprint(name+type+neighbors+contentHash) and survive a 20-track reorder on reconnect (STATE-04, SC#3 — held-out property test)"
    - "state-cache.json is written atomically (temp+rename); N concurrent writes never produce a half-written file (SC#3 — property test, MEM-01)"
    - "reconcile() is a pure function over (observed, persisted, now): matched/reassigned/new/vanished buckets; never mutates caller state"
    - "fingerprint() is a pure deterministic function: same input -> same 16-hex-char id; differing neighbors OR contentHash OR name -> differing id"
  artifacts:
    - path: "daemon/src/state/fingerprint.ts"
      provides: "pure fingerprint(input) -> sha256[16] hex stableId (STATE-04)"
      contains: "createHash"
    - path: "daemon/src/state/reconcile.ts"
      provides: "pure reconcile(observed, persisted) reconciling stable IDs on bridge reconnect (SC#3)"
      contains: "ReconcileResult"
    - path: "daemon/src/store/atomic-write.ts"
      provides: "atomicWriteJson(path, data) via POSIX temp+rename (SC#3, MEM-01)"
      contains: "rename"
    - path: "daemon/src/store/state-cache.ts"
      provides: "loadOrInit(path) + save(path, state) wrapping atomicWriteJson"
      contains: "atomicWriteJson"
  key_links:
    - from: "daemon/src/state/reconcile.ts"
      to: "daemon/src/state/fingerprint.ts"
      via: "reconcile() computes fingerprints to match observed objects against persisted.byFingerprint / byNameAndType"
      pattern: "fingerprint\\("
    - from: "daemon/src/store/state-cache.ts"
      to: "daemon/src/store/atomic-write.ts"
      via: "state-cache.save() delegates to atomicWriteJson (never fs.writeFile directly)"
      pattern: "atomicWriteJson"
---

<objective>
Build the STATE-04 trust-spine primitives as PURE functions with their SC#3 held-out property tests: fingerprint(name+type+neighbors+contentHash) for stable-ID synthesis; reconcile(observed, persisted, now) matched/reassigned/new/vanished buckets surviving a 20-track reorder on reconnect; atomicWriteJson(path, data) POSIX temp+rename; state-cache loadOrInit/save wrapper. These four pure modules are the foundation every later stateful consumer (02-03b stale-watchdog + analyzer-registry + intent-store + normalizer + UDS query-server) builds on. Locking the trust spine first as a separate, parallelizable plan prevents the stateful layer from inheriting unproven primitives.

Purpose: The daemon is the long-running source of truth (D-07). It must survive a bridge reload without corrupting state — that requirement decomposes into fingerprint stability across reorder/rename, atomic state-cache writes, and a watchdog (in 02-03b) that marks state stale when the bridge is silent. SC#3 is un-fakeable: the 20-track-reorder reconcile test + the N-parallel atomic-write test are HELD-OUT property tests (hand-built fixtures asserting the trust-spine behavior); they cannot be made green by a hand-wave.
Output: 4 new pure-function daemon source files + their tests, including the 2 SC#3-critical held-out property tests (20-track reorder reconcile, N-parallel atomic write) plus the fingerprint determinism property test.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.claude/AGENTS.md
@.planning/phases/02-read-only-context-foundation-m1/02-CONTEXT.md
@.planning/phases/02-read-only-context-foundation-m1/02-RESEARCH.md
@.planning/phases/02-read-only-context-foundation-m1/02-PATTERNS.md
@.planning/phases/02-read-only-context-foundation-m1/02-VALIDATION.md
@.planning/phases/02-read-only-context-foundation-m1/02-01-SUMMARY.md
@daemon/src/protocol/handshake.ts
@daemon/src/protocol/line-buffer.test.ts
@schemas/project-state.schema.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: STATE-04 pure functions — fingerprint + reconcile + atomic-write + state-cache + their SC#3 held-out property tests</name>
  <files>daemon/src/state/fingerprint.ts, daemon/src/state/fingerprint.test.ts, daemon/src/state/reconcile.ts, daemon/src/state/reconcile.test.ts, daemon/src/store/atomic-write.ts, daemon/src/store/atomic-write.test.ts, daemon/src/store/state-cache.ts, daemon/src/store/state-cache.test.ts</files>
  <read_first>
    - daemon/src/protocol/handshake.ts (lines 16-46 — the PURE-FUNCTION pattern: documented interface, @example, no side effects, no I/O; fingerprint.ts + reconcile.ts mirror this shape exactly per PATTERNS.md Assignment 6 lines 261-297)
    - daemon/src/protocol/handshake.test.ts (lines 15-26 — the pure-function unit-test pattern with @example assertions; replicate for fingerprint.test.ts)
    - daemon/src/protocol/line-buffer.test.ts (lines 15-25, 34-57 — the seeded-RNG property-test pattern; replicate for the reconcile 20-track-reorder + atomic-write N-parallel tests per Shared Pattern H)
    - .planning/phases/02-read-only-context-foundation-m1/02-RESEARCH.md (Pattern 2 "STATE-04 Fingerprint + Reconcile" lines 432-549 — fingerprint composition name+type+neighbors+contentHash; reconcile-on-reconnect matched/reassigned/new/vanished; atomic state-cache write temp+rename; Pitfall 2/4/6 defenses)
    - .planning/phases/02-read-only-context-foundation-m1/02-RESEARCH.md (§Code Examples "Atomic write" lines 1172-1186 — the canonical implementation to transcribe verbatim per PATTERNS.md Assignment 10 lines 367-391)
    - .planning/phases/02-read-only-context-foundation-m1/02-PATTERNS.md (Assignment 6 lines 261-297 fingerprint/reconcile pure-function shape; Assignment 10 lines 367-391 atomic-write verbatim; Shared Pattern F lines 699-713 atomic-write non-negotiables)
    - .planning/phases/02-read-only-context-foundation-m1/02-CONTEXT.md (D-04 automation field reserved empty; STATE-04 fingerprint = name+type+neighbors+contentHash, no native IDs)
  </read_first>
  <behavior>
    - fingerprint: same {name,type,neighbors,contentHash} input always produces the same 16-char hex id (deterministic); two inputs differing only in neighbors produce different ids; two inputs differing only in contentHash produce different ids; the id matches ^(trk|clip|dev)_[0-9a-f]{16}$ when prefixed by type.
    - reconcile: a 20-track raw state observed twice (no changes) matches all 20 stable IDs (no spurious new/vanished); reordering the 20 tracks changes neighbor pairs but the fingerprint fuzzy-fallback (name+type match) reassigns correctly so IDs survive; renaming a track from "Kick" to "Kick Main" with unchanged note content reassigns via content-hash match; a genuinely-new track gets a minted sid; a vanished track stays in the persisted map for the grace period.
    - atomicWriteJson: writing the same path N=20 times in parallel always leaves a final file that (a) parses as valid JSON, (b) is byte-equal to exactly ONE of the N inputs (no half-written merge); the temp file is in the same directory as the destination (Pitfall 4 defense).
    - state-cache: loadOrInit creates .bw-brain/ if absent; save writes via atomicWriteJson; after a save, loadOrInit returns the saved state.
  </behavior>
  <action>
    Create daemon/src/state/fingerprint.ts as a pure function module (PATTERNS.md Assignment 6 — mirror handshake.ts lines 16-46 structure). Export: interface FingerprintInput { name: string; type: "track"|"clip"|"device"; neighbors: string[]; contentHash: string }; export function fingerprint(input: FingerprintInput): string. Body per RESEARCH.md lines 448-454: canonical JSON.stringify({n:name, t:type, nb:neighbors, ch:contentHash}) (keys insertion-sorted), createHash("sha256").update(canon).digest("hex").slice(0,16). Add a JSDoc @example. Import { createHash } from "node:crypto". Add a helper mintSid(type, input) returning `${type prefix}_${fingerprint(input)}` where type prefix is trk/clip/dev.

    Create daemon/src/state/fingerprint.test.ts (vitest): determinism test (same input twice -> same id); distinctness tests (differ in neighbors -> different id; differ in contentHash -> different id; differ in name -> different id); @example assertion; the id matches the project-state.schema.json selection.*Sid regex.

    Create daemon/src/state/reconcile.ts as a pure function module. Export: interface StableIdMap { byFingerprint: Map<string,string>; byNameAndType: Map<string,string>; lastSeen: Map<string,number> }; interface ReconcileResult { matched: Array<{sid,obj}>; reassigned: Array<{sid,obj,reason}>; new: Array<{sid,obj}>; vanished: Array<{sid}> }; export function reconcile(observed: RawState, persisted: StableIdMap, now: number): ReconcileResult. Body per RESEARCH.md lines 467-492: for each observed object, compute fingerprint; if persisted.byFingerprint has it -> matched; else if byNameAndType has `${type}:${name}` -> reassigned (rebind fingerprint to existing sid); else mint new sid + register. Vanished = in persisted but not observed (kept; caller expires after grace). Import fingerprint from "./fingerprint.js" (NodeNext .js ext). Import RawState type from "../../gen/project-state.js" (the Plan-01-generated type).

    Create daemon/src/state/reconcile.test.ts: the SC#3 held-out property test. Build a synthetic 20-track RawState (varying names Kick/Bass/Lead/.../Hats). Test 1: reconcile(state, emptyMap) -> 20 new sids. Test 2: reconcile(state, persistedFromTest1) -> 20 matched, 0 new. Test 3 (REORDER — the SC#3 critical case): reverse the track order in a new observed state, reconcile against persisted -> assert >=18 of 20 sids match (fuzzy fallback covers the neighbor-change; the held-out bar). Test 4 (RENAME + content-stable): rename "Kick" -> "Kick Main" with unchanged contentHash -> reassigned to the same sid. Test 5 (NEW track): add a 21st track -> 20 matched + 1 new. Test 6 (VANISHED): remove 2 tracks -> 2 vanished entries.

    Create daemon/src/store/atomic-write.ts transcribing RESEARCH.md lines 1172-1186 verbatim (PATTERNS.md Assignment 10 line 380). Export async function atomicWriteJson(path: string, data: unknown): Promise<void>. Imports: { writeFile, rename, mkdir, dirname, basename } from "node:fs/promises"; { randomBytes } from "node:crypto"; { join } from "node:path". Body: const dir = dirname(path); await mkdir(dir, {recursive:true}); const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`); await writeFile(tmp, JSON.stringify(data,null,2), "utf8"); await rename(tmp, path). The temp file MUST be join(dir, ...) — never /tmp (Pitfall 4 defense — cross-filesystem rename is non-atomic).

    Create daemon/src/store/atomic-write.test.ts: the SC#3 held-out property test. Use os.tmpdir() + a subdirectory per test (cleanup in afterEach). Test: fire N=20 parallel atomicWriteJson calls to the SAME path with distinct data objects; read the final file; assert (a) it parses as valid JSON, (b) it deep-equals exactly ONE of the 20 inputs (no half-written merge). Add a sequential-write test (write A, write B, read -> B). Add a test that .bw-brain/ is auto-created when absent.

    Create daemon/src/store/state-cache.ts: loadOrInit(path) -> reads + JSON.parse (returns empty default if file absent); save(path, state) -> calls atomicWriteJson. Wraps the StableIdMap + last-known RawState snapshot. Imports atomicWriteJson from "./atomic-write.js".

    Create daemon/src/store/state-cache.test.ts: save then load round-trip; loadOrInit on a missing path returns the empty default without throwing; .bw-brain/ dir creation.
  </action>
  <verify>
    <automated>cd /Users/eggfam/dev/bw-brain/daemon && npx vitest run src/state/fingerprint.test.ts src/state/reconcile.test.ts src/store/atomic-write.test.ts src/store/state-cache.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - fingerprint.ts is pure (no I/O, no side effects); fingerprint({name:"Kick",type:"track",neighbors:["Bass","Lead"],contentHash:"abc"}) is deterministic across calls.
    - reconcile.test.ts has a passing 20-track-reorder case asserting >=18 of 20 sids survive the reorder (the SC#3 held-out bar).
    - reconcile.test.ts has passing rename-with-stable-content + new-track + vanished-track cases.
    - atomic-write.ts temp file path is join(dirname(dest), ...) (grep the source: the tmp variable is constructed via join(dir, ...), never a /tmp literal — Pitfall 4 defense).
    - atomic-write.test.ts has a passing N=20-parallel-writes property test asserting the final file parses + deep-equals one input.
    - state-cache.ts save() calls atomicWriteJson (not fs.writeFile directly).
    - `npx vitest run` for these 4 test files is green.
    - `npx tsc --noEmit` passes (NodeNext strict, .js imports).
  </acceptance_criteria>
  <done>The 4 STATE-04 pure-function modules + their tests are green, including the 3 SC#3-critical held-out property tests (20-track reorder reconcile, N-parallel atomic write, deterministic fingerprint). The trust-spine primitives are proven before 02-03b's stateful consumers build on them.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| daemon → durable disk (<project>/.bw-brain/state-cache.json) | Every write is atomic (temp+rename). The daemon is the sole writer. MEM-01 durable-store contract enforced here at the primitive layer (every later save() goes through atomicWriteJson). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-03a-T | Tampering | state-cache.json (crash mid-write) | mitigate | atomicWriteJson (temp+rename, POSIX-atomic) — Pitfall 4 defense; held-out N=20-parallel property test proves no half-written file. |
| T-2-03a-E | Elevation (sid corruption) | reconcile on reorder | mitigate | Fingerprint (name+type+neighbors+contentHash) — never trusts a slot index; held-out 20-track-reorder property test proves >=18/20 sids survive. |
</threat_model>

<verification>
- `cd daemon && npx vitest run src/state/fingerprint.test.ts src/state/reconcile.test.ts src/store/atomic-write.test.ts src/store/state-cache.test.ts` green (Task 1 pure-function tests).
- The 3 SC#3 held-out property tests pass: 20-track reorder reconcile (>=18/20 sids survive), N=20-parallel atomic write (final file parses + deep-equals one input), deterministic fingerprint (same input -> same id; differing components -> differing ids).
- `cd daemon && npx tsc --noEmit` green (NodeNext strict).
</verification>

<success_criteria>
- Stable IDs survive a 20-track reorder on reconnect (STATE-04/SC#3 — held-out property test).
- state-cache.json is atomic under concurrent writes (SC#3 / MEM-01 — held-out property test).
- fingerprint + reconcile + atomicWriteJson + state-cache are pure functions with zero I/O side effects (except atomicWriteJson + state-cache.save which only touch the local durable path).
</success_criteria>

<output>
Create `.planning/phases/02-read-only-context-foundation-m1/02-03a-SUMMARY.md` when done.
</output>

## Artifacts this phase produces (Plan 03a)

**New pure-function modules (daemon-side trust-spine primitives):**
- `daemon/src/state/fingerprint.ts` — `fingerprint(input: FingerprintInput): string`, `mintSid(type, input)`, `FingerprintInput` interface
- `daemon/src/state/reconcile.ts` — `reconcile(observed, persisted, now): ReconcileResult`, `StableIdMap`, `ReconcileResult` interfaces
- `daemon/src/store/atomic-write.ts` — `atomicWriteJson(path, data): Promise<void>`
- `daemon/src/store/state-cache.ts` — `loadOrInit(path)`, `save(path, state)`

**New tests (4 files, including SC#3 held-out property tests):**
- fingerprint.test.ts (determinism + distinctness property tests)
- reconcile.test.ts (SC#3 20-track-reorder held-out + rename/new/vanished cases)
- atomic-write.test.ts (SC#3 N=20-parallel held-out)
- state-cache.test.ts (round-trip + loadOrInit-on-missing)
