// daemon/src/cli/commands/edit.ts
//
// `bw-edit` — reversible MIDI patching (M2, EDIT-02/04/05/06). Live multicall
// over the daemon UDS: preview a patch as a diff, apply it (risk-gated), revert
// it through the daemon-authoritative journal. Replaces the M1 stub.
//
// D-04 two-step explicit: there is NO interactive y/N prompt anywhere. Every
// apply is a deliberate second action — `bw-edit apply <patchId>` with the
// risk-appropriate flags. The daemon enforces the gate server-side (the flags
// ride in the query payload, never trusted as CLI-only enforcement).
//
// Pattern authority: daemon/src/cli/commands/midi.ts (the live multicall shape)
// + daemon/src/cli/query-client.ts (the UDS thin client). Three subcommands:
//   preview <patchFile>              — query edit.preview, emit {patchId,risk,diff}
//   apply  <patchId> [--confirm ...] — query edit.apply, emit {ok,appliedOps,...}
//   revert <patchId>                 — query edit.revert, emit {ok,appliedRevertedAt}
//
// Self-contained: registers + parses process.argv.

import { program } from "commander";
import { query, DaemonReplyError } from "../query-client.js";
import { readFileSync } from "node:fs";

interface ExplainOpts {
  explain?: boolean;
}

interface ApplyOpts extends ExplainOpts {
  confirm?: boolean;
  force?: boolean;
  allowBelowBar?: boolean;
}

/**
 * Catch-block dispatcher (Pitfall 8 — ONE helper at the CLI layer too):
 * - DaemonReplyError → the daemon returned a structured ok:false (e.g.
 *   wrong_clip_targeted, confirmation_required). Print the envelope VERBATIM so
 *   the producer sees the daemon's real stateFreshness + the detail fields
 *   (expectedClipSid/actualClipSid/hint — D-06 surface contract).
 * - plain Error → the daemon was unreachable (socket absent / closed mid-query).
 *   Fall through to printConnectionError, whose disconnected stub is the
 *   TRUTHFUL answer in that case (SC#3).
 */
function printResultOrDisconnect(e: unknown, explain?: boolean): void {
  if (e instanceof DaemonReplyError) {
    process.stdout.write(`${JSON.stringify(e.envelope, null, explain ? 2 : 0)}\n`);
  } else {
    printConnectionError((e as Error).message, explain);
  }
}

/**
 * Shared fail-closed envelope (mirrors midi.ts:16-25 — SC#3 disconnected surface).
 * This is the honest disconnected stub for the GENUINE daemon-unreachable case
 * (SC#3); daemon-returned ok:false envelopes are surfaced verbatim via
 * printResultOrDisconnect and never reach here.
 */
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
  .name("bw-edit")
  .description("Reversible MIDI patching (preview / apply / revert)");

// --- preview <patchFile> ------------------------------------------------
// Reads + JSON.parses the patch file, queries edit.preview. The daemon
// resolves ops against live clip state, classifies risk, mints a candidate
// patchId, and returns {patchId, risk, diff, assumptions}. Does NOT apply.
program
  .command("preview")
  .argument("<patchFile>", "path to a patch JSON file")
  .description("Preview a patch as a StateDiff without applying (EDIT-02)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (patchFile: string, opts: ExplainOpts) => {
    try {
      const raw = readFileSync(patchFile, "utf8");
      const patch = JSON.parse(raw);
      const result = await query("edit.preview", { patch });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printResultOrDisconnect(e, opts.explain);
    }
  });

// --- apply <patchId> [--confirm] [--force] [--allow-below-bar] ----------
// D-04: medium/high risk requires --confirm (or --force to bypass). D-09:
// belowBar requires --allow-below-bar AND --confirm (stacking). All flags
// ride in the payload so the daemon enforces them server-side (INV-10).
program
  .command("apply")
  .argument("<patchId>", "the candidate patchId from a prior preview")
  .description("Apply a previewed patch by patchId (EDIT-04/06, risk-gated)")
  .option("--confirm", "acknowledge medium/high risk (D-04)")
  .option("--force", "bypass --confirm (producer override)")
  .option("--allow-below-bar", "allow a belowBar patch (D-09, stacks with --confirm)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (patchId: string, opts: ApplyOpts) => {
    try {
      const result = await query("edit.apply", {
        patchId,
        confirm: opts.confirm ?? false,
        force: opts.force ?? false,
        allowBelowBar: opts.allowBelowBar ?? false,
      });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printResultOrDisconnect(e, opts.explain);
    }
  });

// --- revert <patchId> ---------------------------------------------------
// Replays the inverseOperations stamped at apply time (D-03 daemon-
// authoritative). The daemon finds the history entry, builds a NEW patch
// whose operations = entry.inverseOperations, applies via the same bridge
// path, and appends a NEW history entry recording the revert.
program
  .command("revert")
  .argument("<patchId>", "the patchId of an applied patch to revert")
  .description("Revert an applied patch via the daemon-authoritative journal (EDIT-05)")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action(async (patchId: string, opts: ExplainOpts) => {
    try {
      const result = await query("edit.revert", { patchId });
      process.stdout.write(`${JSON.stringify(result, null, opts.explain ? 2 : 0)}\n`);
    } catch (e) {
      printResultOrDisconnect(e, opts.explain);
    }
  });

program.parse(process.argv);
