import { randomUUID } from "node:crypto";
import type { RawState } from "../state/reconcile.js";
import type { ProjectIntent } from "../gen/intent.js";
import type { Patch } from "../gen/patch.js";
import type { Note } from "../cli/diff-logic.js";
import type { PrimitiveOp, AutomationOp } from "../patch/inverse-ops.js";
import type { CandidateStore } from "../patch/candidate-store.js";
import type { PatchHistory, PatchHistoryEntry } from "../patch/patch-history.js";
import { validatePatchOrThrow, isAutomationScope } from "../patch/patch-schema.js";
import { previewPatch } from "../patch/patch-resolve.js";
import { classifyRisk, ScopeMismatchError } from "../patch/risk-classifier.js";
import { inverseOps, buildAutomationInverse } from "../patch/inverse-ops.js";

export type Freshness = "live" | "stale" | "disconnected";
export type EditResult = { ok: boolean; payload?: object; error?: string; details?: Record<string, unknown>; assumptions: { claim: string; confidence: number; source: "selection" }[] };

/** The AutomationScope variant of Patch["scope"] (narrowed view). */
export type AutomationScopeRef = Extract<Patch["scope"], { deviceSid: string }>;

/** A named pre-flight refusal (the 05-02 vocabulary — never a silent no-op). */
export interface NamedRefusal {
  error: string;
  details: Record<string, unknown>;
}

/**
 * The automation pre-flight gate ladder (Phase 5 05-05 Task 3 — D-05-05/06).
 * PURE: reads only the folded live state + the candidate's scope. Returns the
 * FIRST refusal, or null when every gate passes. Every refusal carries
 * `details.hint` (the wrong_clip_targeted precedent).
 *
 * Gate order (plan Test 2 precedence — state_disconnected and candidate
 * validation run BEFORE this ladder in the apply path):
 *  1. IDENTITY — the target-binding compare generalizing the previewClipSid
 *     compare: `wrong_device_targeted` when the live folded selected-device
 *     id (state.selection.deviceSid — the same dev_+16-hex fingerprint the
 *     parameter.changed deviceKey carries, per the cross-plan equivalence
 *     pin) differs from the candidate scope's deviceSid; `ambiguous_target`
 *     when the live identity is UNVERIFIABLE from folds (D-05-06 — never a
 *     guess-write).
 *  2. WRITE-ARM — `automation_write_disabled` when neither arranger nor
 *     launcher automation write is armed, OR when the write-arm fold has not
 *     been observed at all (an unconfirmable arm state is treated as
 *     unarmed: an unarmed write is a SILENT envelope no-op per the 2026-08-22
 *     live probe, so the daemon refuses before dispatch). NOTE:
 *     `transport_stopped` is RETIRED as a refusal trigger by the same probe —
 *     transport play state is NOT the write gate (armed + stopped writes
 *     points, latch mode); do NOT gate on isPlaying.
 *  3. LANE — `ambiguous_target` when only the LAUNCHER write is armed: the
 *     launcher/clip-targeted write path is UNVERIFIED live (launchWrite never
 *     armed across the probe's 21 steps) and stays refused pending evidence
 *     (D-05-06 probe-pins-refuse-rest). Only the arranger-armed track-lane
 *     path is live-verified.
 *  4. OVERRIDE — NOT a refusal (live-evidence correction 2026-08-23: the
 *     05-02 probe's STEP#7–21 all ran with override latched AND points
 *     landed at exact target values — override masks the audible effect of
 *     existing automation, it does NOT block envelope writes). The apply
 *     proceeds and surfaces an override caveat assumption instead: the
 *     written curve won't take audible effect until the producer clears
 *     the override.
 *
 * The medium-risk confirmation gate (EDIT-06) runs AFTER this ladder in the
 * apply path; execution is immediate-after-gates (D-05-08 — no timers, no
 * deferred dispatch).
 */
export function automationPreFlight(state: RawState, scope: AutomationScopeRef): NamedRefusal | null {
  // 1. Identity (the target-binding compare).
  const liveDeviceSid = state.selection?.deviceSid;
  if (liveDeviceSid === undefined) {
    return {
      error: "ambiguous_target",
      details: {
        expectedDeviceSid: scope.deviceSid,
        hint: "live selected-device identity is unverifiable from folds — re-select the device (or wait for the fold); refusing rather than guessing the target (D-05-06)",
      },
    };
  }
  if (liveDeviceSid !== scope.deviceSid) {
    return {
      error: "wrong_device_targeted",
      details: {
        expectedDeviceSid: scope.deviceSid,
        actualDeviceSid: liveDeviceSid,
        hint: "re-select the device you previewed (or re-preview) — the cursor device is not the patch's target",
      },
    };
  }
  // 2. Write-arm (the operative gate per the 2026-08-22 live probe).
  const arm = state.project?.transport?.automationWrite;
  if (arm === undefined || (!arm.arrangerWriteEnabled && !arm.launcherWriteEnabled)) {
    return {
      error: "automation_write_disabled",
      details: {
        arrangerWriteEnabled: arm?.arrangerWriteEnabled,
        launcherWriteEnabled: arm?.launcherWriteEnabled,
        writeArmState: arm === undefined ? "unobserved" : "observed",
        hint: "arm arranger (or launcher) automation write in Bitwig first — an unarmed automation write is a silent envelope no-op (transport play state is NOT the gate; the daemon never issues a write that would silently no-op)",
      },
    };
  }
  // 3. Lane: only the arranger-armed track-lane path is live-verified.
  if (!arm.arrangerWriteEnabled && arm.launcherWriteEnabled) {
    return {
      error: "ambiguous_target",
      details: {
        arrangerWriteEnabled: arm.arrangerWriteEnabled,
        launcherWriteEnabled: arm.launcherWriteEnabled,
        hint: "launcher/clip-targeted automation is UNVERIFIED live (2026-08-22 probe: launchWrite never armed) — refused pending evidence (D-05-06); arm ARRANGER write for the verified track-lane path",
      },
    };
  }
  // 4. Override: NOT refused (evidence correction — see docblock above). The
  // apply path surfaces the caveat assumption when overrideActive is set.
  return null;
}

/**
 * Build the apply-time automation journal fields (D-05-07 / INV-14). PURE.
 *
 * Called ONLY after the bridge apply response carried `capturedPriorValue`
 * (the caller refuses `prior_unavailable` otherwise — never a guessed
 * inverse). Freezes the author-aware inverse ({@link buildAutomationInverse})
 * + the automationBinding audit record into the exact shapes the journal
 * entry carries; revert replays the frozen inverse without re-derivation.
 */
export function automationApplyFields(
  scope: AutomationScopeRef,
  operations: PrimitiveOp[],
  capturedPriorValue: number,
): { automationBinding: NonNullable<PatchHistoryEntry["automationBinding"]>; inverseOperations: PrimitiveOp[] } {
  return {
    automationBinding: {
      deviceSid: scope.deviceSid,
      paramIndex: scope.paramIndex,
      paramSource: scope.paramSource,
      priorValue: capturedPriorValue,
    },
    inverseOperations: buildAutomationInverse(operations as AutomationOp[], capturedPriorValue),
  };
}

/** Canonical mutation service shared by CLI queries and later proposal tools. */
export class EditService {
  constructor(private readonly deps: {
    candidateStore: CandidateStore; patchHistory: PatchHistory;
    applyPatchOverBridge: (undoLabel: string, operations: PrimitiveOp[], scope?: Patch["scope"]) => Promise<{ applied: number; failed: number; capturedPriorValue?: number }>;
    pullSelectedClip?: () => Promise<unknown>; now?: () => number;
  }) {}

  private assumptions(state: RawState): EditResult["assumptions"] { return [{ claim: `selected clip ${state.selection.clipSid ?? "unknown"}`, confidence: 1, source: "selection" }]; }
  private async notes(state: RawState): Promise<Note[]> {
    try { return ((await this.deps.pullSelectedClip?.()) as { notes?: Note[] } | undefined)?.notes ?? ((state.clips as Note[] | undefined) ?? []); }
    catch { return (state.clips as Note[] | undefined) ?? []; }
  }
  async preview(state: RawState, _intent: ProjectIntent | null, freshness: Freshness, rawPatch: unknown): Promise<EditResult> {
    if (freshness === "disconnected") return { ok: false, error: "state_disconnected", assumptions: [] };
    let patch: Patch;
    try { patch = validatePatchOrThrow({ ...(rawPatch as object), patchId: `pt_${randomUUID()}` }); }
    catch { return { ok: false, error: "invalid_patch", assumptions: [] }; }
    const ops = patch.operations as PrimitiveOp[];
    try {
      const diff = previewPatch(await this.notes(state), ops);
      const risk = classifyRisk({ declared: patch.risk, operations: ops, scopeDeclared: patch.scope, belowBar: patch.belowBar ?? false });
      const candidate = this.deps.candidateStore.mint({ ...patch, risk, operations: ops as Patch["operations"] }, state.selection.clipSid ?? "");
      return { ok: true, payload: { patchId: candidate.patchId, risk, diff }, assumptions: this.assumptions(state) };
    } catch (error) { return { ok: false, error: error instanceof ScopeMismatchError ? "scope_mismatch" : "invalid_patch", assumptions: [] }; }
  }
  async apply(state: RawState, _intent: ProjectIntent | null, freshness: Freshness, input: { patchId?: string; confirm?: boolean; force?: boolean; allowBelowBar?: boolean }): Promise<EditResult> {
    if (freshness === "disconnected") return { ok: false, error: "state_disconnected", assumptions: [] };
    const patchId = input.patchId ?? "", candidate = this.deps.candidateStore.get(patchId);
    if (!candidate) return { ok: false, error: "candidate_not_found", assumptions: [] };
    // Phase 5 (05-05): automation candidates run the probe-derived gate ladder
    // (D-05-05/06) + the prior-value freeze. The clip path below is unchanged.
    if (isAutomationScope(candidate.scope)) return await this.applyAutomation(state, patchId, candidate, input);
    const liveClipSid = state.selection.clipSid ?? "", previewClipSid = candidate.previewClipSid;
    const assumptions = this.assumptions(state);
    if (previewClipSid && liveClipSid !== previewClipSid) return { ok: false, error: "wrong_clip_targeted", details: { expectedClipSid: previewClipSid, actualClipSid: liveClipSid, hint: "re-select the clip you previewed (or re-preview)" }, assumptions: [] };
    if (!input.force) {
      if ((candidate.risk === "medium" || candidate.risk === "high") && !input.confirm) return { ok: false, error: "confirmation_required", assumptions: [] };
      if (candidate.belowBar && !(input.allowBelowBar && input.confirm)) return { ok: false, error: "below_bar_requires_confirm", assumptions: [] };
    }
    const operations = candidate.operations as PrimitiveOp[], inverseOperations = inverseOps(operations);
    let applied: { applied: number; failed: number };
    try { applied = await this.deps.applyPatchOverBridge(candidate.undoLabel ?? "bw-edit apply", operations); }
    catch { return { ok: false, error: "apply_failed", assumptions: [] }; }
    if (applied.failed > 0) return { ok: true, payload: { ok: false, error: "apply_failed", ...applied }, assumptions };
    const entry: PatchHistoryEntry = { ...candidate, inverseOperations, appliedAt: (this.deps.now ?? Date.now)(), stateHashBefore: `clip:${liveClipSid}`, clipSid: liveClipSid };
    try { await this.deps.patchHistory.append(entry); } catch { /* mutation already committed; retain historical contract */ }
    this.deps.candidateStore.evict(patchId);
    return { ok: true, payload: { ok: true, appliedOps: applied.applied, patchId, undoLabel: candidate.undoLabel ?? "bw-edit apply" }, assumptions };
  }

  /**
   * The automation apply path (Phase 5 05-05 — D-05-05/06/07/08/10). Runs the
   * {@link automationPreFlight} ladder BEFORE any bridge round-trip, then the
   * medium-risk confirmation gate (EDIT-06 — automation classifies medium,
   * D-05-10), then dispatches IMMEDIATELY (D-05-08: no timers, no deferred
   * dispatch, no bar-boundary launch machinery — the 2026-08-22 probe shows an
   * approved armed curve writes instantly). On success, requires the bridge's
   * capturedPriorValue (prior honesty: refuse `prior_unavailable` rather than
   * guess an inverse), stamps the journal automationBinding + the frozen
   * author-aware inverse (INV-14).
   */
  private async applyAutomation(state: RawState, patchId: string, candidate: Patch & { previewClipSid?: string }, input: { confirm?: boolean; force?: boolean }): Promise<EditResult> {
    const scope = candidate.scope as AutomationScopeRef;
    const assumptions: EditResult["assumptions"] = [{ claim: `selected device ${scope.deviceSid} param ${scope.paramIndex} (${scope.paramSource})`, confidence: 1, source: "selection" }];
    const refusal = automationPreFlight(state, scope);
    if (refusal) return { ok: false, error: refusal.error, details: refusal.details, assumptions: [] };
  // Override caveat (evidence correction 2026-08-23): override does NOT
  // block writes (probe STEP#7–21 landed points with override latched) but
  // it masks their audible effect until cleared — surface, don't refuse.
  const armForCaveat = state.project?.transport?.automationWrite;
  if (armForCaveat?.overrideActive) {
    assumptions.push({ claim: "an automation override is latched on — the written curve lands on the envelope but will not take audible effect until the override is cleared in Bitwig", confidence: 1, source: "transport fold" });
  }
    if (!input.force && (candidate.risk === "medium" || candidate.risk === "high") && !input.confirm) {
      return { ok: false, error: "confirmation_required", assumptions };
    }
    // D-05-08: immediate dispatch after the gates. The AutomationScope rides
    // the wire (bridge resolves targets from payload.scope.{paramIndex,
    // paramSource} — ops carry values only).
    const operations = candidate.operations as PrimitiveOp[];
    let applied: { applied: number; failed: number; capturedPriorValue?: number };
    try { applied = await this.deps.applyPatchOverBridge(candidate.undoLabel ?? "bw-edit apply", operations, scope); }
    catch { return { ok: false, error: "apply_failed", assumptions: [] }; }
    if (applied.failed > 0) return { ok: true, payload: { ok: false, error: "apply_failed", ...applied }, assumptions };
    // Prior honesty (D-05-07 / T-05-15): no capturedPriorValue → no honest
    // inverse. Refuse visibly, journal NOTHING, retain the candidate for
    // inspection (never a guessed inverse; Bitwig ⌘Z remains the recovery).
    if (typeof applied.capturedPriorValue !== "number") {
      return {
        ok: false,
        error: "prior_unavailable",
        details: { hint: "the bridge apply response omitted capturedPriorValue — revert is unavailable for this write (use Bitwig ⌘Z); the candidate is retained for inspection" },
        assumptions,
      };
    }
    const { automationBinding, inverseOperations } = automationApplyFields(scope, operations, applied.capturedPriorValue);
    const entry: PatchHistoryEntry = {
      ...candidate,
      inverseOperations,
      appliedAt: (this.deps.now ?? Date.now)(),
      stateHashBefore: `automation:${scope.deviceSid}:${scope.paramIndex}`,
      automationBinding,
    };
    try { await this.deps.patchHistory.append(entry); } catch { /* mutation already committed; retain historical contract */ }
    this.deps.candidateStore.evict(patchId);
    return { ok: true, payload: { ok: true, appliedOps: applied.applied, patchId, undoLabel: candidate.undoLabel ?? "bw-edit apply" }, assumptions };
  }

  async revert(state: RawState, _intent: ProjectIntent | null, freshness: Freshness, patchId: string): Promise<EditResult> {
    if (freshness === "disconnected") return { ok: false, error: "state_disconnected", assumptions: [] };
    const entry = await this.deps.patchHistory.find(patchId);
    if (!entry) return { ok: false, error: "not_found", assumptions: [] };
    // Phase 5 (05-05): automation entries revert against the DEVICE identity
    // (and skip the clip compare — an automation write never targeted a clip).
    if (isAutomationScope(entry.scope)) return await this.revertAutomation(state, patchId, entry);
    const liveClipSid = state.selection.clipSid ?? "", assumptions = this.assumptions(state);
    if (entry.clipSid !== undefined && entry.clipSid !== liveClipSid) return { ok: false, error: "wrong_clip_targeted", details: { expectedClipSid: entry.clipSid, actualClipSid: liveClipSid, hint: "re-select the clip you applied this patch to (or use Bitwig undo)" }, assumptions: [] };
    if (entry.clipSid === undefined) {
      // Pre-clipSid legacy entry — caveated, NOT refused (D-05 migration
      // policy); the caveat is surfaced honestly in assumptions[].
      assumptions.push({ claim: "reverting a pre-binding journal entry; target unverified", confidence: 0.5, source: "selection" });
    }
    const undoLabel = `revert ${entry.undoLabel ?? patchId}`;
    let applied: { applied: number; failed: number };
    try { applied = await this.deps.applyPatchOverBridge(undoLabel, entry.inverseOperations); }
    catch { return { ok: false, error: "apply_failed", assumptions: [] }; }
    if (applied.failed > 0) return { ok: true, payload: { ok: false, error: "apply_failed", ...applied }, assumptions };
    const now = (this.deps.now ?? Date.now)();
    const revertEntry: PatchHistoryEntry = { patchId: `pt_revert-of-${patchId}`, scope: entry.scope, operations: entry.inverseOperations as Patch["operations"], undoLabel, rationale: `daemon-authoritative revert of ${patchId}`, reversibility: "self-inverse", risk: entry.risk, inverseOperations: entry.operations as PrimitiveOp[], appliedAt: now, stateHashBefore: entry.stateHashBefore, clipSid: liveClipSid };
    try { await this.deps.patchHistory.append(revertEntry); await this.deps.patchHistory.stampReverted(patchId, now); } catch { /* best effort after controller success */ }
    return { ok: true, payload: { ok: true, patchId, appliedRevertedAt: now, appliedOps: applied.applied }, assumptions };
  }

  /**
   * The automation revert path (Phase 5 05-05): replays the FROZEN
   * inverseOperations (INV-14 — no re-derivation, no envelope read, D-05-07)
   * against the device compare. Legacy entries lacking automationBinding are
   * CAVEATED, not refused (the clipSid migration precedent); an unverifiable
   * live device identity is likewise caveated (revert is the recovery path);
   * a verifiable MISMATCH refuses wrong_device_targeted without a bridge call.
   */
  private async revertAutomation(state: RawState, patchId: string, entry: PatchHistoryEntry): Promise<EditResult> {
    const scope = entry.scope as AutomationScopeRef;
    const liveDeviceSid = state.selection?.deviceSid;
    const assumptions: EditResult["assumptions"] = [{ claim: `selected device ${liveDeviceSid ?? "unknown"}`, confidence: 1, source: "selection" }];
    if (entry.automationBinding === undefined) {
      assumptions.push({ claim: "reverting a pre-automationBinding journal entry; prior-value provenance unverified", confidence: 0.5, source: "selection" });
    }
    if (liveDeviceSid === undefined) {
      assumptions.push({ claim: "live selected-device identity unverifiable from folds; reverting without a device compare", confidence: 0.5, source: "selection" });
    } else if (liveDeviceSid !== scope.deviceSid) {
      return { ok: false, error: "wrong_device_targeted", details: { expectedDeviceSid: scope.deviceSid, actualDeviceSid: liveDeviceSid, hint: "re-select the device you applied this patch to (or use Bitwig undo)" }, assumptions: [] };
    }
    const undoLabel = `revert ${entry.undoLabel ?? patchId}`;
    let applied: { applied: number; failed: number };
    // Scope rides the wire so the frozen inverse re-targets the SAME param
    // (entry.scope is the original AutomationScope for automation reverts).
    try { applied = await this.deps.applyPatchOverBridge(undoLabel, entry.inverseOperations, entry.scope); }
    catch { return { ok: false, error: "apply_failed", assumptions: [] }; }
    if (applied.failed > 0) return { ok: true, payload: { ok: false, error: "apply_failed", ...applied }, assumptions };
    const now = (this.deps.now ?? Date.now)();
    // The revert entry deliberately carries NO automationBinding: its own
    // "prior" would be the post-apply envelope value, which the async-readback
    // probe evidence says we do not hold (a revert-of-the-revert therefore
    // walks the caveated path above — honest, never a guessed prior).
    const revertEntry: PatchHistoryEntry = { patchId: `pt_revert-of-${patchId}`, scope: entry.scope, operations: entry.inverseOperations as Patch["operations"], undoLabel, rationale: `daemon-authoritative revert of ${patchId}`, reversibility: "self-inverse", risk: entry.risk, inverseOperations: entry.operations as PrimitiveOp[], appliedAt: now, stateHashBefore: entry.stateHashBefore };
    try { await this.deps.patchHistory.append(revertEntry); await this.deps.patchHistory.stampReverted(patchId, now); } catch { /* best effort after controller success */ }
    return { ok: true, payload: { ok: true, patchId, appliedRevertedAt: now, appliedOps: applied.applied }, assumptions };
  }
}
