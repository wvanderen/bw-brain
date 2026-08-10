import { PeerConnection } from "./peer-connection.js";

/** Accepted peer connections. Targeted send is deliberately the only write API. */
export class PeerRegistry {
  private readonly peers = new Map<string, PeerConnection>();

  constructor(private readonly validateEnvelope: (envelope: unknown) => boolean = () => true) {}

  get size(): number { return this.peers.size; }
  has(connectionId: string): boolean { return this.peers.has(connectionId); }

  accept(connection: PeerConnection): void {
    if (!connection.isAccepted()) throw new Error("PeerRegistry accepts handshaken peers only");
    this.peers.set(connection.connectionId, connection);
  }

  remove(connectionId: string): void {
    this.peers.delete(connectionId);
  }

  sendTo(connectionId: string, envelope: object): boolean {
    if (!this.validateEnvelope(envelope)) return false;
    return this.peers.get(connectionId)?.send(envelope) ?? false;
  }

  closeAll(): void {
    for (const peer of [...this.peers.values()]) peer.close();
    this.peers.clear();
  }
}
