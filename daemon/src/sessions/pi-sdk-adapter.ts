import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { classifyPiSdkFailure, type PiProjectSession, type PiRuntime, type PiSessionEvent, type PiTool } from "./pi-runtime.js";

const validId = (id: string) => /^[A-Za-z0-9._:-]{1,64}$/.test(id);
const PROMPT_DIAGNOSTIC_LIMIT = 4_096;

export type PiProposalRejectionCode =
  | "proposal_turn_inactive"
  | "proposal_already_created"
  | "proposal_scope_mismatch"
  | "scope_mismatch"
  | "disconnected"
  | "invalid_proposal_scope"
  | "invalid_proposal_content"
  | "invalid_patch_id"
  | "invalid_phrase"
  | "proposal_rejected";

const proposalRejectionCodes: Readonly<Record<string, PiProposalRejectionCode>> = {
  proposal_turn_inactive: "proposal_turn_inactive",
  proposal_already_created: "proposal_already_created",
  proposal_scope_mismatch: "proposal_scope_mismatch",
  scope_mismatch: "scope_mismatch",
  disconnected: "disconnected",
  "invalid proposal scope": "invalid_proposal_scope",
  "invalid proposal content": "invalid_proposal_content",
  "invalid patchId": "invalid_patch_id",
  "invalid phrase": "invalid_phrase",
};

function classifyProposalRejection(tool: string, error: unknown): PiProposalRejectionCode | undefined {
  if (tool !== "create_proposal") return undefined;
  const message = error instanceof Error ? error.message : "";
  return proposalRejectionCodes[message] ?? "proposal_rejected";
}

export type PiSdkDiagnostic =
  | { event: "pi.session.ready"; projectId: string; activeTools: string[] }
  | { event: "pi.prompt.start"; projectId: string; prompt: string; promptLength: number; promptSha256: string; promptTruncated: boolean }
  | { event: "pi.prompt.complete"; projectId: string; outcome: "ok" | "pi_auth_required" | "pi_model_unavailable" | "pi_proposal_required" | "pi_failed" }
  | { event: "pi.tool.call"; projectId: string; tool: string; callId: string }
  | { event: "pi.tool.complete"; projectId: string; tool: string; ok: true }
  | { event: "pi.tool.complete"; projectId: string; tool: string; ok: false; rejection?: PiProposalRejectionCode };

export type PiSdkAdapterOptions = Pick<CreateAgentSessionOptions, "model" | "modelRuntime"> & {
  diagnostic?: (event: PiSdkDiagnostic) => void;
};

export class PiSdkAdapter implements PiRuntime {
  constructor(private readonly rootDir: string, private readonly agentDir = getAgentDir(), private readonly options: PiSdkAdapterOptions = {}) {}

  private emit(event: PiSdkDiagnostic): void {
    try { this.options.diagnostic?.(event); } catch { /* Diagnostics never affect the Pi turn. */ }
  }

  private paths(projectId: string) {
    if (!validId(projectId)) throw new Error("invalid projectId");
    const projectDir = join(this.rootDir, "projects", projectId);
    return { projectDir, historyDir: join(projectDir, "history") };
  }

  private sdkTools(projectId: string, tools: PiTool[]): ToolDefinition[] {
    return tools.map(tool => ({
      name: tool.name, label: tool.name, description: tool.description,
      parameters: (tool.parameters ?? { type: "object", additionalProperties: true }) as never,
      execute: async (callId, params, signal) => {
        const diagnosticName = tool.name.slice(0, 64);
        this.emit({ event: "pi.tool.call", projectId, tool: diagnosticName, callId: callId.slice(0, 128) });
        try {
          const result = await tool.execute(params as Record<string, unknown>, signal);
          this.emit({ event: "pi.tool.complete", projectId, tool: diagnosticName, ok: true });
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: {} };
        } catch (error) {
          const rejection = classifyProposalRejection(tool.name, error);
          this.emit({ event: "pi.tool.complete", projectId, tool: diagnosticName, ok: false, ...(rejection ? { rejection } : {}) });
          throw error;
        }
      },
    }));
  }

  private async wrap(manager: SessionManager, projectId: string, tools: PiTool[]): Promise<PiProjectSession> {
    const { projectDir } = this.paths(projectId);
    await mkdir(this.agentDir, { recursive: true });
    const loader = new DefaultResourceLoader({ cwd: projectDir, agentDir: this.agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: projectDir,
      agentDir: this.agentDir,
      sessionManager: manager,
      resourceLoader: loader,
      noTools: "all",
      customTools: this.sdkTools(projectId, tools),
      tools: tools.map(t => t.name),
      model: this.options.model,
      modelRuntime: this.options.modelRuntime,
    });
    this.emit({ event: "pi.session.ready", projectId, activeTools: session.getActiveToolNames().slice(0, 32).map(name => name.slice(0, 64)) });
    return {
      sessionFile: manager.getSessionFile(),
      subscribe: listener => session.subscribe((event: AgentSessionEvent) => listener(event as PiSessionEvent)),
      prompt: async (text, signal) => {
        if (signal?.aborted) throw signal.reason;
        this.emit({
          event: "pi.prompt.start",
          projectId,
          prompt: text.slice(0, PROMPT_DIAGNOSTIC_LIMIT),
          promptLength: text.length,
          promptSha256: createHash("sha256").update(text).digest("hex"),
          promptTruncated: text.length > PROMPT_DIAGNOSTIC_LIMIT,
        });
        const onAbort = () => void session.abort();
        signal?.addEventListener("abort", onAbort, { once: true });
        try {
          await session.prompt(text);
          this.emit({ event: "pi.prompt.complete", projectId, outcome: "ok" });
        } catch (error) {
          const failure = classifyPiSdkFailure(error);
          this.emit({ event: "pi.prompt.complete", projectId, outcome: failure.code });
          throw failure;
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      },
      abort: () => { void session.abort(); },
      dispose: () => session.dispose(),
    };
  }

  async create(projectId: string, tools: PiTool[]): Promise<PiProjectSession> {
    const { projectDir, historyDir } = this.paths(projectId); await mkdir(historyDir, { recursive: true });
    let manager = SessionManager.create(projectDir, historyDir);
    manager.appendCustomEntry("bw-brain.project-session", { projectId });
    // Pi intentionally defers a new file until the first assistant response. Quiet
    // startup still needs a resumable identity, so persist its SDK-created header
    // and metadata without fabricating a user/model turn, then reopen normally.
    const sessionFile = manager.getSessionFile();
    if (!sessionFile) throw new Error("Pi did not allocate a persisted session path");
    await writeFile(sessionFile, [manager.getHeader(), ...manager.getEntries()].map(entry => `${JSON.stringify(entry)}\n`).join(""), { flag: "wx" });
    manager = SessionManager.open(sessionFile, historyDir, projectDir);
    return this.wrap(manager, projectId, tools);
  }
  async open(projectId: string, tools: PiTool[]): Promise<PiProjectSession> {
    const { projectDir, historyDir } = this.paths(projectId); await mkdir(historyDir, { recursive: true });
    const latest = (await SessionManager.list(projectDir, historyDir))[0];
    return latest ? this.wrap(SessionManager.open(latest.path, historyDir, projectDir), projectId, tools) : this.create(projectId, tools);
  }
  async fork(sourceProjectId: string, targetProjectId: string, tools: PiTool[]): Promise<PiProjectSession> {
    const source = await this.open(sourceProjectId, tools);
    try {
      if (!source.sessionFile) throw new Error("source session is not persisted");
      const target = this.paths(targetProjectId); await mkdir(target.historyDir, { recursive: true });
      return await this.wrap(SessionManager.forkFrom(source.sessionFile, target.projectDir, target.historyDir), targetProjectId, tools);
    } finally { source.dispose(); }
  }
}
