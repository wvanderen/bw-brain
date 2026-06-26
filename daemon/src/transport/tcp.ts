// daemon/src/transport/tcp.ts
//
// TcpServerTransport — the daemon's localhost-only TCP listener (D-05).
//
// SECURITY INVARIANT (RESEARCH.md Pitfall 5, lines 419–422 — the single
// security-relevant decision in the spike): the server binds the LOOPBACK
// address ONLY. The `listen` call ALWAYS passes the loopback literal as the
// host argument. The host argument is NEVER omitted (Node's net.Server.listen
// defaults to the all-interfaces wildcard when host is omitted, which would
// expose the daemon to the LAN and break the local-first trust model). The
// all-interfaces wildcard (four zero octets) is NEVER used. The constructor
// additionally REFUSES any non-loopback host passed by a caller, so the bind
// cannot be widened by accident from a future call site.
//
// Atomic-line writes (RESEARCH.md Pattern 4): `send` issues exactly ONE
// socket.write call of `JSON.stringify(msg) + "\n"` per message. JSON.stringify
// escapes embedded newlines, so one write = one complete JSON value per line.
//
// The transport is a byte mover only — it does not parse JSON. The reader does.

import * as net from "node:net";
import type { Transport } from "./transport.js";

/** The loopback address. The only host this transport will ever bind. */
const LOOPBACK_HOST = "127.0.0.1";

export interface TcpServerTransportOptions {
  /** TCP port to listen on. */
  port: number;
  /**
   * Bind address. Defaults to the loopback literal and MUST be loopback. Any
   * other value is refused at construction (defense in depth — Pitfall 5).
   */
  host?: string;
}

/**
 * localhost-only TCP server transport. Listens on 127.0.0.1, accepts
 * connections, and feeds each received chunk to the registered onMessage
 * handler. `send` fans the atomic-line write out to every connected client
 * (trivial fan-out at this scale — AGENTS.md line 145).
 */
export class TcpServerTransport implements Transport {
  private readonly host: string;
  private readonly port: number;
  private readonly server: net.Server;
  private readonly sockets = new Set<net.Socket>();
  private handler: (chunk: unknown) => void = () => {};

  constructor(opts: TcpServerTransportOptions) {
    const host = opts.host ?? LOOPBACK_HOST;
    // Pitfall 5 hard guard: refuse anything but loopback, even if a caller
    // explicitly passes a wider address. Keeps the invariant impossible to
    // violate from a future call site.
    if (host !== LOOPBACK_HOST) {
      throw new Error(
        `TcpServerTransport refuses non-loopback bind (got ${host}); only ${LOOPBACK_HOST} is permitted.`,
      );
    }
    this.host = host;
    this.port = opts.port;

    this.server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.setEncoding("utf8");
      socket.on("data", (chunk: Buffer | string) => this.handler(chunk));
      const cleanup = (): void => {
        this.sockets.delete(socket);
      };
      // Per-socket errors are cleaned up, not crashed (a peer resetting its
      // connection must not take the daemon down). Server-level errors throw.
      socket.on("error", cleanup);
      socket.on("close", cleanup);
    });
    this.server.on("error", (err) => {
      throw err;
    });

    // SECURITY: listen binds host = the loopback literal. The host arg is
    // ALWAYS passed and ALWAYS loopback — never omitted, never the wildcard.
    this.server.listen(this.port, this.host);
  }

  onMessage(handler: (chunk: unknown) => void): void {
    this.handler = handler;
  }

  send(msg: object): void {
    if (this.sockets.size === 0) {
      // No connected peer to ack an edit/request — unrecoverable, surface it.
      throw new Error("TcpServerTransport.send: no connected client");
    }
    // Pattern 4: one JSON.stringify + one newline + one write per socket.
    const line = JSON.stringify(msg) + "\n";
    for (const socket of this.sockets) {
      socket.write(line);
    }
  }

  close(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    this.server.close();
  }
}
