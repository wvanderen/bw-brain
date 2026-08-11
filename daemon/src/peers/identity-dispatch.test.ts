import { describe, expect, it, vi } from "vitest";
import { IdentityDispatch } from "./identity-dispatch.js";
describe("IdentityDispatch", () => it("rekeys a simultaneous claimant and fails authority closed", () => {
  const sent: { id: string; msg: any }[] = [];
  const leases = new Map<string, any>();
  const registry: any = { lease: (id: string, instanceId: string) => { const old = leases.get(instanceId); if (old) return { lease: {}, rekey: { oldInstanceId: instanceId, newInstanceId: "minted" } }; const lease = { connectionId: id, instanceId, status: "unconfirmed" }; leases.set(instanceId, lease); return { lease }; }, sendTo: (id: string, msg: any) => (sent.push({ id, msg }), true), requireConfirmed: vi.fn(() => { throw new Error(); }), setLeaseScope: vi.fn() };
  const dispatch = new IdentityDispatch(registry); expect(dispatch.onHello("a", "same")).toBe("same"); expect(dispatch.onHello("b", "same")).toBe("minted");
  expect(sent.at(-1)).toMatchObject({ id: "b", msg: { type: "instance.rekey", oldInstanceId: "same", newInstanceId: "minted" } });
  expect(dispatch.authorize("a", { type: "edit.apply", scope: { projectId: "p", instanceId: "same" } })).toBe(false);
}));
