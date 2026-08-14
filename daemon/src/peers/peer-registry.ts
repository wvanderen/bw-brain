import { PeerConnection } from "./peer-connection.js";
import { randomUUID } from "node:crypto";

export interface InstanceLease { connectionId: string; projectId?: string; instanceId: string; status: "unconfirmed" | "pending" | "confirmed" | "stale" | "unlinked"; }

/** Accepted peer connections. Targeted send is deliberately the only write API. */
export class PeerRegistry {
  private readonly peers = new Map<string, PeerConnection>();
  private readonly leases = new Map<string, InstanceLease>();

  constructor(private readonly validateEnvelope: (envelope: unknown) => boolean = () => true) {}

  get size(): number { return this.peers.size; }
  has(connectionId: string): boolean { return this.peers.has(connectionId); }

  accept(connection: PeerConnection): void {
    if (!connection.isAccepted()) throw new Error("PeerRegistry accepts handshaken peers only");
    this.peers.set(connection.connectionId, connection);
  }

  remove(connectionId: string): void {
    this.peers.delete(connectionId);
    for (const [instanceId, lease] of this.leases) if (lease.connectionId === connectionId) this.leases.delete(instanceId);
  }

  lease(connectionId: string, instanceId: string): { lease: InstanceLease; rekey?: { oldInstanceId: string; newInstanceId: string } } {
    const existing = this.leases.get(instanceId);
    if (existing && existing.connectionId !== connectionId) {
      const newInstanceId = `inst-${randomUUID()}`;
      const lease = { connectionId, instanceId: newInstanceId, status: "unconfirmed" as const };
      this.leases.set(newInstanceId, lease);
      return { lease: { ...lease }, rekey: { oldInstanceId: instanceId, newInstanceId } };
    }
    const lease = { connectionId, instanceId, status: "unconfirmed" as const };
    this.leases.set(instanceId, lease);
    return { lease: { ...lease } };
  }

  getLease(instanceId: string): InstanceLease | undefined { const lease = this.leases.get(instanceId); return lease && { ...lease }; }
  getConnectionLease(connectionId: string): InstanceLease | undefined {
    const lease = [...this.leases.values()].find((candidate) => candidate.connectionId === connectionId);
    return lease && { ...lease };
  }
  setLeaseScope(instanceId: string, projectId: string, status: InstanceLease["status"]): void {
    const lease = this.leases.get(instanceId); if (!lease) throw new Error("instance_not_leased");
    this.leases.set(instanceId, { ...lease, projectId, status });
  }
  requireConfirmed(connectionId: string, projectId: string, instanceId: string): InstanceLease {
    const lease = this.leases.get(instanceId);
    if (!lease || lease.connectionId !== connectionId || lease.projectId !== projectId || lease.status !== "confirmed") throw new Error("scope_not_confirmed");
    return { ...lease };
  }
  projectPeers(projectId: string): InstanceLease[] { return [...this.leases.values()].filter((lease) => lease.projectId === projectId && lease.status === "confirmed").map((lease) => ({ ...lease })); }
  projectIds(): string[] { return [...new Set([...this.leases.values()].flatMap((lease) => lease.projectId ? [lease.projectId] : []))]; }

  sendTo(connectionId: string, envelope: object): boolean {
    if (!this.validateEnvelope(envelope)) return false;
    return this.peers.get(connectionId)?.send(envelope) ?? false;
  }

  closeAll(): void {
    for (const peer of [...this.peers.values()]) peer.close();
    this.peers.clear();
    this.leases.clear();
  }
}
