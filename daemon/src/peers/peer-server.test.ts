import * as net from "node:net";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PeerConnection } from "./peer-connection.js";
import { PeerServer } from "./peer-server.js";

const hello = (instanceId: string) => ({
  type: "clap.hello" as const,
  protocol: "1.0" as const,
  instanceId,
  capabilities: ["phrase"],
  limits: { maxLineBytes: 65_536, maxQueueMessages: 32, maxQueueBytes: 262_144 },
});

const phrase = {
  type: "phrase.arm" as const,
  armToken: "arm-1",
  proposalId: "proposal-1",
  revision: 1,
  phraseId: "phrase-1",
  scope: { projectId: "project-1", instanceId: "instance-a", clipSid: "clip-1" },
  launch: "next_bar" as const,
  lengthBeats: 1,
  notes: [{ ordinal: 0, startBeats: 0, durationBeats: 0.5, port: 0, channel: 0, key: 60, velocity: 0.8, noteId: 1 }],
};

const publishedProposal = {
  type: "proposal.publish" as const,
  proposalId: "proposal-1",
  revision: 1,
  digest: "a".repeat(64),
  kind: "live_midi" as const,
  scope: phrase.scope,
  rationale: "inspect",
  assumptions: [],
  material: { phraseId: "phrase-1", launch: "next_bar" as const, lengthBeats: 1, notes: phrase.notes },
};

const sockets: net.Socket[] = [];
const servers: PeerServer[] = [];
const controllerServers: net.Server[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  for (const server of servers.splice(0)) await server.close();
  for (const server of controllerServers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

function connect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextLine(socket: net.Socket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffered = "";
    const onData = (chunk: Buffer): void => {
      buffered += chunk.toString("utf8");
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      socket.off("data", onData);
      resolve(JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>);
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

async function handshake(socket: net.Socket, instanceId: string): Promise<string> {
  const accepted = nextLine(socket);
  const line = JSON.stringify(hello(instanceId)) + "\n";
  socket.write(line.slice(0, 7));
  socket.write(line.slice(7));
  return String((await accepted).connectionId);
}

describe("PeerServer targeted CLAP routing", () => {
  it("binds only literal loopback and defaults to port 7879", async () => {
    expect(() => new PeerServer({ host: "0.0.0.0", port: 0 })).toThrow(/non-loopback/);
    expect(PeerServer.DEFAULT_PORT).toBe(7879);
  });

  it("sends a phrase only to the selected accepted connection", async () => {
    const server = new PeerServer({ port: 0 });
    servers.push(server);
    await server.ready;
    const a = await connect(server.port);
    const b = await connect(server.port);
    const controllerServer = net.createServer();
    controllerServers.push(controllerServer);
    await new Promise<void>((resolve) => controllerServer.listen(0, "127.0.0.1", resolve));
    const controllerPort = (controllerServer.address() as net.AddressInfo).port;
    const controllerAccepted = new Promise<net.Socket>((resolve) => controllerServer.once("connection", resolve));
    const controllerClient = await connect(controllerPort);
    const controller = await controllerAccepted;
    const aId = await handshake(a, "instance-a");
    await handshake(b, "instance-b");
    const bData = vi.fn();
    const controllerData = vi.fn();
    b.on("data", bData);
    controller.on("data", controllerData);

    expect(server.registry.sendTo(aId, publishedProposal)).toBe(true);
    expect((await nextLine(a)).type).toBe("proposal.publish");
    expect(server.registry.sendTo(aId, phrase)).toBe(true);
    expect((await nextLine(a)).type).toBe("phrase.arm");
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(bData).not.toHaveBeenCalled();
    expect(controllerData).not.toHaveBeenCalled();
    controller.destroy();
    controllerClient.destroy();
  });

  it("accepts the current scoped analysis request without closing the peer", async () => {
    let deliver!: (value: { connectionId: string; message: object }) => void;
    const delivered = new Promise<{ connectionId: string; message: object }>((resolve) => { deliver = resolve; });
    const server = new PeerServer({
      port: 0,
      onMessage: (connectionId, message) => deliver({ connectionId, message }),
    });
    servers.push(server);
    await server.ready;

    const socket = await connect(server.port);
    const connectionId = await handshake(socket, "inst-live-probe");
    const request = {
      type: "analysis.request",
      requestId: "analysis-live-probe",
      scope: { projectId: "project-live-probe", instanceId: "inst-live-probe" },
    };
    socket.write(JSON.stringify(request) + "\n");

    await expect(delivered).resolves.toEqual({ connectionId, message: request });
    expect(server.registry.has(connectionId)).toBe(true);
  });

  it("accepts exact proposal approval request and consume actions without closing the peer", async () => {
    const delivered: object[] = [];
    let complete!: () => void;
    const received = new Promise<void>((resolve) => { complete = resolve; });
    const server = new PeerServer({
      port: 0,
      onMessage: (_connectionId, message) => { delivered.push(message); if (delivered.length === 2) complete(); },
    });
    servers.push(server);
    await server.ready;
    const socket = await connect(server.port);
    const connectionId = await handshake(socket, "instance-a");
    const scope = { projectId: "project-1", instanceId: "instance-a", clipSid: "clip-1" };
    const request = { type: "proposal.approval.request", proposalId: "proposal-1", revision: 1, scope };
    const consume = { type: "approval.consume", token: "token-1", proposalId: "proposal-1", revision: 1, scope, digest: "a".repeat(64) };
    socket.write(JSON.stringify(request) + "\n");
    socket.write(JSON.stringify(consume) + "\n");
    await received;
    expect(delivered).toEqual([request, consume]);
    expect(server.registry.has(connectionId)).toBe(true);
  });

  it("closes oversized and invalid peers and removes disconnected peers", async () => {
    const server = new PeerServer({ port: 0, maxLineBytes: 512 });
    servers.push(server);
    await server.ready;

    const oversized = await connect(server.port);
    const oversizedClosed = new Promise<void>((resolve) => oversized.once("close", () => resolve()));
    oversized.write("x".repeat(513));
    await oversizedClosed;

    const invalid = await connect(server.port);
    const invalidClosed = new Promise<void>((resolve) => invalid.once("close", () => resolve()));
    invalid.write('{"type":"analysis.request"}\n');
    await invalidClosed;

    const accepted = await connect(server.port);
    const connectionId = await handshake(accepted, "instance-c");
    expect(server.registry.has(connectionId)).toBe(true);
    accepted.destroy();
    await new Promise<void>((resolve) => accepted.once("close", () => resolve()));
    for (let i = 0; i < 20 && server.registry.has(connectionId); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(server.registry.has(connectionId)).toBe(false);
    expect(server.registry.sendTo(connectionId, phrase)).toBe(false);
  });

  it("closes a peer that does not handshake before the timeout", async () => {
    const server = new PeerServer({ port: 0, handshakeTimeoutMs: 20 });
    servers.push(server);
    await server.ready;
    const socket = await connect(server.port);
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
    expect(server.registry.size).toBe(0);
  });
});

describe("PeerConnection outbound refusal", () => {
  it("reports the rejected frame and schema close reason", () => {
    class InputSocket extends EventEmitter {
      destroyed = false;
      write = vi.fn(() => true);
      destroy(): void { this.destroyed = true; this.emit("close"); }
      setEncoding(): void {}
    }
    const socket = new InputSocket();
    const rejected = vi.fn();
    new PeerConnection("peer-reject", socket as unknown as net.Socket, {
      handshakeTimeoutMs: 1_000,
      maxLineBytes: 65_536,
      maxQueueMessages: 32,
      maxQueueBytes: 262_144,
      validateMessage: () => false,
      onProtocolError: rejected,
      onHello: () => {},
      onClose: () => {},
    });

    const frame = { type: "analysis.request", requestId: "analysis-1", scope: { projectId: "project-1", instanceId: "instance-1" } };
    socket.emit("data", JSON.stringify(frame) + "\n");
    expect(rejected).toHaveBeenCalledWith({ connectionId: "peer-reject", reason: "schema_rejected", frame });
    expect(socket.destroyed).toBe(true);
  });

  it("closes instead of dropping a command when its queue overflows", () => {
    class BlockedSocket extends EventEmitter {
      destroyed = false;
      write = vi.fn(() => false);
      destroy(): void { this.destroyed = true; this.emit("close"); }
      setEncoding(): void {}
    }
    const socket = new BlockedSocket();
    const connection = new PeerConnection("peer-1", socket as unknown as net.Socket, {
      handshakeTimeoutMs: 1_000,
      maxLineBytes: 65_536,
      maxQueueMessages: 1,
      maxQueueBytes: 262_144,
      onHello: () => {},
      onClose: () => {},
    });

    expect(connection.send(phrase)).toBe(true);
    expect(connection.send({ type: "phrase.disarm", phraseId: "phrase-1", reason: "stop" })).toBe(true);
    expect(connection.send({ type: "stop", projectId: "project-1", reason: "user" })).toBe(false);
    expect(socket.destroyed).toBe(true);
  });
});
