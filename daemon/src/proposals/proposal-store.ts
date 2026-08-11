import { createHash } from "node:crypto";

export const MAX_PROPOSALS = 64;
export const MAX_REVISIONS = 8;

export interface ProposalScope { projectId: string; instanceId: string; clipSid?: string; }
export interface ExistingEditMaterial { patchId: string; }
export interface PhraseNote { ordinal: number; startBeats: number; durationBeats: number; port: number; channel: number; key: number; velocity: number; noteId: number; }
export interface LiveMidiMaterial { phraseId: string; launch: "next_beat" | "next_bar"; lengthBeats: number; notes: PhraseNote[]; }
export type ProposalInput = {
  proposalId: string; scope: ProposalScope; rationale: string; assumptions: string[];
} & ({ kind: "existing_edit"; material: ExistingEditMaterial } | { kind: "live_midi"; material: LiveMidiMaterial });
export type ProposalRevision = Readonly<ProposalInput & { revision: number; digest: string }>;

const ID = /^[A-Za-z0-9._:-]{1,64}$/;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function validate(input: ProposalInput): void {
  if (!ID.test(input.proposalId) || !ID.test(input.scope.projectId) || !ID.test(input.scope.instanceId) || (input.scope.clipSid !== undefined && !ID.test(input.scope.clipSid))) throw new Error("invalid proposal scope");
  if (input.rationale.length < 1 || input.rationale.length > 512 || input.assumptions.length > 8 || input.assumptions.some((item) => item.length < 1 || item.length > 256)) throw new Error("invalid proposal content");
  if (input.kind === "existing_edit") { if (!ID.test(input.material.patchId) || Object.keys(input.material).some((key) => key !== "patchId")) throw new Error("invalid patchId"); return; }
  const material = input.material;
  const noteValid = (note: PhraseNote) => Number.isInteger(note.ordinal) && note.ordinal >= 0 && note.ordinal <= 15
    && Number.isFinite(note.startBeats) && note.startBeats >= 0 && note.startBeats <= 64
    && Number.isFinite(note.durationBeats) && note.durationBeats > 0 && note.durationBeats <= 64
    && Number.isInteger(note.port) && note.port >= 0 && note.port <= 255
    && Number.isInteger(note.channel) && note.channel >= 0 && note.channel <= 15
    && Number.isInteger(note.key) && note.key >= 0 && note.key <= 127
    && Number.isFinite(note.velocity) && note.velocity >= 0 && note.velocity <= 1
    && Number.isInteger(note.noteId) && note.noteId >= -1 && note.noteId <= 2_147_483_647;
  if (!input.scope.clipSid || !ID.test(material.phraseId) || !Number.isFinite(material.lengthBeats) || material.lengthBeats <= 0 || material.lengthBeats > 64 || material.notes.length < 1 || material.notes.length > 16 || material.notes.some((note) => !noteValid(note))) throw new Error("invalid phrase");
}

/** Bounded immutable proposal/revision store. Visible focus is deliberately absent. */
export class ProposalStore {
  private readonly proposals = new Map<string, ProposalRevision[]>();
  private readonly maxProposals: number;
  private readonly maxRevisions: number;
  private readonly invalidateProposal?: (proposalId: string) => void;

  constructor(options: { maxProposals?: number; maxRevisions?: number; invalidateProposal?: (proposalId: string) => void } = {}) {
    this.maxProposals = options.maxProposals ?? MAX_PROPOSALS;
    this.maxRevisions = options.maxRevisions ?? MAX_REVISIONS;
    this.invalidateProposal = options.invalidateProposal;
  }

  publish(input: ProposalInput): ProposalRevision {
    validate(input);
    const copy = structuredClone(input);
    const digest = createHash("sha256").update(canonical(copy)).digest("hex");
    const current = this.proposals.get(input.proposalId) ?? [];
    const latest = current.at(-1);
    if (latest?.digest === digest) return latest;
    if (latest) this.invalidateProposal?.(input.proposalId);
    const revision = freeze({ ...copy, revision: (latest?.revision ?? 0) + 1, digest }) as ProposalRevision;
    const revisions = [...current, revision].slice(-this.maxRevisions);
    this.proposals.delete(input.proposalId);
    this.proposals.set(input.proposalId, revisions);
    while (this.proposals.size > this.maxProposals) this.proposals.delete(this.proposals.keys().next().value as string);
    return revision;
  }

  get(proposalId: string, revision?: number): ProposalRevision | undefined {
    const revisions = this.proposals.get(proposalId);
    const found = revision === undefined ? revisions?.at(-1) : revisions?.find((item) => item.revision === revision);
    return found;
  }

  invalidate(proposalId: string): void { this.invalidateProposal?.(proposalId); }
}

export function sameScope(a: ProposalScope, b: ProposalScope): boolean {
  return a.projectId === b.projectId && a.instanceId === b.instanceId && a.clipSid === b.clipSid;
}
