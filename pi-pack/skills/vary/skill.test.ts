// pi-pack/skills/vary/skill.test.ts
//
// Structural contract test for the Pi `/vary` SKILL.md (UX-02 / D-15). This is a
// CONTRACT test, not a behavioral test — the live Pi UX feel + motif-preservation
// audibility are the manual checkpoint M2/M3 (in-vivo, no automated test can
// reach them). Here we assert the skill-doc structure mirrors
// pi-pack/skills/analyze/SKILL.md and that it shells to the right `bw-*` CLI
// only (T-3-22 — no JSON-Lines wire-protocol leakage).
//
// Runs under daemon/vitest.config.ts whose `include` glob was extended to pick
// up ../pi-pack/skills/**/*.test.ts (Plan 03-05 BLOCKER-02 defense — without
// that glob entry this file would NEVER RUN and `npm test -- skill` would exit
// 0 vacuously).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** Sibling SKILL.md — located via import.meta.url so cwd does not matter. */
const SKILL_PATH = new URL("./SKILL.md", import.meta.url);

/**
 * Minimal YAML-frontmatter parser for the simple, flat shape these skill docs
 * use (name / description / user-invocable / metadata). The `metadata:` value is
 * a JSON object literal (quoted keys), so JSON.parse handles it; the scalar
 * fields are regex-extracted. No yaml dependency needed for a contract test.
 */
function parseSkillDoc(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("no YAML frontmatter block delimited by ---");
  const [, rawFm, body] = match;
  const frontmatter: Record<string, unknown> = {};
  for (const line of rawFm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (value.startsWith("{")) {
      frontmatter[key] = JSON.parse(value);
    } else if (value === "true") {
      frontmatter[key] = true;
    } else if (value === "false") {
      frontmatter[key] = false;
    } else {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
}

const content = readFileSync(SKILL_PATH, "utf8");
const { frontmatter, body } = parseSkillDoc(content);

describe("/vary SKILL.md contract (UX-02 / D-15)", () => {
  it("declares name: vary (matches the directory)", () => {
    expect(frontmatter.name).toBe("vary");
  });

  it("is user-invocable", () => {
    expect(frontmatter["user-invocable"]).toBe(true);
  });

  it("requires the bw-midi + bw-edit bins (shells to the CLI, not the wire protocol — T-3-22)", () => {
    const meta = frontmatter.metadata as {
      openclaw: { requires: { bins: string[] } };
    };
    expect(meta?.openclaw?.requires?.bins).toEqual(
      expect.arrayContaining(["bw-midi", "bw-edit"]),
    );
  });

  it("references `bw-midi vary` in its Steps (the CLI it shells to)", () => {
    expect(body).toContain("bw-midi vary");
  });

  it("has a Hard rules section carrying the D-15 invariant (no inline diffs)", () => {
    expect(body).toMatch(/Hard rules/);
    expect(body).toContain("D-15");
    // The picking signal is motif-similarity, NOT note detail.
    expect(body.toLowerCase()).toContain("no inline diffs");
  });

  it("carries motif-similarity + risk on every candidate line (UX-06 assumptions)", () => {
    // The skill body must instruct rendering motif + risk on each summary line.
    expect(body.toLowerCase()).toContain("motif");
    expect(body.toLowerCase()).toContain("risk");
  });

  it("does NOT teach Pi the JSON-Lines wire protocol (T-3-22)", () => {
    // The skill must not reference the daemon TCP port or the envelope wire shape.
    expect(body).not.toMatch(/127\.0\.0\.1:7878/);
    expect(body.toLowerCase()).not.toContain("json-lines");
    expect(body).not.toMatch(/\bapply\.patch\b/);
  });
});
