import { randomBytes } from "node:crypto";
import type { RawState } from "../state/reconcile.js";
import type { EditService, EditResult } from "../runtime/edit-service.js";
import type { ClapPhraseMessage } from "../gen/clap.js";
import { sameScope, type LiveMidiMaterial, type ProposalInput, type ProposalRevision, type ProposalScope, type ProposalStore } from "./proposal-store.js";
import type { ApprovalRequest, ApprovalStore } from "./approval-store.js";

type ArmedPhrase = Extract<ClapPhraseMessage, { type: "phrase.arm" }>;
type DispatchResult = EditResult | { ok: true; armedPhrase: Readonly<ArmedPhrase> } | { ok: false; error: string };
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); }
  return value;
}

/** Approval dispatcher: scope validation only; all existing-state mutation remains in EditService. */
export class ProposalDispatch {
  constructor(private readonly deps: {
    proposals: ProposalStore; approvals: ApprovalStore; editService: EditService;
    requireConfirmedScope: (scope: ProposalScope) => Promise<ProposalScope>;
    requirePublicationScope?: (scope: ProposalScope) => Promise<ProposalScope>;
    connectionForScope?: (scope: ProposalScope) => string | undefined;
    sendTo?: (connectionId: string, message: object) => boolean;
  }) {}

  async publish(input: ProposalInput): Promise<ProposalRevision> {
    const requireScope = this.deps.requirePublicationScope ?? this.deps.requireConfirmedScope;
    const confirmed = await requireScope(input.scope);
    if (!sameScope(confirmed, input.scope)) throw new Error("scope_mismatch");
    const connectionId = this.deps.connectionForScope?.(input.scope);
    if (!connectionId || !this.deps.sendTo) throw new Error("disconnected");
    const proposal = this.deps.proposals.publish(input);
    if (!this.deps.sendTo(connectionId, { type: "proposal.publish", ...proposal })) throw new Error("disconnected");
    return proposal;
  }

  async consume(request: ApprovalRequest): Promise<DispatchResult> {
    const proposal = this.deps.proposals.get(request.proposalId, request.revision);
    if (!proposal || proposal.digest !== request.digest) return { ok: false, error: "revision_mismatch" };
    let confirmed: ProposalScope;
    try { confirmed = await this.deps.requireConfirmedScope(proposal.scope); }
    catch {
      this.deps.approvals.consume(request, { ...proposal.scope, instanceId: "" });
      return { ok: false, error: "scope_mismatch" };
    }
    if (!sameScope(confirmed, proposal.scope)) {
      this.deps.approvals.consume(request, confirmed);
      return { ok: false, error: "scope_mismatch" };
    }
    const consumed = this.deps.approvals.consume(request, confirmed);
    if (!consumed.ok) return consumed;

    if (proposal.kind === "existing_edit") {
      // State is deliberately projected from immutable confirmed proposal scope, never current focus.
      const state = { selection: { clipSid: proposal.scope.clipSid } } as RawState;
      return this.deps.editService.apply(state, null, "live", { patchId: proposal.material.patchId, confirm: true });
    }
    const material = proposal.material as LiveMidiMaterial;
    const armedPhrase: ArmedPhrase = {
      type: "phrase.arm", armToken: `arm_${randomBytes(24).toString("base64url")}`,
      proposalId: proposal.proposalId, revision: proposal.revision, phraseId: material.phraseId,
      scope: proposal.scope as Required<ProposalScope>, launch: material.launch,
      lengthBeats: material.lengthBeats, notes: structuredClone(material.notes) as ArmedPhrase["notes"],
    };
    return { ok: true, armedPhrase: deepFreeze(armedPhrase) };
  }
}
