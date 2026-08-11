import type { PeerRegistry } from "./peer-registry.js";

const AUTHORITY_TYPES = new Set(["analysis.request", "proposal.approve", "edit.apply", "phrase.arm"]);

/** Connection-aware identity ingress. Every response is targeted to its claimant. */
export class IdentityDispatch {
  constructor(private readonly registry: PeerRegistry) {}

  onHello(connectionId: string, instanceId: string): string {
    const result = this.registry.lease(connectionId, instanceId);
    if (result.rekey) {
      this.registry.sendTo(connectionId, { type: "instance.rekey", ...result.rekey, reason: "simultaneous_claim" });
      return result.rekey.newInstanceId;
    }
    this.registry.sendTo(connectionId, { type: "clap.accept", connectionId, instanceId });
    return instanceId;
  }

  markPending(instanceId: string, projectId: string): void { this.registry.setLeaseScope(instanceId, projectId, "pending"); }
  markConfirmed(instanceId: string, projectId: string): void { this.registry.setLeaseScope(instanceId, projectId, "confirmed"); }
  markStale(instanceId: string, projectId: string): void { this.registry.setLeaseScope(instanceId, projectId, "stale"); }

  authorize(connectionId: string, message: Record<string, unknown>): boolean {
    if (!AUTHORITY_TYPES.has(String(message.type))) return true;
    const scope = message.scope as { projectId?: string; instanceId?: string } | undefined;
    if (!scope?.projectId || !scope.instanceId) return false;
    try { this.registry.requireConfirmed(connectionId, scope.projectId, scope.instanceId); return true; }
    catch { this.registry.sendTo(connectionId, { type: "action.error", error: "scope_not_confirmed" }); return false; }
  }
}
