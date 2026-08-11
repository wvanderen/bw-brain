import type { ProjectForkCommitted } from "../peers/session-actions.js";
import type { PiProjectSession, PiRuntime, PiSessionEvent, PiTool } from "./pi-runtime.js";

type AnalyzeRequest = { projectId: string; instanceId: string; clipSid?: string; prompt: string; context?: unknown };
type Entry = { session: PiProjectSession; instances: Set<string>; subscribers: Set<(event: PiSessionEvent) => void>; unsubscribe: () => void; queue: Promise<void>; epoch: number; controller: AbortController };

export class ProjectSessionManager {
  private readonly entries = new Map<string, Entry>();
  private readonly completedForks = new Set<string>();
  constructor(private readonly runtime: PiRuntime, private readonly toolsForProject: (projectId: string) => PiTool[], private readonly lifecycleFailure?: (event: ProjectForkCommitted, error: unknown) => void) {}

  private bind(session: PiProjectSession, instances: string[] = []): Entry {
    const entry: Entry = { session, instances: new Set(instances), subscribers: new Set<(event: PiSessionEvent) => void>(), unsubscribe: () => undefined, queue: Promise.resolve(), epoch: 0, controller: new AbortController() };
    entry.unsubscribe = session.subscribe(event => { for (const listener of entry.subscribers) listener(event); });
    return entry;
  }
  async connect(projectId: string, instanceId: string): Promise<PiProjectSession> {
    let entry = this.entries.get(projectId);
    if (!entry) { entry = this.bind(await this.runtime.open(projectId, this.toolsForProject(projectId))); this.entries.set(projectId, entry); }
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
      const scoped = JSON.stringify({ projectId: request.projectId, instanceId: request.instanceId, clipSid: request.clipSid ?? null, confirmedContext: request.context ?? null });
      await entry.session.prompt(`Confirmed scope: ${scoped}\nAnalysis request: ${request.prompt}`, entry.controller.signal);
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
      target = await this.runtime.fork(event.sourceProjectId, event.newProjectId, this.toolsForProject(event.newProjectId));
      const entry = this.bind(target, event.instanceIds);
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
