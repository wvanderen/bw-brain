import { defineConfig } from "vitest/config";

// Minimal ESM-native Vitest config (AGENTS.md: Vitest, ESM-native, fast).
// No special transform — Node 22.22.3 / tsx handle TypeScript directly.
//
// The include glob ALSO picks up external test files. vitest 4.x's include glob
// is what makes a file ELIGIBLE to run — passing a path as a CLI filter does NOT
// override include, so any external path must be listed here explicitly.
//   - ../fixtures/representative-clips/accuracy-harness.test.ts (Plan 02-05):
//     imports describe() via a relative path back into daemon/src.
//   - ../pi-pack/skills/**/*.test.ts (Plan 03-05, BLOCKER-02 defense): structural
//     contract tests for the Pi /vary /apply /diff SKILL.md files. WITHOUT this
//     entry `npm test -- skill` exits 0 vacuously ("No test files found") — a
//     false green exactly the Nyquist Dimension 8a failure mode.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "../fixtures/**/*.test.ts",
      "../pi-pack/skills/**/*.test.ts",
    ],
  },
});
