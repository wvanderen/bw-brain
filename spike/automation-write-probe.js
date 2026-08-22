// =============================================================================
// spike/automation-write-probe.js — THROWAWAY Bitwig controller script (JsApi).
// =============================================================================
// Phase 5 Plan 05-02 Task 1 (D-05-05/D-05-06 LOCKED live probe — gates the
// entire write wave). This file lives under spike/ precisely so its throwaway
// status is unambiguous (threat T-05-05): it is NOT production code, nothing
// imports it, and no bridge/daemon source may ever reference it. Precedent:
// Phase-1 spike/bitwig-extension.js JS-probe shape (recovered from git 889998a;
// spike/ was deleted at 618ab0c and is recreated here).
//
// PURPOSE
//   Execute the automation-write semantics matrix against live Bitwig and
//   print one labeled evidence line per step via host.println (the in-app
//   controller log — Bitwig → Help → Show Log):
//     {transport playing | stopped} × {automation-write armed | not armed}
//     (arranger-arm vs launcher-arm are distinguished in every state line)
//   Each QUALIFYING transport/write-mode transition (play/stop, arm toggles)
//   executes the next queued write step against cursorDevice.getParameter(0):
//     value-before → touch(true) → {set | setImmediately | setRaw} →
//     touch(false) → value-after.
//   The three variants cycle with DISTINCT target values (set=0.75,
//   setImmediately=0.25, setRaw=0.50) so the producer can tell WHICH write
//   landed where — and whether 0.75 lands ~3/4 of range (normalization, A1).
//
// HARD HOST CONSTRAINT (capabilities doc §7 finding 3, commit 4903bc4):
//   Bitwig forbids post-init observer registration —
//   "This can only be called during driver initialization".
//   ALL addValueObserver()/proxy-creation therefore happens inside init()
//   (directly or via the register* helpers invoked FROM init()). Callbacks
//   and scheduled tasks only read CACHED state, println, and run queued
//   writes against proxies created at init time. Grep check: no code path
//   outside init()* ever registers an observer.
//
// DOCUMENTED FALLBACK (plan 05-02 Task 1): if any surface used here turns out
//   to be missing from the JS scripting API during live setup, the fallback is
//   a temporary Java probe branch of the bridge (mvn-built, installed as a
//   second extension) — recorded in the 05-02 SUMMARY, never improvised
//   silently.
//
// DRIVER (for the producer — matches the Task 2 checkpoint matrix):
//   1. Bitwig → Settings → Controllers → Add controller → load this file.
//      Open Help → Show Log. Select the VST/AU track + device.
//   2. Read the initial lines: STATE, WALK (termination index + param names),
//      PAGE device-site / PAGE track-site knob names.
//   3. For each matrix cell: toggle transport play/stop and/or the arranger /
//      clip-launcher automation-write buttons. Each transition prints a STATE
//      line then a STEP line. INSPECT the arranger track + launcher clip for
//      new envelope points after every step (clip vs track, at/behind/ahead
//      of the playhead). Drive ≥2 transitions per cell so every variant
//      (set/setImmediately/setRaw) runs in every cell.
//   4. After the last step: stop. Report per-cell observations.
// =============================================================================

loadAPI(1);

// Fresh UUID — deliberately distinct from every prior bw-brain extension
// (Phase-1 SpikeProbe used adffe628-…; the production bridge has its own).
host.defineController("bw-brain", "AutomationWriteProbe", "0.0.1-spike",
  "6f2b9c31-5d47-4a0e-9c18-8b7a52d4f0c3");
host.defineMidiPorts(0, 0); // probe needs no MIDI I/O

// ---- Constants ---------------------------------------------------------------
var LOG = "[aw-probe]";
var PARAM_WINDOW = 128;     // getParameter(0..127), exists()-terminated (A2 /
                            // AUTO-04: full-list vs page-locked indexing)
var PAGE_SIZE = 8;          // Conventional remote-controls page size. The plan's
                            // "createCursorRemoteControlsPage(0)" reads as
                            // page-0 intent — a size-0 page would expose no
                            // knobs to print, defeating the site comparison.
var STEP_DEBOUNCE_MS = 250; // coalesce observer bursts → one step per transition
var SETTLE_MS = 4000;       // initial walk/page report delay after init
var REARM_DUMP_MS = 1500;   // re-dump delay after a device-selection change
var STEP_VARIANTS = ["set", "setImmediately", "setRaw"];
var STEP_VALUES = [0.75, 0.25, 0.50]; // distinct per variant (see header)

// ---- Mutable state (observers write; scheduled tasks read) --------------------
var transport = null;
var cursorTrack = null;
var cursorDevice = null;

var state = { playing: null, arrWrite: null, launchWrite: null,
              override: null, mode: null };
var lastStateLine = "";
var armed = false;            // false until the init observer burst settles —
                              // the initial fire must NOT trigger a step.
var stepTimerPending = false;
var stepIndex = 0;            // cycles set → setImmediately → setRaw
var valueAccessorNote = "";   // which value accessor actually worked (probe!)

var paramExists = [];         // cached from exists() observers (A2 termination)
var paramNames = [];          // cached from name() observers
var deviceSiteParams = [];    // cursorDevice.createCursorRemoteControlsPage site
var trackSiteParams = [];     // cursorTrack.channel().createCursorRemoteControlsPage site
var dumpTimerPending = false;

// =============================================================================
// LIFECYCLE — Bitwig calls init() after load; EVERY observer registration and
// proxy creation in this file happens on a path rooted in init().
// =============================================================================
function init() {
  host.println(LOG + " init() — eager observer registration begins");

  makeFactories();
  registerCursorObservers();
  registerTransportObservers();
  registerParameterWindowObservers();
  registerRemotePageObservers("device",
    function () { return cursorDevice.createCursorRemoteControlsPage(PAGE_SIZE); },
    deviceSiteParams);
  registerRemotePageObservers("trackChannel",
    function () { return cursorTrack.channel().createCursorRemoteControlsPage(PAGE_SIZE); },
    trackSiteParams);

  host.println(LOG + " registered: 5 Transport gate observers, " +
    PARAM_WINDOW + "×(exists+name) parameter observers, 2 remote-page sites ×" +
    PAGE_SIZE);
  host.println(LOG + " waiting " + SETTLE_MS + "ms for observers to settle " +
    "(select your VST/AU track + device NOW)…");

  host.scheduleTask(function () {
    armed = true;
    host.println(LOG + " ARMED — transport/write-mode transitions now execute " +
      "matrix steps (" + STEP_VARIANTS.join(" → ") + ", values " +
      STEP_VALUES.join("/") + ")");
    dumpWalkReport();
    dumpPageReports();
  }, SETTLE_MS);
}

function exit() {
  host.println(LOG + " exit() — steps executed: " + stepIndex);
}

// ---- Factory handles (guarded; JsApi binding names are probed, not assumed) --
function makeFactories() {
  transport = host.createTransport();
  cursorTrack = host.createCursorTrack(0, 0);
  try {
    cursorDevice = host.createCursorDevice();
    host.println(LOG + " cursorDevice created via host.createCursorDevice()");
  } catch (e1) {
    host.println(LOG + " host.createCursorDevice() threw: " + e1 +
      " — falling back to cursorTrack.createCursorDevice()");
    try {
      cursorDevice = cursorTrack.createCursorDevice();
      host.println(LOG + " cursorDevice created via cursorTrack.createCursorDevice()");
    } catch (e2) {
      host.println(LOG + " BOTH cursorDevice factories threw (" + e2 +
        ") — MATRIX STEPS UNAVAILABLE; use the documented Java-probe fallback");
    }
  }
}

// ---- Transport gate observers (D-05-05 vocabulary) — ALL eager in init() -----
function registerTransportObservers() {
  transport.isPlaying().addValueObserver(function (v) {
    onGateChange("playing", v);
  });
  transport.isArrangerAutomationWriteEnabled().addValueObserver(function (v) {
    onGateChange("arrWrite", v);
  });
  transport.isClipLauncherAutomationWriteEnabled().addValueObserver(function (v) {
    onGateChange("launchWrite", v);
  });
  transport.isAutomationOverrideActive().addValueObserver(function (v) {
    onGateChange("override", v);
  });
  try {
    transport.automationWriteMode().addValueObserver(function (v) {
      state.mode = String(v);
      printStateLine("writeMode");
    });
  } catch (e) {
    host.println(LOG + " automationWriteMode observer unavailable: " + e);
  }
}

// ---- Cursor context observers (re-arm the walk/page dump on device change) ---
function registerCursorObservers() {
  try {
    cursorTrack.name().addValueObserver(function (n) {
      host.println(LOG + " cursorTrack.name = \"" + n + "\"");
    });
  } catch (e) { host.println(LOG + " cursorTrack.name observer unavailable: " + e); }
  if (!cursorDevice) { return; }
  try {
    cursorDevice.name().addValueObserver(function (n) {
      host.println(LOG + " cursorDevice.name = \"" + n +
        "\" — re-dumping walk + page reports in " + REARM_DUMP_MS + "ms");
      scheduleDump();
    });
  } catch (e) { host.println(LOG + " cursorDevice.name observer unavailable: " + e); }
}

// ---- getParameter(0..127) exists()-terminated window (A2 / AUTO-04) ----------
function registerParameterWindowObservers() {
  if (!cursorDevice) {
    host.println(LOG + " no cursorDevice — parameter window walk skipped");
    return;
  }
  for (var i = 0; i < PARAM_WINDOW; i++) {
    (function (idx) {
      var p = null;
      try { p = cursorDevice.getParameter(idx); } catch (e) { return; }
      paramExists[idx] = 0;
      paramNames[idx] = "";
      try {
        p.exists().addValueObserver(function (has) {
          paramExists[idx] = has ? 1 : 0;
        });
      } catch (e1) { host.println(LOG + " exists() observer threw @ " + idx + ": " + e1); }
      try {
        p.name().addValueObserver(function (n) {
          paramNames[idx] = String(n);
        });
      } catch (e2) { /* name() optional — walk still terminates via exists() */ }
    })(i);
  }
}

// ---- Both remote-page creation sites (D-05-03 / remote-page finding) ---------
function registerRemotePageObservers(siteLabel, pageFactory, cache) {
  var page = null;
  try {
    page = pageFactory();
  } catch (e) {
    host.println(LOG + " PAGE site=" + siteLabel +
      " creation threw (surface missing?): " + e);
    return;
  }
  for (var j = 0; j < PAGE_SIZE; j++) {
    (function (idx) {
      var p = null;
      try { p = page.getParameter(idx); } catch (e) { return; }
      cache[idx] = { exists: 0, name: "" };
      try {
        p.exists().addValueObserver(function (has) {
          cache[idx].exists = has ? 1 : 0;
        });
      } catch (e1) { /* reported via dump line */ }
      try {
        p.name().addValueObserver(function (n) {
          cache[idx].name = String(n);
        });
      } catch (e2) { /* optional */ }
    })(j);
  }
  host.println(LOG + " PAGE site=" + siteLabel + " registered (" + PAGE_SIZE + " knobs)");
}

// =============================================================================
// State-transition driver (matrix engine). Callbacks only cache + println +
// schedule the debounced step — never register observers, never block.
// =============================================================================
function onGateChange(key, v) {
  state[key] = v ? 1 : 0;
  printStateLine(key);
  // Qualifying transitions for the MATRIX: the {playing,stopped} ×
  // {armed,not-armed} axes. override/mode changes are informational only.
  var qualifies = armed && (key === "playing" || key === "arrWrite" ||
                            key === "launchWrite");
  if (qualifies && !stepTimerPending) {
    stepTimerPending = true;
    host.scheduleTask(runNextStep, STEP_DEBOUNCE_MS);
  }
}

function stateLine() {
  return "playing=" + state.playing + " arrWrite=" + state.arrWrite +
    " launchWrite=" + state.launchWrite + " override=" + state.override +
    " writeMode=" + state.mode;
}

function printStateLine(cause) {
  var line = LOG + " STATE [" + cause + "] " + stateLine();
  if (line !== lastStateLine) {
    host.println(line);
    lastStateLine = line;
  }
}

function cellLabel() {
  var play = state.playing === 1 ? "playing" : "stopped";
  var arm;
  if (state.arrWrite === 1 && state.launchWrite === 1) { arm = "arranger+launcher-armed"; }
  else if (state.arrWrite === 1) { arm = "arranger-armed"; }
  else if (state.launchWrite === 1) { arm = "launcher-armed"; }
  else { arm = "not-armed"; }
  return play + "/" + arm;
}

// ---- One queued matrix step against cursorDevice.getParameter(0) -------------
function readValue(p) {
  // Probe BOTH accessors: plan/RESEARCH cite value().get(); SettableRangedValue
  // also exposes get() directly. Record which one actually worked — once.
  try {
    if (typeof p.value === "function") {
      var sv = p.value();
      if (sv && typeof sv.get === "function") {
        if (valueAccessorNote === "") {
          valueAccessorNote = "value().get()";
          host.println(LOG + " value accessor: " + valueAccessorNote);
        }
        return sv.get();
      }
    }
  } catch (e) { /* fall through */ }
  try {
    if (valueAccessorNote === "") {
      valueAccessorNote = "get() [value() unavailable]";
      host.println(LOG + " value accessor: " + valueAccessorNote);
    }
    return p.get();
  } catch (e2) {
    return "ERR:" + e2;
  }
}

function runNextStep() {
  stepTimerPending = false;
  if (!cursorDevice) { return; }
  var variant = STEP_VARIANTS[stepIndex % STEP_VARIANTS.length];
  var target = STEP_VALUES[stepIndex % STEP_VALUES.length];
  var p = null;
  try { p = cursorDevice.getParameter(0); } catch (e) {
    host.println(LOG + " STEP#" + (stepIndex + 1) + " ABORT getParameter(0) threw: " + e);
    return;
  }
  var before = readValue(p);
  var writeErr = "";
  try {
    p.touch(true);
    if (variant === "set") { p.set(target); }
    else if (variant === "setImmediately") { p.setImmediately(target); }
    else { p.setRaw(target); }
    p.touch(false);
  } catch (e) {
    writeErr = " WRITE-THREW:" + e;
    try { p.touch(false); } catch (e2) { /* already failing */ }
  }
  var after = readValue(p);
  stepIndex++;
  host.println(LOG + " STEP#" + stepIndex + " cell=" + cellLabel() +
    " variant=" + variant + " target=" + target +
    " valueBefore=" + before + " valueAfter=" + after + writeErr +
    " | gate{" + stateLine() + "}" +
    " — INSPECT arranger track + launcher clip for new envelope points NOW");
}

// =============================================================================
// Reports (read CACHED observer state only — no registration happens here)
// =============================================================================
function scheduleDump() {
  if (dumpTimerPending) { return; }
  dumpTimerPending = true;
  host.scheduleTask(function () {
    dumpTimerPending = false;
    dumpWalkReport();
    dumpPageReports();
  }, REARM_DUMP_MS);
}

function dumpWalkReport() {
  var termination = -1;
  for (var i = 0; i < PARAM_WINDOW; i++) {
    if (paramExists[i] === 0) { termination = i; break; }
  }
  host.println(LOG + " WALK getParameter(0.." + (PARAM_WINDOW - 1) +
    ") terminationIndex=" + (termination === -1 ? ">=128 (none in window)" : termination));
  var bound = (termination === -1 ? PARAM_WINDOW : termination);
  var shown = Math.min(bound, 16);
  var names = [];
  for (var k = 0; k < shown; k++) {
    names.push(k + ":\"" + (paramNames[k] || "?") + "\"");
  }
  host.println(LOG + " WALK boundParams=" + bound + " first" + shown + "=[" +
    names.join(", ") + (bound > shown ? ", …" : "") + "]");
  host.println(LOG + " WALK verdict-hint: termination 8/16 ⇒ page-locked " +
    "indexing suspected; large/none ⇒ full-list indexing (record honestly in §4)");
}

function dumpPageReports() {
  dumpOnePage("device(cursorDevice.createCursorRemoteControlsPage)", deviceSiteParams);
  dumpOnePage("trackChannel(cursorTrack.channel().createCursorRemoteControlsPage)", trackSiteParams);
}

function dumpOnePage(siteLabel, cache) {
  if (!cache || cache.length === 0) {
    host.println(LOG + " PAGE site=" + siteLabel + " NOT CREATED (see init log)");
    return;
  }
  var parts = [];
  for (var i = 0; i < cache.length; i++) {
    parts.push(i + ":\"" + (cache[i].name || "?") + "\"(exists=" +
      cache[i].exists + ")");
  }
  host.println(LOG + " PAGE site=" + siteLabel + " knobs=[" + parts.join(", ") + "]");
}
