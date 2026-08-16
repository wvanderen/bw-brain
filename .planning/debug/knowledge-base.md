# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## clap-probe-blank-editor — Capability probe editor was blank and Generated Mix was binary
- **Date:** 2026-08-10
- **Error patterns:** Bitwig, blank editor, empty editor, Generated Mix, binary, stepped, Cocoa, NSView
- **Root cause:** The probe advertised a Cocoa GUI but `guiSetParent` only checked the API string and never created or attached a child `NSView`; independently, `parameterInfo` marked every parameter stepped, forcing Generated Mix to binary host semantics.
- **Fix:** Added a capability-only painted Cocoa child view with explicit attach, resize, show/hide, removal, and ownership cleanup; routed `guiSetParent` into that lifecycle; made stepped metadata category-specific so Generated Mix is continuous.
- **Files changed:** `clap/CMakeLists.txt`, `clap/spike/CapabilityProbeEditor.cpp`, `clap/spike/CapabilityProbeEditor.h`, `clap/spike/CapabilityProbeEditor.mm`, `clap/spike/CapabilityProbePlugin.cpp`, `clap/spike/CapabilityProbeProcessor.cpp`, `clap/spike/CapabilityProbeProcessor.h`, `clap/tests/capability_probe_test.cpp`, `clap/tests/capability_probe_cocoa_test.mm`
---

## proposal-workflow-incomplete — CLAP proposal drawer never appeared and Approve/Arm could not complete
- **Date:** 2026-08-16
- **Error patterns:** proposal, proposal drawer, create_proposal, proposal_scope_mismatch, empty arguments, Approve, Arm, analysis_proposal_required
- **Root cause:** After the proposal lifecycle and stale-runtime issues were repaired, `PiSdkAdapter` still registered `create_proposal` as an unconstrained object with no properties or required fields. The fresh live provider therefore emitted `{}` four times; Pi dispatched each call, and `ProjectSessionManager` rejected each at `params.scope` with `proposal_scope_mismatch` before `ProposalDispatch`/`ProposalStore` could publish. Existing real-SDK coverage missed this because it asserted callback identity only, bypassed `ProposalStore`, and used a non-production note shape.
- **Fix:** Kept the exact-scope proposal lifecycle and exactly-one postcondition, added an exact bounded `create_proposal` JSON parameter schema and explicit kind/material guidance, forwarded `PiTool.parameters` unchanged through `PiSdkAdapter`, upgraded the real Pi 0.84 contract to traverse `ProposalDispatch`/`ProposalStore` with production-valid notes and wrong-scope refusal, and classified known failures into bounded diagnostics without raw content.
- **Files changed:** `schemas/clap/proposal.schema.json`, `schemas/clap/telemetry.schema.json`, `schemas/clap/fixtures/golden.json`, `daemon/package.json`, `daemon/src/gen/clap.ts`, `daemon/src/proposals/proposal-dispatch.ts`, `daemon/src/proposals/proposal-dispatch.test.ts`, `daemon/src/peers/action-dispatch.ts`, `daemon/src/peers/action-dispatch.test.ts`, `daemon/src/peers/peer-server.test.ts`, `daemon/src/protocol/schemas.test.ts`, `daemon/src/runtime/boot.ts`, `daemon/src/sessions/pi-runtime.ts`, `daemon/src/sessions/pi-tools.ts`, `daemon/src/sessions/pi-tools.test.ts`, `daemon/src/sessions/pi-sdk-adapter.ts`, `daemon/src/sessions/pi-sdk-adapter.contract.test.ts`, `daemon/src/sessions/project-session-manager.ts`, `daemon/src/sessions/project-session-manager.test.ts`, `clap/src/model/UiState.h`, `clap/src/model/UiState.cpp`, `clap/src/rt/PhraseScheduler.h`, `clap/src/PluginProcessor.h`, `clap/src/PluginProcessor.cpp`, `clap/src/PluginEditor.cpp`, `clap/tests/editor_state_test.cpp`, `clap/tests/processor_generation_test.cpp`
---
