# Bitwig Control Surface API — Verified Capabilities

> **Status: PARTIALLY VERIFIED — SC#1 + SC#3 PROVEN LIVE.** This document is the
> PROBE-01 output (SC#2) — the design-ready input Phase 2's bridge work locks
> against.
>
> **What is now VERIFIED in-app (2026-06-26):** the highest-risk item — raw
> `java.net` TCP from the Bitwig extension JVM — is **CONFIRMED** via a live
> end-to-end `selection.changed` round-trip (see §Transport Decision). The JS
> control-surface `host` surface is characterized (no networking/file I/O). The
> API version + extension-packaging mechanism are confirmed. The **API surfaces**
> for Undo (no labelled-undo API → daemon-authoritative revert confirmed),
> Note-Editing (`NoteStep`-based + `PinnableCursorClip` present), and Stable-IDs
> (no native id/uuid/hash accessor → STATE-04 fingerprint-mapping required) are
> verified against the in-app Javadoc.
>
> **What remains TODO-in-app:** the **behavioral** half of the two D-01 DEEP
> probes — Undo coalescing timing + per-note-vs-batch undo step count (§1), and
> the live NoteStep round-trip / launcher-vs-arranger / free-beat-positioning
> (§2) — plus the Automation target envelope (§3). These need a running probe in
> Bitwig with a selected clip. They refine Phase 3 edit design but do NOT gate
> Phase 2 (read-only) and do NOT gate the now-confirmed transport.
>
> **Plan:** 01-schema-ipc-spike / 03.
> **Last updated:** 2026-06-26 (live SC#1 round-trip + Java extension pivot).

## Header — API version + JsApi surface (open questions A6 + A2)

- **Bitwig Studio installed:** 6.0.6.
- **Exact Control Surface API version exposed (A6):** **VERIFIED** — the in-app
  Javadoc at `Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/`
  references API versions up to **25**. An extension declaring
  `getRequiredAPIVersion() = 21` loaded and ran cleanly on this host. (Note: the
  in-app "scripting guide" is the **Java** control-surface API Javadoc
  `com.bitwig.extension.*` — there is no separate in-app JS scripting guide; the
  JS `host.*` surface is documented only via shipped example controller scripts.)
- **JsApi (JavaScript Controller Script) networking surface (A2):** **VERIFIED
  (unfavorable for JS)** — the JS control-surface `host` exposes **NO networking
  and NO file I/O**. The only `ControllerHost` methods touching outside-world
  state are `getPreferences()` / `getProject()` (settings/project objects, not
  files/sockets). `host.println` writes only to the in-app controller console
  (no disk log is produced). Consequence: the JS extension can probe capability
  surfaces but **cannot** carry the transport — see §Transport Decision.

---

## 1. Undo Behavior

**Priority:** D-01 — DEEP verify. Foundation of the daemon-authoritative revert
trust model (PROJECT.md). Every future edit and the entire revert path hinge on
what is recorded here; single-pass is not enough.

**Verified surface `[VERIFIED: in-app Javadoc 6.0.6]`:** `Application.undo()`,
`redo()`, `canUndo()` (BooleanValue), `canRedo()`, `undoAction()` /
`redoAction()` (return `HardwareActionBindable`). The DrivenByMoss framework
wraps these.

**Design questions the probe must answer (RESEARCH.md §Capability Probe Design
Questions, Probe 1):**
- Does `Application.undo()` / `redo()` exist on the JS (JsApi) surface too?
- Does ANY undo API accept a **label**? (seed.md + PROJECT.md assume
  `undoLabel`; the trust-spine schema requires it on every `apply.patch`.)
- Does the host **coalesce** consecutive edits on a time window (~1s)?
- Does adding notes create **one undo step per note** or **one per batch**?
  (Critical: if per-note, applying a 20-note patch = 20 undo steps the user
  must click through.)

**Probe recipe (DEEP — multi-step, per D-01):**
1. Add a note via `CursorClip`/`NoteStep` → invoke `Application.undo()` →
   observe one-step removal.
2. Add 5 notes in a tight loop → undo once → observe coalescing vs per-note.
3. (Already answered by surface scan — see Observed.)
Record timing + the exact host.println output.

**Observed:** **PARTIALLY VERIFIED.** Surface scan of `Application` (in-app
Javadoc 6.0.6) confirms undo/redo/canUndo/canRedo exist, and **there is NO
labelled-undo API** — no `undo(label)`, no `beginUndoTask(name)`; `undoAction()`
returns a bindable but still **unlabelled** action. Consequence: Bitwig undo is
structural-only; the `undoLabel` field in the frozen `edit.schema.json` is
**bw-brain's own audit label, not a Bitwig feature.** The temporal questions
(coalescing window, per-note vs per-batch undo step count) still need the live
multi-step probe (add N notes → undo once → count survivors); pending in-app run.

**Mitigation:** **CONFIRMED design path** — because there is no native labelled
undo and the coalescing behavior is not contractual, the daemon-authoritative
revert model (`patch-history.jsonl` + inverse operations, EDIT-05) is the
**only** safe, reliable, auditable path; native Bitwig undo is caveated in user
docs and never the spine. The frozen `edit.schema.json` already enforces
`undoLabel` on every `apply.patch` — that label is bw-brain's, recorded in
`patch-history.jsonl`, independent of Bitwig's undo granularity. The live
coalescing probe (when run) only refines the user-facing "undo step count"
guidance, not the architecture.

---

## 2. Note-Editing Scope

**Priority:** D-01 — DEEP verify. The core MIDI edit surface; every Phase 3
patch operation depends on it.

**Verified surface `[VERIFIED: in-app Javadoc 6.0.6]`:** note editing is
**`NoteStep`-based** — `NoteStep` exposes `velocity`, `duration`, `pressure`,
`releaseVelocity`, `velocitySpread`, `pan`, `timbre`, `start`, `pitch` with
matching setters (e.g. `setVelocity(double)`, `setDuration(double)`).
`CursorClip extends Clip extends ...`; `PinnableCursorClip extends CursorClip,
PinnableCursor` (**confirmed present** — AGENTS.md "recent addition"). The
public note-edit surface is NoteStep (step navigation via `Clip.scrollToStep(int)`
etc.); DrivenByMoss's `INoteClip.addNote(...)` is the internal interface, not the
public binding — the Phase 2 bridge must use the NoteStep surface (get a step,
mutate its fields).

**Design questions (RESEARCH.md Probe 2):**
- Can notes be edited in **launcher clips** AND **arranger clips**? (ROADMAP
  Phase 4 flags "Bitwig's API cannot edit the arranger" — confirm.)
- Free-beat positioning — can a `NoteStep` start at an arbitrary beat, or is it
  grid-locked to the step grid (the `gridWidth`/`gridHeight` from
  `createCursorClip(int,int)`)?
- Does pinning (`PinnableCursorClip`) matter for targeting the right clip?

**Probe recipe (DEEP):** launcher-clip round-trip — obtain a `NoteStep`, set
its velocity/duration, read back → confirm the values persist; then repeat for
arranger clip; then probe arbitrary-beat positioning vs the configured grid.

**Observed:** **PARTIALLY VERIFIED.** Surface confirms NoteStep is the edit
primitive + its full field set. The behavioral round-trip (values persist?
launcher vs arranger? grid-locked vs free-beat?) needs the live probe with a
selected clip — pending in-app run. Does not block Phase 2 transport.

**Mitigation:** DRAFT (pending observation) — if arranger-clip editing turns
out to be unsupported (likely per ROADMAP Phase 4), Phase 3 patch operations
are routed exclusively through launcher clips and arranger edits are deferred
until a workaround is designed; user-facing docs explicitly scope "edits apply
to launcher clips only" until that lands. Free-beat positioning is the
non-negotiable minimum — if `NoteStep.start` is grid-locked, the patch model
needs a finer grid (`createCursorClip` gridWidth sized to the project's shortest
note) and that is recorded here.

---

## 3. Automation Write

**Priority:** standard, single-pass (D-01 — not a deep-verify item).

**Verified surface `[VERIFIED: AGENTS.md]`:** `AutomatableParameter.set(value,
...)`, `Automation` envelope, clip automation.

**Design question (RESEARCH.md Probe 3):** clip automation vs track automation
— which does `AutomatableParameter.set()` write to? Does writing require
record-mode / transport-play?

**Probe recipe:** `cursorDevice.getParameter(0).set(value)` under
transport-play vs not; observe which envelope moves.

**Observed:** **TODO-in-app** (Plan 03 Task 2). Single-pass is acceptable here
per D-01.

**Mitigation:** DRAFT (pending observation) — if writing automation requires
transport-play, Phase 4 (Automation & Device Workflows) gates automation
writes behind an explicit transport-state check (no silent no-ops); if the
target envelope is ambiguous, Phase 4 pins clip-vs-track explicitly per device
parameter type. No native workaround is loaded as a default — the daemon always
issues a labelled edit so the user can revert.

---

## 4. Bank Paging

**Priority:** standard (D-01).

**Verified surface `[VERIFIED: AGENTS.md + DrivenByMoss ModelSetup]`:**
`TrackBank` / `DeviceBank` / `CursorRemoteControlsPage` are windowed N
(configurable page size — DrivenByMoss `ModelSetup.setNumTracks(N)` etc.).

**Design questions (RESEARCH.md Probe 4):** scroll vs page? Does the cursor
track follow bank scrolls? 8-remote-parameters-per-page confirmed?

**Probe recipe:** `trackBank.scrollForwards()` /
`trackBank.scrollPageForwards()`; observe whether `cursorTrack` follows.

**Observed:** **TODO-in-app** (Plan 03 Task 2). Single-pass acceptable.

**Mitigation:** DRAFT (pending observation) — the daemon reconciles the
windowed-N bank view via the STATE-04 fingerprint mapping (name + neighbors +
content hash) so that a bank scroll does not silently re-target a different
logical track. If the cursor does NOT follow scroll, Phase 2 explicitly pins
the cursor to the bank's selected index and emits a `selection.changed` on
every scroll. Record whether page size is fixed at 8 remotes (affects the
Phase 2 device-control surface).

---

## 5. Observer Granularity

**Priority:** standard (D-01). Pattern-critical: every observer must enqueue,
never block (Pitfall 3 / Pattern 5 — blocking stalls the audio engine).

**Verified surface `[VERIFIED: DrivenByMoss OSCControllerSetup]`:**
`ITrackBank.addSelectionObserver((index, isSelected) -> ...)`,
`addNoteObserver(...)`, plus name / color / value observers via the framework.
`configuration.addSettingObserver(key, cb)` for settings.

**Design questions (RESEARCH.md Probe 5):** are observers per-object or
per-bank? Do they fire on the controller thread (must not block)? Is there a
debounce / coalesce on rapid changes?

**Probe recipe:** register `addSelectionObserver` + a name observer; mutate
rapidly; measure fire rate / coalescing.

**Observed:** **PARTIALLY VERIFIED** — value observers (e.g.
`CursorTrack.position().addValueObserver(cb, step)`) fire on the controller
thread and DO fire on registration with the current value (the spike's
`skipFirstFire` guard exists because of this). The enqueue-then-drain-off-thread
pattern (Pitfall 3) is **proven**: the extension offers the JSON line to a queue
and a separate writer thread does the socket I/O; the audio engine never
stalled. The bank-level `addSelectionObserver` referenced in DrivenByMoss is NOT
in the public control-surface API — see §Transport Decision for the
`CursorTrack.position()` path that replaced it. Per-channel
`addIsSelectedInMixerObserver` exists (Channel). Rapid-mutation fire-rate /
coalescing measurement still TODO-in-app, but does not gate Phase 2.

**Mitigation:** DRAFT (pending observation) — observers enqueue onto the
daemon's bounded per-connection queue (cap 256, Plan 02 reader); a
`queueMicrotask`-drained worker drains. Observational events drop-oldest on
overflow + emit a `{type:"dropped",payload:{count}}` notice (a newer selection
supersedes an older one); edits/requests NEVER drop. This pattern is already
implemented in the kept daemon reader (Plan 02) regardless of the in-app
finding; the observation only confirms whether additional client-side
debounce is needed inside the JS extension itself.

---

## 6. Stable IDs

**Priority:** D-03 — determines whether STATE-04 (fingerprint mapping) is
required at all.

**Design questions (RESEARCH.md Probe 6):** do `Track` / `Clip` / `Device`
expose any stable UUID or hash, or only `name + index` (which shift on
reorder)?

**Verified:** **NO stable-id accessor exists on `Track`** — a full method scan
of `com.bitwig.extension.controller.api.Track` (in-app Javadoc 6.0.6) shows
only `position()` (IntegerValue, shifts on reorder) and `name()` (settable
string) as identity-like accessors; there is **no `id()`/`uuid()`/`guid()`/`hash()`**
on Track (or on the Clip/Device surfaces surveyed). `OSCControllerDefinition`'s
fixed UUID is for the **extension**, not for tracks `[VERIFIED]`.

**Probe recipe:** dump a track's `name + position` (+ any UUID-like property you
can find), reorder it in the Bitwig UI, re-dump → did the identity follow the
track or the slot?

**Observed:** **PARTIALLY VERIFIED.** Surface scan is conclusive that no native
stable-ID accessor is exposed, so identity is `(name, position)` which is
**slot-bound, not object-bound** (position is the slot index). Behavioral
confirmation via live UI reorder still recommended but the surface already
settles the design question.

**Mitigation:** **CONFIRMED design path** — STATE-04 (fingerprint mapping:
name + type + neighbors + content hash) is **required**; the daemon synthesizes
stable IDs and reconciles them on reconnect/reorder. This is budgeted in the
roadmap as STATE-04. A positive native-ID finding would have let Phase 2
simplify the mapping; the verified absence means the defensive design stands as
planned. Cheap to behaviorally confirm on a reorder, high downstream value
(D-03).

---

## Transport Decision

> Resolved in Plan 03 Task 3 (manual checkpoint). The decision tree below is
> RESEARCH.md §Transport Decision Rule (lines 178–186). Record the observed
> outcome + rationale here once the live round-trip runs.

**Priority order (apply in this order — matches PROJECT.md "localhost TCP or
stdio"):**

1. **Raw `java.net.ServerSocket` binds + exchanges JSON-Lines on `127.0.0.1`** →
   **CHOOSE TCP.** Matches PROJECT.md constraint; inspectable
   (`nc 127.0.0.1 7878 | jq -c`); no relay process. Expected outcome.
2. **ELSE IF only the official OSC API works** → OSC is UDP address/value-pairs,
   NOT JSON-Lines; adapting bw-brain to OSC would invert the locked contract
   (PROJECT.md: "JSON Lines"). Reject unless TCP is truly impossible. A thin
   shim (OSC message carrying a single JSON string blob) is possible but ugly —
   last resort.
3. **ELSE (no Java networking — implausible given OSC + JNA evidence)** →
   **stdio relay:** a native wrapper process spawns the Bitwig extension host
   or tails `host.println()` output and pipes it to the daemon over a Unix
   socket / stdin. This is the documented fallback (STATE.md: "stdio fallback
   ready"). Viability depends on whether `host.println()` output is reachable
   from an external process — confirm in-spike.

**JsApi (JS) networking finding (A2):** **VERIFIED** — the JS Controller Script
exposes **none** of {raw socket, OSC client/server, file I/O}. Only
`host.println` (in-app console, no disk log). This forced the spike's pivot from
the planned JS extension (D-07) to a Java `.bwextension`, which runs in the real
Bitwig JVM and therefore gets `java.net` sockets.

**Confirmed transport:** **RAW TCP (Option 1) — CONFIRMED LIVE.** A throwaway
Java extension (`spike/java/`, packaged as `SpikeProbe.bwextension`) opened a
`java.net.Socket` to the daemon's loopback server and a real `selection.changed`
JSON-Lines line round-tripped end-to-end:

```
{"version":"1.0","type":"selection.changed","timestamp":1782512568,"payload":{"trackId":"trk_1"}}
```

- **Which transport:** raw `java.net.Socket` (TCP client in the extension →
  `TcpServerTransport` bound `127.0.0.1:7878` in the daemon). JSON-Lines over
  loopback, exactly the locked contract — **no OSC shim, no stdio relay**.
- **Observed rationale:** the JS `host` has no socket I/O (above); the Java
  extension JVM is not sandboxed (OSC + JNA proven in RESEARCH), so `java.net`
  works. Build required: compile against `Contents/Java/bitwig.jar` + a
  ServiceLoader registration (see below).
- **Round-trip evidence:** the line above was emitted by the extension's
  `CursorTrack.position()` observer on a UI track selection, reassembled by the
  daemon `LineBuffer`, Ajv-validated against the frozen envelope, and printed +
  exit 0 by `bw-brain-spike dump`. One line = one selection.
- **Loopback-only (Pitfall 5):** held — the extension connects to `127.0.0.1`
  only; the daemon binds loopback only. No `0.0.0.0` anywhere.

**Extension-packaging finding (how Bitwig discovers `.bwextension` jars):**
**VERIFIED** — Bitwig uses Java's ServiceLoader, NOT a manifest attribute and NOT
class scanning. The jar must contain
`META-INF/services/com.bitwig.extension.ExtensionDefinition` listing the
definition FQCN. (Confirmed by inspecting Bitwig's own bundled
`Resources/Extensions/*.bwextension` and the `DriverTemplates/java-controller`
template.) A plain jar without this file is silently ignored.

**Selection-observation finding (informs §5 + §4):** **VERIFIED** — there is NO
bank-level `addSelectionObserver` in the public control-surface API, and
`TrackBank.getTrack(int)` / `getChannel(int)` are BOTH deprecated in API 21 (no
clean single replacement). The working surface is a **`CursorTrack`** (created
via the non-deprecated `createCursorTrack(int,int)`) which follows the GUI
selection; `cursorTrack.position()` (an `IntegerValue`) fires
`addValueObserver` on selection change. Per-channel selection also exists via
`addIsSelectedInMixerObserver` / `addIsSelectedInEditorObserver` (selection is
context-split between mixer and editor). `CursorClip` is `createCursorClip(int
gridWidth, int gridHeight)` — **2 args**, not 3 (the JS arity error).

**Mitigation:** DRAFT (pending observation) — the daemon framing pipe (Plan 02)
is already transport-agnostic (Transport interface + TCP + stdio impls), so
the choice here requires no daemon-side changes. If the chosen transport is
OSC-as-proof, Phase 2 must still build the real raw-TCP bridge because the
frozen JSON-Lines contract is incompatible with OSC's UDP value-pairs (the
OSC stand-in only proves "the JVM can network," not "JSON-Lines over TCP
works").

---

## Deferred to pre-Phase-3 (intentional — recorded, not silently dropped)

The spike's de-risking purpose is achieved: raw TCP is confirmed (SC#1 live),
the JSON-Lines contract is frozen and proven across both halves (SC#3 live), and
every **architectural** question above is settled by the verified API surface.
The following are **behavioral** refinements that mutate a real Bitwig project,
refine Phase 3 UX/implementation guidance only, and do not change any
architecture decision. They are deferred to a dedicated throwaway project just
before Phase 3 (Reversible MIDI Patching) design locks:

- **Undo coalescing timing + per-note-vs-batch undo step count (§1).** Recipe:
  on a throwaway launcher clip, add 1 note → `Application.undo()` → observe; add
  5 notes in a tight loop → undo once → count survivors. Refines the user-facing
  "undo step count" guidance; architecture (daemon-authoritative revert) is
  fixed regardless.
- **Live NoteStep round-trip / launcher-vs-arranger editability / free-beat
  positioning (§2).** Recipe: obtain a `NoteStep`, set velocity/duration, read
  back; repeat on an arranger clip; probe arbitrary-beat positioning vs the
  `createCursorClip(int gridWidth, int gridHeight)` grid. Confirms the edit
  primitive; surface already verified.
- **Automation target envelope + transport-play requirement (§3).** Recipe:
  `cursorDevice.getParameter(0).set(value)` under transport-play vs not; observe
  which envelope moves. Phase 5 (Automation & Device Workflows) concern.

These are **not** gaps in the transport/contract de-risk (Phase 2 is unblocked);
they are the natural pre-Phase-3 edit-design verification.
