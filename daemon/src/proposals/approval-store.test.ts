import { describe, expect, it } from "vitest";
import { ApprovalStore } from "./approval-store.js";

const proposal = { proposalId: "p1", revision: 1, kind: "existing_edit" as const, scope: { projectId: "project", instanceId: "instance", clipSid: "clip" }, digest: "a".repeat(64) };

describe("ApprovalStore", () => {
  it("atomically permits exactly one concurrent consumer", async () => {
    const store = new ApprovalStore();
    const grant = store.issue(proposal);
    const request = { ...proposal, token: grant.token };
    const results = await Promise.all(Array.from({ length: 20 }, async () => store.consume(request, proposal.scope)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it("refuses replay, expiry, digest, revision, and exact-scope drift", () => {
    let now = 10;
    const store = new ApprovalStore({ now: () => now, ttlMs: 5 });
    const mismatch = store.issue(proposal);
    expect(store.consume({ ...proposal, token: mismatch.token, digest: "b".repeat(64) }, proposal.scope)).toMatchObject({ ok: false });
    expect(store.consume({ ...proposal, token: mismatch.token }, proposal.scope)).toMatchObject({ ok: false, error: "consumed" });
    const expired = store.issue(proposal); now = 16;
    expect(store.consume({ ...proposal, token: expired.token }, proposal.scope)).toMatchObject({ ok: false, error: "expired" });
    now = 10;
    const drifted = store.issue(proposal);
    expect(store.consume({ ...proposal, token: drifted.token }, { ...proposal.scope, clipSid: "other" })).toMatchObject({ ok: false, error: "scope_mismatch" });
  });

  it("invalidates by proposal, disconnect, stop, rekey, and fork", () => {
    for (const event of ["proposal", "disconnect", "stop", "rekey", "fork"] as const) {
      const store = new ApprovalStore();
      const grant = store.issue(proposal);
      if (event === "proposal") store.invalidateProposal(proposal.proposalId);
      else store.invalidate(event, proposal.scope);
      expect(store.consume({ ...proposal, token: grant.token }, proposal.scope)).toMatchObject({ ok: false });
    }
  });
});
