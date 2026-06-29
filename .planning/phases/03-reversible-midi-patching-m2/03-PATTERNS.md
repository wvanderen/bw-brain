# Phase 3: Reversible MIDI Patching (M2) - Pattern Map

**Mapped:** 2026-06-29
**Files analyzed:** 35 (22 new, 9 modified/extended, 4 package/config deltas + ~14 Wave-0 test files)
**Analogs found:** 33 / 35 (2 with no analog — both new algorithm territory)

This map anchors every Phase-3 file to the closest existing module in `bw-brain` and pins concrete line ranges the planner can lift verbatim. Two universal disciplines recur throughout — both already canonical in the repo and **must be followed literally**:

- **Pure-function + I/O split** — every computation lives in its own file with NO I/O, NO side effects, documented interface + `@example`; the I/O-bound commander/UDS/bridge wrapper is a separate shell. Canonical analog: `daemon/src/cli/diff-logic.ts` (pure) + `daemon/src/cli/commands/diff.ts` (I/O). SC#1's round-trip property was provable *because* the logic was pure — the same discipline makes Phase 3's INV-1..INV-14 property tests mechanical.
- **Validate at every boundary** — Ajv-compiled-once at boot; never let invalid structures reach handler logic. Canonical analog: `daemon/src/state/intent-store.ts:25-27` (`new Ajv2020(...) → addSchema → getSchema($id)`), repeated in `query-server.ts:40-43` + `schemas.test.ts:44-57`. Phase 3 validates the patch object at THREE boundaries (CLI emit, daemon entry, bridge apply).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `schemas/patch.schema.json` | schema | declarative contract | `schemas/intent.schema.json` | exact (JSON Schema 2020-12 sibling with `$defs`) |
| **NEW** `schemas/profile.schema.json` | schema | declarative contract | `schemas/intent.schema.json` | exact |
| **MODIFY** `schemas/protocol/edit.schema.json` | schema | declarative contract | itself (one-line tightening) | exact |
| **MODIFY** `schemas/intent.schema.json` | schema | declarative contract | itself (additive extension) | exact |
| **MODIFY** `schemas/cli-query/query.schema.json` | schema | declarative contract | itself (op-enum extension) | exact |
| **NEW** `daemon/src/patch/patch-schema.ts` | validator loader | boot-time compile | `daemon/src/state/intent-store.ts:17-27` | exact |
| **NEW** `daemon/src/patch/patch-resolve.ts` | pure logic | transform (ops → Note[]) | `daemon/src/cli/diff-logic.ts:117-162` | exact |
| **NEW** `daemon/src/patch/inverse-ops.ts` | pure logic | transform (op → inverse op) | `daemon/src/cli/diff-logic.ts:86-100` | role-match (pure + Note set-semantics) |
| **NEW** `daemon/src/patch/risk-classifier.ts` | pure logic | classify (patch → risk class) | `daemon/src/cli/diff-logic.ts` (pure discipline) | role-match |
| **NEW** `daemon/src/patch/candidate-store.ts` | in-memory store | ephemeral Map lifecycle | `daemon/src/state/analyzer-registry.ts:98-122` | role-match (insertion-ordered Map) |
| **NEW** `daemon/src/patch/patch-history.ts` | durable journal | append-only file I/O | `daemon/src/store/atomic-write.ts:45-53` | exact (atomic-write discipline) |
| **NEW** `daemon/src/patch/arb.ts` | test arbiter | generative inputs | `daemon/src/cli/diff-logic.test.ts:29-49` | role-match (note-builder helpers; first fast-check file) |
| **NEW** `daemon/src/transforms/motif-signature.ts` | analyzer + pure fn | transform (Note[] → signature) | `daemon/src/cli/diff-logic.ts` + `daemon/src/state/analyzer-registry.ts:72-81` | role-match (pure + Analyzer interface) |
| **NEW** `daemon/src/transforms/harmonic-detect.ts` | pure algorithm | transform (Note[] → key/mode) | `daemon/src/cli/diff-logic.ts` (pure discipline) | role-match (no algorithm analog) |
| **NEW** `daemon/src/transforms/vary.ts` | pure transform | generative (Note[] → candidates) | `daemon/src/cli/diff-logic.ts` (pure) | role-match (no transform analog) |
| **NEW** `daemon/src/transforms/counterline.ts` | pure transform | generative | `daemon/src/cli/diff-logic.ts` (pure) | role-match (no transform analog) |
| **NEW** `daemon/src/transforms/voice-leading-fix.ts` | pure transform | cleanup (Note[] → Note[]) | `daemon/src/cli/diff-logic.ts` (pure) | role-match |
| **NEW** `daemon/src/transforms/humanize.ts` | pure transform | cleanup (Note[] → Note[]) | `daemon/src/cli/diff-logic.ts` (pure) | role-match |
| **NEW** `daemon/src/profiles/generic.json` | config | declarative data | `schemas/intent.schema.json` (JSON doc) | role-match |
| **NEW** `daemon/src/profiles/techno.json` | config | declarative data | `schemas/intent.schema.json` (JSON doc) | role-match |
| **NEW** `daemon/src/profiles/profile-loader.ts` | config loader | boot-time read + merge | `daemon/src/state/intent-store.ts:48-72` | role-match (one-fs-read-at-boot, no inference) |
| **MODIFY** `daemon/src/state/analyzer-registry.ts` | registry | plugin lifecycle | itself (M1→M2 add analyzer) | exact |
| **MODIFY** `daemon/src/state/intent-store.ts` | validator | boot-time read | itself (no logic change; schema auto-extends) | exact |
| **MODIFY** `daemon/src/cli/commands/edit.ts` | CLI command | request-response (UDS) | `daemon/src/cli/commands/midi.ts:27-41` | exact (replace stub with live multicall) |
| **MODIFY** `daemon/src/cli/commands/midi.ts` | CLI command | request-response (UDS) | itself (extend with 4 subcommands) | exact |
| **MODIFY** `daemon/src/query/query-server.ts` | dispatcher | request-response (UDS) | itself (`LIVE_OPS` + `handleMidiInspect:370-420`) | exact |
| **MODIFY** `bridge/.../PullHandlers.java` | handler | request-response (TCP) | itself (`handleSelectedClip:157-179` grid-walk mirror) | exact |
| **MODIFY** `daemon/package.json` | manifest | declarative | itself (add tonal dep + fast-check devDep + `test:property` script) | exact |
| **NEW** `pi-pack/skills/vary/SKILL.md` | skill doc | declarative | `pi-pack/skills/analyze/SKILL.md` | exact |
| **NEW** `pi-pack/skills/apply/SKILL.md` | skill doc | declarative | `pi-pack/skills/analyze/SKILL.md` | exact |
| **NEW** `pi-pack/skills/diff/SKILL.md` | skill doc | declarative | `pi-pack/skills/analyze/SKILL.md` | exact |
| **NEW** `daemon/src/patch/*.test.ts` (7 files) | test | property + unit | `daemon/src/cli/diff-logic.test.ts` + `daemon/src/store/atomic-write.test.ts` | exact |
| **NEW** `daemon/src/transforms/*.test.ts` (5 files) | test | property + unit | `daemon/src/cli/diff-logic.test.ts` + `daemon/src/state/analyzer-registry.test.ts` | exact |
| **NEW** `daemon/src/profiles/profile-loader.test.ts` | test | unit | `daemon/src/state/intent-store.test.ts` | role-match |
| **NEW** `daemon/src/cli/commands/edit.test.ts` | test | CLI contract | `daemon/src/cli/cli.test.ts` | role-match |
| **NEW** `fixtures/representative-clips/*.json` + `fixtures/harmonic-centers/*.json` | fixtures | declarative | (no held-out-fixture precedent — first of its kind) | none |

---

## Pattern Assignments

### `schemas/patch.schema.json` (schema, declarative contract)

**Analog:** `schemas/intent.schema.json` (entire 40-line file)

**Why:** sibling JSON Schema 2020-12 doc with `$id` under `https://bw-brain.local/schemas/`, `additionalProperties:false` at every object level, a `$comment` block citing the source-of-truth decisions, and `$defs` for nested shapes. The sketch in `03-RESEARCH.md:375-497` is canonical.

**Concrete excerpts to mirror:**

`$id` + `$comment` + trust-spine enforcement pattern (`schemas/intent.schema.json:1-9`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bw-brain.local/schemas/intent.schema.json",
  "title": "ProjectIntent",
  "description": "...",
  "$comment": "... D-09: ... Enforced at schema level.",
  "type": "object",
  "required": ["version", "projectIntent"],
  "additionalProperties": false,
```

Apply verbatim with: `$id: "https://bw-brain.local/schemas/patch.schema.json"`, `title: "Patch"`, `required: ["patchId","scope","operations","rationale","reversibility","risk"]`, `additionalProperties:false`. The primitive union lives under `$defs.PrimitiveOp` (oneOf AddNoteOp/RemoveNoteOp/UpdateNoteFieldOp) — see `03-RESEARCH.md:426-460`.

**Cross-schema `$ref` pattern** (the bridge contract relies on this): `edit.schema.json:38-40` currently has `items: { type: "object" }`. Phase 3 changes it to `{ "$ref": "https://bw-brain.local/schemas/patch.schema.json#/$defs/PrimitiveOp" }`. Runtime Ajv resolves this by `$id` when both schemas are registered in one instance — verified by `daemon/src/protocol/schemas.test.ts:44-57` (envelope resolves cross-file `$ref`s the same way). `scripts/gen-types.mjs:62-118` dereferences `$ref` by `$id` suffix-match for codegen.

---

### `schemas/protocol/edit.schema.json` (MODIFY — one-line tightening)

**Analog:** itself.

**Exact change** at `edit.schema.json:38-40`:
```json
"items": {
  "$ref": "https://bw-brain.local/schemas/patch.schema.json#/$defs/PrimitiveOp"
}
```

`undoLabel` (`edit.schema.json:29-33`) + `minItems: 1` (line 36) STAY MANDATORY. The schema `$comment` (line 6) already flags "tightened in Phase 3 (EDIT-01)" — replace that sentence with a pointer to `patch.schema.json`.

---

### `schemas/intent.schema.json` (MODIFY — additive extension)

**Analog:** itself.

**Exact change** at `intent.schema.json:20-37` (inside `projectIntent.properties`): add the two optional fields sketched in `03-RESEARCH.md:1080-1102`. Both OPTIONAL — backward-compat preserved (existing `intent.json` without them still validates).

---

### `schemas/cli-query/query.schema.json` (MODIFY — op-enum extension)

**Analog:** itself.

**Exact change** at `query.schema.json:23`: extend the `op` enum with the new Phase-3 ops (`edit.preview`, `edit.apply`, `edit.revert`, `midi.vary`, `midi.counterline`, `midi.voice_leading_fix`, `midi.humanize`). Update the `description` to reflect Phase-3 promotion (the field already says "tightened per-op in Phase 3 if patterns stabilize" — line 29).

---

### `daemon/src/patch/patch-schema.ts` (validator loader, boot-time compile)

**Analog:** `daemon/src/state/intent-store.ts:17-27`

**Imports pattern** (lines 17-20):
```typescript
import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import intentSchema from "../../../schemas/intent.schema.json" with { type: "json" };
import type { ProjectIntent } from "../gen/intent.js";
```

**Boot-time-compile pattern** (lines 22-27):
```typescript
// Ajv2020 = JSON Schema Draft 2020-12 mode. Named import + .js ext required
// under module:NodeNext (ajv 8.20 ships no exports map). addFormats NOT applied
// (no frozen schema uses `format` — verified; see schemas.test.ts rationale).
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(intentSchema);
const validateIntent = ajv.getSchema(intentSchema.$id)!;
```

**Apply to `patch-schema.ts`:** same three lines, but the schema is `patch.schema.json` and `edit.schema.json` MUST also be `addSchema`'d so the cross-file `$ref` resolves at runtime (mirrors `schemas.test.ts:44-57` registering all five protocol schemas before compiling the envelope). Export `validatePatch` for the daemon entry + CLI emit boundaries.

---

### `daemon/src/patch/patch-resolve.ts` (pure logic, transform)

**Analog:** `daemon/src/cli/diff-logic.ts:117-162` (`computeStateDiff`) — same shape, same discipline.

**Imports pattern** (`diff-logic.ts` has no imports — pure-ESM with `.js` ext; `patch-resolve.ts` adds one):
```typescript
import { computeStateDiff, type Note, type RawState, type StateDiff } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "./inverse-ops.js";
```

**Pure-fn signature + `@example` doc pattern** (`diff-logic.ts:102-116`):
```typescript
/**
 * Compute a read-only state-vs-state diff between two raw states.
 *
 * @param a - the "before" raw state.
 * @param b - the "after" raw state.
 * @returns the diff (notesAdded/Removed/Changed + automationTouched + scopeTrackSids).
 *
 * @example
 * const diff = computeStateDiff(
 *   { notes: [...] },
 *   { notes: [...] },
 * );
 */
export function computeStateDiff(a: RawState, b: RawState): StateDiff {
```

Apply this exact doc shape to `resolveOps` + `previewPatch`. Body lives in `03-RESEARCH.md:567-609`. Note identity (`Note.key`) is consumed via `Map<key,Note>` exactly like `diff-logic.ts:96-100` `indexByKey` — D-06 invariants depend on it.

---

### `daemon/src/patch/inverse-ops.ts` (pure logic, self-inverting op transform)

**Analog:** `daemon/src/cli/diff-logic.ts:86-100` (pure note-set helpers) — same pure discipline + same `Note` shape.

**`Note` identity contract** — pinned in `03-RESEARCH.md:505-530`. The key scheme `n:${pitch}:${startQuantized}` (1/64-beat quantization) MUST match `diff-logic.ts:30-41` `Note.key` (a free string used for set comparison). Do NOT re-invent a parallel identity scheme.

**Type discriminated-union pattern** (mirrors `noteContentEqual` field-by-field discipline at `diff-logic.ts:86-93`):
```typescript
export type PrimitiveOp =
  | { op: "add_note"; note: Note }
  | { op: "remove_note"; note: Note }
  | { op: "update_note_field"; before: Note; after: Note };
```

Body (`inverseOp` + `inverseOps`) lives in `03-RESEARCH.md:537-557`. Add a `ScopeMismatchError` (or similar) exported type so the daemon entry can translate a thrown scope error to `ok:false` (mirrors how `intent-store.ts:69` throws a structured Error carrying Ajv context).

---

### `daemon/src/patch/risk-classifier.ts` (pure logic, classify)

**Analog:** `daemon/src/cli/diff-logic.ts` — pure-function discipline; documented interface + `@example`; NO I/O.

**Pattern to copy** (`03-RESEARCH.md:286-322` is the worked example, sourced from `diff-logic.ts` discipline). Specifically:
- Exported `type RiskClass` + `interface RiskInput` (mirrors `diff-logic.ts:71-83` `StateDiff` interface shape — field-level JSDoc on each property).
- One pure exported function `classifyRisk(input: RiskInput): RiskClass` with the body documented line-by-line (mirrors `diff-logic.ts:117-162` comment density).
- Throws `ScopeMismatchError` on `scope.touched ⊋ scope.declared` (caller translates to `ok:false, error:"scope_mismatch"` — same shape as `query-server.ts:257-270` `makeErr`).

---

### `daemon/src/patch/candidate-store.ts` (ephemeral in-memory store)

**Analog:** `daemon/src/state/analyzer-registry.ts:98-122` (`AnalyzerRegistry` — same `Map<id, T>` insertion-ordered pattern).

**Map lifecycle pattern** (`analyzer-registry.ts:99-103`):
```typescript
export class AnalyzerRegistry {
  private readonly analyzers: Analyzer[] = [];

  register(a: Analyzer): void {
    this.analyzers.push(a);
  }
```

Apply to `CandidateStore`: `private readonly map = new Map<string, Patch>()`. JS Map preserves insertion order → LRU cap of 64 mints via `map.keys().next().value` (the eviction path). The class shape + JSDoc density should mirror `AnalyzerRegistry` exactly.

**patchId minting** — use `node:crypto.randomUUID()` exactly like `daemon/src/protocol/correlator.ts:27, 91`:
```typescript
import { randomUUID } from "node:crypto";
// ...
const id = randomUUID();              // correlator.ts:91
const full: Patch = { ...patch, patchId: `pt_${randomUUID()}` };
```

**Pitfall 5 anti-pattern** (`03-RESEARCH.md:1412-1416`): NEVER content-hash — randomness is correct here (loopback-only, single-user, no collision concern).

**MEM-02 boundary** — the store MUST stay in-memory only. The boundary contract is `daemon/src/store/boundary.ts`; do NOT add any `writeFile`/`appendFile` to this module.

---

### `daemon/src/patch/patch-history.ts` (durable append-only journal)

**Analog:** `daemon/src/store/atomic-write.ts:21-53` (`atomicWriteJson` — the discipline that every durable daemon write follows).

**Imports pattern** (extend the atomic-write imports with `appendFile` + `readFile`):
```typescript
import { appendFile, readFile } from "node:fs/promises";
import { atomicWriteJson } from "../store/atomic-write.js";
import type { Patch } from "../gen/patch.js";
import type { PrimitiveOp } from "./inverse-ops.js";
```

**Atomic-write discipline to mirror** (`atomic-write.ts:46-53`):
```typescript
const dir = dirname(path);
await mkdir(dir, { recursive: true });
// Temp file MUST be in same dir as dest — cross-filesystem rename is non-atomic.
const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
const serialized = JSON.stringify(data, null, 2);
await writeFile(tmp, serialized, "utf8"); // write fully first
await rename(tmp, path); // atomic on POSIX, same filesystem
```

Apply to `patch-history.ts` as: append via `appendFile(this.path, line + "\n", "utf8")` (POSIX-atomic for lines < 4KB — Pitfall 8 + A5); rotate via `atomicWriteJson` when the file exceeds `ROTATE_AT_BYTES = 10 * 1024 * 1024`. The `entries()` async generator MUST skip-and-flag malformed lines (per-line `try/catch`, Pitfall 8 — journal corruption defense). Body sketch in `03-RESEARCH.md:953-1008`.

**Rotation non-negotiables** (from `atomic-write.ts:33-37`): temp file MUST live in `dirname(path)` — never a `/tmp` literal (cross-filesystem rename is non-atomic). Auto-`mkdir(dir, {recursive:true})` so a missing `.bw-brain/` is auto-created.

---

### `daemon/src/patch/arb.ts` (test arbitraries, generative)

**Analog:** `daemon/src/cli/diff-logic.test.ts:28-49` — the existing note-builder helpers.

**Note-builder helper pattern** (`diff-logic.test.ts:28-37`):
```typescript
function note(
  key: string, pitch: number, start: number, length: number, velocity: number,
): Note {
  return { key, pitch, start, length, velocity };
}
```

Phase 3 promotes this to a fast-check arbitrary: instead of a free `key` string, the arb MUST mint `key` via the real `noteKey(pitch, start)` from `inverse-ops.ts` so identity matches production (`03-RESEARCH.md:1245-1249`). Define `arbNote`, `arbNoteSet` (`fc.uniqueArray(arbNote, { selector: n => n.key })` — mirrors `diff-logic.ts:96-100` set semantics), `arbPrimitiveOp` (`update_note_field` constrained so `before.key === after.key`), `arbOpSeq` (generate base + target, derive ops = `diffToOps(base, target)`).

This is the **first fast-check file in the repo** — no algorithmic analog exists. Pattern authority: `daemon/src/store/atomic-write.test.ts:31-51` (the only existing N=20-parallel "property-style" assertion in the codebase).

---

### `daemon/src/transforms/motif-signature.ts` (analyzer + pure fn)

**Analog (pure-fn discipline):** `daemon/src/cli/diff-logic.ts` — pure module, documented interfaces, `@example`, NO I/O.

**Analog (analyzer interface):** `daemon/src/state/analyzer-registry.ts:72-81` (`Analyzer` interface — `id`, `consumes`, `produces`, pure `analyze`).

**Analyzer shape to mirror** (`analyzer-registry.ts:131-151` `IntentAnalyzer`):
```typescript
export const IntentAnalyzer: Analyzer = {
  id: "intent",
  consumes: [],
  produces: ["intent"],
  analyze(_raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    return [{
      field: "intent",
      value: ctx.intent,
      confidence: 1.0,
      assumptions: [{ claim: "user-authored in .bw-brain/intent.json", confidence: 1.0, source: "intent" }],
    }];
  },
};
```

Apply as `MotifSignatureAnalyzer`: `id: "motifs"`, `consumes: ["clips"]`, `produces: ["motifs"]`. The signature body (`motifSignature` + `motifSimilarity` + `cosine` + `histogramIntersection`) lives in `03-RESEARCH.md:691-757`. Register in a new `M2_ANALYZERS` extending `M1_ANALYZERS` (`analyzer-registry.ts:158`).

**Note shape contract** — consume `Note` from `../cli/diff-logic.ts` (do NOT redefine). The Note shape there (`diff-logic.ts:30-41`) is the canonical `Note` P3 reconciles against.

**Caching discipline** (D-08 discretion, pinned by researcher): EPHEMERAL only (recompute per transform invocation). Do NOT write to `state-cache.json` — durable motif identity is P4+ (ties to ARRANGE-05 track roles).

---

### `daemon/src/transforms/harmonic-detect.ts` (pure algorithm, Krumhansl-Schmuckler)

**Analog:** `daemon/src/cli/diff-logic.ts` — pure-fn discipline (no algorithm analog exists; this is the ONE piece of musical reasoning tonal cannot do, per `03-RESEARCH.md:367`).

**Imports pattern:**
```typescript
import { Key } from "tonal";                                    // NEW dep (D-12)
import type { Note } from "../cli/diff-logic.js";
```

Body (K-S reference profiles + correlation loop + confidence mapping) lives in `03-RESEARCH.md:772-825`. The disclosure assumption to push is sketched at `03-RESEARCH.md:827-834` — mirror the `Assumption` shape from `analyzer-registry.ts:39-46` exactly (`{claim, confidence, source}`).

**Mandatory refuse-below-bar** — `r < 0.5 → return null` (INV-12, D-12). Do NOT silently guess. The empty-clip guard (`notes.length < 4 → return null`) is at `03-RESEARCH.md:793`.

---

### `daemon/src/transforms/{vary,counterline,voice-leading-fix,humanize}.ts` (pure transforms)

**Analog:** `daemon/src/cli/diff-logic.ts` — pure-fn discipline. **No transform analog exists in the repo** (these are the first transforms); the body sketches in `03-RESEARCH.md:840-903` are the spec.

Common imports:
```typescript
import type { Note } from "../cli/diff-logic.js";
import { motifSignature, motifSimilarity } from "./motif-signature.js";
import { type PrimitiveOp } from "../patch/inverse-ops.js";
```

`vary.ts` imports `mintPatchId()` from `candidate-store.ts`. Each transform emits `PrimitiveOp[]` + `transformIntent` metadata (D-01) + `risk` self-declaration (D-07):

| File | Tier (D-10) | Risk | Refuse possible? |
|------|-------------|------|------------------|
| `vary.ts` | creative | medium | YES (D-08 + belowBarCandidate) |
| `counterline.ts` | creative | medium | YES |
| `voice-leading-fix.ts` | cleanup | low | NO (INV-8 — a refusing cleanup is a bug) |
| `humanize.ts` | cleanup | low | NO |

**Identity invariant (Pitfall 2)** — pitch changes are ALWAYS `remove_note` + `add_note` pairs (the `key` changes), NEVER `update_note_field` on pitch. Voice-leading-fix is the main offender; its test fixture pins this (`03-RESEARCH.md:1394-1398`).

---

### `daemon/src/profiles/{generic,techno}.json` (config, declarative data)

**Analog (JSON doc convention):** `schemas/intent.schema.json` — clean JSON, top-level metadata fields.

Bodies live in `03-RESEARCH.md:1013-1042`. **Critical D-14 invariant:** `generic.json` ships hardcoded neutral defaults with NO techno flavor — ARCH-02 ("generic core runs without a profile") must be literally true. `techno.json` carries `"extends": "generic"` (deep-merged by the loader).

---

### `daemon/src/profiles/profile-loader.ts` (config loader)

**Analog:** `daemon/src/state/intent-store.ts:48-72` — one fs-read-at-boot, no inference, throws structured error on unknown input.

**Imports pattern:**
```typescript
import genericProfile from "./generic.json" with { type: "json" };
import technoProfile from "./techno.json" with { type: "json" };
```
(`with { type: "json" }` is the existing JSON-import assertion pattern — `intent-store.ts:19`, `query-server.ts:31-32`, `schemas.test.ts:28-39`.)

**D-14 contract:** `if (!named || named === "generic") return PROFILES.generic;` — the generic core runs literally when no profile is named. Unknown profile name → throw `UnknownProfileError` (mirrors `intent-store.ts:65, 69` structured-throw-with-context pattern).

**Hook contract** (designed, NOT exercised in v1 per D-13) — `ProfileHooks` interface sketched at `03-RESEARCH.md:1044-1057`. The loader detects a `hooks.js` sibling (absent for v1) and skips hook invocation if missing.

---

### `daemon/src/cli/commands/edit.ts` (REPLACE stub with live multicall)

**Analog:** `daemon/src/cli/commands/midi.ts:27-41` (the live multicall pattern).

**Stub being replaced** (`edit.ts:11-14`):
```typescript
program
  .name("bw-edit")
  .description("Reversible MIDI patching (stub — ships in M2)")
  .action(() => emitStub({ name: "bw-edit", availableFrom: "M2" }));
```

**Live multicall pattern to mirror** (`midi.ts:1-42`):
```typescript
import { program } from "commander";
import { query } from "../query-client.js";

interface ExplainOpts {
  explain?: boolean;
}

function printConnectionError(message: string, explain?: boolean): void {
  const envelope = { version: "1.0", type: "result" as const, ok: false, error: message,
                     stateFreshness: "disconnected" as const };
  process.stdout.write(`${JSON.stringify(envelope, null, explain ? 2 : 0)}\n`);
}

program
  .name("bw-midi")
  .description("MIDI clip inspection")
  .command("inspect")
  .description("Return notes/velocity/timing of the selected clip as JSON")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("midi.inspect");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
```

Apply to `edit.ts` as: `program.name("bw-edit")` + three subcommands (`preview`, `apply`, `revert`), each calling `query("edit.<op>", payload)` + `printConnectionError` on failure. D-04 flags: `--confirm` (med/high ack), `--force` (bypass `--confirm`), `--allow-below-bar` (D-09 override, stacks with `--force`). All flags passed in the `payload` so the daemon can enforce them server-side (never trust CLI-only enforcement).

---

### `daemon/src/cli/commands/midi.ts` (MODIFY — extend with 4 subcommands)

**Analog:** itself. Add `.command("vary")`, `.command("counterline")`, `.command("voice-leading-fix")`, `.command("humanize")` chained exactly like the existing `.command("inspect")` at `midi.ts:30`. Each calls `query("midi.<op>")`. Keep `printConnectionError` (`midi.ts:16-25`) shared.

---

### `daemon/src/query/query-server.ts` (MODIFY — extend dispatch)

**Analog:** itself.

**LIVE_OPS extension pattern** (`query-server.ts:46-52`): add `"edit.preview"`, `"edit.apply"`, `"edit.revert"`, `"midi.vary"`, `"midi.counterline"`, `"midi.voice_leading_fix"`, `"midi.humanize"`.

**Handler pattern** (`query-server.ts:208-215`):
```typescript
if (op === "device.inspect") {
  void handleDeviceInspect(deps, state, intent, freshness);
  return;
}
if (op === "midi.inspect") {
  void handleMidiInspect(deps, state, intent, freshness);
  return;
}
```
Add the `edit.*` ops the same way — they need an async pull through the correlator (mirrors `handleMidiInspect:370-420` which calls `deps.pullSelectedClip`). For `edit.apply` the daemon-side flow is sketched in `03-RESEARCH.md:943-951`: lookup candidate → validate risk gate → `inverseOps` → `correlator.send("apply.patch", {undoLabel, operations})` → on success append `patch-history.jsonl`.

**New dep on `QueryServerDeps`** — add a `correlator` injection (or `applyPatchOverBridge` callback) so the query-server can drive the bridge apply path. Mirror the optional-pull-dep pattern at `query-server.ts:71-78` (`pullDeviceChain?` / `pullSelectedClip?`).

---

### `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` (MODIFY — add `case "apply.patch"`)

**Analog:** itself — the read pattern at `PullHandlers.java:157-179` (`handleSelectedClip`) is the mirror the write path copies.

**Dispatch pattern** (`PullHandlers.java:145-155`):
```java
try {
    switch (type) {
        case "get.selected_clip" -> outbox.offer(handleSelectedClip(id, cursorClip));
        case "get.selected_device_chain" -> outbox.offer(handleSelectedDeviceChain(id));
        case "get.project_summary" -> outbox.offer(handleProjectSummary(id, observers));
        default -> outbox.offer(LineJson.responseError(id, "unknown_request"));
    }
} catch (final Exception e) {
    outbox.offer(LineJson.responseError(id, "internal"));
}
```

Add: `case "apply.patch" -> outbox.offer(handleApplyPatch(id, req, cursorClip));`.

**Grid-walk read pattern to MIRROR for write** (`PullHandlers.java:162-179`):
```java
for (int x = 0; x < GRID_W; x++) {
    for (int y = 0; y < GRID_H; y++) {
        final NoteStep step;
        try {
            step = cursorClip.getStep(x, y, 0);
        } catch (final Exception ignored) {
            continue; // grid index out of range on this clip — skip
        }
        if (step == null) { continue; }
        final double vel = step.velocity();
        if (vel > 0.0) {
            notes.add(new NoteView(x, y, vel, step.duration()));
        }
    }
}
```

For the write path, the `handleApplyPatch` body lives in `03-RESEARCH.md:617-681`: invert the loop — instead of `getStep(x,y,0).velocity()` reads, do `getStep(x,y,0).setVelocity(...)` + `setDuration(...)` writes per primitive op. Three cases (`add_note`, `remove_note`, `update_note_field`) — D-01 forbids branching on `transformIntent`. Reply via `LineJson.response(id, ok, Map.of("applied", N, "failed", M))` (line 70 pattern).

**Critical**: `PullHandlers.java:43-44` defines `GRID_W = 16`, `GRID_H = 128` from `BridgeExtension.java:64` `createLauncherCursorClip(16, 128)`. The apply path must compute `beatsPerColumn = loopBeats / GRID_W` (sketched at `03-RESEARCH.md:633-636`) so `startBeats → x` column mapping is correct.

**D-01 anti-pattern (Pitfall 7)** — the handler MUST stay 3-case forever; never read `req.path("transformIntent")` or grow a semantic-catalog switch in Java.

---

### `daemon/src/state/analyzer-registry.ts` (MODIFY — register MotifSignatureAnalyzer)

**Analog:** itself.

**Exact change** at `analyzer-registry.ts:158`: add `M2_ANALYZERS` (or extend `M1_ANALYZERS` in place). Mirror the `IntentAnalyzer` const-object shape at `analyzer-registry.ts:131-151` (id/consumes/produces/analyze). The motif analyzer is the FIRST addition; the test `analyzer-registry.test.ts:43-60` (which asserts M1 ships exactly one analyzer) MUST be updated to assert M2 ships exactly TWO.

---

### `daemon/src/state/intent-store.ts` (MODIFY — schema auto-extends)

**Analog:** itself. **No logic change** — the validator is `ajv.getSchema(intentSchema.$id)` (line 27); extending `intent.schema.json` with optional `harmonicCenter` + `profile` automatically extends validation. The `ProjectIntent` gen type (`gen/intent.ts`) regenerates via `npm run gen:types` (`scripts/gen-types.mjs`). The corresponding test `intent-store.test.ts:33-67` should gain one fixture exercising each new field.

---

### `daemon/package.json` (MODIFY — add deps)

**Analog:** itself.

**Changes:**
- `dependencies` (line 28-32): add `"tonal": "6.4.3"` (runtime — used in motif-signature + harmonic-detect + counterline).
- `devDependencies` (line 33-39): add `"fast-check": "4.8.0"`.
- `scripts` (line 21-27): add `"test:property": "vitest run --grep property"` (per `03-RESEARCH.md:1382`).

---

### `pi-pack/skills/{vary,apply,diff}/SKILL.md` (NEW — Pi skill docs)

**Analog:** `pi-pack/skills/analyze/SKILL.md` (entire 46-line file).

**Frontmatter + structure pattern** (`analyze/SKILL.md:1-12`):
```markdown
---
name: analyze
description: Read the selected Bitwig context via the bw-brain CLI and produce an accurate description + 2-4 next read actions. No invented critique (no analyzers until Phase 3-5).
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-focus","bw-project"]}}}
---

<!-- Source: docs.openclaw.ai/tools/skills (verified) + CONTEXT.md D-10/D-11/D-12 -->
<!-- Transcribed from 02-RESEARCH.md §Code Examples "Pi /analyze SKILL.md" lines 1215-1261 -->

# /analyze — Bitwig context read

You are reading the user's live Bitwig selection via the `bw-*` CLI ...

## Steps
1. Run `bw-focus export --json` ...

## Hard rules (D-10)
- EVERY output line ... carries an `assumptions[]` field (UX-06).
- DO NOT claim sections, motifs, ...
```

Apply to `vary/SKILL.md`, `apply/SKILL.md`, `diff/SKILL.md` with bodies sketched in `03-RESEARCH.md:1109-1192`. The structure is invariant: frontmatter (name/description/user-invocable/metadata) → source comment → title → 1-paragraph intent → `## Steps` → `## Hard rules`. Each file's metadata.requires.bins lists the CLI it shells to.

---

### `daemon/src/patch/*.test.ts`, `daemon/src/transforms/*.test.ts`, `daemon/src/profiles/profile-loader.test.ts`, `daemon/src/cli/commands/edit.test.ts` (NEW — Wave-0 tests)

**Analogs (concrete per test category):**

| Test file | Analog | Pattern to lift |
|-----------|--------|-----------------|
| `patch/inverse-ops.test.ts` (INV-1/2/3) | `daemon/src/cli/diff-logic.test.ts:52-62` (`assertRoundTrip`) + `atomic-write.test.ts:31-51` (N=20 parallel property) | round-trip property + fast-check 500 runs |
| `patch/patch-resolve.test.ts` (INV-4/5) | `daemon/src/cli/diff-logic.test.ts:199-217` (purity assertions) | purity snapshot pattern (JSON.stringify snapshot before + after) |
| `patch/risk-classifier.test.ts` (INV-9/10) | `daemon/src/state/analyzer-registry.test.ts:102-153` (threshold-keeper/dropper pattern) | boundary + monotonicity assertions |
| `patch/candidate-store.test.ts` | `daemon/src/state/analyzer-registry.test.ts` (in-memory registry) | LRU cap + concurrent-apply |
| `patch/patch-history.test.ts` (INV-14) | `daemon/src/store/atomic-write.test.ts` (atomic-write discipline) + `intent-store.test.ts:18-24` (mkdtemp/rm fixture) | journal corruption skip + LIFO revert |
| `patch/patch-schema.test.ts` | `daemon/src/protocol/schemas.test.ts:26-57` (Ajv addSchema + getSchema($id)) | compile validator + valid/invalid counter-example |
| `transforms/motif-signature.test.ts` (INV-6) | `daemon/src/state/analyzer-registry.test.ts:62-88` (analyzer interface assertions) | sanity (sim(a,a)=1) + symmetry + empty/single-note edge |
| `transforms/harmonic-detect.test.ts` (INV-12) | `daemon/src/cli/diff-logic.test.ts:64-72` (empty↔empty edge) | refuse-below-bar + held-out key fixtures |
| `transforms/{vary,counterline,voice-leading-fix,humanize}.test.ts` (INV-7/8/11) | `daemon/src/cli/diff-logic.test.ts:95-116` (multi-case fixture) | motif-gate + cleanup-never-refuses + boundary 0.85 |
| `profiles/profile-loader.test.ts` (INV-13) | `daemon/src/state/intent-store.test.ts` (config-loader pattern) | profile-absent = generic literally |
| `cli/commands/edit.test.ts` | `daemon/src/cli/cli.test.ts` (CLI contract — mock the daemon) | preview/apply/revert shape + flag gating |

**Test imports + fixture pattern** (`diff-logic.test.ts:10-26`):
```typescript
import { describe, it, expect } from "vitest";
import {
  computeStateDiff,
  applyDiff,
  type Note,
  type RawState,
} from "./diff-logic.js";
```

**mkdtemp/rm fixture pattern** (`intent-store.test.ts:10-24` + `atomic-write.test.ts:21-29`):
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tmpRoot: string;
beforeEach(async () => { tmpRoot = await mkdtemp(join(tmpdir(), "bw-brain-...")); });
afterEach(async () => { await rm(tmpRoot, { recursive: true, force: true }); });
```

Apply to `patch-history.test.ts` + `profile-loader.test.ts` (the only tests with fs I/O). All other pure-fn tests follow `diff-logic.test.ts` (no fixtures).

**fast-check integration** (first use in repo): `import fc from "fast-check"`; wrap with `fc.assert(fc.property(arbA, arbB, (a, b) => ...))`. Arb definitions live in `daemon/src/patch/arb.ts`. Bump to 500-1000 runs for INV-1/2/3 (the reversibility spine); 100 default suffices elsewhere.

---

## Shared Patterns

### A. Ajv validator compile-once-at-boot

**Source:** `daemon/src/state/intent-store.ts:17-27`, mirrored at `query-server.ts:30-43` + `schemas.test.ts:44-57`.
**Apply to:** `patch/patch-schema.ts`, `patch/patch-schema.test.ts`, any module validating patches.
```typescript
import { Ajv2020 } from "ajv/dist/2020.js";
import patchSchema from "../../../schemas/patch.schema.json" with { type: "json" };
import editSchema from "../../../schemas/protocol/edit.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(patchSchema);   // MUST register before getSchema($id)
ajv.addSchema(editSchema);    // cross-file $ref (operations.items -> patch.schema.json#/$defs/PrimitiveOp)
const validatePatch = ajv.getSchema(patchSchema.$id)!;
```
**Invariants:** named import + `.js` ext (NodeNext quirk); `addFormats` NOT used (no `format:` keyword); `strict:false` (avoids warnings on the cross-file `$ref`).

### B. Pure-function + I/O split

**Source:** `daemon/src/cli/diff-logic.ts` (pure, 196 lines, zero imports beyond types) + `daemon/src/cli/commands/diff.ts` (I/O shell).
**Apply to:** ALL `patch/*.ts` + `transforms/*.ts` + `profiles/profile-loader.ts` (one fs read at boot, then pure merge) + `harmonic-detect.ts`.
**Concrete rules:**
- Documented interface + per-field JSDoc + `@example` (mirror `diff-logic.ts:71-83, 102-116`).
- NEVER import `node:fs`, `node:net`, or any I/O module in a pure module.
- The commander wrapper is the I/O shell — it parses argv, calls `query()`, prints JSON (mirror `midi.ts:27-41`).

### C. Note identity (set semantics via `Note.key`)

**Source:** `daemon/src/cli/diff-logic.ts:30-41, 86-100`.
**Apply to:** `inverse-ops.ts` (defines `noteKey`), `patch-resolve.ts` (consumes via `Map<key,Note>`), `motif-signature.ts` (consumes `Note`), all transforms, `arb.ts` (arb mints key via real `noteKey()`).
**Concrete:** `key = n:${pitch}:${startQuantized}` (1/64-beat quantization). Identity-stable fields = `pitch` + `start`; mutable content = `velocity` + `length` (+ `pressure` etc.). Pitch change ⇒ `remove_note(old)` + `add_note(new)`, NEVER `update_note_field` (Pitfall 2).

### D. CLI multicall over UDS

**Source:** `daemon/src/cli/commands/midi.ts:1-42` + `daemon/src/cli/query-client.ts:49-103`.
**Apply to:** `cli/commands/edit.ts` (replace stub), `cli/commands/midi.ts` (extend).
**Concrete:**
```typescript
import { query } from "../query-client.js";
// ... inside action:
try {
  const result = await query("edit.preview", payload);
  process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
} catch (e) {
  printConnectionError((e as Error).message, opts.explain);
}
```
`printConnectionError` (`midi.ts:16-25`) is shared boilerplate — emit `{ok:false, stateFreshness:"disconnected"}` envelope.

### E. Atomic-write discipline for durable daemon state

**Source:** `daemon/src/store/atomic-write.ts:21-53` (the canonical POSIX temp+rename).
**Apply to:** `patch-history.ts` (rotation), nothing else (appendFile for journal appends; atomicWriteJson for rotate).
**Invariants:** temp file MUST live in `dirname(dest)` (cross-filesystem rename is non-atomic — `atomic-write.ts:33-37`); `mkdir(dir, {recursive:true})` before write so missing `.bw-brain/` auto-creates; per-line `try/catch` when reading malformed lines (Pitfall 8 — journal corruption defense).

### F. Self-inverse ops + append-only history

**Source:** none existing — first of its kind. Spec at `03-RESEARCH.md:537-562, 953-1008`.
**Apply to:** `patch/inverse-ops.ts` + `patch/patch-history.ts`.
**Invariants:**
- Inverse computed at APPLY time, not revert time (`03-RESEARCH.md:1006` — SC#2 mechanical proof).
- History never rewrites; revert is just another applied patch (the inverse-inverse = original).
- Each journal line < 4KB (well under POSIX append-atomicity buffer — A5).

### G. Analyzer-registry plugin

**Source:** `daemon/src/state/analyzer-registry.ts:72-81, 131-158`.
**Apply to:** `transforms/motif-signature.ts` (registers `MotifSignatureAnalyzer`).
**Invariants:** `analyze` is pure; `DerivedField.confidence < 0.5` dropped by `runAll` (`analyzer-registry.ts:110-121`) — the "below-threshold = refuse rather than guess" stance encoded as a registry filter.

### H. Pi skill doc structure

**Source:** `pi-pack/skills/analyze/SKILL.md` (entire file).
**Apply to:** `pi-pack/skills/{vary,apply,diff}/SKILL.md`.
**Structure:** YAML frontmatter (`name`, `description`, `user-invocable: true`, `metadata.openclaw.requires.bins`) → source comment → `# /<name> — <intent>` → 1-paragraph framing → `## Steps` → `## Hard rules`.

### I. Loopback-only transport + trust-spine

**Source:** `bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java:32-33, 84` + `daemon/src/cli/query-client.ts:22-24` (UDS) + `daemon/src/protocol/correlator.ts:90-114` (daemon→bridge request/response).
**Apply to:** `PullHandlers.java` (add `case "apply.patch"` — no new listener; uses existing TCP 7878), `query-server.ts` (add `edit.*` / `midi.*` ops — no new listener; uses existing UDS).
**Invariants:** Phase 3 adds NO new listener (D-07); the loopback-only bind from Phase 1 still governs; every apply goes through the validated `edit.schema.json` envelope + primitive union.

---

## No Analog Found

Files with no close match in the codebase. Planner should use `03-RESEARCH.md` sketches directly.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `daemon/src/transforms/harmonic-detect.ts` | pure algorithm | classify (Note[] → key/mode) | No MIR/signal-processing code exists in the repo. Krumhansl-Schmuckler is hand-rolled (tonal can't detect — `03-RESEARCH.md:367`). Use the worked example at `03-RESEARCH.md:772-825`. |
| `daemon/src/transforms/{vary,counterline,voice-leading-fix,humanize}.ts` | pure transforms | generative / cleanup | First creative-MIDI code in the repo. No transform analog exists. Use the per-transform specs at `03-RESEARCH.md:840-903`. Discipline = pure-fn (analog `diff-logic.ts`); algorithm = RESEARCH-only. |
| `fixtures/representative-clips/*.json` + `fixtures/harmonic-centers/*.json` | test fixtures | declarative | First held-out-fixture set in the repo. Existing tests use inline fixtures (`diff-logic.test.ts:75-116`). Author per `03-RESEARCH.md:1257-1258` BEFORE threshold tuning. |
| `daemon/src/patch/arb.ts` (fast-check arbitraries) | test helper | generative | First fast-check file in the repo. Pattern authority: `atomic-write.test.ts:31-51` (only existing "property-style" assertion) + the note-builder helper at `diff-logic.test.ts:29-37`. |

---

## Metadata

**Analog search scope:** entire repo (`schemas/`, `daemon/src/`, `bridge/src/`, `pi-pack/`, `scripts/`, `docs/`). AGENTS.md at `.claude/AGENTS.md` read for project conventions (NodeNext `.js` imports, Ajv 2020-12 quirk, `addFormats` NOT used, loopback-only bind, validate-at-every-boundary).

**Files scanned (read in full or via targeted offset/limit):**
- `daemon/src/cli/diff-logic.ts` (196 lines, full) — primary pure-fn analog
- `daemon/src/cli/diff-logic.test.ts` (218 lines, full) — property-test analog
- `daemon/src/store/atomic-write.ts` (53 lines, full) + `atomic-write.test.ts` (84 lines, partial) — atomic-write analog
- `daemon/src/state/analyzer-registry.ts` (158 lines, full) + test (187 lines, full) — analyzer-plugin + Map registry analog
- `daemon/src/state/intent-store.ts` (73 lines, full) + test (135 lines, full) — boot-time Ajv-compile + config-loader analog
- `daemon/src/cli/query-client.ts` (103 lines, full) — UDS thin client
- `daemon/src/cli/commands/midi.ts` (42 lines, full) + `edit.ts` (16 lines, full) — multicall + stub
- `daemon/src/protocol/correlator.ts` (156 lines, full) — daemon→bridge request/response
- `daemon/src/query/query-server.ts` (420 lines, full) — daemon UDS dispatch
- `bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java` (201 lines, full) + `LineJson.java` (72 lines, full) + `BridgeExtension.java` (124 lines, full) — bridge dispatch + grid-walk + cursor clip
- `schemas/{intent,project-state}.schema.json` + `schemas/protocol/edit.schema.json` + `schemas/cli-query/query.schema.json` (full) — JSON Schema conventions
- `daemon/src/protocol/schemas.test.ts` (60 of 622 lines) — Ajv addSchema/getSchema pattern
- `scripts/gen-types.mjs` (192 lines, full) — JSON-Schema→TS codegen
- `pi-pack/skills/analyze/SKILL.md` (46 lines, full) — skill-doc analog
- `daemon/package.json` (40 lines, full) — dep manifest
- `.claude/AGENTS.md` (245 lines, full) — repo engineering rules

**Pattern extraction date:** 2026-06-29

## PATTERN MAPPING COMPLETE
