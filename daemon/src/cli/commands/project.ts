// daemon/src/cli/commands/project.ts
//
// `bw-project summary` + `bw-project region` — project window context as JSON
// (CLI-02). Two subcommands registered under one module. Live: queries the
// daemon UDS via query-client, prints the full CliResult envelope (stateFreshness
// [SC#3] + assumptions[] [UX-06]).
//
// Self-contained: registers + parses process.argv. See focus.ts for the shared
// rationale (one module per process ⇒ no command-name collision).
import { program } from "commander";
import { query } from "../query-client.js";

interface ExplainOpts {
  explain?: boolean;
  start?: string;
  end?: string;
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

const parent = program
  .name("bw-project")
  .description("Project window context as JSON");

parent
  .command("summary")
  .description("Summary of the windowed TrackBank + project metadata")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("project.summary");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

parent
  .command("region")
  .description("Summary of a bounded region [start, end] in beats")
  .option("-s, --start <beats>", "region start in beats")
  .option("-e, --end <beats>", "region end in beats")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    const payload: { start?: number; end?: number } = {};
    if (opts.start !== undefined) payload.start = Number(opts.start);
    if (opts.end !== undefined) payload.end = Number(opts.end);
    try {
      const result = await query("project.region", payload);
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
