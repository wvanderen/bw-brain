// daemon/src/runtime/boot.test.ts
//
// Phase 5 Plan 05-03 Task 1 (TDD RED) — boot-time get.project_meta pull
// (D-05-16 — closes the M1 tempo=120 LIMITATION from 02-07).
//
// Covers (plan behavior list):
//   - foldProjectMeta purity: valid {tempo, timeSignature} folded; malformed
//     values rejected (never fabricated); name preserved from the current
//     project block.
//   - Integration (fake-bridge smoke pattern — NO live Bitwig): when the
//     bridge answers get.project_meta with tempo 137.0 / "7/4", the
//     boot/reconnect snapshot path leaves state.project.tempo === 137.0 and
//     timeSignature === "7/4" (observed via the project.summary query op).
//   - Integration: when the bridge NEVER answers get.project_meta, the
//     project state keeps the DEFAULT_PROJECT fallback (tempo 120, "4/4") —
//     before AND after the correlator timeout: a failed meta pull never
//     blocks boot and never fabricates live values.

import { describe, expect, it } from "vitest";
import * as net from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { rm } from "node:fs/promises";
import { boot, foldProjectMeta } from "./boot.js";

// --- foldProjectMeta unit tests (pure) -------------------------------------

describe("foldProjectMeta (D-05-16 pure fold helper)", () => {
  const current = { name: "", tempo: 120, timeSignature: "4/4" };

  it("folds a valid tempo + timeSignature from the bridge response", () => {
    expect(foldProjectMeta(current, { tempo: 137, timeSignature: "7/4" })).toEqual({
      name: "",
      tempo: 137,
      timeSignature: "7/4",
    });
  });

  it("folds tempo only when timeSignature is absent/malformed (additive, never destructive)", () => {
    expect(foldProjectMeta(current, { tempo: 90 })).toEqual({ name: "", tempo: 90, timeSignature: "4/4" });
    expect(foldProjectMeta(current, { tempo: 90, timeSignature: "not-a-signature" })).toEqual({
      name: "",
      tempo: 90,
      timeSignature: "4/4",
    });
  });

  it("rejects malformed tempo (non-finite, non-positive, wrong type) and keeps the default", () => {
    for (const bad of [Number.NaN, 0, -10, "fast" as unknown, null as unknown, undefined]) {
      expect(foldProjectMeta(current, { tempo: bad, timeSignature: "3/4" })).toEqual({
        name: "",
        tempo: 120,
        timeSignature: "3/4",
      });
    }
  });

  it("returns the current block unchanged on a garbage response", () => {
    expect(foldProjectMeta(current, null)).toBe(current);
    expect(foldProjectMeta(current, "nope")).toBe(current);
    expect(foldProjectMeta(current, {})).toBe(current);
  });

  it("preserves extra project fields (keySignature) while folding", () => {
    const withKey = { ...current, keySignature: "A minor" };
    expect(foldProjectMeta(withKey, { tempo: 100, timeSignature: "6/8" })).toEqual({
      name: "",
      tempo: 100,
      timeSignature: "6/8",
      keySignature: "A minor",
    });
  });
});

// --- fake-bridge integration (smoke.test.ts pattern) ------------------------

/** Ephemeral dir + paths for one boot() instance. */
interface Env {
  dir: string;
  socketPath: string;
  stateCachePath: string;
  intentPath: string;
  tcpPort: number;
}

async function makeEnv(tcpPort: number): Promise<Env> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bw-brain-meta-"));
  return {
    dir,
    socketPath: path.join(dir, "daemon.sock"),
    stateCachePath: path.join(dir, "state-cache.json"),
    intentPath: path.join(dir, "intent.json"),
    tcpPort,
  };
}

async function dropEnv(env: Env): Promise<void> {
  try {
    await rm(env.dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/**
 * Minimal fake bridge: answers every request type the boot connect path
 * pulls EXCEPT get.project_meta (opts.answerMeta controls that one) — so
 * refreshSnapshot completes fast and the meta fold is the variable under
 * test. Mirrors the smoke.test.ts startFakeBridge shape (canned responses
 * keyed by request type + id echo).
 */
function startFakeBridge(env: Env, opts: { meta?: { tempo: number; timeSignature: string } } = {}): {
  socket: net.Socket;
  close: () => void;
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
      let msg: { type?: string; id?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (!msg.id) continue;
      const reply = (payload: Record<string, unknown>): void => {
        socket.write(JSON.stringify({ version: "1.0", type: "response", id: msg.id, ok: true, payload }) + "\n");
      };
      switch (msg.type) {
        case "get.project_summary":
          reply({ tracks: [{ slot: 0, name: "Kick" }] });
          break;
        case "get.selected_clip":
          reply({ notes: [], clipSid: "clip_0000000000000000" });
          break;
        case "get.launcher_clips":
          reply({ tracks: [], sceneNames: [] });
          break;
        case "get.project_meta":
          // Answered ONLY when the test supplies a meta payload; otherwise the
          // request hangs until the daemon's correlator timeout (the
          // failed-meta-pull path under test).
          if (opts.meta) reply({ name: "", ...opts.meta });
          break;
        default:
          break;
      }
    }
  });
  const connected = new Promise<void>((resolve) => {
    socket.once("connect", () => resolve());
  });
  return { socket, close: (): void => socket.destroy(), connected };
}

/** Send one query to the daemon UDS + resolve the parsed result line. */
function udsQuery(env: Env, op: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = net.createConnection({ path: env.socketPath }, () => {
      sock.write(JSON.stringify({ version: "1.0", type: "query", op, payload: {} }) + "\n");
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

/** Poll project.summary until its payload appears (the snapshot landed). */
async function waitForProjectSummary(env: Env, timeoutMs = 5_000): Promise<Record<string, unknown>> {
  const start = Date.now();
  let last: Record<string, unknown> = {};
  while (Date.now() - start < timeoutMs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      last = (await udsQuery(env, "project.summary")) as Record<string, unknown>;
      if (last.ok === true && last.payload !== undefined) return last;
    } catch {
      // not ready yet
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`project.summary payload did not appear within ${timeoutMs}ms (last: ${JSON.stringify(last)})`);
}

describe("boot get.project_meta pull (D-05-16, fake bridge — NO live Bitwig)", () => {
  // Distinct from the smoke-test ports (17878/17879) so parallel vitest
  // workers never collide.
  const PORT_META = 17890;
  const PORT_NO_META = 17891;

  it(
    "bridge answering meta 137.0/7/4 → state.project carries 137.0 + 7/4 (Test 3)",
    async () => {
      const env = await makeEnv(PORT_META);
      try {
        const handle = await boot({
          socketPath: env.socketPath,
          tcpPort: env.tcpPort,
          peerPort: 0,
          stateCachePath: env.stateCachePath,
          intentPath: env.intentPath,
        });
        const fakeBridge = startFakeBridge(env, { meta: { tempo: 137.0, timeSignature: "7/4" } });
        try {
          await fakeBridge.connected;
          const r = (await waitForProjectSummary(env)) as {
            payload?: { tempo?: number; timeSignature?: string };
          };
          expect(r.payload?.tempo).toBe(137.0);
          expect(r.payload?.timeSignature).toBe("7/4");
        } finally {
          fakeBridge.close();
          await handle.shutdown();
        }
      } finally {
        await dropEnv(env);
      }
    },
    { timeout: 15_000 },
  );

  it(
    "bridge never answering meta → DEFAULT_PROJECT retained (120, 4/4), boot never blocked, never fabricated (Test 4)",
    async () => {
      const env = await makeEnv(PORT_NO_META);
      try {
        const handle = await boot({
          socketPath: env.socketPath,
          tcpPort: env.tcpPort,
          peerPort: 0,
          stateCachePath: env.stateCachePath,
          intentPath: env.intentPath,
        });
        // No meta payload: the fake bridge answers everything EXCEPT
        // get.project_meta, which hangs until the correlator timeout.
        const fakeBridge = startFakeBridge(env);
        try {
          await fakeBridge.connected;
          // The summary snapshot lands (state.project = DEFAULT_PROJECT);
          // the meta pull is still hanging at this point — the fallback must
          // already be visible and honest.
          const before = (await waitForProjectSummary(env)) as {
            payload?: { tempo?: number; timeSignature?: string };
          };
          expect(before.payload?.tempo).toBe(120);
          expect(before.payload?.timeSignature).toBe("4/4");
          // Let the 3s correlator timeout lapse + the catch path run; the
          // fallback must survive the failed pull (never fabricated).
          await new Promise((r) => setTimeout(r, 4_000));
          const after = (await udsQuery(env, "project.summary")) as {
            ok?: boolean;
            payload?: { tempo?: number; timeSignature?: string };
          };
          expect(after.ok).toBe(true, "a failed meta pull never blocks boot");
          expect(after.payload?.tempo).toBe(120);
          expect(after.payload?.timeSignature).toBe("4/4");
        } finally {
          fakeBridge.close();
          await handle.shutdown();
        }
      } finally {
        await dropEnv(env);
      }
    },
    { timeout: 20_000 },
  );
});
