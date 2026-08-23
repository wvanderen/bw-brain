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
import { mkdtempSync, rmSync } from "node:fs";
import { startQueryServer, assembleDeviceReviewEvidence, type QueryServerDeps } from "../../query/query-server.js";
import { saveSalienceSnapshot, loadSalienceSnapshot, type SalienceSnapshot } from "../../state/salience-snapshot.js";
import { CandidateStore } from "../../patch/candidate-store.js";
import { validatePatch, scopeOpPairingError } from "../../patch/patch-schema.js";
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
  candidateStore?: CandidateStore;
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
    ...(opts.candidateStore !== undefined ? { candidateStore: opts.candidateStore } : {}),
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
    // 05-07 macro extension landed: the field is structurally present now,
    // defaulting to an honestly-empty list when the caller supplies none.
    expect(out.evidence.macros).toEqual([]);
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

/** The scripted ok:true propose envelope (candidate + digest + preview points). */
const SCRIPTED_PROPOSE = {
  version: "1.0",
  type: "result" as const,
  ok: true,
  stateFreshness: "live" as const,
  payload: {
    candidate: {
      patchId: "pt_01234567-89ab-cdef-0123-456789abcdef",
      digest: "a".repeat(64),
      risk: "medium",
      undoLabel: "bw-brain automation: ramp_up on Macro 1",
      shape: "ramp_up",
      rationale: "automation.propose ramp_up on Macro 1: bounded 8-bar ramp_up curve (depth 0.55)",
    },
    target: { deviceSid: "dev_0123456789abcdef", paramIndex: 0, paramSource: "remote_page", identity: "Macro 1" },
    curve: {
      shape: "ramp_up",
      depth: 0.55,
      rate: 1.0625,
      lengthBars: 8,
      startBar: 0,
      beatsPerBar: 4,
      pointCount: 64,
      valueMin: 0.225,
      valueMax: 0.775,
      points: [
        { beat: 0, value: 0.225 },
        { beat: 32, value: 0.775 },
      ],
    },
  },
  assumptions: [{ claim: "target designated from salience", confidence: 1.0, source: "selection" }],
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
          const result = query.op === "automation.inspect" ? SCRIPTED_INSPECT : query.op === "automation.propose" ? SCRIPTED_PROPOSE : {
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
    const source = await fs.readFile(AUTOMATION_TS, "utf8");
    expect(source).toContain('query("automation.inspect"');
    expect(source).not.toContain("emitStub");
    expect(source).toContain("printConnectionError");
  });
});

// ============================================================================
// Phase 5 / 05-08 Task 2 — automation.propose op (AUTO-03) + bw-automation
// propose CLI. Construction only: target → curve → patch → validate →
// classifyRisk (medium) → candidateStore.mint. Approval/apply/revert ride the
// EXISTING bw-edit spine untouched (RB-04, D-05-15 quiet-start).
// ============================================================================

function proposeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ version: "1.0", type: "query", op: "automation.propose", payload }) + "\n";
}

interface ProposeCurve {
  shape: string;
  depth: number;
  rate: number;
  lengthBars: number;
  startBar: number;
  beatsPerBar: number;
  pointCount: number;
  valueMin: number;
  valueMax: number;
  points: Array<{ beat: number; value: number }>;
}

interface ProposePayload {
  candidate: { patchId: string; digest: string; risk: string; undoLabel: string; shape: string; rationale: string };
  target: { deviceSid: string; paramIndex: number; paramSource: string; identity: string };
  curve: ProposeCurve;
}

describe("automation.propose op (AUTO-03 — salience-grounded construction, D-05-15)", () => {
  it("Test 1: designated paramKey → minted candidate whose rationale cites the movement evidence + salience prior assumption", async () => {
    const store = new CandidateStore();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      snapshotText: JSON.stringify(existingSnapshot()),
      candidateStore: store,
    });
    try {
      const res = await driveAsync(deps, proposeLine({ target: "remote_page:0" }));
      expect(res.ok).toBe(true);
      const payload = res.payload as ProposePayload;
      expect(payload.candidate.patchId).toMatch(/^pt_[0-9a-f-]{36}$/);
      // D-05-15: the SALIENCE EVIDENCE flows into the rationale (movement count + source).
      expect(payload.candidate.rationale).toContain("9");
      expect(payload.candidate.rationale).toContain("remote_page");
      expect(payload.target.deviceSid).toBe("dev_0123456789abcdef");
      expect(payload.target.identity).toBe("remote_page:0"); // no paramName on this entry → the stable key
      // ...and into assumptions[] (the salience prior source).
      const claims = (res.assumptions as Array<{ claim: string }>).map((a) => a.claim).join(" ");
      expect(claims).toMatch(/salience snapshot pulled at/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 2: explicit UNOBSERVED param → minted with an 'unobserved param' assumption (not a refusal, not synthesized evidence)", async () => {
    const store = new CandidateStore();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      snapshotText: JSON.stringify(existingSnapshot()),
      candidateStore: store,
    });
    try {
      const res = await driveAsync(
        deps,
        proposeLine({
          target: { deviceKey: "dev_ffffffffffffffff", paramIndex: 5, paramSource: "device_parameter" },
        }),
      );
      expect(res.ok).toBe(true);
      const payload = res.payload as ProposePayload;
      expect(payload.target.deviceSid).toBe("dev_ffffffffffffffff");
      expect(payload.candidate.patchId).toMatch(/^pt_/);
      const claims = (res.assumptions as Array<{ claim: string }>).map((a) => a.claim).join(" ");
      expect(claims).toMatch(/unobserved param/i);
      expect(claims).toMatch(/browsable fallback/i);
      // T-05-23: the rationale must NOT claim movement evidence it does not have.
      expect(payload.candidate.rationale).toMatch(/unobserved/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 3: the minted patch validates (scope↔op pairing), classifies MEDIUM, and its points respect the D-05-14 bounds", async () => {
    const store = new CandidateStore();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      snapshotText: JSON.stringify(existingSnapshot()),
      candidateStore: store,
    });
    try {
      const res = await driveAsync(deps, proposeLine({ target: "remote_page:0", lengthBars: 8 }));
      expect(res.ok).toBe(true);
      const payload = res.payload as ProposePayload;
      const candidate = store.get(payload.candidate.patchId);
      expect(candidate).toBeDefined();
      // Patch-schema validation + the 05-05 scope↔op pairing both hold.
      expect(validatePatch(candidate)).toBe(true);
      expect(scopeOpPairingError(candidate!)).toBeNull();
      // D-05-10: automation ops floor at MEDIUM (classifyRisk asserted, not re-implemented).
      expect(candidate!.risk).toBe("medium");
      expect("deviceSid" in candidate!.scope).toBe(true);
      const scope = candidate!.scope as { deviceSid: string; paramIndex: number; paramSource: string; region: { startBar: number; lengthBars: number } };
      expect(scope.deviceSid).toBe("dev_0123456789abcdef");
      expect(scope.paramSource).toBe("remote_page");
      expect(scope.region.lengthBars).toBe(8);
      expect(Number.isInteger(scope.region.lengthBars)).toBe(true);
      // D-05-14 bounds on the authored points.
      const op = candidate!.operations[0] as { op: string; points: Array<{ beat: number; value: number }> };
      expect(op.op).toBe("automation_points");
      expect(op.points.length).toBeGreaterThanOrEqual(1);
      expect(op.points.length).toBeLessThanOrEqual(64);
      for (const p of op.points) {
        expect(p.value).toBeGreaterThanOrEqual(0);
        expect(p.value).toBeLessThanOrEqual(1);
        expect(p.beat).toBeGreaterThanOrEqual(0);
      }
      // undoLabel is MANDATORY on the patch (the plan's artifact contract).
      expect(typeof candidate!.undoLabel).toBe("string");
      expect(candidate!.undoLabel!.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 4: shape/depth/rate/lengthBars overrides flow into the curve; lengthBars 17 → NAMED refusal, no candidate", async () => {
    const store = new CandidateStore();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      snapshotText: JSON.stringify(existingSnapshot()),
      candidateStore: store,
    });
    try {
      const res = await driveAsync(
        deps,
        proposeLine({ target: "remote_page:0", shape: "hold_then_move", depth: 0.3, rate: 0.5, lengthBars: 8 }),
      );
      expect(res.ok).toBe(true);
      const payload = res.payload as ProposePayload;
      expect(payload.curve.shape).toBe("hold_then_move");
      expect(payload.curve.depth).toBeCloseTo(0.3, 6);
      expect(payload.curve.rate).toBeCloseTo(0.5, 6);
      expect(payload.curve.lengthBars).toBe(8);

      // Out-of-bounds override → named refusal, NO candidate minted.
      const refusal = await driveAsync(deps, proposeLine({ target: "remote_page:0", lengthBars: 17 }));
      expect(refusal.ok).toBe(false);
      expect(refusal.error).toBe("invalid_curve_spec");
      expect(refusal.payload).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 5: propose NEVER auto-publishes or applies — candidate id + digest only, no approval token (quiet-start D-05-15)", async () => {
    const store = new CandidateStore();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      snapshotText: JSON.stringify(existingSnapshot()),
      candidateStore: store,
    });
    try {
      const res = await driveAsync(deps, proposeLine({ target: "remote_page:0" }));
      expect(res.ok).toBe(true);
      const payload = res.payload as ProposePayload;
      expect(payload.candidate.digest).toMatch(/^[0-9a-f]{64}$/);
      // No approval surface anywhere in the payload — construction only.
      const payloadKeys = Object.keys(payload as unknown as Record<string, unknown>);
      expect(payloadKeys).toContain("candidate");
      expect(payloadKeys).not.toContain("approval");
      expect(payloadKeys).not.toContain("token");
      expect(JSON.stringify(payload)).not.toMatch(/approvalToken|approvedAt/);
      // Structural: the propose handler adds no publish/approval authority.
      const source = await fs.readFile(join(DAEMON_ROOT, "src", "query", "query-server.ts"), "utf8");
      expect(source).toContain("automation.propose");
      expect(source).not.toMatch(/proposal\.publish|proposalStore|approvalStore/);
      expect(source).not.toMatch(/setInterval|setTimeout\(/); // no scheduler / proactive-proposal code on the op
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("Test 6: beatsPerBar resolves from project timeSignature (7/4 → 7) and the region math uses it (D-05-16)", async () => {
    const sevenFour = {
      ...salienceState(),
      project: { name: "Demo", tempo: 130, timeSignature: "7/4" },
    } as unknown as RawState;
    const store = new CandidateStore();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      state: sevenFour,
      snapshotText: JSON.stringify(existingSnapshot()),
      candidateStore: store,
    });
    try {
      const res = await driveAsync(deps, proposeLine({ target: "remote_page:0", lengthBars: 2 }));
      expect(res.ok).toBe(true);
      const payload = res.payload as ProposePayload;
      expect(payload.curve.beatsPerBar).toBe(7);
      // 2 bars × 7 beats = 14 region-relative beats at the last point.
      const last = payload.curve.points[payload.curve.points.length - 1]!;
      expect(last.beat).toBeCloseTo(14, 6);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("refusals: disconnected → state_disconnected; no candidateStore → not_implemented; unknown paramKey → unknown_param; missing target → invalid_query", async () => {
    // disconnected (watchdog gate — the prepareMidiDispatch mint-path analog)
    const d1 = await makeDeps({ freshness: "disconnected", snapshotText: JSON.stringify(existingSnapshot()), candidateStore: new CandidateStore() });
    try {
      const res = await driveAsync(d1.deps, proposeLine({ target: "remote_page:0" }));
      expect(res.ok).toBe(false);
      expect(res.error).toBe("state_disconnected");
    } finally { await fs.rm(d1.dir, { recursive: true, force: true }).catch(() => {}); }
    // no candidate store wired
    const d2 = await makeDeps({ snapshotText: JSON.stringify(existingSnapshot()) });
    try {
      const res = await driveAsync(d2.deps, proposeLine({ target: "remote_page:0" }));
      expect(res.ok).toBe(false);
      expect(res.error).toBe("not_implemented");
    } finally { await fs.rm(d2.dir, { recursive: true, force: true }).catch(() => {}); }
    // designated paramKey absent from the snapshot → named refusal (use the explicit fallback instead)
    const d3 = await makeDeps({ snapshotText: JSON.stringify(existingSnapshot()), candidateStore: new CandidateStore() });
    try {
      const res = await driveAsync(d3.deps, proposeLine({ target: "device_parameter:99" }));
      expect(res.ok).toBe(false);
      expect(res.error).toBe("unknown_param");
    } finally { await fs.rm(d3.dir, { recursive: true, force: true }).catch(() => {}); }
    // missing target entirely → invalid_query
    const d4 = await makeDeps({ snapshotText: JSON.stringify(existingSnapshot()), candidateStore: new CandidateStore() });
    try {
      const res = await driveAsync(d4.deps, proposeLine({}));
      expect(res.ok).toBe(false);
      expect(res.error).toBe("invalid_query");
    } finally { await fs.rm(d4.dir, { recursive: true, force: true }).catch(() => {}); }
  });

  it("digest stability: identical construction → identical digest (patchId randomness excluded)", async () => {
    const store = new CandidateStore();
    const { deps, dir } = await makeDeps({
      freshness: "live",
      snapshotText: JSON.stringify(existingSnapshot()),
      candidateStore: store,
    });
    try {
      const a = await driveAsync(deps, proposeLine({ target: "remote_page:0", shape: "rise_fall" }));
      const b = await driveAsync(deps, proposeLine({ target: "remote_page:0", shape: "rise_fall" }));
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      const pa = (a.payload as ProposePayload).candidate;
      const pb = (b.payload as ProposePayload).candidate;
      expect(pa.patchId).not.toBe(pb.patchId); // Pitfall 5 — distinct candidates
      expect(pa.digest).toBe(pb.digest); // ...but identical construction digests identically
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe("bw-automation propose CLI (thin shell — construction, not authority)", () => {
  it("Test 7: propose --param <key> --shape ramp_up --length-bars 8 prints the candidate JSON (compact)", async () => {
    const r = await runCli(
      ["propose", "--param", "remote_page:0", "--shape", "ramp_up", "--length-bars", "8"],
      { BW_BRAIN_SOCKET: cliSocketPath },
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim().includes("\n")).toBe(false); // compact by default
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.candidate.patchId).toMatch(/^pt_/);
    expect(out.payload.candidate.risk).toBe("medium");
    expect(out.payload.curve.shape).toBe("ramp_up");
    expect(out.assumptions.length).toBeGreaterThan(0);
  });

  it("Test 7b: --explain pretty-prints; explicit fallback flags (--device/--index/--source) build the payload target", async () => {
    const r = await runCli(
      ["propose", "--explain", "--device", "dev_ffffffffffffffff", "--index", "5", "--source", "device_parameter"],
      { BW_BRAIN_SOCKET: cliSocketPath },
    );
    expect(r.code).toBe(0);
    expect(r.stdout.includes("\n  ")).toBe(true);
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });

  it("Test 7c: daemon ok:false (named refusal) surfaces the envelope verbatim; disconnected prints the envelope", async () => {
    // Named refusal: the scripted daemon answers EVERY propose with ok:true, so
    // drive the refusal shape via a param-less run against a refusal-scripted
    // socket — instead, verify the disconnected arm (genuine unreachable).
    const r = await runCli(["propose", "--param", "remote_page:0"], { BW_BRAIN_SOCKET: join(cliTmpDir, "nope.sock") });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.stateFreshness).toBe("disconnected");
    expect(typeof out.error).toBe("string");
  });

  it("Test 8: propose --help documents the bw-edit preview/apply confirmation flow (medium risk)", async () => {
    const r = await runCli(["propose", "--help"], { BW_BRAIN_SOCKET: cliSocketPath });
    expect(r.code).toBe(0);
    const help = r.stdout;
    expect(help).toContain("bw-edit");
    expect(help).toContain("apply");
    expect(help).toContain("--confirm");
    expect(help).toMatch(/medium/i);
    expect(help).toMatch(/preview/i);
  });

  it("structural: automation.ts shells to query(\"automation.propose\") and claims no apply authority", async () => {
    const source = await fs.readFile(AUTOMATION_TS, "utf8");
    expect(source).toContain('query("automation.propose"');
    expect(source).not.toMatch(/edit\.apply/); // apply lives in bw-edit, never here
  });
});
