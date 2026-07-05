// pi-pack/skills/diff/skill.test.ts
//
// Structural contract test for the Pi `/diff` SKILL.md (UX-02 / D-15 on-demand
// diff pane). Asserts the skill-doc structure mirrors
// pi-pack/skills/analyze/SKILL.md and shells to `bw-edit preview` only (T-3-22).
//
// Runs under daemon/vitest.config.ts (include glob extended for
// ../pi-pack/skills/**/*.test.ts — Plan 03-05 BLOCKER-02 defense).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** Sibling SKILL.md — located via import.meta.url so cwd does not matter. */
const SKILL_PATH = new URL("./SKILL.md", import.meta.url);

/**
 * Minimal YAML-frontmatter parser for the flat skill-doc shape
 * (name / description / user-invocable / metadata-as-JSON-literal).
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

describe("/diff SKILL.md contract (UX-02 / D-15 on-demand diff pane)", () => {
  it("declares name: diff (matches the directory)", () => {
    expect(frontmatter.name).toBe("diff");
  });

  it("is user-invocable", () => {
    expect(frontmatter["user-invocable"]).toBe(true);
  });

  it("requires only the bw-edit bin (shells to the CLI, not the wire protocol — T-3-22)", () => {
    const meta = frontmatter.metadata as {
      openclaw: { requires: { bins: string[] } };
    };
    expect(meta?.openclaw?.requires?.bins).toEqual(
      expect.arrayContaining(["bw-edit"]),
    );
  });

  it("references `bw-edit preview` in its Steps (the CLI it shells to)", () => {
    expect(body).toContain("bw-edit preview");
  });

  it("renders the StateDiff pane shape (added/removed/changed + motif score)", () => {
    expect(body.toLowerCase()).toContain("statediff");
    expect(body.toLowerCase()).toContain("added");
    expect(body.toLowerCase()).toContain("removed");
    expect(body.toLowerCase()).toContain("changed");
    expect(body.toLowerCase()).toContain("motif");
  });

  it("points the user at /apply as the follow-up (the two-step D-04 flow)", () => {
    expect(body).toMatch(/\/apply/);
  });

  it("does NOT teach Pi the JSON-Lines wire protocol (T-3-22)", () => {
    expect(body).not.toMatch(/127\.0\.0\.1:7878/);
    expect(body.toLowerCase()).not.toContain("json-lines");
    expect(body).not.toMatch(/\bapply\.patch\b/);
  });

  it("states live AND stale are trustworthy (D-10 — relaxed gate)", () => {
    // The relaxed daemon gate (commit 7a7e7cf) refuses only on `disconnected`;
    // `stale` proceeds because the daemon pulls fresh state per call. The skill
    // prompts must echo this verbatim.
    expect(body).toMatch(/stale.*trustworthy|trustworthy.*stale/i);
    expect(body).toMatch(/disconnected.*refus|refus.*disconnected/i);
  });

  it("does NOT frame stale as untrustworthy (D-10 regression guard)", () => {
    // BLOCKER-02 discipline: guard against re-introducing stale-as-untrustworthy
    // phrasing in future skill edits. The daemon gate is the contract; the skills
    // match it without dramatization.
    expect(body).not.toMatch(/stale.*(untrustworthy|unreliable|refus)/i);
  });
});
