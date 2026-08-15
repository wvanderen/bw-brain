import { describe, expect, it, vi } from "vitest";
import { PiRuntimeFailure } from "../sessions/pi-runtime.js";
import { ActionDispatch } from "./action-dispatch.js";

describe("confirmed hosted actions", () => {
  const scope = { projectId: "p", instanceId: "i", clipSid: "clip" };
  it("authorizes Analyze against visible confirmed scope and never auto-analyzes", async () => {
    let finish!: () => void;
    const analyze = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })), sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), analyze,
      getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject: vi.fn(),
      sendTo: (_id, message) => (sent.push(message), true) });
    expect(analyze).not.toHaveBeenCalled();
    const dispatched = dispatch.dispatch("c", { type: "analysis.request", requestId: "analysis-1", scope, prompt: "Analyze arrangement" });
    await Promise.resolve();
    const beforeCompletion = sent.at(-1);
    finish();
    await dispatched;
    expect(analyze).toHaveBeenCalledWith({ ...scope, prompt: "Analyze arrangement" });
    expect(beforeCompletion).toEqual({ type: "analysis.status", requestId: "analysis-1", status: "running", scope });
    expect(sent.at(-1)).toEqual({ type: "analysis.complete", requestId: "analysis-1", status: "ok" });
  });

  it("returns a bounded visible refusal when Analyze fails", async () => {
    const sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), analyze: vi.fn(async () => { throw new Error("remote details"); }),
      getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject: vi.fn(),
      sendTo: (_id, message) => (sent.push(message), true) });
    await expect(dispatch.dispatch("c", { type: "analysis.request", requestId: "analysis-2", scope })).resolves.toBe(true);
    expect(sent).toEqual([
      { type: "analysis.status", requestId: "analysis-2", status: "running", scope },
      { type: "analysis.complete", requestId: "analysis-2", status: "error", error: "analysis_failed" },
    ]);
  });

  it.each([
    ["pi_auth_required", "analysis_auth_required"],
    ["pi_model_unavailable", "analysis_model_unavailable"],
  ] as const)("maps %s to bounded actionable diagnostics", async (piCode, peerCode) => {
    const sent: object[] = [], reportAnalysisFailure = vi.fn();
    const dispatch = new ActionDispatch({
      requireConfirmedScope: vi.fn(async () => scope),
      analyze: vi.fn(async () => { throw new PiRuntimeFailure(piCode); }),
      getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject: vi.fn(),
      sendTo: (_id, message) => (sent.push(message), true), reportAnalysisFailure,
    });

    await dispatch.dispatch("c", { type: "analysis.request", requestId: "analysis-safe", scope });

    expect(sent.at(-1)).toEqual({ type: "analysis.complete", requestId: "analysis-safe", status: "error", error: peerCode });
    expect(reportAnalysisFailure).toHaveBeenCalledWith({ requestId: "analysis-safe", code: peerCode });
    expect(JSON.stringify(reportAnalysisFailure.mock.calls)).not.toContain("No API key");
  });

  it("refuses changed or omitted clip focus without weakening exact comparison", async () => {
    const analyze = vi.fn(async () => undefined), sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), analyze,
      getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject: vi.fn(),
      sendTo: (_id, message) => (sent.push(message), true) });

    await dispatch.dispatch("c", { type: "analysis.request", requestId: "changed", scope: { ...scope, clipSid: "other" } });
    await dispatch.dispatch("c", { type: "analysis.request", requestId: "omitted", scope: { projectId: scope.projectId, instanceId: scope.instanceId } });

    expect(analyze).not.toHaveBeenCalled();
    expect(sent).toEqual([
      { type: "action.error", error: "scope_mismatch" },
      { type: "action.error", error: "scope_mismatch" },
    ]);
  });

  it("previews exact stored scope, approves once, and targets phrase arm/countdown", async () => {
    const proposal: any = { proposalId: "pr", revision: 2, digest: "d", kind: "live_midi", scope, rationale: "bounded", assumptions: [], material: {} };
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
