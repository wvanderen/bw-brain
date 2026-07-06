// daemon/src/state/arrangement-snapshot.test.ts
//
// P4 / 04-02 Task 2 — atomic validated read/write for
// <project>/.bw-brain/arrangement-snapshot.json (D-03 + D-13). Mirrors the
// intent-store.ts atomic-validated-read pattern (ENOENT→null; Ajv at boundary;
// atomic temp+rename on save).
//
// Source: 04-PATTERNS.md §arrangement-snapshot.ts (lines 372-423).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadArrangementSnapshot,
  saveArrangementSnapshot,
  type ArrangementSnapshot,
} from "./arrangement-snapshot.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "bw-brain-snap-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

/** A minimal-but-valid snapshot for round-trip + save tests. */
function minimalSnapshot(): ArrangementSnapshot {
  return {
    version: "1.0",
    pulledAt: "2026-07-06T12:34:56.789Z",
    profile: "techno",
    sceneCount: 2,
    trackCount: 1,
    grid: {
      tracks: [
        {
          trackSid: "trk_abc123def4567890",
          name: "Kick",
          scenes: [
            { sceneIdx: 0, clipSid: "clip_a1b2c3d4e5f60718", hasContent: true, loopBeats: 16, notes: [] },
            { sceneIdx: 1, clipSid: "clip_0000000000000000", hasContent: false, loopBeats: 0, notes: [] },
          ],
        },
      ],
      sceneNames: ["Intro", "Drop"],
    },
  };
}

describe("loadArrangementSnapshot (ENOENT, invalid, valid)", () => {
  it("returns null for an ABSENT arrangement-snapshot.json (no inference)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    const result = await loadArrangementSnapshot(path);
    expect(result).toBeNull();
  });

  it("returns a validated ArrangementSnapshot for a valid file", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    await writeFile(path, JSON.stringify(minimalSnapshot()), "utf8");
    const result = await loadArrangementSnapshot(path);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("1.0");
    expect(result!.profile).toBe("techno");
    expect(result!.sceneCount).toBe(2);
    expect(result!.grid.tracks).toHaveLength(1);
    expect(result!.grid.tracks[0]!.scenes[0]!.clipSid).toBe("clip_a1b2c3d4e5f60718");
  });

  it("throws a structured error for an invalid JSON file (parse error includes path)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    await writeFile(path, "{ not valid json ", "utf8");
    await expect(loadArrangementSnapshot(path)).rejects.toThrow(/arrangement-snapshot\.json/i);
  });

  it("throws when required top-level field is missing (Ajv error includes path)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    const bad = minimalSnapshot() as unknown as Record<string, unknown>;
    delete bad.version; // missing required field
    await writeFile(path, JSON.stringify(bad), "utf8");
    await expect(loadArrangementSnapshot(path)).rejects.toThrow(/arrangement-snapshot\.json/i);
  });

  it("throws when grid.tracks[].scenes[].hasContent is non-boolean (schema boundary)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    const bad = minimalSnapshot();
    // Tamper: hasContent should be boolean, not string.
    (bad.grid.tracks[0] as unknown as { scenes: Array<{ hasContent: unknown }> }).scenes[0].hasContent = "yes";
    await writeFile(path, JSON.stringify(bad), "utf8");
    await expect(loadArrangementSnapshot(path)).rejects.toThrow(/arrangement-snapshot\.json/i);
  });

  it("accepts a snapshot with optional derived field (pre-analysis is valid)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    const snap = minimalSnapshot();
    snap.derived = {
      sections: [{ startScene: 0, endScene: 1, label: "intro", avgSimilarity: 0.8, confidence: 0.9 }],
    };
    await writeFile(path, JSON.stringify(snap), "utf8");
    const result = await loadArrangementSnapshot(path);
    expect(result!.derived?.sections).toHaveLength(1);
  });

  it("reads through a nested .bw-brain/ directory layout", async () => {
    const dir = join(tmpRoot, ".bw-brain");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "arrangement-snapshot.json");
    await writeFile(path, JSON.stringify(minimalSnapshot()), "utf8");
    const result = await loadArrangementSnapshot(path);
    expect(result!.profile).toBe("techno");
  });
});

describe("saveArrangementSnapshot (atomic, round-trip)", () => {
  it("round-trips: save → load → deep-equal", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    const snap = minimalSnapshot();
    await saveArrangementSnapshot(path, snap);
    const loaded = await loadArrangementSnapshot(path);
    expect(loaded).toEqual(snap);
  });

  it("writes via atomic temp+rename (no partial file visible after save)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    await saveArrangementSnapshot(path, minimalSnapshot());
    // After save, no temp files should remain in the directory.
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(tmpRoot);
    const tempFiles = entries.filter((f) => f.includes(".tmp") || f.startsWith(".arrangement"));
    expect(tempFiles).toEqual([]);
  });

  it("creates the parent directory if missing (atomic-write auto-mkdir)", async () => {
    const dir = join(tmpRoot, ".bw-brain");
    const path = join(dir, "arrangement-snapshot.json");
    await saveArrangementSnapshot(path, minimalSnapshot());
    // The file must now exist (mkdir recursive was called).
    const text = await readFile(path, "utf8");
    expect(JSON.parse(text).version).toBe("1.0");
  });

  it("overwrites an existing file atomically (save twice → second wins)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    const first = minimalSnapshot();
    first.sceneCount = 2;
    await saveArrangementSnapshot(path, first);
    const second = minimalSnapshot();
    second.sceneCount = 8;
    await saveArrangementSnapshot(path, second);
    const loaded = await loadArrangementSnapshot(path);
    expect(loaded!.sceneCount).toBe(8);
  });

  it("serializes pretty-printed JSON (2-space indent — inspectable on disk)", async () => {
    const path = join(tmpRoot, "arrangement-snapshot.json");
    await saveArrangementSnapshot(path, minimalSnapshot());
    const text = await readFile(path, "utf8");
    // Pretty-printed JSON contains newlines + 2-space indentation.
    expect(text).toMatch(/^{[\s\S]*\n}/);
    expect(text).toMatch(/\n  "version"/);
  });
});
