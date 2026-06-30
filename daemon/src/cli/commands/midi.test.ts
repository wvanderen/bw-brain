// daemon/src/cli/commands/midi.test.ts
//
// Phase 3 Plan 03-04 Task 2 — CLI contract test for `bw-midi` extended with the
// 4 transform subcommands (vary/counterline/voice-leading-fix/humanize).
//
// Pattern authority: daemon/src/cli/commands/edit.test.ts (spawn the REAL
// command module via tsx against a fake daemon UDS server returning canned
// envelopes). The command modules self-parse process.argv + self-exit, so they
// are exercised via child_process.spawn rather than in-process import.
//
// What this tests: the CLI SHAPE (four subcommands forward the right op +
// print the result envelope as JSON), the vary 3-candidate array shape, and
// that a refused candidate envelope carries status:refused + the near-miss
// score. The daemon-side BLOCKER-01 logic (handleMidiVary classifyRisk
// re-validation + the candidate-store risk:high/belowBar:true stamping) is
// pinned by the midi.* dispatch tests in query-server.test.ts (the canonical
// home for dispatch tests — they can introspect the candidate store, which the
// CLI envelope cannot).
//
// RED: authored BEFORE midi.ts is extended. The subcommands don't exist →
// commander exits non-zero / prints help → the assertions fail.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as net from "node:net";
import * as os from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import type { CliResult } from "../gen/result.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = join(__dirname, "..", "..", "..");
const TSX = join(DAEMON_ROOT, "node_modules", ".bin", "tsx");
const MIDI = join(DAEMON_ROOT, "src", "cli", "commands", "midi.ts");

let socketPath = "";
let server: net.Server | null = null;
let tmpDir = "";

/** The fake daemon's per-query canned dispatch (mirrors edit.test.ts shape). */
interface InboundQuery {
  op?: string;
}

/** A vary candidate envelope slice (what the real daemon returns from midi.vary). */
interface VaryCandidateEnvelope {
  label: "A" | "B" | "C";
  description: string;
  patchId: string;
  risk: string;
  motifSimilarity: number;
  status?: "refused";
}

/** Build a 3-candidate vary payload (one refused to exercise the below-bar surface). */
function varyPayload(): VaryCandidateEnvelope[] {
  return [
    { label: "A", description: "rhythmic displacement", patchId: "pt_aaaaaaaaaaaaaaaaaaaaaaaa", risk: "medium", motifSimilarity: 0.92 },
    { label: "B", description: "interval contraction", patchId: "pt_bbbbbbbbbbbbbbbbbbbbbbbb", risk: "high", motifSimilarity: 0.78, status: "refused" },
    { label: "C", description: "octave overlay", patchId: "pt_cccccccccccccccccccccccc", risk: "medium", motifSimilarity: 0.95 },
  ];
}

/** Build a single-candidate payload for counterline/voice-leading-fix/humanize. */
function singleCandidatePayload(name: string): object {
  return {
    patchId: `pt_${name}000000000000000000000`,
    risk: name === "voice_leading_fix" || name === "humanize" ? "low" : "medium",
    operations: 2,
    motifSimilarity: 0.9,
  };
}

function okEnvelope(payload: object, assumptions: Array<{ claim: string; confidence: number; source: string }>): CliResult {
  return {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload,
    assumptions,
  };
}

function dispatch(q: InboundQuery): CliResult {
  const op = q.op ?? "";
  if (op === "midi.vary") {
    return okEnvelope({ candidates: varyPayload() }, [
      { claim: "vary ran against the live clip", confidence: 1.0, source: "selection" },
      { claim: "harmonicCenter: inferred C major, confidence 0.9", confidence: 0.9, source: "default" },
    ]);
  }
  if (op === "midi.counterline") {
    return okEnvelope(singleCandidatePayload("counterline"), [
      { claim: "counterline ran against the live clip", confidence: 1.0, source: "selection" },
    ]);
  }
  if (op === "midi.voice_leading_fix") {
    return okEnvelope(singleCandidatePayload("voice_leading_fix"), [
      { claim: "voice-leading-fix ran against the live clip", confidence: 1.0, source: "selection" },
    ]);
  }
  if (op === "midi.humanize") {
    return okEnvelope(singleCandidatePayload("humanize"), [
      { claim: "humanize ran against the live clip", confidence: 1.0, source: "selection" },
    ]);
  }
  return {
    version: "1.0",
    type: "result",
    ok: false,
    stateFreshness: "live",
    error: "not_implemented",
  } as CliResult;
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "bw-midi-test-"));
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
          let query: InboundQuery;
          try {
            query = JSON.parse(line);
          } catch {
            continue;
          }
          conn.write(`${JSON.stringify(dispatch(query))}\n`);
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

/** Spawn `tsx midi.ts <args>` with the fake-daemon socket env. */
function runMidi(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [MIDI, ...args], {
      env: { ...process.env, BW_BRAIN_SOCKET: socketPath },
      cwd: DAEMON_ROOT,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

describe("bw-midi vary (MIDI-02 — 3 A/B/C candidates)", () => {
  it("vary -> ok:true + 3 candidates each with label/patchId/risk/motifSimilarity", async () => {
    const r = await runMidi(["vary"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.stateFreshness).toBe("live");
    const candidates = out.payload.candidates as VaryCandidateEnvelope[];
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.label).sort()).toEqual(["A", "B", "C"]);
    for (const c of candidates) {
      expect(c.patchId).toMatch(/^pt_/);
      expect(["low", "medium", "high"]).toContain(c.risk);
      expect(Number.isFinite(c.motifSimilarity)).toBe(true);
    }
  });

  it("vary stamps the inferred-harmony assumption in the envelope (D-12)", async () => {
    const r = await runMidi(["vary"]);
    const out = JSON.parse(r.stdout);
    const claims = (out.assumptions as Array<{ claim: string }>).map((a) => a.claim);
    expect(claims.some((c) => c.includes("harmonicCenter: inferred"))).toBe(true);
  });

  it("a refused vary candidate carries status:refused + the near-miss score", async () => {
    const r = await runMidi(["vary"]);
    const out = JSON.parse(r.stdout);
    const candidates = out.payload.candidates as VaryCandidateEnvelope[];
    const refused = candidates.find((c) => c.status === "refused");
    expect(refused).toBeDefined();
    expect(Number.isFinite(refused!.motifSimilarity)).toBe(true);
  });
});

describe("bw-midi counterline (MIDI-03 — single candidate)", () => {
  it("counterline -> ok:true + one candidate with patchId/risk", async () => {
    const r = await runMidi(["counterline"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.patchId).toMatch(/^pt_/);
    expect(out.payload.risk).toBeDefined();
  });
});

describe("bw-midi voice-leading-fix (MIDI-04 — single candidate, cleanup tier)", () => {
  it("voice-leading-fix -> ok:true + one low-risk candidate", async () => {
    const r = await runMidi(["voice-leading-fix"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.patchId).toMatch(/^pt_/);
    expect(out.payload.risk).toBe("low");
  });
});

describe("bw-midi humanize (MIDI-05 — single candidate, cleanup tier)", () => {
  it("humanize -> ok:true + one low-risk candidate", async () => {
    const r = await runMidi(["humanize"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.patchId).toMatch(/^pt_/);
    expect(out.payload.risk).toBe("low");
  });
});

describe("bw-midi fail-closed path (SC#3)", () => {
  it("daemon socket absent -> {ok:false, stateFreshness:disconnected} + exit 0", async () => {
    const env = { BW_BRAIN_SOCKET: join(tmpDir, "no-such.sock") };
    const r = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      const child = spawn(TSX, [MIDI, "vary"], {
        env: { ...process.env, ...env },
        cwd: DAEMON_ROOT,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => (stdout += c.toString()));
      child.stderr.on("data", (c) => (stderr += c.toString()));
      child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
    });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.stateFreshness).toBe("disconnected");
  });
});
