import { describe, expect, it, vi } from "vitest";
import { ProposalStore } from "./proposal-store.js";

describe("ProposalStore", () => {
  it("keeps immutable revisions with exact scope and invalidates grants on change", () => {
    const invalidate = vi.fn();
    const store = new ProposalStore({ invalidateProposal: invalidate });
    const first = store.publish({ proposalId: "p1", kind: "existing_edit", scope: { projectId: "project-a", instanceId: "inst-a", clipSid: "clip-a" }, rationale: "tighten", assumptions: [], material: { patchId: "pt_1" } });
    const second = store.publish({ proposalId: "p1", kind: "existing_edit", scope: { projectId: "project-a", instanceId: "inst-a", clipSid: "clip-b" }, rationale: "tighten", assumptions: [], material: { patchId: "pt_1" } });

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(store.get("p1", 1)?.scope.clipSid).toBe("clip-a");
    expect(store.get("p1", 2)?.scope.clipSid).toBe("clip-b");
    expect(invalidate).toHaveBeenCalledWith("p1");
    expect(() => { (first.scope as { clipSid?: string }).clipSid = "changed"; }).toThrow();
  });

  it("bounds retained proposals and revisions", () => {
    const store = new ProposalStore({ maxProposals: 2, maxRevisions: 2 });
    for (const id of ["a", "b", "c"]) store.publish({ proposalId: id, kind: "existing_edit", scope: { projectId: "p", instanceId: "i", clipSid: "c" }, rationale: id, assumptions: [], material: { patchId: `pt_${id}` } });
    expect(store.get("a")).toBeUndefined();
    for (const rationale of ["two", "three"]) store.publish({ proposalId: "c", kind: "existing_edit", scope: { projectId: "p", instanceId: "i", clipSid: "c" }, rationale, assumptions: [], material: { patchId: "pt_c" } });
    expect(store.get("c", 1)).toBeUndefined();
    expect(store.get("c", 3)?.rationale).toBe("three");
  });
});
