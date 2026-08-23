// daemon/src/cli/commands/automation.ts
//
// `bw-automation` — automation & device workflows (M4). Live multicall over
// the daemon UDS:
//   inspect — AUTO-01: ranked per-parameter salience built from observed
//             live movement (D-05-01 — never automation-envelope reads),
//             served with pulledAt freshness honesty (D-05-04).
//   propose — AUTO-03: designate a salience-listed param (or an explicit
//             unobserved fallback) + optional curve overrides → a bounded
//             six-shape medium-risk candidate (D-05-13/14/15). CONSTRUCTION
//             ONLY: approval/apply/revert ride the EXISTING bw-edit spine —
//             this CLI adds no apply authority (RB-04).
//
// Pattern authority: daemon/src/cli/commands/arrange.ts (the stub→live
// multicall shape — Plan 04-05 Task 3; copied per 05-04 Task 3, extended per
// 05-08 Task 2 with edit.ts's printResultOrDisconnect discipline so daemon
// named refusals surface verbatim — the 03.1 P06 pattern). Each subcommand is
// a thin shell — no business logic (all reasoning in the daemon): query(),
// --explain, printResultOrDisconnect/printConnectionError.
//
// Self-contained: registers + parses process.argv.

import { program } from "commander";
import { query, DaemonReplyError } from "../query-client.js";

interface ExplainOpts {
  explain?: boolean;
}

interface RefreshOpts extends ExplainOpts {
  refresh?: boolean;
}

interface ProposeOpts extends ExplainOpts {
  param?: string;
  device?: string;
  index?: string;
  source?: string;
  shape?: string;
  depth?: string;
  rate?: string;
  lengthBars?: string;
  startBar?: string;
}
/**
 * Catch-block dispatcher (edit.ts:44-50 — Pitfall 8 ONE helper): a daemon
 * ok:false (e.g. unknown_param, invalid_curve_spec, no_snapshot) prints the
 * envelope VERBATIM; a genuine daemon-unreachable falls through to the
 * disconnected envelope (SC#3).
 */
function printResultOrDisconnect(e: unknown, explain?: boolean): void {
  if (e instanceof DaemonReplyError) {
    process.stdout.write(`${JSON.stringify(e.envelope, null, explain ? 2 : 0)}\n`);
  } else {
    printConnectionError((e as Error).message, explain);
  }
}

function printConnectionError(message: string, explain?: boolean): void {
  const envelope = {
    version: "1.0",
    type: "result" as const,
    ok: false,
    error: message,
    stateFreshness: "disconnected" as const,
  };
  process.stdout.write(`${JSON.stringify(envelope, null, explain ? 2 : 0)}\n`);
}

program
  .name("bw-automation")
  .description("Automation & device workflows (M4)");

// --- inspect (AUTO-01 — ranked salience from observed movement) -----------
program
  .command("inspect")
  .description("Ranked per-parameter automation salience from observed movement (AUTO-01)")
  .option("--refresh", "re-analyze the live folded parameter movement before serving")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: RefreshOpts) => {
    try {
      const result = await query("automation.inspect", { refresh: opts.refresh ?? false });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printResultOrDisconnect(e, opts.explain);
    }
  });

// --- propose (AUTO-03 — bounded curve candidate; construction only) -------
//
// The preview→confirm→apply→revert flow REUSES bw-edit (medium risk, D-05-10):
//   1. `bw-automation propose --param <key> [--shape ... --length-bars ...]`
//      mints an ephemeral candidate and prints its patchId, digest, rationale,
//      and the preview points summary (the curve itself IS the preview).
//   2. `bw-edit apply <patchId> --confirm` applies it (medium risk requires
//      the explicit confirm; the daemon enforces the gate server-side).
//   3. `bw-edit revert <patchId>` replays the author-aware inverse (the
//      capturedPriorValue journal entry — D-05-07).
// This CLI NEVER applies, approves, or arms — it adds construction, not
// authority (RB-04).
program
  .command("propose")
  .description("Propose a bounded automation curve candidate for a salience-listed param (AUTO-03, medium risk)")
  .option("--param <key>", "paramKey from `bw-automation inspect` (e.g. remote_page:0) — the salience-designated target")
  .option("--device <sid>", "explicit unobserved target: deviceSid (dev_+16 hex) — the browsable fallback (D-05-15)")
  .option("--index <n>", "explicit target parameter index 0..127 (with --device/--source)")
  .option("--source <source>", "explicit target source: device_parameter | remote_page (with --device/--index)")
  .option("--shape <shape>", "ramp_up|ramp_down|dip_recover|rise_fall|slow_cycle|hold_then_move (default: profile-biased first)")
  .option("--depth <v>", "curve depth 0..1 (default: profile depthRange midpoint)")
  .option("--rate <v>", "cycle rate per bar, > 0 (default: profile rateRange midpoint)")
  .option("--length-bars <n>", "region length in bars, integer 1..16 (default 4)")
  .option("--start-bar <n>", "region start bar, integer ≥ 0 (default 0)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .addHelpText(
    "after",
    [
      "",
      "Preview + apply flow (medium risk — confirmation is mandatory):",
      "  1. propose (this command) mints an ephemeral candidate — the returned",
      "     curve.points ARE the preview (bounded ≤ 64 points, values 0..1).",
      "  2. apply:   bw-edit apply <patchId> --confirm   (medium risk, D-05-10)",
      "  3. revert:  bw-edit revert <patchId>            (author-aware inverse)",
      "",
      "This CLI adds construction, not authority — approve/apply/revert live in bw-edit.",
    ].join("\n"),
  )
  .action(async (opts: ProposeOpts) => {
    const num = (v: string | undefined): number | undefined => {
      if (v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    // Target: designated paramKey OR the explicit unobserved fallback triple
    // (--device/--index/--source). Validation stays daemon-side (INV-10 — a
    // partial/absent target surfaces the daemon's invalid_query refusal).
    let target: string | Record<string, unknown> | undefined;
    if (opts.param !== undefined) {
      target = opts.param;
    } else if (opts.device !== undefined || opts.index !== undefined || opts.source !== undefined) {
      target = {
        deviceKey: opts.device,
        paramIndex: num(opts.index),
        paramSource: opts.source,
      };
    }
    const payload: Record<string, unknown> = { ...(target !== undefined ? { target } : {}) };
    if (opts.shape !== undefined) payload.shape = opts.shape;
    if (opts.depth !== undefined) payload.depth = num(opts.depth);
    if (opts.rate !== undefined) payload.rate = num(opts.rate);
    if (opts.lengthBars !== undefined) payload.lengthBars = num(opts.lengthBars);
    if (opts.startBar !== undefined) payload.startBar = num(opts.startBar);
    try {
      const result = await query("automation.propose", payload);
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printResultOrDisconnect(e, opts.explain);
    }
  });

program.parse(process.argv);
