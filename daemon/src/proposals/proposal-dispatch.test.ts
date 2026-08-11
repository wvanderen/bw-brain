import { describe, expect, it, vi } from "vitest";
import { ProposalStore } from "./proposal-store.js";
import { ApprovalStore } from "./approval-store.js";
import { ProposalDispatch } from "./proposal-dispatch.js";

describe("ProposalDispatch", () => {
  it("delegates existing edits once to EditService with proposal scope", async () => {
    const approvals = new ApprovalStore();
    const proposals = new ProposalStore({ invalidateProposal: (id) => approvals.invalidateProposal(id) });
    const proposal = proposals.publish({ proposalId: "p", kind: "existing_edit", scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "apply", assumptions: [], material: { patchId: "pt_1" } });
    const grant = approvals.issue(proposal);
    const apply = vi.fn(async () => ({ ok: true, payload: { patchId: "pt_1" }, assumptions: [] }));
    const dispatch = new ProposalDispatch({ proposals, approvals, editService: { apply } as any, requireConfirmedScope: vi.fn(async (scope) => scope) });
    const request = { token: grant.token, proposalId: "p", revision: 1, scope: proposal.scope, digest: proposal.digest };

    expect((await dispatch.consume(request)).ok).toBe(true);
    expect((await dispatch.consume(request)).ok).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ selection: { clipSid: "clip" } });
    expect(apply.mock.calls[0]?.[3]).toEqual({ patchId: "pt_1", confirm: true });
  });

  it("preserves EditService partial-failure semantics without an alternate journal path", async () => {
    const approvals = new ApprovalStore(), proposals = new ProposalStore();
    const proposal = proposals.publish({ proposalId: "p", kind: "existing_edit", scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "apply", assumptions: [], material: { patchId: "pt_1" } });
    const grant = approvals.issue(proposal);
    const expected = { ok: true, payload: { ok: false, error: "apply_failed", applied: 1, failed: 1 }, assumptions: [] };
    const dispatch = new ProposalDispatch({ proposals, approvals, editService: { apply: vi.fn(async () => expected) } as any, requireConfirmedScope: async (scope) => scope });
    expect(await dispatch.consume({ token: grant.token, proposalId: "p", revision: 1, scope: proposal.scope, digest: proposal.digest })).toEqual(expected);
  });

  it("arms immutable live MIDI separately and never calls EditService", async () => {
    const approvals = new ApprovalStore(), proposals = new ProposalStore();
    const proposal = proposals.publish({ proposalId: "live", kind: "live_midi", scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "audition", assumptions: [], material: { phraseId: "phrase", launch: "next_bar", lengthBeats: 1, notes: [{ ordinal: 0, startBeats: 0, durationBeats: 1, port: 0, channel: 0, key: 60, velocity: 0.8, noteId: -1 }] } });
    const grant = approvals.issue(proposal), apply = vi.fn();
    const dispatch = new ProposalDispatch({ proposals, approvals, editService: { apply } as any, requireConfirmedScope: async (scope) => scope });
    const result = await dispatch.consume({ token: grant.token, proposalId: "live", revision: 1, scope: proposal.scope, digest: proposal.digest });
    expect(result.ok).toBe(true);
    expect(result.armedPhrase).toMatchObject({ type: "phrase.arm", proposalId: "live", phraseId: "phrase", scope: proposal.scope });
    expect(Object.isFrozen(result.armedPhrase)).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });
});
