// pi-pack/skills/apply/skill.test.ts
//
// Structural contract test for the Pi `/apply` SKILL.md (UX-02 / D-04 / D-09).
// Asserts the skill-doc structure mirrors pi-pack/skills/analyze/SKILL.md and
// shells to `bw-edit` only (T-3-22). The live apply → revert round-trip feel is
// manual checkpoint M2.
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

describe("/apply SKILL.md contract (UX-02 / D-04 / D-09)", () => {
  it("declares name: apply (matches the directory)", () => {
    expect(frontmatter.name).toBe("apply");
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

  it("references `bw-edit apply` in its Steps (the CLI it shells to)", () => {
    expect(body).toContain("bw-edit apply");
  });

  it("references `bw-edit revert` as the reversal instruction (D-03 daemon-authoritative)", () => {
    expect(body).toContain("bw-edit revert");
  });

  it("has a Hard rules section carrying the D-04/D-09 invariants", () => {
    expect(body).toMatch(/Hard rules/);
    expect(body).toContain("D-04");
    expect(body).toContain("D-09");
  });

  it("states --allow-below-bar RECLASSIFIES as high risk and still requires --confirm (D-09)", () => {
    expect(body).toContain("--allow-below-bar");
    expect(body).toContain("--confirm");
    // The D-09 invariant: below-bar override is high-risk + still confirmed.
    expect(body.toLowerCase()).toMatch(/high risk|reclassif/);
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

  it("surfaces wrong_clip_targeted with the recovery hint (D-04/D-06)", () => {
    // The /apply skill must surface the wrong_clip_targeted structured error
    // (Plan 03.1-03 implements the error code; this prompt prepares the surface)
    // and tell the producer to re-select / re-preview — never override.
    expect(body).toContain("wrong_clip_targeted");
    expect(body).toMatch(/re-select.*preview|re-preview/i);
  });
});
