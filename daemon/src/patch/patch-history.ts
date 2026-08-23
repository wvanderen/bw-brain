// daemon/src/patch/patch-history.ts
//
// Phase 3 Plan 03-02 Task 1 (D-03 / EDIT-05) — the DURABLE append-only journal
// at `.bw-brain/patch-history.jsonl`. This is the daemon-authoritative revert
// spine: every successful `apply.patch` round-trip appends ONE line carrying
// the full Patch + the inverseOperations computed at apply time (INV-14) +
// the stateHashBefore. Revert replays those inverseOperations through the SAME
// bridge apply.patch path; the original entry is stamped `appliedRevertedAt`.
//
// Why a journal and not snapshots: D-03 — the inverse of each primitive op is
// computed ONCE at apply time (when the daemon still holds the authoritative
// before-state) and frozen into the journal. Revert never re-derives inverse
// from a possibly-drifted current state, so revert is mechanically equivalent
// to applying the inverse sequence (INV-1 round-trip proven in Plan 01).
//
// Atomicity: each entry is ONE JSON line terminated by "\n". POSIX `appendFile`
// is atomic for writes < `PIPE_BUF` (≥512B, typically 4KB on Linux/macOS); our
// entries are ~1KB, well under the threshold — a crash mid-append leaves
// either the complete previous line or the complete new line, never a torn
// one. Rotation (when the file exceeds ROTATE_AT_BYTES) uses the canonical
// atomic-write discipline (atomic-write.ts: temp in dirname(dest) + rename).
//
// Pitfall 8 (corruption resilience): `entries()` splits on "\n" and wraps each
// line's JSON.parse in try/catch. A truncated/garbage line (crash mid-append,
// disk error) is SKIPPED — the surrounding valid lines still yield. The
// journal never poisons the revert path with a malformed entry.

import { appendFile, readFile, stat, mkdir, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, basename, join } from "node:path";
import type { Patch } from "../gen/patch.js";
import type { PrimitiveOp } from "./inverse-ops.js";

/**
 * A journal entry: a full Patch + the apply-time metadata the revert path
 * needs. `inverseOperations` is computed at APPLY time (D-03), not revert
 * time — INV-14 asserts this set-equals `inverseOps(entry.operations)`.
 */
export interface PatchHistoryEntry extends Patch {
  /** The inverse op sequence, frozen at apply time (INV-14). Revert replays this. */
  inverseOperations: PrimitiveOp[];
  /** Unix-ms timestamp of the successful apply. */
  appliedAt: number;
  /** Set when this patch was reverted (the original entry is marked, not deleted). */
  appliedRevertedAt?: number;
  /** sha256 of the canonical-JSON before-state notes (audit + drift detection). */
  stateHashBefore: string;
  /**
   * D-05 (Phase 03.1 Plan 03): clipSid stamped at apply time. The revert
   * pre-flight compares this against the live `state.selection.clipSid` to
   * refuse wrong-clip targeting. Undefined on pre-fix journal entries (pre
   * Phase 03.1) — the revert gate treats `undefined` as a caveated, NOT
   * refused, path (D-05 migration policy: preserves the recovery path).
   */
  clipSid?: string;
  /**
   * Phase 5 (05-05, D-05-07): the automation binding stamped at apply time —
   * the targeted parameter + the bridge-captured PRIOR value. The frozen
   * `inverseOperations` on the same entry is the author-aware inverse built
   * from that prior ({@link ../patch/inverse-ops.ts buildAutomationInverse});
   * this field is the audit/identity record the revert-side device compare
   * reads. Undefined on legacy (pre-Phase-5) entries AND on note-clip entries
   * by construction — the revert gate treats `undefined` as a caveated, NOT
   * refused, path (the clipSid migration precedent directly above: preserves
   * the recovery path; the caveat is surfaced in assumptions[]).
   */
  automationBinding?: {
    /** The targeted device's stable fingerprint (the deviceKey equivalence pin). */
    deviceSid: string;
    /** The single targeted parameter index (0..127, D-05-14). */
    paramIndex: number;
    /** The write surface the index addresses (maps 1:1 to the event `source`). */
    paramSource: "device_parameter" | "remote_page";
    /** The parameter's normalized prior value, captured by the bridge at apply time. */
    priorValue: number;
  };
}

/** Rotate (compact) the journal once it exceeds this size. 10 MB default. */
export const ROTATE_AT_BYTES = 10 * 1024 * 1024;

/**
 * D-03 durable append-only journal.
 *
 * Construct with the journal path (default `.bw-brain/patch-history.jsonl` from
 * the boot sequence). `append` writes one JSON line; `entries()` is an async
 * generator yielding valid entries (skipping malformed lines per Pitfall 8);
 * `find(patchId)` scans for the first non-reverted entry matching `patchId`
 * (the revert path).
 *
 * @example
 * const hist = new PatchHistory(".bw-brain/patch-history.jsonl");
 * await hist.append({ ...patch, inverseOperations, appliedAt: Date.now(), stateHashBefore });
 * const entry = await hist.find(patchId);
 */
export class PatchHistory {
  /**
   * @param path     - journal file path (the boot sequence wires `.bw-brain/patch-history.jsonl`).
   * @param rotateAt - rotate (compact) once the file exceeds this many bytes.
   */
  constructor(
    private readonly path: string,
    private readonly rotateAt: number = ROTATE_AT_BYTES,
  ) {}

  /**
   * Append one applied-patch entry as a single JSON line + "\n".
   *
   * POSIX-atomic for lines < PIPE_BUF (≥512B; ours are ~1KB). After the append,
   * if the file exceeds `rotateAt` bytes, compact it via atomic-write (temp in
   * dirname + rename). Rotation is best-effort: a compaction failure is logged
   * and swallowed so the apply path's success is not undone by a rotation error.
   *
   * The parent directory is auto-created (mkdir recursive) so the first append
   * to a fresh `.bw-brain/` succeeds.
   */
  async append(entry: PatchHistoryEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    await appendFile(this.path, line, "utf8");
    // Rotation: compact via atomic temp+rename if the file is oversized.
    try {
      const size = (await stat(this.path)).size;
      if (size > this.rotateAt) {
        await this.rotate();
      }
    } catch {
      // stat/rotate failure MUST NOT unwind a successful append — the entry is
      // already durably written. Rotation is best-effort housekeeping.
    }
  }

  /**
   * Yield every valid entry in the journal, in append order.
   *
   * Splits the file on "\n" and JSON.parses each non-empty line in a try/catch
   * (Pitfall 8): a malformed/truncated line is SKIPPED, the surrounding valid
   * lines still yield. The generator NEVER throws on a corrupt journal.
   */
  async *entries(): AsyncGenerator<PatchHistoryEntry> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch {
      // Absent journal = no entries (the first append creates it).
      return;
    }
    for (const line of text.split("\n")) {
      if (line.length === 0) continue; // trailing "\n" leaves an empty segment
      try {
        yield JSON.parse(line) as PatchHistoryEntry;
      } catch {
        // Pitfall 8: skip-and-flag the malformed line. Do NOT throw — a corrupt
        // journal entry must not poison the revert path or crash the daemon.
      }
    }
  }

  /**
   * Find the first NON-REVERTED entry matching `patchId` (the revert path).
   * Returns `null` when absent OR when every matching entry is already marked
   * `appliedRevertedAt` (double-revert is a no-op).
   */
  async find(patchId: string): Promise<PatchHistoryEntry | null> {
    for await (const e of this.entries()) {
      if (e.patchId === patchId && e.appliedRevertedAt === undefined) {
        return e;
      }
    }
    return null;
  }

  /**
   * Stamp the first non-reverted entry matching `patchId` with
   * `appliedRevertedAt = timestamp`. The journal is append-only, so this
   * re-reads every entry, mutates the match, and rewrites the file atomically
   * (temp in dirname + rename — the atomic-write discipline). A no-op when no
   * matching non-reverted entry exists. Called by the revert path after a
   * successful inverse replay so a subsequent `find(patchId)` returns null
   * (double-revert protection).
   */
  async stampReverted(patchId: string, timestamp: number): Promise<void> {
    const collected: PatchHistoryEntry[] = [];
    let touched = false;
    for await (const e of this.entries()) {
      if (!touched && e.patchId === patchId && e.appliedRevertedAt === undefined) {
        collected.push({ ...e, appliedRevertedAt: timestamp });
        touched = true;
      } else {
        collected.push(e);
      }
    }
    if (!touched) return; // nothing to stamp
    const jsonl = collected.map((e) => JSON.stringify(e)).join("\n") + "\n";
    const dir = dirname(this.path);
    const tmp = join(dir, `.${basename(this.path)}.${randomBytes(6).toString("hex")}.tmp`);
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, jsonl, "utf8");
    await rename(tmp, this.path); // atomic on POSIX, same filesystem
  }

  /**
   * Compact the journal via atomic temp+rename (atomic-write.ts:45 discipline).
   *
   * Re-reads all valid entries, rewrites them as JSONL (one `JSON.stringify`
   * per line + "\n") via a temp file in `dirname(path)` + atomic rename (same
   * filesystem → POSIX-atomic). The temp file MUST live in `dirname(path)` —
   * never `/tmp` — so the rename is cross-filesystem safe (Pitfall 4).
   *
   * NOTE: this uses the atomic-write *discipline* (temp-in-dirname + rename)
   * from atomic-write.ts:46-52 inlined for JSONL content. The shared
   * `atomicWriteJson` helper writes pretty-printed JSON (`JSON.stringify(data,
   * null, 2)`), which would corrupt the newline-delimited journal — entries()
   * splits on "\n" and a pretty array has malformed per-line JSON. Rotation
   * therefore writes raw JSONL via the same temp+rename primitive.
   *
   * @internal exercised indirectly by the append-oversize path.
   */
  private async rotate(): Promise<void> {
    const collected: PatchHistoryEntry[] = [];
    for await (const e of this.entries()) collected.push(e);
    const jsonl = collected.map((e) => JSON.stringify(e)).join("\n") + (collected.length > 0 ? "\n" : "");
    // Temp file MUST be in dirname(dest) — cross-filesystem rename is non-atomic
    // (Pitfall 4 defense; mirrors atomic-write.ts:48-49).
    const dir = dirname(this.path);
    const tmp = join(dir, `.${basename(this.path)}.${randomBytes(6).toString("hex")}.tmp`);
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, jsonl, "utf8");
    await rename(tmp, this.path); // atomic on POSIX, same filesystem
  }
}
