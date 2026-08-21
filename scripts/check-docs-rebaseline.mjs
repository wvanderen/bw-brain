#!/usr/bin/env node
// scripts/check-docs-rebaseline.mjs
//
// Stale-phrase doc-consistency gate for the 2026-08-20 CLAP-first product
// rebaseline (Phase 04.3 / Plan 04.3-01 / RB-01 — decision recorded in
// .planning/PROJECT.md Key Decisions).
//
// Purpose: mechanically prevent the post-regeneration drift class where the
// generated .claude/AGENTS.md (rebuilt from .planning/PROJECT.md and
// .planning/research/STACK.md via `gsd-tools generate-claude-md`) or
// pi-pack/README.md re-imports wording that contradicts the rebaselined
// product story (hosted CLAP editor primary, CLI stable secondary, Pi
// daemon-managed headless, explicitly configured local-or-remote provider).
// Hand-edits to AGENTS.md are overwritten by the next GSD sync — the fix
// belongs in the SOURCE docs — and this gate catches both drift classes at
// check time (04.3-RESEARCH.md Pitfall 3).
//
// Guarded phrases (exact patterns from 04.3-RESEARCH.md Pitfall 3):
//   1. "first-class UX"              — the pre-CLAP Pi/TUI-primary-UX claim
//   2. "no cloud/remote model calls" — the absolute remote-model prohibition
//      (superseded: local authority is the invariant; an explicitly
//      configured remote reasoning provider with bounded confirmed context
//      is permitted per PROJECT.md Constraints)
//   3. "0.79.10"                     — the obsolete external-pack Pi version
//      token (pi-pack/README.md only; Pi is 0.84.0 daemon-managed)
//
// The script necessarily contains these literal stale patterns — that is its
// job; it asserts they appear nowhere in the guarded docs.
//
// Modeled on scripts/check-bridge-artifact.mjs + check-capabilities-doc.mjs
// (same header-comment style, same exit-0-on-pass / exit-1-on-failure
// contract, same --self-test pattern, same Node-built-ins-only discipline).
//
// Run modes:
//   node scripts/check-docs-rebaseline.mjs               # validate the real tree (repo-root anchored, CWD-independent)
//   node scripts/check-docs-rebaseline.mjs --self-test   # validate inline fixtures (proves the matcher: clean passes, stale fails)
//   node scripts/check-docs-rebaseline.mjs --help | -h    # usage
//
// Wired as `check:docs` in daemon/package.json so the gate runs with the doc
// suite beside check:bridge-artifact / check:capabilities.
//
// Exit 0 on pass, 1 on any stale-phrase match. `.mjs` = native ESM.
// Zero new dependencies — Node built-ins only.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Stale rebaseline-contradicting phrases. Checked as literal substrings
// (case-sensitive) per the exact strings verified pre-regeneration at
// .claude/AGENTS.md lines 7/16 and pi-pack/README.md lines 3/11.
const STALE_PHRASES = ["first-class UX", "no cloud/remote model calls"];

// Obsolete Pi version token — only meaningful in the pi-pack README, where
// the 0.79.10+ external-pack requirement wording lived.
const PI_PACK_STALE_TOKENS = ["0.79.10"];

// Guarded docs and their per-file extra tokens.
const GUARDED_FILES = [
  { path: ".claude/AGENTS.md", extraTokens: [] },
  { path: "pi-pack/README.md", extraTokens: PI_PACK_STALE_TOKENS },
];

/**
 * Scan one document's lines for stale tokens. Returns an array of
 * `file:line` findings (one per matching line, citing the token + an
 * excerpt of the offending line).
 */
function scanDoc(doc, tokens, fileLabel) {
  const findings = [];
  const lines = doc.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const token of tokens) {
      if (lines[i].includes(token)) {
        const excerpt = lines[i].length > 100 ? `${lines[i].slice(0, 100)}…` : lines[i];
        findings.push(`${fileLabel}:${i + 1}: stale phrase "${token}" → ${excerpt.trim()}`);
      }
    }
  }
  return findings;
}

/**
 * Validate the real tree: every guarded doc must contain zero stale phrases.
 * Returns an array of error strings (empty = pass).
 */
function validateTree(repoRoot) {
  const errors = [];
  for (const { path, extraTokens } of GUARDED_FILES) {
    const absolute = resolve(repoRoot, path);
    let doc;
    try {
      doc = readFileSync(absolute, "utf8");
    } catch {
      errors.push(`✗ Guarded doc not found: ${absolute}`);
      continue;
    }
    for (const finding of scanDoc(doc, [...STALE_PHRASES, ...extraTokens], path)) {
      errors.push(`✗ ${finding}`);
    }
  }
  return errors;
}

/**
 * Self-test: prove the matcher accepts a clean fixture and rejects stale
 * ones (both shared phrases + the pi-pack-only version token), including
 * file:line citation. Mirrors the inline-fixture self-test shape of the
 * sibling check scripts.
 */
function runSelfTest() {
  const errors = [];

  const clean = [
    "The hosted CLAP editor is the primary producer surface.",
    "Reasoning may use an explicitly configured remote provider (bounded confirmed context).",
    "Pi 0.84.0 is the daemon-managed headless reasoning runtime.",
  ].join("\n");
  if (scanDoc(clean, [...STALE_PHRASES, ...PI_PACK_STALE_TOKENS], "clean.md").length !== 0) {
    errors.push("self-test clean: expected zero findings for rebaselined wording, got some");
  }

  const staleUx = "A Pi/OpenClaw package is the first-class UX (slash commands, skills, TUI panes).";
  const uxFindings = scanDoc(staleUx, STALE_PHRASES, "stale.md");
  if (uxFindings.length !== 1 || !uxFindings[0].includes("stale.md:1") || !uxFindings[0].includes("first-class UX")) {
    errors.push(`self-test stale-ux: expected one file:line finding citing "first-class UX", got ${JSON.stringify(uxFindings)}`);
  }

  const staleRemote = "- **Local-first:** no cloud/remote model calls; bridge + daemon run offline.";
  const remoteFindings = scanDoc(staleRemote, STALE_PHRASES, "stale.md");
  if (remoteFindings.length !== 1 || !remoteFindings[0].includes("stale.md:1") || !remoteFindings[0].includes("no cloud/remote model calls")) {
    errors.push(`self-test stale-remote: expected one file:line finding citing "no cloud/remote model calls", got ${JSON.stringify(remoteFindings)}`);
  }

  const staleVersion = "Pi 0.79.10+ is required (`pi --help` confirms the `pi install <source>` path).";
  const versionFindings = scanDoc(staleVersion, PI_PACK_STALE_TOKENS, "pi-pack/README.md");
  if (versionFindings.length !== 1 || !versionFindings[0].includes("pi-pack/README.md:1") || !versionFindings[0].includes("0.79.10")) {
    errors.push(`self-test stale-version: expected one file:line finding citing "0.79.10", got ${JSON.stringify(versionFindings)}`);
  }

  // Line-number precision: the stale phrase on line 2 must be cited as :2.
  const multiLine = `clean line\nstill first-class UX here`;
  const multiFindings = scanDoc(multiLine, STALE_PHRASES, "multi.md");
  if (multiFindings.length !== 1 || !multiFindings[0].includes("multi.md:2")) {
    errors.push(`self-test line-number: expected the line-2 match cited as multi.md:2, got ${JSON.stringify(multiFindings)}`);
  }

  return errors;
}

function main(argv) {
  let selfTest = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") selfTest = true;
    else if (a === "--help" || a === "-h") {
      process.stdout.write("Usage: check-docs-rebaseline.mjs [--self-test] [--help]\n");
      process.exit(0);
    }
  }

  if (selfTest) {
    const errors = runSelfTest();
    if (errors.length > 0) {
      for (const e of errors) console.error(`✗ ${e}`);
      console.error("\nDocs-rebaseline gate self-test FAILED.");
      process.exit(1);
    }
    process.stdout.write(
      "✓ Docs-rebaseline gate self-test PASSED (clean accepted; first-class-UX, no-cloud/remote, and 0.79.10 all rejected with file:line citations).\n",
    );
    process.exit(0);
  }

  // Anchor at the git repo root so the script is CWD-independent: it works
  // invoked from the repo root OR via `cd daemon && npm run check:docs`.
  let repoRoot;
  try {
    repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    console.error("✗ Could not determine git repo root (`git rev-parse --show-toplevel` failed). Run from inside the bw-brain repo.");
    process.exit(1);
  }

  const errors = validateTree(repoRoot);
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    console.error(
      "\nDocs-rebaseline gate FAILED: rebaseline-contradicting wording found in a guarded doc. Fix the SOURCE (.planning/PROJECT.md / .planning/research/STACK.md / pi-pack/README.md) and regenerate .claude/AGENTS.md via `gsd-tools generate-claude-md` — never hand-edit the generated file. (Phase 04.3 / RB-01.)",
    );
    process.exit(1);
  }

  process.stdout.write(
    "✓ Docs-rebaseline gate PASSED: no stale CLAP-first-rebaseline-contradicting phrases in .claude/AGENTS.md or pi-pack/README.md.\n",
  );
  process.exit(0);
}

main(process.argv.slice(2));
