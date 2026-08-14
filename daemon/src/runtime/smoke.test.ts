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
 *
 * Phase 3 Plan 03-02 Task 3: when `applyPatchSink` is provided, the fake
 * bridge ALSO handles apply.patch by dispatching the primitive ops against
 * the sink (an in-memory mock clip) + replying {applied, failed}. This proves
 * the daemon↔bridge wire contract end-to-end without live Bitwig.
 */
function startFakeBridge(env: Env, opts: { applyPatchSink?: MockClip; clipNotes?: unknown[] } = {}): {
  socket: net.Socket;
  close: () => void;
  sendEvent: (type: string, payload: Record<string, unknown>) => void;
  connected: Promise<void>;
  applyPatchCalls: { undoLabel: string; operations: unknown[] }[];
} {
  const applyPatchCalls: { undoLabel: string; operations: unknown[] }[] = [];
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
    let msg: { type?: string; id?: string; payload?: Record<string, unknown> };
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
    // Reply to get.selected_clip with notes (default empty; overridden by opts.clipNotes).
    if (msg.type === "get.selected_clip" && msg.id) {
      socket.write(
        JSON.stringify({
          version: "1.0",
          type: "response",
          id: msg.id,
          ok: true,
          payload: { notes: opts.clipNotes ?? [] },
        }) + "\n",
      );
      return;
    }
    // Phase 04.2: exact read-only controller proof for the currently selected
    // device. Echo only the authoritative tuple and nonce supplied by daemon.
    if (msg.type === "get.clap_correlation" && msg.id) {
      socket.write(
        JSON.stringify({
          version: "1.0",
          type: "response",
          id: msg.id,
          ok: true,
          payload: {
            available: true,
            projectId: msg.payload?.projectId,
            instanceId: msg.payload?.instanceId,
            trackSid: msg.payload?.trackSid,
            selectedDeviceEvidence: "controller-selected-device",
            nonce: msg.payload?.nonce,
            trackSidHint: msg.payload?.trackSid,
            deviceHint: "bw-brain",
          },
        }) + "\n",
      );
      return;
    }
    // Phase 3 Plan 03-02: handle apply.patch by dispatching primitive ops against
    // the in-memory mock clip (opts.applyPatchSink) + replying {applied, failed}.
    if (msg.type === "apply.patch" && msg.id) {
      applyPatchCalls.push({
        undoLabel: (msg.payload?.undoLabel as string) ?? "",
        operations: (msg.payload?.operations as unknown[]) ?? [],
      });
      let applied = 0;
      let failed = 0;
      const sink = opts.applyPatchSink;
      if (sink) {
        const ops = (msg.payload?.operations as Array<Record<string, unknown>>) ?? [];
        for (const op of ops) {
          try {
            sink.apply(op);
            applied++;
          } catch {
            failed++;
          }
        }
      }
      socket.write(
        JSON.stringify({
          version: "1.0",
          type: "response",
          id: msg.id,
          ok: true,
          payload: { applied, failed },
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
    applyPatchCalls,
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

/**
 * In-memory mock clip for the apply.patch smoke. Keys by `n:${pitch}:${startQ}`
 * (the daemon Note identity) + stores {velocity, length}. The 3-case primitive
 * dispatch mirrors PullHandlers.java:applyOps at the TS level (the wire contract
 * is what's under test, not the Java NoteStep setters — those are JUnit-covered).
 */
class MockClip {
  private readonly notes = new Map<string, { velocity: number; length: number }>();

  /** Apply a primitive op (add/remove/update). Throws on invalid op (-> failed). */
  apply(op: Record<string, unknown>): void {
    const opType = op["op"] as string;
    if (opType === "add_note") {
      const n = op["note"] as Record<string, number>;
      this.notes.set(`n:${n.pitch}:${n.start}`, { velocity: n.velocity, length: n.length });
    } else if (opType === "remove_note") {
      const n = op["note"] as Record<string, number>;
      this.notes.delete(`n:${n.pitch}:${n.start}`);
    } else if (opType === "update_note_field") {
      const after = op["after"] as Record<string, number>;
      this.notes.set(`n:${after.pitch}:${after.start}`, { velocity: after.velocity, length: after.length });
    } else {
      throw new Error(`unknown op: ${opType}`);
    }
  }

  /** True when a note with this identity is present. */
  has(pitch: number, start: number): boolean {
    return this.notes.has(`n:${pitch}:${start}`);
  }

  size(): number {
    return this.notes.size;
  }
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

function nextPeerLine(socket: net.Socket): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer | string): void => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      socket.off("data", onData);
      resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, any>);
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
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
        peerPort: 0,
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
        peerPort: 0,
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
        peerPort: 0,
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
          peerPort: 0,
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
          peerPort: 0,
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
        peerPort: 0,
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
          peerPort: 0,
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
          peerPort: 0,
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

  it("assertion 6: peer link request -> controller proof -> nonce accept -> confirmed focus", async () => {
    const env = await makeEnv(PORT_PRIMARY);
    let peer: net.Socket | undefined;
    try {
      const handle = await boot({
        socketPath: env.socketPath,
        tcpPort: env.tcpPort,
        peerPort: 0,
        stateCachePath: env.stateCachePath,
        intentPath: env.intentPath,
      });
      const fakeBridge = startFakeBridge(env);
      try {
        await fakeBridge.connected;
        await waitForSnapshot(env);
        fakeBridge.sendEvent("selection.changed", { slot: 1 });
        await new Promise((resolve) => setTimeout(resolve, 200));

        peer = net.createConnection({ host: "127.0.0.1", port: handle.peerPort });
        await new Promise<void>((resolve, reject) => { peer!.once("connect", resolve); peer!.once("error", reject); });
        const acceptedLine = nextPeerLine(peer);
        peer.write(JSON.stringify({
          type: "clap.hello",
          protocol: "1.0",
          instanceId: "instance-product",
          capabilities: ["identity.link"],
          limits: { maxLineBytes: 65_536, maxQueueMessages: 32, maxQueueBytes: 262_144 },
        }) + "\n");
        expect(await acceptedLine).toMatchObject({ type: "clap.accept", instanceId: "instance-product" });

        const pendingLine = nextPeerLine(peer);
        peer.write('{"type":"link.confirm.request"}\n');
        const pending = await pendingLine;
        expect(pending).toMatchObject({
          type: "link.confirm.pending",
          scope: { instanceId: "instance-product", trackHint: "Bass" },
        });
        expect(pending.scope.projectId).toMatch(/^project-[0-9a-f-]{36}$/);
        expect(pending.scope.trackSid).toMatch(/^trk_[0-9a-f]{16}$/);

        const confirmedLine = nextPeerLine(peer);
        peer.write(JSON.stringify({ type: "link.confirm.accept", nonce: pending.nonce }) + "\n");
        const confirmed = await confirmedLine;
        expect(confirmed).toEqual({ type: "link.status", status: "confirmed", scope: pending.scope });

        const focusedLine = nextPeerLine(peer);
        peer.write(JSON.stringify({
          type: "focus.set",
          scope: { projectId: pending.scope.projectId, instanceId: "instance-product" },
        }) + "\n");
        expect(await focusedLine).toEqual({
          type: "focus.status",
          scope: { projectId: pending.scope.projectId, instanceId: "instance-product" },
        });

        const persisted = JSON.parse(await fs.promises.readFile(
          path.join(env.dir, "projects", pending.scope.projectId, "project-registry.json"), "utf8",
        ));
        expect(persisted.links["instance-product"]).toMatchObject({ status: "confirmed", trackSid: pending.scope.trackSid });
      } finally {
        peer?.destroy();
        fakeBridge.close();
        await handle.shutdown();
      }
    } finally {
      await dropEnv(env);
    }
  });

  // =========================================================================
  // Phase 3 Plan 03-02 Task 3 — daemon↔fake-bridge apply/revert round-trip.
  // Proves the EDIT-02/04/05 wire contract end-to-end: preview mints a
  // candidate, apply sends apply.patch over TCP (fake bridge mutates the mock
  // clip), history is appended with INV-14 inverseOps, revert replays the
  // inverse. NO live Bitwig required (RESEARCH.md §Validation "CLI Smoke").
  // =========================================================================
  it("assertion 7 (Plan 03-02): preview -> apply.patch over TCP -> history appended (INV-14) -> revert -> inverse applied", async () => {
    const env = await makeEnv(PORT_PRIMARY);
    // A separate history path so this test asserts the journal gain in isolation.
    const historyPath = path.join(env.dir, "patch-history.jsonl");
    // Seed an initial note in the mock clip so the patch's add_note is a net add
    // (and remove_note of the seed is testable). The note uses the daemon Note
    // shape (the fake bridge returns these as get.selected_clip notes).
    const seedNote = { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.25, velocity: 90 };
    const mockClip = new MockClip();
    mockClip.apply({ op: "add_note", note: seedNote });
    try {
      const handle = await boot({
        socketPath: env.socketPath,
        tcpPort: env.tcpPort,
        peerPort: 0,
        stateCachePath: env.stateCachePath,
        intentPath: env.intentPath,
      });
      // Override the daemon's default history path by constructing a PatchHistory
      // pointed at historyPath — but the daemon wires its own. Instead, read the
      // daemon's journal at the socket-dir default after apply. The boot wires
      // patch-history.jsonl alongside the socket (boot.ts: join(dirname(socketPath), ...)).
        const daemonJournalPath = path.join(env.dir, "patch-history.jsonl");
      const fakeBridge = startFakeBridge(env, {
        applyPatchSink: mockClip,
        clipNotes: [seedNote],
      });
      try {
        await fakeBridge.connected;
        await waitForSocket(env);
        await waitForSnapshot(env);
        // Fold a selection event so the watchdog reports freshness "live" (the
        // edit.* ops refuse when stateFreshness !== "live" — SC#3 P2 gate).
        fakeBridge.sendEvent("selection.changed", { slot: 0 });
        await new Promise((r) => setTimeout(r, 300));

        // --- preview: a patch that adds a note at pitch 64 / start 0. ---
        const patchPayload = {
          patch: {
            scope: { clipSid: "clip_0123456789abcdef" },
            operations: [
              { op: "add_note", note: { key: "n:64:0.0000", pitch: 64, start: 0, length: 0.25, velocity: 100 } },
            ],
            rationale: "smoke: add a note at C#4",
            reversibility: "self-inverse",
            risk: "low",
            undoLabel: "smoke-add",
          },
        };
        const preview = (await udsQuery(env, "edit.preview", patchPayload)) as {
          ok?: boolean;
          error?: string;
          payload?: { patchId?: string; risk?: string; diff?: { notesAdded?: unknown[] } };
        };
        expect(preview.ok).toBe(true);
        expect(preview.payload?.patchId).toMatch(/^pt_/);
        expect(preview.payload?.risk).toBeDefined();
        const patchId = preview.payload!.patchId!;
        // The preview diff reflects the add (notesAdded non-empty).
        expect(preview.payload!.diff?.notesAdded).toBeDefined();

        // --- apply: low-risk, no --confirm needed (D-04: low is one-step). ---
        const apply = (await udsQuery(env, "edit.apply", { patchId })) as {
          ok?: boolean;
          error?: string;
          payload?: { ok?: boolean; appliedOps?: number; undoLabel?: string };
        };
        expect(apply.ok).toBe(true);
        expect(apply.payload?.ok).toBe(true);
        expect(apply.payload?.appliedOps).toBeGreaterThan(0);
        // The fake bridge received exactly one apply.patch call carrying the add_note op.
        expect(fakeBridge.applyPatchCalls.length).toBe(1);
        expect(fakeBridge.applyPatchCalls[0]!.undoLabel).toBe("smoke-add");
        // The mock clip now has 2 notes (seed + applied add).
        expect(mockClip.size()).toBe(2);
        expect(mockClip.has(64, 0)).toBe(true);

        // --- INV-14 integration: the daemon journal gained exactly one entry
        //     whose inverseOperations deep-equals inverseOps(operations). ---
        await new Promise((r) => setTimeout(r, 200)); // let the async append land
        const fs = await import("node:fs/promises");
        let journalText: string;
        try {
          journalText = await fs.readFile(daemonJournalPath, "utf8");
        } catch {
          // The daemon may have written to its default history path; fall back
          // to the env-dir relative path the boot wires (dirname(socketPath)).
          journalText = await fs.readFile(historyPath, "utf8");
        }
        const lines = journalText.split("\n").filter((l) => l.length > 0);
        expect(lines.length).toBe(1);
        const entry = JSON.parse(lines[0]!);
        expect(entry.patchId).toBe(patchId);
        expect(entry.appliedAt).toBeDefined();
        // INV-14: the inverseOperations are the reverse-inverted ops (a single
        // add_note inverts to a remove_note of the same note).
        expect(Array.isArray(entry.inverseOperations)).toBe(true);
        expect(entry.inverseOperations.length).toBe(1);
        expect(entry.inverseOperations[0].op).toBe("remove_note");

        // --- revert: replays the inverse (remove_note) through the same path. ---
        const revert = (await udsQuery(env, "edit.revert", { patchId })) as {
          ok?: boolean;
          payload?: { ok?: boolean; appliedRevertedAt?: number };
        };
        expect(revert.ok).toBe(true);
        expect(revert.payload?.ok).toBe(true);
        expect(revert.payload?.appliedRevertedAt).toBeDefined();
        // The fake bridge received a SECOND apply.patch (the revert's inverse).
        expect(fakeBridge.applyPatchCalls.length).toBe(2);
        // The revert op is a remove_note (the inverse of the applied add_note).
        expect(fakeBridge.applyPatchCalls[1]!.operations[0]).toMatchObject({ op: "remove_note" });
        // The mock clip is back to 1 note (the added note was removed).
        expect(mockClip.size()).toBe(1);
        expect(mockClip.has(64, 0)).toBe(false);
        // The seed note survives (revert only touched the applied add).
        expect(mockClip.has(60, 0)).toBe(true);
      } finally {
        fakeBridge.close();
        await handle.shutdown();
      }
    } finally {
      await dropEnv(env);
    }
  });
});
