// daemon/src/cli/cli.test.ts
//
// CLI contract test suite (D-12 — the CLI contract is the testable boundary Pi
// relies on). Exercises the REAL net.createConnection UDS path against a fake
// daemon (option (a) from 02-04-PLAN.md Task 2: end-to-end fidelity) and the REAL
// multicall dispatch via child-process invocation.
//
// Covers: multicall dispatch (shim + git-style reach the same handler), the 5
// live commands (mock daemon → compact JSON + exit 0 + assumptions[] [UX-06]),
// the 3 stubs (not_implemented JSON + exit 0 + correct availableFrom), --explain
// pretty-printing, the daemon-error / socket-absent fail-closed path
// ({ok:false, stateFreshness:"disconnected"} [SC#3]), and bw-diff (pure, SC#1).
//
// The command modules self-parse process.argv + call process.exit, so they are
// exercised via child_process.spawn (with the local tsx binary) rather than
// in-process import — that accumulation on commander's singleton program + the
// self-exit would break an in-process suite.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as net from "node:net";
import * as os from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, symlinkSync, rmSync, writeFileSync } from "node:fs";
import type { CliResult } from "../gen/result.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// daemon/ root (src/cli/cli.test.ts → up two).
const DAEMON_ROOT = join(__dirname, "..", "..");
const TSX = join(DAEMON_ROOT, "node_modules", ".bin", "tsx");
const BW_BRAIN = join(DAEMON_ROOT, "src", "cli", "bw-brain.ts");
const COMMANDS = join(DAEMON_ROOT, "src", "cli", "commands");

/** Scripted results the fake daemon returns per op. */
const SCRIPTED: Record<string, CliResult> = {
  "focus.export": {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { track: "Kick", clip: "Loop A", device: "Reverb", transport: { playing: true } },
    assumptions: [{ claim: "selection read from live cursor", confidence: 1.0, source: "selection" }],
  },
  "project.summary": {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { trackCount: 8, name: "Demo" },
    assumptions: [{ claim: "windowed TrackBank snapshot", confidence: 1.0, source: "selection" }],
  },
  "project.region": {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { start: 0, end: 16 },
    assumptions: [{ claim: "bounded region [0,16]", confidence: 1.0, source: "selection" }],
  },
  "midi.inspect": {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { notes: 32 },
    assumptions: [{ claim: "NoteStep dump of selected clip", confidence: 1.0, source: "selection" }],
  },
  "device.inspect": {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { chain: ["Reverb", "EQ+"], plugins: ["Vital"] },
    assumptions: [{ claim: "CursorRemoteControlsPage walk incl. VST/AU", confidence: 1.0, source: "selection" }],
  },
};

let socketPath = "";
let server: net.Server | null = null;
let tmpDir = "";

beforeAll(async () => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "bw-cli-test-"));
  socketPath = join(tmpDir, "daemon.sock");
  await new Promise<void>((resolve) => {
    server = net.createServer((conn) => {
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
          const result = SCRIPTED[query.op ?? ""] ?? {
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
    server.listen(socketPath, resolve);
  });
});

afterAll(() => {
  server?.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Spawn `tsx <module> <args>` with the given env; resolve {stdout, stderr, code}. */
function runCli(modulePath: string, args: string[], env: Record<string, string>): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [modulePath, ...args], {
      env: { ...process.env, ...env },
      cwd: DAEMON_ROOT,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

/** Default env pointing the query client at the fake daemon socket. */
const fakeDaemonEnv = (): Record<string, string> => ({ BW_BRAIN_SOCKET: socketPath });

describe("CLI contract — multicall dispatch (D-06)", () => {
  it("git-style `bw-brain focus export` reaches the focus handler", async () => {
    const r = await runCli(BW_BRAIN, ["focus", "export"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.stateFreshness).toBe("live");
    expect(out.payload.track).toBe("Kick");
  });

  it("shim `bw-focus export` (symlink) reaches the SAME focus handler", async () => {
    // Simulate `npm link`: a symlink named `bw-focus` → bw-brain.ts.
    const shim = join(tmpDir, "bw-focus");
    symlinkSync(BW_BRAIN, shim);
    const r = await runCli(shim, ["export"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.track).toBe("Kick");
    // Same handler as git-style → identical result shape.
    expect(out.assumptions.length).toBeGreaterThan(0);
  });

  it("git-style `bw-brain diff` reaches the diff handler (pure, no daemon)", async () => {
    const a = join(tmpDir, "a.json");
    const b = join(tmpDir, "b.json");
    writeFileSync(
      a,
      JSON.stringify({ notes: [{ key: "n1", pitch: 60, start: 0, length: 0.5, velocity: 100 }] }),
    );
    writeFileSync(
      b,
      JSON.stringify({ notes: [{ key: "n1", pitch: 60, start: 0, length: 0.5, velocity: 127 }] }),
    );
    const r = await runCli(BW_BRAIN, ["diff", a, b], {});
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.diff.notesChanged.length).toBe(1);
    expect(out.assumptions.length).toBeGreaterThan(0);
  });

  it("top-level `bw-brain --help` prints the multicall help (no module loaded)", async () => {
    const r = await runCli(BW_BRAIN, ["--help"], {});
    expect(r.stdout).toContain("bw-brain");
    expect(r.stdout).toContain("bw-focus export");
    expect(r.stdout).toContain("bw-automation");
  });
});

describe("CLI contract — 5 live commands (CLI-02/03, D-05)", () => {
  it("bw-focus export → JSON + exit 0 + assumptions[] (UX-06)", async () => {
    const r = await runCli(join(COMMANDS, "focus.ts"), ["export"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.stateFreshness).toBe("live");
    expect(Array.isArray(out.assumptions)).toBe(true);
    expect(out.assumptions.length).toBeGreaterThan(0);
    expect(out.assumptions[0]).toHaveProperty("claim");
    expect(out.assumptions[0]).toHaveProperty("confidence");
    expect(out.assumptions[0]).toHaveProperty("source");
  });

  it("bw-project summary → JSON + exit 0", async () => {
    const r = await runCli(join(COMMANDS, "project.ts"), ["summary"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).payload.name).toBe("Demo");
  });

  it("bw-project region -s 0 -e 16 → forwards payload + JSON", async () => {
    const r = await runCli(join(COMMANDS, "project.ts"), ["region", "-s", "0", "-e", "16"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.end).toBe(16);
  });

  it("bw-midi inspect → JSON + exit 0 + assumptions[]", async () => {
    const r = await runCli(join(COMMANDS, "midi.ts"), ["inspect"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).payload.notes).toBe(32);
  });

  it("bw-device inspect → JSON + exit 0 + assumptions[] (CLI-03, incl. VST/AU)", async () => {
    const r = await runCli(join(COMMANDS, "device.ts"), ["inspect"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.payload.plugins).toEqual(["Vital"]);
    expect(out.assumptions.length).toBeGreaterThan(0);
  });

  it("compact output is single-line without --explain", async () => {
    const r = await runCli(join(COMMANDS, "focus.ts"), ["export"], fakeDaemonEnv());
    expect(r.stdout.trim().includes("\n")).toBe(false);
  });
});

describe("CLI contract --explain pretty-prints (CLI-01)", () => {
  it("--explain produces 2-space-indented (multi-line) JSON", async () => {
    const r = await runCli(join(COMMANDS, "focus.ts"), ["export", "--explain"], fakeDaemonEnv());
    expect(r.code).toBe(0);
    expect(r.stdout.includes("\n  ")).toBe(true); // 2-space indent present
    // Still valid JSON.
    expect(JSON.parse(r.stdout).ok).toBe(true);
  });
});

describe("CLI contract — 2 stubs (CLI-01, D-05; bw-edit went live in M2 Plan 03-02)", () => {
  it("bw-edit with no subcommand prints help (live multicall — was a stub pre-M2)", async () => {
    // bw-edit replaced its M1 stub with live preview/apply/revert subcommands
    // (Plan 03-02 Task 2). With no subcommand, commander prints help to stderr
    // + exits 1 (its standard "missing command" behavior). The dedicated
    // edit.test.ts covers the live subcommand contract.
    const r = await runCli(join(COMMANDS, "edit.ts"), [], {});
    expect(r.code).toBe(1); // commander's missing-subcommand exit code
    // Help output mentions the live subcommands (not a not_implemented stub).
    const helpText = r.stdout + r.stderr;
    expect(helpText).toContain("preview");
    expect(helpText).toContain("apply");
  });

  it("bw-arrange → not_implemented JSON, availableFrom M3, exit 0", async () => {
    const r = await runCli(join(COMMANDS, "arrange.ts"), [], {});
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.availableFrom).toBe("M3");
  });

  it("bw-automation → not_implemented JSON, availableFrom M4, exit 0", async () => {
    const r = await runCli(join(COMMANDS, "automation.ts"), [], {});
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.availableFrom).toBe("M4");
  });
});

describe("CLI contract — fail-closed paths (SC#3, T-2-04-D)", () => {
  it("socket absent → {ok:false, stateFreshness:disconnected} + exit 0 (not a crash)", async () => {
    // Point at a socket that does not exist → connection ENOENT.
    const env = { BW_BRAIN_SOCKET: join(tmpDir, "does-not-exist.sock") };
    const r = await runCli(join(COMMANDS, "focus.ts"), ["export"], env);
    expect(r.code).toBe(0); // CLI-01: exits 0 so shell pipelines survive
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.stateFreshness).toBe("disconnected");
    expect(out.error).toContain("daemon socket not reachable");
  });

  it("daemon returns ok:false → propagated as an error envelope + exit 0", async () => {
    // Stand up a one-shot daemon that returns a not_implemented-style ok:false.
    const errSock = join(tmpDir, "err.sock");
    await new Promise<void>((resolve) => {
      const s = net.createServer((conn) => {
        conn.setEncoding("utf8");
        conn.on("data", () => {
          conn.write(
            JSON.stringify({
              version: "1.0",
              type: "result",
              ok: false,
              error: "not_implemented",
              availableFrom: "M3",
            }) + "\n",
          );
        });
      });
      s.listen(errSock, () => {
        resolve();
        // close after the test interaction; cleanup is best-effort.
        setTimeout(() => s.close(), 2000);
      });
    });
    const r = await runCli(join(COMMANDS, "focus.ts"), ["export"], { BW_BRAIN_SOCKET: errSock });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    // query() rejects with an Error; the command wraps it in the fail-closed envelope.
    expect(out.stateFreshness).toBe("disconnected");
    expect(out.error).toContain("not_implemented");
  });
});
