// daemon/src/store/state-cache.test.ts
//
// MEM-01 state-cache round-trip tests (RESEARCH.md Pattern 4 lines 495-511;
// 02-03a-PLAN.md Task 1 <behavior> state-cache tests; Shared Pattern H).
//
// state-cache wraps atomicWriteJson — every save() goes through the atomic
// primitive (never fs.writeFile directly). loadOrInit returns the empty
// default when the file is absent (no throw). After a save, loadOrInit returns
// the saved state (round-trip). .bw-brain/ is auto-created.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { readFile, mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrInit, save, emptyStateCache, StateCachePayload } from "./state-cache.js";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "bw-brain-cache-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("state-cache (MEM-01 — loadOrInit + save round-trip)", () => {
  it("loadOrInit on a missing path returns the empty default WITHOUT throwing", async () => {
    const dest = join(workDir, "missing.json");
    const cache = await loadOrInit(dest);
    expect(cache).toEqual(emptyStateCache());
    expect(cache.version).toBe("1.0");
    expect(cache.stableIds.byFingerprint).toEqual([]);
  });

  it("save then loadOrInit round-trips the payload", async () => {
    const dest = join(workDir, ".bw-brain", "state-cache.json");
    const payload: StateCachePayload = {
      version: "1.0",
      stableIds: {
        byFingerprint: [["e3b0c4425c0a8e3c", "trk_e3b0c4425c0a8e3c"]],
        byNameAndType: [["track:Kick", "trk_e3b0c4425c0a8e3c"]],
        byContentHash: [["ch_Kick", ["trk_e3b0c4425c0a8e3c"]]],
        lastSeen: [["trk_e3b0c4425c0a8e3c", 1000]],
      },
      lastRawState: { version: "1.0", project: { name: "X", tempo: 130, timeSignature: "4/4" }, selection: {} },
    };
    await save(dest, payload);
    const loaded = await loadOrInit(dest);
    // savedAt is set by save() — compare the fields we set, plus savedAt presence.
    expect(loaded.version).toBe(payload.version);
    expect(loaded.stableIds).toEqual(payload.stableIds);
    expect(loaded.lastRawState).toEqual(payload.lastRawState);
    expect(typeof loaded.savedAt).toBe("string");
    expect(loaded.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("save creates the .bw-brain/ directory when absent", async () => {
    const dest = join(workDir, ".bw-brain", "state-cache.json");
    // .bw-brain/ does not exist yet — save must create it via atomicWriteJson's mkdir.
    await save(dest, emptyStateCache());
    await expect(access(dest)).resolves.toBeUndefined();
  });

  it("save() writes via atomicWriteJson (the file is valid JSON on disk)", async () => {
    const dest = join(workDir, "state-cache.json");
    await save(dest, { version: "1.0", stableIds: emptyStateCache().stableIds });
    const raw = await readFile(dest, "utf8");
    // Must be valid JSON (atomicWriteJson never leaves a half-written file).
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("overwrites the previous cache on repeated saves (last-writer-wins)", async () => {
    const dest = join(workDir, "state-cache.json");
    await save(dest, { version: "1.0", stableIds: { byFingerprint: [["a", "trk_a"]], byNameAndType: [], byContentHash: [], lastSeen: [] } });
    await save(dest, { version: "1.0", stableIds: { byFingerprint: [["b", "trk_b"]], byNameAndType: [], byContentHash: [], lastSeen: [] } });
    const loaded = await loadOrInit(dest);
    expect(loaded.stableIds.byFingerprint).toEqual([["b", "trk_b"]]);
  });
});
