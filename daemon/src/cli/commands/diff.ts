// daemon/src/cli/commands/diff.ts
//
// `bw-diff` — read-only state-vs-state diff (SC#1, D-05 promotion). This is the
// ONE live command that does NOT query the daemon: it diffs two local raw-state
// JSON files field-by-field (notes/automation/scope). The pure logic lives in
// diff-logic.ts (computeStateDiff/applyDiff); this file is the I/O-bound
// commander wrapper that reads the files and prints the result envelope.
//
// SC#1's "round-trips 100%" bar is proven by diff-logic.test.ts as a pure-
// function property (applyDiff∘computeStateDiff is lossless), NOT an integration
// test — so bw-diff can serve the SC#1 contract mechanically.
//
// Output: {version, ok:true, diff, assumptions[]} (assumptions[] per UX-06/D-10).
// Exit 0 on success AND on parse error (CLI-01 — fail clearly as JSON; non-zero
// reserved for usage errors only).
//
// This module is SELF-CONTAINED: it registers + parses process.argv. The
// multicall entry (bw-brain.ts) loads exactly one command module per invocation.
import { readFileSync } from "node:fs";
import { program } from "commander";
import { computeStateDiff, type RawState } from "../diff-logic.js";

interface DiffOpts {
  explain?: boolean;
}

function printResult(result: unknown, explain?: boolean): void {
  process.stdout.write(`${JSON.stringify(result, null, explain ? 2 : 0)}\n`);
}

program
  .name("bw-diff")
  .description("Diff two raw-state JSON files (notes/automation/scope). Round-trips 100% (SC#1).")
  .argument("<a>", "path to the 'before' raw-state JSON file")
  .argument("<b>", "path to the 'after' raw-state JSON file")
  .option("--explain", "pretty-print JSON (2-space indent)")
  .action((a: string, b: string, opts: DiffOpts) => {
    let sa: RawState;
    let sb: RawState;
    try {
      sa = JSON.parse(readFileSync(a, "utf8")) as RawState;
      sb = JSON.parse(readFileSync(b, "utf8")) as RawState;
    } catch (e) {
      // CLI-01: fail clearly as JSON. Exit 0 so shell pipelines survive (the
      // non-OK result is itself the clear failure signal).
      printResult(
        {
          version: "1.0",
          ok: false,
          error: `failed to read/parse diff inputs: ${(e as Error).message}`,
        },
        opts.explain,
      );
      return;
    }
    const diff = computeStateDiff(sa, sb);
    printResult(
      {
        version: "1.0",
        ok: true,
        diff,
        assumptions: [
          {
            claim: "compared two raw-state snapshots field-by-field (notes/automation/scope)",
            confidence: 1.0,
            source: "selection",
          },
        ],
      },
      opts.explain,
    );
  });

program.parse(process.argv);
