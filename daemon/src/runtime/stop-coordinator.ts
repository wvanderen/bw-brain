export interface ProjectPeer { connectionId: string; instanceId: string; }
type Dependencies = {
  stopAnalysis(projectId: string): void;
  invalidateApprovals(projectId: string): void;
  clearPending(projectId: string): void;
  projectPeers(projectId: string): ProjectPeer[];
  sendTo(connectionId: string, message: object): boolean;
  publishStopped(projectId: string, targeted: number): void;
};

/** Cancellation-only coordinator. It deliberately cannot receive journal/history/revert APIs. */
export class StopCoordinator {
  constructor(private readonly deps: Dependencies) {}
  async stopProject(projectId: string): Promise<{ ok: true; targeted: number }> {
    this.deps.stopAnalysis(projectId);
    this.deps.invalidateApprovals(projectId);
    this.deps.clearPending(projectId);
    const peers = this.deps.projectPeers(projectId);
    for (const peer of peers) this.deps.sendTo(peer.connectionId, { type: "stop", projectId, reason: "user" });
    this.deps.publishStopped(projectId, peers.length);
    return { ok: true, targeted: peers.length };
  }
}
