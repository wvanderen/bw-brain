#!/usr/bin/env node
// daemon/src/cli/bw-brain.ts
//
// Multicall entry for the `bw-brain` CLI (D-06). Dispatched by argv[0]/argv[1]:
//   `bw-focus export --explain`   (shim/symlink invocation → one tool)
//   `bw-brain focus export`       (git-style invocation → same handler)
//   `bw-brain --help` / `--version` (top-level help)
//
// ONE codebase ships 8 binaries via symlinks (npm `bin` field). Both the seed's
// snappy `bw-focus export` spelling and the git-style `bw-brain focus export`
// reach the same handler (D-06). The throwaway `bw-brain-spike dump` (dump.ts)
// is deleted — the multicall `bw-brain` replaces it.
//
// DISPATCH DESIGN: each invocation loads EXACTLY ONE command module, which
// registers its commander command(s) on the shared `program` and parses
// process.argv itself. This per-module isolation is required because:
//   1. `bw-midi` and `bw-device` both expose an `inspect` action — loading both
//      into one program would collide on the command name. (One module per
//      process ⇒ no collision.)
//   2. The 3 stub modules emit `not_implemented` + exit on bare invocation;
//      loading them during `bw-brain --help` would short-circuit help.
// So the multicall never loads "all 8" into one program; it routes to exactly
// one and, for the git-style form, strips the tool word from argv first.
//
// ESM + NodeNext: .js import extensions (AGENTS.md convention; tsconfig HARD RULE).
import { program } from "commander";
import { basename } from "node:path";

/** The 8 shims installed via the npm `bin` field. */
const SHIMS = [
  "bw-focus",
  "bw-project",
  "bw-midi",
  "bw-device",
  "bw-diff",
  "bw-arrange",
  "bw-automation",
  "bw-edit",
] as const;

/** Tool word → command-module loader. Side-effect of import: registers + parses. */
const TOOL_LOADERS: Record<string, () => Promise<unknown>> = {
  focus: () => import("./commands/focus.js"),
  project: () => import("./commands/project.js"),
  midi: () => import("./commands/midi.js"),
  device: () => import("./commands/device.js"),
  diff: () => import("./commands/diff.js"),
  arrange: () => import("./commands/arrange.js"),
  automation: () => import("./commands/automation.js"),
  edit: () => import("./commands/edit.js"),
};

/**
 * Basename of the invoked binary, extension-stripped. When run via a shim
 * symlink (`bw-focus`), this is the shim name; when run as `bw-brain` (or
 * `node src/cli/bw-brain.ts`), this is `bw-brain`.
 */
function invokedAsName(): string {
  const raw = process.argv[1] ?? process.argv[0] ?? "bw-brain";
  return basename(raw).replace(/\.[cm]?[jt]s$/, "");
}

/** Top-level `bw-brain` help (no module loaded — avoids collisions + stub emit). */
function showTopLevelHelp(): void {
  const tools = Object.keys(TOOL_LOADERS).sort();
  const lines = [
    "bw-brain — local-first Bitwig intelligence layer (multicall CLI)",
    "",
    "Usage:",
    "  bw-<tool> <action> [options]   shim/symlink invocation (e.g. `bw-focus export`)",
    "  bw-brain <tool> <action>       git-style invocation   (e.g. `bw-brain focus export`)",
    "  bw-brain --help | --version    top-level help",
    "",
    "Live read/diff commands (M1):",
    "  bw-focus export                selected track/clip/device + transport (CLI-02)",
    "  bw-project summary             project window summary (CLI-02)",
    "  bw-project region -s -e        a bounded region's summary (CLI-02)",
    "  bw-midi inspect                selected clip notes/velocity/timing (CLI-03)",
    "  bw-device inspect              selected device chain/parameters incl. VST/AU (CLI-03)",
    "  bw-diff <a> <b>                read-only state-vs-state diff, round-trips 100% (SC#1)",
    "",
    "Stub commands (ship in a later milestone; emit structured not_implemented JSON):",
    "  bw-edit                        → M2 (reversible MIDI patching)",
    "  bw-arrange                     → M3 (arrangement intelligence)",
    "  bw-automation                  → M4 (automation & device workflows)",
    "",
    "Options:",
    "  --explain                      pretty-print JSON with a prose assumption block",
    "  --help                         per-tool help (e.g. `bw-focus --help`)",
    "  --version                      print bw-brain version",
    "",
    `Tools: ${tools.join(", ")}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * Main multicall dispatch. Determines the invocation form and routes to exactly
 * one command module (shim path) or strips the tool word then routes (git-style),
 * or prints top-level help (bare/--help/--version).
 */
async function main(): Promise<void> {
  const invokedAs = invokedAsName();

  // --- Shim/symlink invocation: `bw-focus export --explain` ---
  if ((SHIMS as readonly string[]).includes(invokedAs)) {
    const tool = invokedAs.replace(/^bw-/, "");
    // process.argv = [node, <shim>, export, --explain]. The module parses argv
    // itself; commander skips node+shim and sees the action args directly.
    await TOOL_LOADERS[tool]();
    return;
  }

  // --- `bw-brain` invocation ---
  const firstArg = process.argv[2];

  // --version / --help / bare: top-level help (no module loaded).
  if (firstArg === undefined || firstArg === "--help" || firstArg === "-h") {
    showTopLevelHelp();
    return;
  }
  if (firstArg === "--version" || firstArg === "-V") {
    program.version("0.0.0").parse(["node", "bw-brain", "--version"], { from: "node" });
    return;
  }

  // Git-style: `bw-brain <tool> [args]`. Strip the tool word so the loaded
  // module sees its action args at argv[2:] — makes `bw-brain focus export`
  // reach the SAME `export` handler as `bw-focus export`.
  if (firstArg in TOOL_LOADERS) {
    process.argv.splice(2, 1);
    await TOOL_LOADERS[firstArg]();
    return;
  }

  // Unknown subcommand: print help + a clear note (CLI-01 — fail clearly).
  process.stderr.write(`Unknown bw-brain subcommand: ${firstArg}\n\n`);
  showTopLevelHelp();
  process.exit(1);
}

void main();
