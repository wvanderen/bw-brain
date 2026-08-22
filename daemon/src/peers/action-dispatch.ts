import type { ApprovalRequest } from "../proposals/approval-store.js";
import type { ProposalRevision, ProposalScope } from "../proposals/proposal-store.js";
import { PiRuntimeFailure } from "../sessions/pi-runtime.js";
import { renderArrangementReview, renderArrangementReviewHint } from "../transforms/arrangement-review-render.js";
import { renderDeviceReview, renderDeviceReviewHint } from "../transforms/device-review-render.js";
import type { ArrangementReviewOutcome, DeviceReviewOutcome } from "../query/query-server.js";

type DispatchResult = { ok: true; armedPhrase?: object } | { ok: false; error: string } | object;
type AnalysisErrorCode = "analysis_auth_required" | "analysis_model_unavailable" | "analysis_proposal_required" | "analysis_failed";
type Dependencies = {
  requireConfirmedScope(connectionId: string, scope: ProposalScope): Promise<ProposalScope>;
  resolveAnalysisContext(scope: ProposalScope): Promise<unknown>;
  analyze(request: ProposalScope & { prompt: string; context: unknown }): Promise<void>;
  /**
   * 04.3-02: deterministic arrangement review evidence (RB-03/RB-05/UX-03).
   * Implemented in boot via assembleArrangementReviewEvidence — the shared
   * transport-free evidence assembly from query-server.ts (single source;
   * analyzer logic never duplicated). Optional: an unwired dependency
   * refuses not_implemented rather than guessing.
   */
  reviewArrangement?(request: { scope: ProposalScope; refresh: boolean }): Promise<ArrangementReviewOutcome>;
  /**
   * 05-09: deterministic device-review evidence (UX-04/SC#5). Implemented in
   * boot via assembleDeviceReviewEvidence + refreshSalienceSnapshot (the
   * query-server single sources) — the exact optional-dependency injection
   * precedent of reviewArrangement. Optional: an unwired dependency refuses
   * not_implemented rather than guessing.
   */
  deviceReview?(request: { scope: ProposalScope; refresh: boolean }): Promise<DeviceReviewOutcome>;
  getProposal(proposalId: string, revision?: number): ProposalRevision | undefined;
  issueApproval(proposal: ProposalRevision): object;
  consumeApproval(request: ApprovalRequest): Promise<DispatchResult>;
  stopProject(projectId: string): Promise<object>;
  sendTo(connectionId: string, message: object): boolean;
  reportAnalysisFailure?(failure: { requestId: string; code: AnalysisErrorCode }): void;
};
const sameScope = (a: ProposalScope, b: ProposalScope) => a.projectId === b.projectId && a.instanceId === b.instanceId && a.clipSid === b.clipSid;
const analysisErrorCode = (error: unknown): AnalysisErrorCode => {
  if (!(error instanceof PiRuntimeFailure)) return "analysis_failed";
  if (error.code === "pi_auth_required") return "analysis_auth_required";
  if (error.code === "pi_model_unavailable") return "analysis_model_unavailable";
  if (error.code === "pi_proposal_required") return "analysis_proposal_required";
  return "analysis_failed";
};

/** Hosted action ingress. Every authoritative action is revalidated against daemon scope. */
export class ActionDispatch {
  constructor(private readonly deps: Dependencies) {}
  async dispatch(connectionId: string, message: Record<string, unknown>): Promise<boolean> {
    if (message.type === "generation.stop" || message.type === "stop") {
      const projectId = String(message.projectId ?? ""); if (!projectId) return false;
      await this.deps.stopProject(projectId); return true;
    }
    const scope = message.scope as ProposalScope | undefined;
    if (!scope) return false;
    let confirmed: ProposalScope;
    try { confirmed = await this.deps.requireConfirmedScope(connectionId, scope); }
    catch { return this.deps.sendTo(connectionId, { type: "action.error", error: "scope_not_confirmed" }); }
    if (!sameScope(confirmed, scope)) return this.deps.sendTo(connectionId, { type: "action.error", error: "scope_mismatch" });

    if (message.type === "analysis.request") {
      const requestId = String(message.requestId ?? "");
      this.deps.sendTo(connectionId, { type: "analysis.status", requestId, status: "running", scope });
      try {
        const context = await this.deps.resolveAnalysisContext(scope);
        await this.deps.analyze({ ...scope, prompt: String(message.prompt ?? "Analyze the confirmed musical context"), context });
        return this.deps.sendTo(connectionId, { type: "analysis.complete", requestId, status: "ok" });
      } catch (error) {
        const code = analysisErrorCode(error);
        this.deps.reportAnalysisFailure?.({ requestId, code });
        return this.deps.sendTo(connectionId, { type: "analysis.complete", requestId, status: "error", error: code });
      }
    }
    if (message.type === "arrangement.review") {
      // 04.3-02: deterministic, provider-free arrangement review (RB-05 —
      // the analyze/Pi dependency is NEVER invoked on this path; Pitfall 1).
      // Mirrors the analysis.request bracketing: analysis.status running →
      // conversation.chunk 0..N-1 → analysis.complete ok (T-04.3-08: sequences
      // stay 0..65535 — the render input is the bounded five-dimension payload,
      // the slice is a defensive cap).
      const requestId = String(message.requestId ?? "");
      if (!this.deps.reviewArrangement) return this.deps.sendTo(connectionId, { type: "action.error", error: "not_implemented" });
      this.deps.sendTo(connectionId, { type: "analysis.status", requestId, status: "running", scope });
      const outcome = await this.deps.reviewArrangement({ scope, refresh: message.refresh === true });
      if (outcome.kind === "refusal") {
        // Disconnected + refresh is a hard refusal (state_disconnected) — one
        // action.error, zero chunks (T-04.3-05; mirrors handleArrangeCurrentSection).
        return this.deps.sendTo(connectionId, { type: "action.error", error: outcome.reason });
      }
      const texts = outcome.kind === "no-snapshot"
        ? [renderArrangementReviewHint()]
        : renderArrangementReview(outcome.evidence);
      let delivered = true;
      texts.slice(0, 65_536).forEach((text, sequence) => {
        delivered = this.deps.sendTo(connectionId, { type: "conversation.chunk", requestId, sequence, text }) && delivered;
      });
      return this.deps.sendTo(connectionId, { type: "analysis.complete", requestId, status: "ok" }) && delivered;
    }
    if (message.type === "device.review") {
      // 05-09 (UX-04): deterministic, provider-free device review — the
      // arrangement.review ladder copied verbatim (the analyze/Pi dependency
      // is NEVER invoked on this path; SC#5). Automation proposals do NOT
      // ride this branch — they keep using the existing proposal/approval
      // branches below unchanged (RB-04).
      const requestId = String(message.requestId ?? "");
      if (!this.deps.deviceReview) return this.deps.sendTo(connectionId, { type: "action.error", error: "not_implemented" });
      this.deps.sendTo(connectionId, { type: "analysis.status", requestId, status: "running", scope });
      const outcome = await this.deps.deviceReview({ scope, refresh: message.refresh === true });
      if (outcome.kind === "refusal") {
        return this.deps.sendTo(connectionId, { type: "action.error", error: outcome.reason });
      }
      const texts = outcome.kind === "no-snapshot"
        ? [renderDeviceReviewHint()]
        : renderDeviceReview(outcome.evidence);
      let delivered = true;
      texts.slice(0, 65_536).forEach((text, sequence) => {
        delivered = this.deps.sendTo(connectionId, { type: "conversation.chunk", requestId, sequence, text }) && delivered;
      });
      return this.deps.sendTo(connectionId, { type: "analysis.complete", requestId, status: "ok" }) && delivered;
    }
    const proposalId = String(message.proposalId ?? ""), revision = Number(message.revision);
    const proposal = this.deps.getProposal(proposalId, revision);
    if (!proposal || !sameScope(proposal.scope, scope)) return this.deps.sendTo(connectionId, { type: "action.error", error: "revision_mismatch" });
    if (message.type === "proposal.inspect") return this.deps.sendTo(connectionId, { type: "proposal.publish", ...proposal });
    if (message.type === "proposal.approval.request") {
      const grant = this.deps.issueApproval(proposal) as Record<string, unknown>;
      return this.deps.sendTo(connectionId, {
        type: "approval.issue",
        token: grant.token,
        proposalId: grant.proposalId,
        revision: grant.revision,
        scope: grant.scope,
        digest: grant.digest,
        expiresAt: grant.expiresAt,
      });
    }
    if (message.type === "approval.consume") {
      const result = await this.deps.consumeApproval(message as unknown as ApprovalRequest);
      if (!(result as { ok?: boolean }).ok) return this.deps.sendTo(connectionId, { type: "approval.result", proposalId, ok: false, error: (result as { error: string }).error });
      const armed = (result as { armedPhrase?: object }).armedPhrase;
      const acknowledged = this.deps.sendTo(connectionId, { type: "approval.result", proposalId, ok: true });
      return armed ? acknowledged && this.deps.sendTo(connectionId, armed) : acknowledged;
    }
    return false;
  }
}
