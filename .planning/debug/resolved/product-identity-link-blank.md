---
status: resolved
trigger: "Product CLAP is connected in Bitwig, but Project, Track, and Instance remain blank even with a clip selected."
created: 2026-08-14T10:24:38-05:00
updated: 2026-08-14T12:18:26-05:00
---

## Current Focus

hypothesis: "Confirmed — the stale loaded bridge artifact caused the live blank identity fields; after installing and reloading the tested current artifact, live controller correlation completes."
test: "Completed human verification after fully restarting Bitwig and repeating the original Bass 2/S3 Confirm-link workflow."
expecting: "Met — Project, Track, and Instance populate and the link state becomes confirmed."
next_action: "None — archive the resolved debug session."

reasoning_checkpoint:
  hypothesis: "The live product cannot reach pending identity confirmation because Bitwig loaded an August 6 bridge archive whose PullHandlers has no get.clap_correlation case; that request becomes unknown_request and fails ControllerCorrelationService.accept."
  confirming_evidence:
    - "The installed archive is dated August 6, while git commit 90f7e90 added get.clap_correlation on August 10."
    - "Direct archive inspection found no ClapCorrelation.class and no get.clap_correlation string in the installed PullHandlers.class."
    - "The current-source Maven package passed all 46 tests, contains ClapCorrelation.class and get.clap_correlation, passes the artifact gate, and has a different SHA-256 from the installed archive."
  falsification_test: "Finding ClapCorrelation.class/get.clap_correlation in the exact installed archive Bitwig loads, or observing that an exact current-artifact install still answers unknown_request, would disprove the claimed artifact mechanism."
  fix_rationale: "Installing the current tested archive replaces the request dispatcher Bitwig actually executes, so the real get.clap_correlation request can reach the same response implementation exercised by the passing bridge and daemon tests."
  blind_spots: "Bitwig must reload the extension after replacement; after that, the current observer cache may still report selected-device availability false if its initial callback is discarded, so live confirmation remains required and may expose a second defect."

## Symptoms

expected: |
  With the daemon and bridge connected, selecting the relevant Bitwig track/clip and using Confirm link should populate Project, Track, and Instance, after which Set focus can establish focus. Selection alone may remain only a hint and must not silently authorize edits.
actual: |
  The hosted editor reports connected | closed | idle, but Project, Track, and Instance are blank and the only identity text is [hint]. A clip named S3 is visibly selected on the Bass 2 track.
errors: |
  No visible error or refusal is shown.
reproduction: |
  Run daemon and current bridge, load the product bw-brain CLAP on Bass 2 in Bitwig together mode, select launcher clip S3, and open the hosted editor. Identity fields remain blank.
started: |
  Observed during Phase 04.2 final live UAT. This path has not yet been demonstrated working live.

## Eliminated

<!-- APPEND only -->

- hypothesis: The earlier clap-probe blank-editor Cocoa-parenting bug also causes the product identity fields to be blank.
  evidence: PluginEditor is constructed by PluginProcessor::createEditor, renders the context/status controls, and the screenshot shows live connected status; the prior bug produced no attached editor at all.
  timestamp: 2026-08-14T10:31:00-05:00

## Evidence

<!-- APPEND only -->

- timestamp: 2026-08-14T10:24:38-05:00
  checked: User screenshot of Bitwig product editor
  found: Header reads connected | closed | idle; Project, Track, Instance are empty; [hint] appears; selected launcher clip S3 is visible on Bass 2.
  implication: Native peer connectivity is healthy, while identity correlation/confirmation is incomplete or has not been invoked successfully.

- timestamp: 2026-08-14T10:27:05-05:00
  checked: Debug knowledge base using keywords Bitwig, blank, and editor
  found: Candidate match clap-probe-blank-editor previously involved a Cocoa editor that was never created or parented, plus unrelated stepped parameter metadata.
  implication: This candidate must be tested first, but the present screenshot already suggests a different mechanism because the product editor is visible and rendering live connection state.

- timestamp: 2026-08-14T10:31:00-05:00
  checked: Complete PluginEditor, UiState, PluginProcessor, LoopbackTransport, SessionActions, and ControllerCorrelationService implementations
  found: Confirm link enqueues linkConfirmAccept with the current confirmationNonce; PluginProcessor never drains uiActions; LoopbackTransport sends only clap.hello and parses only clap.accept/instance.rekey; SessionActions requires link.confirm.request before link.confirm.accept.
  implication: The visible button is disconnected from the peer action protocol, and its action kind also starts at the second step of a two-step confirmation exchange.

- timestamp: 2026-08-14T10:35:00-05:00
  checked: Repository-wide UiActionQueue and link-confirm consumer search
  found: UiActionQueue::tryPop has no production caller, and link.confirm.request/accept appear only in daemon SessionActions; no CLAP code serializes either message.
  implication: Clicking Confirm link cannot put any identity command on the socket, so the daemon correlation service is never invoked.

- timestamp: 2026-08-14T10:35:00-05:00
  checked: identity.schema.json, generated types, PeerServer validation, and SessionActions dispatch names
  found: The socket validator accepts identity.link.request/confirm, while SessionActions handles link.confirm.request/accept; the structures also differ.
  implication: Adding only a CLAP queue drain would still fail at PeerConnection validation or dispatch because the protocol contract is internally inconsistent.

- timestamp: 2026-08-14T10:34:32-05:00
  checked: Isolated Ajv validation using the exact identity schema
  found: link.confirm.request=false and link.confirm.accept=false; identity.link.request=true.
  implication: PeerConnection closes before SessionActions can see the messages its implementation expects.

- timestamp: 2026-08-14T10:34:32-05:00
  checked: Runtime composition root and project identity sources
  found: boot routes every peer message only to ActionDispatch, never SessionActions; no initial UI control or daemon message supplies project/track scope, so the existing SessionActions request shape cannot be constructed from the blank editor.
  implication: The repair must route identity actions separately and derive the pending scope from the accepted connection lease plus the daemon's live controller-derived selection, keeping names hint-only.

- timestamp: 2026-08-14T10:36:53-05:00
  checked: Full fix boundary against Phase 04.2 D-10/D-11 plans and current tests
  found: Existing tests cover queue insertion, socket hello/reconnect, controller correlation, schema fixtures, and daemon session actions separately, but no test crosses any adjacent pair from editor click through confirmed UI state; project ID bootstrap/selection is also absent.
  implication: This is an integration omission rather than a local field-rendering defect; a partial one-file fix would remain unreachable at the next boundary.

- timestamp: 2026-08-14T10:44:22-05:00
  checked: Complete Phase 04.2 link/UI contracts plus native, daemon, and bridge composition interfaces before fixing
  found: The UI plan explicitly requires a pending then explicit-confirm interaction; the daemon owns a single current controller selection but has no durable active-project bootstrap, while PeerRegistry already owns the accepted connection-to-instance lease.
  implication: The minimal safe repair is a two-step schema-valid protocol whose request trusts neither names nor client scope, derives instance/track/clip from daemon-owned state, and creates or reloads a persisted daemon-minted active project ID.

- timestamp: 2026-08-14T10:58:24-05:00
  checked: Implemented identity protocol across generated schema/types, native editor queue/transport/reducer, daemon session routing, accepted lease state, live selection scope, and durable active-project identity
  found: The first native action is now link.confirm.request; the daemon derives the scope, correlates it through the bridge, returns a pending nonce, accepts only that exact nonce-bound tuple, persists it, marks the lease confirmed, and sends a link.status response that populates the UI.
  implication: Every previously missing causal edge is present, while names remain display-only hints and cannot authorize the link.

- timestamp: 2026-08-14T10:58:24-05:00
  checked: Native and daemon regression suites
  found: Native CMake build passed and CTest passed 9/9; the combined daemon run passed 5 files and 89 tests, including an isolated full request/pending/accept/confirmed/focus smoke test through a fake bridge and reconnect-safe ephemeral peer ports.
  implication: The fixed flow is exercised at model, socket transport, schema, session-action, persistence, bridge-correlation, and runtime-composition boundaries.

- timestamp: 2026-08-14T10:58:24-05:00
  checked: Bridge regressions, generated artifacts, diff hygiene, and daemon-wide static typecheck
  found: ClapCorrelationTest and PullHandlersApplyPatchTest passed; CLAP types regenerated; git diff --check passed. The repository-wide daemon tsc --noEmit remains red only on existing diagnostics outside the changed production files.
  implication: Targeted native/daemon/bridge verification is green; the only unresolved verification boundary is the real Bitwig observer timing and installed product bundle.

- timestamp: 2026-08-14T11:00:00-05:00
  checked: Human verification after installing the rebuilt product in live Bitwig
  found: The editor remains connected | closed | idle. After Confirm link, only Instance populates as inst-local [hint]; Project and Track stay blank, repeated Confirm link never becomes confirmed, and Bass 2 plus S3 are visibly selected.
  implication: The fake-bridge test does not model the failing boundary. The live request resolves the instance lease but does not complete authoritative controller correlation, so investigation must target the actual controller response, runtime composition, and bridge artifact Bitwig loaded.

- timestamp: 2026-08-14T11:18:58-05:00
  checked: Complete ClapCorrelation, PullHandlers correlation dispatch, ControllerCorrelationService acceptance, and Observers initialization paths
  found: The bridge sets correlation available from nonblank observers.getCursorDeviceName(), but wireCursorDevice skips the initial name callback before writing the cache; cursor-track and track-bank caches use the same discard-before-cache pattern.
  implication: A device that is already current when the extension initializes leaves the authoritative live cache blank until a later name change, producing available:false even though the CLAP and its editor are visibly present.

- timestamp: 2026-08-14T11:19:52-05:00
  checked: Exact installed Bitwig bridge artifact, class inventory, embedded request strings, source history, and build timestamps
  found: The installed bw-brain.bwextension is dated August 6 and contains no ClapCorrelation.class; its PullHandlers.class contains get.clap_capabilities but not get.clap_correlation. Git shows controller correlation was added August 10 in commit 90f7e90, and current compiled classes are August 10 while no current packaged bwextension exists in bridge/target.
  implication: The real Bitwig runtime cannot handle the request exercised by the fake bridge. It returns unknown_request before any selection evidence is evaluated, so the daemon can resolve only the CLAP instance lease and never issue a pending confirmation tuple.

- timestamp: 2026-08-14T11:20:16-05:00
  checked: Pre-build packaged-artifact staleness gate
  found: check-bridge-artifact fails because bridge/target/bw-brain.bwextension does not exist, while Bitwig's installed copy remains the older August 6 archive.
  implication: The previous verification ran bridge tests against current class files but never produced or installed the current deployable bridge artifact.

- timestamp: 2026-08-14T11:20:40-05:00
  checked: Current-source Maven clean package inside the restricted sandbox
  found: Compilation proceeded, but 8 of 46 tests errored only because ServerSocket.bind was denied with Operation not permitted; Maven therefore did not package the artifact.
  implication: The build must be repeated with loopback permission. These are environment errors, not bridge assertions or evidence against the stale-artifact mechanism.

- timestamp: 2026-08-14T11:21:12-05:00
  checked: Current-source Maven clean package with ephemeral loopback binds permitted
  found: Maven completed successfully with all 46 bridge tests passing and produced bridge/target/bw-brain.bwextension.
  implication: A tested deployable artifact now exists; its actual archive contents and install divergence are the next verification boundary.

- timestamp: 2026-08-14T11:21:44-05:00
  checked: Rebuilt archive contents, repository artifact gate, and SHA-256 comparison with Bitwig's installed extension
  found: The rebuilt archive contains ClapCorrelation.class and both get.clap_capabilities/get.clap_correlation strings; the artifact gate passes. Rebuilt SHA-256 is c32841328e7264d8369c367235963929ec36258b18b439db892f68f24c319e07, while the installed archive is 44fd018eb3159a798ec21a26fbfb73ce47ebb93ffc86dfed2441a4f7037fa427.
  implication: The corrected deployable is verified, and Bitwig's current installed runtime is definitively a different stale binary.

- timestamp: 2026-08-14T11:22:32-05:00
  checked: Recoverability before replacing the live bridge artifact
  found: The August 6 installed archive was copied to bw-brain.bwextension.pre-correlation-20260814 in the same Bitwig Extensions directory.
  implication: The operational replacement is reversible if the current bridge causes an unexpected live regression.

- timestamp: 2026-08-14T11:23:00-05:00
  checked: Operational bridge replacement
  found: bridge/target/bw-brain.bwextension was copied over Bitwig's installed bw-brain.bwextension after preserving the stale archive.
  implication: The on-disk runtime candidate now points at the tested current build; byte-level installed verification remains before requesting Bitwig reload.

- timestamp: 2026-08-14T11:23:42-05:00
  checked: Installed artifact after replacement
  found: cmp reports the target and installed archives are byte-identical; both SHA-256 hashes are c32841328e7264d8369c367235963929ec36258b18b439db892f68f24c319e07. The installed archive contains ClapCorrelation.class and its PullHandlers contains get.clap_correlation; the backup retains the old 44fd018e hash.
  implication: The operational correction is installed and mechanically verified. Only Bitwig JVM reload plus the original live workflow remain.

- timestamp: 2026-08-14T11:24:09-05:00
  checked: Ability to determine whether Bitwig is currently running
  found: Process enumeration is unavailable in this sandbox, so a hot controller toggle cannot be proven sufficient from here.
  implication: A full Bitwig quit/reopen is the deterministic human verification step that guarantees the installed archive is loaded.

- timestamp: 2026-08-14T12:18:26-05:00
  checked: Human verification after fully reloading Bitwig with the installed current bridge
  found: Project populated as project-e35150b9-55fc-4e1d-a299-d6ed097f629b, Track as Audio 2, Instance as inst-local, identity state as [confirmed], and connection as connected | closed | idle. The user explicitly reported confirmed fixed.
  implication: The deployed current bridge handles live controller correlation and completes the nonce-bound identity confirmation workflow; the stale installed artifact was the remaining operational root cause.

## Resolution

root_cause: "The cross-boundary code repair was not deployed to the controller runtime. Bitwig was still loading an August 6 bw-brain.bwextension, but get.clap_correlation and ClapCorrelation were added August 10. The stale PullHandlers therefore answered the live request as unknown_request, causing nonce-bound controller confirmation to fail before Project/Track could populate."
fix: "Built the current bridge from source with all 46 tests passing, preserved the stale installed archive as bw-brain.bwextension.pre-correlation-20260814, and replaced Bitwig's installed bw-brain.bwextension with the tested current package. The earlier native/daemon protocol repair remains unchanged."
verification: "Verified complete: Maven package passed 46/46 bridge tests; artifact freshness gate passed; packaged and installed archives are byte-identical at SHA-256 c32841328e7264d8369c367235963929ec36258b18b439db892f68f24c319e07; installed archive contains ClapCorrelation.class and get.clap_correlation. Human live verification after a full Bitwig reload populated Project project-e35150b9-55fc-4e1d-a299-d6ed097f629b, Track Audio 2, Instance inst-local, and reached [confirmed]."
files_changed:
  - schemas/clap/identity.schema.json
  - daemon/src/gen/clap.ts
  - clap/src/model/UiState.h
  - clap/src/model/UiState.cpp
  - clap/src/PluginEditor.cpp
  - clap/src/PluginProcessor.h
  - clap/src/PluginProcessor.cpp
  - clap/src/peer/LoopbackTransport.h
  - clap/src/peer/LoopbackTransport.cpp
  - clap/tests/editor_state_test.cpp
  - clap/tests/loopback_transport_test.cpp
  - daemon/src/sessions/project-registry.ts
  - daemon/src/sessions/project-registry.test.ts
  - daemon/src/peers/peer-registry.ts
  - daemon/src/peers/session-actions.ts
  - daemon/src/peers/session-actions.test.ts
  - daemon/src/runtime/boot.ts
  - daemon/src/runtime/smoke.test.ts
