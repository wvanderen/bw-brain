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
    ["pi_proposal_required", "analysis_proposal_required"],
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

  it("binds every scoped action to the sending connection's confirmed lease", async () => {
    const sent: object[] = [], getProposal = vi.fn(), issueApproval = vi.fn();
    const requireConfirmedScope = vi.fn(async (connectionId: string) => {
      if (connectionId !== "connection-a") throw new Error("scope_not_confirmed");
      return scope;
    });
    const dispatch = new ActionDispatch({ requireConfirmedScope, analyze: vi.fn(), getProposal, issueApproval,
      consumeApproval: vi.fn(), stopProject: vi.fn(), sendTo: (_id, message) => (sent.push(message), true) });

    await dispatch.dispatch("connection-b", { type: "proposal.approval.request", proposalId: "pr", revision: 2, scope });

    expect(requireConfirmedScope).toHaveBeenCalledWith("connection-b", scope);
    expect(getProposal).not.toHaveBeenCalled();
    expect(issueApproval).not.toHaveBeenCalled();
    expect(sent).toEqual([{ type: "action.error", error: "scope_not_confirmed" }]);
  });

  it("previews exact stored scope, approves once, and targets phrase arm/countdown", async () => {
    const digest = "d".repeat(64);
    const proposal: any = { proposalId: "pr", revision: 2, digest, kind: "live_midi", scope, rationale: "bounded", assumptions: [], material: { phraseId: "phrase", launch: "next_beat", lengthBeats: 1, notes: [{ ordinal: 0, startBeats: 0, durationBeats: 1, port: 0, channel: 0, key: 60, velocity: 0.8, noteId: -1 }] } };
    const sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), analyze: vi.fn(), getProposal: vi.fn(() => proposal),
      issueApproval: vi.fn(() => ({ ...proposal, token: "token", expiresAt: 1 })),
      consumeApproval: vi.fn(async () => ({ ok: true, armedPhrase: { type: "phrase.arm", scope, proposalId: "pr", revision: 2 } })),
      stopProject: vi.fn(), sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "proposal.inspect", proposalId: "pr", revision: 2, scope });
    await dispatch.dispatch("c", { type: "proposal.approval.request", proposalId: "pr", revision: 2, scope });
    await dispatch.dispatch("c", { type: "approval.consume", proposalId: "pr", revision: 2, digest, token: "token", scope });
    expect(sent).toContainEqual({ type: "proposal.publish", ...proposal });
    expect(sent).toContainEqual({ type: "approval.issue", proposalId: "pr", revision: 2, scope, digest, token: "token", expiresAt: 1 });
    expect(sent).toContainEqual({ type: "approval.result", proposalId: "pr", ok: true });
    expect(sent).toContainEqual(expect.objectContaining({ type: "phrase.arm", scope }));
  });

  it("routes Stop globally without requiring current focus", async () => {
    const stopProject = vi.fn(async () => ({ ok: true, targeted: 2 }));
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(), analyze: vi.fn(), getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject, sendTo: vi.fn(() => true) });
    await dispatch.dispatch("c", { type: "generation.stop", projectId: "p" });
    expect(stopProject).toHaveBeenCalledWith("p");
  });
});
