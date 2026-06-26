#!/usr/bin/env node
// daemon/src/cli/dump.ts
//
// `bw-brain-spike dump` — D-08 raw proof print (RESEARCH.md lines 24, 173;
// 01-CONTEXT.md D-08). Prints the next received VALIDATED message as JSON to
// stdout and exits 0. This is SC#1's daemon half, proven autonomously with an
// INJECTED message — no Bitwig needed:
//
//   printf '{"version":"1.0","type":"selection.changed",...}\n' \
//     | npx tsx src/cli/dump.ts --transport stdio
//
// The message is reassembled (LineBuffer), Ajv-validated against the frozen
// envelope (reader.ts), and only THEN printed — malformed/invalid lines are
// dropped, not crashed. Phase 2 designs the real bw-focus / bw-project commands
// fresh against the frozen schema; keep this bare (D-08: no pretense of being a
// real command).

import { program } from "commander";
import { TcpServerTransport } from "../transport/tcp.js";
import { StdioTransport } from "../transport/stdio.js";
import { createReader } from "../protocol/reader.js";

interface DumpOpts {
  port: string;
  transport: string;
}

program
  .name("bw-brain-spike")
  // dump is the default command so `dump.ts --transport stdio` (no subcommand
  // word) works — that is exactly the shape of the autonomous proof invocation.
  .command("dump", { isDefault: true })
  .description(
    "Print the next received validated message as JSON and exit 0 (proof of pipe).",
  )
  .option("-p, --port <number>", "TCP port (used when --transport=tcp)", "7878")
  .option("-t, --transport <tcp|stdio>", "transport: tcp (default) | stdio", "tcp")
  .action((opts: DumpOpts) => {
    // Handler: on the FIRST validated message, print it as JSON and exit 0.
    // The write callback flushes before exit so piped stdout is never truncated.
    const handler = (msg: unknown): void => {
      process.stdout.write(`${JSON.stringify(msg)}\n`, () => process.exit(0));
    };

    if (opts.transport === "stdio") {
      createReader(new StdioTransport(), handler);
      return;
    }

    // Default / tcp: listen on the loopback address only (TcpServerTransport
    // enforces the Pitfall 5 invariant). A real Bitwig extension connects and
    // sends (Plan 03 live run); the autonomous proof uses --transport stdio.
    const port = Number.parseInt(opts.port, 10);
    if (!Number.isFinite(port)) {
      program.error(`invalid --port: ${opts.port}`);
    }
    createReader(new TcpServerTransport({ port }), handler);
  });

program.parse();
