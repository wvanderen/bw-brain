import { randomBytes } from "node:crypto";
import { sameScope, type ProposalRevision, type ProposalScope } from "./proposal-store.js";

export const MAX_APPROVALS = 128;
export const APPROVAL_TTL_MS = 30_000;
type ApprovalError = "expired" | "consumed" | "scope_mismatch" | "revision_mismatch" | "disconnected" | "stopped";
type ApprovalBinding = Pick<ProposalRevision, "proposalId" | "revision" | "kind" | "scope" | "digest">;
export type ApprovalRequest = Omit<ApprovalBinding, "kind"> & { token: string };
export type ApprovalConsumeResult = { ok: true; binding: ApprovalBinding } | { ok: false; error: ApprovalError };

interface Grant extends ApprovalBinding { token: string; expiresAt: number; }

/** One-shot capabilities. consume performs synchronous compare-and-delete before any caller side effect. */
export class ApprovalStore {
  private readonly grants = new Map<string, Grant>();
  private readonly tombstones = new Map<string, ApprovalError>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxApprovals: number;

  constructor(options: { now?: () => number; ttlMs?: number; maxApprovals?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? APPROVAL_TTL_MS;
    this.maxApprovals = options.maxApprovals ?? MAX_APPROVALS;
  }

  issue(proposal: ApprovalBinding): Grant {
    const token = `ap_${randomBytes(24).toString("base64url")}`;
    const grant = Object.freeze({ ...structuredClone(proposal), scope: Object.freeze({ ...proposal.scope }), token, expiresAt: this.now() + this.ttlMs });
    this.grants.set(token, grant);
    while (this.grants.size > this.maxApprovals) this.retire(this.grants.keys().next().value as string, "consumed");
    return grant;
  }

  consume(request: ApprovalRequest, confirmedScope: ProposalScope): ApprovalConsumeResult {
    const grant = this.grants.get(request.token);
    if (!grant) return { ok: false, error: this.tombstones.get(request.token) ?? "consumed" };
    // Delete first: JavaScript's run-to-completion makes the capability unavailable before side effects or awaits.
    this.retire(request.token, "consumed");
    if (this.now() > grant.expiresAt) { this.tombstones.set(request.token, "expired"); return { ok: false, error: "expired" }; }
    if (request.proposalId !== grant.proposalId || request.revision !== grant.revision || request.digest !== grant.digest) return { ok: false, error: "revision_mismatch" };
    if (!sameScope(request.scope, grant.scope) || !sameScope(confirmedScope, grant.scope)) return { ok: false, error: "scope_mismatch" };
    return { ok: true, binding: grant };
  }

  invalidateProposal(proposalId: string): void { for (const [token, grant] of this.grants) if (grant.proposalId === proposalId) this.retire(token, "consumed"); }
  invalidate(reason: "disconnect" | "stop" | "rekey" | "fork", scope?: ProposalScope): void {
    const error: ApprovalError = reason === "disconnect" ? "disconnected" : reason === "stop" ? "stopped" : "scope_mismatch";
    for (const [token, grant] of this.grants) if (!scope || grant.scope.projectId === scope.projectId && grant.scope.instanceId === scope.instanceId) this.retire(token, error);
  }
  private retire(token: string, error: ApprovalError): void {
    this.grants.delete(token); this.tombstones.delete(token); this.tombstones.set(token, error);
    while (this.tombstones.size > this.maxApprovals) this.tombstones.delete(this.tombstones.keys().next().value as string);
  }
}
