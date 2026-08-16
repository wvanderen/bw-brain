import type { PiTool } from "./pi-runtime.js";

export interface RestrictedPiToolHandlers {
  readConfirmedScope(): Promise<unknown>;
  readContext(input: Record<string, unknown>): Promise<unknown>;
  preview(input: Record<string, unknown>): Promise<unknown>;
  createProposal(input: Record<string, unknown>): Promise<unknown>;
}

const idSchema = { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9._:-]+$" } as const;
const scopeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "instanceId"],
  properties: { projectId: idSchema, instanceId: idSchema, clipSid: idSchema },
} as const;
const noteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ordinal", "startBeats", "durationBeats", "port", "channel", "key", "velocity", "noteId"],
  properties: {
    ordinal: { type: "integer", minimum: 0, maximum: 15 },
    startBeats: { type: "number", minimum: 0, maximum: 64 },
    durationBeats: { type: "number", exclusiveMinimum: 0, maximum: 64 },
    port: { type: "integer", minimum: 0, maximum: 255 },
    channel: { type: "integer", minimum: 0, maximum: 15 },
    key: { type: "integer", minimum: 0, maximum: 127 },
    velocity: { type: "number", minimum: 0, maximum: 1 },
    noteId: { type: "integer", minimum: -1, maximum: 2_147_483_647 },
  },
} as const;

export const CREATE_PROPOSAL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["proposalId", "kind", "scope", "rationale", "assumptions", "material"],
  properties: {
    proposalId: idSchema,
    kind: { enum: ["existing_edit", "live_midi"] },
    scope: scopeSchema,
    rationale: { type: "string", minLength: 1, maxLength: 512 },
    assumptions: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 256 } },
    material: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["patchId"],
          properties: { patchId: idSchema },
          description: "Use only when kind is existing_edit; patchId must come from preview_edit.",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["phraseId", "launch", "lengthBeats", "notes"],
          properties: {
            phraseId: idSchema,
            launch: { enum: ["next_beat", "next_bar"] },
            lengthBeats: { type: "number", exclusiveMinimum: 0, maximum: 64 },
            notes: { type: "array", minItems: 1, maxItems: 16, items: noteSchema },
          },
          description: "Use only when kind is live_midi; scope must include clipSid.",
        },
      ],
    },
  },
} as const;

/** Closed authority surface: deliberately no apply, arm, socket, filesystem, or audio handles. */
export function createRestrictedPiTools(handlers: RestrictedPiToolHandlers): PiTool[] {
  return [
    { name: "read_confirmed_scope", description: "Read the daemon-confirmed project and instance scope.", execute: () => handlers.readConfirmedScope() },
    { name: "read_context", description: "Read normalized daemon context for the confirmed scope.", execute: input => handlers.readContext(input) },
    { name: "preview_edit", description: "Preview an edit through the canonical daemon EditService.", execute: input => handlers.preview(input) },
    {
      name: "create_proposal",
      description: "Create one bounded exact-scope proposal for UI inspection. existing_edit requires preview_edit material.patchId; live_midi requires scope.clipSid and complete bounded note fields. This does not approve, apply, or arm it.",
      parameters: CREATE_PROPOSAL_PARAMETERS,
      execute: input => handlers.createProposal(input),
    },
  ];
}
