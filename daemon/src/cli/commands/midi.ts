// daemon/src/cli/commands/midi.ts
//
// `bw-midi` — MIDI clip inspection + creative/cleanup transforms (M2). Live
// multicall over the daemon UDS. `inspect` returns the selected clip's notes;
// `vary`/`counterline`/`voice-leading-fix`/`humanize` mint candidate patches
// (D-05 patchIds) the producer applies via Plan 02's `bw-edit apply`.
//
// Pattern authority: daemon/src/cli/commands/edit.ts (the live multicall shape)
// + daemon/src/cli/query-client.ts (the UDS thin client). Five subcommands:
//   inspect            — query midi.inspect, emit {clips:[...]}
//   vary               — query midi.vary, emit {candidates:[A,B,C]} (MIDI-02)
//   counterline        — query midi.counterline, emit {patchId,risk,...} (MIDI-03)
//   voice-leading-fix  — query midi.voice_leading_fix, emit {patchId,risk,...} (MIDI-04)
//   humanize           — query midi.humanize, emit {patchId,risk,...} (MIDI-05)
//
// Self-contained: registers + parses process.argv.

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
  .description("MIDI clip inspection + creative/cleanup transforms");

// --- inspect (CLI-03, original M1 subcommand) ---------------------------
program
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

// --- vary (MIDI-02 — 3 motif-preserving A/B/C candidate patches) --------
// Creative tier. Returns an array of 3 candidates; each carries a patchId the
// producer applies via `bw-edit apply <patchId>`. Below-bar candidates carry
// status:"refused" + the near-miss score (applying requires --allow-below-bar).
program
  .command("vary")
  .description("Generate 3 motif-preserving A/B/C candidate variants (MIDI-02)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("midi.vary");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- counterline (MIDI-03 — companion voice candidate patch) ------------
program
  .command("counterline")
  .description("Generate a companion-voice candidate patch (MIDI-03)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("midi.counterline");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- voice-leading-fix (MIDI-04 — low-risk cleanup candidate patch) -----
program
  .command("voice-leading-fix")
  .description("Generate a voice-leading-fix cleanup candidate patch (MIDI-04)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("midi.voice_leading_fix");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- humanize (MIDI-05 — velocity/timing humanization candidate patch) --
program
  .command("humanize")
  .description("Generate a humanize cleanup candidate patch (MIDI-05)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("midi.humanize");
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
