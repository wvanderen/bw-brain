// daemon/src/cli/commands/device.ts
//
// `bw-device inspect` — selected device chain/parameters (incl. VST/AU plugins)
// as JSON (CLI-03, D-02). Live command: queries the daemon UDS via query-client,
// prints the full CliResult envelope (stateFreshness [SC#3] + assumptions[] [UX-06]).
//
// Self-contained: registers + parses process.argv. (midi.ts also exposes an
// `inspect` action — no collision because only one module is loaded per process.)
import { program } from "commander";
import { query } from "../query-client.js";

interface ExplainOpts {
  explain?: boolean;
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
  .description("Device chain inspection (incl. VST/AU plugins)")
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

program.parse(process.argv);
