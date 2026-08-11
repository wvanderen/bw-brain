import { describe, expect, it, vi } from "vitest";
import { EditService } from "./edit-service.js";

describe("EditService", () => it("does not journal or evict a failed controller mutation", async () => {
  const candidate = { patchId: "pt_1", scope: { clipSid: "clip" }, operations: [], rationale: "x", reversibility: "self-inverse", risk: "low", previewClipSid: "clip", undoLabel: "x" };
  const append = vi.fn(), evict = vi.fn();
  const service = new EditService({ candidateStore: { get: () => candidate, evict } as any, patchHistory: { append } as any, applyPatchOverBridge: async () => ({ applied: 0, failed: 1 }) });
  const result = await service.apply({ selection: { clipSid: "clip" } } as any, null, "live", { patchId: "pt_1" });
  expect(result.payload).toMatchObject({ ok: false, error: "apply_failed" }); expect(append).not.toHaveBeenCalled(); expect(evict).not.toHaveBeenCalled();
}));
