// daemon/src/cli/commands/arrange.ts
//
// `bw-arrange` — arrangement intelligence (M3). Live multicall over the daemon
// UDS. Six subcommands shell to the daemon's arrange.* ops (Plan 04-05):
//   sections          — ARRANGE-01: bottom-up scene segmentation
//   repetition-report — ARRANGE-02: grouped repetition clusters
//   energy-curve      — ARRANGE-03: per-bar weighted composite energy
//   review            — UX-03/D-11: the aggregate critique (+ transition observations)
//   current-section   — D-11 P2: the section covering the last-selected scene
//   refresh           — D-19: re-pull the launcher grid + re-run all analyzers
//
// Pattern authority: daemon/src/cli/commands/midi.ts (the live multicall shape)
// + daemon/src/cli/query-client.ts (the UDS thin client). Each subcommand is a
// thin shell — no business logic (all reasoning in the daemon).
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
  .name("bw-arrange")
  .description("Arrangement intelligence (M3)");

// --- sections (ARRANGE-01 — bottom-up scene segmentation) ----------------
program
  .command("sections")
  .description("Bottom-up scene segmentation with confidence (ARRANGE-01)")
  .option("--refresh", "re-pull the launcher grid before analysis")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: RefreshOpts) => {
    try {
      const result = await query("arrange.sections", { refresh: opts.refresh ?? false });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- repetition-report (ARRANGE-02 — grouped repetition clusters) --------
program
  .command("repetition-report")
  .description("Grouped repetition clusters with similarity scores (ARRANGE-02)")
  .option("--refresh", "re-pull the launcher grid before analysis")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: RefreshOpts) => {
    try {
      const result = await query("arrange.repetition_report", { refresh: opts.refresh ?? false });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- energy-curve (ARRANGE-03 — per-bar weighted composite) --------------
program
  .command("energy-curve")
  .description("Per-bar weighted composite energy curve (ARRANGE-03)")
  .option("--refresh", "re-pull the launcher grid before analysis")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: RefreshOpts) => {
    try {
      const result = await query("arrange.energy_curve", { refresh: opts.refresh ?? false });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- review (UX-03/D-11 — the aggregate critique) ------------------------
program
  .command("review")
  .description("Aggregate arrangement critique: sections + energy + repetition + transitions (UX-03)")
  .option("--refresh", "re-pull the launcher grid before analysis")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: RefreshOpts) => {
    try {
      const result = await query("arrange.review", { refresh: opts.refresh ?? false });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- current-section (D-11 P2 — the section covering the selected scene) --
program
  .command("current-section")
  .description("The section label covering the last-selected scene (D-11)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("arrange.current_section", {});
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

// --- refresh (D-19 — re-pull the grid + re-run all analyzers) ------------
program
  .command("refresh")
  .description("Re-pull the launcher grid + re-run all M3 analyzers (D-19)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (opts: ExplainOpts) => {
    try {
      const result = await query("arrange.refresh", {});
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printConnectionError((e as Error).message, opts.explain);
    }
  });

program.parse(process.argv);
