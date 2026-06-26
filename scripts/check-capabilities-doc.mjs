#!/usr/bin/env node
// scripts/check-capabilities-doc.mjs
//
// Structural validator for docs/bitwig-capabilities.md (PROBE-01 / SC#2).
// Enforces D-04 (every gap row has a non-empty Mitigation) and the 6-section
// shape locked in 01-RESEARCH.md §Capability Probe Design Questions.
//
// Grepline-driven (string search), NOT a markdown parser — the doc is small
// and its shape is locked by the skeleton. This is SC#2 made executable.
//
// Run modes:
//   node scripts/check-capabilities-doc.mjs                # validate docs/bitwig-capabilities.md
//   node scripts/check-capabilities-doc.mjs --self-test    # validate an inline valid fixture (proves the validator)
//   node scripts/check-capabilities-doc.mjs --doc <path>   # validate an arbitrary doc path
//
// Exit 0 on pass, 1 on any structural failure. `.mjs` = native ESM (AGENTS.md line 162).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The 6 required sections. Matched as case-insensitive substrings of an `## ` heading
// (so "## 1. Undo Behavior", "## Undo behavior", "## UNDO BEHAVIOR" all match).
const REQUIRED_SECTIONS = [
  { key: "undo", needle: "Undo Behavior" },
  { key: "note-editing", needle: "Note-Editing Scope" },
  { key: "automation", needle: "Automation Write" },
  { key: "bank-paging", needle: "Bank Paging" },
  { key: "observer", needle: "Observer Granularity" },
  { key: "stable-ids", needle: "Stable IDs" },
];

// A Mitigation is "present and non-empty" when we find a `Mitigation` LABEL
// (not the bare word in prose) followed by content that is not just whitespace.
// Accepted label shapes (D-04: every gap → fact + Mitigation):
//   Mitigation: daemon-authoritative revert...        (inline label, colon required)
//   **Mitigation:** daemon-authoritative revert...    (bold inline label)
//   - Mitigation: daemon-authoritative revert...      (list-item label)
//   ### Mitigation\n<non-blank line>                  (sub-heading + content below)
// Rejects the bare word "mitigation" appearing in prose (no colon, no heading)
// — e.g. "NO mitigation here." must NOT count as a real Mitigation field.
const MITIGATION_INLINE_RE = /Mitigation\b\*{0,2}\s*:\s*\*{0,2}\s*(\S[^\n]*)/i;
const MITIGATION_HEADING_RE = /^#{1,6}\s+Mitigation\b\s*$/im;

// Inline valid fixture for --self-test: all 6 sections + a non-empty Mitigation each.
// Minimal but shape-complete. Proves the validator accepts a well-formed doc.
const SELF_TEST_FIXTURE = `# Bitwig Capabilities (self-test fixture)

API version: 21 (self-test).

## 1. Undo Behavior
Probe: add a note, undo, observe.
Observed: (self-test placeholder).
Mitigation: daemon-authoritative revert is the only safe path; native undo caveated.

## 2. Note-Editing Scope
Probe: addNote on launcher + arranger clips.
Observed: (self-test placeholder).
Mitigation: arranger clip editing not supported — route through launcher clips.

## 3. Automation Write
Probe: AutomatableParameter.set under transport play.
Observed: (self-test placeholder).
Mitigation: clip automation only on launcher clips; track automation via parameter envelopes.

## 4. Bank Paging
Probe: scroll TrackBank, observe cursor follow.
Observed: (self-test placeholder).
Mitigation: daemon reconciles bank-scroll window via fingerprint mapping (STATE-04).

## 5. Observer Granularity
Probe: register addSelectionObserver, measure fire rate.
Observed: (self-test placeholder).
Mitigation: observers enqueue onto bounded queue; worker drains (never block controller thread).

## 6. Stable IDs
Probe: dump track name+index, reorder, re-dump.
Observed: (self-test placeholder).
Mitigation: no stable native IDs — daemon synthesizes fingerprints (STATE-04 required).
`;

/**
 * Validate the structural shape of a capabilities doc string.
 * Returns an array of error messages (empty = pass).
 */
function validate(doc) {
  const errors = [];

  // 1. Each required section has at least one matching `## ` heading (case-insensitive substring).
  for (const { key, needle } of REQUIRED_SECTIONS) {
    const headingRe = new RegExp(
      `^##\\s+.*${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "im",
    );
    if (!headingRe.test(doc)) {
      errors.push(
        `Missing required section heading: "## ...${needle}" (key: ${key})`,
      );
    }
  }

  // 2. Each section that documents a gap MUST carry a non-empty Mitigation.
  //    We require AT LEAST ONE non-empty Mitigation line per required section,
  //    scoped to the section's text block (from its heading to the next ## or EOF).
  for (const { key, needle } of REQUIRED_SECTIONS) {
    // Locate the section body: from the heading line to the next ^## or end.
    const headingRe = new RegExp(
      `^##\\s+.*${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n`,
      "im",
    );
    const match = doc.match(headingRe);
    if (!match) continue; // already reported above
    const startIdx = match.index + match[0].length;
    const rest = doc.slice(startIdx);
    const nextHeading = rest.search(/^##\s/m);
    const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

    // Find a Mitigation LABEL with non-whitespace content after it.
    // Two acceptable shapes: inline `Mitigation: <text>` or sub-heading `### Mitigation\n<text>`.
    let found = false;

    // Inline label form.
    const inlineMatch = MITIGATION_INLINE_RE.exec(body);
    if (inlineMatch && inlineMatch[1] && inlineMatch[1].trim().length > 0) {
      found = true;
    }

    // Sub-heading form: heading line followed by a non-blank line.
    if (!found) {
      const headingMatch = MITIGATION_HEADING_RE.exec(body);
      if (headingMatch) {
        const after = body.slice(headingMatch.index + headingMatch[0].length);
        if (after.match(/^\s*\S[^\n]*/m)) found = true;
      }
    }

    if (!found) {
      errors.push(
        `Section "${needle}" is missing a non-empty Mitigation (D-04: every gap row needs fact + Mitigation).`,
      );
    }
  }

  return errors;
}

function main(argv) {
  let docPath = resolve("docs/bitwig-capabilities.md");
  let selfTest = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") selfTest = true;
    else if (a === "--doc") docPath = resolve(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: check-capabilities-doc.mjs [--self-test] [--doc <path>]\n",
      );
      process.exit(0);
    }
  }

  const doc = selfTest ? SELF_TEST_FIXTURE : readFileSync(docPath, "utf8");
  const errors = validate(doc);

  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(
      `\nCapabilities doc ${selfTest ? "(self-test fixture)" : docPath} failed structural validation.`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `✓ Capabilities doc ${selfTest ? "(self-test fixture)" : docPath} passed structural validation.\n`,
  );
  process.exit(0);
}

main(process.argv.slice(2));
