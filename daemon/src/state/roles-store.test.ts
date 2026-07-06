// daemon/src/state/roles-store.test.ts
//
// P4 / 04-02 Task 2 — atomic validated read/write for
// <project>/.bw-brain/roles.json (D-09 + D-13). Mirrors arrangement-snapshot
// (same ENOENT→null, atomic temp+rename, Ajv-at-boundary discipline).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRoles, saveRoles, type RolesFile } from "./roles-store.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "bw-brain-roles-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

/** A minimal-but-valid roles file for round-trip tests. */
function minimalRoles(): RolesFile {
  return {
    version: "1.0",
    classifiedAt: "2026-07-06T12:34:56.789Z",
    profile: "techno",
    tracks: {
      trk_abc123def4567890: {
        role: "kick",
        confidence: 0.94,
        alternatives: [
          { role: "percussion", score: 0.31 },
          { role: "bass", score: 0.18 },
        ],
      },
      trk_def456abc7890123: {
        role: "unknown",
        confidence: 0.42,
        alternatives: [
          { role: "pad", score: 0.41 },
          { role: "fx", score: 0.39 },
        ],
        assumption: "no template cleared 0.5",
      },
    },
  };
}

describe("loadRoles (ENOENT, invalid, valid)", () => {
  it("returns null for an ABSENT roles.json (no inference)", async () => {
    const path = join(tmpRoot, "roles.json");
    const result = await loadRoles(path);
    expect(result).toBeNull();
  });

  it("returns a validated RolesFile for a valid file", async () => {
    const path = join(tmpRoot, "roles.json");
    await writeFile(path, JSON.stringify(minimalRoles()), "utf8");
    const result = await loadRoles(path);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("1.0");
    expect(result!.profile).toBe("techno");
    expect(Object.keys(result!.tracks)).toHaveLength(2);
    expect(result!.tracks["trk_abc123def4567890"]!.role).toBe("kick");
    expect(result!.tracks["trk_abc123def4567890"]!.alternatives).toHaveLength(2);
  });

  it("throws for invalid JSON (parse error includes path)", async () => {
    const path = join(tmpRoot, "roles.json");
    await writeFile(path, "{ broken ", "utf8");
    await expect(loadRoles(path)).rejects.toThrow(/roles\.json/i);
  });

  it("throws when required top-level field is missing (Ajv error)", async () => {
    const path = join(tmpRoot, "roles.json");
    const bad = minimalRoles() as unknown as Record<string, unknown>;
    delete bad.version;
    await writeFile(path, JSON.stringify(bad), "utf8");
    await expect(loadRoles(path)).rejects.toThrow(/roles\.json/i);
  });

  it("throws when a track's confidence is out of range [0,1] (schema boundary)", async () => {
    const path = join(tmpRoot, "roles.json");
    const bad = minimalRoles();
    bad.tracks["trk_abc123def4567890"]!.confidence = 1.5; // > 1.0 violates schema
    await writeFile(path, JSON.stringify(bad), "utf8");
    await expect(loadRoles(path)).rejects.toThrow(/roles\.json/i);
  });

  it("accepts a track with optional assumption field (uncertain classification)", async () => {
    const path = join(tmpRoot, "roles.json");
    await writeFile(path, JSON.stringify(minimalRoles()), "utf8");
    const result = await loadRoles(path);
    expect(result!.tracks["trk_def456abc7890123"]!.assumption).toBe("no template cleared 0.5");
  });

  it("reads through a nested .bw-brain/ directory layout", async () => {
    const dir = join(tmpRoot, ".bw-brain");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "roles.json");
    await writeFile(path, JSON.stringify(minimalRoles()), "utf8");
    const result = await loadRoles(path);
    expect(result!.tracks["trk_abc123def4567890"]!.role).toBe("kick");
  });
});

describe("saveRoles (atomic, round-trip)", () => {
  it("round-trips: save → load → deep-equal", async () => {
    const path = join(tmpRoot, "roles.json");
    const roles = minimalRoles();
    await saveRoles(path, roles);
    const loaded = await loadRoles(path);
    expect(loaded).toEqual(roles);
  });

  it("writes via atomic temp+rename (no temp file visible)", async () => {
    const path = join(tmpRoot, "roles.json");
    await saveRoles(path, minimalRoles());
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(tmpRoot);
    const tempFiles = entries.filter((f) => f.includes(".tmp") || f.startsWith(".roles"));
    expect(tempFiles).toEqual([]);
  });

  it("creates the parent directory if missing", async () => {
    const dir = join(tmpRoot, ".bw-brain");
    const path = join(dir, "roles.json");
    await saveRoles(path, minimalRoles());
    const text = await readFile(path, "utf8");
    expect(JSON.parse(text).version).toBe("1.0");
  });

  it("overwrites an existing file atomically (save twice → second wins)", async () => {
    const path = join(tmpRoot, "roles.json");
    const first = minimalRoles();
    await saveRoles(path, first);
    const second = minimalRoles();
    second.tracks["trk_abc123def4567890"]!.role = "bass";
    await saveRoles(path, second);
    const loaded = await loadRoles(path);
    expect(loaded!.tracks["trk_abc123def4567890"]!.role).toBe("bass");
  });

  it("serializes pretty-printed JSON (2-space indent)", async () => {
    const path = join(tmpRoot, "roles.json");
    await saveRoles(path, minimalRoles());
    const text = await readFile(path, "utf8");
    expect(text).toMatch(/^{[\s\S]*\n}/);
    expect(text).toMatch(/\n  "version"/);
  });
});
