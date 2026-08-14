import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { atomicWriteJson } from "../store/atomic-write.js";

export type LinkStatus = "confirmed" | "stale" | "unlinked";

export interface ProjectRecord {
  version: "1.0";
  projectId: string;
  lineageId: string;
  lineageVersion: number;
  parentProjectId?: string;
  hints: { projectName?: string };
  links: Record<string, { status: LinkStatus; trackSid?: string; deviceHint?: string | null }>;
  history: string[];
}

export interface ConfirmedScope { projectId: string; instanceId: string; trackSid?: string; }

const validId = (id: string) => /^[A-Za-z0-9._:-]{1,64}$/.test(id);

/** Durable owner of project identity, lineage, and controller-confirmed links. */
export class ProjectRegistry {
  private readonly records = new Map<string, ProjectRecord>();
  private activeProjectId: string | undefined;
  constructor(private readonly storageDir: string) {}

  private path(projectId: string): string { return join(this.storageDir, projectId, "project-registry.json"); }
  private activePath(): string { return join(this.storageDir, "active-project.json"); }

  /** Persisted daemon-owned project identity. It is minted, never inferred from names or cwd. */
  async getOrCreateActiveProjectId(): Promise<string> {
    if (this.activeProjectId) return this.activeProjectId;
    try {
      const record = JSON.parse(await readFile(this.activePath(), "utf8")) as { version?: unknown; projectId?: unknown };
      if (record.version !== "1.0" || typeof record.projectId !== "string" || !validId(record.projectId)) {
        throw new Error("invalid active project identity");
      }
      this.activeProjectId = record.projectId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.activeProjectId = `project-${randomUUID()}`;
      await atomicWriteJson(this.activePath(), { version: "1.0", projectId: this.activeProjectId });
    }
    await this.open(this.activeProjectId);
    return this.activeProjectId;
  }

  async setActiveProjectId(projectId: string): Promise<void> {
    if (!validId(projectId)) throw new Error("invalid projectId");
    await this.open(projectId);
    await atomicWriteJson(this.activePath(), { version: "1.0", projectId });
    this.activeProjectId = projectId;
  }

  async open(projectId: string): Promise<ProjectRecord> {
    if (!validId(projectId)) throw new Error("invalid projectId");
    const cached = this.records.get(projectId);
    if (cached) return structuredClone(cached);
    let record: ProjectRecord;
    try { record = JSON.parse(await readFile(this.path(projectId), "utf8")) as ProjectRecord; }
    catch { record = { version: "1.0", projectId, lineageId: projectId, lineageVersion: 1, hints: {}, links: {}, history: [] }; }
    this.records.set(projectId, record);
    return structuredClone(record);
  }

  private async persist(record: ProjectRecord): Promise<void> {
    await atomicWriteJson(this.path(record.projectId), record);
    this.records.set(record.projectId, structuredClone(record));
  }

  async updateHints(projectId: string, hints: ProjectRecord["hints"]): Promise<void> {
    const record = await this.open(projectId);
    record.hints = { ...record.hints, ...hints };
    await this.persist(record);
  }

  async confirmLink(projectId: string, instanceId: string, evidence: { trackSid?: string; deviceHint?: string | null } = {}): Promise<void> {
    if (!validId(instanceId)) throw new Error("invalid instanceId");
    const record = await this.open(projectId);
    record.links[instanceId] = { status: "confirmed", ...evidence };
    await this.persist(record);
  }

  async setLinkStatus(projectId: string, instanceId: string, status: LinkStatus): Promise<void> {
    const record = await this.open(projectId);
    record.links[instanceId] = { ...record.links[instanceId], status };
    await this.persist(record);
  }

  async requireConfirmedScope(projectId: string, instanceId: string): Promise<ConfirmedScope> {
    const record = await this.open(projectId);
    const link = record.links[instanceId];
    if (!link || link.status !== "confirmed") throw new Error("scope_not_confirmed");
    return { projectId, instanceId, trackSid: link.trackSid };
  }

  async appendHistory(projectId: string, entry: string): Promise<void> {
    const record = await this.open(projectId); record.history.push(entry); await this.persist(record);
  }

  /** Persist the complete fork before publishing it in memory. Source is never changed. */
  async fork(sourceProjectId: string, newProjectId: string): Promise<ProjectRecord> {
    if (!validId(newProjectId) || sourceProjectId === newProjectId) throw new Error("invalid fork target");
    const source = await this.open(sourceProjectId);
    try { await readFile(this.path(newProjectId), "utf8"); throw new Error("fork target exists"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const forked: ProjectRecord = {
      ...structuredClone(source), projectId: newProjectId, parentProjectId: sourceProjectId,
      lineageVersion: source.lineageVersion + 1,
    };
    await atomicWriteJson(this.path(newProjectId), forked);
    this.records.set(newProjectId, structuredClone(forked));
    return structuredClone(forked);
  }
}
