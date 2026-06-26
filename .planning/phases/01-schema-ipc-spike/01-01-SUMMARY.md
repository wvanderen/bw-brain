---
phase: 01-schema-ipc-spike
plan: 01
subsystem: protocol
tags: [json-schema, json-lines, typescript, esm, ajv, vitest, codegen, ipc]

# Dependency graph
requires: []
provides:
  - "6 frozen JSON Schema 2020-12 protocol contract files under schemas/protocol/ (the cross-language source of truth for the JSON-Lines wire protocol — Java bridge + TS daemon + CLI all bind FROM these)"
  - "Versioned wire envelope (version/type/id/timestamp/ok/payload) with oneOf discriminator into 5 message types"
  - "Trust-spine schema enforcement: apply.patch REQUIRES payload.undoLabel + non-empty operations"
  - "Kept daemon/ ESM TypeScript scaffold (D-05/D-06) — package.json + NodeNext tsconfig + vitest config, pinned-dep install verified postinstall-free"
  - "Generated cross-language TS types under daemon/src/gen/ (json-schema-to-typescript codegen, idempotent)"
  - "Green Ajv schema-validation test suite (22 assertions) proving every frozen schema validates/rejects"
  - "Structural validator gating the PROBE-01 capabilities doc (6 sections + non-empty Mitigation per section)"
affects: [01-02-PLAN, 01-03-PLAN, 02-read-only-context-foundation, 03-reversible-midi-patching]

# Tech tracking
tech-stack:
  added:
    - "ajv 8.20.0 (+ ajv/dist/2020 for Draft 2020-12 mode)"
    - "ajv-formats 3.0.1"
    - "json-schema-to-typescript 15.0.4 (programmatic compile() API)"
    - "commander 15.0.0"
    - "typescript ^5.7 (resolved 5.9.3)"
    - "tsx 4.22.4"
    - "vitest 4.1.9"
    - "@types/node"
  patterns:
    - "JSON Schema Draft 2020-12 as the single cross-language contract source (not draft-07; $defs not definitions)"
    - "$id under a stable https://bw-brain.local/schemas/protocol/ scheme for cross-file $ref resolution"
    - "Envelope oneOf discriminator → TS discriminated union (the wire-level type discriminator)"
    - "Trust-spine enforcement at the schema level (undoLabel + operations mandatory on apply.patch)"
    - "ESM + NodeNext + .js import extensions for all relative .ts imports"
    - "JSON modules via `with { type: 'json' }` import attributes (Node 22 native)"
    - "Ajv instance with all schemas registered → cross-file $ref resolves by $id at runtime"
    - "Codegen from $id-resolved bundle; runtime from pristine multi-file schemas"

key-files:
  created:
    - "schemas/protocol/envelope.schema.json"
    - "schemas/protocol/event.schema.json"
    - "schemas/protocol/request.schema.json"
    - "schemas/protocol/response.schema.json"
    - "schemas/protocol/edit.schema.json"
    - "schemas/protocol/handshake.schema.json"
    - "daemon/package.json"
    - "daemon/tsconfig.json"
    - "daemon/vitest.config.ts"
    - "daemon/.gitignore"
    - "daemon/src/gen/{envelope,event,request,response,edit,handshake}.ts"
    - "daemon/src/protocol/schemas.test.ts"
    - "scripts/check-capabilities-doc.mjs"
    - "scripts/gen-types.mjs"
    - "daemon/package-lock.json"
  modified: []

key-decisions:
  - "Frozen protocol breadth = envelope spine + handshake + the 4 seed-example message shapes (selection.changed, get.selected_clip, {id,ok,payload} response, apply.patch). Speculative message catalog explicitly marked Phase 2-extensible via $comment (Pitfall 4 — do not over-freeze from a 1-event spike)."
  - "Trust-spine is schema-level: apply.patch REQUIRES payload.undoLabel (minLength 1) + payload.operations (minItems 1). The bridge can refuse unlabeled edits by schema validation alone, before any application logic runs."
  - "Every envelope carries `version` matching ^\\d+\\.\\d+$ (semantic major.minor). The major component drives the version-handshake gate (Pattern 3) and enables protocol-drift detection (SC#3)."
  - "Runtime Ajv resolves the envelope's cross-file $refs by $id (one instance, all 6 schemas registered). Codegen uses a tiny $id→schema bundler because json-schema-ref-parser (used by json2ts) cannot resolve refs against the absolute https $id scheme and compiles each file independently."

patterns-established:
  - "Pattern: JSON Schema 2020-12 contract files are the single source of truth — TS types are GENERATED (never hand-written), runtime validation is Ajv against the raw .json files."
  - "Pattern: $id under https://bw-brain.local/schemas/protocol/ is the canonical identity for every schema (cross-file $ref target)."
  - "Pattern: ESM + NodeNext + .js import extensions for ALL relative .ts imports (daemon/src/**)."
  - "Pattern: capabilities-doc structural validation = grep-driven (label forms: inline `Mitigation: ...`, bold `**Mitigation:** ...`, sub-heading `### Mitigation`). Bare-word 'mitigation' in prose is rejected."
  - "Pattern: generated files (daemon/src/gen/*) are committed, carry a DO-NOT-EDIT header, and are never hand-edited."
  - "Pattern: npm install is gated by a postinstall-absence audit for [SUS]-flagged packages (T-1-SC supply-chain mitigation)."

requirements-completed: []  # Neither PROBE-01 nor PROBE-02 is fully complete after Plan 01 alone: PROBE-01 needs the in-app capability doc content (Plan 03), PROBE-02 needs the TCP confirmation (Plan 03) in addition to the contract frozen here. Both are phase-level requirements spanning all 3 plans; the phase-level /gsd-verify-work gate owns their final completion. This plan CONTRIBUTES to both: the capabilities-doc validator (PROBE-01/SC#2 shape enforcement) and the frozen JSON-Lines contract (PROBE-02/SC#3 contract half).
requirements-progressed: [PROBE-01, PROBE-02]

# Metrics
duration: 19min
completed: 2026-06-26
status: complete
---

# Phase 1 Plan 01: Schema & IPC Spike (Contract Freeze) Summary

**6 frozen JSON Schema 2020-12 protocol-contract files + kept daemon/ ESM TypeScript scaffold + generated cross-language TS types + a green 22-assertion Ajv validation suite + a structural capabilities-doc validator — the JSON-Lines contract is ready for Plan 02 (reader) and Plan 03 (Bitwig extension emits against it).**

## Performance

- **Duration:** 19 min
- **Started:** 2026-06-26T18:38:15Z
- **Completed:** 2026-06-26T18:58:08Z
- **Tasks:** 2
- **Files modified:** 16 created (6 schemas + 6 gen types + 4 daemon config + 2 scripts + package-lock + .gitignore)

## Accomplishments
- Froze the JSON-Lines wire contract as 6 JSON Schema Draft 2020-12 files under `schemas/protocol/`. Every file carries `$schema` referencing 2020-12 and an `$id` under `https://bw-brain.local/schemas/protocol/`. The envelope is `additionalProperties: false` with a `oneOf` discriminator branching into event/request/response/edit/handshake — the wire-level type discriminator the TS discriminated-union model binds from.
- Enforced the trust-spine at the schema level: `edit.schema.json` requires `payload.undoLabel` (minLength 1) and `payload.operations` (minItems 1). An `apply.patch` without an undo label is rejected by schema validation alone.
- Established the kept `daemon/` ESM scaffold (D-05/D-06): `type: module`, NodeNext tsconfig with `resolveJsonModule`, pinned dependencies (ajv 8.20.0, ajv-formats 3.0.1, commander 15.0.0; dev: typescript ^5.7, tsx 4.22.4, vitest 4.1.9, json-schema-to-typescript 15.0.4, @types/node). The postinstall-absence audit for the three [SUS]-flagged packages (commander/tsx/vitest) returned empty before install — T-1-SC mitigated.
- Generated cross-language TS types under `daemon/src/gen/` via a tiny `$id`-aware bundler (`scripts/gen-types.mjs`). The generated `envelope.ts` is a clean discriminated union. Codegen is idempotent (verified: re-run produces zero diff).
- 22 Ajv assertions in `daemon/src/protocol/schemas.test.ts` prove every frozen schema validates its valid example and rejects malformed counter-examples (envelope additionalProperties, edit undoLabel missing, request id / response ok / handshake conditional requirements). `npx vitest run schemas` → 22/22 pass.
- Built `scripts/check-capabilities-doc.mjs`: structural validator for the PROBE-01 capabilities doc. Enforces the 6 required section headings + a non-empty Mitigation label per section (D-04). Three label forms accepted (inline / bold / sub-heading); bare-word "mitigation" in prose is correctly rejected. `--self-test` mode validates an inline fixture.

## Task Commits

Each task was committed atomically:

1. **Task 1: Daemon ESM scaffold + pinned dependency install + capabilities-doc validator** — `ea763fb` (feat)
2. **Task 2: Freeze the JSON-Lines protocol contract (6 schemas) + generate TS types + schema validation tests** — `08384b6` (feat)

_Plan metadata commit: see below._

## Files Created/Modified
- `schemas/protocol/envelope.schema.json` — versioned wire envelope; `oneOf` discriminator into 5 message types; `additionalProperties: false`.
- `schemas/protocol/event.schema.json` — `selection.changed` (Phase 1 frozen event); payload {trackId?, clipId?, deviceId?}.
- `schemas/protocol/request.schema.json` — `get.selected_clip`; `id` required (correlation key).
- `schemas/protocol/response.schema.json` — `{id, ok, payload}`; `id` + `ok` required.
- `schemas/protocol/edit.schema.json` — `apply.patch`; trust-spine (payload.undoLabel + payload.operations required).
- `schemas/protocol/handshake.schema.json` — `hello` / `hello.response`; version-negotiation contract (Pattern 3).
- `daemon/package.json` — ESM (`type: module`), pinned deps, scripts: gen:types / test / dump / check:capabilities.
- `daemon/tsconfig.json` — NodeNext, resolveJsonModule, strict, .js-import-extensions convention noted.
- `daemon/vitest.config.ts` — minimal ESM config (environment: node, src/**/*.test.ts).
- `daemon/.gitignore` — excludes node_modules/dist.
- `daemon/src/gen/{envelope,event,request,response,edit,handshake}.ts` — generated TS types (DO NOT EDIT).
- `daemon/src/protocol/schemas.test.ts` — 22 Ajv (2020-12 mode) valid/invalid assertions.
- `scripts/check-capabilities-doc.mjs` — PROBE-01 capabilities-doc structural validator.
- `scripts/gen-types.mjs` — `$id`-aware codegen bundler (json2ts programmatic API).
- `daemon/package-lock.json` — pinned-dep lockfile.

## Decisions Made
- **Freeze breadth (calibrated against SC#3 + Pitfall 4):** envelope spine + version handshake + the 4 seed-example message shapes. Additional event/request types are explicitly Phase 2-extensible via `$comment` — freezing them now would lock guesses the 1-event spike cannot honestly validate.
- **Trust-spine enforcement layer:** schema-level (undoLabel + operations mandatory on `apply.patch`), not application-level. The bridge can refuse unlabeled edits by validation alone, before any state mutation path runs.
- **Codegen approach:** `$id`-aware bundler instead of the plan's literal `json2ts -i ... -o ...` CLI. The literal CLI cannot resolve cross-file `$ref`s against the absolute `https://bw-brain.local` `$id` scheme (ref-parser tries to fetch the fake host; json2ts compiles each file independently with no shared `$id` registry). The bundler preserves the pristine contract schemas and only the *generated* TS is produced from dereffed copies. Runtime Ajv is unaffected (resolves `$ref` by `$id` natively).
- **Ajv 2020-12 mode:** tests use `ajv/dist/2020` (not the default draft-07 `new Ajv()`) — required so Ajv validates each schema against the 2020-12 meta-schema.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Capabilities-doc validator false-matched the bare word "mitigation" in prose**
- **Found during:** Task 1 (capabilities-doc validator verification)
- **Issue:** The initial `Mitigation` regex was too permissive — `Mitigation[:\s*]+(\S...)` matched the bare word "mitigation" in prose (e.g. "NO mitigation here.") because the char class accepted a following space. This let a section with no real Mitigation field pass.
- **Fix:** Tightened to two explicit label shapes — inline `Mitigation\b\*{0,2}\s*:\s*\*{0,2}\s*(\S...)` (colon required) and sub-heading `^#{1,6}\s+Mitigation\b\s*$` (heading form + content below). Bare-word matches in prose now correctly fail.
- **Files modified:** scripts/check-capabilities-doc.mjs
- **Verification:** Re-ran the self-test (passes) and a doc with one section missing its Mitigation (now correctly fails with exit 1 and a precise error).
- **Committed in:** ea763fb (Task 1 commit)

**2. [Rule 3 - Blocking] Plan's literal `json2ts -i '../schemas/protocol/**/*.json'` cannot resolve cross-file $refs against absolute $id scheme**
- **Found during:** Task 2 (`npm run gen:types` first run)
- **Issue:** json-schema-to-typescript uses `@apidevtools/json-schema-ref-parser`, which resolves `$ref` against the referencing schema's base URI. Our schemas carry absolute `$id`s under `https://bw-brain.local/schemas/protocol/` (required by SC#3 / acceptance criteria). ref-parser then tries to fetch the resolved https URL — which fails (`bw-brain.local` is an internal contract URI, not a real host). json2ts also compiles each input file independently, so it has no shared `$id → schema` registry to fall back on.
- **Fix:** Wrote `scripts/gen-types.mjs` — a ~120-line bundler that builds the `$id → schema` map, dereferences every `$ref` by `$id` lookup (with cycle detection), then calls json2ts's programmatic `compile()` per file. The contract schemas stay pristine; runtime Ajv (which resolves `$ref` by `$id` correctly when all schemas are in one instance) is completely unaffected. Updated `daemon/package.json` `gen:types` to `node ../scripts/gen-types.mjs`. Codegen verified idempotent (re-run = zero diff).
- **Files modified:** scripts/gen-types.mjs (new), daemon/package.json (gen:types script)
- **Verification:** `npm run gen:types` produces 6 deterministic .ts files; `diff -r` of two consecutive runs shows zero changes; generated envelope.ts is a clean discriminated union.
- **Committed in:** 08384b6 (Task 2 commit)

**3. [Rule 1 - Bug] Ajv default constructor is draft-07; tests must use `ajv/dist/2020` for 2020-12 meta-schema validation**
- **Found during:** Task 2 (first `npx vitest run schemas`)
- **Issue:** `new Ajv()` defaults to draft-07 mode. When Ajv added our 2020-12 schemas it tried to validate them against the draft-07 meta-schema and failed with `no schema with key or ref "https://json-schema.org/draft/2020-12/schema"`.
- **Fix:** Import `Ajv2020` from `ajv/dist/2020` and use `new Ajv2020({...})`. This is the documented Ajv 8 pattern for 2020-12.
- **Files modified:** daemon/src/protocol/schemas.test.ts
- **Verification:** `npx vitest run schemas` → 22/22 pass.
- **Committed in:** 08384b6 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking toolchain issue, 1 bug)
**Impact on plan:** All three fixes are necessary for correctness and were within the deviation-rule auto-fix scope (no scope creep, no architectural change). The contract schemas themselves match the plan exactly; only the *tooling* around them (validator regex, codegen script, Ajv constructor) was adjusted.

## Issues Encountered
None beyond the deviations above. All pinned package versions installed exactly as specified (ajv 8.20.0, ajv-formats 3.0.1, json-schema-to-typescript 15.0.4, vitest 4.1.9, tsx 4.22.4, typescript 5.9.3 ≥ 5.7). 0 vulnerabilities. All three [SUS]-flagged packages had empty `scripts.postinstall` before install.

## User Setup Required
None — no external service configuration required. This plan is fully autonomous (no Bitwig, no JDK, no network).

## Next Phase Readiness
- **Ready for Plan 02 (Wave 2):** the frozen envelope + 5 message-type schemas are ready to be loaded by the daemon reader (`daemon/src/protocol/reader.ts`). The Ajv setup pattern (one instance, all schemas registered, `$ref` resolves by `$id`) is proven by `schemas.test.ts`. The trust-spine (undoLabel mandatory) will gate `apply.patch` messages at the boundary.
- **Ready for Plan 03 (Wave 3):** the Bitwig spike extension can emit JSON-Lines messages conforming to the frozen contract. The seed.md `selection.changed` example is the SC#1 proof message.
- **No blockers** for the contract half of Phase 1. The transport-de-risking half (Plan 02 reader + Plan 03 extension) is the remaining work.

## Self-Check: PASSED

- Verified created files exist on disk:
  - `schemas/protocol/{envelope,event,request,response,edit,handshake}.schema.json` — FOUND (all 6)
  - `daemon/{package.json,tsconfig.json,vitest.config.ts}` — FOUND
  - `daemon/src/gen/{envelope,event,request,response,edit,handshake}.ts` — FOUND (all 6)
  - `daemon/src/protocol/schemas.test.ts` — FOUND
  - `scripts/{check-capabilities-doc.mjs,gen-types.mjs}` — FOUND
- Verified commits exist in git log: `ea763fb` FOUND, `08384b6` FOUND.
- Re-ran plan-level `<verification>` commands:
  - `cd daemon && npm run gen:types` — idempotent (zero diff on re-run)
  - `cd daemon && npx vitest run schemas` — exit 0, 22/22 tests pass
  - `node scripts/check-capabilities-doc.mjs --self-test` — exit 0
  - `grep -rl '2020-12' schemas/protocol/ | wc -l` — 6 (all schemas declare 2020-12)
- Re-ran Task 2 acceptance-criteria structural assertions: envelope oneOf=5 + additionalProperties:false; edit payload.required=[undoLabel,operations] + undoLabel.minLength=1; request requires id; response requires ok; handshake enum=[hello,hello.response] — all PASS.

---
*Phase: 01-schema-ipc-spike*
*Completed: 2026-06-26*
