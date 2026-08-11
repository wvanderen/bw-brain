import type { PiTool } from "./pi-runtime.js";

export interface RestrictedPiToolHandlers {
  readConfirmedScope(): Promise<unknown>;
  readContext(input: Record<string, unknown>): Promise<unknown>;
  preview(input: Record<string, unknown>): Promise<unknown>;
  createProposal(input: Record<string, unknown>): Promise<unknown>;
}

/** Closed authority surface: deliberately no apply, arm, socket, filesystem, or audio handles. */
export function createRestrictedPiTools(handlers: RestrictedPiToolHandlers): PiTool[] {
  return [
    { name: "read_confirmed_scope", description: "Read the daemon-confirmed project and instance scope.", execute: () => handlers.readConfirmedScope() },
    { name: "read_context", description: "Read normalized daemon context for the confirmed scope.", execute: input => handlers.readContext(input) },
    { name: "preview_edit", description: "Preview an edit through the canonical daemon EditService.", execute: input => handlers.preview(input) },
    { name: "create_proposal", description: "Create a bounded proposal for UI inspection and approval.", execute: input => handlers.createProposal(input) },
  ];
}
