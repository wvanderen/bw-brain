// daemon/src/transport/uds.ts
//
// UnixDomainSocketServerTransport — the daemon's CLI-query listener (D-07).
//
// SECURITY INVARIANT (RESEARCH.md Pitfall 5 lines 821-826 / Pattern 3 lines
// 551-604; 02-PATTERNS.md Assignment 4 lines 151-223): the socket file is
// created with mode 0o600 ONLY. chmod(socketPath, 0o600) runs IMMEDIATELY after
// listen(). The mode is NEVER omitted (net.createServer().listen(path) defaults
// to a permissive mask — would expose the daemon to other local users on the
// box). The constructor additionally REFUSES to start if the chmod fails: the
// `ready` promise rejects AND the server is closed, so a permission-widened
// socket can never accept connections. This is the UDS equivalent of
// TcpServerTransport's loopback-only guard — the loopback invariant replicates
// as filesystem permissions (0600 = only the same user can connect), which is
// STRONGER than TCP-loopback (any local process can hit a TCP port).
//
// Atomic-line writes (RESEARCH.md Pattern 4 / Shared Pattern C): `send` issues
// exactly ONE socket.write call of `JSON.stringify(msg) + "\n"` per connected
// socket. JSON.stringify escapes embedded newlines, so one write = one complete
// JSON value per line.
//
// This transport is a byte mover only — it does not parse JSON. The
// query-server (query-server.ts) wires onMessage + does the parse/validate.
//
// NOTE on the async constructor: TS constructors cannot be `async`. The
// listen+chmod sequence is exposed via the `ready` promise; callers MUST await
// `transport.ready` before relying on the socket (the test suite does so, and
// the daemon's boot sequence will too). A chmod/listen failure rejects `ready`
// AND closes the server — the "refuses to start" semantics, deferred to the
// first await.

import * as net from "node:net";
import { chmod, unlink } from "node:fs/promises";
import type { Transport } from "./transport.js";

/** The ONLY acceptable socket file mode. Same-user connect only (Pitfall 5). */
const SOCKET_MODE = 0o600;

export interface UdsServerTransportOptions {
  /** Filesystem path for the unix domain socket (e.g. ~/.bw-brain/daemon.sock). */
  socketPath: string;
}

/** Resolve once the server's close callback fires (best-effort). */
function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * localhost-only unix domain socket server transport for the D-07 CLI-query
 * channel. Listens at `socketPath`, chmods the socket file to 0o600 immediately
 * after listen, accepts connections, and feeds each received chunk to the
 * registered onMessage handler. `send` fans the atomic-line write out to every
 * connected client. `close` destroys sockets + unlinks the socket file (cleanup
 * on daemon exit — RESEARCH.md Pattern 3 "Path must be stable + cleaned on
 * daemon exit").
 *
 * Implements {@link Transport} — the SAME interface the bridge TCP transport
 * implements, so the framing/reader plumbing is reusable (D-05 spine).
 */
export class UnixDomainSocketServerTransport implements Transport {
  private readonly socketPath: string;
  private readonly server: net.Server;
  private readonly sockets = new Set<net.Socket>();
  private handler: (chunk: unknown) => void = () => {};

  /**
   * Resolves once listen + chmod have both succeeded. Rejects (and closes the
   * server) if either fails — the "constructor refuses to start" semantics.
   * Callers MUST await this before relying on the socket.
   */
  readonly ready: Promise<void>;

  constructor(opts: UdsServerTransportOptions) {
    this.socketPath = opts.socketPath;

    this.server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.setEncoding("utf8");
      socket.on("data", (chunk: Buffer | string) => this.handler(chunk));
      const cleanup = (): void => {
        this.sockets.delete(socket);
      };
      // Per-socket errors are cleaned up, not crashed (a peer resetting its
      // connection must not take the daemon down). Server-level + listen/chmod
      // errors reject `ready`.
      socket.on("error", cleanup);
      socket.on("close", cleanup);
    });

    // ready: listen -> (on listening) chmod 0o600 -> resolve. Any failure along
    // the path closes the server + rejects, so a half-open socket never serves.
    this.ready = new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = async (err: unknown): Promise<void> => {
        if (settled) return;
        settled = true;
        await closeServer(this.server).catch(() => {});
        reject(err);
      };
      this.server.once("listening", () => {
        chmod(this.socketPath, SOCKET_MODE).then(resolve, (err: unknown) => {
          void fail(err);
        });
      });
      this.server.once("error", (err) => {
        void fail(err);
      });
      // Kick off listen. SECURITY: the host argument is N/A for UDS — the
      // filesystem permission (0o600) IS the auth boundary.
      this.server.listen(this.socketPath);
    });
  }

  onMessage(handler: (chunk: unknown) => void): void {
    this.handler = handler;
  }

  send(msg: object): void {
    if (this.sockets.size === 0) {
      // No connected peer to ack a query — unrecoverable, surface it.
      throw new Error("UnixDomainSocketServerTransport.send: no connected client");
    }
    // Pattern 4: one JSON.stringify + one newline + one write per socket.
    const line = JSON.stringify(msg) + "\n";
    for (const socket of this.sockets) {
      socket.write(line);
    }
  }

  /**
   * Tear down: destroy every connected socket, close the server, and unlink the
   * socket file (cleanup on daemon exit — Pattern 3). The unlink is
   * best-effort: if the file is already gone (e.g. a prior close), the
   * rejection is swallowed. Returns a Promise so callers can await cleanup; the
   * Promise is assignable to the Transport interface's `close(): void`.
   */
  async close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    await closeServer(this.server).catch(() => {});
    await unlink(this.socketPath).catch(() => {});
  }
}
