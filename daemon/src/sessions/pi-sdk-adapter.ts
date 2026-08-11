import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSessionEvent,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { PiProjectSession, PiRuntime, PiSessionEvent, PiTool } from "./pi-runtime.js";

const validId = (id: string) => /^[A-Za-z0-9._:-]{1,64}$/.test(id);

export class PiSdkAdapter implements PiRuntime {
  constructor(private readonly rootDir: string, private readonly cwd = process.cwd()) {}

  private paths(projectId: string) {
    if (!validId(projectId)) throw new Error("invalid projectId");
    const projectDir = join(this.rootDir, "projects", projectId);
    return { projectDir, historyDir: join(projectDir, "history"), agentDir: join(projectDir, "agent") };
  }

  private sdkTools(tools: PiTool[]): ToolDefinition[] {
    return tools.map(tool => ({
      name: tool.name, label: tool.name, description: tool.description,
      parameters: { type: "object", additionalProperties: true } as never,
      execute: async (_callId, params, signal) => ({ content: [{ type: "text", text: JSON.stringify(await tool.execute(params as Record<string, unknown>, signal)) }], details: {} }),
    }));
  }

  private async wrap(manager: SessionManager, projectId: string, tools: PiTool[]): Promise<PiProjectSession> {
    const { projectDir, agentDir } = this.paths(projectId);
    await mkdir(agentDir, { recursive: true });
    const loader = new DefaultResourceLoader({ cwd: projectDir, agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
    await loader.reload();
    const { session } = await createAgentSession({ cwd: projectDir, agentDir, sessionManager: manager, resourceLoader: loader, noTools: "all", customTools: this.sdkTools(tools), tools: tools.map(t => t.name) });
    return {
      sessionFile: manager.getSessionFile(),
      subscribe: listener => session.subscribe((event: AgentSessionEvent) => listener(event as PiSessionEvent)),
      prompt: async (text, signal) => { if (signal?.aborted) throw signal.reason; const onAbort = () => void session.abort(); signal?.addEventListener("abort", onAbort, { once: true }); try { await session.prompt(text); } finally { signal?.removeEventListener("abort", onAbort); } },
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
