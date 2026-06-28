---
status: resolved
trigger: "02-extension-load-deprecated-getchannel — Bitwig 6.0.6 extension fails to load: deprecation error 'Use getChannel(IndexInBank) instead' at load time; blocks 3 of 4 Phase-2 UAT tests."
created: 2026-06-28T02:30:00.000Z
updated: 2026-06-28T16:55:00.000Z
resolved_at: 2026-06-28T16:55:00.000Z
resolved_by: "Plan 02-06 (commit 3a9a271 — Observers.java:151 trackBank.getItemAt(i); user-verified live in Bitwig 6.0.6)"
---

## Current Focus

hypothesis: CONFIRMED. `trackBank.getTrack(i)` at Observers.java:139 is the sole call site in the bridge that invokes a Bitwig Control Surface API method deprecated since API version 2. Bitwig 6.0.6's host enforces deprecation-as-error at runtime (throws when a deprecated-since-v2 method is invoked), so the call during `init()` -> `observers.register()` -> `wireTrackBank()` aborts init() and the extension fails to load with the exact message "This has been deprecated since API version 2: Use getChannel(IndexInBank) instead".
test: DONE — Cross-referenced the bridge's full Bitwig call surface against `deprecated-list.html` (precise `col-summary-item-name` entries). Only `TrackBank.getTrack(int)` matches. Phase 1 spike source confirms the deprecation was already known and deliberately avoided.
expecting: After replacing `trackBank.getTrack(i)` with the terminal non-deprecated `trackBank.getItemAt(i)` (inherited from `Bank<Track>`), the extension will load. The error message's literal suggestion (`getChannel(int)`) is a TRAP — `getChannel(int)` is ALSO deprecated; the true terminal replacement is `Bank.getItemAt(int)`.
next_action: Diagnosis complete. Return ROOT CAUSE FOUND. (Fix is out of scope — goal: find_root_cause_only.)

reasoning_checkpoint:
  hypothesis: "trackBank.getTrack(i) at Observers.java:139 throws Bitwig's runtime deprecation-as-error (deprecated since API v2) during init(), aborting extension load."
  confirming_evidence:
    - "Bitwig javadoc deprecated-list.html lines 1331-1334: TrackBank.getTrack(int) is @Deprecated, replacement note 'use TrackBank.getChannel(int) instead' — byte-exact match to the runtime error text 'Use getChannel(IndexInBank) instead' (param name indexInBank rendered as IndexInBank)."
    - "Method detail for getTrack(int): @Deprecated, 'Since: API version 1' (method), deprecated since v2 (matches error)."
    - "Bridge cross-reference: trackBank.getTrack(i) is the ONLY deprecated call site in bridge/src/main/java/com/bwbrain/bridge/* — all factory methods used (createCursorTrack(int,int), createLauncherCursorClip, createCursorDevice(), createTransport(), createTrackBank(int,int,int)) are NON-deprecated; only getTrack(int) is deprecated."
    - "Phase 1 spike (commit 889998a, spike/java/.../SpikeExtension.java lines 17-19) explicitly documented: 'TrackBank.getTrack/getChannel are BOTH deprecated in API 21' and deliberately avoided TrackBank (used only cursorTrack.position()) — spike loaded fine, SC#1 round-trip passed."
    - "capabilities doc §5 (docs/bitwig-capabilities.md lines 330-337) already records: 'TrackBank.getTrack(int) / getChannel(int) are BOTH deprecated in API 21'."
  falsification_test: "If getTrack(int) were NOT the blocker, the runtime error text would not match getTrack's javadoc replacement note. It matches exactly. Also: if a factory method were the first blocker, init() would never reach getTrack and the error would name createTrackBank/createCursorTrack instead — it names getChannel, proving init() reached the getTrack call."
  fix_rationale: "Replace trackBank.getTrack(i) with trackBank.getItemAt(i) — the terminal non-deprecated accessor inherited from Bank<Track> (TrackBank extends ChannelBank<Track> extends Bank<Track>). getItemAt(int) returns Track; Track.name() works unchanged. Do NOT follow the error's literal 'getChannel(int)' suggestion — that is ALSO deprecated (-> Bank.getItemAt)."
  blind_spots: "Not verified live in Bitwig (diagnosis-only). High confidence the single-line fix unblocks load because (a) getTrack is the only deprecated call site, (b) factory methods are empirically non-blocking (error proves init() reaches getTrack), (c) getItemAt is the documented terminal replacement. Residual risk: a SECOND deprecated call surface only exercised AFTER init() (e.g. in a pull-handler path) — but cross-reference shows none; NoteStep.getStep/velocity/duration and all observer accessors used are non-deprecated."

## Symptoms

expected: Extension loads in Bitwig 6.0.6 and round-trips all 5 event types (selection.changed + 4 *.name_changed/transport.changed) as schema-valid JSON-Lines over loopback TCP; bw-midi inspect returns non-empty notes for a clip with notes; bw-project summary returns 8 track entries via get.project_summary.
actual: Extension FAILS TO LOAD. Error message at load: "This has been deprecated since API version 2: Use getChannel(IndexInBank) instead". Nothing round-trips because the extension never initializes.
errors: "This has been deprecated since API version 2: Use getChannel(IndexInBank) instead"
reproduction: Install bridge/target/bw-brain.bwextension, enable it in Bitwig 6.0.6 Settings -> Controllers. Error appears immediately on load.
started: Discovered during Phase 2 UAT. User reports the SAME deprecation error was hit in Phase 1 — possible recurrence/regression or never fully resolved.

## Eliminated

<!-- APPEND only -->

## Evidence

<!-- APPEND only -->

- timestamp: 2026-06-28T02:30:00.000Z
  checked: BridgeExtension.java init() call sites
  found: Uses host.createCursorTrack(0,0), cursorTrack.createLauncherCursorClip(16,128), cursorTrack.createCursorDevice(), host.createTransport(), host.createTrackBank(8,0,0). All 2-arg/non-deprecated factory forms per inline comments.
  implication: Entry point itself looks clean; suspect shifts to observer/bank wiring.

- timestamp: 2026-06-28T02:35:00.000Z
  checked: Local Bitwig javadoc deprecated-list.html (file:///Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/deprecated-list.html), TrackBank.html method detail.
  found: TrackBank.getTrack(int) is @Deprecated with replacement note "use TrackBank.getChannel(int) instead" (deprecated-list.html:1331-1334). Method detail confirms @Deprecated + "Since: API version 1". The runtime error text "Use getChannel(IndexInBank) instead" is a byte-exact match (param `int indexInBank` rendered as IndexInBank). ALSO: TrackBank.getChannel(int) is ITSELF deprecated -> "Use Bank.getItemAt(int) instead" (lines 1321-1324). So getTrack->getChannel->getItemAt is a 2-hop chain; getItemAt(int) is the terminal non-deprecated form.
  implication: The error message's literal suggestion (getChannel) is a trap — following it lands on another deprecated method. The true fix target is Bank.getItemAt(int).

- timestamp: 2026-06-28T02:38:00.000Z
  checked: Phase 1 spike source (git show 889998a:spike/java/src/com/bwbrain/spike/SpikeExtension.java) + Phase 1 UAT (01-UAT.md) + git log for deprecation-related commits.
  found: (a) Spike comment lines 17-19 explicitly state "TrackBank.getTrack/getChannel are BOTH deprecated in API 21" — the Phase 1 author KNEW this. (b) Spike deliberately used ONLY host.createCursorTrack(0,0) + cursorTrack.position().addValueObserver — NO TrackBank, NO getTrack. (c) Phase 1 UAT 10/10 passed including live SC#1 round-trip (Test 10). (d) git log has ZERO commits matching "deprecat"/"getChannel"/"getTrack" — no prior fix exists to have regressed. (e) capabilities doc §5 (lines 330-337) already records the deprecation correctly.
  implication: This is NOT a regression from a failed prior fix. It is a KNOWLEDGE-LOSS regression: Phase 1 discovered and documented the deprecation; Phase 2's production bridge (Observers.java:139) re-introduced getTrack(i) with an inline comment (lines 136-137) that directly contradicts the known Phase 1 constraint. The "user notes same error in Phase 1" recollection is the user remembering the Phase 1 discovery — accurate.

- timestamp: 2026-06-28T02:42:00.000Z
  checked: Cross-reference of EVERY bridge Bitwig call site against the precise deprecated-method list (col-summary-item-name entries in deprecated-list.html, no replacement-link false positives).
  found: ONLY trackBank.getTrack(i) (Observers.java:139) is deprecated. All other bridge call sites are NON-deprecated: createCursorTrack(int,int) [only the 3-arg String,int,int form is deprecated], createLauncherCursorClip(int,int) [not deprecated], createCursorDevice() [only String/(String,int) overloads deprecated], createTransport() [only createTransportSection() deprecated], createTrackBank(int,int,int) [only 4-arg (int,int,int,boolean) + Section variant deprecated], position()/name()/isPlaying()/getLoopLength()/addValueObserver/getStep/velocity/duration [none deprecated]. The earlier "factory methods also deprecated" widening was a false alarm from replacement-link noise.
  implication: The fix is a SINGLE one-line change (getTrack -> getItemAt). No cascade. The extension will load after this one fix because getTrack is the sole deprecated call site and the host stops at the first deprecated invocation.

- timestamp: 2026-06-28T02:44:00.000Z
  checked: Type hierarchy for getItemAt return type + runtime enforcement mechanism.
  found: TrackBank extends ChannelBank<Track> extends Bank<Track> (javadoc signatures confirmed). Bank<Track>.getItemAt(int) returns Track (the ItemType generic). Track.name() exists (DeviceChain.name()). So trackBank.getItemAt(i).name().addValueObserver(cb) is type-correct and behaviorally identical to the deprecated getTrack(i) form. Runtime mechanism: Bitwig 6.0.6 host instruments methods deprecated since API v2 to throw at invocation; compile-time @Deprecated is only a javac warning (Maven build succeeds), which is why autonomous build/verification (compile + javap "method exists") passed but the real host rejects it.
  implication: Autonomous verification checked the WRONG invariant (method presence via javap) instead of the RIGHT one (method non-deprecation). A grep-bridge-against-deprecated-list CI gate would have caught this.

- timestamp: 2026-06-28T02:45:00.000Z
  checked: docs/bitwig-capabilities.md §4 (Bank Paging) vs §5 (Observer Granularity) coverage of the deprecation.
  found: §5 (lines 330-337) correctly documents "TrackBank.getTrack(int) / getChannel(int) are BOTH deprecated in API 21" but inaccurately adds "no clean single replacement" (getItemAt IS the clean replacement). §4 (Bank Paging, lines 170-187) — the section the bridge author consulted for the TrackBank windowed pattern — does NOT mention the deprecation at all. Observers.java line 19 (class-level comment) and lines 136-137 (wireTrackBank comment) repeat the WRONG claim that "In-window getTrack(int) is non-deprecated".
  implication: Doc + comment corrections needed alongside the code fix: §4 must carry the deprecation + getItemAt replacement; §5's "no clean single replacement" must be corrected; the misleading Observers.java comments must be fixed so the knowledge-loss does not recur a third time.

## Resolution

root_cause: |
  SINGLE ROOT CAUSE — `trackBank.getTrack(i)` at `bridge/src/main/java/com/bwbrain/bridge/Observers.java:139` invokes `com.bitwig.extension.controller.api.TrackBank.getTrack(int)`, which is `@Deprecated` since Bitwig Control Surface API version 2. The Bitwig 6.0.6 host enforces deprecation-as-error at runtime: when `init()` -> `Observers.register()` -> `wireTrackBank()` reaches the first `trackBank.getTrack(0)` call, the host throws `"This has been deprecated since API version 2: Use getChannel(IndexInBank) instead"`. The exception propagates out of `init()`, so the extension never finishes initializing and Bitwig reports it as failed-to-load. Nothing round-trips because the observer registration (and therefore the Outbox/connector wiring that follows) never completes.

  WHY IT COMPILES BUT FAILS AT RUNTIME: `bitwig.jar` (extension-api:21) marks `getTrack(int)` `@Deprecated`; javac emits only a WARNING (Maven build succeeds). The autonomous Phase-2 verification checked the WRONG invariant — "does the method exist on the surface?" via `javap` (it does) — instead of "is the method non-deprecated?". The real Bitwig host enforces the deprecation at runtime, which `javap` cannot detect.

  WHY THE PHASE-1 SPIKE WORKED: the spike (`SpikeProbe.bwextension`, commit 889998a) deliberately avoided TrackBank — it observed only `cursorTrack.position()`. Its source comments (lines 17-19) explicitly record "TrackBank.getTrack/getChannel are BOTH deprecated in API 21". SC#1 round-trip passed because it never touched the deprecated surface.

  PHASE-1 RECURRENCE EXPLAINED: this is NOT a regression from a failed prior fix (git log has zero deprecation-related commits). It is a KNOWLEDGE-LOSS regression — the Phase-1 learning was recorded in the spike source + capabilities doc §5 but was NOT enforced/transmitted to the Phase-2 bridge author, who re-introduced `getTrack(i)` at Observers.java:139 with an inline comment (lines 136-137) that directly contradicts the known constraint. The user's "same error in Phase 1" recollection is accurate — it refers to the Phase-1 discovery, not a prior code fix.

fix: |
  OUT OF SCOPE (goal: find_root_cause_only). For plan-phase --gaps:
  1. CODE (minimal, one line): In Observers.java:139 replace `trackBank.getTrack(i)` with `trackBank.getItemAt(i)` (inherited from `Bank<Track>`; returns `Track`; `.name()` works unchanged). Do NOT follow the error's literal `getChannel(int)` suggestion — `TrackBank.getChannel(int)` is ALSO deprecated (-> `Bank.getItemAt(int)`); jump straight to the terminal non-deprecated form.
  2. COMMENTS: fix the misleading comments at Observers.java line 19 (class-level) and lines 136-137 (wireTrackBank) that claim "getTrack(int) is non-deprecated" — they caused the knowledge loss.
  3. DOCS: (a) docs/bitwig-capabilities.md §4 (Bank Paging) must add the deprecation + getItemAt replacement (currently silent — the section the bridge author consulted). (b) §5 (lines 330-337) must correct "no clean single replacement" — getItemAt(int) IS the clean replacement.
  4. PROCESS GATE: add a CI/verify check that greps bridge Java sources against `deprecated-list.html` so a deprecated call site fails verification, not just live UAT. The current javap "method exists" check is the wrong invariant.
  5. REFERENCE: per user suggestion, expose the local Bitwig Control Surface API javadoc (file:///Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/index.html) as a reusable opencode skill/reference so future bridge work consults the authoritative deprecation list by default.

verification: (diagnosis-only — no code changed). Evidence-based confidence the single-line fix unblocks load: (a) getTrack is the sole deprecated call site in the bridge; (b) factory methods are empirically non-blocking (the error proves init() reaches getTrack); (c) getItemAt is the documented terminal replacement and is type-correct (Bank<Track>.getItemAt -> Track).

files_changed: []
