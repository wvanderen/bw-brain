---
status: resolved
trigger: "Bitwig loads the capability CLAP, but its editor is blank; Connection Status reads 0; only Generated Mix is available and it is binary."
created: 2026-08-10
updated: 2026-08-10
---

# Debug Session: CLAP probe blank editor

## Symptoms

- **Expected:** A visible hosted capability view and a continuous Generated Mix control suitable for evaluating Bitwig's CLAP GUI and parameter behavior.
- **Actual:** Bitwig opens an empty editor. The device panel shows Connection Status at 0 and Generated Mix only; Generated Mix selects only 0 or 1. Analyze is absent.
- **Errors:** No error dialog. The bundle loads and validates.
- **Timeline:** First live Bitwig test of the Phase 04.1 capability probe.
- **Reproduction:** Load `clap/build-capability/bw-brain-capability.clap` on a Bitwig track and open its editor/device panel.

## Current Focus

- **hypothesis:** Confirmed: `gui.set_parent` caused the blank editor by returning success without attaching an `NSView`; unconditional `CLAP_PARAM_IS_STEPPED` caused binary Generated Mix.
- **test:** Automated native attachment/lifecycle tests and parameter metadata assertions pass; the rebuilt bundle passes the pinned deterministic validator; the live Bitwig retest is confirmed fixed.
- **expecting:** Resolved: Bitwig displays the painted `bw-brain Capability Probe` child view and exposes fractional Generated Mix values.
- **next_action:** Archive this resolved session and add its confirmed pattern to the debug knowledge base.

### Structured Reasoning Checkpoint

```yaml
reasoning_checkpoint:
  hypothesis: "The editor is blank because guiSetParent validates Cocoa but never creates or attaches a child NSView; Generated Mix is binary because parameterInfo sets CLAP_PARAM_IS_STEPPED for every parameter."
  confirming_evidence:
    - "CapabilityProbeEditor stores only booleans, dimensions, and events; it owns no native view."
    - "guiSetParent ignores plugin state and returns true solely from the parent window API string."
    - "parameterInfo unconditionally initializes flags with CLAP_PARAM_IS_STEPPED, including parameter 102 Generated Mix."
  falsification_test: "The hypothesis is false if attaching a real child NSView and removing the stepped flag from parameter 102 still yields no attached/resizable visible child or parameter 102 still advertises stepped metadata in tests/validator."
  fix_rationale: "Creating and owning an embedded child at set_parent completes the CLAP Cocoa embedding contract at the missing boundary; category-specific stepped metadata corrects the host contract rather than coercing values after receipt."
  blind_spots: "Automated tests cannot confirm Bitwig's final rendering/compositing behavior; a live host retest remains required after deterministic lifecycle and validator checks pass."
```

## Evidence

- timestamp: 2026-08-10
  observation: Audio and MIDI transparency pass; parameter persistence passes.
- timestamp: 2026-08-10
  observation: Source inspection shows `guiSetParent` only validates the Cocoa API and never creates or attaches an `NSView`.
- timestamp: 2026-08-10
  observation: `parameterInfo` unconditionally sets `CLAP_PARAM_IS_STEPPED` for all three parameters.
- timestamp: 2026-08-10
  observation: Complete editor implementation contains no native-view ownership, parent reference, drawing path, or frame synchronization; resize only updates stored integers.
- timestamp: 2026-08-10
  observation: First Objective-C++ compile rejected the view declaration inside a C++ namespace; moving the Objective-C class to global scope resolves the language constraint without changing behavior.
- timestamp: 2026-08-10
  observation: Cocoa regression test proves a real child NSView is attached, shown, resized to 640x360, hidden, and removed from its parent on destroy.
- timestamp: 2026-08-10
  observation: Parameter regression assertions prove Generated Mix is automatable but not stepped, while status/action candidates remain stepped.
- timestamp: 2026-08-10
  observation: Full CTest passes 2/2 tests and pinned clap-validator passes 38/38 applicable tests with 0 failures and 0 warnings (6 inapplicable skipped).
- timestamp: 2026-08-10
  observation: User confirmed the rebuilt capability probe passes the live Bitwig retest end-to-end.

## Eliminated

- hypothesis: Daemon connection failure causes the blank editor.
  reason: The throwaway capability plug-in contains no daemon client; Connection Status is a fixed placeholder.

## Resolution

- **root_cause:** The probe advertised a Cocoa GUI but `guiSetParent` only checked the API string and never created or attached a child `NSView`; independently, `parameterInfo` marked every parameter stepped, forcing Generated Mix to binary host semantics.
- **fix:** Added a capability-only painted Cocoa child view with explicit attach, resize, show/hide, removal, and ownership cleanup; routed `guiSetParent` into that lifecycle; made stepped metadata category-specific so Generated Mix is continuous.
- **verification:** Reconfigured and rebuilt in `clap/build-capability`; CTest passed 2/2 including native Cocoa lifecycle coverage; pinned clap-validator passed 38 applicable tests with 0 failures and 0 warnings; user confirmed the live Bitwig retest is fixed end-to-end.
- **files_changed:** `clap/CMakeLists.txt`, `clap/spike/CapabilityProbeEditor.cpp`, `clap/spike/CapabilityProbeEditor.h`, `clap/spike/CapabilityProbeEditor.mm`, `clap/spike/CapabilityProbePlugin.cpp`, `clap/spike/CapabilityProbeProcessor.cpp`, `clap/spike/CapabilityProbeProcessor.h`, `clap/tests/capability_probe_test.cpp`, `clap/tests/capability_probe_cocoa_test.mm`
