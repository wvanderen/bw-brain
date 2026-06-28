#!/usr/bin/env node
// scripts/check-deprecated-bridge.mjs
//
// Mechanical deprecation gate for the Java bridge (Plan 02-06 / SC#1 unblock).
//
// Purpose: flag any deprecated Bitwig Control Surface API call site in
// `bridge/src/main/java/**/*.java` so the regression class "compiles fine,
// loads broken" is caught at verification time, not at live UAT. The Phase-2
// UAT blocker (Observers.java:139 `trackBank.getTrack(i)`) shipped because
// autonomous verification checked the WRONG invariant (`javap` "method
// exists") instead of the right one (method non-deprecation); Bitwig 6.0.6
// enforces deprecation-as-error at runtime, so the build was green and the
// extension still failed to load. This script greps the bridge Java sources
// against the local Bitwig javadoc deprecated-list.html and exits 1 on any
// unallowlisted deprecated call site.
//
// Modeled on scripts/check-capabilities-doc.mjs (same header-comment style,
// same exit-0-on-pass / exit-1-on-failure contract, same --self-test pattern).
//
// Run modes:
//   node scripts/check-deprecated-bridge.mjs                  # validate bridge/src/main/java against the local deprecated-list.html
//   node scripts/check-deprecated-bridge.mjs --self-test      # validate inline synthetic fixtures (proves the validator accepts/rejects correctly)
//   node scripts/check-deprecated-bridge.mjs --javadoc <path> # override the deprecated-list.html path
//   BITWIG_JAVADOC=/path/to/api node scripts/check-deprecated-bridge.mjs  # override via env var
//
// Default javadoc path:
//   /Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/deprecated-list.html
//
// Allowlist: a source line containing the marker `// deprecated-allow: <reason>`
// on the SAME line as the call suppresses the finding. Used for the residual
// overload-collision cases after receiver-name filtering (e.g.
// `host.createCursorTrack(0, 0)` collides with the deprecated 5-arg
// `createCursorTrack(String,String,int,int,boolean)` form; the 2-arg int form
// is non-deprecated). The marker + reason are echoed in the report when suppressed.
//
// Exit 0 on pass (zero unallowlisted BLOCKING findings), 1 on any BLOCKING finding.
// `.mjs` = native ESM (AGENTS.md line 162).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_JAVADOC_PATH =
  "/Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/deprecated-list.html";
const BRIDGE_ROOT = resolve("bridge/src/main/java");
const ALLOWLIST_MARKER = /\/\/\s*deprecated-allow:\s*(.+)/;

// Each deprecated-list.html entry has the shape:
//   <div class="col-summary-item-name ..."><a href="{javaPackagePath}.html#{methodSig}">com.bitwig...{ClassName}.{methodName}<wbr>({args})</a></div>
//   <div class="col-second ..."></div>
//   <div class="col-last ...">
//     <div class="block">Use ... instead.</div>     (the replacement note; optional)
//   </div>
// The `<wbr>` word-break tag is optional (present when the wrapped line breaks;
// absent for short arg lists like `getChannel()`). We capture className +
// methodName + the raw arg list (stripped of <wbr>) so the report can echo the
// full deprecated signature. The replacement note lives in a *later* sibling
// `<div class="block">`, found by searching forward from the entry's end.
const ENTRY_OPEN_RE =
  /<div class="col-summary-item-name[^"]*">\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/div>/g;
const BLOCK_NOTE_RE = /<div class="block">([\s\S]*?)<\/div>/;

const FQCN_IN_HREF_RE = /^([\w./]+)\.html#([\w.$]+)\(([\w.$,\s]*)\)$/;
const VISIBLE_TEXT_RE = /<[^>]+>/g;

/**
 * Parse the deprecated-list.html contents into a list of deprecated methods.
 * Each entry: { fqcn, methodName, rawArgs, replacementNote? }.
 */
function parseDeprecatedList(html) {
  const entries = [];
  let match;
  ENTRY_OPEN_RE.lastIndex = 0;
  while ((match = ENTRY_OPEN_RE.exec(html)) !== null) {
    const [, href, innerHtml] = match;
    // href looks like "com/bitwig/extension/controller/api/TrackBank.html#getTrack(int)"
    // Convert the path to a dotted FQCN and pull out (className, methodName, rawArgs).
    const hrefMatch = href.match(FQCN_IN_HREF_RE);
    if (!hrefMatch) continue;
    const [, javaPath, qualifiedMethod, rawArgsRaw] = hrefMatch;
    const fqcn = javaPath.replace(/\//g, ".");
    // qualifiedMethod may be `ClassName.method` or `ClassName.field.method`;
    // the deprecated unit is the LAST method name (the call site receiver).
    const methodName = qualifiedMethod.split(".").pop();
    const rawArgs = (rawArgsRaw || "")
      .replace(VISIBLE_TEXT_RE, "")
      .replace(/\s+/g, "")
      .trim();
    // innerHtml is the visible anchor text; strip <wbr>/tags for the readable sig.
    const visibleSig = innerHtml.replace(VISIBLE_TEXT_RE, "").trim();
    // The replacement note lives in a *later* sibling `<div class="block">`
    // (separated by <div class="col-second"></div><div class="col-last">).
    // Search forward from the entry's end; cap the lookahead at 500 chars so
    // we never span into the next entry's block.
    const after = html.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const blockMatch = after.match(BLOCK_NOTE_RE);
    const replacementNote = blockMatch
      ? blockMatch[1].replace(VISIBLE_TEXT_RE, "").trim()
      : null;
    entries.push({
      fqcn,
      methodName,
      rawArgs,
      visibleSig,
      replacementNote,
    });
  }
  return entries;
}

/**
 * Build a methodName -> array of { fqcn, rawArgs, replacementNote } map for
 * quick lookup during source scan. Methods with the same name on different
 * classes collapse into the same key (we report all owning FQCNs in findings).
 */
function indexByMethodName(deprecatedEntries) {
  const byName = new Map();
  for (const e of deprecatedEntries) {
    if (!byName.has(e.methodName)) byName.set(e.methodName, []);
    byName.get(e.methodName).push(e);
  }
  return byName;
}

/**
 * Recursively list every .java file under `root`. Pure main sources —
 * bridge/src/test/java is excluded by the root path; tests are pure-logic per
 * 02-02-SUMMARY and never call Bitwig APIs.
 */
function listJavaFiles(root) {
  const out = [];
  let stack;
  try {
    stack = readdirSync(root);
  } catch {
    return out; // bridge/src/main/java missing — caller reports the error
  }
  for (const name of stack) {
    const p = join(root, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      out.push(...listJavaFiles(p));
    } else if (s.isFile() && name.endsWith(".java")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Receiver-name awareness: returns true when the receiver token plausibly
 * refers to an instance of `ownerFqcn`. We compare case-insensitively
 * against the simple class name (TrackBank → "trackbank"), accepting
 * "contains" so common variable-name shapes match:
 *   - `trackBank`            matches TrackBank
 *   - `this.trackBank`       matches TrackBank
 *   - `getTrackBank()`       matches TrackBank (chain prefix)
 *   - `cursorTrack`          does NOT match TrackBank (different type)
 *
 * The receiver "<expr>" sentinel (used when the call chains off an
 * anonymous subexpression like `cursorTrack.name().addValueObserver(...)`)
 * never matches — those calls are advisory-only and do not fail the gate
 * unless allowlisted or explicitly investigated.
 *
 * This is a heuristic, not type resolution: false negatives are possible if
 * the codebase names a TrackBank variable `bank` (the call would not flag).
 * The mitigation is codebase discipline: Bitwig-typed variables should carry
 * the class name (trackBank, cursorTrack, cursorDevice, transport, host).
 * The 02-02 bridge follows this convention already.
 */
function receiverMatchesClass(receiver, ownerFqcn) {
  if (!receiver || receiver === "<expr>") return false;
  const simple = ownerFqcn.split(".").pop().toLowerCase();
  const r = receiver.toLowerCase();
  // Strip a leading `this.` (or any qualifier prefix) — only the final
  // identifier segment participates in the comparison.
  const tail = r.split(".").pop();
  if (tail === simple) return true;
  if (tail.endsWith(simple)) return true;
  if (tail.includes(simple)) return true;
  return false;
}

/**
 * Scan a single source file for deprecated call sites. Returns an array of
 * findings. Each finding is one of:
 *
 *   { kind: "blocking",   ... } — receiver name matches an owner class; fails the gate
 *   { kind: "advisory",   ... } — receiver name does NOT match any owner; logged only
 *   { kind: "suppressed", ... } — allowlisted via // deprecated-allow: on the same line
 *
 * A call site is `\.${methodName}\(` on any receiver. The kind is decided
 * AFTER the receiver-name filter; the `// deprecated-allow:` marker
 * overrides both blocking and advisory to "suppressed".
 */
function scanSource(file, source, byName) {
  const findings = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [methodName, owners] of byName.entries()) {
      // Find every `.${methodName}(` occurrence on this line.
      const callRe = new RegExp(
        `\\.\\b${methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(`,
        "g",
      );
      let m;
      while ((m = callRe.exec(line)) !== null) {
        // Receiver: the identifier (or qualified chain) immediately before the `.`.
        // Walk backward from the `.` position to grab the receiver token.
        const dotIdx = m.index;
        let r = dotIdx;
        while (r > 0 && /[\w.]/.test(line[r - 1])) r--;
        const receiver = line.slice(r, dotIdx) || "<expr>";
        const col = m.index + 1; // 1-indexed column of the `.${methodName}` match
        const allowMatch = line.match(ALLOWLIST_MARKER);
        // Receiver-name filter: does the receiver plausibly match any owner?
        const matchedOwners = owners.filter((o) =>
          receiverMatchesClass(receiver, o.fqcn),
        );
        const kind = allowMatch
          ? "suppressed"
          : matchedOwners.length > 0
            ? "blocking"
            : "advisory";
        findings.push({
          kind,
          file,
          line: i + 1,
          col,
          methodName,
          receiver,
          owners: owners.map((o) => o.fqcn),
          matchedOwners: matchedOwners.map((o) => o.fqcn),
          rawArgs: owners.map((o) => o.rawArgs),
          replacementNotes: owners
            .map((o) => o.replacementNote)
            .filter(Boolean),
          visibleSigs: owners.map((o) => o.visibleSig),
          suppressReason: allowMatch ? allowMatch[1].trim() : null,
        });
      }
    }
  }
  return findings;
}

/**
 * Self-test fixtures: prove the validator flags known-bad and allows
 * known-allowlisted. The deprecated map is synthetic (two Bitwig-shaped
 * entries + one distractor that should NOT match any source call).
 */
function runSelfTest() {
  const deprecatedEntries = [
    {
      fqcn: "com.bitwig.extension.controller.api.TrackBank",
      methodName: "getTrack",
      rawArgs: "int",
      visibleSig: "com.bitwig.extension.controller.api.TrackBank.getTrack(int)",
      replacementNote: "use TrackBank.getChannel(int) instead.",
    },
    {
      fqcn: "com.bitwig.extension.controller.api.TrackBank",
      methodName: "getChannel",
      rawArgs: "int",
      visibleSig:
        "com.bitwig.extension.controller.api.TrackBank.getChannel(int)",
      replacementNote: "Use Bank.getItemAt(int) instead.",
    },
  ];
  const byName = indexByMethodName(deprecatedEntries);

  const fixture = `// fixture: bridge Java source
package com.bwbrain.bridge;
final Track t = trackBank.getTrack(i);          // line 3 — BLOCKING (receiver matches TrackBank)
final Track u = trackBank.getTrack(0);          // deprecated-allow: covered by bridge-audit 2026-06-28 (line 4 — SUPPRESSED)
final Track v = trackBank.getItemAt(i);         // line 5 — terminal non-deprecated, should NOT match
final Channel c = mixer.getChannel(2);          // line 6 — ADVISORY (receiver 'mixer' does NOT match TrackBank)
final Channel d = trackBank.getChannel(0);      // line 7 — BLOCKING (receiver matches TrackBank)
`;

  const findings = scanSource(
    "<self-test-fixture>",
    fixture,
    byName,
  );

  const errors = [];

  const blocking = findings.filter((f) => f.kind === "blocking");
  const advisory = findings.filter((f) => f.kind === "advisory");
  const suppressed = findings.filter((f) => f.kind === "suppressed");

  // BLOCKING: line 3 (trackBank.getTrack) + line 7 (trackBank.getChannel) = 2.
  if (blocking.length !== 2) {
    errors.push(
      `self-test: expected 2 BLOCKING findings, got ${blocking.length}: ${JSON.stringify(blocking, null, 2)}`,
    );
  }
  // ADVISORY: line 6 (mixer.getChannel — receiver doesn't match TrackBank) = 1.
  if (advisory.length !== 1) {
    errors.push(
      `self-test: expected 1 ADVISORY finding (receiver-name mismatch), got ${advisory.length}: ${JSON.stringify(advisory, null, 2)}`,
    );
  }
  // SUPPRESSED: line 4 (trackBank.getTrack with // deprecated-allow:) = 1.
  if (suppressed.length !== 1) {
    errors.push(
      `self-test: expected 1 SUPPRESSED finding, got ${suppressed.length}: ${JSON.stringify(suppressed, null, 2)}`,
    );
  }
  // getItemAt must NOT match — it is not in the deprecated map.
  const getItemAtHits = findings.filter((f) => f.methodName === "getItemAt");
  if (getItemAtHits.length > 0) {
    errors.push(
      `self-test: getItemAt is the terminal non-deprecated accessor but the validator matched it — false positive.`,
    );
  }
  // Spot-check line numbers so the report locates findings correctly.
  const line3 = findings.find(
    (f) => f.line === 3 && f.methodName === "getTrack" && f.kind === "blocking",
  );
  if (!line3) {
    errors.push(
      `self-test: expected a BLOCKING getTrack finding on line 3 (got: ${JSON.stringify(findings.filter((f) => f.line === 3))})`,
    );
  }
  const line4 = findings.find(
    (f) => f.line === 4 && f.methodName === "getTrack" && f.kind === "suppressed",
  );
  if (!line4) {
    errors.push(
      `self-test: expected a SUPPRESSED getTrack finding on line 4 (got: ${JSON.stringify(findings.filter((f) => f.line === 4))})`,
    );
  }
  const line6 = findings.find(
    (f) =>
      f.line === 6 &&
      f.methodName === "getChannel" &&
      f.kind === "advisory" &&
      f.receiver === "mixer",
  );
  if (!line6) {
    errors.push(
      `self-test: expected an ADVISORY getChannel finding on line 6 with receiver 'mixer' (got: ${JSON.stringify(findings.filter((f) => f.line === 6))})`,
    );
  }
  const line7 = findings.find(
    (f) =>
      f.line === 7 &&
      f.methodName === "getChannel" &&
      f.kind === "blocking" &&
      f.receiver === "trackBank",
  );
  if (!line7) {
    errors.push(
      `self-test: expected a BLOCKING getChannel finding on line 7 with receiver 'trackBank' (got: ${JSON.stringify(findings.filter((f) => f.line === 7))})`,
    );
  }

  return errors;
}

function main(argv) {
  let javadocPath = process.env.BITWIG_JAVADOC
    ? resolve(process.env.BITWIG_JAVADOC, "deprecated-list.html")
    : DEFAULT_JAVADOC_PATH;
  let selfTest = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") selfTest = true;
    else if (a === "--javadoc") {
      const v = argv[++i];
      if (!v) {
        console.error("✗ --javadoc requires a path argument");
        process.exit(2);
      }
      // Accept either the api/ dir or the deprecated-list.html file directly.
      javadocPath = v.endsWith("deprecated-list.html")
        ? resolve(v)
        : resolve(v, "deprecated-list.html");
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: check-deprecated-bridge.mjs [--self-test] [--javadoc <path>]\n",
      );
      process.exit(0);
    }
  }

  if (selfTest) {
    const errors = runSelfTest();
    if (errors.length > 0) {
      for (const e of errors) console.error(`✗ ${e}`);
      console.error("\nDeprecated-bridge gate self-test FAILED.");
      process.exit(1);
    }
    process.stdout.write(
      "✓ Deprecated-bridge gate self-test PASSED (flags known-bad, allows known-allowlisted, ignores terminal non-deprecated).\n",
    );
    process.exit(0);
  }

  // Parse the deprecated list.
  let html;
  try {
    html = readFileSync(javadocPath, "utf8");
  } catch {
    console.error(
      `✗ Cannot read Bitwig deprecated-list.html at: ${javadocPath}`,
    );
    console.error(
      "  Override via --javadoc <api-dir-or-file> or BITWIG_JAVADOC=<api-dir> env var.",
    );
    console.error(
      "  Default: /Applications/Bitwig Studio.app/Contents/Resources/Documentation/control-surface/api/",
    );
    process.exit(1);
  }
  const deprecatedEntries = parseDeprecatedList(html);
  if (deprecatedEntries.length === 0) {
    console.error(
      `✗ Parsed 0 deprecated entries from ${javadocPath} — the file shape may have changed; investigate the ENTRY_OPEN_RE regex.`,
    );
    process.exit(1);
  }
  const byName = indexByMethodName(deprecatedEntries);

  // Scan bridge sources.
  let sources;
  try {
    const s = statSync(BRIDGE_ROOT);
    if (!s.isDirectory()) throw new Error("not a directory");
    sources = listJavaFiles(BRIDGE_ROOT);
  } catch {
    console.error(
      `✗ Bridge source root not found: ${BRIDGE_ROOT}. Run from the project root.`,
    );
    process.exit(1);
  }
  if (sources.length === 0) {
    console.error(
      `✗ No .java files found under ${BRIDGE_ROOT} — nothing to scan.`,
    );
    process.exit(1);
  }

  const allFindings = [];
  for (const file of sources) {
    const src = readFileSync(file, "utf8");
    allFindings.push(...scanSource(file, src, byName));
  }

  const blocking = allFindings.filter((f) => f.kind === "blocking");
  const advisory = allFindings.filter((f) => f.kind === "advisory");
  const suppressed = allFindings.filter((f) => f.kind === "suppressed");

  if (blocking.length > 0) {
    console.error(
      `✗ Deprecated Bitwig API call sites in bridge/src/main/java: ${blocking.length}`,
    );
    for (const f of blocking) {
      const owners = f.matchedOwners.join(" | ");
      const notes = f.replacementNotes.length
        ? ` → ${[...new Set(f.replacementNotes)].join(" / ")}`
        : "";
      console.error(
        `  ${f.file}:${f.line}:${f.col}  ${f.receiver}.${f.methodName}(...)  [owner: ${owners}]${notes}`,
      );
    }
    if (advisory.length > 0) {
      console.error(
        `\n  (${advisory.length} advisory finding(s) — receiver name does not match a deprecated owner class; review and allowlist if false positive:)`,
      );
      for (const f of advisory) {
        console.error(
          `    ${f.file}:${f.line}  ${f.receiver}.${f.methodName}(...)  [could be: ${f.owners.join(" | ")}]`,
        );
      }
    }
    if (suppressed.length > 0) {
      console.error(
        `\n  (${suppressed.length} finding(s) suppressed via // deprecated-allow:)`,
      );
      for (const f of suppressed) {
        console.error(
          `    ${f.file}:${f.line}  ${f.receiver}.${f.methodName}(...)  — ${f.suppressReason}`,
        );
      }
    }
    console.error(
      `\nDeprecated-bridge gate FAILED: replace each deprecated call with the suggested terminal accessor, or annotate with // deprecated-allow: <reason>.`,
    );
    process.exit(1);
  }

  // Pass — report advisory + suppressed (allowlisted) findings for transparency.
  if (advisory.length > 0) {
    console.error(
      `ℹ ${advisory.length} advisory finding(s) — receiver name does not match a deprecated owner class (do not fail the gate):`,
    );
    for (const f of advisory) {
      console.error(
        `  ${f.file}:${f.line}  ${f.receiver}.${f.methodName}(...)  [could be: ${f.owners.join(" | ")}]`,
      );
    }
  }
  if (suppressed.length > 0) {
    console.error(
      `ℹ ${suppressed.length} allowlisted deprecated call site(s) (suppressed):`,
    );
    for (const f of suppressed) {
      console.error(
        `  ${f.file}:${f.line}  ${f.receiver}.${f.methodName}(...)  — ${f.suppressReason}`,
      );
    }
  }
  process.stdout.write(
    `✓ Deprecated-bridge gate PASSED: 0 blocking deprecated Bitwig call sites in bridge/src/main/java (scanned ${sources.length} file(s) against ${deprecatedEntries.length} deprecated entries; ${advisory.length} advisory, ${suppressed.length} suppressed).\n`,
  );
  process.exit(0);
}

main(process.argv.slice(2));
