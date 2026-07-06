#!/usr/bin/env node
// scripts/check-bridge-artifact.mjs
//
// Mechanical staleness gate for the packaged bridge artifact (Plan 03.1-05).
//
// Purpose: flag a stale `bridge/target/bw-brain.bwextension` — the packaged
// shade-plugin output that Bitwig loads — when its filesystem mtime predates
// the newest committer-date among the git-tracked source files that feed the
// `mvn -pl bridge package` (shade) phase. The regression class this prevents:
// `mvn compile` ran (so bridge/target/classes/*.class are fresh) but
// `mvn package` never re-ran, so the `.bwextension` loaded into Bitwig is
// physically older than the source and cannot emit the newest code paths.
//
// This is the exact root cause of the Phase-03.1 UAT Test-3 blocker
// (artifact mtime 2026-07-04 10:42:38 vs ClipSid commit 2026-07-04 20:30:11,
// diagnosed in `.planning/debug/clipsid-not-populating.md`): the daemon's
// backward-compat folds NO-OP'd against the stale artifact, leaving
// `selection: {}`, and the failure surfaced only at live UAT. This gate
// converts that class of regression into a sub-second mechanical check that
// fails verification/CI the moment it occurs.
//
// Modeled on scripts/check-deprecated-bridge.mjs + check-capabilities-doc.mjs
// (same header-comment style, same exit-0-on-pass / exit-1-on-failure contract,
// same --self-test pattern, same Node-built-ins-only discipline).
//
// Run modes:
//   node scripts/check-bridge-artifact.mjs                  # validate the real tree (artifact mtime vs newest source commit)
//   node scripts/check-bridge-artifact.mjs --self-test      # validate inline pure-function fixtures (proves parseIsoToMs + isStale)
//   node scripts/check-bridge-artifact.mjs --help | -h       # usage
//   ARTIFACT_PATH_OVERRIDE=/path node scripts/check-bridge-artifact.mjs  # stat a different artifact (testing escape hatch; mirrors check-deprecated-bridge.mjs's BITWIG_JAVADOC hook)
//
// Decision rule: artifact_mtime_ms < newest_source_commit_ms → FAIL (stale).
// Equal is NOT stale (artifact packaged at the exact commit instant passes).
// Missing artifact → FAIL with a `mvn -pl bridge package` remediation.
//
// The comparison set (SOURCE_PATHS below) is the explicitly enumerated
// shade-plugin input set per bridge/pom.xml + Maven defaults: the 7 main Java
// sources + the ServiceLoader resource + pom.xml. Test sources under
// bridge/src/test/ are deliberately excluded (they do not feed the package
// phase). The list is hardcoded (not a runtime glob) so it is auditable and
// cannot accidentally include a future test file.
//
// Exit 0 on pass, 1 on any staleness/missing-artifact.
// `.mjs` = native ESM (AGENTS.md line 162). Zero new dependencies — Node built-ins only.
import { statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// The shade-plugin <outputFile> per bridge/pom.xml line 107:
//   ${project.build.directory}/bw-brain.bwextension
// ARTIFACT_PATH_OVERRIDE is a testing escape hatch (mirrors
// check-deprecated-bridge.mjs's BITWIG_JAVADOC env); production runs stat the
// default path.
//
// All paths are anchored at the git repo root (`git rev-parse --show-toplevel`)
// so the script is CWD-independent: it works invoked from the repo root OR via
// `cd daemon && npm run check:bridge-artifact` (the npm wiring lives in
// daemon/package.json). The override, when set, resolves relative to CWD as
// passed (testing convenience — typically an absolute /tmp/ path).
let REPO_ROOT;
try {
  REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  console.error(
    "✗ Could not determine git repo root (`git rev-parse --show-toplevel` failed). Run from inside the bw-brain repo.",
  );
  process.exit(1);
}
const ARTIFACT_PATH = process.env.ARTIFACT_PATH_OVERRIDE
  ? resolve(process.env.ARTIFACT_PATH_OVERRIDE)
  : resolve(REPO_ROOT, "bridge/target/bw-brain.bwextension");

// The git-tracked source set that feeds the `mvn -pl bridge package` (shade)
// phase, per bridge/pom.xml + Maven defaults. Compiled main Java classes +
// the ServiceLoader resource are bundled; pom.xml defines the build (a pom
// change CAN alter the package output); test sources under bridge/src/test/
// do NOT feed the package phase and are excluded. Enumerated explicitly
// (derived from `git ls-files bridge/src/main/java bridge/src/main/resources
// bridge/pom.xml`) — no runtime glob, auditable, stable.
const SOURCE_PATHS = [
  "bridge/src/main/java/com/bwbrain/bridge/BridgeDefinition.java",
  "bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java",
  "bridge/src/main/java/com/bwbrain/bridge/ClipSid.java",
  "bridge/src/main/java/com/bwbrain/bridge/LineJson.java",
  "bridge/src/main/java/com/bwbrain/bridge/LauncherGridWalker.java",
  "bridge/src/main/java/com/bwbrain/bridge/Observers.java",
  "bridge/src/main/java/com/bwbrain/bridge/Outbox.java",
  "bridge/src/main/java/com/bwbrain/bridge/PullHandlers.java",
  "bridge/src/main/resources/META-INF/services/com.bitwig.extension.ExtensionDefinition",
  "bridge/pom.xml",
];

/**
 * Parse a git `%cI` strict-ISO-8601 string (e.g. "2026-07-04T20:30:11-05:00")
 * to epoch milliseconds. Git's %cI is RFC 3339 / ISO 8601 with timezone
 * offset, which Date.parse handles natively. Returns NaN for unparseable
 * input (Date.parse returns NaN; we surface it explicitly).
 */
function parseIsoToMs(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? NaN : ms;
}

/**
 * The staleness decision rule. Both args are epoch-ms numbers.
 * Returns true when the artifact is strictly older than the newest source
 * commit (the regression condition). Equal is NOT stale. If either arg is
 * NaN the comparison is undefined — return false (do not fail on missing
 * data; the missing-artifact case is handled separately in main()).
 */
function isStale(artifactMtimeMs, latestSourceCommitMs) {
  if (Number.isNaN(artifactMtimeMs) || Number.isNaN(latestSourceCommitMs)) {
    return false;
  }
  return artifactMtimeMs < latestSourceCommitMs;
}

/**
 * Self-test: prove the pure decision logic (parseIsoToMs + isStale) against
 * synthetic fixtures, including the EXACT historical Phase-03.1 UAT blocker
 * timestamps (artifact 2026-07-04 10:42:38 vs ClipSid commit 2026-07-04
 * 20:30:11, both -05:00 CDT). The regression class is now encoded as a
 * permanent assertion. Mirrors the inline-fixture self-test shape of
 * check-capabilities-doc.mjs.
 */
function runSelfTest() {
  const errors = [];

  // Self-test 1 (parseIsoToMs — valid): strict equality with Date.parse.
  const validIso = "2026-07-04T20:30:11-05:00";
  const validExpected = Date.parse(validIso);
  const validGot = parseIsoToMs(validIso);
  if (validGot !== validExpected) {
    errors.push(
      `self-test parseIsoToMs(valid): expected ${validExpected} (= Date.parse(${JSON.stringify(validIso)})), got ${validGot}`,
    );
  }
  if (Number.isNaN(validGot)) {
    errors.push(
      `self-test parseIsoToMs(valid): returned NaN for a valid ISO string ${JSON.stringify(validIso)}`,
    );
  }

  // Self-test 1b (parseIsoToMs — invalid): NaN for garbage.
  const invalidGot = parseIsoToMs("not-a-date");
  if (!Number.isNaN(invalidGot)) {
    errors.push(
      `self-test parseIsoToMs(invalid): expected NaN for "not-a-date", got ${invalidGot}`,
    );
  }

  // Self-test 2 (isStale — stale case): the EXACT Phase-03.1 UAT blocker.
  // Artifact mtime 2026-07-04 10:42:38 -05:00 (the stale packaged .bwextension)
  // predates the ClipSid commit 2026-07-04 20:30:11 -05:00 by 9h47min.
  const staleArtifactMs = Date.parse("2026-07-04T10:42:38-05:00");
  const staleSourceMs = Date.parse("2026-07-04T20:30:11-05:00");
  const staleGot = isStale(staleArtifactMs, staleSourceMs);
  if (staleGot !== true) {
    errors.push(
      `self-test isStale(stale): expected true for artifact 2026-07-04T10:42:38-05:00 vs source 2026-07-04T20:30:11-05:00 (the Phase-03.1 UAT Test-3 blocker), got ${staleGot}`,
    );
  }

  // Self-test 3 (isStale — fresh case): artifact newer than source.
  // The current repo state after the rebuild (artifact 2026-07-05 16:29).
  const freshArtifactMs = Date.parse("2026-07-05T16:29:00-05:00");
  const freshSourceMs = Date.parse("2026-07-04T20:30:11-05:00");
  const freshGot = isStale(freshArtifactMs, freshSourceMs);
  if (freshGot !== false) {
    errors.push(
      `self-test isStale(fresh): expected false for artifact 2026-07-05T16:29:00-05:00 vs source 2026-07-04T20:30:11-05:00, got ${freshGot}`,
    );
  }

  // Self-test 4 (isStale — equal boundary): equal is NOT stale.
  const equalMs = Date.parse("2026-07-04T20:30:11-05:00");
  const equalGot = isStale(equalMs, equalMs);
  if (equalGot !== false) {
    errors.push(
      `self-test isStale(equal): expected false for equal timestamps (artifact packaged at the exact commit instant is NOT stale), got ${equalGot}`,
    );
  }

  return errors;
}

function main(argv) {
  let selfTest = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") selfTest = true;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: check-bridge-artifact.mjs [--self-test] [--help]\n  ARTIFACT_PATH_OVERRIDE=<path> overrides the artifact to stat (testing).\n",
      );
      process.exit(0);
    }
  }

  if (selfTest) {
    const errors = runSelfTest();
    if (errors.length > 0) {
      for (const e of errors) console.error(`✗ ${e}`);
      console.error("\nBridge-artifact staleness gate self-test FAILED.");
      process.exit(1);
    }
    process.stdout.write(
      "✓ Bridge-artifact staleness gate self-test PASSED (parseIsoToMs + isStale: stale detected, fresh accepted, equal boundary honored).\n",
    );
    process.exit(0);
  }

  // 1. Stat the packaged artifact. On ENOENT, fail with the missing-artifact
  //    remediation. The artifact is untracked build output — it has NO git
  //    history, which is exactly why we compare filesystem mtime (artifact)
  //    against git commit time (sources). This asymmetry is the point.
  let artifactMtimeMs;
  try {
    artifactMtimeMs = statSync(ARTIFACT_PATH).mtimeMs;
  } catch {
    console.error(
      `✗ Packaged bridge artifact not found: ${ARTIFACT_PATH}`,
    );
    console.error(
      "  Run `mvn -pl bridge package` (or `cd bridge && mvn package`) to build it, then re-run this check.",
    );
    process.exit(1);
  }

  // 2. For each tracked source path, get the committer-date strict-ISO of the
  //    last commit touching it (`git log -1 --format=%cI -- <path>`). Track the
  //    MAX across all paths + record which path/commit produced it (for the
  //    failure message). execFileSync (not exec) — no shell, no injection
  //    surface; paths are repo-relative constants, and `--` prevents
  //    path-as-flag interpretation.
  let latestSourceCommitMs = -Infinity;
  let latestSourcePath = null;
  let latestSourceIso = null;
  for (const path of SOURCE_PATHS) {
    let out;
    try {
      out = execFileSync("git", ["log", "-1", "--format=%cI", "--", path], {
        encoding: "utf8",
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      console.error(
        `✗ Failed to read git history for source path: ${path} (is this run from the repo root?)`,
      );
      process.exit(1);
    }
    if (!out) {
      // Path not tracked / no commit. Skip — do not fail the gate on a
      // misconfigured SOURCE_PATHS entry; the enumerated list is audited.
      continue;
    }
    const ms = parseIsoToMs(out);
    if (Number.isNaN(ms)) {
      console.error(
        `✗ Could not parse git committer-date for ${path}: ${JSON.stringify(out)}`,
      );
      process.exit(1);
    }
    if (ms > latestSourceCommitMs) {
      latestSourceCommitMs = ms;
      latestSourcePath = path;
      latestSourceIso = out;
    }
  }

  if (latestSourcePath === null) {
    console.error(
      "✗ No git history found for any of the enumerated SOURCE_PATHS — cannot evaluate staleness. Ensure the script runs from the repo root.",
    );
    process.exit(1);
  }

  // 3. Decision rule. Stale → fail with the delta + remediation + debug-doc
  //    reference. Equal/fresh → pass.
  const artifactIso = new Date(artifactMtimeMs).toISOString();
  if (isStale(artifactMtimeMs, latestSourceCommitMs)) {
    const deltaMs = latestSourceCommitMs - artifactMtimeMs;
    const deltaMin = Math.floor(deltaMs / 60000);
    const deltaHr = Math.floor(deltaMin / 60);
    const deltaRemMin = deltaMin % 60;
    const deltaStr =
      deltaHr > 0 ? `${deltaHr}h ${deltaRemMin}min` : `${deltaMin}min`;
    console.error(
      `✗ Stale packaged bridge artifact: ${ARTIFACT_PATH}`,
    );
    console.error(`  artifact mtime: ${artifactIso}`);
    console.error(
      `  newest source: ${latestSourcePath} @ ${latestSourceIso}`,
    );
    console.error(`  delta (source is newer by): ${deltaStr}`);
    console.error(
      "  The packaged .bwextension is older than the newest source commit. Run `mvn -pl bridge package` to rebuild, then reinstall the artifact into Bitwig (restart Bitwig or toggle the bw-brain controller) before UAT. (This regression class caused the Phase-03.1 UAT Test-3 blocker — see .planning/debug/clipsid-not-populating.md.)",
    );
    process.exit(1);
  }

  process.stdout.write(
    `✓ Bridge-artifact gate PASSED: ${ARTIFACT_PATH} (mtime ${artifactIso}) is newer than the newest source commit (${latestSourcePath} @ ${latestSourceIso}); the packaged extension is up to date.\n`,
  );
  process.exit(0);
}

main(process.argv.slice(2));
