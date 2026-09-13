---
status: diagnosed
trigger: "Phase 03.1 UAT Test 3 blocker — clipSid does NOT populate on clip selection. bw-focus export shows stateFreshness: stale, selection: {} (empty). Without selection.clipSid the apply/revert pre-flight gates (D-04/D-05) have nothing to compare and fall through to the caveated pre-clipSid path — defeats the entire phase goal (M4 wrong-clip blocker fix)."
created: 2026-07-05T03:55:00.000Z
updated: 2026-07-05T04:35:00.000Z
---

## Current Focus

hypothesis: CONFIRMED with decisive physical evidence. The `bw-brain.bwextension` artifact at `bridge/target/bw-brain.bwextension` (the file Bitwig loads) was packaged at 2026-07-04 10:42:38 — this is ~9h47min BEFORE the D-03a/b/c/d ClipSid code (commit 3e88063 at 2026-07-04 20:30:11) and ~5h30min before even the M4 clip-read fix (commit f521feb at 16:12). The artifact does NOT contain `ClipSid.class` (unzip-verified) and therefore CANNOT emit `clipSid` in either the `clip.name_changed` push payload (D-03a) OR the `get.selected_clip` pull response (D-03b). The daemon's defensive backward-compat folds then NO-OP as designed, leaving `selection: {}`. Tests 1 + 2 PASS because they exercise only socket lifecycle, not the clipSid pipeline. This is an environment/setup issue (stale artifact loaded), NOT a code bug at HEAD. The HEAD code path is correct (verified end-to-end below).
test: unzip-list the .bwextension → no ClipSid.class; stat the artifact mtime → 10:42:38; git log the D-03 commit → 20:30:11; delta = 9h47min stale. Cross-verified: `target/classes/ClipSid.class` exists (mtime 20:29:30 — someone ran `mvn compile` + `mvn test`, but NEVER re-ran `mvn package` after the D-03 code landed).
expecting: After the producer runs `mvn -pl bridge package` (or `mvn package`) and reinstalls the resulting `bridge/target/bw-brain.bwextension` into Bitwig (disable controller → re-enable, or restart Bitwig), the loaded extension will contain ClipSid.class + the D-03a/b wire, `clip.name_changed` events will carry `clipSid`, `get.selected_clip` responses will carry top-level `clipSid`, and `selection.clipSid` will populate on clip selection. No code change required.
next_action: Diagnosis complete (goal: find_root_cause_only). Return ROOT CAUSE FOUND to plan-phase --gaps. The "fix" is a rebuild + reinstall workflow gate, NOT a source-code edit.

reasoning_checkpoint:
  hypothesis: "The .bwextension loaded by the producer in Bitwig is a pre-03.1-02 build that predates the D-03a/b/c/d ClipSid changes (and pre-03.1-01 lifecycle refactor). The stale bridge emits clip.name_changed with NO clipSid payload + responds to get.selected_clip with NO top-level clipSid field, so the daemon's two population paths (fold-event.ts clip.name_changed case + boot.ts refreshSnapshot D-03d fold) both NO-OP via their documented backward-compat guards, leaving selection = {}."
  confirming_evidence:
    - "PHYSICAL ARTIFACT EVIDENCE: `stat bridge/target/bw-brain.bwextension` → mtime 2026-07-04 10:42:38. `git log -- bridge/src/main/java/com/bwbrain/bridge/ClipSid.java` → 3e88063 at 2026-07-04 20:30:11. The artifact is 9h47min OLDER than the ClipSid-introducing commit. Maven's `mvn package` was never re-run after 03.1-02 code landed."
    - "BINARY CONTENT EVIDENCE: `unzip -l bridge/target/bw-brain.bwextension | grep -i clipsid` returns ZERO matches — ClipSid.class is absent from the packaged extension. Contrast: `ls bridge/target/classes/com/bwbrain/bridge/ClipSid.class` exists (compiled at 20:29:30 — i.e. someone ran `mvn compile`/`mvn test` but NEVER `mvn package`)."
    - "SYMPTOM MATCH (pull path): the stale bridge's PullHandlers.buildClipResponse returns `{notes:[...]}` with NO top-level clipSid (the D-03b payload.put(\"clipSid\", clipSid) line is absent). boot.ts:215 `if (typeof clipResp.clipSid === \"string\" && clipResp.clipSid)` evaluates false → no fold → selection stays {} after refreshSnapshot. This matches the producer's observation exactly."
    - "SYMPTOM MATCH (push path): the stale bridge's Observers.wireCursorClip emits `clip.name_changed` with empty payload (the D-03a `mapOf(\"clipSid\", clipSid)` line is absent). fold-event.ts:114-117 returns state unchanged via the documented backward-compat NO-OP when clipSid is undefined. So even if events ARE flowing, clipSid never lands in selection."
    - "STATEFRESHNESS STALE EXPLAINED: refreshSnapshot's get.project_summary pull DOES succeed (Test 1 cold-start passed), and dispatcher.ts:107 calls watchdog.onBridgeMessage() on the response → watchdog goes `live` momentarily. Then >5s of no further envelopes → watchdog.tick() returns `stale` (stale-watchdog.ts:77). The producer's observation window was after that 5s threshold. Consistent."
    - "TESTS 1 + 2 PASS EXPLAINED: Test 1 (cold start) only verifies socket + get.project_summary round-trip — succeeds with any bridge version. Test 2 (auto-reconnect) is more suspicious (the pre-03.1-01 build's startConnector is connect-once-then-exit and should NOT auto-reconnect) — see blind_spots. Neither test exercises the clipSid pipeline, so neither surfaces the staleness."
  falsification_test: "If this hypothesis is wrong, then rebuilding + reinstalling the .bwextension would NOT fix the symptom. Falsification would be: producer runs `mvn -pl bridge clean package`, installs the new bw-brain.bwextension, restarts Bitwig, re-runs Test 3, and STILL observes selection: {}. The HEAD code-level evidence (fold-event.ts, boot.ts, PullHandlers.java, Observers.java, event.schema.json all verified to carry clipSid end-to-end) makes this highly unlikely."
  fix_rationale: "There is NO source-code fix at HEAD — the code is correct (see Investigation). The 'fix' is operational: (1) rebuild via `mvn -pl bridge clean package -DskipTests=false`, (2) reinstall the resulting `bridge/target/bw-brain.bwextension` into Bitwig's Controllers directory (or wherever the producer side-loads it), (3) restart Bitwig OR disable+re-enable the bw-brain controller in Settings → Controllers to force the new .bwextension to load. Optionally: add a build-vs-source freshness CI gate (jar timestamp vs latest bridge-src commit) so this staleness fails CI instead of UAT."
  blind_spots: |
    1. LIVE VERIFICATION NOT PERFORMED: I cannot run Bitwig or install the extension myself. Confidence rests on (a) the physical artifact evidence (mtime + missing ClipSid.class), (b) end-to-end code-level verification of the HEAD clipSid path, and (c) the symptom's exact match to the documented backward-compat NO-OP behavior. The producer must confirm by rebuilding + reinstalling + re-running Test 3.
    2. PRODUCER'S INSTALLED COPY: I verified the staleness of `bridge/target/bw-brain.bwextension` (Maven's output). The producer may install a COPY elsewhere (e.g. ~/Documents/Bitwig Studio/Controller Scripts/ or via Bitwig's UI). I did NOT find an install-script automation in this repo (only `scripts/{check-capabilities-doc,check-deprecated-bridge,gen-types}.mjs` — none touch Bitwig's install location). So either the producer copied `target/bw-brain.bwextension` manually (most likely — same staleness applies), or they have a side-loaded build I cannot see. Either way the path-of-record is the packaged artifact, and it is stale.
    3. TEST 2 (auto-reconnect) PASS IS SUSPICIOUS: the pre-03.1-01 build's `startConnector` (verified via `git show f521feb:.../BridgeExtension.java`) is connect-once-then-exit — it should NOT auto-reconnect after daemon restart. Yet Test 2 was reported PASS. Three explanations: (a) the producer actually has a NEWER build loaded (post-03.1-01 but pre-03.1-02, between commits 04a0556 and 3e88063) — which would mean the artifact in target/ is even STALER than what's loaded (someone rebuilt to a side location but not to target/), (b) the producer toggled the controller without flagging it as a "manual intervention," (c) Test 2 PASS criterion was applied leniently. Option (a) is the most charitable reading and is STILL consistent with the Test 3 failure (any pre-3e88063 build lacks ClipSid). The root cause for Test 3 is unchanged: the loaded build lacks D-03a/b/c/d.

## Symptoms

expected: |
  clipSid populates on clip selection (D-01/D-03) — when a clip is selected in Bitwig, the daemon's `state.selection.clipSid` populates with a value matching `^clip_[0-9a-f]{16}$`. Selecting clips of different loop lengths (4-bar vs 8-bar) on the same track produces different clipSids. clipSid stays stable across note edits.
actual: |
  State is stale and no selection appears even though a clip is selected in Bitwig and daemon is connected. `bw-focus export --explain` returns: stateFreshness: "stale", payload.selection: {} (empty), payload.transport: {playing:false}. No clipSid can populate because selection itself is empty.
errors: |
  None reported — no crash, no exception. Just empty `selection: {}` + `stateFreshness: stale`. (This is itself the smoking gun: the daemon's defensive backward-compat folds + watchdog behave EXACTLY as designed when the bridge supplies no clipSid — they NO-OP silently. The schema fold's `typeof p.clipSid === "string" ? p.clipSid : undefined` returns undefined and the function returns state unchanged; no error is thrown because this is the documented pre-fix-bridge compat path.)
reproduction: |
  Phase 03.1 UAT Test 3 (.planning/phases/03.1-.../03.1-UAT.md): with the daemon running + bridge connected + a clip selected in Bitwig, run `bw-focus export --explain`. Observe stateFreshness: stale + selection: {}.
started: |
  Discovered during end-of-phase UAT for Phase 03.1 (the gap-closure phase for the M4 wrong-clip blocker). The 03.1-02 plan that shipped the D-03 clipSid mechanics committed at 2026-07-04 20:26-20:30. The UAT ran starting 2026-07-05 03:18:54Z (≈ 2026-07-04 22:18 CDT) — about 2 hours after the D-03 code landed. The packaged artifact predates the code by ~10 hours, so the UAT never had a chance to exercise the new path.

## Eliminated

<!-- APPEND only -->

- hypothesis: HEAD code has a bug in fold-event.ts clip.name_changed case (e.g. the spread fold overwrites clipSid, or the typeof guard rejects valid strings).
  evidence: |
    Read fold-event.ts:104-119. The case is `const clipSid = typeof p.clipSid === "string" ? p.clipSid : undefined; if (clipSid === undefined) return state; return { ...state, selection: { ...state.selection, clipSid } };`. Correct — spreads existing selection (preserves other fields), sets clipSid. Tested by fold-event.test.ts (+2 cases per 03.1-02 SUMMARY line 112). The full daemon suite is 495/495 green.
  timestamp: 2026-07-05T04:05:00Z

- hypothesis: HEAD code has a bug in boot.ts refreshSnapshot D-03d fold (e.g. the second pull silently fails OR the fold condition is wrong).
  evidence: |
    Read boot.ts:177-229 + 213-223. The D-03d block pulls get.selected_clip inside a NESTED try/catch (does NOT propagate failure to the outer project_summary path). The fold condition is `if (typeof clipResp.clipSid === "string" && clipResp.clipSid)` — correct (rejects undefined/null/empty). The spread `selection: { ...lastState.selection, clipSid: clipResp.clipSid }` preserves other fields. The only way this leaves selection empty is if `clipResp.clipSid` is NOT a non-empty string — which is EXACTLY what the stale bridge produces.
  timestamp: 2026-07-05T04:08:00Z

- hypothesis: Schema (event.schema.json) rejects the clipSid field, so the reader's Ajv gate drops clip.name_changed events silently.
  evidence: |
    Read schemas/protocol/event.schema.json:34-38. The payload.properties now includes `clipSid: { type:"string", pattern:"^(trk|clip|dev)_[0-9a-f]{16}$", description:"...D-03 push..." }`. additionalProperties stays false (preserved per 03.1-02 SUMMARY line 108). The ClipSidTest asserts ClipSid.derive output matches this pattern. So a HEAD-built bridge emits a pattern-valid clipSid and the schema accepts it. NOT the bug.
  timestamp: 2026-07-05T04:10:00Z

- hypothesis: PullHandlers.buildClipResponse at HEAD doesn't actually put clipSid in the response (signature mismatch, dropped param, etc.).
  evidence: |
    Read PullHandlers.java:68-88. Signature is `buildClipResponse(String id, List<NoteView> notes, String clipSid)`. Body: `payload.put("notes", notesPayload); payload.put("clipSid", clipSid);`. handleSelectedClip (lines 178-205) calls it with `ClipSid.derive(observers.getCursorTrackName(), loopBeats)`. Correct. PullHandlersTest asserts clipSid rides the payload top level (per 03.1-02 SUMMARY line 117). NOT the bug.
  timestamp: 2026-07-05T04:12:00Z

- hypothesis: Observers.wireCursorClip at HEAD doesn't actually emit clipSid in the clip.name_changed event (e.g. mapOf call missing the entry).
  evidence: |
    Read Observers.java:104-129. Body: `final String clipSid = ClipSid.derive(cursorTrackName, len); outbox.offer(LineJson.event("clip.name_changed", mapOf("clipSid", clipSid), ts()));`. Correct. LineJson.event (LineJson.java:34-41) serializes the payload Map faithfully via Jackson. NOT the bug.
  timestamp: 2026-07-05T04:14:00Z

- hypothesis: The 03.1-01 lifecycle refactor (runConnectorCycle) drops observers on reconnect (observers only wired once in init() and never re-armed, so after a reconnect no events fire).
  evidence: |
    Read BridgeExtension.java:54-99 + runConnectorCycle 143-188. `observers.register(...)` is called ONCE in init() (line 75) — it survives across reconnects by design (observers are stateful Bitwig callbacks; they fire on the Bitwig controller thread independent of the connector cycle). runConnectorCycle only manages socket + Outbox + PullHandlers threads. The 03.1-01 SUMMARY line 95 explicitly notes the reconnect test uses "null cursorClip/observers (safe because no inbound request lines arrive...)" — confirming observers are orthogonal to the cycle. NOT the bug. (And irrelevant to Test 3 anyway — Test 3 is a COLD START, not a post-reconnect scenario.)
  timestamp: 2026-07-05T04:16:00Z

## Evidence

<!-- APPEND only -->

- timestamp: 2026-07-05T03:58:00Z
  checked: `stat bridge/target/bw-brain.bwextension` (the Bit extension artifact Maven produces via shade-plugin → rename).
  found: mtime = 2026-07-04 10:42:38. Size 2390566 bytes. Owner eggfam.
  implication: The artifact is from the morning of Jul 4. Phase 03.1's code all landed the EVENING of Jul 4 (19:33-20:56). The artifact is at least 5h30min stale relative to the earliest 03.1 commit and 9h47min stale relative to the D-03a/b ClipSid commit.

- timestamp: 2026-07-05T04:00:00Z
  checked: `unzip -l bridge/target/bw-brain.bwextension | grep clipsid` (case-insensitive) — content listing of the packaged extension.
  found: ZERO matches. The .bwextension contains: Outbox, BridgeExtension, PullHandlers (+ inner classes), LineJson, Observers, BridgeDefinition — but NO ClipSid class. (The ClipSid.java source was CREATED in commit 3e88063 at 2026-07-04 20:30:11; the artifact was packaged 9h47min earlier, so it physically cannot contain ClipSid.class.)
  implication: Decisive. The packaged extension is a pre-03.1-02 build. It cannot emit clipSid on either path (D-03a push or D-03b pull) because the code that does so does not exist in this binary.

- timestamp: 2026-07-05T04:02:00Z
  checked: `stat bridge/target/classes/com/bwbrain/bridge/*.class` — Maven's compiled-output directory.
  found: target/classes/com/bwbrain/bridge/ClipSid.class exists, mtime 2026-07-04 20:29:30. All other .class files in target/classes also have mtime 2026-07-04 20:29:30 (BridgeExtension, Observers, PullHandlers, Outbox, etc.). Test-classes directory includes ClipSidTest.class + BridgeExtensionReconnectTest.class + OutboxResetTest.class.
  implication: Someone ran `mvn compile` (and `mvn test-compile`) at 20:29:30 — i.e. the GREEN iteration of 03.1-02 Task 2, just before the 3e88063 commit at 20:30:11. They ran the tests (ClipSidTest + OutboxResetTest + BridgeExtensionReconnectTest all passed per the SUMMARIES). But they NEVER ran `mvn package` after that — which is the only Maven phase that re-builds the .bwextension via the shade plugin (pom.xml confirms `<phase>package</phase>` → `<goal>shade</goal>` with `<outputFile>${project.build.directory}/bw-brain.bwextension</outputFile>`). So the packaged artifact stayed at the morning's 10:42 build.

- timestamp: 2026-07-05T04:18:00Z
  checked: Full end-to-end trace of the clipSid pipeline at HEAD (boot.ts → dispatcher → fold-event → schema + Observers → LineJson → PullHandlers → ClipSid).
  found: Every link in the chain at HEAD is correct. The schema accepts clipSid (event.schema.json:34-38). The fold handles it (fold-event.ts:104-119). The boot.ts refreshSnapshot pulls + folds it (boot.ts:213-223). The bridge emits it on both paths (Observers.java:122-128 push, PullHandlers.java:178-205 pull). LineJson serializes arbitrary Map payloads faithfully (LineJson.java:34-41). The only failing condition is: the bridge currently LOADED in Bitwig is the pre-03.1-02 build, so it sends the OLD shapes (no clipSid), and the daemon's defensive backward-compat folds NO-OP as designed.
  implication: No code change at HEAD would fix the symptom. The fix is rebuild + reinstall.

- timestamp: 2026-07-05T04:20:00Z
  checked: Pre-03.1-01 startConnector shape via `git show f521feb:bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java`.
  found: The pre-03.1-01 startConnector was connect-once-then-exit: `while (running && socket == null) { ...try to connect... } if (socket == null) return; outbox.startWriterThread(socket); pullThread = PullHandlers.start(...)`. After connecting, the connector thread EXITS. On subsequent daemon restart, the bridge has no mechanism to reconnect — the producer must toggle the controller (which calls exit()+init() again).
  implication: If the loaded extension is the pre-03.1-01 build (which the target/ artifact IS), Test 2 (auto-reconnect) should NOT have passed. The reported PASS for Test 2 is suspicious — see blind_spots. Three explanations: (a) producer has a slightly newer build side-loaded (post-03.1-01 but pre-03.1-02), (b) producer toggled controller without flagging, (c) Test 2 PASS criterion was lenient. None of these change the Test 3 root cause.

- timestamp: 2026-07-05T04:22:00Z
  checked: The StaleWatchdog state machine (daemon/src/state/stale-watchdog.ts).
  found: Freshness starts "disconnected" (line 55). Transitions to "live" ONLY via onBridgeMessage() (line 58) — called from dispatcher.ts:98 (hello) and dispatcher.ts:107 (response). Transitions to "stale" via tick() when Date.now() - lastBridgeAt > 5000 (line 77). Transitions to "disconnected" via onBridgeDisconnect() (line 64). tick() returns "disconnected" without changing state if already disconnected (line 74-76).
  implication: The producer's "stale" report (NOT "disconnected") PROVES at least one bridge envelope arrived after boot — i.e. refreshSnapshot's get.project_summary pull round-tripped (the response triggered dispatcher's watchdog.onBridgeMessage at line 107). This is consistent with the cold-start flow: bridge connects → refreshSnapshot pulls project_summary → bridge responds → watchdog goes live → 5s pass with no events → watchdog goes stale. NOT consistent with "no bridge connection at all" (that would be "disconnected"). So the bridge IS connected and IS responding to pulls — it's just not emitting clipSid (because the loaded build predates D-03).

## Resolution

root_cause: |
  SINGLE ROOT CAUSE — STALE BRIDGE ARTIFACT. The `bw-brain.bwextension` packaged at `bridge/target/bw-brain.bwextension` (and the copy the producer loaded into Bitwig for the Phase 03.1 UAT) is a pre-03.1-02 build, packaged at 2026-07-04 10:42:38. This predates the D-03a/b/c/d ClipSid changes (commit 3e88063 at 2026-07-04 20:30:11 — 9h47min later) and even predates the 03.1-01 lifecycle refactor (commits d80796b + 04a0556 at 2026-07-04 20:11-20:18). Decisive physical evidence:

  1. `stat bridge/target/bw-brain.bwextension` → mtime 2026-07-04 10:42:38.
  2. `unzip -l bridge/target/bw-brain.bwextension | grep -i clipsid` → ZERO matches (ClipSid.class is absent from the packaged extension).
  3. `stat bridge/target/classes/com/bwbrain/bridge/ClipSid.class` → exists, mtime 2026-07-04 20:29:30 (someone ran `mvn compile`/`mvn test`, but NEVER `mvn package`, after the D-03 code landed).

  WHY THIS CAUSES THE SYMPTOM: the stale bridge emits the PRE-03.1 wire shapes:
   - clip.name_changed push payload = {} (empty — the D-03a `mapOf("clipSid", clipSid)` line is absent).
   - get.selected_clip pull response = {notes:[...]} (no top-level clipSid — the D-03b `payload.put("clipSid", clipSid)` line is absent).

  The daemon's two population paths then BOTH NO-OP via their documented backward-compat guards (which exist precisely to keep pre-fix bridges working):
   - boot.ts:215 `if (typeof clipResp.clipSid === "string" && clipResp.clipSid)` → false (clipSid is undefined) → no fold.
   - fold-event.ts:114-117 `const clipSid = typeof p.clipSid === "string" ? p.clipSid : undefined; if (clipSid === undefined) return state;` → returns state unchanged.

  Result: selection stays {} after both refreshSnapshot AND any clip.name_changed events. The watchdog goes `stale` after 5s of no envelopes (the only envelope that arrived was the get.project_summary response, which only marks live momentarily). The producer observes the state AFTER those 5s and sees stateFreshness: stale + selection: {} — exactly the reported symptom.

  WHY TESTS 1 + 2 PASSED: Test 1 (cold start) only verifies socket lifecycle + get.project_summary round-trip — these work with ANY bridge version (pre- or post-03.1). Test 2 (auto-reconnect) is more suspicious: the pre-03.1-01 build's startConnector is connect-once-then-exit and should NOT auto-reconnect. The reported PASS for Test 2 most likely means the producer has a slightly newer side-loaded build (post-03.1-01, pre-03.1-02) OR applied the criterion leniently. Either way, neither test exercises the clipSid pipeline, so neither surfaces the staleness.

  WHY THE HEAD CODE IS CORRECT: every link in the chain at HEAD is verified — event.schema.json:34-38 (clipSid in payload), fold-event.ts:104-119 (fold), boot.ts:213-223 (D-03d pull-fold), Observers.java:122-128 (D-03a push), PullHandlers.java:68-88+178-205 (D-03b pull), ClipSid.java (exists, deterministic, pattern-valid per ClipSidTest). The 03.1-02 SUMMARY records 495/495 daemon tests + 30/30 bridge tests green. The code is NOT the bug.

  THIS IS AN ENVIRONMENT/SETUP ISSUE, NOT A CODE BUG. The fix is operational (rebuild + reinstall), not a source-code edit.

fix: |
  OUT OF SCOPE (goal: find_root_cause_only). For plan-phase --gaps:

  1. OPERATIONAL FIX (the actual unblock):
     a. `cd bridge && mvn clean package` (or `mvn -pl bridge clean package` from repo root). This re-runs the shade plugin and produces a fresh `bridge/target/bw-brain.bwextension` containing ClipSid.class + the D-03a/b wire.
     b. The producer must REINSTALL the new `bridge/target/bw-brain.bwextension` into Bitwig's controller-scripts location (wherever they previously installed it — there's no automation in this repo; `scripts/` contains only check-capabilities-doc.mjs, check-deprecated-bridge.mjs, gen-types.mjs — none touch Bitwig's install dir).
     c. Restart Bitwig OR disable+re-enable the bw-brain controller in Settings → Controllers to force the new .bwextension to load (Bitwig caches loaded extensions; a hot-swap of the file is not always picked up).
     d. Re-run UAT Test 3 (select a clip → `bw-focus export --explain` → selection.clipSid should populate). Test 4 + Test 5 (apply/revert pre-flight gates) become unblocked once Test 3 passes.

  2. PROCESS GATE (prevent recurrence — optional but recommended):
     Add a CI/verify step that compares `stat -f %m bridge/target/bw-brain.bwextension` (artifact mtime) against the latest mtime/commit-time of `bridge/src/main/java/**/*.java`. If the artifact is older than the source, FAIL the verification with a clear "stale .bwextension — run mvn package" message. The existing `scripts/check-deprecated-bridge.mjs` is a precedent for a bridge-specific CI gate; this would be a sibling script (e.g. `scripts/check-bridge-artifact-fresh.mjs`). The current pre-UAT checklist apparently does not catch this — the 03.1-02 + 03.1-03 SUMMARIES both record green mvn test runs but neither records an mvn package run, and the UAT ran anyway.

  3. NO SOURCE-CODE CHANGES REQUIRED. The HEAD code is correct. Any source edit applied in response to this symptom (e.g. "tightening" the fold's typeof check, or adding a fallback clipSid derivation in the daemon) would be a NO-OP-at-best / harmful-at-worst change because the actual failure mode is "the bridge never sent clipSid in the first place."

verification: |
  Diagnosis-only — no code changed, no operational fix performed (find_root_cause_only goal). Confidence rests on:
   (a) Physical artifact evidence (mtime + missing ClipSid.class in the packaged .bwextension; present ClipSid.class in target/classes) — objective, repeatable, unforgeable.
   (b) End-to-end code-level verification of the HEAD clipSid pipeline (6 files, all correct).
   (c) The symptom's exact match to the daemon's documented backward-compat NO-OP behavior when a pre-fix bridge sends no clipSid.
  The producer must perform the live verification: rebuild + reinstall + re-run UAT Test 3 → selection.clipSid should populate.

files_changed: []
