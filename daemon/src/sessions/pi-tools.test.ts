import { describe, expect, it, vi } from "vitest";
import { createRestrictedPiTools } from "./pi-tools.js";

describe("restricted Pi tools", () => {
  it("exposes only handler-backed reads, preview, and proposal creation", async () => {
    const deps = { readConfirmedScope: vi.fn(async () => ({ projectId: "p", instanceId: "i" })), readContext: vi.fn(async () => ({ tempo: 120 })), preview: vi.fn(async () => ({ patchId: "x" })), createProposal: vi.fn(async () => ({ proposalId: "y" })) };
    const tools = createRestrictedPiTools(deps);
    expect(tools.map(t => t.name)).toEqual(["read_confirmed_scope", "read_context", "preview_edit", "create_proposal"]);
    expect(tools.map(t => t.name).join(" ")).not.toMatch(/apply|arm|socket|file|audio/);
    await tools[0]!.execute({}, new AbortController().signal);
    expect(deps.readConfirmedScope).toHaveBeenCalledOnce();
    expect(Object.keys(tools[0]!)).not.toContain("controller");
  });
});
