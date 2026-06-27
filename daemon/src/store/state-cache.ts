// daemon/src/store/state-cache.ts
//
// MEM-01 durable state-cache wrapper (RESEARCH.md Pattern 4 lines 495-511;
// 02-PATTERNS.md Shared Pattern F lines 699-713). Wraps the StableIdMap +
// last-known RawState snapshot. EVERY save goes through atomicWriteJson —
// never fs.writeFile directly (Pitfall 4 / SC#3 trust-spine).
//
// M1 scope: load + save + round-trip. The JSON-serializable payload flattens
// the StableIdMap's Maps to tuple arrays (JSON has no Map literal). The expiry
// of vanished sids after the 60s grace window is the caller's job (the
// stale-watchdog in 02-03b owns the grace window; this module is the dumb
// durable store).

import { readFile } from "node:fs/promises";
import { atomicWriteJson } from "./atomic-write.js";

/**
 * On-disk state-cache payload. JSON-serializable (Maps flattened to tuple
 * arrays). The shape is the durable contract between this module and the
 * 02-03b caller that owns the in-memory StableIdMap.
 */
export interface StateCachePayload {
  /** Schema version for forward-migration. */
  version: string;
  /** The StableIdMap (flattened from Maps for JSON). The caller converts
   *  between this and the in-memory Map-based StableIdMap (reconcile.ts). */
  stableIds: {
    byFingerprint: Array<[string, string]>;
    byNameAndType: Array<[string, string]>;
    byContentHash: Array<[string, string[]]>;
    lastSeen: Array<[string, number]>;
  };
  /** Last-observed RawState snapshot (for diff display + reconnect seed). */
  lastRawState?: unknown;
  /** ISO timestamp of the last save (advisory; the rename is the real atomicity). */
  savedAt?: string;
}

/**
 * Construct the empty default payload. Returned by {@link loadOrInit} when the
 * cache file is absent — a missing cache is the normal first-run state, not an
 * error. The caller may {@link save} it later once reconcile has populated it.
 *
 * @example
 * const cache = emptyStateCache();
 */
export function emptyStateCache(): StateCachePayload {
  return {
    version: "1.0",
    stableIds: {
      byFingerprint: [],
      byNameAndType: [],
      byContentHash: [],
      lastSeen: [],
    },
  };
}

/**
 * Load the state-cache at `path`.
 *
 * If the file is absent, return {@link emptyStateCache} WITHOUT throwing (the
 * caller may save later). If the file exists but is unreadable for any OTHER
 * reason (permissions, I/O error), the error propagates — we do not silently
 * reset. If the file exists but is unparseable JSON, JSON.parse throws — a
 * corrupt cache must surface, not silently reset (trust-spine: never paper
 * over corruption).
 *
 * @param path - cache file path (typically `<project>/.bw-brain/state-cache.json`).
 * @returns the parsed payload, or the empty default if the file is absent.
 *
 * @example
 * const cache = await loadOrInit(".bw-brain/state-cache.json");
 */
export async function loadOrInit(path: string): Promise<StateCachePayload> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyStateCache();
    }
    throw err;
  }
  return JSON.parse(raw) as StateCachePayload;
}

/**
 * Save the state-cache atomically via {@link atomicWriteJson}. Never writes
 * directly via fs.writeFile — the temp+rename primitive is the SC#3 / MEM-01
 * contract. Stamps `savedAt` with the current ISO timestamp (advisory).
 *
 * @param path    - destination file path.
 * @param payload - the cache payload to persist.
 *
 * @example
 * await save(".bw-brain/state-cache.json", cache);
 */
export async function save(path: string, payload: StateCachePayload): Promise<void> {
  const toWrite: StateCachePayload = {
    ...payload,
    savedAt: new Date().toISOString(),
  };
  await atomicWriteJson(path, toWrite);
}
