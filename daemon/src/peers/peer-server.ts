import * as net from "node:net";
import { randomUUID } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";

import peerSchema from "../../../schemas/clap/peer.schema.json" with { type: "json" };
import identitySchema from "../../../schemas/clap/identity.schema.json" with { type: "json" };
import telemetrySchema from "../../../schemas/clap/telemetry.schema.json" with { type: "json" };
import proposalSchema from "../../../schemas/clap/proposal.schema.json" with { type: "json" };
import phraseSchema from "../../../schemas/clap/phrase.schema.json" with { type: "json" };
import type { ClapPeerMessage } from "../gen/clap.js";
import { PeerConnection } from "./peer-connection.js";
import { PeerRegistry } from "./peer-registry.js";

const LOOPBACK_HOST = "127.0.0.1";
const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const schema of [peerSchema, identitySchema, telemetrySchema, proposalSchema, phraseSchema]) ajv.addSchema(schema);
const validators = [peerSchema, identitySchema, telemetrySchema, proposalSchema, phraseSchema]
  .map((schema) => ajv.getSchema(schema.$id)!);
const validateMessage = (message: unknown): boolean => validators.some((validate) => validate(message));

export interface PeerServerOptions {
  port?: number;
  host?: string;
  handshakeTimeoutMs?: number;
  maxLineBytes?: number;
  maxQueueMessages?: number;
  maxQueueBytes?: number;
  onMessage?: (connectionId: string, message: object) => void;
}

/** Dedicated connection-aware CLAP endpoint. It never touches controller TCP. */
export class PeerServer {
  static readonly DEFAULT_PORT = 7879;
  readonly registry = new PeerRegistry(validateMessage);
  readonly ready: Promise<void>;
  private readonly server: net.Server;
  private readonly pending = new Map<string, PeerConnection>();
  private closed = false;

  constructor(private readonly options: PeerServerOptions = {}) {
    const host = options.host ?? LOOPBACK_HOST;
    if (host !== LOOPBACK_HOST) {
      throw new Error(`PeerServer refuses non-loopback bind (got ${host}); only ${LOOPBACK_HOST} is permitted.`);
    }
    this.server = net.createServer((socket) => this.acceptSocket(socket));
    this.ready = new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(options.port ?? PeerServer.DEFAULT_PORT, host, () => {
        this.server.off("error", reject);
        this.server.on("error", (error) => console.error("[peer-server] listener error:", error.message));
        resolve();
      });
    });
  }

  get port(): number {
    const address = this.server.address();
    if (!address || typeof address === "string") return this.options.port ?? PeerServer.DEFAULT_PORT;
    return address.port;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const peer of [...this.pending.values()]) peer.close();
    this.pending.clear();
    this.registry.closeAll();
    if (!this.server.listening) return;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private acceptSocket(socket: net.Socket): void {
    if (this.closed) { socket.destroy(); return; }
    const connectionId = `conn-${randomUUID()}`;
    const connection = new PeerConnection(connectionId, socket, {
      handshakeTimeoutMs: this.options.handshakeTimeoutMs ?? 3_000,
      maxLineBytes: this.options.maxLineBytes ?? 65_536,
      maxQueueMessages: this.options.maxQueueMessages ?? 32,
      maxQueueBytes: this.options.maxQueueBytes ?? 262_144,
      validateMessage,
      onHello: (peer, hello) => this.acceptHello(peer, hello),
      onMessage: this.options.onMessage,
      onClose: (id) => {
        this.pending.delete(id);
        this.registry.remove(id);
      },
    });
    this.pending.set(connectionId, connection);
  }

  private acceptHello(
    connection: PeerConnection,
    hello: Extract<ClapPeerMessage, { type: "clap.hello" }>,
  ): void {
    connection.applyPeerLimits(hello.limits);
    connection.markAccepted();
    this.pending.delete(connection.connectionId);
    this.registry.accept(connection);
    connection.send({ type: "clap.accept", connectionId: connection.connectionId, instanceId: hello.instanceId });
  }
}
