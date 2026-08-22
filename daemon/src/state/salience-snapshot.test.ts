// daemon/src/state/salience-snapshot.test.ts
//
// Phase 5 / 05-04 Task 2 — durable salience snapshot store (D-05-04: the
// 04.3 snapshot+freshness pattern cloned from arrangement-snapshot.ts — the
// roles-store.ts sibling-clone precedent).
//
// The four analog invariants + the bounded-aggregate cap:
//   1. ENOENT → null (never a synthesized default).
//   2. Corrupt/invalid file → throw with the path + Ajv error summary.
//   3. Save REFUSES a schema-invalid snapshot BEFORE atomicWriteJson — the
//      file on disk is unchanged (04.3-07 DEFECT B discipline).
//   4. save → load round-trips deep-equal with pulledAt preserved.
//   5. A snapshot with 513 param entries fails validation (bounded ≤ 512).
//   6. No `format:` keywords in the inline schema (grep-level assertion).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadSalienceSnapshot,
  saveSalienceSnapshot,
  type SalienceSnapshot,
} from "./salience-snapshot.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "bw-brain-salience-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

/** A minimal-but-valid salience snapshot (ranked params, macro first). */
function minimalSnapshot(): SalienceSnapshot {
  return {
    version: "1.0",
    pulledAt: "2026-08-22T12:34:56.789Z",
    profile: "generic",
    tracks: [
      {
        trackKey: "trk_0123456789abcdef",
        params: [
          {
            paramKey: "remote_page:0",
            deviceKey: "dev_0123456789abcdef",
            paramIndex: 0,
            paramName: "Macro 1",
            source: "remote_page",
            movementCount: 20,
            valueRange: 0.6,
            lastValue: 0.5,
            salience: 0.954,
          },
          {
            paramKey: "device_parameter:3",
            deviceKey: "dev_0123456789abcdef",
            paramIndex: 3,
            source: "device_parameter",
            movementCount: 12,
            valueRange: 0.4,
            lastValue: 0.2,
            salience: 0.512,
          },
        ],
      },
    ],
  };
}

describe("loadSalienceSnapshot (ENOENT, invalid, valid)", () => {
  it("Test 1: returns null for an ABSENT salience-snapshot.json (no inference)", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const result = await loadSalienceSnapshot(path);
    expect(result).toBeNull();
  });

  it("returns a validated SalienceSnapshot for a valid file", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    await writeFile(path, JSON.stringify(minimalSnapshot()), "utf8");
    const result = await loadSalienceSnapshot(path);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("1.0");
    expect(result!.pulledAt).toBe("2026-08-22T12:34:56.789Z");
    expect(result!.tracks).toHaveLength(1);
    expect(result!.tracks[0]!.params).toHaveLength(2);
    expect(result!.tracks[0]!.params[0]!.source).toBe("remote_page");
  });

  it("Test 2: throws a structured error for invalid JSON (message carries the path + parse context)", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    await writeFile(path, "{ not valid json ", "utf8");
    await expect(loadSalienceSnapshot(path)).rejects.toThrow(/salience-snapshot\.json/i);
  });

  it("Test 2: throws with the path + Ajv errors when a required field is missing", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const bad = minimalSnapshot() as unknown as Record<string, unknown>;
    delete bad.pulledAt; // required top-level field
    await writeFile(path, JSON.stringify(bad), "utf8");
    await expect(loadSalienceSnapshot(path)).rejects.toThrow(/salience-snapshot\.json/i);
  });

  it("refuses a snapshot whose param entry carries a non-enum source (schema boundary)", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const bad = minimalSnapshot();
    (bad.tracks[0]!.params[0] as unknown as { source: string }).source = "envelope_read";
    await writeFile(path, JSON.stringify(bad), "utf8");
    await expect(loadSalienceSnapshot(path)).rejects.toThrow(/salience-snapshot\.json/i);
  });

  it("refuses an EVENT-STREAM shape: a params entry carrying a values[] history (aggregates only, T-05-10)", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const bad = minimalSnapshot() as unknown as {
      tracks: Array<{ params: Array<Record<string, unknown>> }>;
    };
    bad.tracks[0].params[0].values = [0.1, 0.2, 0.3]; // additionalProperties:false
    await writeFile(path, JSON.stringify(bad), "utf8");
    await expect(loadSalienceSnapshot(path)).rejects.toThrow(/salience-snapshot\.json/i);
  });
});

describe("saveSalienceSnapshot (schema gate, atomic, round-trip)", () => {
  it("Test 4: save → load round-trips deep-equal with pulledAt preserved", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const snap = minimalSnapshot();
    await saveSalienceSnapshot(path, snap);
    const loaded = await loadSalienceSnapshot(path);
    expect(loaded).toEqual(snap);
    expect(loaded!.pulledAt).toBe(snap.pulledAt);
  });

  it("writes via atomic temp+rename (no temp files remain)", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    await saveSalienceSnapshot(path, minimalSnapshot());
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(tmpRoot);
    const tempFiles = entries.filter((f) => f.includes(".tmp"));
    expect(tempFiles).toEqual([]);
  });

  it("creates the parent directory if missing (atomic-write auto-mkdir)", async () => {
    const dir = join(tmpRoot, ".bw-brain");
    const path = join(dir, "salience-snapshot.json");
    await saveSalienceSnapshot(path, minimalSnapshot());
    const text = await readFile(path, "utf8");
    expect(JSON.parse(text).version).toBe("1.0");
  });

  it("Test 3: REFUSES a schema-invalid snapshot and leaves the disk UNTOUCHED (no file created)", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const bad = minimalSnapshot();
    (bad.tracks[0]!.params[0] as unknown as { movementCount: number }).movementCount = -5; // minimum 0
    await expect(saveSalienceSnapshot(path, bad)).rejects.toThrow(/save rejected|invalid/i);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("Test 3: a rejected save leaves the previously persisted VALID file unchanged", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const good = minimalSnapshot();
    await saveSalienceSnapshot(path, good);
    const bad = minimalSnapshot();
    (bad.tracks[0]!.params[1] as unknown as { salience: number }).salience = 1.5; // maximum 1
    await expect(saveSalienceSnapshot(path, bad)).rejects.toThrow(/save rejected|invalid/i);
    const survivor = await loadSalienceSnapshot(path);
    expect(survivor).toEqual(good); // the prior valid file survives atomically
  });

  it("Test 5: a snapshot with 513 param entries FAILS validation (bounded aggregates — ≤ 512)", async () => {
    const path = join(tmpRoot, "salience-snapshot.json");
    const bloated = minimalSnapshot();
    const params: SalienceSnapshot["tracks"][number]["params"] = [];
    for (let i = 0; i < 513; i++) {
      params.push({
        paramKey: `device_parameter:${i}`,
        deviceKey: "dev_0123456789abcdef",
        paramIndex: i,
        source: "device_parameter",
        movementCount: i,
        valueRange: 0.5,
        lastValue: 0.5,
        salience: 0.4,
      });
    }
    bloated.tracks[0]!.params = params;
    await expect(saveSalienceSnapshot(path, bloated)).rejects.toThrow(/save rejected|invalid|maxItems|513/i);
    // And the load boundary refuses the same shape hand-placed on disk.
    await writeFile(path, JSON.stringify(bloated), "utf8");
    await expect(loadSalienceSnapshot(path)).rejects.toThrow(/salience-snapshot\.json/i);
  });
});

describe("inline schema discipline (D-13 daemon-internal)", () => {
  it("Test 6: no format: keywords appear in the module's inline schema (grep-level)", async () => {
    const source = await readFile(new URL("./salience-snapshot.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/format"\s*:/);
  });
});
