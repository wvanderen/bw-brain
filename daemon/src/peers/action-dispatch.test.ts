import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PiRuntimeFailure } from "../sessions/pi-runtime.js";
import { ActionDispatch } from "./action-dispatch.js";
import type { ArrangementReviewEvidence, ArrangementReviewOutcome, DeviceReviewEvidence, DeviceReviewOutcome } from "../query/query-server.js";

const reviewEvidence: ArrangementReviewEvidence = {
  sceneCount: 4,
  sections: [
    { startScene: 0, endScene: 1, label: "intro", avgSimilarity: 0.8, energy: 0.3, confidence: 0.9 },
    { startScene: 2, endScene: 3, label: "drop", avgSimilarity: 0.7, energy: 0.9, confidence: 0.85 },
  ],
  energyCurve: [{ bar: 0, value: 0.2 }, { bar: 1, value: 0.9 }],
  repetition: [{ group: [0, 2], similarity: 0.82, matchedOn: ["density"] }],
  trackRoles: { "track:1": { role: "bass", confidence: 0.9 } },
  transitionObservations: [],
  pulledAt: "2026-08-21T10:00:00.000Z",
  assumptions: [{ claim: "derived from snapshot pulled at 2026-08-21T10:00:00.000Z", confidence: 1.0, source: "default" }],
};

describe("confirmed hosted actions", () => {
  const scope = { projectId: "p", instanceId: "i", clipSid: "clip" };
  const context = { selectedClip: { clipSid: "clip", notes: [{ key: "n:60:0", pitch: 60, start: 0, length: 1, velocity: 100 }] } };
  it("authorizes Analyze against visible confirmed scope and never auto-analyzes", async () => {
    let finish!: () => void;
    const analyze = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })), sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), resolveAnalysisContext: vi.fn(async () => context), analyze,
      getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject: vi.fn(),
      sendTo: (_id, message) => (sent.push(message), true) });
    expect(analyze).not.toHaveBeenCalled();
    const dispatched = dispatch.dispatch("c", { type: "analysis.request", requestId: "analysis-1", scope, prompt: "Analyze arrangement" });
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const beforeCompletion = sent.at(-1);
    finish();
    await dispatched;
    expect(analyze).toHaveBeenCalledWith({ ...scope, prompt: "Analyze arrangement", context });
    expect(beforeCompletion).toEqual({ type: "analysis.status", requestId: "analysis-1", status: "running", scope });
    expect(sent.at(-1)).toEqual({ type: "analysis.complete", requestId: "analysis-1", status: "ok" });
  });

  it("returns a bounded visible refusal when Analyze fails", async () => {
    const sent: object[] = [];
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), resolveAnalysisContext: vi.fn(async () => context), analyze: vi.fn(async () => { throw new Error("remote details"); }),
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
      resolveAnalysisContext: vi.fn(async () => context),
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
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), resolveAnalysisContext: vi.fn(async () => context), analyze,
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
    const dispatch = new ActionDispatch({ requireConfirmedScope, resolveAnalysisContext: vi.fn(async () => context), analyze: vi.fn(), getProposal, issueApproval,
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
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(async () => scope), resolveAnalysisContext: vi.fn(async () => context), analyze: vi.fn(), getProposal: vi.fn(() => proposal),
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
    const dispatch = new ActionDispatch({ requireConfirmedScope: vi.fn(), resolveAnalysisContext: vi.fn(async () => context), analyze: vi.fn(), getProposal: vi.fn(), issueApproval: vi.fn(), consumeApproval: vi.fn(), stopProject, sendTo: vi.fn(() => true) });
    await dispatch.dispatch("c", { type: "generation.stop", projectId: "p" });
    expect(stopProject).toHaveBeenCalledWith("p");
  });
});

describe("arrangement.review (04.3-02 deterministic provider-free path)", () => {
  const scope = { projectId: "p", instanceId: "i", clipSid: "clip" };
  const context = { selectedClip: { clipSid: "clip", notes: [] } };
  const baseDeps = (reviewArrangement?: (request: { scope: unknown; refresh: boolean }) => Promise<ArrangementReviewOutcome>) => ({
    requireConfirmedScope: vi.fn(async () => scope),
    resolveAnalysisContext: vi.fn(async () => context),
    analyze: vi.fn(async () => undefined),
    getProposal: vi.fn(),
    issueApproval: vi.fn(),
    consumeApproval: vi.fn(),
    stopProject: vi.fn(),
    sendTo: (_id: string, message: object) => true,
    ...(reviewArrangement ? { reviewArrangement } : {}),
  });

  it("streams bounded contiguous chunks from confirmed scope with zero Pi involvement", async () => {
    const sent: object[] = [];
    const analyze = vi.fn(async () => undefined);
    const reviewArrangement = vi.fn(async () => ({ kind: "evidence", evidence: reviewEvidence }) as ArrangementReviewOutcome);
    const dispatch = new ActionDispatch({ ...baseDeps(reviewArrangement), analyze, sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "arrangement.review", requestId: "review-1", scope });

    // The deterministic path NEVER touches the Pi analyze dependency (RB-05).
    expect(analyze).not.toHaveBeenCalled();
    expect(reviewArrangement).toHaveBeenCalledWith({ scope, refresh: false });

    const status = sent[0];
    expect(status).toEqual({ type: "analysis.status", requestId: "review-1", status: "running", scope });
    const complete = sent.at(-1);
    expect(complete).toEqual({ type: "analysis.complete", requestId: "review-1", status: "ok" });
    const chunks = sent.slice(1, -1) as Array<{ type: string; requestId: string; sequence: number; text: string }>;
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.type === "conversation.chunk" && chunk.requestId === "review-1" && chunk.text.length <= 512)).toBe(true);
    expect(chunks.map((chunk) => chunk.sequence)).toEqual(chunks.map((_, index) => index));
    expect(chunks.some((chunk) => chunk.text.includes("pulled at 2026-08-21T10:00:00.000Z"))).toBe(true);
  });

  it("refuses unconfirmed scope via the shared gate before any review work", async () => {
    const sent: object[] = [];
    const reviewArrangement = vi.fn();
    const dispatch = new ActionDispatch({
      ...baseDeps(reviewArrangement as unknown as () => Promise<ArrangementReviewOutcome>),
      requireConfirmedScope: vi.fn(async () => { throw new Error("scope_not_confirmed"); }),
      sendTo: (_id, message) => (sent.push(message), true),
    });
    await dispatch.dispatch("c", { type: "arrangement.review", requestId: "review-2", scope });
    expect(sent).toEqual([{ type: "action.error", error: "scope_not_confirmed" }]);
    expect(reviewArrangement).not.toHaveBeenCalled();
  });

  it("hard-refuses disconnected + refresh with exactly one action.error and zero chunks", async () => {
    const sent: object[] = [];
    const reviewArrangement = vi.fn(async () => ({ kind: "refusal", reason: "state_disconnected" }) as ArrangementReviewOutcome);
    const dispatch = new ActionDispatch({ ...baseDeps(reviewArrangement), sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "arrangement.review", requestId: "review-3", scope, refresh: true });
    expect(reviewArrangement).toHaveBeenCalledWith({ scope, refresh: true });
    expect(sent.filter((message) => (message as { type: string }).type === "action.error"))
      .toEqual([{ type: "action.error", error: "state_disconnected" }]);
    expect(sent.filter((message) => (message as { type: string }).type === "conversation.chunk")).toEqual([]);
  });

  it("answers a missing snapshot with the honest hint and ok completion (no fabricated evidence)", async () => {
    const sent: object[] = [];
    const reviewArrangement = vi.fn(async () => ({ kind: "no-snapshot" }) as ArrangementReviewOutcome);
    const dispatch = new ActionDispatch({ ...baseDeps(reviewArrangement), sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "arrangement.review", requestId: "review-4", scope });
    const chunks = sent.slice(1, -1) as Array<{ type: string; text: string }>;
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.type).toBe("conversation.chunk");
    expect(chunks[0]!.text).toMatch(/no arrangement snapshot/i);
    expect(chunks[0]!.text).toMatch(/refresh/);
    expect(sent.at(-1)).toEqual({ type: "analysis.complete", requestId: "review-4", status: "ok" });
  });

  it("refuses not_implemented when the review dependency is unwired", async () => {
    const sent: object[] = [];
    const dispatch = new ActionDispatch({ ...baseDeps(), sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "arrangement.review", requestId: "review-5", scope });
    expect(sent).toEqual([{ type: "action.error", error: "not_implemented" }]);
  });
});

// ===========================================================================
// Phase 5 Plan 05-09 Task 2 — device.review (UX-04): the deterministic
// evidence render branch copying the arrangement.review ladder verbatim
// (status-running → refusal-or-chunks → analysis.complete). Zero Pi on the
// branch; automation proposals ride the EXISTING proposal/approval branches
// (RB-04 — byte-identical, never extended here).
// ===========================================================================

const deviceReviewEvidence: DeviceReviewEvidence = {
  chain: [
    { deviceSid: "dev_aaaaaaaaaaaaaaa1", name: "Polymer", isPlugin: false, position: 0 },
    { deviceSid: "dev_bbbbbbbbbbbbbbb2", name: "Surge XT", isPlugin: true, position: 1 },
  ],
  salience: [
    { paramKey: "dev_aaaaaaaaaaaaaaa1:device_parameter:3", deviceKey: "dev_aaaaaaaaaaaaaaa1", paramIndex: 3, paramName: "Filter Cutoff", source: "device_parameter", movementCount: 42, valueRange: 0.31, lastValue: 0.62, salience: 0.83 },
    { paramKey: "dev_bbbbbbbbbbbbbbb2:remote_page:0", deviceKey: "dev_bbbbbbbbbbbbbbb2", paramIndex: 0, paramName: "Macro 1", source: "remote_page", movementCount: 12, valueRange: 0.5, lastValue: 0.25, salience: 0.64 },
  ],
  macros: [
    {
      kind: "macro",
      params: [{ paramKey: "dev_aaaaaaaaaaaaaaa1:device_parameter:3", paramName: "Filter Cutoff", deviceKey: "dev_aaaaaaaaaaaaaaa1", source: "device_parameter", movementCount: 42, salience: 0.83 }],
      evidence: [{ identity: "Filter Cutoff", device: "dev_aaaaaaaaaaaaaaa1", movementCount: 42, roleEnergyContext: "role salience 0.50 (default prior)" }],
      assumptions: [{ claim: "single-param macro on the highest-salience device parameter", confidence: 1.0, source: "default" }],
      alternatives: [{ identity: "Macro 1", device: "dev_bbbbbbbbbbbbbbb2", salience: 0.64 }],
      manualHint: "map a macro knob to Filter Cutoff on Polymer",
    },
  ],
  pulledAt: "2026-08-22T12:00:00.000Z",
  assumptions: [{ claim: "derived from salience snapshot pulled at 2026-08-22T12:00:00.000Z", confidence: 1.0, source: "default" }],
};

describe("device.review (05-09 deterministic provider-free path)", () => {
  const scope = { projectId: "p", instanceId: "i", clipSid: "clip" };
  const context = { selectedClip: { clipSid: "clip", notes: [] } };
  const baseDeviceDeps = (deviceReview?: (request: { scope: unknown; refresh: boolean }) => Promise<DeviceReviewOutcome>) => ({
    requireConfirmedScope: vi.fn(async () => scope),
    resolveAnalysisContext: vi.fn(async () => context),
    analyze: vi.fn(async () => undefined),
    getProposal: vi.fn(),
    issueApproval: vi.fn(),
    consumeApproval: vi.fn(),
    stopProject: vi.fn(),
    sendTo: (_id: string, message: object) => true,
    ...(deviceReview ? { deviceReview } : {}),
  });

  it("streams bounded contiguous chunks from confirmed scope with ranked evidence and zero Pi involvement", async () => {
    const sent: object[] = [];
    const analyze = vi.fn(async () => undefined);
    const deviceReview = vi.fn(async () => ({ kind: "evidence", evidence: deviceReviewEvidence }) as DeviceReviewOutcome);
    const dispatch = new ActionDispatch({ ...baseDeviceDeps(deviceReview), analyze, sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "device.review", requestId: "device-review-1", scope, refresh: true });

    // The deterministic path NEVER touches the Pi analyze dependency (SC#5).
    expect(analyze).not.toHaveBeenCalled();
    expect(deviceReview).toHaveBeenCalledWith({ scope, refresh: true });

    expect(sent[0]).toEqual({ type: "analysis.status", requestId: "device-review-1", status: "running", scope });
    expect(sent.at(-1)).toEqual({ type: "analysis.complete", requestId: "device-review-1", status: "ok" });
    const chunks = sent.slice(1, -1) as Array<{ type: string; requestId: string; sequence: number; text: string }>;
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.type === "conversation.chunk" && chunk.requestId === "device-review-1" && chunk.text.length <= 512)).toBe(true);
    expect(chunks.map((chunk) => chunk.sequence)).toEqual(chunks.map((_, index) => index));
    const joined = chunks.map((chunk) => chunk.text).join("\n");
    expect(joined).toContain("Device chain (2 devices):");
    expect(joined).toContain("Parameter targets (ranked by salience");
    expect(joined).toContain("Macro / XY opportunities");
    expect(joined).toContain("pulled at 2026-08-22T12:00:00.000Z");
  });

  it("maps a refusal outcome (incl. snapshot_invalid) to action.error with the reason — zero chunks", async () => {
    for (const reason of ["state_disconnected", "not_implemented", "snapshot_invalid"] as const) {
      const sent: object[] = [];
      const deviceReview = vi.fn(async () => ({ kind: "refusal", reason }) as DeviceReviewOutcome);
      const dispatch = new ActionDispatch({ ...baseDeviceDeps(deviceReview), sendTo: (_id, message) => (sent.push(message), true) });
      await dispatch.dispatch("c", { type: "device.review", requestId: "device-review-2", scope });
      expect(sent.filter((message) => (message as { type: string }).type === "action.error"))
        .toEqual([{ type: "action.error", error: reason }]);
      expect(sent.filter((message) => (message as { type: string }).type === "conversation.chunk")).toEqual([]);
    }
  });

  it("answers a no-snapshot outcome with the honest hint chunks and ok completion (never fabricated evidence)", async () => {
    const sent: object[] = [];
    const deviceReview = vi.fn(async () => ({ kind: "no-snapshot" }) as DeviceReviewOutcome);
    const dispatch = new ActionDispatch({ ...baseDeviceDeps(deviceReview), sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "device.review", requestId: "device-review-3", scope });
    const chunks = sent.slice(1, -1) as Array<{ type: string; text: string }>;
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.type).toBe("conversation.chunk");
    expect(chunks[0]!.text).toMatch(/no salience snapshot/i);
    expect(chunks[0]!.text).toMatch(/refresh/);
    expect(sent.at(-1)).toEqual({ type: "analysis.complete", requestId: "device-review-3", status: "ok" });
  });

  it("refuses not_implemented when the deviceReview dependency is unwired (optional-dep contract)", async () => {
    const sent: object[] = [];
    const dispatch = new ActionDispatch({ ...baseDeviceDeps(), sendTo: (_id, message) => (sent.push(message), true) });
    await dispatch.dispatch("c", { type: "device.review", requestId: "device-review-4", scope });
    expect(sent).toEqual([{ type: "action.error", error: "not_implemented" }]);
  });

  it("structural zero-Pi: the device.review branch invokes no Pi/analysis-provider dependency (grep-level)", async () => {
    const src = await readFile(join(dirname(fileURLToPath(import.meta.url)), "action-dispatch.ts"), "utf8");
    const start = src.indexOf('message.type === "device.review"');
    const end = src.indexOf("const proposalId", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const branch = src.slice(start, end);
    expect(branch).toContain("this.deps.deviceReview");
    expect(branch).not.toMatch(/this\.deps\.analyze|resolveAnalysisContext|sessions\.|PiRuntime/);
  });
});
