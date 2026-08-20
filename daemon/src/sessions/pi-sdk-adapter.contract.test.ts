import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/index.js";
import { describe, expect, it } from "vitest";
import { PiSdkAdapter } from "./pi-sdk-adapter.js";
import { createRestrictedPiTools } from "./pi-tools.js";
import { ProjectSessionManager } from "./project-session-manager.js";
import { ProposalStore, type ProposalInput } from "../proposals/proposal-store.js";
import { ProposalDispatch } from "../proposals/proposal-dispatch.js";
import { ApprovalStore } from "../proposals/approval-store.js";

describe("PiSdkAdapter real 0.84.0 contract", () => {
  it("creates, opens, resumes, forks, subscribes, aborts, and disposes without prompting", async () => {
    const root = await mkdtemp(join(tmpdir(), "bw-pi-sdk-"));
    const agentDir = join(root, "shared-agent");
    const adapter = new PiSdkAdapter(root, agentDir);
    const source = await adapter.create("project-a", []);
    const path = source.sessionFile;
    expect(path).toContain(join("projects", "project-a"));
    source.subscribe(() => undefined)();
    source.abort();
    source.dispose();
    const reopened = await adapter.open("project-a", []);
    expect(reopened.sessionFile).toBe(path);
    const forked = await adapter.fork("project-a", "project-b", []);
    expect(forked.sessionFile).not.toBe(path);
    expect(JSON.parse((await readFile(forked.sessionFile!, "utf8")).split("\n")[0]!).parentSession).toBe(path);
    await expect(stat(agentDir)).resolves.toMatchObject({});
    await expect(stat(join(root, "projects", "project-a", "agent"))).rejects.toMatchObject({ code: "ENOENT" });
    reopened.dispose(); forked.dispose();
  });

  it("classifies an empty agent credential store without leaking the raw SDK guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "bw-pi-sdk-auth-"));
    const session = await new PiSdkAdapter(root, join(root, "empty-agent")).create("project-auth", []);
    await expect(session.prompt("bounded diagnostic")).rejects.toMatchObject({
      name: "PiRuntimeFailure",
      code: "pi_auth_required",
      message: "pi_auth_required",
    });
    session.dispose();
  });

  it("registers restricted tools and enforces ProjectSessionManager proposal completion through the real SDK", async () => {
    const root = await mkdtemp(join(tmpdir(), "bw-pi-sdk-manager-"));
    const agentDir = join(root, "agent");
    await mkdir(agentDir, { recursive: true });
    const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, allowModelNetwork: false });
    const faux = fauxProvider();
    faux.provider.auth!.apiKey!.resolve = async () => ({ auth: { apiKey: "test-only" } });
    modelRuntime.registerNativeProvider(faux.provider);

    const sdkDiagnostics: Record<string, unknown>[] = [];
    const managerDiagnostics: Record<string, unknown>[] = [];
    const proposalCalls: { projectId: string; scope: unknown }[] = [];
    let providerSchema: Record<string, unknown> | undefined;
    let providerPreviewSchema: Record<string, unknown> | undefined;
    const previewCalls: unknown[] = [];
    const proposals = new ProposalStore();
    const published: object[] = [];
    const proposalDispatch = new ProposalDispatch({
      proposals,
      approvals: new ApprovalStore(),
      editService: { apply: async () => ({ ok: false, error: "not_used" }) } as never,
      requireConfirmedScope: async scope => scope,
      requirePublicationScope: async scope => scope,
      connectionForScope: () => "connection-real-sdk",
      sendTo: (_connectionId, message) => { published.push(message); return true; },
    });
    const adapter = new PiSdkAdapter(root, agentDir, {
      modelRuntime,
      model: faux.getModel(),
      diagnostic: event => sdkDiagnostics.push(event),
    });
    const manager = new ProjectSessionManager(adapter, projectId => createRestrictedPiTools({
      readConfirmedScope: async () => ({ projectId }),
      readContext: async () => null,
      preview: async input => {
        previewCalls.push(input);
        return { ok: true, payload: { patchId: "pt_12345678-1234-1234-1234-123456789abc" } };
      },
      createProposal: async input => {
        proposalCalls.push({ projectId, scope: input.scope });
        return proposalDispatch.publish(input as unknown as ProposalInput);
      },
    }), undefined, event => managerDiagnostics.push(event));

    await manager.connect("p-none", "i-none");
    faux.setResponses([fauxAssistantMessage("completed without a tool")]);
    await expect(manager.analyze({ projectId: "p-none", instanceId: "i-none", clipSid: "c-none", prompt: "Analyze no-call" }))
      .rejects.toMatchObject({ name: "PiRuntimeFailure", code: "pi_proposal_required" });

    await manager.connect("p-tool", "i-tool");
    faux.setResponses([
      context => {
        providerSchema = context.tools?.find(tool => tool.name === "create_proposal")?.parameters as Record<string, unknown> | undefined;
        return fauxAssistantMessage(fauxToolCall("create_proposal", {
          proposalId: "proposal-real-sdk",
          kind: "live_midi",
          scope: { projectId: "p-tool", instanceId: "i-tool", clipSid: "c-tool" },
          rationale: "Bounded real-SDK test",
          assumptions: [],
          material: {
            phraseId: "phrase-real-sdk",
            launch: "next_beat",
            lengthBeats: 1,
            notes: [{ ordinal: 0, startBeats: 0, durationBeats: 0.5, port: 0, channel: 0, key: 60, velocity: 0.8, noteId: -1 }],
          },
        }));
      },
      fauxAssistantMessage("proposal created"),
    ]);
    await expect(manager.analyze({ projectId: "p-tool", instanceId: "i-tool", clipSid: "c-tool", prompt: "Analyze tool-call" })).resolves.toBeUndefined();

    await manager.connect("p-edit", "i-edit");
    faux.setResponses([
      context => {
        providerPreviewSchema = context.tools?.find(tool => tool.name === "preview_edit")?.parameters as Record<string, unknown> | undefined;
        return fauxAssistantMessage(fauxToolCall("preview_edit", {
          scope: { clipSid: "clip_0123456789abcdef" },
          operations: [{ op: "update_note_field", before: { key: "n:60:0", pitch: 60, start: 0, length: 1, velocity: 100 }, after: { key: "n:60:0", pitch: 60, start: 0, length: 0.5, velocity: 96 } }],
          rationale: "Shorten the selected note",
          reversibility: "self-inverse",
          risk: "low",
          undoLabel: "bw-brain: shorten note",
        }));
      },
      fauxAssistantMessage(fauxToolCall("create_proposal", {
        proposalId: "proposal-existing-edit",
        kind: "existing_edit",
        scope: { projectId: "p-edit", instanceId: "i-edit", clipSid: "clip_0123456789abcdef" },
        rationale: "Apply the grounded preview",
        assumptions: [],
        material: { patchId: "pt_12345678-1234-1234-1234-123456789abc" },
      })),
      fauxAssistantMessage("grounded edit proposed"),
    ]);
    await expect(manager.analyze({ projectId: "p-edit", instanceId: "i-edit", clipSid: "clip_0123456789abcdef", prompt: "Analyze and edit" })).resolves.toBeUndefined();

    await manager.connect("p-wrong", "i-wrong");
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("create_proposal", {
        proposalId: "proposal-wrong-scope",
        kind: "existing_edit",
        scope: { projectId: "p-wrong", instanceId: "other", clipSid: "c-wrong" },
        rationale: "Must remain unstored",
        assumptions: [],
        material: { patchId: "patch-wrong-scope" },
      })),
      fauxAssistantMessage("proposal refused"),
    ]);
    await expect(manager.analyze({ projectId: "p-wrong", instanceId: "i-wrong", clipSid: "c-wrong", prompt: "Analyze wrong-scope counterfactual" }))
      .rejects.toMatchObject({ name: "PiRuntimeFailure", code: "pi_proposal_required" });

    faux.setResponses([fauxAssistantMessage("still no tool")]);
    await expect(manager.analyze({ projectId: "p-none", instanceId: "i-none", clipSid: "c-none", prompt: "Analyze no-call again" }))
      .rejects.toMatchObject({ name: "PiRuntimeFailure", code: "pi_proposal_required" });

    expect(proposalCalls).toEqual([
      { projectId: "p-tool", scope: { projectId: "p-tool", instanceId: "i-tool", clipSid: "c-tool" } },
      { projectId: "p-edit", scope: { projectId: "p-edit", instanceId: "i-edit", clipSid: "clip_0123456789abcdef" } },
    ]);
    expect(providerSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["proposalId", "kind", "scope", "rationale", "assumptions", "material"],
      properties: expect.objectContaining({ proposalId: expect.any(Object), kind: expect.any(Object), scope: expect.any(Object), rationale: expect.any(Object), assumptions: expect.any(Object), material: expect.any(Object) }),
    });
    expect(providerPreviewSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["scope", "operations", "rationale", "reversibility", "risk"],
      properties: expect.objectContaining({ scope: expect.any(Object), operations: expect.any(Object), rationale: expect.any(Object), reversibility: expect.any(Object), risk: expect.any(Object) }),
    });
    expect(previewCalls).toEqual([expect.objectContaining({ scope: { clipSid: "clip_0123456789abcdef" }, operations: [expect.objectContaining({ op: "update_note_field" })] })]);
    expect(proposals.get("proposal-real-sdk")).toMatchObject({ revision: 1, kind: "live_midi", scope: { projectId: "p-tool", instanceId: "i-tool", clipSid: "c-tool" } });
    expect(proposals.get("proposal-wrong-scope")).toBeUndefined();
    expect(published).toContainEqual(expect.objectContaining({ type: "proposal.publish", proposalId: "proposal-real-sdk", revision: 1 }));
    expect(sdkDiagnostics).toContainEqual({
      event: "pi.session.ready",
      projectId: "p-tool",
      activeTools: ["read_confirmed_scope", "read_context", "preview_edit", "create_proposal"],
    });
    expect(sdkDiagnostics).toContainEqual(expect.objectContaining({
      event: "pi.prompt.start",
      projectId: "p-tool",
      prompt: expect.stringContaining('Confirmed scope (authoritative; use exactly this JSON): {"projectId":"p-tool","instanceId":"i-tool","clipSid":"c-tool"}'),
      promptTruncated: false,
    }));
    expect(sdkDiagnostics).toContainEqual(expect.objectContaining({
      event: "pi.prompt.start",
      projectId: "p-edit",
      prompt: expect.stringContaining("Approval applies that immutable preview exactly; it never expands a sample or pattern clip-wide."),
    }));
    expect(sdkDiagnostics).toContainEqual(expect.objectContaining({ event: "pi.tool.call", projectId: "p-tool", tool: "create_proposal" }));
    expect(sdkDiagnostics).toContainEqual(expect.objectContaining({ event: "pi.tool.complete", projectId: "p-wrong", tool: "create_proposal", ok: false, rejection: "proposal_scope_mismatch" }));
    expect(managerDiagnostics.filter(event => event.event === "pi.analysis.complete")).toEqual([
      expect.objectContaining({ projectId: "p-none", instanceId: "i-none", created: 0, outcome: "proposal_required" }),
      expect.objectContaining({ projectId: "p-tool", instanceId: "i-tool", created: 1, outcome: "ok" }),
      expect.objectContaining({ projectId: "p-edit", instanceId: "i-edit", created: 1, outcome: "ok" }),
      expect.objectContaining({ projectId: "p-wrong", instanceId: "i-wrong", created: 0, outcome: "proposal_required" }),
      expect.objectContaining({ projectId: "p-none", instanceId: "i-none", created: 0, outcome: "proposal_required" }),
    ]);
    manager.dispose();
  });
});
