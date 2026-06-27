import { defineConfig } from "vitest/config";

// Minimal ESM-native Vitest config (AGENTS.md: Vitest, ESM-native, fast).
// No special transform — Node 22.22.3 / tsx handle TypeScript directly.
//
// The include glob ALSO picks up the SC#1 accuracy harness at
// ../fixtures/representative-clips/accuracy-harness.test.ts (Plan 02-05). That
// test imports describe() via a relative path back into daemon/src; vitest 4.x's
// include glob is what makes a file ELIGIBLE to run, so the external path must
// be listed here (passing the path as a CLI filter does not override include).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "../fixtures/**/*.test.ts"],
  },
});
