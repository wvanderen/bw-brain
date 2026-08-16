import type { ApprovalRequest } from "../proposals/approval-store.js";
import type { ProposalRevision, ProposalScope } from "../proposals/proposal-store.js";
import { PiRuntimeFailure } from "../sessions/pi-runtime.js";

type DispatchResult = { ok: true; armedPhrase?: object } | { ok: false; error: string } | object;
type AnalysisErrorCode = "analysis_auth_required" | "analysis_model_unavailable" | "analysis_proposal_required" | "analysis_failed";
type Dependencies = {
  requireConfirmedScope(connectionId: string, scope: ProposalScope): Promise<ProposalScope>;
  analyze(request: ProposalScope & { prompt: string }): Promise<void>;
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
        await this.deps.analyze({ ...scope, prompt: String(message.prompt ?? "Analyze the confirmed musical context") });
        return this.deps.sendTo(connectionId, { type: "analysis.complete", requestId, status: "ok" });
      } catch (error) {
        const code = analysisErrorCode(error);
        this.deps.reportAnalysisFailure?.({ requestId, code });
        return this.deps.sendTo(connectionId, { type: "analysis.complete", requestId, status: "error", error: code });
      }
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
