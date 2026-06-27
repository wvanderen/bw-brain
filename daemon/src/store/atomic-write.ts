// daemon/src/store/atomic-write.ts
//
// MEM-01 / SC#3 atomic durable write (RESEARCH.md Pattern 4 lines 495-511 +
// §Code Examples lines 1170-1186; 02-PATTERNS.md Assignment 10 lines 367-391
// + Shared Pattern F lines 699-713). Body transcribed from RESEARCH.md lines
// 1172-1186 per PATTERNS.md Assignment 10 line 380, with ONE deviation: the
// imports for `dirname`/`basename` are sourced from `node:path` (their real
// home) — the RESEARCH.md excerpt imports them from `node:fs/promises` (a
// bug: those are not named exports of fs/promises). The Pattern-4 version of
// the same code (RESEARCH.md line 501) confirms `node:path` is correct.
//
// POSIX rename(2) is atomic on the SAME filesystem. The temp file MUST live in
// the destination's directory (Pitfall 4 defense — cross-filesystem rename is
// non-atomic). A crash mid-write leaves either the old file or the new file,
// NEVER a half-written one. Every durable write in the daemon goes through
// this primitive (state-cache.json, intent.json, roles.json, patch-history.jsonl).
//
// SC#3 trust-spine: the held-out N=20-parallel property test in
// atomic-write.test.ts proves no half-written file escapes under contention.

import { writeFile, rename, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, basename, join } from "node:path";

/**
 * Atomically write `data` as pretty-printed JSON to `path`.
 *
 * Writes to a temp file in `dirname(path)` then renames into place. The temp
 * filename carries 12 hex chars of randomness (randomBytes(6)) so N parallel
 * writes to the same path don't collide on the temp filename. `mkdir(dir,
 * {recursive:true})` runs before the write so a missing `.bw-brain/` directory
 * is auto-created (Pitfall 4 / Shared Pattern F non-negotiable).
 *
 * The temp file is `join(dirname(path), ...)` — NEVER a `/tmp` literal.
 * Cross-filesystem rename is non-atomic on POSIX; keeping temp + dest on the
 * same filesystem preserves the atomicity guarantee (Pitfall 4 defense,
 * structurally asserted in atomic-write.test.ts).
 *
 * @param path - destination file path.
 * @param data - JSON-serializable value.
 *
 * @example
 * await atomicWriteJson(".bw-brain/state-cache.json", { version: "1.0" });
 */
export async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  // Temp file MUST be in same dir as dest — cross-filesystem rename is non-atomic.
  const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  const serialized = JSON.stringify(data, null, 2);
  await writeFile(tmp, serialized, "utf8"); // write fully first
  await rename(tmp, path); // atomic on POSIX, same filesystem
}
