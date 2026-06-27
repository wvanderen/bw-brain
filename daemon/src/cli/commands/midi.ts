// daemon/src/cli/commands/midi.ts
//
// `bw-midi inspect` — selected clip notes/velocity/timing as JSON (CLI-03).
// Live command: queries the daemon UDS via query-client, prints the full
// CliResult envelope (stateFreshness [SC#3] + assumptions[] [UX-06]).
//
// Self-contained: registers + parses process.argv. (device.ts also exposes an
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
  .name("bw-midi")
  .description("MIDI clip inspection")
  .command("inspect")
  .description("Return notes/velocity/timing of the selected clip as JSON")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("midi.inspect");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
