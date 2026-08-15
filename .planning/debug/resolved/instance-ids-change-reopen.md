---
status: resolved
trigger: "Two confirmed CLAP instance IDs change after saving, closing, and reopening the same Bitwig project."
created: 2026-08-15T15:27:01-05:00
updated: 2026-08-15T16:20:49-05:00
---

## Current Focus

hypothesis: confirmed — host-state identity restoration now reaches both live UI scope and the running transport, while daemon collision handling remains limited to true simultaneous duplicate claimants
test: completed live with the rebuilt CLAP bundle using same-project save/close/reopen plus duplication of an open device
expecting: observed pass — reopened originals preserve their IDs and only the simultaneous duplicate is rekeyed
next_action: none — session resolved and ready to archive

reasoning_checkpoint:
  hypothesis: "`PluginProcessor::setStateInformation` changes `InstanceState` but not `LoopbackTransport::instanceId_` or UI scope; the transport therefore keeps handshaking with its constructor-time ID after reopen, causing the daemon to accept/rekey identities unrelated to the saved ID."
  confirming_evidence:
    - "Direct source trace shows deserialize replaces InstanceState while setStateInformation updates only Generated Mix; LoopbackTransport copied the old ID before host restoration and uses that copy in clap.hello."
    - "The new processor regression fails before the fix with `persisted instance identity did not reach live processor scope`."
    - "The non-vacuous transport regression fails to compile because no identity-rebind API exists, while all daemon lease/disconnect/collision tests pass with localhost access."
  falsification_test: "This hypothesis would be false if a successful host-state load already changed the live scope and the next transport hello to the persisted ID without reconstructing the processor; the red processor assertion and absent transport API demonstrate the opposite."
  fix_rationale: "Propagating the deserialized ID into live scope and a thread-safe transport rebind addresses the first divergence: shutting down the old socket forces a new hello under the saved ID, while daemon collision logic remains responsible only for true simultaneous duplicates."
  blind_spots: "The automated tests cannot reproduce Bitwig's exact callback timing or confirm controller-driven project relinking after reconnect; final verification still requires the original save/close/reopen workflow in Bitwig."

tdd_checkpoint: null

## Symptoms

expected: |
  Saving, closing, and reopening the same Bitwig project preserves each bw-brain instance ID. Only a simultaneous duplicated device with the same persisted ID should be rekeyed.
actual: |
  Both confirmed instance IDs changed after close/reopen while the project ID remained identical.
errors: |
  No visible error; both reopened instances connected and confirmed with newly generated IDs.
reproduction: |
  With two confirmed bw-brain instances in one Bitwig project, save and close the project, then reopen it and compare the instance IDs shown in both hosted editors.
started: |
  Observed during Phase 04.2 final persistence/fork UAT on 2026-08-15.

## Eliminated

<!-- APPEND only -->

- hypothesis: InstanceState serialization omits or corrupts the persisted instance ID.
  evidence: Complete serialization/deserialization trace and `instance_state` CTest show the exact ID round-trips; the processor regression proved deserialization succeeds before live scope diverges.
  timestamp: 2026-08-15T15:47:00-05:00

- hypothesis: Stale daemon leases survive closed sockets and rekey legitimate reopened saved IDs.
  evidence: `PeerRegistry.remove` deletes leases owned by a closing connection, and all peer-server/identity-dispatch tests pass with real localhost sockets, including disconnect removal and simultaneous collision handling.
  timestamp: 2026-08-15T15:47:00-05:00

## Evidence

<!-- APPEND only -->

- timestamp: 2026-08-15T15:24:55-05:00
  checked: Pre-close screenshot
  found: Same project ID; FM-4 instances `inst-6cfb3071-39c8-4bdb-bf97-67f1fff2e42d` and `inst-29c6a263-0d22-4d8d-8826-46088d0e2a94`.
  implication: Baseline identities before project close are known.

- timestamp: 2026-08-15T15:27:01-05:00
  checked: Post-reopen screenshot
  found: Same project ID; FM-4 instances now `inst-3250920e-9076-4a17-8c34-2c91b74c0ef3` and `inst-05434e74-0346-4c16-b0be-3e365e2b8c64`.
  implication: Project identity persists but both CLAP instance identities do not survive reopen.

- timestamp: 2026-08-15T16:03:00-05:00
  checked: Debug knowledge base
  found: No entry has two or more keyword overlaps with the silent close/reopen instance-ID change symptom.
  implication: There is no known-pattern shortcut; this session needs direct code-path evidence.

- timestamp: 2026-08-15T16:03:00-05:00
  checked: Initial source search for instance ID, state, hello, rekey, and lease paths
  found: `PluginProcessor` constructs `LoopbackTransport` from `instanceState_.instanceId()` in its constructor; `LoopbackTransport` owns a separate `instanceId_` used in `clap.hello`; identity persistence is implemented separately in `InstanceState`.
  implication: A dual-source-of-truth/initialization-order bug is a concrete candidate to test against the full implementations.

- timestamp: 2026-08-15T16:06:00-05:00
  checked: Project-specific skills and repository guidance
  found: No `.codex/skills`, `.agents/skills`, or repository-local `AGENTS.md` applies to `bw-brain`.
  implication: No additional project skill rules constrain this investigation or fix.

- timestamp: 2026-08-15T16:10:00-05:00
  checked: Complete `PluginProcessor`, `InstanceState`, and `LoopbackTransport` implementations
  found: `InstanceState::deserialize` correctly replaces the persisted ID, but `PluginProcessor::setStateInformation` updates only Generated Mix and host parameter display. It does not publish the restored ID to UI or update/restart `LoopbackTransport`. The transport worker starts in the processor constructor and copies the then-current ID into its own `instanceId_`, which it later embeds in every `clap.hello`.
  implication: Persisted state is decoded correctly but disconnected from the live peer identity; this directly supports the initialization-order/dual-source hypothesis and explains why the pure InstanceState reopen test can pass while the product fails in Bitwig.

- timestamp: 2026-08-15T16:14:00-05:00
  checked: Complete daemon peer registry/server and focused identity/transport/server tests
  found: The daemon immediately leases the ID from `clap.hello`, rekeys a simultaneous duplicate, and removes leases on socket close. Existing tests verify `InstanceState` persistence and `LoopbackTransport` hello independently, but no test loads processor host state after transport construction or asserts that the live transport switches to the restored ID.
  implication: Stale daemon leases are not required and are unlikely because disconnect removes them; the missing product-level state-to-transport propagation is untested and is now the leading causal mechanism.

- timestamp: 2026-08-15T16:17:00-05:00
  checked: CMake registration and processor-test source map
  found: `product_smoke_test` and `editor_state_test` instantiate `PluginProcessor` and save/load state, while `instance_state_test` is the only identity-specific CTest. The product source compiles `PluginProcessor` and `LoopbackTransport`, so a regression can be placed in an existing product-level test without introducing a new production seam unless its current assertions prove insufficient.
  implication: The bug escaped because the processor persistence tests likely assert settings/state bytes rather than the ID actually used in the transport hello.

- timestamp: 2026-08-15T15:33:00-05:00
  checked: Existing focused C++ and daemon test baseline
  found: `product_smoke`, `instance_state`, `loopback_transport`, and `editor_state` all pass. The daemon identity-dispatch test passes; four peer-server tests fail only because the sandbox denies binding `127.0.0.1` with `EPERM`.
  implication: Current tests reproduce the coverage gap but not the product failure. Daemon network tests require an out-of-sandbox rerun before interpreting their result.

- timestamp: 2026-08-15T15:35:00-05:00
  checked: Focused daemon peer tests with localhost binding permitted
  found: All 8 peer-server and identity-dispatch tests pass, including disconnected-peer removal and simultaneous-claim rekey behavior.
  implication: The daemon lease lifecycle behaves as designed in isolation; the plug-in's failure to present its restored ID is the confirmed divergence point.

- timestamp: 2026-08-15T15:39:00-05:00
  checked: New processor host-state reopen regression before any production fix
  found: `editor_state` aborts with `persisted instance identity did not reach live processor scope` after loading a valid serialized state whose ID is `inst-persisted-reopen`.
  implication: The original persistence symptom is now reproducible automatically at the processor boundary; deserialization succeeds but the restored identity does not propagate to live state.

- timestamp: 2026-08-15T15:41:00-05:00
  checked: Compilation of the new transport rebind regression
  found: Contrary to the prediction based on the earlier complete header read, `loopback_transport_test` compiled successfully despite calling `setInstanceId`.
  implication: The shared workspace likely changed concurrently; the current source/diff must be re-read before proceeding so another agent's edits are preserved and not misattributed.

- timestamp: 2026-08-15T15:44:00-05:00
  checked: Current transport source/diff and Release test semantics
  found: Production transport files are unchanged and contain no `setInstanceId`. The call compiled because it was nested inside `assert(...)`, which the Release build removes under `NDEBUG`; the same erasure makes this test's assertions vacuous in the current build.
  implication: The unexpected result is explained without concurrent edits. The regression must use a non-vacuous check before it can test the missing rebind mechanism.

- timestamp: 2026-08-15T15:47:00-05:00
  checked: Non-vacuous transport identity-rebind regression before production fix
  found: The build fails at `transport.setInstanceId("inst-restored")` with `no member named 'setInstanceId' in 'bw::peer::LoopbackTransport'`.
  implication: There is mechanically no way for successful host-state restoration to update the ID used by the live transport; together with the processor red test, the root cause is confirmed.

- timestamp: 2026-08-15T15:50:00-05:00
  checked: UI scope reducer semantics before implementing the fix
  found: `ScopeChanged` atomically replaces the visible scope, and a subsequent daemon `link.status` supplies authoritative project/track/instance scope. Publishing the restored instance ID immediately is safe for the normal pre-link state; reconnect then allows daemon authority to refresh the remaining scope.
  implication: The minimal processor fix can publish the restored ID without persisting or inventing project authority.

- timestamp: 2026-08-15T15:58:00-05:00
  checked: First focused verification after implementing propagation/rebind
  found: `editor_state` is green, proving host-state load now reaches live scope. `loopback_transport` aborts after about three seconds without identifying which new check failed.
  implication: Verification is incomplete; return to investigation and add observability to distinguish implementation failure from regression-test timing failure.

- timestamp: 2026-08-15T16:02:00-05:00
  checked: Instrumented transport regression failure point
  found: The first wait fails before rebind because the test's existing `bind`, `listen`, `getsockname`, `accept`, and `send` calls are themselves inside `assert(...)` and therefore never execute in the Release build.
  implication: The transport test was previously vacuous, not evidence against the implementation. Its setup must be made non-vacuous before verification can continue.

- timestamp: 2026-08-15T16:06:00-05:00
  checked: Non-vacuous transport test inside the default sandbox
  found: The test now executes its setup and fails immediately with `failed to bind test listener`, matching the sandbox's localhost `EPERM` restriction seen in daemon tests.
  implication: This is an environment refusal, not a product behavior result; rerun the same binary with localhost permission.

- timestamp: 2026-08-15T16:09:00-05:00
  checked: Focused transport regression with localhost binding permitted
  found: `loopback_transport` passes in 0.07 seconds with all setup/actions/checks evaluated, including forced disconnect/reconnect and second hello carrying `inst-restored`.
  implication: The transport half of the fix behaves as intended; together with green `editor_state`, the original divergence is self-verified and broader regression testing can begin.

- timestamp: 2026-08-15T16:13:00-05:00
  checked: Full product build and adjacent regression suites
  found: The complete CLAP product builds successfully; all 9 CLAP CTests pass, and all 65 daemon test files / 758 tests pass. The daemon run emits only pre-existing MaxListeners warnings.
  implication: The fix does not regress isolated persistence, UI, peer routing, collision leases, telemetry, scheduling, generated-note cleanup, or daemon behavior under the available automated coverage.

- timestamp: 2026-08-15T16:18:00-05:00
  checked: Reconnect stability and final patch review
  found: The non-vacuous `loopback_transport` regression passes 20 consecutive localhost runs with zero failures. `git diff --check` is clean; the task diff is limited to processor state propagation, mutex-protected transport identity rebinding, and focused regressions (including fixing Release-erased transport assertions).
  implication: The fix is stable under repeated local reconnect timing and ready for the required real Bitwig verification checkpoint.

- timestamp: 2026-08-15T16:20:49-05:00
  checked: Final human verification in rebuilt CLAP loaded by Bitwig
  found: Human confirmed that saving, closing, and reopening the same project preserves the original instance IDs, while duplicating an open device rekeys only the duplicate.
  implication: The fix satisfies both sides of the identity contract in the real host workflow; the session is resolved and can be archived.

## Resolution

root_cause: "`PluginProcessor` starts `LoopbackTransport` in its constructor with a copied constructor-time instance ID. Later JUCE/CLAP host-state restoration deserializes the saved ID only into `InstanceState`; it neither updates live UI scope nor changes/reconnects the transport. Reopened instances therefore hello with the wrong ID and receive fresh daemon identity outcomes despite valid persisted state."
fix: "Added a mutex-protected `LoopbackTransport::setInstanceId` that replaces the live identity and shuts down the current socket so the next hello uses the restored ID. Successful processor state restoration now copies settings/ID under the state lock, publishes the restored ID to UI scope, and rebinds the transport. Added processor and transport regressions for reopen propagation and reconnect hello identity."
verification: "Self-verified: full product build succeeds; 9/9 CLAP CTests pass; 65 daemon files / 758 tests pass; the identity reconnect regression passes 20 consecutive runs; `git diff --check` is clean. Human verification passed in rebuilt CLAP loaded by Bitwig: same-project save/close/reopen preserves the original instance IDs, and duplicating an open device rekeys only the duplicate."
files_changed: ["clap/src/PluginProcessor.cpp", "clap/src/peer/LoopbackTransport.h", "clap/src/peer/LoopbackTransport.cpp", "clap/tests/editor_state_test.cpp", "clap/tests/loopback_transport_test.cpp"]
