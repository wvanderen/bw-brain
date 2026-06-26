// =============================================================================
// spike/bitwig-extension.js  —  THROWAWAY Bitwig Controller Script (D-07, JS).
// =============================================================================
// DELETE IN PHASE 2 (D-05/D-06). This file lives under spike/ precisely so its
// throwaway status is unambiguous. It is NOT the production bridge — production
// is the Java .bwextension built in Phase 2 (AGENTS.md line 118: "Do not ship JS
// as the production bridge").
//
// PURPOSE
//   Track A of the Plan 03 spike: exercise Bitwig's Control Surface API from JS
//   (JsApi) to (a) probe the 6 capability items (D-01..D-04) and (b) emit one
//   real `selection.changed` JSON-Lines line for the SC#1 live round-trip.
//
// AUTHORITATIVE OBSERVER PATTERN (transcribed per D-07 — same Bitwig API surface)
//   Source: DrivenByMoss OSCControllerSetup.java (master, 26.6.2) [VERIFIED]
//     final ITrackBank tb = this.model.getTrackBank();
//     tb.addSelectionObserver((index, isSelected) -> { /* emit event */ });
//   → JS (JsApi) equivalent (ASSUMED — see WARNING below):
//       host.createCursorTrack(...) / host.createTrackBank(...)
//       trackBank.addSelectionObserver(function(index, isSelected) { /* ... */ })
//
// ⚠️  CRITICAL WARNING — JsApi JS surface is [ASSUMED] (open question A2)
//   JsApi is documented (AGENTS.md line 33, 118) as "a sandboxed subset." The
//   proven networking surface (com.bitwig.extension.api.opensoundcontrol) is
//   JAVA-ONLY. The externally-hosted docs that would settle whether JsApi
//   exposes any networking/file-I/O 404 (bitwig.com/developer-resources/ →
//   404 confirmed — STATE.md blocker). The exact host.* JS entry points below
//   MUST be confirmed against the in-app scripting guide (Bitwig → Help →
//   Developer Resources) on spike day 1, BEFORE relying on them. Every
//   `host.*` call below is therefore marked [TODO-A2: confirm JS name in-app].
//
//   This file is deliberately Track A (capability probes + selection.changed
//   emission). Track B (transport proof) is decoupled — see spike/raw-tcp-probe.java.
//   SC#1 is never hostage to whether JsApi exposes networking (RESEARCH.md §The
//   JS-vs-Java Spike Tension, lines 161–177).
//
// LIFECYCLE (Bitwig Controller Script convention)
//   Bitwig loads this file from its ControllerScripts dir, then calls top-level
//   definitions (host.defineController) and the init() function. We surface the
//   standard hooks; everything inside is TODO until confirmed in-app.
// =============================================================================

// ---- 0. Definition (Bitwig looks these up at load) -------------------------
// Canonical Bitwig JS control-script preamble (verified against the factory
// template.js + cme/Xkey.control.js shipped in Bitwig 6.0.6):
//   - loadAPI(1) MUST be the first top-level statement (no load -> script is
//     ignored by Bitwig's controller scanner, which is why it didn't appear).
//   - host.defineController(vendor, product, version, uuid) requires a VALID
//     UUID (8-4-4-4-12 hex); a malformed UUID is silently rejected.
loadAPI(1);

host.defineController("bw-brain", "SpikeProbe", "0.0.1-spike", "adffe628-275c-412b-8b18-3d1ce626af8f");
host.defineMidiPorts(0, 0); // spike does not need MIDI I/O

// ---- 1. Globals (Bitwig injects `host` and calls init()) -------------------
// [TODO-A2: confirm the in-app JS names of each host.* factory. The Java names
//  are [VERIFIED] via DrivenByMoss; the JS binding names are ASSUMED to mirror
//  them but have never been confirmed against an in-app guide.]
var transport;          // host.createTransport()         — Transport probe (not deep)
var application;        // host.createApplication()       — Undo Behavior probe (D-01 DEEP)
var cursorTrack;        // host.createCursorTrack(0, 0)   — selected-track surface
var trackBank;          // host.createTrackBank(N, 0, 0)  — Bank Paging probe + selection observer
var cursorClip;         // host.createCursorClip(...)     — Note-Editing probe (D-01 DEEP); PinnableCursorClip?
var cursorDevice;       // host.createCursorDevice()      — Automation Write probe surface

// Bounded in-memory queue (Pattern 5 / Pitfall 3): observers fire on the
// controller thread; blocking stalls the audio engine. Observers ONLY enqueue;
// a drain loop (flush() or a scheduled task) emits the JSON-Lines line.
// In the spike this is a 1-element slot — enough to prove the pattern.
var PENDING_SELECTION_EVENT = null;

// =============================================================================
// LIFECYCLE ENTRY POINTS
// =============================================================================

function init() {
  host.println("[spike] init() — registering probes + observers");

  // ---- Factory handles (names [ASSUMED] — confirm in-app, A2) ----
  transport     = host.createTransport();
  application   = host.createApplication();
  cursorTrack   = host.createCursorTrack(0, 0);
  // [TODO-A2: page size — DrivenByMoss ModelSetup.setNumTracks(8); JS form
  //  likely host.createTrackBank(numTracks, numSends, numScenes). Confirm.]
  trackBank     = host.createTrackBank(8, 0, 8);
  // [TODO-A2: confirm whether PinnableCursorClip (AGENTS.md recent addition)
  //  is exposed in the installed API version — affects Phase 2 clip targeting.]
  cursorClip    = host.createCursorClip(16, 128);  // [VERIFIED in-app Javadoc 6.0.6: createCursorClip(int gridWidth, int gridHeight) — 2 args, NOT 3]
  cursorDevice  = host.createCursorDevice();

  registerSelectionObserver();   // selection.changed emission (SC#1 path)
  // The 6 capability probes below are commented-out scaffolds — uncomment and
  // drive them from the Bitwig console / a hotkey binding during Task 2.
  // runUndoProbe();
  // runNoteEditingProbe();
  // runAutomationProbe();
  // runBankPagingProbe();
  // runObserverGranularityProbe();
  // runStableIdProbe();
}

function flush() {
  // Called by Bitwig on its schedule. Drain the observer-emitted event here —
  // NEVER inside the observer callback itself (Pitfall 3).
  if (PENDING_SELECTION_EVENT !== null) {
    emitSelectionChanged(PENDING_SELECTION_EVENT);
    PENDING_SELECTION_EVENT = null;
  }
}

function exit() {
  host.println("[spike] exit()");
}

// =============================================================================
// SELECTION.CHANGED EMISSION (SC#1 origin — RESEARCH.md line 151, [VERIFIED])
// =============================================================================
// ITrackBank.addSelectionObserver((index, isSelected) -> ...) is the verified
// origin of `selection.changed`. JS analog [ASSUMED — A2]:
// [VERIFIED in-app Javadoc 6.0.6: there is NO TrackBank.addSelectionObserver in the
//  control-surface API. Selection is observed PER-TRACK via
//  Track.addIsSelectedObserver(BooleanValueChangedCallback), reached through
//  trackBank.getItemAt(index). The DrivenByMoss ITrackBank.addSelectionObserver
//  belongs to the deeper Java extension framework, NOT the surface the JS host
//  proxies — record this in docs/bitwig-capabilities.md.]
function registerSelectionObserver() {
  var size = trackBank.getSizeOfBank();
  for (var i = 0; i < size; i++) {
    (function (trackIndex) {
      trackBank.getItemAt(trackIndex).addIsSelectedObserver(function (isSelected) {
        // CRITICAL (Pitfall 3 / Pattern 5): observer fires on the controller
        // thread. We MUST NOT block here — enqueue only; flush() drains.
        host.println("[spike] selection observer: trackIndex=" + trackIndex +
                     " selected=" + isSelected);
        if (isSelected) {
          PENDING_SELECTION_EVENT = {
            trackIndex: trackIndex,
            isSelected: isSelected,
            // [TODO-A2: trackBank.getItemAt(i).name() — fill exact accessor in Task 2]
            trackName: null,
            clipId: null,       // [TODO: launcher slot under the selected track]
            deviceId: null      // [TODO: cursorDevice if any]
          };
        }
      });
    })(i);
  }
}

// Emit one JSON-Lines line shaped to satisfy schemas/protocol/event.schema.json:
//   {"version":"1.0","type":"selection.changed","timestamp":<unix-sec>,"payload":{...}}
// SCHEMA CONTRACT (frozen in Plan 01):
//   - required: version (^\d+\.\d+$), type ("selection.changed"), timestamp (number)
//   - payload.additionalProperties: false — only trackId / clipId / deviceId allowed
//   - all three payload fields are optional (selection can be empty / a deselection)
function emitSelectionChanged(evt) {
  // [TODO-A2: timestamp source — Date.now() works if JsApi exposes it; otherwise
  //  host.currentTimeMillis() or similar. The schema requires a number
  //  (Unix-seconds, sender-originated).]
  var unixSec = Math.floor(Date.now() / 1000);

  // Build the payload — only the fields the frozen schema permits.
  var payload = {};
  // [TODO-D-03: once Stable IDs are probed, swap the daemon-synthesized
  //  fingerprint for the native ID if one exists. Until then, emit a clearly
  //  spike-local placeholder so the daemon-side dump CLI can still validate
  //  the envelope shape end-to-end.]
  // Spike-local placeholder id from the bank index — proves the envelope shape
  // end-to-end. [TODO-D-03: swap for a native stable ID if Probe 6 finds one.]
  payload.trackId = "trk_" + evt.trackIndex;
  // clipId / deviceId filled only if non-null after Task 2 probes.
  var line = {
    version: "1.0",
    type: "selection.changed",
    timestamp: unixSec,
    payload: payload
  };
  var json = JSON.stringify(line) + "\n";  // atomic-line write (Pattern 4)

  // ============================================================================
  // TRANSPORT SEND — resolved in Task 3 once the JsApi networking surface (A2)
  // is observed in-app. Four options on the table (RESEARCH.md §JS-vs-Java
  // Spike Tension table). Pick the FIRST that the in-app probe confirms works,
  // in this priority order (Transport Decision Rule):
  //   [1] Raw socket (java.net.Socket from JS — UNLIKELY; OSC API is Java-only).
  //         If yes → write `json` to a TCP connect toward 127.0.0.1:7878.
  //   [2] File I/O (fs-like API in JsApi). If yes → append `json` to a path
  //         the daemon tails (a "file relay" — weak; doesn't prove a real
  //         transport, only a fallback demo).
  //   [3] host.println() to Bitwig's console, piped/tail'd by an external
  //         process → daemon (a "log-tail relay"). Does NOT satisfy "real
  //         transport" — only acceptable as the documented stdio fallback.
  //   [4] NONE of the above in JsApi → transport proof MUST pivot to Java
  //         (spike/raw-tcp-probe.java, Track B) or to DrivenByMoss's OSC
  //         server as a stand-in. Record the choice + rationale in the doc's
  //         Transport Decision section.
  // ============================================================================
  // [TODO-3: replace this branch with the chosen transport send.]
  host.println("[spike] would emit: " + json.trim());
}

// =============================================================================
// CAPABILITY PROBES — D-01..D-04
// Each probe is a self-contained function with the design question (copied from
// RESEARCH.md §Capability Probe Design Questions) and a host.println(...)
// evidence-emission stub. During Task 2, drive them from Bitwig (uncomment +
// bind to a hotkey / call from the console) and record the host.println output
// verbatim into docs/bitwig-capabilities.md → "Observed:" field.
// =============================================================================

// ---- Probe 1: Undo Behavior (D-01 — DEEP verify) ---------------------------
// Q: Does Application.undo()/redo() exist? Does any undo API accept a LABEL?
//    Does the host COALESCE consecutive edits on a time window? Does
//    CursorClip.addNote() create one undo step per note, or one per batch?
// Recipe: addNote → undo → observe one-step removal; add 5 notes tight-loop →
//    undo once → observe coalescing. Record timing.
function runUndoProbe() {
  host.println("[probe-undo] === START ===");
  // [TODO-A2: confirm Application.undo() exists in JS — Java [VERIFIED] via
  //  AGENTS.md capabilities table.]
  // Step 1: single addNote → undo.
  //   cursorClip.addNote(...); step(); application.undo();
  // Step 2: 5 addNote in tight loop → undo once → count surviving notes.
  //   for (i=0;i<5;i++) cursorClip.addNote(...);
  //   step(); application.undo();
  // Step 3: probe for a labelled-undo API (seed.md assumes undoLabel).
  //   [TODO-A2: is there application.undo(label) or host.beginUndoTask(name)?]
  host.println("[probe-undo] TODO — drive from Bitwig; record host.println output verbatim");
  host.println("[probe-undo] === END ===");
}

// ---- Probe 2: Note-Editing Scope (D-01 — DEEP verify) ----------------------
// Verified surface [VERIFIED: AGENTS.md + DrivenByMoss ClipModule/INoteClip]:
//   CursorClip.{addNote, removeNote, getNotes}, NoteStep.{velocity, duration,
//   pan, pressure, releaseVelocity, timbre}.
// Q: Launcher clips AND arranger clips? Arbitrary start/length in beats?
//    PinnableCursorClip present + does pinning affect targeting?
function runNoteEditingProbe() {
  host.println("[probe-notes] === START ===");
  // Recipe: launcher clip → cursorClip.addNote({pitch, start, length, velocity})
  //         → cursorClip.getNotes() → confirm round-trip.
  //   [TODO-A2: exact addNote argument shape in JS — Java takes a PlayingNote
  //    array; JS shape unconfirmed.]
  // Probe arranger clip editability separately (ROADMAP Phase 4 flags this).
  host.println("[probe-notes] TODO — drive from Bitwig; record round-trip + arranger result");
  host.println("[probe-notes] === END ===");
}

// ---- Probe 3: Automation Write (standard, single-pass) ---------------------
// Verified surface [VERIFIED: AGENTS.md]:
//   AutomatableParameter.set(value, ...), Automation envelope, clip automation.
// Q: clip automation vs track automation — which does AutomatableParameter
//    write to? Does writing require record / transport-play?
function runAutomationProbe() {
  host.println("[probe-auto] === START ===");
  // Recipe: cursorDevice.getParameter(0).set(value) under transport-play vs not.
  //   [TODO-A2: exact JS path to AutomatableParameter + envelope target.]
  host.println("[probe-auto] TODO — drive from Bitwig; record which envelope moved");
  host.println("[probe-auto] === END ===");
}

// ---- Probe 4: Bank Paging (standard) ---------------------------------------
// Verified surface [VERIFIED: AGENTS.md + DrivenByMoss ModelSetup]:
//   TrackBank / DeviceBank / CursorRemoteControlsPage — windowed N.
// Q: scroll vs page? Does cursor track follow bank scrolls? 8 remotes/page?
function runBankPagingProbe() {
  host.println("[probe-bank] === START ===");
  // Recipe: trackBank.scrollForwards() / .scrollPageForwards(); observe cursor.
  //   [TODO-A2: confirm method names + whether cursor follows scroll.]
  host.println("[probe-bank] TODO — drive from Bitwig; record windowed-N + cursor-follows");
  host.println("[probe-bank] === END ===");
}

// ---- Probe 5: Observer Granularity (standard) ------------------------------
// Verified surface [VERIFIED: DrivenByMoss OSCControllerSetup]:
//   ITrackBank.addSelectionObserver((index, isSelected) -> ...), addNoteObserver,
//   name/color/value observers, configuration.addSettingObserver.
// Q: per-object or per-bank? controller-thread firing? debounce/coalesce?
function runObserverGranularityProbe() {
  host.println("[probe-obs] === START ===");
  // Recipe: register addSelectionObserver + a name observer; mutate rapidly;
  //   measure fire rate / coalescing.
  //   [TODO-A2: enumerate available add*Observer methods on a Track / CursorTrack.]
  host.println("[probe-obs] TODO — drive from Bitwig; record firing pattern + thread");
  host.println("[probe-obs] === END ===");
}

// ---- Probe 6: Stable IDs (D-03 — determines STATE-04 necessity) ------------
// Q: Do Track/Clip/Device expose any stable UUID or hash, or only name+index?
// Recipe: dump a track's name+index → reorder in UI → re-dump → did identity
//    follow the track or the slot?
// Verified: OSCControllerDefinition uses a fixed UUID for the EXTENSION, not
//    for tracks [VERIFIED: OSCControllerDefinition.java].
function runStableIdProbe() {
  host.println("[probe-id] === START ===");
  // Recipe: dump track at index 0 (name+any id-looking field); drag-reorder in
  //   the Bitwig UI; re-dump index 0. Did the original track's identity follow
  //   it to its new slot, or did the slot just take a new name?
  //   [TODO-A2: enumerate every property on a Track / Clip / Device object —
  //    look for any string that resembles a UUID or hash.]
  host.println("[probe-id] TODO — drive from Bitwig; record pre/post-reorder dump");
  host.println("[probe-id] === END ===");
}

// =============================================================================
// LOAD-TIME NOTES
//   - Plain JS, no `import`, no npm (RESEARCH.md line 72 — "no npm install").
//   - Throwaway (deleted in Phase 2). The Java bridge (Phase 2) reproduces the
//     observer/selection pattern in com.bitwig:extension-api:21 and adds the
//     real transport (TCP per the Plan 02 daemon reader's expected socket).
//   - Two SECURITY INVARIANTS hold even in the throwaway:
//       (1) localhost-only — if any transport is wired, it MUST target
//           127.0.0.1 only (never 0.0.0.0 — Pitfall 5).
//       (2) never-block-an-observer — observers enqueue; flush() drains
//           (Pitfall 3 — blocking stalls the audio engine).
// =============================================================================
