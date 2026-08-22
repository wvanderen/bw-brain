import { describe, expect, it, vi } from "vitest";
import type { PeerConnection } from "./peer-connection.js";
import { PeerRegistry } from "./peer-registry.js";

describe("PeerRegistry project fork rekey", () => {
  it("moves only the confirmed live source leases after publishing commit then rekey", () => {
    const sent: object[] = [];
    const peer = {
      connectionId: "connection-1",
      isAccepted: () => true,
      send: vi.fn((message: object) => (sent.push(message), true)),
      close: vi.fn(),
    } as unknown as PeerConnection;
    const registry = new PeerRegistry();
    registry.accept(peer);
    registry.lease(peer.connectionId, "source-instance");
    registry.setLeaseScope("source-instance", "source-project", "confirmed");

    const rekeys = registry.planProjectFork(peer.connectionId, "source-project", ["source-instance"]);
    expect(rekeys).toHaveLength(1);
    expect(rekeys[0]).toMatchObject({ connectionId: peer.connectionId, oldInstanceId: "source-instance" });
    expect(rekeys[0]!.newInstanceId).not.toBe("source-instance");
    const event = { type: "ProjectForkCommitted", sourceProjectId: "source-project", newProjectId: "fork-project", instanceIds: [rekeys[0]!.newInstanceId], lineageVersion: 2 };
    registry.commitProjectFork("fork-project", rekeys, event);

    expect(sent).toEqual([event, { type: "instance.rekey", oldInstanceId: "source-instance", newInstanceId: rekeys[0]!.newInstanceId, reason: "project_fork" }]);
    expect(registry.getLease("source-instance")).toBeUndefined();
    expect(registry.getLease(rekeys[0]!.newInstanceId)).toMatchObject({ projectId: "fork-project", status: "confirmed" });
  });

  it("refuses a fork when the requester is not confirmed or a durable source instance is absent", () => {
    const peer = { connectionId: "connection-1", isAccepted: () => true, send: () => true, close: vi.fn() } as unknown as PeerConnection;
    const registry = new PeerRegistry(); registry.accept(peer); registry.lease(peer.connectionId, "i1");
    expect(() => registry.planProjectFork(peer.connectionId, "source", ["i1"])).toThrow("fork_scope_not_confirmed");
    registry.setLeaseScope("i1", "source", "confirmed");
    expect(() => registry.planProjectFork(peer.connectionId, "source", ["i1", "i2"])).toThrow("fork_instances_not_connected");
  });
});

describe("PeerRegistry construction-sentinel identity", () => {
  it("always rekeys inst-local even without a simultaneous live claimant", () => {
    const registry = new PeerRegistry();
    const result = registry.lease("connection-new", "inst-local");
    expect(result.rekey).toMatchObject({ oldInstanceId: "inst-local" });
    expect(result.rekey!.newInstanceId).toMatch(/^inst-[0-9a-f-]{36}$/);
    expect(result.lease.instanceId).toBe(result.rekey!.newInstanceId);
    expect(registry.getLease("inst-local")).toBeUndefined();
  });
});
