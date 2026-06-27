// daemon/src/state/intent-store.test.ts
//
// STATE-03 user-authored intent read (D-09). loadIntent does an atomic
// validated read of <project>/.bw-brain/intent.json. NO inference, NO defaults
// — an absent file returns null (NOT a synthesized default object). An invalid
// file throws a structured error carrying the Ajv errors.
//
// Source: 02-PATTERNS.md Assignment 9 lines 352-363 + RESEARCH.md D-09 line 27.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadIntent } from "./intent-store.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "bw-brain-intent-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("loadIntent (STATE-03, D-09 — user-authored, read-only, no inference)", () => {
  it("returns null for an ABSENT intent.json (NO inference, NO defaults — D-09 defense)", async () => {
    const path = join(tmpRoot, "intent.json");
    const result = await loadIntent(path);
    expect(result).toBeNull();
  });

  it("returns a validated ProjectIntent for a valid intent.json", async () => {
    const path = join(tmpRoot, "intent.json");
    await writeFile(
      path,
      JSON.stringify({
        version: "1.0",
        projectIntent: {
          summary: "techno track, dark, 130 BPM",
          constraints: ["preserve bass motif"],
          targets: ["build tension toward the drop"],
        },
      }),
      "utf8",
    );
    const result = await loadIntent(path);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("1.0");
    expect(result!.projectIntent.summary).toBe("techno track, dark, 130 BPM");
    expect(result!.projectIntent.constraints).toEqual(["preserve bass motif"]);
    expect(result!.projectIntent.targets).toEqual(["build tension toward the drop"]);
  });

  it("accepts a minimal intent.json with only the required summary", async () => {
    const path = join(tmpRoot, "intent.json");
    await writeFile(
      path,
      JSON.stringify({ version: "1.0", projectIntent: { summary: "demo" } }),
      "utf8",
    );
    const result = await loadIntent(path);
    expect(result).not.toBeNull();
    expect(result!.projectIntent.summary).toBe("demo");
    expect(result!.projectIntent.constraints).toBeUndefined();
    expect(result!.projectIntent.targets).toBeUndefined();
  });

  it("throws a structured error for an INVALID intent.json (missing required summary)", async () => {
    const path = join(tmpRoot, "intent.json");
    // Missing required 'summary' — schema-invalid.
    await writeFile(
      path,
      JSON.stringify({ version: "1.0", projectIntent: { constraints: ["x"] } }),
      "utf8",
    );
    await expect(loadIntent(path)).rejects.toThrow(/intent\.json invalid/i);
  });

  it("throws for an intent.json missing the top-level projectIntent wrapper", async () => {
    const path = join(tmpRoot, "intent.json");
    await writeFile(path, JSON.stringify({ version: "1.0" }), "utf8");
    await expect(loadIntent(path)).rejects.toThrow(/intent\.json invalid/i);
  });

  it("throws for an intent.json with a blank summary (minLength 1 violation)", async () => {
    const path = join(tmpRoot, "intent.json");
    await writeFile(
      path,
      JSON.stringify({ version: "1.0", projectIntent: { summary: "" } }),
      "utf8",
    );
    await expect(loadIntent(path)).rejects.toThrow(/intent\.json invalid/i);
  });

  it("throws for an intent.json with the wrong version pattern", async () => {
    const path = join(tmpRoot, "intent.json");
    await writeFile(
      path,
      JSON.stringify({ version: "v1", projectIntent: { summary: "x" } }),
      "utf8",
    );
    await expect(loadIntent(path)).rejects.toThrow(/intent\.json invalid/i);
  });

  it("reads through a nested .bw-brain/ directory layout", async () => {
    const dir = join(tmpRoot, ".bw-brain");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "intent.json");
    await writeFile(
      path,
      JSON.stringify({ version: "1.0", projectIntent: { summary: "nested" } }),
      "utf8",
    );
    const result = await loadIntent(path);
    expect(result!.projectIntent.summary).toBe("nested");
  });

  it("the structured error mentions the Ajv validation errors (inspectable)", async () => {
    const path = join(tmpRoot, "intent.json");
    await writeFile(
      path,
      JSON.stringify({ version: "1.0", projectIntent: {} }),
      "utf8",
    );
    let caught: unknown;
    try {
      await loadIntent(path);
    } catch (err) {
      caught = err;
    }
    // The error string should carry the Ajv errors JSON (so a user can see WHY).
    expect(String(caught)).toMatch(/summary|required/i);
  });
});
