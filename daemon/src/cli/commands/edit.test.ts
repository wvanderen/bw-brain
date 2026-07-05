// daemon/src/cli/commands/edit.test.ts
//
// Phase 3 Plan 03-02 Task 2 — CLI contract test for the live `bw-edit`
// preview/apply/revert multicall (D-04 two-step explicit, EDIT-02/04/06).
// RED tests authored before the implementation (TDD).
//
// Pattern authority: daemon/src/cli/cli.test.ts (spawn the REAL command module
// via tsx against a fake daemon UDS server returning canned envelopes). The
// command modules self-parse process.argv + self-exit, so they are exercised
// via child_process.spawn rather than in-process import.
//
// What this tests: the CLI SHAPE (three subcommands forward the right payload
// + flags), the D-04 flag set (--confirm / --force / --allow-below-bar), and
// that error envelopes from the daemon (confirmation_required /
// candidate_not_found / below_bar_requires_confirm) surface verbatim. The
// daemon-side flag-gating LOGIC is exercised end-to-end by the smoke test
// (Task 3); this test pins the CLI contract.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as net from "node:net";
import * as os from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { CliResult } from "../gen/result.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// daemon/ root (src/cli/commands/edit.test.ts → up three).
const DAEMON_ROOT = join(__dirname, "..", "..", "..");
const TSX = join(DAEMON_ROOT, "node_modules", ".bin", "tsx");
const EDIT = join(DAEMON_ROOT, "src", "cli", "commands", "edit.ts");

let socketPath = "";
let server: net.Server | null = null;
let tmpDir = "";

/**
 * The fake daemon implements a SIMPLIFIED edit.* dispatch so the CLI contract
 * is testable without the full daemon boot. Per query: echo back enough to
 * prove the CLI forwarded the right payload, + return canned envelopes that
 * exercise the flag-gating error surface.
 *
 * The mock has NO candidate store, so risk/belowBar are inferred from the
 * patchId naming convention (the real daemon looks these up from the candidate
 * store; the CLI forwards only the patchId). This keeps the CLI contract test
 * self-contained — the daemon-side gating LOGIC is exercised by the smoke test.
 */
interface InboundQuery {
  op?: string;
  payload?: {
    patchId?: string;
    patch?: { risk?: string; belowBar?: boolean; [k: string]: unknown };
    confirm?: boolean;
    force?: boolean;
    allowBelowBar?: boolean;
  };
}

/** Build a canned edit.preview ok envelope. */
function previewOk(patchId: string, risk: string): CliResult {
  return {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { patchId, risk, diff: { notesAdded: [], notesRemoved: [], notesChanged: [] } },
    assumptions: [{ claim: "preview resolved against live clip", confidence: 1.0, source: "selection" }],
  };
}

/** Build a canned edit.apply ok envelope. */
function applyOk(patchId: string): CliResult {
  return {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { ok: true, appliedOps: 2, patchId, undoLabel: `undo-${patchId}` },
    assumptions: [{ claim: "apply.patch round-trip succeeded", confidence: 1.0, source: "selection" }],
  };
}

/** Build a canned edit.revert ok envelope (stamps appliedRevertedAt). */
function revertOk(patchId: string): CliResult {
  return {
    version: "1.0",
    type: "result",
    ok: true,
    stateFreshness: "live",
    payload: { ok: true, patchId, appliedRevertedAt: 9_999 },
    assumptions: [{ claim: "revert replayed inverseOperations", confidence: 1.0, source: "selection" }],
  };
}

/** Build an ok:false envelope (the fail-closed shape the daemon emits). */
function errEnvelope(error: string): CliResult {
  return {
    version: "1.0",
    type: "result",
    ok: false,
    stateFreshness: "live",
    error,
    // CliResult's ok:false arm carries error; the field below keeps this literal
    // schema-compatible for the test's JSON.parse round-trip.
    ...({} as object),
  } as CliResult;
}

/**
 * Build a wrong_clip_targeted envelope matching the EXACT wire shape the real
 * daemon emits via safeSendErr(details) — query-server.ts:872-882. The detail
 * family REPLACES availableFrom (no availableFrom key on the wire for the
 * details family). Plan 03.1-06 closes the D-06 surface gap (Tests 4+5).
 */
function wrongClipEnvelope(opts: {
  expectedClipSid: string;
  actualClipSid: string;
  hint: string;
  freshness?: "live" | "stale" | "disconnected";
}): CliResult {
  return {
    version: "1.0",
    type: "result",
    ok: false,
    stateFreshness: opts.freshness ?? "live",
    error: "wrong_clip_targeted",
    expectedClipSid: opts.expectedClipSid,
    actualClipSid: opts.actualClipSid,
    hint: opts.hint,
    // CliResult's index signature [k:string]: unknown permits the detail fields.
  } as CliResult;
}

/** The fake daemon's simplified edit.* dispatch (mirrors the daemon's gating rules). */
function dispatch(q: InboundQuery): CliResult {
  const op = q.op ?? "";
  if (op === "edit.preview") {
    return previewOk("pt_preview000000000000000000000", "medium");
  }
  if (op === "edit.apply") {
    const p = q.payload ?? {};
    const patchId = p.patchId ?? "";
    // D-06 wrong_clip_targeted — apply path (Test 4). NOTE: differs from the
    // revert branch's expected/actual values so a test that accidentally
    // hardcodes apply values cannot pass the revert assertion.
    if (patchId.startsWith("pt_wrongclipstale")) {
      return wrongClipEnvelope({
        expectedClipSid: "clip_aaaaaaaaaaaaaaaa",
        actualClipSid: "clip_bbbbbbbbbbbbbbbb",
        hint: "re-select the clip you previewed (or re-preview)",
        freshness: "stale",
      });
    }
    if (patchId.startsWith("pt_wrongclip")) {
      return wrongClipEnvelope({
        expectedClipSid: "clip_aaaaaaaaaaaaaaaa",
        actualClipSid: "clip_bbbbbbbbbbbbbbbb",
        hint: "re-select the clip you previewed (or re-preview)",
      });
    }
    // candidate_not_found: an unknown patchId.
    if (patchId === "pt_unknown000000000000000000000") {
      return errEnvelope("candidate_not_found");
    }
    // The mock infers risk/belowBar from the patchId naming convention (no
    // candidate store); the real daemon looks these up from the candidate.
    const isMedRisk = patchId.startsWith("pt_medrisk");
    const isBelowBar = patchId.startsWith("pt_belowbar");
    // belowBar requires --allow-below-bar AND --confirm (D-09 stacking).
    if (isBelowBar && !(p.allowBelowBar && p.confirm)) {
      return errEnvelope("below_bar_requires_confirm");
    }
    // medium/high risk requires --confirm (D-04); --force bypasses.
    if (isMedRisk && !p.confirm && !p.force) {
      return errEnvelope("confirmation_required");
    }
    return applyOk(patchId);
  }
  if (op === "edit.revert") {
    const patchId = q.payload?.patchId ?? "";
    // D-06 wrong_clip_targeted — revert path (Test 5). DIFFERENT field values
    // than the apply branch + the real daemon's revert hint (query-server.ts:770).
    if (patchId.startsWith("pt_wrongclip")) {
      return wrongClipEnvelope({
        expectedClipSid: "clip_cccccccccccccccc",
        actualClipSid: "clip_dddddddddddddddd",
        hint: "re-select the clip you applied this patch to (or use Bitwig ⌘Z)",
      });
    }
    return revertOk(patchId);
  }
  return errEnvelope("not_implemented");
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "bw-edit-test-"));
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

/** Spawn `tsx edit.ts <args>` with the fake-daemon env. */
function runEdit(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [EDIT, ...args], {
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

const fakeDaemonEnv = { BW_BRAIN_SOCKET: socketPath };
void fakeDaemonEnv;

describe("bw-edit preview (EDIT-02, D-04 two-step)", () => {
  it("preview <patchFile> emits {patchId, risk, diff} without applying", async () => {
    const patchFile = join(tmpDir, "patch.json");
    writeFileSync(
      patchFile,
      JSON.stringify({
        scope: { clipSid: "clip_0123456789abcdef" },
        operations: [{ op: "add_note", note: { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.25, velocity: 100 } }],
        rationale: "test",
        reversibility: "self-inverse",
        risk: "low",
        undoLabel: "add a note",
      }),
    );
    const r = await runEdit(["preview", patchFile]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.patchId).toMatch(/^pt_/);
    expect(out.payload.risk).toBeDefined();
    expect(out.payload.diff).toBeDefined();
  });
});

describe("bw-edit apply (EDIT-04/06, D-04/D-09 flag gating)", () => {
  it("apply <patchId> on a medium-risk patch WITHOUT --confirm -> ok:false error:confirmation_required", async () => {
    const r = await runEdit(["apply", "pt_medrisk00000000000000000000"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("confirmation_required");
  });

  it("apply <patchId> --confirm on a medium-risk patch -> ok:true", async () => {
    const r = await runEdit(["apply", "pt_medrisk00000000000000000000", "--confirm"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.appliedOps).toBeGreaterThan(0);
  });

  it("apply <unknown patchId> -> ok:false error:candidate_not_found", async () => {
    const r = await runEdit(["apply", "pt_unknown000000000000000000000", "--confirm"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("candidate_not_found");
  });
});

describe("bw-edit revert (EDIT-05, D-03 daemon-authoritative)", () => {
  it("revert <patchId> -> ok:true + appliedRevertedAt stamped", async () => {
    const r = await runEdit(["revert", "pt_applyme0000000000000000000"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.payload.appliedRevertedAt).toBeDefined();
  });
});

describe("bw-edit fail-closed path (SC#3)", () => {
  it("daemon socket absent -> {ok:false, stateFreshness:disconnected} + exit 0", async () => {
    const env = { BW_BRAIN_SOCKET: join(tmpDir, "no-such.sock") };
    const r = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      const child = spawn(TSX, [EDIT, "preview", join(tmpDir, "patch.json")], {
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

describe("bw-edit wrong_clip_targeted D-06 surface (Tests 4+5 gap closure)", () => {
  it("apply surfaces wrong_clip_targeted with expectedClipSid/actualClipSid/hint + the daemon's real stateFreshness (Test 4)", async () => {
    const r = await runEdit(["apply", "pt_wrongclip_apply_path_0001"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("wrong_clip_targeted");
    expect(out.expectedClipSid).toBe("clip_aaaaaaaaaaaaaaaa");
    expect(out.actualClipSid).toBe("clip_bbbbbbbbbbbbbbbb");
    expect(out.hint).toMatch(/re-select|re-preview/i);
    // The critical D-06 assertion: the CLI relays the daemon's REAL freshness
    // (live), NOT the hardcoded disconnected stub the current printConnectionError
    // emits. This fails against the pre-fix CLI and passes after Task 2.
    expect(out.stateFreshness).toBe("live");
  });

  it("revert surfaces wrong_clip_targeted with the detail fields + real stateFreshness (Test 5)", async () => {
    const r = await runEdit(["revert", "pt_wrongclip_revert_path_001"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("wrong_clip_targeted");
    // Revert-branch values (clip_ccc.../clip_ddd...) — distinct from the apply
    // branch so accidental hardcoding of apply values cannot pass this test.
    expect(out.expectedClipSid).toBe("clip_cccccccccccccccc");
    expect(out.actualClipSid).toBe("clip_dddddddddddddddd");
    expect(out.hint).toMatch(/re-select|⌘Z/i);
    expect(out.stateFreshness).toBe("live");
  });

  it("apply wrong_clip_targeted relays stateFreshness:stale honestly (D-10 — stale is trustworthy, not disconnected)", async () => {
    const r = await runEdit(["apply", "pt_wrongclipstale_apply_0001"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.error).toBe("wrong_clip_targeted");
    expect(out.expectedClipSid).toBe("clip_aaaaaaaaaaaaaaaa");
    expect(out.actualClipSid).toBe("clip_bbbbbbbbbbbbbbbb");
    expect(out.hint).toMatch(/re-select|re-preview/i);
    // Regression guard: the CLI must relay the daemon's actual freshness rather
    // than assuming live-or-disconnected only. The watchdog's stale state is
    // trustworthy per D-10; the CLI must not paper over it.
    expect(out.stateFreshness).toBe("stale");
  });
});
