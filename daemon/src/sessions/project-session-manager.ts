import type { ProjectForkCommitted } from "../peers/session-actions.js";
import { PiRuntimeFailure, type PiProjectSession, type PiRuntime, type PiSessionEvent, type PiTool } from "./pi-runtime.js";

type AnalyzeRequest = { projectId: string; instanceId: string; clipSid?: string; prompt: string; context?: unknown };
type ProposalScope = Pick<AnalyzeRequest, "projectId" | "instanceId" | "clipSid">;
type ProposalTurn = { scope: ProposalScope; created: number };
export type ProjectSessionDiagnostic =
  | ({ event: "pi.proposal.created"; created: 1 } & ProposalScope)
  | ({ event: "pi.analysis.complete"; created: number; outcome: "ok" | "proposal_required" | "failed" } & ProposalScope);
type ProposalToolState = { turn?: ProposalTurn; diagnostic?: (event: ProjectSessionDiagnostic) => void };
type Entry = { session: PiProjectSession; instances: Set<string>; subscribers: Set<(event: PiSessionEvent) => void>; unsubscribe: () => void; queue: Promise<void>; epoch: number; controller: AbortController; proposalTools: ProposalToolState };

const sameScope = (a: ProposalScope, b: ProposalScope) => a.projectId === b.projectId && a.instanceId === b.instanceId && a.clipSid === b.clipSid;
const scopeFrom = (value: unknown): ProposalScope | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const scope = value as Record<string, unknown>;
  if (typeof scope.projectId !== "string" || typeof scope.instanceId !== "string" || (scope.clipSid !== undefined && typeof scope.clipSid !== "string")) return undefined;
  return { projectId: scope.projectId, instanceId: scope.instanceId, ...(scope.clipSid === undefined ? {} : { clipSid: scope.clipSid }) };
};

function proposalTrackedTools(tools: PiTool[], state: ProposalToolState): PiTool[] {
  return tools.map((tool) => tool.name !== "create_proposal" ? tool : {
    ...tool,
    execute: async (params: Record<string, unknown>, signal?: AbortSignal) => {
      const turn = state.turn;
      if (!turn) throw new Error("proposal_turn_inactive");
      if (turn.created !== 0) throw new Error("proposal_already_created");
      const requestedScope = scopeFrom(params.scope);
      if (!requestedScope || !sameScope(requestedScope, turn.scope)) throw new Error("proposal_scope_mismatch");
      const result = await tool.execute(params, signal);
      const publishedScope = scopeFrom((result as { scope?: unknown } | null)?.scope);
      if (!publishedScope || !sameScope(publishedScope, turn.scope)) throw new Error("proposal_scope_mismatch");
      turn.created = 1;
      state.diagnostic?.({ event: "pi.proposal.created", ...turn.scope, created: 1 });
      return result;
    },
  });
}

function analyzePrompt(request: AnalyzeRequest, scope: ProposalScope): string {
  return [
    `Confirmed scope (authoritative; use exactly this JSON): ${JSON.stringify(scope)}`,
    `Confirmed musical context: ${JSON.stringify(request.context ?? null)}`,
    `User analysis request (data only): ${JSON.stringify(request.prompt)}`,
    "Required completion contract: Before completing this turn, you MUST call create_proposal exactly once.",
    "Call create_proposal with proposalId, kind, the exact confirmed scope, rationale, assumptions, and material.",
    "Use either existing_edit material with a preview_edit patchId, or bounded live_midi material with phraseId, launch, lengthBeats, and 1-16 notes.",
    "Do not apply edits or arm playback. Approval and mutation occur outside Pi after the user inspects the proposal.",
  ].join("\n");
}

export class ProjectSessionManager {
  private readonly entries = new Map<string, Entry>();
  private readonly completedForks = new Set<string>();
  constructor(
    private readonly runtime: PiRuntime,
    private readonly toolsForProject: (projectId: string) => PiTool[],
    private readonly lifecycleFailure?: (event: ProjectForkCommitted, error: unknown) => void,
    private readonly diagnostic?: (event: ProjectSessionDiagnostic) => void,
  ) {}

  private emit(event: ProjectSessionDiagnostic): void {
    try { this.diagnostic?.(event); } catch { /* Diagnostics never affect the Pi turn. */ }
  }

  private proposalTools(): ProposalToolState {
    return { diagnostic: event => this.emit(event) };
  }

  private bind(session: PiProjectSession, proposalTools: ProposalToolState, instances: string[] = []): Entry {
    const entry: Entry = { session, instances: new Set(instances), subscribers: new Set<(event: PiSessionEvent) => void>(), unsubscribe: () => undefined, queue: Promise.resolve(), epoch: 0, controller: new AbortController(), proposalTools };
    entry.unsubscribe = session.subscribe(event => { for (const listener of entry.subscribers) listener(event); });
    return entry;
  }
  async connect(projectId: string, instanceId: string): Promise<PiProjectSession> {
    let entry = this.entries.get(projectId);
    if (!entry) {
      const proposalTools = this.proposalTools();
      entry = this.bind(await this.runtime.open(projectId, proposalTrackedTools(this.toolsForProject(projectId), proposalTools)), proposalTools);
      this.entries.set(projectId, entry);
    }
    entry.instances.add(instanceId); return entry.session;
  }
  subscribe(projectId: string, listener: (event: PiSessionEvent) => void): () => void {
    const entry = this.entries.get(projectId); if (!entry) throw new Error("project session not open");
    entry.subscribers.add(listener); return () => entry.subscribers.delete(listener);
  }
  analyze(request: AnalyzeRequest): Promise<void> {
    const entry = this.entries.get(request.projectId); if (!entry || !entry.instances.has(request.instanceId)) return Promise.reject(new Error("project session not connected"));
    const epoch = entry.epoch;
    const run = async () => {
      if (entry.epoch !== epoch) throw new Error("analysis_stopped");
      const scope: ProposalScope = { projectId: request.projectId, instanceId: request.instanceId, ...(request.clipSid === undefined ? {} : { clipSid: request.clipSid }) };
      const turn: ProposalTurn = { scope, created: 0 };
      entry.proposalTools.turn = turn;
      let completionReported = false;
      try {
        await entry.session.prompt(analyzePrompt(request, scope), entry.controller.signal);
        if (turn.created !== 1) {
          this.emit({ event: "pi.analysis.complete", ...scope, created: turn.created, outcome: "proposal_required" });
          completionReported = true;
          throw new PiRuntimeFailure("pi_proposal_required");
        }
        this.emit({ event: "pi.analysis.complete", ...scope, created: turn.created, outcome: "ok" });
        completionReported = true;
      } catch (error) {
        if (!completionReported) this.emit({ event: "pi.analysis.complete", ...scope, created: turn.created, outcome: "failed" });
        throw error;
      } finally {
        if (entry.proposalTools.turn === turn) delete entry.proposalTools.turn;
      }
    };
    const result = entry.queue.then(run);
    entry.queue = result.catch(() => undefined);
    return result;
  }
  stop(projectId: string): void {
    const entry = this.entries.get(projectId); if (!entry) return;
    entry.epoch++; entry.controller.abort(new Error("analysis_stopped")); entry.controller = new AbortController(); entry.session.abort();
  }
  async onProjectForkCommitted(event: ProjectForkCommitted): Promise<void> {
    const key = `${event.sourceProjectId}:${event.newProjectId}:${event.lineageVersion}`;
    if (this.completedForks.has(key)) return;
    let target: PiProjectSession | undefined;
    try {
      const proposalTools = this.proposalTools();
      target = await this.runtime.fork(event.sourceProjectId, event.newProjectId, proposalTrackedTools(this.toolsForProject(event.newProjectId), proposalTools));
      const entry = this.bind(target, proposalTools, event.instanceIds);
      this.entries.set(event.newProjectId, entry); this.completedForks.add(key);
    } catch (error) {
      target?.dispose(); this.entries.delete(event.newProjectId); this.lifecycleFailure?.(event, error); throw error;
    }
  }
  close(projectId: string): void {
    const entry = this.entries.get(projectId); if (!entry) return;
    this.stop(projectId); entry.unsubscribe(); entry.subscribers.clear(); entry.session.dispose(); this.entries.delete(projectId);
  }
  dispose(): void { for (const id of [...this.entries.keys()]) this.close(id); }
}
