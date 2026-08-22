// daemon/src/cli/commands/automation.ts
//
// `bw-automation` — automation & device workflows (M4). Live multicall over
// the daemon UDS (the M1 stub went live in Plan 05-04):
//   inspect — AUTO-01: ranked per-parameter salience built from observed
//             live movement (D-05-01 — never automation-envelope reads),
//             served with pulledAt freshness honesty (D-05-04).
//
// Pattern authority: daemon/src/cli/commands/arrange.ts (the stub→live
// multicall shape — Plan 04-05 Task 3; copied per 05-04 Task 3). Each
// subcommand is a thin shell — no business logic (all reasoning in the
// daemon): query(), --refresh, --explain, printConnectionError.
//
// Self-contained: registers + parses process.argv.

import { program } from "commander";
import { query } from "../query-client.js";

interface ExplainOpts {
  explain?: boolean;
}

interface RefreshOpts extends ExplainOpts {
  refresh?: boolean;
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
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
