import { defineConfig } from "vitest/config";

// Minimal ESM-native Vitest config (AGENTS.md: Vitest, ESM-native, fast).
// No special transform — Node 22.22.3 / tsx handle TypeScript directly.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
