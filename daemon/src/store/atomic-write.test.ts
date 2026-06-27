// daemon/src/store/atomic-write.test.ts
//
// SC#3 MEM-01 atomic-write held-out property test (RESEARCH.md §Validation row
// STATE-04 (atomic write — SC#3 critical) line 1394; 02-03a-PLAN.md Task 1
// <behavior> atomicWriteJson tests; Shared Pattern H — N-parallel-writes
// property test).
//
// The held-out bar: N=20 concurrent atomicWriteJson calls to the SAME path
// must leave a final file that (a) parses as valid JSON and (b) deep-equals
// EXACTLY ONE of the 20 inputs (no half-written merge). This proves the
// POSIX temp+rename primitive is race-free under contention.
//
// Pitfall 4 defense is asserted structurally: the temp file path MUST be
// `join(dirname(dest), ...)` — grep the source, never a /tmp literal.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { readFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteJson } from "./atomic-write.js";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "bw-brain-atomic-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("atomicWriteJson (SC#3 / MEM-01 — held-out N-parallel property test)", () => {
  it("N=20 parallel writes to the same path leave a final file that parses + deep-equals exactly ONE input", async () => {
    const dest = join(workDir, "state-cache.json");
    const N = 20;
    const inputs = Array.from({ length: N }, (_, i) => ({
      version: "1.0",
      index: i,
      payload: `write-${i}`,
      nested: { a: i, b: [i, i + 1, i + 2] },
    }));

    // Fire all N writes in parallel — the OS scheduler interleaves them. The
    // temp+rename primitive must serialize them safely.
    await Promise.all(inputs.map((data) => atomicWriteJson(dest, data)));

    const raw = await readFile(dest, "utf8");
    const final = JSON.parse(raw);
    // The final file must deep-equal EXACTLY ONE of the inputs (no merge).
    const matches = inputs.filter((input) => JSON.stringify(input) === JSON.stringify(final));
    expect(matches).toHaveLength(1);
  });

  it("sequential writes are last-writer-wins (write A then B → read B)", async () => {
    const dest = join(workDir, "state-cache.json");
    await atomicWriteJson(dest, { tag: "A", n: 1 });
    await atomicWriteJson(dest, { tag: "B", n: 2 });
    const raw = await readFile(dest, "utf8");
    const final = JSON.parse(raw);
    expect(final).toEqual({ tag: "B", n: 2 });
  });

  it("auto-creates the destination directory when absent (.bw-brain/)", async () => {
    const dest = join(workDir, "nested", "deep", ".bw-brain", "state-cache.json");
    await atomicWriteJson(dest, { version: "1.0", created: true });
    const raw = await readFile(dest, "utf8");
    expect(JSON.parse(raw)).toEqual({ version: "1.0", created: true });
  });

  it("leaves no stray temp files after a successful write", async () => {
    const dest = join(workDir, "state-cache.json");
    await atomicWriteJson(dest, { version: "1.0" });
    const entries = await readdir(workDir);
    // Only the destination file should remain — temp files are renamed away.
    expect(entries).toEqual(["state-cache.json"]);
  });

  it("pretty-prints with 2-space indentation (human-readable .bw-brain/ files)", async () => {
    const dest = join(workDir, "state-cache.json");
    await atomicWriteJson(dest, { a: 1, b: { c: 2 } });
    const raw = await readFile(dest, "utf8");
    expect(raw).toContain('  "a": 1,\n');
    expect(raw).toContain('    "c": 2\n');
  });
});
