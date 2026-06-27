// daemon/src/transport/uds.test.ts
//
// D-07 Unix domain socket server transport (RESEARCH.md Pattern 3 lines
// 551-604; 02-PATTERNS.md Assignment 4 lines 151-223). The Pitfall-5 UDS-form
// gate: the socket file MUST be mode 0600 after listen (only the same user
// can connect — this is the UDS equivalent of the TCP loopback-only invariant).
// Also verifies: a client can connect + receive an atomic-line write, and
// close() unlinks the socket file (cleanup on daemon exit).

import { describe, it, expect, afterEach } from "vitest";
import * as net from "node:net";
import { statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { UnixDomainSocketServerTransport } from "./uds.js";

/** Unique socket path per test (parallel-safe, no collision). */
function uniqueSocketPath(): string {
  const suffix = randomBytes(6).toString("hex");
  return join(tmpdir(), `bw-brain-uds-test-${suffix}.sock`);
}

describe("UnixDomainSocketServerTransport (D-07 — Pitfall 5 UDS-form 0600 gate)", () => {
  let transport: UnixDomainSocketServerTransport | null = null;

  afterEach(async () => {
    if (transport) {
      try {
        await transport.close();
      } catch {
        // ignore — cleanup best-effort
      }
      transport = null;
    }
  });

  it("creates the socket file on listen()", async () => {
    const socketPath = uniqueSocketPath();
    transport = new UnixDomainSocketServerTransport({ socketPath });
    await transport.ready;
    expect(statSync(socketPath).isSocket()).toBe(true);
  });

  it("Pitfall 5: socket file mode is 0o600 after listen (same-user only)", async () => {
    const socketPath = uniqueSocketPath();
    transport = new UnixDomainSocketServerTransport({ socketPath });
    await transport.ready;
    const mode = statSync(socketPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("implements the Transport interface (onMessage/send/close)", async () => {
    const socketPath = uniqueSocketPath();
    transport = new UnixDomainSocketServerTransport({ socketPath });
    await transport.ready;
    expect(typeof transport.onMessage).toBe("function");
    expect(typeof transport.send).toBe("function");
    expect(typeof transport.close).toBe("function");
  });

  it("a connected client receives the atomic-line write (JSON.parse-able)", async () => {
    const socketPath = uniqueSocketPath();
    transport = new UnixDomainSocketServerTransport({ socketPath });
    await transport.ready;

    const received = await new Promise<string>((resolve) => {
      const client = net.createConnection({ path: socketPath });
      client.setEncoding("utf8");
      let buf = "";
      client.on("data", (chunk: string) => {
        buf += chunk;
        // Wait for one complete newline-terminated line.
        const nl = buf.indexOf("\n");
        if (nl !== -1) {
          client.end();
          resolve(buf.slice(0, nl));
        }
      });
      // Give the server a tick to register the connection, then send.
      setTimeout(() => {
        transport!.send({ hello: "world", n: 42 });
      }, 30);
    });

    const parsed = JSON.parse(received);
    expect(parsed.hello).toBe("world");
    expect(parsed.n).toBe(42);
  });

  it("onMessage feeds received chunks to the handler", async () => {
    const socketPath = uniqueSocketPath();
    transport = new UnixDomainSocketServerTransport({ socketPath });
    await transport.ready;

    const received = await new Promise<string>((resolve) => {
      transport!.onMessage((chunk) => {
        resolve(typeof chunk === "string" ? chunk : chunk.toString());
      });
      const client = net.createConnection({ path: socketPath });
      client.setEncoding("utf8");
      setTimeout(() => {
        client.write(JSON.stringify({ ping: 1 }) + "\n");
      }, 30);
    });

    const parsed = JSON.parse(received.trim());
    expect(parsed.ping).toBe(1);
  });

  it("close() unlinks the socket file (cleanup on daemon exit)", async () => {
    const socketPath = uniqueSocketPath();
    transport = new UnixDomainSocketServerTransport({ socketPath });
    await transport.ready;
    expect(statSync(socketPath).isSocket()).toBe(true);
    await transport.close();
    transport = null;
    expect(() => statSync(socketPath)).toThrow();
  });

  it("send() throws when no client is connected (surfaces unrecoverable write)", async () => {
    const socketPath = uniqueSocketPath();
    transport = new UnixDomainSocketServerTransport({ socketPath });
    await transport.ready;
    expect(() => transport!.send({ x: 1 })).toThrow(/no connected client/);
  });

  it("constructor refuses to start if chmod fails (bad socket path directory)", async () => {
    // A path inside a non-existent directory: listen+chmod cannot succeed.
    const badPath = "/nonexistent-bw-brain-dir/daemon.sock";
    transport = new UnixDomainSocketServerTransport({ socketPath: badPath });
    await expect(transport.ready).rejects.toThrow();
    transport = null;
  });
});
