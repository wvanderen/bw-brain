import { describe, expect, it, vi } from "vitest";
import { ActionDispatch } from "./action-dispatch.js";

describe("confirmed hosted actions", () => {
  const scope = { projectId: "p", instanceId: "i", clipSid: "clip" };
  it("authorizes Analyze against visible confirmed scope and never auto-analyzes", async () => {
    const analyze = vi.fn(async () => undefined), sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), analyze,
      getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject: vi.fn(),
      sendTo: (_id, message) => (sent.push(message), true) });
    expect(analyze).not.toHaveBeenCalled();
    await dispatch.dispatch("c", { type: "analysis.request", scope, prompt: "Analyze arrangement" });
    expect(analyze).toHaveBeenCalledWith({ ...scope, prompt: "Analyze arrangement" });
    expect(sent.at(-1)).toEqual({ type: "analysis.status", status: "running", scope });
  });

  it("previews exact stored scope, approves once, and targets phrase arm/countdown", async () => {
    const proposal = { proposalId: "pr", revision: 2, digest: "d", kind: "live_midi", scope, rationale: "bounded", assumptions: [], material: {} };
    const sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), analyze: vi.fn(), getProposal: vi.fn(() => proposal),
      issueApproval: vi.fn(() => ({ ...proposal, token: "token", expiresAt: 1 })),
      consumeApproval: vi.fn(async () => ({ ok: true, armedPhrase: { type: "phrase.arm", scope, proposalId: "pr", revision: 2 } })),
      stopProject: vi.fn(), sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "proposal.inspect", proposalId: "pr", revision: 2, scope });
    await dispatch.dispatch("c", { type: "proposal.approval.request", proposalId: "pr", revision: 2, scope });
    await dispatch.dispatch("c", { type: "proposal.approve", proposalId: "pr", revision: 2, digest: "d", token: "token", scope });
    expect(sent).toContainEqual({ type: "proposal.snapshot", proposal });
    expect(sent).toContainEqual(expect.objectContaining({ type: "approval.pending", token: "token", scope }));
    expect(sent).toContainEqual(expect.objectContaining({ type: "phrase.arm", scope }));
    expect(sent.at(-1)).toEqual({ type: "scheduler.status", status: "countdown", scope });
  });

  it("routes Stop globally without requiring current focus", async () => {
    const stopProject = vi.fn(async () => ({ ok: true, targeted: 2 }));
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(), analyze: vi.fn(), getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject, sendTo: vi.fn(() => true) });
    await dispatch.dispatch("c", { type: "generation.stop", projectId: "p" });
    expect(stopProject).toHaveBeenCalledWith("p");
  });
});
