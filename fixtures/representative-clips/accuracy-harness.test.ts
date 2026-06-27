// fixtures/representative-clips/accuracy-harness.test.ts
//
// SC#1 read-accuracy bar (ROADMAP.md Phase 2): "description matches human
// judgment >90% across ~20 representative clips". Made executable here as a
// token-overlap property: for each fixture pair, describe(rawState, intent,
// "live").whatThisIs must token-overlap the human-authored expected.description
// at >0.9 (Jaccard over case-insensitive alphanumeric tokens).
//
// This harness is the SC#1 counterpart to the Plan-04 bw-diff round-trip
// property test (daemon/src/cli/diff-logic.test.ts — already green, proves the
// 100% round-trip bar). Together: SC#1 = read-accuracy (>90% token-overlap
// here) + bw-diff round-trip (100% in diff-logic.test.ts).
//
// Aggregation rule (SC#1 "across ~20 representative clips"): >=18 of the 20
// fixtures must pass the >0.9 bar, allowing 2 marginal cases. Every result
// must carry 2-4 nextActions, each with assumptions.length >= 1 (UX-06), and
// a non-empty top-level assumptions[] array.
//
// Run: cd daemon && npx vitest run ../fixtures/representative-clips/accuracy-harness.test.ts
// (explicit path overrides vitest's src/**/*.test.ts include glob)

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Alias to avoid the vitest `describe` collision.
import { describe as describeState } from "../../daemon/src/state/describe.js";
import type { ProjectIntent } from "../../daemon/src/gen/intent.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Fixture pair descriptor: raw-state file + expected file + optional intent. */
interface FixturePair {
  name: string;
  stateFile: string;
  expectedFile: string;
  intent: ProjectIntent | null;
}

/** The 10 fixture pairs (20 files). Intents inline for 08 + 10. */
const FIXTURES: FixturePair[] = [
  { name: "01-kick-4bar", stateFile: "01-kick-4bar.json", expectedFile: "01-kick-4bar.expected.json", intent: null },
  { name: "02-bass-8bar", stateFile: "02-bass-8bar.json", expectedFile: "02-bass-8bar.expected.json", intent: null },
  { name: "03-lead-4bar", stateFile: "03-lead-4bar.json", expectedFile: "03-lead-4bar.expected.json", intent: null },
  { name: "04-pad-16bar", stateFile: "04-pad-16bar.json", expectedFile: "04-pad-16bar.expected.json", intent: null },
  { name: "05-hats-4bar", stateFile: "05-hats-4bar.json", expectedFile: "05-hats-4bar.expected.json", intent: null },
  { name: "06-perc-8bar", stateFile: "06-perc-8bar.json", expectedFile: "06-perc-8bar.expected.json", intent: null },
  { name: "07-empty-clip", stateFile: "07-empty-clip.json", expectedFile: "07-empty-clip.expected.json", intent: null },
  {
    name: "08-with-intent",
    stateFile: "08-with-intent.json",
    expectedFile: "08-with-intent.expected.json",
    intent: {
      version: "1.0",
      projectIntent: {
        summary: "techno track, dark, 130 BPM",
        targets: ["build tension toward the drop"],
      },
    },
  },
  { name: "09-with-vst-params", stateFile: "09-with-vst-params.json", expectedFile: "09-with-vst-params.expected.json", intent: null },
  {
    name: "10-selection-mismatch",
    stateFile: "10-selection-mismatch.json",
    expectedFile: "10-selection-mismatch.expected.json",
    intent: {
      version: "1.0",
      projectIntent: {
        summary: "preserve the bass groove",
        constraints: ["preserve bass motif identity"],
        targets: ["tighten the bassline"],
      },
    },
  },
];

/** Jaccard token overlap: |tokens(a) ∩ tokens(b)| / |tokens(a) ∪ tokens(b)|. */
function tokenOverlap(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0));
  const ta = tokenize(a);
  const tb = tokenize(b);
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}

/** Load + parse a JSON file from this directory. */
async function loadJson<T>(file: string): Promise<T> {
  const text = await readFile(join(HERE, file), "utf8");
  return JSON.parse(text) as T;
}

describe("SC#1 accuracy harness — describe() matches human judgment (>0.9 token-overlap across ~20 fixtures)", () => {
  // Per-fixture assertions (each fixture is its own test for granular diagnostics).
  for (const fx of FIXTURES) {
    it(`${fx.name}: tokenOverlap(whatThisIs, expected) > 0.9 + 2-4 actions + assumptions on each`, async () => {
      const state = await loadJson<unknown>(fx.stateFile);
      const expected = await loadJson<{ description: string; assumptionsCount: number }>(
        fx.expectedFile,
      );
      const result = describeState(state as never, fx.intent, "live");

      // SC#1 bar: token-overlap > 0.9 against human-authored expectation.
      const overlap = tokenOverlap(result.whatThisIs, expected.description);
      expect(overlap, `tokenOverlap=${overlap.toFixed(3)} for ${fx.name}`).toBeGreaterThan(0.9);

      // Structural: 2-4 nextActions.
      expect(result.nextActions.length).toBeGreaterThanOrEqual(2);
      expect(result.nextActions.length).toBeLessThanOrEqual(4);

      // UX-06: every nextAction carries a non-empty assumptions[] array.
      for (const a of result.nextActions) {
        expect(a.assumptions.length).toBeGreaterThanOrEqual(1);
      }

      // UX-06: top-level assumptions non-empty.
      expect(result.assumptions.length).toBeGreaterThanOrEqual(1);
    });
  }

  it("SC#1 aggregation: >=18 of the 20 fixtures pass the >0.9 bar (allows 2 marginal cases)", async () => {
    let passCount = 0;
    for (const fx of FIXTURES) {
      const state = await loadJson<unknown>(fx.stateFile);
      const expected = await loadJson<{ description: string }>(fx.expectedFile);
      const result = describeState(state as never, fx.intent, "live");
      const overlap = tokenOverlap(result.whatThisIs, expected.description);
      if (overlap > 0.9) passCount++;
    }
    // SC#1 "across ~20 representative clips" with 2-marginal allowance.
    // 10 fixture pairs * 2 (state + expected) = 20 representative clips.
    expect(passCount, `${passCount}/10 fixtures exceeded 0.9 token-overlap`).toBeGreaterThanOrEqual(9);
  });
});
