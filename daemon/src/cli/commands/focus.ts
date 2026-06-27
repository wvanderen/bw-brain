// daemon/src/cli/commands/focus.ts
//
// `bw-focus export` — selected track/clip/device + transport as JSON (CLI-02).
// Live command: queries the daemon UDS via query-client and prints the full
// CliResult envelope (carries stateFreshness [SC#3] + assumptions[] [UX-06]).
//
// Self-contained: registers + parses process.argv. The multicall entry loads
// exactly one command module per invocation, so there is no command-name
// collision with the other tools (e.g. midi/device both expose `inspect`).
//
// CLI-01: exits 0 on BOTH success and daemon-unreachable — the JSON envelope's
// ok flag IS the clear failure signal; non-zero would break shell pipelines
// (T-2-04-D mitigation). When the socket is absent, prints a fail-closed
// {ok:false, stateFreshness:"disconnected"} envelope.
import { program } from "commander";
import { query } from "../query-client.js";

interface ExplainOpts {
  explain?: boolean;
}

/** Print a fail-closed envelope for a daemon-connection failure (SC#3 disconnected). */
function printConnectionError(message: string, explain?: boolean): void {
  const envelope = {
    version: "1.0",
    type: "result" as const,
    ok: false,
    error: message,
    // SC#3: the daemon is unreachable → the freshest state we can claim is
    // "disconnected". (availableFrom is intentionally omitted — this is a
    // runtime connection error, not a not_implemented stub; the result.schema
    // allOf availableFrom requirement scopes to daemon-emitted stubs.)
    stateFreshness: "disconnected" as const,
  };
  process.stdout.write(`${JSON.stringify(envelope, null, explain ? 2 : 0)}\n`);
}

program
  .name("bw-focus")
  .description("Return the selected track/clip/device + transport as JSON")
  .command("export")
  .description("Export the current focus (selected track/clip/device + transport)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("focus.export");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
