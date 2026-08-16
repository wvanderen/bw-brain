import { describe, expect, it, vi } from "vitest";
import { ProposalStore } from "./proposal-store.js";
import { ApprovalStore } from "./approval-store.js";
import { ProposalDispatch } from "./proposal-dispatch.js";
import { EditService } from "../runtime/edit-service.js";

describe("ProposalDispatch", () => {
  it("publishes one exact revision only to its confirmed originating peer", async () => {
    const approvals = new ApprovalStore(), proposals = new ProposalStore();
    const scope = { projectId: "project", instanceId: "instance", clipSid: "clip" };
    const sendTo = vi.fn(() => true);
    const dispatch = new ProposalDispatch({
      proposals,
      approvals,
      editService: { apply: vi.fn() } as any,
      requireConfirmedScope: vi.fn(async (candidate) => candidate),
      requirePublicationScope: vi.fn(async (candidate) => candidate),
      connectionForScope: vi.fn(() => "connection-a"),
      sendTo,
    } as any);

    const proposal = await (dispatch as any).publish({
      proposalId: "live",
      kind: "live_midi",
      scope,
      rationale: "audition",
      assumptions: [],
      material: {
        phraseId: "phrase",
        launch: "next_bar",
        lengthBeats: 1,
        notes: [{ ordinal: 0, startBeats: 0, durationBeats: 1, port: 0, channel: 0, key: 60, velocity: 0.8, noteId: -1 }],
      },
    });

    expect(proposal).toMatchObject({ proposalId: "live", revision: 1, scope });
    expect(sendTo).toHaveBeenCalledTimes(1);
    expect(sendTo).toHaveBeenCalledWith("connection-a", { type: "proposal.publish", ...proposal });
  });

  it("refuses publication scope drift or a disconnected target before storing", async () => {
    const input = { proposalId: "p", kind: "existing_edit" as const, scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "inspect", assumptions: [], material: { patchId: "pt_1" } };
    for (const failure of ["scope", "connection"] as const) {
      const approvals = new ApprovalStore(), proposals = new ProposalStore(), sendTo = vi.fn(() => true);
      const dispatch = new ProposalDispatch({
        proposals, approvals, editService: { apply: vi.fn() } as any,
        requireConfirmedScope: async (candidate) => candidate,
        requirePublicationScope: async (candidate) => failure === "scope" ? { ...candidate, clipSid: "other" } : candidate,
        connectionForScope: () => failure === "connection" ? undefined : "connection-a",
        sendTo,
      });
      await expect(dispatch.publish(input)).rejects.toThrow(failure === "scope" ? "scope_mismatch" : "disconnected");
      expect(proposals.get("p")).toBeUndefined();
      expect(sendTo).not.toHaveBeenCalled();
    }
  });

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
    const call = (apply as any).mock.calls[0];
    expect(call[0]).toMatchObject({ selection: { clipSid: "clip" } });
    expect(call[3]).toEqual({ patchId: "pt_1", confirm: true });
  });

  it("preserves EditService partial-failure semantics without an alternate journal path", async () => {
    const approvals = new ApprovalStore(), proposals = new ProposalStore();
    const proposal = proposals.publish({ proposalId: "p", kind: "existing_edit", scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "apply", assumptions: [], material: { patchId: "pt_1" } });
    const grant = approvals.issue(proposal);
    const expected = { ok: true, payload: { ok: false, error: "apply_failed", applied: 1, failed: 1 }, assumptions: [] };
    const dispatch = new ProposalDispatch({ proposals, approvals, editService: { apply: vi.fn(async () => expected) } as any, requireConfirmedScope: async (scope) => scope });
    expect(await dispatch.consume({ token: grant.token, proposalId: "p", revision: 1, scope: proposal.scope, digest: proposal.digest })).toEqual(expected);
  });

  it("preserves the canonical candidate, controller, inverse, journal, and eviction sequence", async () => {
    const approvals = new ApprovalStore(), proposals = new ProposalStore();
    const proposal = proposals.publish({ proposalId: "p", kind: "existing_edit", scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "apply", assumptions: [], material: { patchId: "pt_1" } });
    const grant = approvals.issue(proposal);
    const candidate = { patchId: "pt_1", scope: { clipSid: "clip" }, operations: [], rationale: "x", reversibility: "self-inverse", risk: "low", previewClipSid: "clip", undoLabel: "canonical" };
    const append = vi.fn(), evict = vi.fn(), controller = vi.fn(async () => ({ applied: 0, failed: 0 }));
    const editService = new EditService({ candidateStore: { get: vi.fn(() => candidate), evict } as any, patchHistory: { append } as any, applyPatchOverBridge: controller, now: () => 42 });
    const dispatch = new ProposalDispatch({ proposals, approvals, editService, requireConfirmedScope: async (scope) => scope });
    await dispatch.consume({ token: grant.token, proposalId: "p", revision: 1, scope: proposal.scope, digest: proposal.digest });
    expect(controller).toHaveBeenCalledWith("canonical", candidate.operations);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ patchId: "pt_1", inverseOperations: [], appliedAt: 42, clipSid: "clip" }));
    expect(evict).toHaveBeenCalledWith("pt_1");
  });

  it("refuses changed confirmed scope before mutation", async () => {
    const approvals = new ApprovalStore(), proposals = new ProposalStore();
    const proposal = proposals.publish({ proposalId: "p", kind: "existing_edit", scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "apply", assumptions: [], material: { patchId: "pt_1" } });
    const grant = approvals.issue(proposal), apply = vi.fn();
    const dispatch = new ProposalDispatch({ proposals, approvals, editService: { apply } as any, requireConfirmedScope: async () => ({ projectId: "project", instanceId: "instance", clipSid: "other" }) });
    expect(await dispatch.consume({ token: grant.token, proposalId: "p", revision: 1, scope: proposal.scope, digest: proposal.digest })).toEqual({ ok: false, error: "scope_mismatch" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("arms immutable live MIDI separately and never calls EditService", async () => {
    const approvals = new ApprovalStore(), proposals = new ProposalStore();
    const proposal = proposals.publish({ proposalId: "live", kind: "live_midi", scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, rationale: "audition", assumptions: [], material: { phraseId: "phrase", launch: "next_bar", lengthBeats: 1, notes: [{ ordinal: 0, startBeats: 0, durationBeats: 1, port: 0, channel: 0, key: 60, velocity: 0.8, noteId: -1 }] } });
    const grant = approvals.issue(proposal), apply = vi.fn();
    const dispatch = new ProposalDispatch({ proposals, approvals, editService: { apply } as any, requireConfirmedScope: async (scope) => scope });
    const result = await dispatch.consume({ token: grant.token, proposalId: "live", revision: 1, scope: proposal.scope, digest: proposal.digest });
    expect(result.ok).toBe(true);
    expect((result as any).armedPhrase).toMatchObject({ type: "phrase.arm", proposalId: "live", phraseId: "phrase", scope: proposal.scope });
    expect(Object.isFrozen((result as any).armedPhrase)).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });
});
