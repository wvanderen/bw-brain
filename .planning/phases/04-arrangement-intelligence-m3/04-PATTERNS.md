# Phase 4: Arrangement Intelligence (M3) - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 33 (13 new, 20 extend/modify)
**Analogs found:** 32 / 33 (one `No Analog` — see §No Analog Found)
**Confidence:** HIGH — every analyzer/store/CLI/skill/schema extension has a direct codebase analog; the only novel surface is the Java `LauncherGridWalker` state machine, whose *primitives* (cursor-clip `enumerateNotes`, `getLoopLength` observer, `slot.select`) are all already wired in `PullHandlers.java` + `Observers.java`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **Bridge (JVM)** | | | | |
| `bridge/.../LauncherGridWalker.java` (NEW) | controller (state machine) | request-response | `PullHandlers.java` `handleSelectedClip`+`enumerateNotes` (lines 178-231) + `Observers.java` `wireCursorClip` (lines 104-129) | **role+flow match** (cursor-walk primitives proven; the *state-machine orchestration* is novel — see No Analog) |
| `bridge/.../LauncherGridWalkerTest.java` (NEW) | test | request-response | `bridge/.../PullHandlersApplyPatchTest.java` (the recording-writer JUnit pattern — see PullHandlers.java:264-348 `NoteStepWriter` interface) | role-match (Java JUnit, recording fake) |
| `bridge/.../PullHandlers.java` (EXTEND — add `case "get.launcher_clips"`) | controller (dispatch) | request-response | same file, `case "get.selected_clip"` arm (lines 163-176 dispatch + 178-205 handler) | **exact** (add a sibling case) |
| `bridge/.../Observers.java` (EXTEND — add `wireSceneBank`/`wireSlotBanks` IF push needed) | middleware (observer) | event-driven | same file, `wireTrackBank` (lines 154-175) + `wireCursorClip` (lines 104-129) | **exact** (mirror the `addValueObserver`+`skipFirstFire` pattern) |
| `bridge/.../BridgeExtension.java` (EXTEND — init() createSceneBank wiring) | controller (bootstrap) | request-response | same file, `init()` lines 53-81 (createLauncherCursorClip + createTrackBank) | **exact** (add sibling bank creation) |
| `bridge/.../ClipSid.java` (EXTEND — `derive(trackSid, loopBeats, sceneIdx)` overload) | utility (hash) | transform | same file, `derive(trackSid, loopBeats)` lines 65-81 | **exact** (extend the SHA-256 input) |
| **Daemon — analyzers (pure modules)** | | | | |
| `daemon/src/transforms/scene-features.ts` (NEW) | utility (pure feature extraction) | transform | `daemon/src/transforms/motif-signature.ts` `motifSignature()` (lines 68-107) + `harmonic-detect.ts` PCP builder (lines 86-88) | **exact** (PCP/density extraction template) |
| `daemon/src/transforms/self-similarity.ts` (NEW) | utility (pure matrix) | transform | `daemon/src/transforms/motif-signature.ts` `cosine()`+`motifSimilarity()` (lines 128-154) | **exact** (cosine-remap-to-[0,1] is the canonical pattern) |
| `daemon/src/transforms/section-detector.ts` (NEW) | service (Analyzer) + utility (pure clustering) | transform | `daemon/src/transforms/motif-signature.ts` `MotifSignatureAnalyzer` (lines 170-193) for the Analyzer wrapper | **exact** (Analyzer-plugin template) |
| `daemon/src/transforms/repetition-report.ts` (NEW) | service (Analyzer) + utility (union-find) | transform | `daemon/src/transforms/motif-signature.ts` `MotifSignatureAnalyzer` (lines 170-193) | **exact** (Analyzer wrapper); clustering is hand-rolled (No Analog for union-find) |
| `daemon/src/transforms/energy-curve.ts` (NEW) | service (Analyzer) + utility (composite) | transform | `daemon/src/transforms/motif-signature.ts` `MotifSignatureAnalyzer` (lines 170-193) | **exact** (Analyzer wrapper) |
| `daemon/src/transforms/track-role-classifier.ts` (NEW) | service (Analyzer) + utility (template match) | transform | `daemon/src/transforms/motif-signature.ts` `MotifSignatureAnalyzer` (lines 170-193) + `harmonic-detect.ts` argmax-over-rotations (lines 99-116) | **exact** (Analyzer wrapper + cosine-argmax) |
| `daemon/src/transforms/transition-suggest.ts` (NEW) | utility (pure observation generator) | transform | `daemon/src/transforms/harmonic-detect.ts` (refuse-returns-null discipline, lines 82-129) | role-match (pure + refuse-below-threshold) |
| **Daemon — state stores (atomic I/O)** | | | | |
| `daemon/src/state/arrangement-snapshot.ts` (NEW) | store/model | file-I/O | `daemon/src/state/intent-store.ts` (full file, 73 lines) + `daemon/src/store/atomic-write.ts` `atomicWriteJson` (lines 45-53) | **exact** (ENOENT→null + Ajv-at-boundary + atomic save) |
| `daemon/src/state/roles-store.ts` (NEW) | store/model | file-I/O | `daemon/src/state/intent-store.ts` (full file) + `daemon/src/store/atomic-write.ts` | **exact** (mirror intent-store exactly; add write path) |
| `daemon/src/state/analyzer-registry.ts` (EXTEND — add `"repetition"` to DerivedFieldName + `M3_ANALYZERS` export) | config (registry) | request-response | same file, `M2_ANALYZERS` (lines 162-170) + `DerivedFieldName` union (lines 31-37) | **exact** (the documented extension point) |
| `daemon/src/state/describe.ts` (EXTEND — section slot reads from snapshot instead of `SECTION_RESERVED`) | utility | transform | same file, `SECTION_RESERVED` constant (line 60) + `nameForSid` lookup (lines 93-104) | **exact** (replace placeholder with snapshot lookup) |
| **Daemon — query/CLI/runtime** | | | | |
| `daemon/src/query/query-server.ts` (EXTEND — `arrange.*` op handlers + refresh) | controller (dispatch) | request-response | same file, `LIVE_OPS` set (lines 65-81) + `handleMidiVary`/`prepareMidiDispatch` (lines 957-1073) | **exact** (op-dispatch + shared-preamble pattern) |
| `daemon/src/cli/commands/arrange.ts` (REPLACE stub with multicall) | CLI command | request-response | `daemon/src/cli/commands/midi.ts` (full file, 113 lines) | **exact** (the documented mirror) |
| `daemon/src/runtime/boot.ts` (EXTEND — refreshSnapshot pulls `get.launcher_clips` best-effort) | runtime (bootstrap) | request-response | same file, `refreshSnapshot` (lines 177-229, esp. the `get.selected_clip` best-effort block 213-223) | **exact** (add a sibling best-effort pull) |
| **Daemon — profiles + schemas (additive data)** | | | | |
| `daemon/src/profiles/generic.json` (EXTEND — energyWeights/sectionLabels/roleTemplates) | config (data) | transform | same file (full, 22 lines) + `profile-loader.ts` `mergeProfiles` (lines 117-137) | **exact** (additive fields, deep-merged) |
| `daemon/src/profiles/techno.json` (EXTEND — same) | config (data) | transform | same file (full, 9 lines — `extends:"generic"`) | **exact** |
| `schemas/protocol/request.schema.json` (EXTEND — add `"get.launcher_clips"` to enum) | config (schema) | request-response | same file, `type.enum` (line 17) | **exact** (one enum entry) |
| `schemas/cli-query/query.schema.json` (EXTEND — add `arrange.*` ops) | config (schema) | request-response | same file, `op.enum` (lines 22-37) | **exact** (additive enum entries) |
| `schemas/profile.schema.json` (EXTEND — energyWeights/sectionLabels/roleTemplates fields) | config (schema) | transform | same file (full, 68 lines — `additionalProperties:false`) | **exact** (add sibling property blocks) |
| `schemas/project-state.schema.json` (EXTEND — tighten `tracks`/`clips` open objects) | config (schema) | request-response | same file, `tracks`/`clips` items (lines 81-90) | role-match (open `{type:object}` → tighten) |
| `docs/bitwig-capabilities.md` (EXTEND — §7 SceneBank/ClipBank probe results) | config (docs) | — | same file §4 (TrackBank deprecation chain — the capabilities-doc discipline) | role-match (add §7) |
| **Pi skill** | | | | |
| `pi-pack/skills/review/SKILL.md` (NEW) | component (Pi skill) | request-response (shells to CLI) | `pi-pack/skills/vary/SKILL.md` (full, 63 lines) + `analyze/SKILL.md` (full, 46 lines) | **exact** (the documented mirror) |
| `pi-pack/skills/review/skill.test.ts` (NEW) | test | request-response | `pi-pack/skills/vary/skill.test.ts` (full, 111 lines) | **exact** (contract-test discipline) |
| **Companion tests (per Validation Architecture)** | | | | |
| `daemon/src/transforms/{scene-features,self-similarity,section-detector,repetition-report,energy-curve,track-role-classifier,transition-suggest}.test.ts` (NEW ×7) | test | transform | `daemon/src/transforms/motif-signature.test.ts` (unit + property) + `harmonic-detect.test.ts` | **exact** (pure-function property tests) |
| `daemon/src/state/{arrangement-snapshot,roles-store}.test.ts` (NEW ×2) | test | file-I/O | `daemon/src/state/intent-store.test.ts` + `daemon/src/store/atomic-write.test.ts` (N=20 parallel property) | **exact** (atomicity round-trip) |
| `daemon/src/state/analyzer-registry.test.ts` (EXTEND — M3 refuse-below-threshold) | test | request-response | same file (existing `runAll` drop test) | **exact** |

---

## Pattern Assignments

### `bridge/.../LauncherGridWalker.java` (controller state machine, request-response)

**Analog:** `PullHandlers.java` `handleSelectedClip` + `enumerateNotes` (lines 178-231) for the per-clip NoteStep walk, + `Observers.java` `wireCursorClip` (lines 104-129) for the `getLoopLength().addValueObserver` ready-signal.

**Imports pattern** — copy `PullHandlers.java` lines 23-35 (Bitwig extension-api + Jackson + java.{io,util}) and add `SceneBank`/`ClipLauncherSlotBank`/`ClipLauncherSlot`:

```java
import com.bitwig.extension.controller.api.ClipLauncherSlot;
import com.bitwig.extension.controller.api.ClipLauncherSlotBank;
import com.bitwig.extension.controller.api.NoteStep;
import com.bitwig.extension.controller.api.PinnableCursorClip;
import com.bitwig.extension.controller.api.SceneBank;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extension.controller.api.Track;
// ...jackson + java.util.{ArrayList, LinkedHashMap, List, Map} (PullHandlers lines 28-35)
```

**Core pattern — the per-cell NoteStep walk** — copy from `PullHandlers.java:207-231` (`enumerateNotes`), generalize from one cursor clip to N cells:

```java
// PullHandlers.java:207-231 — the EXACT shape the walker invokes per cell
private static List<NoteView> enumerateNotes(final PinnableCursorClip cursorClip,
                                              final double beatsPerColumn) {
    final List<NoteView> notes = new ArrayList<>();
    for (int x = 0; x < GRID_W; x++) {
        for (int y = 0; y < GRID_H; y++) {
            final NoteStep step;
            try { step = cursorClip.getStep(0, x, y); }
            catch (final Exception ignored) { continue; }   // grid-out-of-range skip
            if (step == null) { continue; }
            final double vel01 = step.velocity();
            if (vel01 > 0.0) {
                final int pitch = y;
                final double start = x * beatsPerColumn;
                final double length = step.duration();
                final int velocity = Math.max(1, (int) Math.round(vel01 * 127.0));
                notes.add(new NoteView("n:"+pitch+":"+start, pitch, start, length, velocity));
            }
        }
    }
    return notes;
}
```

**Loop-length read** — copy from `PullHandlers.java:193-202` (the `cursorClip.getLoopLength().get()` try/catch with the 1.0 beatsPerColumn fallback):

```java
final double loopBeats;
try { loopBeats = cursorClip.getLoopLength().get(); }
catch (final Exception e) {
    return buildClipResponse(id, enumerateNotes(cursorClip, 1.0), "clip_0000000000000000");
}
final double beatsPerColumn = loopBeats > 0 ? loopBeats / GRID_W : 1.0;
```

**Cursor-clip ready-signal observer** — copy the `skipFirstFire` AtomicBoolean guard from `Observers.java:122-128` (the existing `getLoopLength` observer is the SAME signal the walker awaits per `slot.select()`):

```java
// Observers.java:122-128 — the ready-signal pattern the walker reuses
final AtomicBoolean skip = new AtomicBoolean(true);
cursorClip.getLoopLength().addValueObserver((DoubleValueChangedCallback) (double len) -> {
    if (skip.getAndSet(false)) { return; }
    // ... emit event / signal the walker
});
```

**Bank access (NON-deprecated)** — copy `Observers.java:154-175` `wireTrackBank` which uses `trackBank.getItemAt(i)` (the terminal accessor — `getTrack(int)`/`getChannel(int)` are deprecated-as-error per Pitfall 2). For SceneBank: `sceneBank.getItemAt(i)` / `sceneBank.getScene(i)` are BOTH non-deprecated (research Javadoc scan). For per-track slots: `track.clipLauncherSlotBank()` (non-deprecated; `getClipLauncherSlots()` IS deprecated).

**Response builder** — copy the `buildClipResponse` shape from `PullHandlers.java:68-88` (LinkedHashMap payload + `LineJson.response(id, true, payload)`). The new `buildLauncherGridResponse` follows the same shape, just nested one level (tracks→scenes→notes). `LineJson.response(id, ok, payload)` (LineJson.java:44-52) is the response serializer — reuse directly.

**Error handling** — copy `PullHandlers.java:162-176` (the `switch` dispatch with the outer try/catch that offers `LineJson.responseError(id, "internal")` on any exception). NEVER throw into the void (Pitfall 8 in research).

**Testing** — copy the `NoteStepWriter` functional-interface + recording-fake pattern from `PullHandlers.java:264-294` (the package-private `applyOps` + `NoteStepWriter` interface lets `PullHandlersApplyPatchTest` exercise the dispatch with a recording writer, no Mockito). The walker should expose a package-private `walkGrid(slotBank, cursorClip, readySignal)` seam that the JUnit test drives with fakes.

---

### `bridge/.../PullHandlers.java` extension (add `case "get.launcher_clips"`)

**Analog:** the existing `case "get.selected_clip"` arm in the SAME file (lines 163-176 dispatch + 178-205 handler).

**Add to dispatch switch** (line 163-172):

```java
switch (type) {
    case "get.selected_clip" -> outbox.offer(handleSelectedClip(id, cursorClip, observers));
    case "get.selected_device_chain" -> outbox.offer(handleSelectedDeviceChain(id));
    case "get.project_summary" -> outbox.offer(handleProjectSummary(id, observers));
    case "apply.patch" -> outbox.offer(handleApplyPatch(id, req, cursorClip));
    case "get.launcher_clips" -> outbox.offer(handleLauncherGrid(id, cursorClip, observers)); // NEW
    default -> outbox.offer(LineJson.responseError(id, "unknown_request"));
}
```

The handler delegates to `LauncherGridWalker` (which holds the cursor-clip + slotBank references wired in `BridgeExtension.init`). Pure response builder `buildLauncherGridResponse(id, grid)` mirrors `buildProjectSummaryResponse` (lines 108-117) — LinkedHashMap payload + `LineJson.response`.

---

### `bridge/.../Observers.java` extension (SceneBank observer — IF push needed)

**Analog:** same-file `wireTrackBank` (lines 154-175) — the canonical `bank.getItemAt(i).name().addValueObserver(cb)` + `AtomicBoolean skipFirstFire` pattern.

**Core pattern** (lines 163-174):

```java
for (int i = 0; i < bankSize; i++) {
    final Track t = trackBank.getItemAt(i);     // getItemAt — non-deprecated (Pitfall 2)
    final int slot = i;
    final AtomicBoolean skip = new AtomicBoolean(true);
    t.name().addValueObserver((StringValueChangedCallback) (String name) -> {
        if (skip.getAndSet(false)) { return; }
        bankTrackNames.put(slot, name);
        // ... offer event
    });
}
```

For P4 SceneBank: `sceneBank.getItemAt(i).name().addValueObserver(...)` — `Scene.name()` returns `SettableStringValue` (non-deprecated; `getName()` is the deprecated form — research Javadoc scan). For slot hasContent: `slotBank.addHasContentObserver((slotIdx, hasContent) -> ...)` — `IndexedBooleanValueChangedCallback`.

**NOTE:** D-01 is pull-only — observers are OPTIONAL (only if a future refresh-trigger wants push). The 5-event protocol enum MUST NOT grow (research Pitfall 6 — `event.schema.json` stays at 5 entries; `OBSERVATIONAL_EVENT_TYPES` in `dispatcher.ts` stays unchanged).

---

### `bridge/.../BridgeExtension.java` extension (init() createSceneBank)

**Analog:** same-file `init()` lines 64-75 (the existing cursor triple + TrackBank + observers.register wiring).

**Add alongside line 70** (`host.createTrackBank(BANK_SIZE, 0, 0)`):

```java
final TrackBank trackBank = host.createTrackBank(BANK_SIZE, 0, 0);
// NEW — D-01 probe target (research §Probe Recipe):
final SceneBank sceneBank = host.createSceneBank(SCENE_COUNT);  // SceneBank.html VERIFIED
// (optionally) host.createMainTrackBank(BANK_SIZE, 0, SCENE_COUNT) — open question 2 in research
```

Pass `sceneBank` into `observers.register(...)` (extend the signature) and into the `LauncherGridWalker` ctor. The `startConnector(cursorClip)` call at line 80 gains `sceneBank` (or the walker is constructed inside `init()` and passed via the connector). **Loopback-only invariant** (line 34 `LOOPBACK = "127.0.0.1"`, Pitfall 5) is unchanged — no new listener.

---

### `bridge/.../ClipSid.java` extension (`derive(trackSid, loopBeats, sceneIdx)` overload)

**Analog:** same-file `derive(trackSid, loopBeats)` (lines 65-81).

```java
// Existing (lines 65-81):
public static String derive(final String trackSid, final double loopBeats) {
    final String input = trackSid + ":" + loopBeats;
    try {
        final byte[] hash = MessageDigest.getInstance("SHA-256")
                .digest(input.getBytes(StandardCharsets.UTF_8));
        final String hex = HexFormat.of().formatHex(hash).substring(0, 16);
        return "clip_" + hex;
    } catch (final Exception e) { return "clip_0000000000000000"; }
}

// NEW overload (D-12 — disambiguate same-track-same-length grid clips via sceneIdx):
public static String derive(final String trackSid, final double loopBeats, final int sceneIdx) {
    return derive(trackSid + ":s" + sceneIdx, loopBeats);  // reuse the hash
}
```

Output stays `^clip_[0-9a-f]{16}$` (the STATE-04 family pattern enforced at `project-state.schema.json:63`). Pure static helper (no Bitwig import → JUnit-testable from a plain run — see lines 22-25).

---

### `daemon/src/transforms/scene-features.ts` (utility, pure feature extraction)

**Analog:** `daemon/src/transforms/motif-signature.ts` `motifSignature()` (lines 68-107) — the canonical "compute a feature vector from a Note[]" pattern. The PCP loop (lines 76-81) is the direct template for the scene's 12-bin pitch-class profile; the density computation (lines 102-104) is the template for noteDensity.

**Imports pattern** — copy `motif-signature.ts:19-25`:

```typescript
import type { Note } from "../cli/diff-logic.js";  // canonical Note shape (NEVER redefine)
// NodeNext ESM .js rule — every relative import ends in .js
```

**Core pattern — PCP + density** (copy `motif-signature.ts:76-104`):

```typescript
// PCP: velocity × length weighted, 12-bin, divide-by-zero guarded
const pcpRaw = new Array(12).fill(0);
for (const n of notes) pcpRaw[n.pitch % 12] += n.velocity * n.length;
const pcpSum = pcpRaw.reduce((a, b) => a + b, 0) || 1;   // INV-6 zero guard
const pcp = pcpRaw.map((v) => v / pcpSum);

// Density: notes / span
const span = sorted.length > 1 ? sorted[sorted.length - 1].start - sorted[0].start : 1;
const density = rhythmNotes.length / Math.max(span, 0.25);
```

**Pure-module discipline** — copy `motif-signature.ts:16-18` ("PURE module: no fs/net imports... documented interfaces, @example, NO side effects"). Exported `SceneFeatures` interface + `sceneFeatureVector(column: SceneColumn): SceneFeatures`. Add `normalized: number[]` field (L2-normalized concatenation for cosine similarity downstream).

**Testing analog:** `daemon/src/transforms/motif-signature.test.ts` — unit + fast-check property tests; INV-6 finite-fields invariant.

---

### `daemon/src/transforms/self-similarity.ts` (utility, pure matrix)

**Analog:** `daemon/src/transforms/motif-signature.ts` `cosine()` (lines 136-147) + `motifSimilarity()` (lines 128-133).

**Core pattern** (lines 128-147 — copy verbatim, this is the exact cosine-to-[0,1] remap P4 needs):

```typescript
// motif-signature.ts:128-133 — the similarity shape
export function motifSimilarity(a: MotifSignature, b: MotifSignature): number {
    const cos = cosine(a.pcp, b.pcp);     // ∈ [-1, 1]
    const pcpSim = (cos + 1) / 2;         // ∈ [0, 1]   ← THIS remap
    // ...
}

// motif-signature.ts:136-147 — the cosine implementation (zero-magnitude → 0, not NaN)
function cosine(u: number[], v: number[]): number {
    let dot = 0, magU = 0, magV = 0;
    for (let i = 0; i < u.length; i++) {
        dot += u[i] * v[i];
        magU += u[i] ** 2;
        magV += u[i] ** 2;
    }
    const denom = Math.sqrt(magU) * Math.sqrt(magV);
    return denom === 0 ? 0 : dot / denom;
}
```

`selfSimilarityMatrix(features: SceneFeatures[]): number[][]` builds the n×n symmetric matrix; `cosineAffinity(u, v)` is the per-pair helper. **Pure module** (no I/O). Research §Pattern 2 + Code Examples lines 688-704 give the full sketch.

---

### `daemon/src/transforms/section-detector.ts` (service Analyzer + utility clustering)

**Analog (Analyzer wrapper):** `daemon/src/transforms/motif-signature.ts` `MotifSignatureAnalyzer` (lines 170-193).

**Analyzer-plugin pattern** — copy `motif-signature.ts:170-193`:

```typescript
export const MotifSignatureAnalyzer: Analyzer = {
    id: "motifs",
    consumes: ["clips"],
    produces: ["motifs"],
    analyze(raw: RawState, _ctx: AnalyzeContext): DerivedField[] {
        const notes = extractNotes(raw);
        if (notes.length === 0) return [];   // REFUSE — no clip notes, no guess
        const signature = motifSignature(notes);
        return [{
            field: "motifs",
            value: signature,
            confidence: 1.0,                  // honest confidence ∈ [0,1]
            assumptions: [
                { claim: "motif signature computed from clip notes (PCP + IOI + density)",
                  confidence: 1.0, source: "default" },
            ],
        }];
    },
};
```

For P4: `id: "sections"`, `consumes: ["clips"]` (the launcher-grid snapshot mirror), `produces: ["sections"]`, with the refuse-on-empty-grid guard (`if (!grid || grid.scenes.length === 0) return [];`). **Do NOT pre-floor confidence** — emit honest ∈ [0,1]; `runAll` drops < 0.5 (research Pitfall 4). The pure clustering (`agglomerativeBoundaries`) lives in the SAME file or a sibling pure helper; the Analyzer wrapper calls it.

**Imports** — copy `motif-signature.ts:20-25` (the type-only import from analyzer-registry):

```typescript
import type { Analyzer, AnalyzeContext, DerivedField, RawState } from "../state/analyzer-registry.js";
```

**Clustering algorithm (No direct analog — hand-rolled per research D-14):** Ward-style agglomerative restricted to adjacent clusters, ~50 lines. The `argmax`-over-rotations loop shape in `harmonic-detect.ts:99-116` is the closest structural analog (iterative best-merge tracking).

**Refuse-below-threshold pattern** — copy `harmonic-detect.ts:82-129` (the `if (bestR > CORRELATION_FLOOR) ... else return null;` discipline). For P4: `minSimilarity=0.6` (research D-14) is the merge floor; `CONFIDENCE_THRESHOLD=0.5` (inherited from `runAll`) is the emit floor.

---

### `daemon/src/transforms/repetition-report.ts` (service Analyzer + utility union-find)

**Analyzer wrapper analog:** same as section-detector — `motif-signature.ts:170-193`. `id: "repetition"`, `produces: ["repetition"]`.

**Algorithm (No direct analog — hand-rolled union-find per research D-15):** transitive closure over the affinity matrix above profile threshold. ~30 lines. Singleton groups filtered (a group of one is NOT a repetition). `matchedOn` per-pair feature dims. Pure module.

The output shape `RepetitionCluster[]` (`{group, similarity, matchedOn}`) is research-defined (RESEARCH.md lines 741-756).

---

### `daemon/src/transforms/energy-curve.ts` (service Analyzer + utility composite)

**Analyzer wrapper analog:** `motif-signature.ts:170-193`. `id: "energyCurve"`, `produces: ["energyCurve"]`.

**Composite + normalize** — the weighted-sum + normalize-against-peak pattern (research lines 775-789). Weights come from `ctx.profile.energyWeights` (the new profile field — see profile assignment below). The `normalizeAgainstPeak` helper divides by `Math.max(...values, 1e-9)` (zero-guard, mirrors `motif-signature.ts:80` `|| 1` pattern).

Pure module. **No label-mixing** (research anti-pattern — D-05 weights + D-07 labels are independent profile fields).

---

### `daemon/src/transforms/track-role-classifier.ts` (service Analyzer + utility template match)

**Analyzer wrapper analog:** `motif-signature.ts:170-193`. `id: "trackRoles"`, `produces: ["trackRoles"]`.

**Similarity scoring (weighted cosine + argmax)** — the `cosine()` from `motif-signature.ts:136-147` (again) + the argmax-over-templates loop shape from `harmonic-detect.ts:99-116` (track best score + best template). Research D-18: weights `[0.4, 0.4, 0.2]` over `[register-masked, rhythmProfile, velocityProfile-3-vector]`. Register-window mask is the key novelty (kick template only "sees" C1-E1).

**Output shape** — research D-09 / lines 812-827: `RoleClassification` `{trackSid, role, confidence, alternatives[]}`. Below `template.minConfidence` → `role:"unknown"` (refuse, with assumption surfaced). `alternatives` sorted desc.

---

### `daemon/src/transforms/transition-suggest.ts` (utility, pure observation generator)

**Analog:** `daemon/src/transforms/harmonic-detect.ts` — the refuse-returns-null discipline (lines 82-129) and the "structured output OR null" pattern.

**Imports discipline** — copy `harmonic-detect.ts:17-20`:

```typescript
// PURE module: no fs/net imports. tonal is used for LOOKUP-only materialization.
import type { Note } from "../cli/diff-logic.js";
```

**Output shape (research Pitfall 5 / D-10):** `{kind:"energy_drop"|"repetition_gap", from:{scene,label,energy}, to:{scene,label,energy}, delta, assumptions[], manualHint}`. **NO `patchId`, NO `operations[]`, NO `risk` field** — D-10 advisory-only. The test file asserts no `../patch/*` imports (research Pitfall 5 warning sign).

Pure function: `suggestTransitions(sections, energyCurve, repetition): TransitionObservation[]`. Consumes the outputs of section-detector + energy-curve + repetition-report.

---

### `daemon/src/state/arrangement-snapshot.ts` (store/model, file-I/O)

**Analog:** `daemon/src/state/intent-store.ts` (FULL file, 73 lines — the atomic validated read pattern) + `daemon/src/store/atomic-write.ts` (the POSIX-rename write primitive).

**Imports pattern** — copy `intent-store.ts:17-20`:

```typescript
import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";   // Named import + .js (AGENTS.md Ajv quirk)
// For P4 the snapshot schema is daemon-internal (D-13) — inline JSON Schema object, NOT a /schemas/ import
import type { ArrangementSnapshot } from "./arrangement-snapshot.js";  // (self-type)
```

**Ajv compile-once pattern** — copy `intent-store.ts:25-27`:

```typescript
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(snapshotSchema);                       // the inline daemon-internal schema
const validateSnapshot = ajv.getSchema(snapshotSchema.$id)!;
```

**ENOENT → null; other errors propagate** — copy `intent-store.ts:48-59`:

```typescript
export async function loadArrangementSnapshot(path: string): Promise<ArrangementSnapshot | null> {
    let text: string;
    try { text = await readFile(path, "utf8"); }
    catch (err: unknown) {
        // Absent file → null (D-09 no inference; D-13 absent snapshot is valid)
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { throw new Error(`arrangement-snapshot.json invalid: not valid JSON (${path})`); }
    if (!validateSnapshot(parsed)) {
        throw new Error(`arrangement-snapshot.json invalid: ${JSON.stringify(validateSnapshot.errors)}`);
    }
    return parsed as ArrangementSnapshot;
}
```

**Atomic save** — copy `intent-store.ts` shape but ADD a write path (intent-store is read-only in M1; P4 snapshot needs both). Use `atomic-write.ts:45-53`:

```typescript
import { atomicWriteJson } from "../store/atomic-write.js";
export async function saveArrangementSnapshot(path: string, snap: ArrangementSnapshot): Promise<void> {
    await atomicWriteJson(path, snap);   // temp+rename, same filesystem (Pitfall 4)
}
```

**Schema location (D-13):** the snapshot schema lives INLINE in this file (daemon-internal TS interface + standalone-compiled Ajv schema). NOT under `schemas/` (that dir is cross-language; the snapshot never crosses the wire). The inline schema must avoid `format:` keywords (AGENTS.md — `addFormats` deliberately NOT used).

---

### `daemon/src/state/roles-store.ts` (store/model, file-I/O)

**Analog:** `daemon/src/state/intent-store.ts` (FULL file) + `atomic-write.ts`. **Mirror `arrangement-snapshot.ts` exactly** (above) — same imports, same ENOENT→null, same Ajv compile-once, same atomic save. The `roles.json` shape is research D-09 (lines 829-856):

```json
{ "version": "1.0", "classifiedAt": "<ISO>", "profile": "techno",
  "tracks": { "trk_abc...": { "role": "kick", "confidence": 0.94, "alternatives": [...] } } }
```

The roles schema is also daemon-internal (D-13 sibling). Atomic write mandatory (ARRANGE-05 gates Phase 5).

---

### `daemon/src/state/analyzer-registry.ts` extension (DerivedFieldName + M3_ANALYZERS)

**Analog:** same-file `M2_ANALYZERS` (lines 162-170) — the documented extension point.

**Extend `DerivedFieldName`** (lines 31-37):

```typescript
export type DerivedFieldName =
    | "sections"
    | "trackRoles"
    | "motifs"
    | "energyCurve"
    | "automationSalience"
    | "intent"
    | "repetition";   // NEW — D-21 (the only addition; sections/trackRoles/energyCurve already reserved)
```

**Add `M3_ANALYZERS`** (after line 170):

```typescript
import { SectionDetector } from "../transforms/section-detector.js";
import { RepetitionReport } from "../transforms/repetition-report.js";
import { EnergyCurve } from "../transforms/energy-curve.js";
import { TrackRoleClassifier } from "../transforms/track-role-classifier.js";

export const M3_ANALYZERS: readonly Analyzer[] = [...M2_ANALYZERS, SectionDetector, RepetitionReport, EnergyCurve, TrackRoleClassifier];
```

**Import direction** (one-way, no cycle) — copy the precedent at `analyzer-registry.ts:18-21` (M2 imports `MotifSignatureAnalyzer` from `transforms/motif-signature.ts`, which imports TYPE-ONLY back — `import type { Analyzer } from "../state/analyzer-registry.js"`). P4's four analyzer modules follow the same type-only-back pattern.

`runAll` (lines 114-125) + `CONFIDENCE_THRESHOLD = 0.5` (line 92) are UNCHANGED — the gate applies to the new analyzers for free.

---

### `daemon/src/state/describe.ts` extension (section slot reads from snapshot)

**Analog:** same-file `nameForSid` lookup (lines 93-104) — the canonical "look up a name for a sid in an open-object array" pattern + `SECTION_RESERVED` constant (line 60).

**Replace** the `section: SECTION_RESERVED` literal at line 211 with a snapshot lookup:

```typescript
// P4: read from the arrangement snapshot's derived.sections, find the section
// covering state.selection.sceneIdx (or the currentlyPlaying scene). Below
// threshold / no snapshot → SECTION_RESERVED (unchanged fallback).
const sectionLabel = lookupSectionLabel(snapshot, state.selection.sceneIdx);
// stateBlock.section = sectionLabel ?? SECTION_RESERVED;
```

**Pitfall 7 hard rule (unchanged):** describe() NEVER claims sections until the snapshot is fresh + the section cleared `runAll`'s threshold gate. The lookup returns `SECTION_RESERVED` on any absence (no fabrication).

---

### `daemon/src/query/query-server.ts` extension (arrange.* op handlers)

**Analog:** same-file `LIVE_OPS` set (lines 65-81) + `prepareMidiDispatch` shared-preamble (lines 957-1000) + `handleMidiVary` (lines 1010-1073).

**Extend `LIVE_OPS`** (add entries additively, lines 65-81):

```typescript
const LIVE_OPS = new Set([
    // ... existing ...
    "arrange.sections",
    "arrange.repetition_report",
    "arrange.energy_curve",
    "arrange.review",
    "arrange.current_section",
    "arrange.refresh",
]);
```

**Dispatch shape** — copy the `if (op === "midi.vary") { void handleMidiVary(...); return; }` block (lines 287-302). Add a sibling block:

```typescript
if (op === "arrange.sections") { void handleArrangeSections(deps, state, intent, freshness, msg); return; }
if (op === "arrange.refresh")  { void handleArrangeRefresh(deps, state, intent, freshness); return; }
// ... etc for repetition_report / energy_curve / review / current_section
```

**Shared preamble** — copy `prepareMidiDispatch` (lines 957-1000) shape: watchdog gate (`freshness === "disconnected"` → `safeSendErr`), load snapshot (or pull-then-load if `--refresh`), load profile, build assumptions[]. The `arrange.refresh` op triggers `correlator.send("get.launcher_clips")` then `runAll` then snapshot save (research integration-points table).

**`safeSendOk` / `safeSendErr`** — reuse the existing helpers (lines 832-886). `safeSendErr` carries `details?` for structured failures (the `wrong_clip_targeted` shape at lines 870-882 is the template — P4 transitions use the same `{...,hint}` shape if needed).

**Bridge pull callback** — add `pullLauncherGrid?: () => Promise<unknown>` to `QueryServerDeps` (lines 84-128), mirroring `pullSelectedClip` (lines 102-107). Wire in `boot.ts` as `correlator.send("get.launcher_clips")`.

---

### `daemon/src/cli/commands/arrange.ts` (REPLACE stub with multicall)

**Analog:** `daemon/src/cli/commands/midi.ts` (FULL file, 113 lines) — the documented exact mirror.

**Imports** — copy `midi.ts:18-19`:

```typescript
import { program } from "commander";
import { query } from "../query-client.js";
```

**Subcommand shape** — copy `midi.ts:40-52` (the `inspect` subcommand) for each of the six `bw-arrange` subcommands (research D-20):

```typescript
program.name("bw-arrange").description("Arrangement intelligence (M3)");

program.command("sections")
    .description("Bottom-up scene segmentation with confidence (ARRANGE-01)")
    .option("--refresh", "re-pull the launcher grid before analysis")
    .option("--explain", "pretty-print JSON (2-space indent)")
    .action(async (opts: { refresh?: boolean; explain?: boolean }) => {
        try {
            const result = await query("arrange.sections", { refresh: opts.refresh ?? false });
            process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
        } catch (e) { printConnectionError((e as Error).message, opts.explain); }
    });
// ... repetition-report / energy-curve / review / current-section / refresh follow the same shape
program.parse(process.argv);
```

**Connection-error stub** — copy `midi.ts:25-34` `printConnectionError` verbatim (the disconnected envelope with `stateFreshness:"disconnected"`). The `--explain` flag discipline + exit-0-on-error (so shell pipelines can grep) carries over.

**REMOVE** the `emitStub` import (current `arrange.ts:9` — the M1 stub at `stubs.ts:35-45` is no longer used by this command; `bw-automation` still uses it).

---

### `daemon/src/runtime/boot.ts` extension (refreshSnapshot pulls get.launcher_clips)

**Analog:** same-file `refreshSnapshot` (lines 177-229) — the existing best-effort `get.selected_clip` block at lines 213-223 is the EXACT template for the new `get.launcher_clips` block.

**Add after line 223** (sibling best-effort pull):

```typescript
// P4 D-19: best-effort launcher-grid pull on (re)connect. Failure does NOT
// block daemon startup (the snapshot populates lazily on bw-arrange refresh).
try {
    const gridResp = (await correlator.send("get.launcher_clips")) as { tracks?: unknown[] };
    if (Array.isArray(gridResp.tracks)) {
        await saveArrangementSnapshot(arrangementSnapshotPath, {
            version: "1.0", pulledAt: new Date().toISOString(),
            sceneCount: gridResp.tracks[0]?.scenes?.length ?? 0,
            trackCount: gridResp.tracks.length, grid: gridResp, derived: {},
        });
    }
} catch (e) {
    console.error("[boot] get.launcher_clips pull failed:", (e as Error).message);
}
```

**Add path constant** alongside `DEFAULT_INTENT_PATH` (line 70):

```typescript
export const DEFAULT_ARRANGEMENT_SNAPSHOT_PATH: string =
    join(process.cwd(), ".bw-brain", "arrangement-snapshot.json");
export const DEFAULT_ROLES_PATH: string =
    join(process.cwd(), ".bw-brain", "roles.json");
```

**Wire the query-server dep** — add `pullLauncherGrid` to the `startQueryServer({...})` call (lines 308-318):

```typescript
pullLauncherGrid: () => correlator.send("get.launcher_clips"),
```

(mirrors `pullSelectedClip` at line 314). **No new transport, no new listener** — the bridge TCP 7878 stays bridge-only (Pitfall 5).

---

### `daemon/src/profiles/generic.json` + `techno.json` extension

**Analog:** the existing files (FULL — generic.json 22 lines, techno.json 9 lines with `"extends": "generic"`).

**Add three fields** to `generic.json` (research lines 1054-1076):

```jsonc
{
    // ... existing name/thresholds/velocityHumanize/timingHumanize/roleSalience/preferredScales/strongBeatGrid ...
    "energyWeights": { "noteDensity": 0.35, "velocityAggregate": 0.25, "polyphony": 0.20, "pitchCentroid": 0.20 },
    "sectionLabels": [
        { "label": "intro",     "position": "start",  "energyRange": [0.0, 0.4] },
        { "label": "build",     "position": "any",    "energyRange": [0.3, 0.7] },
        { "label": "peak",      "position": "middle", "energyRange": [0.7, 1.0] },
        { "label": "breakdown", "position": "any",    "energyRange": [0.2, 0.5] },
        { "label": "outro",     "position": "end",    "energyRange": [0.0, 0.4] }
    ],
    "roleTemplates": [ /* kick/bass/lead/pad/hats/percussion/fx — research lines 1066-1074 */ ]
}
```

**`techno.json`** adds the same three fields with techno-specific values (research lines 1078-1093 — `drop`/`break`/`roll` labels, tighter kick/bass register windows). `extends:"generic"` preserved — `profile-loader.ts:117-137` `mergeProfiles` deep-merges per-key (object fields merge, arrays/scalars replace).

**The merge behavior** is load-bearing: P4's new object-valued fields (`energyWeights`) merge per-key (techno can override just `noteDensity`); array fields (`sectionLabels`/`roleTemplates`) REPLACE wholesale (techno's labels are the complete techno vocabulary, not appended to generic). The existing `mergeProfiles` (lines 117-137) already handles this — but it's hardcoded to the existing field list. **P4 extends `mergeProfiles`** to include the three new object-valued fields:

```typescript
// profile-loader.ts:125-135 — extend the spread:
const merged = {
    ...parent, ...child,
    thresholds: { ...parent.thresholds, ...child.thresholds },
    velocityHumanize: { ...parent.velocityHumanize, ...child.velocityHumanize },
    timingHumanize: { ...parent.timingHumanize, ...child.timingHumanize },
    roleSalience: { ...parent.roleSalience, ...child.roleSalience },
    energyWeights: { ...parent.energyWeights, ...child.energyWeights },   // NEW
    // Arrays replace: sectionLabels + roleTemplates (like preferredScales/strongBeatGrid)
    sectionLabels: child.sectionLabels ?? parent.sectionLabels,            // NEW
    roleTemplates: child.roleTemplates ?? parent.roleTemplates,           // NEW
    preferredScales: child.preferredScales ?? parent.preferredScales,
    strongBeatGrid: child.strongBeatGrid ?? parent.strongBeatGrid,
};
```

**ARCH-02 invariant:** all three new fields OPTIONAL — generic core runs literally if they're absent. The `Profile` gen type (`daemon/src/gen/profile.ts`, regenerated via `scripts/gen-types.mjs` after the schema extension) gains them as optional.

---

### `schemas/protocol/request.schema.json` extension (additive enum)

**Analog:** same-file `type.enum` (line 17).

```json
"type": {
    "type": "string",
    "enum": ["get.selected_clip", "get.selected_device_chain", "get.project_summary", "get.launcher_clips"]
}
```

One enum entry. Additive — no envelope change, no new event type (research Pitfall 6 / D-01 pull-only). After edit, run `node scripts/gen-types.mjs` (the `$id`-aware JSON-Schema→TS bundler — CONTEXT.md `code_context` line 123) to regenerate `daemon/src/gen/request.ts`.

---

### `schemas/cli-query/query.schema.json` extension (additive enum)

**Analog:** same-file `op.enum` (lines 22-37).

```json
"op": {
    "type": "string",
    "enum": [
        // ... existing 13 entries ...
        "arrange.sections", "arrange.repetition_report", "arrange.energy_curve",
        "arrange.review", "arrange.current_section", "arrange.refresh"
    ]
}
```

Six additive entries (research D-20). Regenerate `daemon/src/gen/query.ts`.

---

### `schemas/profile.schema.json` extension (additive property blocks)

**Analog:** same-file structure — the existing `additionalProperties: false` (line 9) + per-field blocks (e.g. `roleSalience` lines 52-56, `preferredScales` lines 57-61). Research lines 996-1051 give the EXACT JSON Schema blocks to add:

- `energyWeights` — object, `additionalProperties:false`, `required:[noteDensity, velocityAggregate, polyphony, pitchCentroid]`, each `type:number minimum:0 maximum:1`. Add a `sum:1.0` constraint via a custom `allOf`/`if-then` (or document in `$comment` — Ajv 2020-12 has no native sum constraint; the daemon validates at load).
- `sectionLabels` — array of `{label, position, energyRange}` objects (research lines 1012-1025).
- `roleTemplates` — array of `{role, registerLow, registerHigh, rhythmProfile, velocityProfile, minConfidence?}` objects (research lines 1026-1051).

All three are OPTIONAL fields (ARCH-02 — generic core runs without them). Regenerate `daemon/src/gen/profile.ts`.

---

### `schemas/project-state.schema.json` extension (tighten tracks/clips)

**Analog:** same-file `tracks`/`clips` items (lines 81-90 — currently `"items": { "type": "object" }`, explicitly awaiting shape-tightening per the `$comment` at line 84 / line 89).

P4 reconciles the clip/scene/grid shape against the launcher-enumeration model. The tightened `clips` items would carry `{sid?, name?, pitch?, start?, length?, velocity?}` (the Note-shaped entries `motif-signature.ts:201-225` `extractNotes` already narrows to). **Conservative approach:** leave open `{type:object}` and document the launcher-grid clip shape in the snapshot's daemon-internal schema (D-13) — the project-state clips array stays the cursor-clip cache. **Aggressive approach:** tighten to the Note shape. The planner picks per the in-app probe outcome.

`automation` field (lines 96-101) STAYS `maxItems:0` — Phase 5.

---

### `pi-pack/skills/review/SKILL.md` (NEW — Pi skill)

**Analog:** `pi-pack/skills/vary/SKILL.md` (FULL, 63 lines — the shell-to-CLI + Hard rules + Freshness gate shape) + `pi-pack/skills/analyze/SKILL.md` (FULL, 46 lines — the assumptions[]-on-every-line discipline).

**Frontmatter** — copy `vary/SKILL.md:1-6`:

```yaml
---
name: review
description: Run bw-arrange review on the current project and render an ASCII section timeline + unicode energy sparkline + repetition clusters + transition observations.
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["bw-arrange"]}}}
---
```

**Steps** — mirror `vary/SKILL.md:18-40`:

1. Run `bw-arrange review --json` to get `{sections[], energyCurve[], repetition[], transition-observations[], pulledAt}`.
2. Render the text block (research lines 900-922 — ASCII timeline + sparkline + clusters + transitions).
3. Tell the user the follow-ups (`bw-arrange refresh` if stale; `bw-arrange sections --explain` for detail).

**Hard rules** — copy `vary/SKILL.md:42-53` discipline + `analyze/SKILL.md:41-46` (Pitfall 7 — every claim carries assumptions[]):

- EVERY output line carries its grounding (the `pulledAt` timestamp is in every `/review` as an assumption — research Pitfall 8).
- Shell to `bw-arrange` ONLY. Never emit the daemon wire protocol (T-3-22).
- Transition observations are ADVISORY (D-10) — never auto-apply; the producer acts manually in Bitwig.
- DO NOT invent section labels the daemon didn't return (Pitfall 7 — the analyzer gate is the contract).

**Freshness gate** — copy `vary/SKILL.md:54-63` verbatim (live + stale trustworthy; disconnected = hard refusal). The daemon's `stateFreshness` field drives this.

---

### `pi-pack/skills/review/skill.test.ts` (NEW — contract test)

**Analog:** `pi-pack/skills/vary/skill.test.ts` (FULL, 111 lines — the structural contract test pattern).

**Imports + parser** — copy `vary/skill.test.ts:15-53` verbatim (`parseSkillDoc` minimal YAML frontmatter parser; no yaml dependency).

**Contract assertions** — mirror `vary/skill.test.ts:55-110`:

```typescript
describe("/review SKILL.md contract (UX-03 / D-11)", () => {
    it("declares name: review", () => { expect(frontmatter.name).toBe("review"); });
    it("is user-invocable", () => { expect(frontmatter["user-invocable"]).toBe(true); });
    it("requires the bw-arrange bin (shells to the CLI — T-3-22)", () => {
        const meta = frontmatter.metadata as { openclaw: { requires: { bins: string[] } } };
        expect(meta?.openclaw?.requires?.bins).toEqual(expect.arrayContaining(["bw-arrange"]));
    });
    it("references `bw-arrange review` in its Steps", () => { expect(body).toContain("bw-arrange review"); });
    it("has a Hard rules section", () => { expect(body).toMatch(/Hard rules/); });
    it("does NOT teach Pi the JSON-Lines wire protocol (T-3-22)", () => {
        expect(body).not.toMatch(/127\.0\.0\.1:7878/);
        expect(body.toLowerCase()).not.toContain("json-lines");
        expect(body).not.toMatch(/\bapply\.patch\b/);
    });
    it("states live AND stale are trustworthy (D-10 relaxed gate)", () => {
        expect(body).toMatch(/stale.*trustworthy|trustworthy.*stale/i);
        expect(body).toMatch(/disconnected.*refus|refus.*disconnected/i);
    });
    it("surfaces pulledAt as an assumption (Pitfall 8 — snap-stale defense)", () => {
        expect(body.toLowerCase()).toContain("pulledat");
    });
    it("forbids auto-applying transition observations (D-10 advisory)", () => {
        expect(body).toMatch(/advisory|manual/i);
    });
});
```

**Test runner coverage** — the `daemon/vitest.config.ts` `include` glob already covers `../pi-pack/skills/**/*.test.ts` (BLOCKER-02 — research line 116). No config change needed.

---

### Companion test files (`*.test.ts` × 9 + analyzer-registry.test.ts extend)

**Analog (pure-function property tests):** `daemon/src/transforms/motif-signature.test.ts` + `harmonic-detect.test.ts`.

**Analog (atomicity round-trip):** `daemon/src/state/intent-store.test.ts` + `daemon/src/store/atomic-write.test.ts` (the N=20-parallel property test pattern).

**Analog (registry refuse-below-threshold):** `daemon/src/state/analyzer-registry.test.ts` — extend the existing `runAll` drop test with M3 analyzers (emit confidence 0.4 → dropped).

**Property-test shape** — research lines 1286-1337 give the four fast-check properties verbatim (refuse-below-threshold, self-similarity symmetric + diagonal=1, union-find disjointness, energy-curve peak=1). Use `fast-check` 4.8.0 (already in devDeps).

---

## Shared Patterns

### Authentication / Access Control (loopback-only)

**Source:** `bridge/.../BridgeExtension.java:34` (`LOOPBACK = "127.0.0.1"`) + `daemon/src/runtime/boot.ts:148` (`new TcpServerTransport({ port: tcpPort })` — constructor-enforced loopback).

**Apply to:** ALL bridge + daemon additions. P4 adds NO new listener, NO new socket, NO new transport. The `get.launcher_clips` request rides the existing bridge TCP 7878; the `arrange.*` ops ride the existing UDS `~/.bw-brain/daemon.sock` (mode 0o600, Pitfall 5).

```java
// BridgeExtension.java:34 — the loopback constant (Pitfall 5)
static final String LOOPBACK = "127.0.0.1";
static final int PORT = 7878;
```

### Validate at Every Boundary (Ajv-at-boundary)

**Source:** `daemon/src/state/intent-store.ts:25-27, 68-70` (Ajv compile-once + validate-on-read) + `daemon/src/query/query-server.ts:59-62, 226-230` (validate-query-at-dispatch).

**Apply to:**
- `get.launcher_clips` REQUEST: validated against the extended `request.schema.json` enum at the bridge boundary (the daemon's `correlator.send` shapes it; the bridge `PullHandlers.handle` reads `type` defensively — line 161).
- `get.launcher_clips` RESPONSE: validated defensively at the daemon boundary via the snapshot's standalone-compiled Ajv schema (D-13).
- `arrange.*` queries: validated against the extended `query.schema.json` enum (the existing `validateQuery` at `query-server.ts:227`).
- `arrangement-snapshot.json` + `roles.json` reads: validated at load (the intent-store pattern).

```typescript
// intent-store.ts:25-27 — the compile-once pattern (AGENTS.md 64-65 standalone-compiled)
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(snapshotSchema);
const validateSnapshot = ajv.getSchema(snapshotSchema.$id)!;
```

**Ajv quirk (AGENTS.md):** `import { Ajv2020 } from "ajv/dist/2020.js"` — named import + `.js` extension (NodeNext ESM; ajv 8.20 ships no exports map). **`addFormats` deliberately NOT used** — no frozen schema uses `format:`; the new snapshot/roles/profile schemas must use plain `type:`/`pattern:`/`enum`, NOT `format:` (research anti-pattern + AGENTS.md).

### Atomic Durable Write (POSIX rename)

**Source:** `daemon/src/store/atomic-write.ts:45-53` (`atomicWriteJson`).

**Apply to:** EVERY durable write — `arrangement-snapshot.json` (D-03), `roles.json` (ARRANGE-05). NO exceptions (research Pitfall 4).

```typescript
// atomic-write.ts:45-53 — temp+rename on same filesystem
export async function atomicWriteJson(path: string, data: unknown): Promise<void> {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
    const serialized = JSON.stringify(data, null, 2);
    await writeFile(tmp, serialized, "utf8");
    await rename(tmp, path);   // atomic on POSIX, same filesystem
}
```

### Pure-Function + I/O Split

**Source:** `daemon/src/transforms/motif-signature.ts:16-18` ("PURE module: no fs/net imports... documented interfaces, @example, NO side effects") + `harmonic-detect.ts:17-18`.

**Apply to:** ALL seven new transform modules (`scene-features`, `self-similarity`, `section-detector`, `repetition-report`, `energy-curve`, `track-role-classifier`, `transition-suggest`). Pure = trivially property-testable + composable. I/O-bound wiring (boot/query-server/CLI) lives in separate files. **Transition-suggest MUST NOT import `../patch/*`** (research Pitfall 5 — D-10 advisory-only; the test asserts this).

### Refuse-Below-Threshold (the recurring stance)

**Source:** `daemon/src/state/analyzer-registry.ts:92` (`CONFIDENCE_THRESHOLD = 0.5`) + `runAll` lines 114-125 (drops < 0.5) + `harmonic-detect.ts:42, 125` (`CORRELATION_FLOOR = 0.5; ... else return null`).

**Apply to:** ALL four new analyzers. **Do NOT pre-floor inside the analyzer** (research Pitfall 4 — analyzers emit honest ∈ [0,1]; `runAll` owns the floor). The `unknown` label / `null` return is the POST-drop representation, not a pre-drop one.

```typescript
// analyzer-registry.ts:114-125 — the gate (unchanged; applies to M3 for free)
runAll(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const out: DerivedField[] = [];
    for (const a of this.analyzers) {
        const fields = a.analyze(raw, ctx);
        for (const f of fields) {
            if (f.confidence >= CONFIDENCE_THRESHOLD) { out.push(f); }   // drop < 0.5
        }
    }
    return out;
}
```

### Assumptions[] on Every Claim (UX-06)

**Source:** `daemon/src/state/analyzer-registry.ts:43-50` (`Assumption` interface) + `daemon/src/state/describe.ts:278-303` (every Description carries assumptions[]) + `daemon/src/query/query-server.ts:186-206` (`liveAssumptions` / `NO_STATE_ASSUMPTIONS`).

**Apply to:** EVERY analyzer's `DerivedField[]` output (each carries `assumptions: Assumption[]`), every `arrange.*` query result (the `assumptions[]` field on `OkResult` — query-server.ts:137), and the `/review` skill output (every section label, energy point, repetition cluster, transition observation carries its grounding — including the `pulledAt` timestamp per research Pitfall 8).

```typescript
// analyzer-registry.ts:43-50 — the Assumption shape
export interface Assumption {
    claim: string;                                  // human-readable
    confidence: number;                             // ∈ [0,1]
    source: "selection" | "intent" | "config" | "default";
}
```

### NodeNext ESM `.js`-Import Rule

**Source:** AGENTS.md + `intent-store.ts:18` (`import ... from "ajv/dist/2020.js"`) + every daemon `.ts` file's relative imports.

**Apply to:** ALL daemon-side `.ts` edits. Every relative import ends in `.js` (NodeNext ESM requires it; TS 5.7+ resolves the `.ts` source). The four new analyzer modules import type-only back from `analyzer-registry.ts` — `import type { Analyzer } from "../state/analyzer-registry.js"` (mirrors `motif-signature.ts:20-25`).

### Profiles Enhance, Never Gate (ARCH-02)

**Source:** `daemon/src/profiles/profile-loader.ts:96-103` (`loadProfile` — no name → generic literal; INV-13) + `schemas/profile.schema.json:6` (`$comment` ARCH-01/02 contract).

**Apply to:** the three new profile fields (`energyWeights`/`sectionLabels`/`roleTemplates`). ALL OPTIONAL — generic core runs literally without them. The generic profile ships neutral-but-functional defaults; the techno profile is the first exercise of the enhancement surface.

### CLI Multicall Shape (subcommand → query → JSON envelope)

**Source:** `daemon/src/cli/commands/midi.ts` (FULL) + `daemon/src/cli/query-client.ts:77-129` (`query()` one-shot UDS client).

**Apply to:** `daemon/src/cli/commands/arrange.ts` (the stub replacement). Each subcommand: `program.command("...").option("--explain").action(async (opts) => { try { const result = await query("arrange.<op>", payload); process.stdout.write(JSON.stringify(result, null, opts.explain ? 2 : 0) + "\n"); } catch (e) { printConnectionError(...); } })`. The `query()` function (query-client.ts:77) handles the UDS round-trip + the `DaemonReplyError` (ok:false envelope) vs plain Error (socket absent) distinction.

### Bridge Stays Dumb (raw notes per clip; daemon derives all features)

**Source:** PROJECT.md guardrail + `PullHandlers.java:178-231` (`handleSelectedClip` returns raw `NoteView[]`; no musical reasoning in Java) + CONTEXT.md `code_context` line 134.

**Apply to:** `LauncherGridWalker.java` + the `get.launcher_clips` handler. The bridge returns raw `NoteView` per clip per cell (the same shape `enumerateNotes` produces). The daemon derives PCP/density/energy/roles from those raw notes. **No feature extraction in Java** — the bridge is a transport, not an analyzer.

---

## No Analog Found

| File | Role | Data Flow | Reason | Fallback (planner uses RESEARCH.md) |
|------|------|-----------|--------|-------------------------------------|
| `bridge/.../LauncherGridWalker.java` (the STATE MACHINE orchestration) | controller (state machine) | request-response | The cursor-walk *primitives* (`slot.select()`, `getLoopLength` observer, `enumerateNotes`) all have analogs in `PullHandlers.java` + `Observers.java`. But the *orchestration* — IDLE → SELECTING → AWAITING_LOOPLEN → DRAINING → ADVANCING → DONE, with per-cell timeout + observer-coalescing defense (Pitfall 1) + GUI-focus-jump caveat (Pitfall 7) — has NO existing analog. The bridge has never multiplexed the single cursor clip across N cells. | RESEARCH.md §Pattern 3 (lines 360-381) gives the state-machine sketch. The in-app Probe 3 (lines 605-619) is the trust-spine gate — the planner MUST make Probe 3 a `checkpoint:human-verify` task at the head of Wave 1 (mirrors Phase 1 Plan 03 / Phase 2 Plan 02-02 / Phase 03.1 Plan 02 patterns). DO NOT begin Wave 2 (analyzers) until Probe 3 passes. |
| `union-find` / `agglomerative Ward` (the clustering algorithms) | utility (algorithm) | transform | The codebase has no existing clustering code. Closest structural analog is `harmonic-detect.ts:99-116` (iterative best-merge argmax loop). | RESEARCH.md §Pattern 2 + Code Examples lines 686-756 + D-14/D-15. Hand-rolled ~80 lines combined (research D-07: scene counts O(10²); pulling `ml-kmeans` etc. is over-engineering). Property tests (research lines 1286-1326) cover symmetry, threshold semantics, disjointness. |

---

## Metadata

**Analog search scope:**
- `bridge/src/main/java/com/bwbrain/bridge/*.java` (7 files — all read)
- `daemon/src/state/*.ts` (12 files — analyzer-registry, intent-store, describe, fingerprint, stale-watchdog, reconcile + tests)
- `daemon/src/transforms/*.ts` (12 files — motif-signature, harmonic-detect, vary, counterline, voice-leading-fix, humanize + tests)
- `daemon/src/cli/commands/*.ts` (10 files — midi, arrange, edit, device, diff, project, focus, automation + tests)
- `daemon/src/cli/{query-client,stubs}.ts`
- `daemon/src/query/query-server.ts` (1 file, 1205 lines — full read)
- `daemon/src/runtime/boot.ts` (1 file, 480 lines — full read)
- `daemon/src/store/atomic-write.ts`
- `daemon/src/profiles/{generic,techno}.json` + `profile-loader.ts`
- `schemas/{protocol,cli-query}/*.json` + `profile.schema.json` + `project-state.schema.json` (relevant ones)
- `pi-pack/skills/{analyze,vary,diff,apply}/SKILL.md` + `vary/skill.test.ts`
- `.claude/AGENTS.md`

**Files scanned:** 38 source files + 6 schemas + 4 skill docs + AGENTS.md
**Pattern extraction date:** 2026-07-06
**Key insight:** Phase 4 is a **"wire up existing primitives"** phase, NOT a "build new infrastructure" phase (research line 448). The trust-spine (atomic-write, analyzer-registry, Ajv-at-boundary, CLI multicall, Pi skill shell-to-CLI, loopback-only) is built + battle-tested through M1/M2 + Phase 03.1. The novel work is concentrated in (1) the bridge cursor-walk state machine (the single highest-risk item, gated behind the in-app probe) and (2) five pure-TS analyzer functions (low-risk, property-tested). Everything else is additive extension of existing patterns.
