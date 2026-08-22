// daemon/src/cli/commands/automation.test.ts
//
// Phase 5 / 05-04 Task 3 — AUTO-01 end-to-end behavior tests: the
// automation.inspect daemon op (freshness semantics per D-05-04), the
// assembleDeviceReviewEvidence outcome union (the 05-09 peer-path seam), and
// the bw-automation inspect CLI contract (thin shell over
// query("automation.inspect")).
//
// Op tests drive startQueryServer with the fake-transport/fake-watchdog
// harness (query-server.test.ts pattern); CLI tests spawn the real command
// module via tsx against a scripted fake daemon (cli.test.ts pattern).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdtempSync, rmSync } from "node:fs";
import { startQueryServer, assembleDeviceReviewEvidence, type QueryServerDeps } from "../../query/query-server.js";
import { saveSalienceSnapshot, loadSalienceSnapshot, type SalienceSnapshot } from "../../state/salience-snapshot.js";
import type { StaleWatchdog } from "../../state/stale-watchdog.js";
import type { RawState } from "../../state/reconcile.js";
import type { ProjectIntent } from "../../gen/intent.js";
import type { Transport } from "../../transport/transport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = join(__dirname, "..", "..", "..");
const TSX = join(DAEMON_ROOT, "node_modules", ".bin", "tsx");
const AUTOMATION_TS = join(DAEMON_ROOT, "src", "cli", "commands", "automation.ts");

// ============================================================================
// Harness (query-server.test.ts pattern — fake transport + fake watchdog).
// ============================================================================

interface CapturingTransport extends Transport {
  sent: object[];
  handler: (chunk: unknown) => void;
  onMessage(handler: (chunk: unknown) => void): void;
  send(msg: object): void;
  close(): void;
}

function makeCapturingTransport(): CapturingTransport {
  const t: CapturingTransport = {
    sent: [],
    handler: () => {},
    onMessage(handler) {
      t.handler = handler;
    },
    send(msg) {
      t.sent.push(msg);
    },
    close() {},
  };
  return t;
}

function makeFakeWatchdog(freshness: "live" | "stale" | "disconnected"): StaleWatchdog {
  return { tick: () => freshness } as unknown as StaleWatchdog;
}

/** A live state whose 05-01 fold carries three observed params (macro first). */
function salienceState(): RawState {
  return {
    version: "1.0",
    project: { name: "Demo", tempo: 130, timeSignature: "4/4" },
    selection: { trackSid: "trk_0123456789abcdef" },
    parameters: {
      "dev_0123456789abcdef:remote_page:0": {
        deviceKey: "dev_0123456789abcdef",
        paramIndex: 0,
        paramName: "Macro 1",
        source: "remote_page",
        movementCount: 20,
        lastValue: 0.5,
        minValue: 0.2,
        maxValue: 0.8,
        lastMovedAt: 1,
      },
      "dev_0123456789abcdef:device_parameter:3": {
        deviceKey: "dev_0123456789abcdef",
        paramIndex: 3,
        source: "device_parameter",
        movementCount: 20,
        lastValue: 0.5,
        minValue: 0.2,
        maxValue: 0.8,
        lastMovedAt: 1,
      },
      "dev_0123456789abcdef:device_parameter:7": {
        deviceKey: "dev_0123456789abcdef",
        paramIndex: 7,
        source: "device_parameter",
        movementCount: 0,
        lastValue: 0.1,
        minValue: 0.1,
        maxValue: 0.1,
        lastMovedAt: 0,
      },
    },
  } as unknown as RawState;
}

function fixtureIntent(): ProjectIntent {
  return { version: "1.0", projectIntent: { summary: "techno track, dark" } };
}

/** A valid pre-existing snapshot for the disconnected read path. */
function existingSnapshot(): SalienceSnapshot {
  return {
    version: "1.0",
    pulledAt: "2026-08-22T10:00:00.000Z",
    profile: "generic",
    tracks: [
      {
        trackKey: "trk_0123456789abcdef",
        params: [
          {
            paramKey: "remote_page:0",
            deviceKey: "dev_0123456789abcdef",
            paramIndex: 0,
            source: "remote_page",
            movementCount: 9,
            valueRange: 0.5,
            lastValue: 0.5,
            salience: 0.9,
          },
        ],
      },
    ],
  };
}

interface DepsOpts {
  freshness?: "live" | "stale" | "disconnected";
  state?: RawState | null;
  snapshotText?: string | null; // null = no file; string = file contents
  configurePath?: boolean;
}

async function makeDeps(opts: DepsOpts = {}): Promise<{ deps: QueryServerDeps; transport: CapturingTransport; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bw-brain-automation-"));
  const snapshotPath = path.join(dir, "salience-snapshot.json");
  if (opts.snapshotText !== undefined && opts.snapshotText !== null) {
    await fs.writeFile(snapshotPath, opts.snapshotText, "utf8");
  }
  const transport = makeCapturingTransport();
  const deps: QueryServerDeps = {
    transport,
    watchdog: makeFakeWatchdog(opts.freshness ?? "live"),
    getState: () => (opts.state === undefined ? salienceState() : opts.state),
    getIntent: () => fixtureIntent(),
    ...(opts.configurePath === false ? {} : { salienceSnapshotPath: snapshotPath }),
  };
  startQueryServer(deps);
  return { deps, transport, dir };
}

async function driveAsync(deps: QueryServerDeps, queryLine: string): Promise<Record<string, unknown>> {
  const transport = deps.transport as CapturingTransport;
  transport.sent.length = 0;
  transport.handler(queryLine);
  const deadline = Date.now() + 1000;
  while (transport.sent.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(transport.sent).toHaveLength(1);
  return transport.sent[0] as Record<string, unknown>;
}

function inspectLine(refresh = false): string {
  return JSON.stringify({ version: "1.0", type: "query", op: "automation.inspect", payload: { refresh } }) + "\n";
}

interface InspectPayload {
  params: Array<{ paramKey: string; salience: number; source: string }>;
  tracks: Array<{ trackKey: string; params: unknown[] }>;
  pulledAt: string | null;
}

// ============================================================================
// Op behavior tests 1-5 (05-04-PLAN Task 3).
// ============================================================================

describe("automation.inspect op (D-05-04 freshness semantics)", () => {
  it("Test 1: connected + populated folds → ranked params (highest first) + pulledAt + stateFreshness live", async () => {
    const { deps, dir } = await makeDeps({ freshness: "live" });
    try {
      const res = await driveAsync(deps, inspectLine());
      expect(res.ok).toBe(true);
      expect(res.stateFreshness).toBe("live");
      const payload = res.payload as InspectPayload;
      // RANKED LIST (SC#2 — never a single best param), salience desc, macro first.
      expect(payload.params.length).toBe(3);
      expect(payload.params[0]!.paramKey).toBe("remote_page:0");
      for (let i = 1; i < payload.params.length; i++) {
        expect(payload.params[i - 1]!.salience).toBeGreaterThanOrEqual(payload.params[i]!.salience);
      }
      expect(typeof payload.pulledAt).toBe("string");
      expect((res.assumptions as unknown[]).length).toBeGreaterThan(0);
      // The bootstrap refresh persisted the snapshot (subsequent disconnected
      // reads have something durable to read).
      const persisted = await loadSalienceSnapshot(path.join(dir, "salience-snapshot.json"));
      expect(persisted).not.toBeNull();
      expect(persisted!.pulledAt).toBe(payload.pulledAt);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 2: disconnected + existing snapshot → STALE-BUT-READABLE with visible pulledAt (never silent)", async () => {
    const snap = existingSnapshot();
    const { deps, dir } = await makeDeps({
      freshness: "disconnected",
      state: salienceState(),
      snapshotText: JSON.stringify(snap),
    });
    try {
      const res = await driveAsync(deps, inspectLine());
      expect(res.ok).toBe(true);
      expect(res.stateFreshness).toBe("disconnected");
      const payload = res.payload as InspectPayload;
      expect(payload.pulledAt).toBe("2026-08-22T10:00:00.000Z"); // VISIBLE freshness
      expect(payload.params).toHaveLength(1);
      expect(payload.params[0]!.paramKey).toBe("remote_page:0");
      const claims = (res.assumptions as Array<{ claim: string }>).map((a) => a.claim).join(" ");
      expect(claims).toMatch(/snapshot pulled at/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 3: disconnected + NO snapshot → named refusal no_snapshot (not a crash)", async () => {
    const { deps, dir } = await makeDeps({ freshness: "disconnected", snapshotText: null });
    try {
      const res = await driveAsync(deps, inspectLine());
      expect(res.ok).toBe(false);
      expect(res.error).toBe("no_snapshot");
      expect(res.stateFreshness).toBe("disconnected");
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 4: corrupt on-disk snapshot → snapshot_invalid (never a synthesized default)", async () => {
    for (const freshness of ["live", "disconnected"] as const) {
      const { deps, dir } = await makeDeps({ freshness, snapshotText: "{ not json" });
      try {
        const res = await driveAsync(deps, inspectLine());
        expect(res.ok).toBe(false);
        expect(res.error).toBe("snapshot_invalid");
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  it("Test 5: --refresh with EMPTY folded parameters refuses to save (refuse-incomplete-up-front — no empty snapshot persisted)", async () => {
    const emptyState = {
      version: "1.0",
      project: { name: "Demo", tempo: 130, timeSignature: "4/4" },
      selection: {},
    } as unknown as RawState;
    const { deps, dir } = await makeDeps({ freshness: "live", state: emptyState });
    try {
      const res = await driveAsync(deps, inspectLine(true));
      expect(res.ok).toBe(true);
      const payload = res.payload as InspectPayload;
      expect(payload.params).toEqual([]);
      expect(payload.pulledAt).toBeNull();
      // NO file persisted — the empty fold never reaches disk.
      await expect(fs.readFile(path.join(dir, "salience-snapshot.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("unconfigured path → not_implemented (peer/boot wiring owns the path)", async () => {
    const { deps, dir } = await makeDeps({ configurePath: false });
    try {
      const res = await driveAsync(deps, inspectLine());
      expect(res.ok).toBe(false);
      expect(res.error).toBe("not_implemented");
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("--refresh while disconnected → state_disconnected hard refusal (arrange parity)", async () => {
    const snap = existingSnapshot();
    const { deps, dir } = await makeDeps({
      freshness: "disconnected",
      snapshotText: JSON.stringify(snap),
    });
    try {
      const res = await driveAsync(deps, inspectLine(true));
      expect(res.ok).toBe(false);
      expect(res.error).toBe("state_disconnected");
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("--refresh while connected re-analyzes and REPLACES the snapshot (pulledAt advances)", async () => {
    const snap = existingSnapshot();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      snapshotText: JSON.stringify(snap),
    });
    try {
      const res = await driveAsync(deps, inspectLine(true));
      expect(res.ok).toBe(true);
      const payload = res.payload as InspectPayload;
      expect(payload.pulledAt).not.toBe("2026-08-22T10:00:00.000Z");
      expect(payload.params.length).toBe(3); // the live fold's three params
      const persisted = await loadSalienceSnapshot(path.join(dir, "salience-snapshot.json"));
      expect(persisted!.pulledAt).toBe(payload.pulledAt);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ============================================================================
// Test 7 — assembleDeviceReviewEvidence (the 05-09 action-dispatch seam; the
// macro extension lands in 05-07 and is structurally optional).
// ============================================================================

describe("assembleDeviceReviewEvidence (outcome union refusal|no-snapshot|evidence)", () => {
  const chain = [{ deviceSid: "dev_0123456789abcdef", name: "Serum" }];

  it("refusal not_implemented when no snapshot path is configured", () => {
    const out = assembleDeviceReviewEvidence({
      snap: null,
      chain,
      intent: null,
      freshness: "live",
      refresh: false,
      snapshotConfigured: false,
    });
    expect(out).toEqual({ kind: "refusal", reason: "not_implemented" });
  });

  it("refusal state_disconnected when a refresh is demanded while disconnected", () => {
    const out = assembleDeviceReviewEvidence({
      snap: null,
      chain,
      intent: null,
      freshness: "disconnected",
      refresh: true,
      snapshotConfigured: true,
    });
    expect(out).toEqual({ kind: "refusal", reason: "state_disconnected" });
  });

  it("refusal snapshot_invalid when the load boundary threw (corrupt file)", () => {
    const out = assembleDeviceReviewEvidence({
      snap: null,
      snapshotInvalid: true,
      chain,
      intent: null,
      freshness: "live",
      refresh: false,
      snapshotConfigured: true,
    });
    expect(out).toEqual({ kind: "refusal", reason: "snapshot_invalid" });
  });

  it("no-snapshot outcome when nothing durable exists (hint path, no fabricated evidence)", () => {
    const out = assembleDeviceReviewEvidence({
      snap: null,
      chain,
      intent: null,
      freshness: "live",
      refresh: false,
      snapshotConfigured: true,
    });
    expect(out).toEqual({ kind: "no-snapshot" });
  });

  it("evidence outcome carries chain devices + RANKED salience + pulledAt + assumptions", () => {
    const out = assembleDeviceReviewEvidence({
      snap: existingSnapshot(),
      chain,
      intent: null,
      freshness: "live",
      refresh: false,
      snapshotConfigured: true,
    });
    expect(out.kind).toBe("evidence");
    if (out.kind !== "evidence") return;
    expect(out.evidence.chain).toEqual(chain);
    expect(out.evidence.salience).toHaveLength(1);
    expect(out.evidence.salience[0]!.salience).toBe(0.9);
    expect(out.evidence.pulledAt).toBe("2026-08-22T10:00:00.000Z");
    expect(out.evidence.assumptions.length).toBeGreaterThan(0);
    // 05-07 macro extension is structurally OPTIONAL — absent today, tolerated.
    expect((out.evidence as { macros?: unknown }).macros).toBeUndefined();
  });
});

// ============================================================================
// Test 6 — CLI contract: bw-automation inspect (thin shell, cli.test.ts
// spawn pattern).
// ============================================================================

let cliSocketPath = "";
let cliServer: net.Server | null = null;
let cliTmpDir = "";

const SCRIPTED_INSPECT = {
  version: "1.0",
  type: "result" as const,
  ok: true,
  stateFreshness: "live" as const,
  payload: {
    params: [
      { paramKey: "remote_page:0", salience: 0.954, source: "remote_page" },
      { paramKey: "device_parameter:3", salience: 0.512, source: "device_parameter" },
    ],
    pulledAt: "2026-08-22T12:00:00.000Z",
  },
  assumptions: [{ claim: "ranked from observed movement", confidence: 1.0, source: "selection" }],
};

beforeAll(async () => {
  cliTmpDir = mkdtempSync(join(os.tmpdir(), "bw-automation-cli-"));
  cliSocketPath = join(cliTmpDir, "daemon.sock");
  await new Promise<void>((resolve) => {
    cliServer = net.createServer((conn) => {
      conn.setEncoding("utf8");
      let buf = "";
      conn.on("data", (chunk) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          let query: { op?: string };
          try {
            query = JSON.parse(line);
          } catch {
            continue;
          }
          const result = query.op === "automation.inspect" ? SCRIPTED_INSPECT : {
            version: "1.0",
            type: "result" as const,
            ok: true,
            stateFreshness: "live" as const,
            payload: {},
            assumptions: [],
          };
          conn.write(`${JSON.stringify(result)}\n`);
        }
      });
    });
    cliServer.listen(cliSocketPath, resolve);
  });
});

afterAll(() => {
  cliServer?.close();
  rmSync(cliTmpDir, { recursive: true, force: true });
});

function runCli(args: string[], env: Record<string, string>): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [AUTOMATION_TS, ...args], { env: { ...process.env, ...env }, cwd: DAEMON_ROOT });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.on("close", (code) => resolve({ stdout, code: code ?? -1 }));
  });
}

describe("bw-automation inspect CLI (thin shell contract)", () => {
  it("shells to query(\"automation.inspect\") and prints compact JSON (ranked list present)", async () => {
    const r = await runCli(["inspect"], { BW_BRAIN_SOCKET: cliSocketPath });
    expect(r.code).toBe(0);
    expect(r.stdout.trim().includes("\n")).toBe(false); // compact by default
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.params[0].paramKey).toBe("remote_page:0");
    expect(out.payload.pulledAt).toBe("2026-08-22T12:00:00.000Z");
    expect(out.assumptions.length).toBeGreaterThan(0);
  });

  it("--explain pretty-prints (2-space indent, multi-line)", async () => {
    const r = await runCli(["inspect", "--explain"], { BW_BRAIN_SOCKET: cliSocketPath });
    expect(r.code).toBe(0);
    expect(r.stdout.includes("\n  ")).toBe(true);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("connection failure prints the disconnected envelope via printConnectionError (fail-closed, exit 0)", async () => {
    const r = await runCli(["inspect"], { BW_BRAIN_SOCKET: join(cliTmpDir, "does-not-exist.sock") });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.stateFreshness).toBe("disconnected");
    expect(typeof out.error).toBe("string");
  });

  it("structural: automation.ts is a live thin shell (queries the op; emitStub gone)", async () => {
    const source = await readFile(AUTOMATION_TS, "utf8");
    expect(source).toContain('query("automation.inspect"');
    expect(source).not.toContain("emitStub");
    expect(source).toContain("printConnectionError");
  });
});
