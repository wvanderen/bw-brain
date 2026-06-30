# Phase 03 Deferred Items

Out-of-scope issues discovered during plan execution but NOT fixed (per the
SCOPE BOUNDARY rule — pre-existing issues in files the plan did not touch are
logged, not fixed).

## Pre-existing TypeScript errors (Plans 01/02 — surfaced by `tsc --noEmit`)

These two type errors exist on the main branch BEFORE Plan 03-03 and were NOT
introduced by this plan. vitest/esbuild strips types without full type-checking,
so the test suite passes despite them; `tsc --noEmit` surfaces them. They are
in files owned by Plans 01/02 and are out of scope for 03-03.

### 1. `daemon/src/cli/commands/edit.test.ts:26` — TS2307 Cannot find module '../gen/result.js'
- **Origin:** Plan 03-02 (bw-edit CLI contract test).
- **Issue:** the test imports `type { ... } from "../gen/result.js"` but no
  `gen/result.ts` exists (the result schema gen type is elsewhere or the import
  path is stale). The runtime test passes (types stripped) but `tsc` errors.
- **Disposition:** out of scope for 03-03. Log for a future Plan 02 cleanup pass.

### 2. `daemon/src/patch/arb.ts:55` — TS2322 `Arbitrary<Note[] | readonly []>` not assignable to `Arbitrary<Note[]>`
- **Origin:** Plan 03-01 (fast-check arbitraries).
- **Issue:** `fc.uniqueArray(...)` returns a `readonly []`-compatible type that
  the `arbNoteSet: Arbitrary<Note[]>` annotation rejects. Runtime tests pass
  (fast-check generates normal arrays); `tsc` is strict about the readonly flag.
- **Disposition:** out of scope for 03-03. Log for a future Plan 01 cleanup pass
    (likely `arbNoteSet: Arbitrary<readonly Note[]>` or a `.map(n => [...n])`).

## Smoke-test note

`src/runtime/smoke.test.ts` (the daemon-boot + fake-bridge smoke, 7 tests incl.
the Plan 03-02 apply/revert round-trip) runs in ~17s and passes. It is
environmentally slow but green — not a regression.
