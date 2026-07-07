// pi-pack/skills/review/skill.test.ts
//
// Structural contract test for the Pi `/review` SKILL.md (UX-03 / D-11). This is
// a CONTRACT test, not a behavioral test — the live Pi UX feel + the ASCII
// rendering legibility are the end-of-phase UAT (in-vivo Bitwig, no automated
// test can reach them). Here we assert the skill-doc structure mirrors
// pi-pack/skills/vary/SKILL.md + analyze/SKILL.md, that it shells to the right
// `bw-arrange` CLI only (T-3-22 — no JSON-Lines wire-protocol leakage), that
// the D-10 freshness gate language is present, that `pulledAt` is surfaced as
// an assumption (Pitfall 8 — snap-stale defense), and that transition
// observations are framed ADVISORY (D-10 — never auto-applied).
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
 * use (name / description / user-invocable / metadata). The `metadata:` value
 * is a JSON object literal (quoted keys), so JSON.parse handles it; the scalar
 * fields are regex-extracted. No yaml dependency needed for a contract test.
 * (Copied verbatim from vary/skill.test.ts:27-50 — BLOCKER-02 sibling pattern.)
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

describe("/review SKILL.md contract (UX-03 / D-11)", () => {
  it("declares name: review (matches the directory)", () => {
    expect(frontmatter.name).toBe("review");
  });

  it("is user-invocable", () => {
    expect(frontmatter["user-invocable"]).toBe(true);
  });

  it("requires the bw-arrange bin (shells to the CLI, not the wire protocol — T-3-22)", () => {
    const meta = frontmatter.metadata as {
      openclaw: { requires: { bins: string[] } };
    };
    expect(meta?.openclaw?.requires?.bins).toEqual(
      expect.arrayContaining(["bw-arrange"]),
    );
  });

  it("references `bw-arrange review` in its Steps (the CLI it shells to)", () => {
    expect(body).toContain("bw-arrange review");
  });

  it("has a Hard rules section", () => {
    expect(body).toMatch(/Hard rules/);
  });

  it("does NOT teach Pi the JSON-Lines wire protocol (T-3-22)", () => {
    // The skill must not reference the daemon TCP port or the envelope wire shape.
    expect(body).not.toMatch(/127\.0\.0\.1:7878/);
    expect(body.toLowerCase()).not.toContain("json-lines");
    expect(body).not.toMatch(/\bapply\.patch\b/);
  });

  it("states live AND stale are BOTH trustworthy (D-10 — relaxed freshness gate)", () => {
    // The relaxed daemon gate refuses only on `disconnected`; `stale` proceeds
    // because the daemon pulls fresh state per call. The skill prompts must
    // echo this verbatim (mirrors vary/SKILL.md:54-63).
    expect(body).toMatch(/stale.*trustworthy|trustworthy.*stale/i);
    expect(body).toMatch(/disconnected.*refus|refus.*disconnected/i);
  });

  it("does NOT frame stale as untrustworthy (D-10 regression guard)", () => {
    // BLOCKER-02 discipline: guard against re-introducing stale-as-untrustworthy
    // phrasing in future skill edits. The daemon gate is the contract; the
    // skills match it without dramatization.
    expect(body).not.toMatch(/stale.*(untrustworthy|unreliable)/i);
  });

  it("surfaces pulledAt as an assumption (Pitfall 8 — snap-stale defense)", () => {
    // The snapshot's pulledAt ISO timestamp MUST appear in every /review as an
    // assumption so the producer always knows how stale the analysis is.
    expect(body.toLowerCase()).toContain("pulledat");
  });

  it("forbids auto-applying transition observations (D-10 advisory discipline)", () => {
    // Transition observations are ADVISORY (D-10) — the producer acts manually
    // in Bitwig. The skill body must say so (advisory / manual language).
    expect(body).toMatch(/advisory|manual/i);
  });

  it("forbids inventing section labels the daemon didn't return (Pitfall 7)", () => {
    // Below-threshold = unknown or omitted, NEVER guessed. The skill must
    // carry this Pitfall 7 hard rule (mirrors analyze/SKILL.md:44 stance).
    expect(body.toLowerCase()).toMatch(/invent|unknown|below.threshold|guess/);
  });
});
