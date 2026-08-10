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
