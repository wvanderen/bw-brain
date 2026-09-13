# Phase 5: Automation & Device Workflows (M4) - Pattern Map

**Mapped:** 2026-08-22
**Files analyzed:** 30 (22 production modify/create + 8 test files)
**Analogs found:** 30 / 30 (every file has a same-role analog — this codebase was explicitly built with these extension seams; "exact" = extension of a file that already embodies the pattern)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `schemas/patch.schema.json` | schema-contract | CRUD (patch ops) | itself (`$defs.PrimitiveOp` :109, `Scope` :86) | exact (self-extension) |
| `schemas/protocol/event.schema.json` | schema-contract | event-driven | itself (type enum :17, $comment Pitfall 1 :6) | exact (self-extension) |
| `schemas/protocol/request.schema.json` | schema-contract | request-response | itself (enum :17, additive `get.*` precedent) | exact (self-extension) |
| `schemas/profile.schema.json` | schema-contract | config | itself (`energyWeights` :67-79 optional-field precedent) | exact (self-extension) |
| `bridge/.../PullHandlers.java` | bridge handler (controller) | request-response + CRUD | itself (`handle` switch :223-247, `applyOps` :368, `handleSelectedDeviceChain` :308) | exact (self-extension) |
| `bridge/.../Observers.java` | bridge observer | event-driven | itself (`wireClipLauncherSlotsEager` :388, `wireTransport` :292) | exact (self-extension) |
| `bridge/.../BridgeExtension.java` | bridge wiring (config) | request-response | itself (`cursorDevice` created :84, `PullHandlers.start` :213) | exact (self-extension) |
| `daemon/src/transforms/automation-salience.ts` (NEW) | analyzer (pure service) | batch/transform | `daemon/src/transforms/energy-curve.ts` (Analyzer plugin :229-263) | role+flow match |
| `daemon/src/state/salience-snapshot.ts` (NEW) | state store | file-I/O | `daemon/src/state/arrangement-snapshot.ts` (+ `roles-store.ts` sibling-clone precedent) | exact pattern clone (D-05-04 mandate) |
| `daemon/src/transforms/curve-shapes.ts` (NEW) | pure transform | batch/transform | `daemon/src/transforms/vary.ts` + `energy-curve.ts` `normalizeAgainstPeak` :90 | role+flow match |
| `daemon/src/transforms/macro-suggest.ts` (NEW) | advisory transform | batch/transform | `daemon/src/transforms/transition-suggest.ts` | exact pattern match (advisory + evidence + alternatives) |
| `daemon/src/patch/inverse-ops.ts` | utility (patch spine) | CRUD | itself (`PrimitiveOp` :39, `inverseOp` :89, `inverseOps` :119) | exact (self-extension) |
| `daemon/src/runtime/edit-service.ts` | service (mutation authority) | request-response + CRUD | itself (apply pre-flight :43-63) | exact (self-extension) |
| `daemon/src/patch/patch-history.ts` | store (journal) | file-I/O | itself (`PatchHistoryEntry.clipSid` migration precedent :48-56) | exact (self-extension) |
| `daemon/src/sessions/pi-tools.ts` | tool surface (schema) | request-response | itself (`PREVIEW_EDIT_PARAMETERS` :55-86) | exact (self-extension) |
| `daemon/src/cli/commands/automation.ts` | CLI command | request-response | `daemon/src/cli/commands/arrange.ts` (stub→live pattern authority) | exact pattern match |
| `daemon/src/cli/commands/device.ts` | CLI command | request-response | itself (live inspect :27-40) + `arrange.ts` subcommand shape | exact (self-extension) |
| `daemon/src/ingest/fold-event.ts` | ingest fold | event-driven | itself (switch :69-158, `device.name_changed` branch :121 closest) | exact (self-extension) |
| `daemon/src/protocol/reader.ts` | protocol boundary | event-driven | itself (`OBSERVATIONAL_EVENT_TYPES` :84) | exact (self-extension) |
| `daemon/src/state/analyzer-registry.ts` | registry (config) | batch | itself (`M3_ANALYZERS` :210-216; `automationSalience` name already reserved :54) | exact (self-extension) |
| `daemon/src/query/query-server.ts` | query service | request-response + file-I/O | itself (`assembleArrangementReviewEvidence` :962, `refreshArrangementSnapshot` :1021) | exact (self-extension) |
| `daemon/src/runtime/boot.ts` | runtime wiring (config) | request-response | itself (`DEFAULT_PROJECT` :127, project fold :132) | exact (self-extension) |
| `daemon/src/peers/action-dispatch.ts` | peer dispatcher (controller) | request-response | itself (`arrangement.review` branch :65-89) | exact (self-extension) |
| `clap/src/model/UiState.h` (+ `UiState.cpp`) | UI state/reducer | event-driven | itself (`UiAction::Kind::arrangementReview` :19, factory :166-167, encode case :268) | exact (self-extension) |
| `clap/src/PluginEditor.cpp` (+ `.h`) | UI component | event-driven | itself (`review_` button :5, drawer clamp :6) | exact (self-extension) |
| `daemon/src/profiles/generic.json` + `techno.json` | config | config | themselves (additive optional fields; schema edit in same task) | exact |
| `docs/bitwig-capabilities.md` | docs/evidence | file-I/O | itself (§3/§4 dated `Observed:` field convention) | exact |
| 8 test files (see Tests section) | test | batch | named existing test files | exact |

## Pattern Assignments

### `schemas/patch.schema.json` (schema-contract, CRUD)

**Analog:** itself — the file's `$comment` records the frozen trust-spine contract any extension must preserve.

**PrimitiveOp oneOf discipline** (lines 109-115):
```json
"PrimitiveOp": {
  "oneOf": [
    { "$ref": "#/$defs/AddNoteOp" },
    { "$ref": "#/$defs/RemoveNoteOp" },
    { "$ref": "#/$defs/UpdateNoteFieldOp" }
  ],
  "description": "D-01 canonical primitive CRUD union. The bridge apply.patch handler is 3-case forever (Pitfall 7)."
}
```

**Op def shape** (lines 117-125 — `AddNoteOp` as template):
```json
"AddNoteOp": {
  "type": "object",
  "required": ["op", "note"],
  "additionalProperties": false,
  "properties": {
    "op": { "const": "add_note" },
    "note": { "$ref": "#/$defs/Note" }
  }
}
```

**Scope discipline** (lines 86-108): `Scope` is `required: ["clipSid"]`, `additionalProperties: false`, `clipSid` pattern `^clip_[0-9a-f]{16}$`, optional `region {start,end}`. **Automation needs a SIBLING `AutomationScope`** (deviceSid + paramId + region) in `Scope`'s oneOf — do NOT loosen `clipSid` (Pitfall 4 in RESEARCH).

**Bounds-encoding precedent** (lines 157-160, Note fields): D-05-14 bounds go here as schema constraints — `maxItems: 64` on points, region beats bound, single-param via oneOf shape.

**Mandatory same-task edits** (Pitfall 10): update the `$comment` (:6) trust-spine note AND the `"3-case forever"` description (:115) — the *invariant* to preserve verbatim is "the bridge never branches on `transformIntent`"; the case count is not forever.

---

### `schemas/protocol/event.schema.json` (schema-contract, event-driven)

**Analog:** itself — Phase 2's additive 5-member freeze documents the exact extension protocol.

**Type enum + payload union** (lines 15-40): `parameter.changed` joins the `type` enum (line 17); payload fields are an additive permissive union with `additionalProperties: false` (each new field gets a description documenting which event carries it).

**Binding extension contract** ($comment, line 6):
> "every entry here MUST also appear in daemon/src/protocol/reader.ts OBSERVATIONAL_EVENT_TYPES — the equality is unit-tested in schemas.test.ts"

So the same task must touch: `event.schema.json` enum → `reader.ts` `OBSERVATIONAL_EVENT_TYPES` (:84) → `schemas.test.ts` equality test (:662-682) → `fold-event.ts` fold branch. Schema-first wave ordering (Pitfall 8).

---

### `schemas/protocol/request.schema.json` (schema-contract, request-response)

**Analog:** itself. Additive enum member precedent (line 17): `get.project_meta` joins `["get.selected_clip", "get.selected_device_chain", "get.project_summary", "get.launcher_clips"]`. Payload stays open (line 23-26) — no change needed for a payload-less get.

---

### `schemas/profile.schema.json` (schema-contract, config)

**Analog:** itself — `energyWeights` is the exact ARCH-02 optional-bias-field precedent for `automationShapes`.

**Optional enhance-never-gate field pattern** (lines 67-79):
```json
"energyWeights": {
  "type": "object",
  "additionalProperties": false,
  "required": ["noteDensity", "velocityAggregate", "polyphony", "pitchCentroid"],
  "$comment": "ARCH-02: this field is OPTIONAL — generic core runs literally without it. Analyzers gate on field-presence (ctx.profile.energyWeights ?? defaultWeights)."
}
```
`automationShapes` (shapeBias/depthRange/rateRange) copies this shape: optional top-level property, `$comment` stating generic-core-runs-literally, consumer uses `ctx.profile?.automationShapes ?? DEFAULT`. Profile JSON edits (`daemon/src/profiles/{generic,techno}.json`) MUST land in the same task (Pitfall 9: schema is `additionalProperties: false`).

---

### `bridge/.../PullHandlers.java` (bridge handler, request-response + CRUD)

**Analog:** itself — three extension points, each with an in-file precedent.

**1. Request dispatch switch** (lines 222-247) — `get.project_meta` case joins here:
```java
switch (type) {
    case "get.selected_clip" -> outbox.offer(handleSelectedClip(id, cursorClip, observers));
    case "get.selected_device_chain" -> outbox.offer(handleSelectedDeviceChain(id));
    ...
    case "apply.patch" -> outbox.offer(handleApplyPatch(id, req, cursorClip));
    default -> outbox.offer(LineJson.responseError(id, "unknown_request"));
}
```

**2. Pure response builder + record pattern** (lines 64-131): `record NoteView(...)` / `record PageView(...)` + `buildDeviceChainResponse(id, pages)` — pure, JUnit-testable without Bitwig. `get.project_meta` gets `buildProjectMetaResponse(id, tempo, timeSignature)` in this style; the parameter-enumeration extension rewrites `handleSelectedDeviceChain` (lines 308-318, currently returns `buildDeviceChainResponse(id, List.of())` with the A1-NEGATED comment to replace).

**3. Automation ops in the apply dispatch** — the injectable-writer pattern (lines 339-346 + 368-423):
```java
interface NoteStepWriter {
    void write(int x, int y, double velocity, double duration);
}
```
`applyOps` switches ONLY on the op discriminant (`add_note`/`remove_note`/`update_note_field`, lines 379-405); per-op try/catch increments `failed` without crashing (lines 407-416). **Add a `ParameterWriter` sibling interface** (touch/set/prior-value-capture) and dispatch automation op kinds in the same switch — never on `transformIntent`. The JUnit test injects a recording writer (no Mockito).

**Scale-conversion-at-boundary precedent** (lines 449-461, `cursorClipWriter`): velocity /127.0 at the bridge boundary with a comment citing the live finding — automation's normalized [0,1] values follow this "convert only at the bridge boundary" discipline (Pitfall 6) and the comment must record the probe outcome.

**Signature plumbing** (lines 183-185 + 208-210): `start(socket, outbox, cursorClip, observers, walker)` / `handle(rawLine, outbox, cursorClip, observers, walker)` — **`cursorDevice` (created at BridgeExtension.java:84) is NOT passed in**; extend both signatures + `BridgeExtension.runConnectorCycle` (:180-213) in the same task (Pitfall 3 in RESEARCH).

---

### `bridge/.../Observers.java` (bridge observer, event-driven)

**Analog:** itself — the eager-init registration + cache + outbox-offer pattern is fully established.

**Eager init()-only registration** (lines 374-388, `wireClipLauncherSlotsEager` javadoc):
> "Bitwig forbids observer registration outside init() ('ydq: This can only be called during driver initialization' — live-observed...)"

All parameter/page/transport-automation observers register inside the extended `register()` overload (lines 179-198 precedent) over FIXED proxies (cursorDevice, one `createCursorRemoteControlsPage`, fixed `getParameter(0..N)` window). Never an `addValueObserver` reachable after `init()` returns.

**skipFirstFire + event emission** (lines 292-302, `wireTransport` — the closest analog for transport-automation-state observers):
```java
final AtomicBoolean skip = new AtomicBoolean(true);
transport.isPlaying().addValueObserver((BooleanValueChangedCallback) (boolean isPlaying) -> {
    if (skip.getAndSet(false)) { return; }
    playing = isPlaying;
    outbox.offer(LineJson.event("transport.changed", mapOf("playing", isPlaying), ts()));
});
```
Push-event observers carry skipFirstFire; PULL-ONLY cache observers (hasContent :388-432, sceneNames :358-371) write the cache on every fire and never offer events. Parameter movement observers are push (`parameter.changed`) → skipFirstFire shape; **coalesce per-param last-value-wins on the controller thread before offer** (Pitfall 5 — no existing coalescing code; new but follows the never-block discipline, zero socket writes except via `outbox.offer`).

**Thread-safe snapshot cache + getters** (lines 61-90, 447-492): `volatile` scalars / `ConcurrentHashMap` maps keyed by composite key (`hasContentKey` :443-445 `(trackIdx << 16) | sceneIdx` — the direct precedent for a param-identity cache key), package-private getters for PullHandlers.

---

### `bridge/.../BridgeExtension.java` (wiring, request-response)

**Analog:** itself. Line 84 creates `cursorDevice`; line 213 `PullHandlers.start(s, outbox, cursorClip, observers, walker)` omits it. Extend `startConnector`/`runConnectorCycle`/`start` parameter lists (cursorClip threading :114-126 is the precedent); note `BridgeExtensionReconnectTest` passes nulls through these params (javadoc :142-148) — keep the test-path null-safety.

---

### `daemon/src/transforms/automation-salience.ts` (NEW — analyzer, batch/transform)

**Analog:** `daemon/src/transforms/energy-curve.ts` — the most recent Analyzer plugin.

**Analyzer plugin shape** (energy-curve.ts lines 229-262):
```typescript
export const EnergyCurve: Analyzer = {
  id: "energyCurve",
  consumes: ["clips"],
  produces: ["energyCurve"],
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const columns = extractSceneColumns(raw);
    if (columns.length === 0) return []; // refuse — no grid, no guess
    const weights = ctx.profile?.energyWeights ?? DEFAULT_ENERGY_WEIGHTS;
    ...
    return [{ field: "energyCurve", value: points, confidence: 1.0,
      assumptions: [{ claim: "...", confidence: 1.0, source: "default" }, ...] }];
  },
};
```
Copy: header comment block citing decisions, PURE module (no fs/net), defensive extraction from raw state (the `extractSceneColumns` + `isNote` runtime-guard pattern, lines 277-335), refuse-on-empty, honest confidence, assumptions[] carrying the prior source (roles.json/energyCurve → `source: "config"`). Weighted-composite math precedent: `rawBarEnergy` (lines 181-212). Formula constants are agent-discretion (RESEARCH §Code Examples sketch is the first draft).

**Registration** — `daemon/src/state/analyzer-registry.ts`: `DerivedFieldName` already reserves `"automationSalience"` (line 54); add `M4_ANALYZERS` following `M3_ANALYZERS` (lines 210-216: spread previous + new analyzer, comment listing which requirement each covers). Type-only back-import discipline (lines 25-36) keeps the import one-way.

---

### `daemon/src/state/salience-snapshot.ts` (NEW — state store, file-I/O)

**Analog:** `daemon/src/state/arrangement-snapshot.ts` (clone verbatim per D-05-04); `roles-store.ts` proves the clone-sibling pattern ("Mirrors arrangement-snapshot.ts EXACTLY", roles-store.ts:4-5).

**The four load/save invariants** (arrangement-snapshot.ts):
1. ENOENT → `null`, never a synthesized default (lines 232-243)
2. Parse/validate errors throw with path + Ajv errors in the message (lines 245-254)
3. **Save is a schema gate — validate BEFORE atomicWriteJson** (04.3-07 DEFECT B, lines 284-288):
```typescript
export async function saveArrangementSnapshot(path: string, snap: ArrangementSnapshot): Promise<void> {
  if (!validateSnapshot(snap)) {
    throw new Error(`arrangement-snapshot.json save rejected: ${JSON.stringify(validateSnapshot.errors)} (${path})`);
  }
  await atomicWriteJson(path, snap);
}
```
4. Inline daemon-internal schema (NOT under `schemas/` — never crosses the wire; no `format:` keywords; Ajv2020 compile-once at module load, lines 212-217).

Snapshot shape: `version / pulledAt / profile` top-level (visible freshness D-05-04) + bounded aggregates ONLY (movement counts/variance/range — never event streams, Security Domain mandate). The `snapshot_invalid` load-path refusal maps to how query-server surfaces it (outcome reason union, query-server.ts:934-937).

---

### `daemon/src/transforms/curve-shapes.ts` (NEW — pure transform, batch/transform)

**Analog:** `daemon/src/transforms/vary.ts` (pure transform discipline + boundary guards) + `energy-curve.ts` `normalizeAgainstPeak` (value clamping).

**Pure-module + refuse-not-guess stance** (vary.ts lines 28-31):
> "PURE module: no fs/net. The candidate-store mint happens in the daemon dispatch (Task 2 handleMidiVary), NOT here."

**Boundary-guard precedent** (vary.ts lines 173-181, `rhythmicDisplacement`): the clip-grid overflow guard with the live-finding comment — curve points get the same in-bounds treatment (region ≤ 16 bars, ≤ 64 points, values ∈ [0,1]; RESEARCH Pitfall 6 fast-check property).

**Clamp/normalize precedent** (energy-curve.ts lines 90-94):
```typescript
export function normalizeAgainstPeak(values: number[]): number[] {
  if (values.length === 0) return [];
  const peak = Math.max(...values, 1e-9); // D-16 zero-guard
  return values.map((v) => v / peak);
}
```
Shapes are the product — hand-rolled by design ("Don't Hand-Roll" table explicitly exempts the math). Interface style: documented `CurveSpec`/`buildCurve` per the RESEARCH sketch, `@example` JSDoc.

---

### `daemon/src/transforms/macro-suggest.ts` (NEW — advisory transform, batch/transform)

**Analog:** `daemon/src/transforms/transition-suggest.ts` — the D-10 advisory pattern is exactly D-05-09/D-05-11/12's contract.

**Advisory invariant** (transition-suggest.ts lines 11-18):
> "D-10 INVARIANT (Pitfall 5): this module is PURELY ADVISORY. It carries NO patchId, NO operations[], NO risk field... This module MUST NOT import from ../patch/* (the test asserts this structurally)."

**Observation shape** (lines 44-58): `kind` discriminant + populated per-kind fields + `assumptions: Assumption[]` (UX-06 — never empty) + `manualHint` (producer wires macros by hand, D-05-09). **D-05-11 additions over the analog**: evidence line = param identity + device + movement count/sections + role/energy context, and **≥1 alternative candidate** — mirror how `trackRoles` carries `alternatives[]` (arrangement-snapshot.ts:61). Caps against spam (`DEFAULT_MAX_REPETITION_GAPS` :29 precedent) = the top-N bounded-drawer discretion. pulledAt honesty suffix (lines 73-76, 113).

---

### `daemon/src/patch/inverse-ops.ts` (utility, CRUD) — EXTEND

**Analog:** itself.

**Union + switch inverse** (lines 39-42, 89-98):
```typescript
export type PrimitiveOp =
  | { op: "add_note"; note: Note }
  | { op: "remove_note"; note: Note }
  | { op: "update_note_field"; before: Note; after: Note };

export function inverseOp(op: PrimitiveOp): PrimitiveOp {
  switch (op.op) {
    case "add_note": return { op: "remove_note", note: op.note };
    ...
    case "update_note_field": return { op: "update_note_field", before: op.after, after: op.before };
  }
}
```
Automation ops join the union; their inverse is **author-aware** (D-05-07): "remove exactly these authored points / restore prior param value" — the prior value is captured at apply time and frozen into the op (RESEARCH Pitfall 11), so the inverse function needs the frozen-prior form (`set_parameter` inverse = `set_parameter` to prior). `inverseOps` reverse+map (lines 119-122) already handles sequencing. Keep PURE (zero imports beyond types, header lines 3-7).

---

### `daemon/src/runtime/edit-service.ts` (service, request-response + CRUD) — EXTEND

**Analog:** itself — `apply` is the pre-flight gate template.

**Named-refusal pre-flight** (lines 43-53):
```typescript
async apply(state, _intent, freshness, input): Promise<EditResult> {
  if (freshness === "disconnected") return { ok: false, error: "state_disconnected", assumptions: [] };
  ...
  if (previewClipSid && liveClipSid !== previewClipSid) return { ok: false, error: "wrong_clip_targeted",
    details: { expectedClipSid: previewClipSid, actualClipSid: liveClipSid, hint: "re-select the clip you previewed (or re-preview)" }, assumptions: [] };
  if (!input.force) {
    if ((candidate.risk === "medium" || candidate.risk === "high") && !input.confirm) return { ok: false, error: "confirmation_required", assumptions: [] };
```
Copy this shape for: `wrong_device_targeted` (target-binding compare generalizing the clipSid compare — RESEARCH Pitfall 4), `transport_stopped` / `automation_write_disabled` / `automation_override_active` / `ambiguous_target` (D-05-05/06 vocabulary, sourced from bridge-reported Transport state). The `EditResult` error-string contract (line 15) and preview-validation flow (`validatePatchOrThrow` + `classifyRisk` + `candidateStore.mint`, lines 30-42) stay as-is — automation patches are "just" new op kinds (RB-04). Journal entry construction (line 59) gains the automation binding.

---

### `daemon/src/patch/patch-history.ts` (store, file-I/O) — EXTEND

**Analog:** itself — the `clipSid` field addition is the exact additive-migration precedent.

**Additive entry field with caveated-undefined policy** (lines 48-56):
```typescript
/**
 * D-05 (Phase 03.1 Plan 03): clipSid stamped at apply time. The revert
 * pre-flight compares this against the live `state.selection.clipSid`...
 * Undefined on pre-fix journal entries — the revert gate treats `undefined`
 * as a caveated, NOT refused, path.
 */
clipSid?: string;
```
The automation binding (deviceSid + paramId + frozen prior value for D-05-07) follows: optional additive field, stamped at apply time, undefined on legacy entries = caveated path. `inverseOperations` frozen-at-apply (INV-14, lines 39-41) already carries the author-aware inverse — no journal-mechanics change needed.

---

### `daemon/src/sessions/pi-tools.ts` (tool surface, request-response) — EXTEND

**Analog:** itself.

**Parameter schema discipline** (lines 46-52 + 55-86): `primitiveOperationSchema` is a hand-declared `oneOf` mirroring `patch.schema.json` `$defs.PrimitiveOp`; `PREVIEW_EDIT_PARAMETERS.scope` hard-codes the clip scope:
```typescript
scope: {
  type: "object", additionalProperties: false, required: ["clipSid"],
  properties: { clipSid: { type: "string", pattern: "^clip_[0-9a-f]{16}$" }, region: {...} },
},
operations: { type: "array", minItems: 1, maxItems: 64, items: primitiveOperationSchema },
```
Extension: automation op kinds join the `oneOf` (bounded: ≤64 points encoded in maxItems/item maxItems), scope becomes a oneOf of clip-scope + automation-scope — keeping `additionalProperties: false` and explicit bounds on every numeric (the `maxLength`/`maximum` discipline throughout :60-84). Tool list stays closed ("deliberately no apply, arm, socket, filesystem, or audio handles", line 124). Extend `pi-tools.test.ts` in the same task.

---

### `daemon/src/cli/commands/automation.ts` + `device.ts` (CLI, request-response) — EXTEND

**Analog:** `daemon/src/cli/commands/arrange.ts` (pattern authority, cited in its own header line 12) for the stub→live multicall shape; `device.ts` already live for `inspect`.

**Thin-shell subcommand** (arrange.ts lines 45-57):
```typescript
program
  .command("sections")
  .description("Bottom-up scene segmentation with confidence (ARRANGE-01)")
  .option("--refresh", "re-pull the launcher grid before analysis")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: RefreshOpts) => {
    try {
      const result = await query("arrange.sections", { refresh: opts.refresh ?? false });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });
```
`bw-automation inspect|propose` and `bw-device macros-suggest` copy this verbatim: `query(<daemon-op>, args)` thin shell, `--explain`, shared `printConnectionError` (lines 29-38, emits `stateFreshness: "disconnected"` envelope). No business logic in the CLI (all reasoning in the daemon). Replace `automation.ts`'s stub `emitStub({ name: "bw-automation", availableFrom: "M4" })` (automation.ts:14); `stubs.ts` stays for any remaining stubs.

---

### `daemon/src/ingest/fold-event.ts` + `daemon/src/protocol/reader.ts` (ingest, event-driven) — EXTEND

**Analog:** themselves.

**Fold branch shape** (fold-event.ts lines 121-138, `device.name_changed` — closest to a parameter fold):
```typescript
case "device.name_changed": {
  const name = typeof p.name === "string" ? p.name : undefined;
  if (name === undefined) return state;
  const devices = (state.devices ?? []) as unknown as {...}[];
  ...return { ...state, devices: next };
}
```
`parameter.changed` branch: pure shallow-spread return, defensive typeof guards, accumulate **statistics/aggregates not raw streams** (Pitfall 5 in RESEARCH — the fold updates a bounded movement-aggregate, never an event log). Reader: add to `OBSERVATIONAL_EVENT_TYPES` (:84) — the schemas.test.ts equality test (:662-682) enforces sync with the schema enum.

---

### `daemon/src/query/query-server.ts` (query service) — EXTEND

**Analog:** itself.

**Shared evidence assembly (single source)** (lines 900-1005): `assembleArrangementReviewEvidence` is the template for `assembleDeviceReviewEvidence` — refusal/no-snapshot/evidence outcome union (:934-937), runAll-fresh deterministic analysis (:972), advisory transform invocation with pulledAt (:981-991), assumptions assembly. The device review outcome widens the refusal union with `snapshot_invalid` exactly as 04.3-07 did (:928-933 comment).

**Refresh = pull → refuse-incomplete-up-front → validate-before-persist** (lines 1021-1120): `refreshArrangementSnapshot` refuses a zero-track/empty-trackSid grid BEFORE building a snapshot (:1043-1055), runs analyzers, saves via the schema-gated save (:1115-1120), and derives roles.json only on success. The salience refresh (fold aggregates → salience analyzer → salience-snapshot save) mirrors this flow.

---

### `daemon/src/runtime/boot.ts` (wiring) — EXTEND

**Analog:** itself. `DEFAULT_PROJECT = { name: "", tempo: 120, timeSignature: "4/4" }` (:127) is the M1 LIMITATION D-05-16 closes — replace the unconditional default with a `get.project_meta` pull at boot (fold into `project` state :132) with the default retained as the disconnected fallback (the `lastState?.project ?? { ...DEFAULT_PROJECT }` shape :457). Wire the device-review dependency into ActionDispatch following the optional-dependency precedent (`reviewArrangement?` in action-dispatch.ts Dependencies :20, refuses `not_implemented` when unwired :73).

---

### `daemon/src/peers/action-dispatch.ts` (peer dispatcher) — EXTEND

**Analog:** itself — the `arrangement.review` branch (:65-89) is the exact template for `device.review` (Pattern 6: deterministic, zero-Pi).

**Chunk-sequence dispatch** (lines 72-88):
```typescript
const requestId = String(message.requestId ?? "");
if (!this.deps.reviewArrangement) return this.deps.sendTo(connectionId, { type: "action.error", error: "not_implemented" });
this.deps.sendTo(connectionId, { type: "analysis.status", requestId, status: "running", scope });
const outcome = await this.deps.reviewArrangement({ scope, refresh: message.refresh === true });
if (outcome.kind === "refusal") {
  return this.deps.sendTo(connectionId, { type: "action.error", error: outcome.reason });
}
const texts = outcome.kind === "no-snapshot" ? [renderArrangementReviewHint()] : renderArrangementReview(outcome.evidence);
texts.slice(0, 65_536).forEach((text, sequence) => {
  delivered = this.deps.sendTo(connectionId, { type: "conversation.chunk", requestId, sequence, text }) && delivered;
});
return this.deps.sendTo(connectionId, { type: "analysis.complete", requestId, status: "ok" }) && delivered;
```
`device.review` copies: status-running → refusal-or-chunks → analysis.complete; a `renderDeviceReview` bounded-text module (analog: `arrangement-review-render.ts` — 512-char chunk cap :34, grouped layout, pulledAt assumptions line :95-99, sparkline chars for salience ranking :73-76) supplies the texts. Automation *proposals* do NOT ride this path — they use the existing `proposal.publish`/`approval.issue`/`approval.consume` branches (:90-112) unchanged (RB-04).

---

### `clap/src/model/UiState.h` + `UiState.cpp` (UI state) — EXTEND

**Analog:** itself — `arrangementReview` is the additive-member precedent (04.3).

- `UiAction::Kind` enum (UiState.h :19): add `deviceReview` after `arrangementReview`.
- Static factory (UiState.cpp :166-167 `UiAction::arrangementReview(projectId, instanceId, clipSid, refresh)`) → `UiAction::deviceReview(...)` same params.
- Peer encode case (UiState.cpp :268) + reducer — copy the arrangementReview case.
- `ProposalView` (:12) already renders automation proposals in the drawer with zero changes (digest/assumptions/material summaries are kind-agnostic).

### `clap/src/PluginEditor.cpp` (+ `.h`) (UI component) — EXTEND

**Analog:** itself.

**Hosted button → UiAction enqueue** (line 5, `review_` onClick):
```cpp
review_.onClick=[this]{auto s=processor_.uiSnapshot()->scope;
  processor_.uiActions().enqueue(ui::UiAction::arrangementReview(s.projectId,s.instanceId,s.clipSid.value_or(""),true));};
```
A `devices_` button copies this; add to the components array + `resized()` action-button row (line 6: `for(auto*b:{&analyze_,&stop_,&review_,...})b->setBounds(actions.removeFromLeft(112).reduced(3));`).

**Drawer clamp** (line 6):
```cpp
const auto drawerWidth=show?juce::jlimit(360,620,juce::roundToInt(static_cast<float>(r.getWidth())*0.45f)):0;
```
The 360-620 px bound D-05-15's bounded-drawer constraint cites. Device review text lands in the existing `conversation_` TextEditor via `conversation.chunk` (chunk append/reset reducer already in UiState); curve previews render as bounded text evidence lines (renderArrangementReview precedent), never graphics.

---

### `docs/bitwig-capabilities.md` (docs) — EXTEND

**Analog:** itself — the dated `Observed:` field convention (§3 "Automation Write" ~:175, §4 "Bank Paging" ~:201 A1 NEGATED). Probe results append dated Observed fields correcting the stale `AutomatableParameter` citation (Pitfall 1 in RESEARCH: class does not exist in extension-api:21 — real surface is `Parameter.touch/set` + Transport write states).

## Shared Patterns

### Trust-spine: every mutation is a schema-validated patch op
**Source:** `schemas/patch.schema.json` ($comment :6, PrimitiveOp :109) + `daemon/src/patch/patch-schema.ts` (`validatePatchOrThrow`, used at edit-service.ts:33) + `bridge/.../PullHandlers.applyOps` (:368).
**Apply to:** patch.schema.json, inverse-ops.ts, edit-service.ts, pi-tools.ts, PullHandlers automation dispatch, patch-history.ts, all their tests. Invariant to preserve verbatim: *the bridge never branches on `transformIntent`; it dispatches only on the primitive op discriminant* (update the "3-case forever" comment + schema `$comment` in the same task as the op extension).

### Named-refusal error vocabulary (never silent no-op)
**Source:** `daemon/src/runtime/edit-service.ts` :31/:44/:46/:49-52 (`state_disconnected`, `candidate_not_found`, `wrong_clip_targeted`, `confirmation_required`, `below_bar_requires_confirm`) + outcome reason union query-server.ts :934-937.
**Apply to:** all automation apply paths — `transport_stopped`, `automation_write_disabled`, `automation_override_active`, `ambiguous_target`, `wrong_device_targeted` join this vocabulary; every refusal carries `details.hint` where the clip precedent does.

### Snapshot + freshness (D-05-04)
**Source:** `daemon/src/state/arrangement-snapshot.ts` (ENOENT→null :239-241, validate-before-persist :285-288, atomicWriteJson) + query-server refresh refusal ladder :1043-1055/:1115-1120 + render pulledAt honesty (arrangement-review-render.ts :95-99).
**Apply to:** salience-snapshot.ts, its refresh path, every read surface (CLI + peer) — stale-but-readable when disconnected, `snapshot_invalid` refusal on corrupt, visible `pulledAt` everywhere.

### Advisory invariant (no patch fields, structurally asserted)
**Source:** `daemon/src/transforms/transition-suggest.ts` :11-18 (MUST NOT import ../patch/*; test asserts) + `arrangement-review-render.ts` :10-14.
**Apply to:** macro-suggest.ts, salience surfacing, device-review render — observations/manualHints only; escalation to mutation stays on the explicit preview → proposal → approval spine.

### UX-06 assumptions[] shape
**Source:** `daemon/src/state/analyzer-registry.ts` :62-69 (`{claim, confidence ∈ [0,1], source: selection|intent|config|default}`) — mirrored in patch.schema.json `$defs.Assumption` :179-189.
**Apply to:** every suggestion/evidence line (D-05-11), every analyzer output, every CLI/peer payload.

### Pure-module transform discipline
**Source:** `daemon/src/transforms/energy-curve.ts` :30-31 / `vary.ts` :28-30 (no fs/net imports; daemon dispatch owns persistence/minting) + `motif-signature.ts` precedent.
**Apply to:** automation-salience.ts, curve-shapes.ts, macro-suggest.ts, renderDeviceReview — pure + deterministic, fast-check testable.

### Eager init()-only Bitwig observer registration + enqueue-then-drain
**Source:** `bridge/.../Observers.java` :374-388 (post-init registration throws — live-verified) + `wireClipLauncherSlotsEager` :388-432 + `outbox.offer` never direct socket writes (header :5-8).
**Apply to:** ALL new parameter/page/transport-automation observers; per-param last-value-wins coalescing before offer (Pitfall 5).

### Atomic persistence (MEM-01)
**Source:** `daemon/src/store/atomic-write.ts` via `atomicWriteJson` (arrangement-snapshot.ts :288, roles-store.ts :140); JSONL rotation inline temp-in-dirname+rename (patch-history.ts :198-209 — temp MUST live in dirname(dest)).
**Apply to:** salience-snapshot save; no new file-format writers.

### CLI stub→live thin shell
**Source:** `daemon/src/cli/stubs.ts` (exit-0 structured not_implemented) → `daemon/src/cli/commands/arrange.ts` (live multicall: query() + --explain + printConnectionError).
**Apply to:** `bw-automation` (replace stub), `bw-device macros-suggest` (new subcommand on live command).

### UiAction additive-member + drawer bounds
**Source:** `clap/src/model/UiState.h` :19 (Kind enum) + `UiState.cpp` :166-167/:268 + `PluginEditor.cpp` :5-6 (button enqueue; `juce::jlimit(360,620,...)` drawer clamp).
**Apply to:** `deviceReview` member end-to-end (factory, encode, reducer, button, resize) — extend `clap/cmake` ProductUiTests per the 04.3 reducer-test pattern.

## Tests (Wave 0 map from RESEARCH §Validation)

| New/Extended Test | Analog |
|---|---|
| `daemon/src/transforms/automation-salience.test.ts` | `daemon/src/transforms/energy-curve.test.ts` (imports `Analyzer, DerivedField` types :21; pure-fn discipline per motif-signature.test.ts :7) |
| `daemon/src/state/salience-snapshot.test.ts` | `daemon/src/state/arrangement-snapshot.test.ts` |
| `daemon/src/transforms/macro-suggest.test.ts` | `daemon/src/transforms/transition-suggest.test.ts` (structural no-patch-fields assertion) |
| `daemon/src/transforms/curve-shapes.test.ts` | `daemon/src/transforms/vary.test.ts` + fast-check bounds property (`inverse-ops.test.ts` precedent for property tests) |
| `daemon/src/patch/patch-schema.test.ts` (new) + `inverse-ops.test.ts` (extend) | `daemon/src/patch/inverse-ops.test.ts` (INV round-trip properties) |
| `bridge/src/test/java/com/bwbrain/bridge/PullHandlersAutomationTest.java` | `bridge/src/test/java/com/bwbrain/bridge/PullHandlersApplyPatchTest.java` (recording writer, pure builders, no Mockito) |
| `daemon/src/sessions/pi-tools.test.ts` (extend) | itself |
| `daemon/src/runtime/edit-service.test.ts` (extend/new) | `daemon/src/cli/commands/edit.test.ts` + edit-service error-vocabulary tests |

Vitest include-glob discipline: new test files must match `daemon/vitest.config.ts` `include` (BLOCKER-02 defense noted in RESEARCH).

## No Analog Found

All files have same-role analogs. Three components are **novel logic** (not novel structure) — the analog provides the surrounding pattern, the RESEARCH sketch provides the design:

| File | Novel Part | Closest Structural Analog |
|------|-----------|---------------------------|
| `daemon/src/transforms/automation-salience.ts` | movement-statistics formula (no external or internal prior art — verified negative finding) | `energy-curve.ts` weighted-composite + Analyzer wrapper |
| `bridge/.../Observers.java` param observers | per-param last-value-wins coalescing buffer (first new event type + first coalescing in the bridge) | existing observer/cache/outbox pattern; drop-oldest backpressure downstream |
| `daemon/src/transforms/curve-shapes.ts` | named-shape generators (ramp/dip/rise-fall/cycle/hold) | `vary.ts` variant functions + `normalizeAgainstPeak` |

## Metadata

**Analog search scope:** `schemas/`, `schemas/protocol/`, `bridge/src/main+test/java/com/bwbrain/bridge/`, `daemon/src/{transforms,state,patch,runtime,ingest,protocol,query,peers,sessions,cli,profiles}/`, `clap/src/`, `docs/`
**Files scanned:** 30 analog files read in full or targeted ranges (query-server.ts 1,903 lines read in two targeted ranges; PluginEditor.cpp dense single-line file read in full)
**Pattern extraction date:** 2026-08-22
**Cross-references:** DOWNSTREAM-PLAN-NOTES.md seam inventory re-verified by RESEARCH (all file:line refs above confirmed against current source this session)
