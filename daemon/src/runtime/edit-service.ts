import { randomUUID } from "node:crypto";
import type { RawState } from "../state/reconcile.js";
import type { ProjectIntent } from "../gen/intent.js";
import type { Patch } from "../gen/patch.js";
import type { Note } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import type { CandidateStore } from "../patch/candidate-store.js";
import type { PatchHistory, PatchHistoryEntry } from "../patch/patch-history.js";
import { validatePatchOrThrow } from "../patch/patch-schema.js";
import { previewPatch } from "../patch/patch-resolve.js";
import { classifyRisk, ScopeMismatchError } from "../patch/risk-classifier.js";
import { inverseOps } from "../patch/inverse-ops.js";

export type Freshness = "live" | "stale" | "disconnected";
export type EditResult = { ok: boolean; payload?: object; error?: string; details?: Record<string, unknown>; assumptions: { claim: string; confidence: number; source: "selection" }[] };

/** Canonical mutation service shared by CLI queries and later proposal tools. */
export class EditService {
  constructor(private readonly deps: {
    candidateStore: CandidateStore; patchHistory: PatchHistory;
    applyPatchOverBridge: (undoLabel: string, operations: PrimitiveOp[]) => Promise<{ applied: number; failed: number }>;
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
  async revert(state: RawState, _intent: ProjectIntent | null, freshness: Freshness, patchId: string): Promise<EditResult> {
    if (freshness === "disconnected") return { ok: false, error: "state_disconnected", assumptions: [] };
    const entry = await this.deps.patchHistory.find(patchId);
    if (!entry) return { ok: false, error: "not_found", assumptions: [] };
    const liveClipSid = state.selection.clipSid ?? "", assumptions = this.assumptions(state);
    if (entry.clipSid !== undefined && entry.clipSid !== liveClipSid) return { ok: false, error: "wrong_clip_targeted", details: { expectedClipSid: entry.clipSid, actualClipSid: liveClipSid, hint: "re-select the clip you applied this patch to (or use Bitwig undo)" }, assumptions: [] };
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
}
