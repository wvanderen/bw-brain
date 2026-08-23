# Deferred Items — Phase 5

## 05-05 (2026-08-23)

- **previewPatch is note-only — automation ops produce an empty preview diff.**
  `daemon/src/patch/patch-resolve.ts` resolveOps has no automation cases, so an
  automation patch previewed via edit.preview returns a StateDiff with empty
  notesAdded/notesRemoved/notesChanged and no automation signal (the diff
  shape's `automationTouched` field is only populated by bw-diff state
  comparisons). Preview still validates + classifies + mints correctly; the
  write gates all fire at apply. A preview that honestly describes the authored
  curve (e.g. automationTouched entries or an automation preview section)
  belongs with the 05-06 bridge-execution surface or a UX pass. Out of 05-05's
  task scopes (patch-resolve.ts is not in any 05-05 task file list).

- **state.selection.deviceSid is not yet populated by any fold.** The
  05-05 gates read it as the live folded selected-device identity
  (unverifiable → ambiguous_target refusal, so applies fail closed today).
  05-03's bridge emits deviceSid on device.name_changed payloads
  (Observers.java:1043-1047) but daemon/src/ingest/fold-event.ts's
  device.name_changed branch folds only `name`. Folding payload deviceSid into
  selection.deviceSid is a one-line 05-06+ ingest change once the bridge
  payload lands (bridge side compiled in 05-03; wiring verified end-of-phase).

- **Pre-existing daemon tsc errors** (not introduced by 05-05; vitest does not
  typecheck so the suite is unaffected): gen/result.js missing-module errors in
  cli/commands/edit.test.ts + midi.test.ts, arb.ts readonly-array variance,
  profile-loader.ts tuple cast, boot.test.ts socket/arity, project-session-
  manager.test.ts readonly variance, energy-curve.test.ts implicit any.
  Verified 05-05-touched files are type-clean via targeted tsc run.

## 05-06 (2026-08-23)

- **The daemon's apply.patch wire send does not yet include the patch scope.**
  `daemon/src/runtime/boot.ts` applyPatchOverBridge sends
  `{undoLabel, operations}` only, while the bridge's `handleApplyPatch` now
  reads `payload.scope.{paramIndex, paramSource}` (the AutomationScope carries
  the only target — ops carry values only). Until the scope rides the wire,
  automation ops arriving at the bridge fail honestly per-op
  (unresolvable target index) and the daemon reports apply_failed. Threading
  the AutomationScope through applyPatchOverBridge belongs to 05-08 (target
  resolution / automation.propose — the plan that owns composing automation
  patches end-to-end). Bridge half is forward-compatible: no bridge change
  will be needed when the daemon starts sending the scope.

- **remove_automation_points refuses at the bridge (removal_surface_unverified)
  — automation REVERT will surface apply_failed.** The 05-05 frozen inverse
  emits remove_automation_points for authored additions, and the bridge
  honestly refuses removals because the 2026-08-22 probe verified writes only
  (D-05-06 probe-pins-refuse-rest). Consequence: reverting an applied
  automation entry reports apply_failed (Bitwig ⌘Z remains the recovery — the
  same posture as prior_unavailable). A verified removal surface (if any
  exists in extension-api:21) is a 05-10 UAT question.
