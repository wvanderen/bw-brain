// daemon/src/cli/commands/device.test.ts
//
// Phase 5 / 05-07 Task 2 — AUTO-02 end-to-end behavior tests: the
// device.macros_suggest daemon op (reusing 05-04's snapshot freshness
// semantics — D-05-04), the assembleDeviceReviewEvidence macros extension
// (the 05-09 drawer seam), and the bw-device macros-suggest CLI contract
// (thin shell over query("device.macros_suggest")) + the bw-device inspect
// regression.
//
// Op tests drive startQueryServer with the fake-transport/fake-watchdog
// harness (automation.test.ts pattern — the 05-04 sibling); CLI tests spawn
// the real command module via tsx against a scripted fake daemon
// (cli.test.ts pattern).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { startQueryServer, assembleDeviceReviewEvidence, type QueryServerDeps } from "../../query/query-server.js";
import { loadSalienceSnapshot, type SalienceSnapshot } from "../../state/salience-snapshot.js";
import type { MacroSuggestion } from "../../transforms/macro-suggest.js";
import type { StaleWatchdog } from "../../state/stale-watchdog.js";
import type { RawState } from "../../state/reconcile.js";
import type { ProjectIntent } from "../../gen/intent.js";
import type { Transport } from "../../transport/transport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = join(__dirname, "..", "..", "..");
const TSX = join(DAEMON_ROOT, "node_modules", ".bin", "tsx");
const DEVICE_TS = join(DAEMON_ROOT, "src", "cli", "commands", "device.ts");

// ============================================================================
// Harness (automation.test.ts pattern — fake transport + fake watchdog).
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
        paramName: "Cutoff",
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
        movementCount: 4,
        lastValue: 0.1,
        minValue: 0.05,
        maxValue: 0.3,
        lastMovedAt: 1,
      },
    },
  } as unknown as RawState;
}

function fixtureIntent(): ProjectIntent {
  return { version: "1.0", projectIntent: { summary: "techno track, dark" } };
}

/** A valid 5-param snapshot (2 remote_page macros + 3 device params). */
function existingSnapshot(): SalienceSnapshot {
  return {
    version: "1.0",
    pulledAt: "2026-08-22T10:00:00.000Z",
    profile: "generic",
    tracks: [
      {
        trackKey: "trk_0123456789abcdef",
        params: [
          { paramKey: "remote_page:0", deviceKey: "dev_0123456789abcdef", paramIndex: 0, paramName: "Macro 1", source: "remote_page", movementCount: 40, valueRange: 0.6, lastValue: 0.5, salience: 0.95 },
          { paramKey: "device_parameter:3", deviceKey: "dev_0123456789abcdef", paramIndex: 3, paramName: "Cutoff", source: "device_parameter", movementCount: 30, valueRange: 0.5, lastValue: 0.8, salience: 0.9 },
          { paramKey: "device_parameter:7", deviceKey: "dev_0123456789abcdef", paramIndex: 7, paramName: "Resonance", source: "device_parameter", movementCount: 25, valueRange: 0.4, lastValue: 0.5, salience: 0.85 },
          { paramKey: "remote_page:1", deviceKey: "dev_0123456789abcdef", paramIndex: 1, paramName: "Macro 2", source: "remote_page", movementCount: 15, valueRange: 0.3, lastValue: 0.4, salience: 0.7 },
          { paramKey: "device_parameter:9", deviceKey: "dev_0123456789abcdef", paramIndex: 9, paramName: "Drive", source: "device_parameter", movementCount: 10, valueRange: 0.2, lastValue: 0.1, salience: 0.6 },
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

async function makeDeps(opts: DepsOpts = {}): Promise<{ deps: QueryServerDeps; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bw-brain-device-"));
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
  return { deps, dir };
}

async function driveAsync(deps: QueryServerDeps, queryLine: string): Promise<Record<string, unknown>> {
  const transport = deps.transport as unknown as CapturingTransport;
  transport.sent.length = 0;
  transport.handler(queryLine);
  const deadline = Date.now() + 1000;
  while (transport.sent.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(transport.sent).toHaveLength(1);
  return transport.sent[0] as Record<string, unknown>;
}

function macrosLine(refresh = false): string {
  return JSON.stringify({ version: "1.0", type: "query", op: "device.macros_suggest", payload: { refresh } }) + "\n";
}

interface MacrosPayload {
  suggestions: MacroSuggestion[];
  manualHint: string;
  pulledAt: string | null;
}

// ============================================================================
// Op behavior tests 1-3 (05-07-PLAN Task 2 — D-05-04 semantics REUSED).
// ============================================================================

describe("device.macros_suggest op (05-04 freshness semantics reused, not forked)", () => {
  it("Test 1: snapshot present → ranked suggestions + pulledAt + stateFreshness live (AUTO-02)", async () => {
    const { deps, dir } = await makeDeps({ freshness: "live", snapshotText: JSON.stringify(existingSnapshot()) });
    try {
      const res = await driveAsync(deps, macrosLine());
      expect(res.ok).toBe(true);
      expect(res.stateFreshness).toBe("live");
      const payload = res.payload as MacrosPayload;
      expect(payload.pulledAt).toBe("2026-08-22T10:00:00.000Z"); // visible freshness
      expect(payload.suggestions.length).toBeGreaterThanOrEqual(2); // a LIST (SC#2)
      expect(payload.suggestions.some((s) => s.kind === "xy_pair")).toBe(true); // D-05-12 v1
      for (const s of payload.suggestions) {
        expect(s.alternatives.length).toBeGreaterThanOrEqual(1); // D-05-11
        expect(s.assumptions.length).toBeGreaterThanOrEqual(1); // UX-06
        expect(s.manualHint.length).toBeGreaterThan(0);
      }
      expect(payload.manualHint.length).toBeGreaterThan(0);
      expect((res.assumptions as unknown[]).length).toBeGreaterThan(0);
      // Advisory invariant on the wire: no patch fields anywhere.
      const json = JSON.stringify(res);
      expect(json).not.toContain('"patchId"');
      expect(json).not.toContain('"operations"');
      expect(json).not.toContain('"risk"');
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 1b: connected + NO snapshot bootstraps from the live folds (inspect parity)", async () => {
    const { deps, dir } = await makeDeps({ freshness: "live", snapshotText: null });
    try {
      const res = await driveAsync(deps, macrosLine());
      expect(res.ok).toBe(true);
      const payload = res.payload as MacrosPayload;
      expect(payload.suggestions.length).toBeGreaterThanOrEqual(2); // 3 fold params → pair + macro
      expect(typeof payload.pulledAt).toBe("string");
      // The bootstrap refresh persisted the snapshot for later disconnected reads.
      const persisted = await loadSalienceSnapshot(path.join(dir, "salience-snapshot.json"));
      expect(persisted).not.toBeNull();
      expect(persisted!.pulledAt).toBe(payload.pulledAt);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 2: no snapshot (disconnected) → named refusal no_snapshot; corrupt → snapshot_invalid", async () => {
    const none = await makeDeps({ freshness: "disconnected", snapshotText: null });
    try {
      const res = await driveAsync(none.deps, macrosLine());
      expect(res.ok).toBe(false);
      expect(res.error).toBe("no_snapshot");
    } finally {
      await fs.rm(none.dir, { recursive: true, force: true }).catch(() => {});
    }
    const corrupt = await makeDeps({ freshness: "live", snapshotText: "{ not json" });
    try {
      const res = await driveAsync(corrupt.deps, macrosLine());
      expect(res.ok).toBe(false);
      expect(res.error).toBe("snapshot_invalid");
    } finally {
      await fs.rm(corrupt.dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 3: disconnected + stale snapshot → STALE-BUT-READABLE with visible pulledAt (D-05-04)", async () => {
    const { deps, dir } = await makeDeps({
      freshness: "disconnected",
      snapshotText: JSON.stringify(existingSnapshot()),
    });
    try {
      const res = await driveAsync(deps, macrosLine());
      expect(res.ok).toBe(true);
      expect(res.stateFreshness).toBe("disconnected");
      const payload = res.payload as MacrosPayload;
      expect(payload.pulledAt).toBe("2026-08-22T10:00:00.000Z"); // VISIBLE freshness
      expect(payload.suggestions.length).toBeGreaterThanOrEqual(2);
      const claims = (res.assumptions as Array<{ claim: string }>).map((a) => a.claim).join(" ");
      expect(claims).toMatch(/snapshot pulled at/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("unconfigured path → not_implemented (peer/boot wiring owns the path)", async () => {
    const { deps, dir } = await makeDeps({ configurePath: false });
    try {
      const res = await driveAsync(deps, macrosLine());
      expect(res.ok).toBe(false);
      expect(res.error).toBe("not_implemented");
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ============================================================================
// Test 4 — assembleDeviceReviewEvidence macros extension (the 05-09 seam).
// ============================================================================

describe("assembleDeviceReviewEvidence — macros field (05-09 drawer seam)", () => {
  const chain = [{ deviceSid: "dev_0123456789abcdef", name: "Serum" }];

  it("evidence carries macros alongside chain + salience when the caller supplies them", () => {
    const macros: MacroSuggestion[] = [
      {
        kind: "macro",
        params: [{ paramKey: "remote_page:0", paramName: "Macro 1", deviceKey: "dev_0123456789abcdef", source: "remote_page", movementCount: 40, salience: 0.95 }],
        evidence: [{ identity: "Macro 1", device: "dev_0123456789abcdef", movementCount: 40, roleEnergyContext: "role/energy priors not attached — defaulted 0.5 each (D-05-01 fallback)" }],
        assumptions: [{ claim: "ranked from observed movement only", confidence: 1.0, source: "selection" }],
        alternatives: [{ identity: "Cutoff", device: "dev_0123456789abcdef", salience: 0.9 }],
        manualHint: "wire \"Macro 1\" to a macro knob by hand in Bitwig — advisory only",
      },
    ];
    const out = assembleDeviceReviewEvidence({
      snap: existingSnapshot(),
      chain,
      macros,
      intent: null,
      freshness: "live",
      refresh: false,
      snapshotConfigured: true,
    });
    expect(out.kind).toBe("evidence");
    if (out.kind !== "evidence") return;
    expect(out.evidence.chain).toEqual(chain);
    expect(out.evidence.salience).toHaveLength(5);
    expect(out.evidence.macros).toEqual(macros); // the drawer field (populated identically)
  });

  it("macros defaults to [] when the caller supplies none (structurally present, honestly empty)", () => {
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
    expect(out.evidence.macros).toEqual([]);
  });
});

// ============================================================================
// Tests 5-6 — CLI contract: bw-device macros-suggest (thin shell) + the
// inspect regression (cli.test.ts spawn pattern).
// ============================================================================

let cliSocketPath = "";
let cliServer: net.Server | null = null;
let cliTmpDir = "";

const SCRIPTED_MACROS = {
  version: "1.0",
  type: "result" as const,
  ok: true,
  stateFreshness: "live" as const,
  payload: {
    suggestions: [
      {
        kind: "xy_pair",
        params: [
          { paramKey: "remote_page:0", paramName: "Macro 1", deviceKey: "dev_0123456789abcdef", source: "remote_page", movementCount: 40, salience: 0.95 },
          { paramKey: "device_parameter:3", paramName: "Cutoff", deviceKey: "dev_0123456789abcdef", source: "device_parameter", movementCount: 30, salience: 0.9 },
        ],
        evidence: [],
        assumptions: [{ claim: "ranked from observed movement only", confidence: 1.0, source: "selection" }],
        alternatives: [{ identity: "Resonance", device: "dev_0123456789abcdef", salience: 0.85 }],
        manualHint: 'map "Macro 1" to X and "Cutoff" to Y on an XY control by hand in Bitwig — advisory only',
      },
    ],
    manualHint: "top 1 macro/XY candidates ranked from observed expressiveness — the producer wires macros by hand in Bitwig; advisory only, no patches are emitted (D-05-09)",
    pulledAt: "2026-08-22T12:00:00.000Z",
  },
  assumptions: [{ claim: "served from the daemon's normalized live state", confidence: 1.0, source: "selection" }],
};

const SCRIPTED_INSPECT = {
  version: "1.0",
  type: "result" as const,
  ok: true,
  stateFreshness: "live" as const,
  payload: { devices: [{ deviceSid: "dev_0123456789abcdef", pages: [] }] },
  assumptions: [{ claim: "served from the daemon's normalized live state", confidence: 1.0, source: "selection" }],
};

beforeAll(async () => {
  cliTmpDir = mkdtempSync(join(os.tmpdir(), "bw-device-cli-"));
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
          const result =
            query.op === "device.macros_suggest"
              ? SCRIPTED_MACROS
              : query.op === "device.inspect"
                ? SCRIPTED_INSPECT
                : {
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
    const child = spawn(TSX, [DEVICE_TS, ...args], { env: { ...process.env, ...env }, cwd: DAEMON_ROOT });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.on("close", (code) => resolve({ stdout, code: code ?? -1 }));
  });
}

describe("bw-device macros-suggest CLI (thin shell contract)", () => {
  it("Test 5: shells to query(\"device.macros_suggest\") and prints compact JSON with suggestions", async () => {
    const r = await runCli(["macros-suggest"], { BW_BRAIN_SOCKET: cliSocketPath });
    expect(r.code).toBe(0);
    expect(r.stdout.trim().includes("\n")).toBe(false); // compact by default
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.suggestions[0].kind).toBe("xy_pair");
    expect(out.payload.suggestions[0].alternatives.length).toBeGreaterThanOrEqual(1);
    expect(out.payload.pulledAt).toBe("2026-08-22T12:00:00.000Z");
    expect(out.assumptions.length).toBeGreaterThan(0);
  });

  it("Test 5: --explain pretty-prints (2-space indent, multi-line)", async () => {
    const r = await runCli(["macros-suggest", "--explain"], { BW_BRAIN_SOCKET: cliSocketPath });
    expect(r.code).toBe(0);
    expect(r.stdout.includes("\n  ")).toBe(true);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("Test 5: connection failure prints the disconnected envelope via printConnectionError (fail-closed, exit 0)", async () => {
    const r = await runCli(["macros-suggest"], { BW_BRAIN_SOCKET: join(cliTmpDir, "does-not-exist.sock") });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.stateFreshness).toBe("disconnected");
    expect(typeof out.error).toBe("string");
  });

  it("Test 6 (regression): bw-device inspect behavior is UNCHANGED", async () => {
    const r = await runCli(["inspect"], { BW_BRAIN_SOCKET: cliSocketPath });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toEqual(SCRIPTED_INSPECT); // the inspect envelope, verbatim
  });

  it("structural: device.ts is a live thin shell over both ops (no business logic)", async () => {
    const source = await fs.readFile(DEVICE_TS, "utf8");
    expect(source).toContain('query("device.macros_suggest"');
    expect(source).toContain('query("device.inspect"');
    expect(source).toContain("printConnectionError");
  });
});
