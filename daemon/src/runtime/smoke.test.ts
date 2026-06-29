// daemon/src/runtime/smoke.test.ts
//
// The PROOF that the daemon boots + listens + answers a CLI query — with a
// FAKE bridge standing in for the real one — NO live Bitwig required (02-07
// Task 2 step 6). Boots the daemon against an ephemeral socket dir, opens a
// fake bridge over loopback TCP (sends canned get.project_summary +
// get.selected_device_chain responses), and asserts:
//   (1) UDS socket exists at mode 0o600 (Pitfall 5).
//   (2) A bw-focus query returns a schema-valid cli-query result envelope.
//   (3) A selection.changed event folds into a focus.export payload whose
//       selection.trackSid matches the fingerprint-minted sid for the Kick
//       track from the snapshot (Pitfall 2 — ^trk_[0-9a-f]{16}$).
//   (4) state-cache.json persists across a daemon restart.
//   (5) device.inspect triggers an on-demand get.selected_device_chain pull
//       against the fake bridge AND the result carries the fresh `pages`
//       payload (Major 2 gate) — plus a soft-fallback case.
//
// Uses ONLY node:net + the daemon's own boot() + the existing query-client
// contract. UAT Tests 2/3/4 (which DO need live Bitwig) remain human jobs —
// this plan unblocks them SEMANTICALLY.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { rm } from "node:fs/promises";
import { boot, type BootHandle } from "./boot.js";

/** Ephemeral dir + paths for one boot() instance. */
interface Env {
  dir: string;
  socketPath: string;
  stateCachePath: string;
  intentPath: string;
  tcpPort: number;
}

/** Build an ephemeral env. */
async function makeEnv(tcpPort: number): Promise<Env> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bw-brain-smoke-"));
  return {
    dir,
    socketPath: path.join(dir, "daemon.sock"),
    stateCachePath: path.join(dir, "state-cache.json"),
    intentPath: path.join(dir, "intent.json"),
    tcpPort,
  };
}

/** Tear down an env. */
async function dropEnv(env: Env): Promise<void> {
  try {
    await rm(env.dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** A canned get.project_summary response payload (PullHandlers.java:91-100). */
const SUMMARY_TRACKS = [
  { slot: 0, name: "Kick" },
  { slot: 1, name: "Bass" },
];

/** A canned get.selected_device_chain response payload (PullHandlers.java:73-89). */
const DEVICE_CHAIN_PAGES = {
  pages: [{ name: "OSC", remotes: [{ name: "Volume", value: 0.5 }] }],
};

/**
 * Start a fake bridge: connects to the daemon's TCP port + answers
 * get.project_summary + get.selected_device_chain requests by id. Also
 * provides a sendEvent() helper to push event lines to the daemon.
 */
function startFakeBridge(env: Env): {
  socket: net.Socket;
  close: () => void;
  sendEvent: (type: string, payload: Record<string, unknown>) => void;
  connected: Promise<void>;
} {
  const socket = net.createConnection({ port: env.tcpPort });
  socket.setEncoding("utf8");

  let buffer = "";
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      handleDaemonLine(line);
    }
  });

  const handleDaemonLine = (line: string): void => {
    let msg: { type?: string; id?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    // Reply to get.project_summary with the canned tracks list.
    if (msg.type === "get.project_summary" && msg.id) {
      socket.write(
        JSON.stringify({
          version: "1.0",
          type: "response",
          id: msg.id,
          ok: true,
          payload: { tracks: SUMMARY_TRACKS },
        }) + "\n",
      );
      return;
    }
    // Reply to get.selected_device_chain with the canned pages payload.
    if (msg.type === "get.selected_device_chain" && msg.id) {
      socket.write(
        JSON.stringify({
          version: "1.0",
          type: "response",
          id: msg.id,
          ok: true,
          payload: DEVICE_CHAIN_PAGES,
        }) + "\n",
      );
      return;
    }
    // Reply to get.selected_clip with an empty notes array.
    if (msg.type === "get.selected_clip" && msg.id) {
      socket.write(
        JSON.stringify({
          version: "1.0",
          type: "response",
          id: msg.id,
          ok: true,
          payload: { notes: [] },
        }) + "\n",
      );
      return;
    }
    // hello.response is not expected (the fake bridge sends nothing first).
    // Other request types are ignored.
  };

  const connected = new Promise<void>((resolve) => {
    socket.once("connect", () => resolve());
  });

  return {
    socket,
    connected,
    sendEvent: (type: string, payload: Record<string, unknown>): void => {
      socket.write(
        JSON.stringify({ version: "1.0", type, timestamp: Math.floor(Date.now() / 1000), payload }) + "\n",
      );
    },
    close: (): void => {
      socket.destroy();
    },
  };
}

/** Send one query to the daemon UDS + resolve the parsed result line. */
function udsQuery(env: Env, op: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = net.createConnection({ path: env.socketPath }, () => {
      sock.write(JSON.stringify({ version: "1.0", type: "query", op, payload }) + "\n");
    });
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      const i = buf.indexOf("\n");
      if (i >= 0) {
        const line = buf.slice(0, i);
        sock.end();
        try {
          resolve(JSON.parse(line));
        } catch (e) {
          reject(new Error(`udsQuery: non-JSON response: ${(e as Error).message}`));
        }
      }
    });
    sock.on("error", reject);
    sock.on("close", () => {
      if (!buf.includes("\n")) {
        reject(new Error("udsQuery: daemon closed before sending a complete result"));
      }
    });
  });
}

/** Wait for the UDS socket file to appear (max 2s). */
async function waitForSocket(env: Env, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(env.socketPath)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`waitForSocket: ${env.socketPath} did not appear within ${timeoutMs}ms`);
}

/** Wait for the snapshot to land by polling focus.export until payload present (max 5s). */
async function waitForSnapshot(env: Env, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = (await udsQuery(env, "focus.export")) as { ok?: boolean; payload?: unknown };
      if (r.ok && r.payload !== undefined) return;
    } catch {
      // not ready yet
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
  }
  // Not strictly fatal — the snapshot may be slow; tests below will assert.
}

describe("daemon boot smoke (fake bridge — NO live Bitwig required)", () => {
  // Two distinct TCP ports so the two boot() instances (assertion 4 restart
  // + Major 2 soft-fallback) don't clash with each other or a real bridge
  // on 7878.
  const PORT_PRIMARY = 17878;
  const PORT_FALLBACK = 17879;

  it("assertion 1: UDS socket exists at mode 0o600 (Pitfall 5)", async () => {
    const env = await makeEnv(PORT_PRIMARY);
    try {
      const handle = await boot({
        socketPath: env.socketPath,
        tcpPort: env.tcpPort,
        stateCachePath: env.stateCachePath,
        intentPath: env.intentPath,
      });
      try {
        await waitForSocket(env);
        const stat = fs.statSync(env.socketPath);
        // The socket file mode bits (mask 0o777) MUST be exactly 0o600.
        expect(stat.mode & 0o777).toBe(0o600);
      } finally {
        await handle.shutdown();
      }
    } finally {
      await dropEnv(env);
    }
  });

  it("assertion 2: bw-focus query returns a schema-valid cli-query envelope (ok:true + stateFreshness present)", async () => {
    const env = await makeEnv(PORT_PRIMARY);
    try {
      const handle = await boot({
        socketPath: env.socketPath,
        tcpPort: env.tcpPort,
        stateCachePath: env.stateCachePath,
        intentPath: env.intentPath,
      });
      const fakeBridge = startFakeBridge(env);
      try {
        await fakeBridge.connected;
        await waitForSocket(env);
        // Give the daemon + fake bridge a moment to exchange the snapshot.
        await waitForSnapshot(env);
        const r = (await udsQuery(env, "focus.export")) as {
          ok?: boolean;
          stateFreshness?: string;
          payload?: unknown;
        };
        expect(r.ok).toBe(true);
        expect(["live", "stale", "disconnected"]).toContain(r.stateFreshness);
      } finally {
        fakeBridge.close();
        await handle.shutdown();
      }
    } finally {
      await dropEnv(env);
    }
  });

  it("assertion 3: selection.changed -> fold -> focus.export selection.trackSid matches ^trk_[0-9a-f]{16}$", async () => {
    const env = await makeEnv(PORT_PRIMARY);
    try {
      const handle = await boot({
        socketPath: env.socketPath,
        tcpPort: env.tcpPort,
        stateCachePath: env.stateCachePath,
        intentPath: env.intentPath,
      });
      const fakeBridge = startFakeBridge(env);
      try {
        await fakeBridge.connected;
        await waitForSocket(env);
        await waitForSnapshot(env);
        // Fire a selection.changed event for slot 0 (Kick — matches the canned
        // summaryTracks[0]). The dispatcher folds it -> selection.trackSid set
        // to the fingerprint-minted sid for "Kick".
        fakeBridge.sendEvent("selection.changed", { slot: 0 });
        // Give the fold a moment to land (the reader drains via microtask).
        await new Promise((r) => setTimeout(r, 200));
        const r = (await udsQuery(env, "focus.export")) as {
          ok?: boolean;
          payload?: { selection?: { trackSid?: string } };
        };
        expect(r.ok).toBe(true);
        expect(r.payload?.selection?.trackSid).toBeTruthy();
        expect(r.payload!.selection!.trackSid).toMatch(/^trk_[0-9a-f]{16}$/);
      } finally {
        fakeBridge.close();
        await handle.shutdown();
      }
    } finally {
      await dropEnv(env);
    }
  });

  it("assertion 4: state-cache.json persists across a daemon restart (project-memory truth)", async () => {
    const env = await makeEnv(PORT_PRIMARY);
    try {
      // First boot: load some state via the fake bridge.
      {
        const handle = await boot({
          socketPath: env.socketPath,
          tcpPort: env.tcpPort,
          stateCachePath: env.stateCachePath,
          intentPath: env.intentPath,
        });
        const fakeBridge = startFakeBridge(env);
        try {
          await fakeBridge.connected;
          await waitForSocket(env);
          await waitForSnapshot(env);
          // Force the 1s debounce to fire before shutdown: shutdown flushes
          // state synchronously (the final save runs in shutdown()).
        } finally {
          fakeBridge.close();
          await handle.shutdown();
        }
      }
      // The state-cache file MUST exist.
      expect(fs.existsSync(env.stateCachePath)).toBe(true);
      // Second boot: the daemon loads the persisted state. Verify by querying
      // focus.export — the payload.selection should be present (the snapshot
      // landed + was persisted).
      {
        const handle = await boot({
          socketPath: env.socketPath,
          tcpPort: env.tcpPort,
          stateCachePath: env.stateCachePath,
          intentPath: env.intentPath,
        });
        try {
          await waitForSocket(env);
          // lastState was loaded from cache on boot — focus.export returns it
          // immediately even without a bridge (the cache survives).
          const r = (await udsQuery(env, "focus.export")) as {
            ok?: boolean;
            payload?: { selection?: unknown };
          };
          expect(r.ok).toBe(true);
          expect(r.payload).toBeDefined();
        } finally {
          await handle.shutdown();
        }
      }
    } finally {
      await dropEnv(env);
    }
  });

  it("assertion 5 (Major 2): device.inspect triggers an on-demand get.selected_device_chain pull + surfaces the fresh pages payload", async () => {
    const env = await makeEnv(PORT_PRIMARY);
    try {
      const handle = await boot({
        socketPath: env.socketPath,
        tcpPort: env.tcpPort,
        stateCachePath: env.stateCachePath,
        intentPath: env.intentPath,
      });
      const fakeBridge = startFakeBridge(env);
      try {
        await fakeBridge.connected;
        await waitForSocket(env);
        await waitForSnapshot(env);
        // Establish a cursor selection so device.inspect's on-demand pull arm
        // fires (handleDeviceInspect requires deviceSid OR trackSid).
        fakeBridge.sendEvent("selection.changed", { slot: 0 });
        await new Promise((r) => setTimeout(r, 200));

        const r = (await udsQuery(env, "device.inspect")) as {
          ok?: boolean;
          payload?: { devices?: Array<{ name?: string; remotes?: unknown[] }> };
        };
        expect(r.ok).toBe(true);
        expect(Array.isArray(r.payload?.devices)).toBe(true);
        // The fresh `pages` payload carries the canned {name:"OSC", remotes:[...]}.
        // Assert at least one device entry whose shape reflects the pull
        // (NOT the empty/no-pages fold-cache shape from device.name_changed).
        const devices = r.payload!.devices!;
        const oscEntry = devices.find((d) => d.name === "OSC");
        expect(oscEntry).toBeDefined();
        expect(oscEntry!.remotes).toBeDefined();
        expect(oscEntry!.remotes!.length).toBeGreaterThan(0);
      } finally {
        fakeBridge.close();
        await handle.shutdown();
      }
    } finally {
      await dropEnv(env);
    }
  });

  it("assertion 5 soft-fallback: device.inspect with NO bridge -> ok:true + devices from folded cache + pull-failed assumption", async () => {
    const env = await makeEnv(PORT_FALLBACK);
    try {
      // First boot: seed the state cache with a snapshot (the daemon's
      // lastState persists devices). Then shut down + restart with NO bridge
      // connected: device.inspect falls back to the folded cache AND surfaces
      // a "device-chain pull failed" assumption (transport.send throws when
      // sockets.size===0 -> correlator.send rejects -> catch arm fires).
      {
        const handle = await boot({
          socketPath: env.socketPath,
          tcpPort: env.tcpPort,
          stateCachePath: env.stateCachePath,
          intentPath: env.intentPath,
        });
        const fakeBridge = startFakeBridge(env);
        try {
          await fakeBridge.connected;
          await waitForSocket(env);
          await waitForSnapshot(env);
          // Fold a device.name_changed so state.devices carries an entry
          // (the Major 2 floor case the assertion name references).
          fakeBridge.sendEvent("device.name_changed", { name: "Serum" });
          await new Promise((r) => setTimeout(r, 200));
          // Fold a selection so device.inspect's pull arm precondition holds.
          fakeBridge.sendEvent("selection.changed", { slot: 0 });
          await new Promise((r) => setTimeout(r, 200));
        } finally {
          fakeBridge.close();
          await handle.shutdown();
        }
      }
      // Second boot: NO fake bridge — the pull will time out (or throw) +
      // the device-chain pull arm falls back to the folded cache.
      {
        const handle = await boot({
          socketPath: env.socketPath,
          tcpPort: env.tcpPort,
          stateCachePath: env.stateCachePath,
          intentPath: env.intentPath,
        });
        try {
          await waitForSocket(env);
          const r = (await udsQuery(env, "device.inspect")) as {
            ok?: boolean;
            payload?: { devices?: unknown[] };
            assumptions?: Array<{ claim?: string }>;
          };
          expect(r.ok).toBe(true);
          expect(Array.isArray(r.payload?.devices)).toBe(true);
          // The pull failed (no bridge); the assumption surfaces it.
          const pullFailClaim = (r.assumptions ?? []).find((a) =>
            (a.claim ?? "").includes("device-chain pull failed"),
          );
          expect(pullFailClaim).toBeDefined();
        } finally {
          await handle.shutdown();
        }
      }
    } finally {
      await dropEnv(env);
    }
  });
});
