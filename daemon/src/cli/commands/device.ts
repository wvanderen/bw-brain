// daemon/src/cli/commands/device.ts
//
// `bw-device` — device chain inspection (incl. VST/AU plugins) + advisory
// macro/XY suggestions. Live commands over the daemon UDS via query-client,
// printing the full CliResult envelope (stateFreshness [SC#3] + assumptions[]
// [UX-06]):
//   inspect         — CLI-03, D-02: chain/parameters of the selected device.
//   macros-suggest  — AUTO-02 (05-07): ranked macro/XY-pair suggestions from
//                     observed expressiveness — ADVISORY ONLY (D-05-09); the
//                     producer wires macros by hand.
//
// Pattern authority: daemon/src/cli/commands/arrange.ts (the thin-shell
// subcommand shape — Plan 05-07 Task 2). No business logic in the CLI (all
// reasoning in the daemon): query(), --refresh, --explain,
// printConnectionError.
//
// Self-contained: registers + parses process.argv. (midi.ts also exposes an
// `inspect` action — no collision because only one module is loaded per process.)
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
  .name("bw-device")
  .description("Device chain inspection + advisory macro/XY suggestions (incl. VST/AU plugins)")
  .command("inspect")
  .description("Return chain/parameters of the selected device as JSON")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("device.inspect");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- macros-suggest (AUTO-02 — advisory macro/XY candidates, D-05-09/11/12) -
program
  .command("macros-suggest")
  .description("Ranked macro/XY-pair suggestions from observed expressiveness (advisory only — AUTO-02)")
  .option("--refresh", "re-analyze the live folded parameter movement before suggesting")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: RefreshOpts) => {
    try {
      const result = await query("device.macros_suggest", { refresh: opts.refresh ?? false });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
