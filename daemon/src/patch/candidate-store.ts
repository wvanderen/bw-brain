// daemon/src/patch/candidate-store.ts
//
// Phase 3 Plan 03-02 Task 1 (D-05) — the EPHEMERAL in-memory candidate store.
// Holds previewed-but-not-yet-applied patches keyed by a daemon-minted
// patchId. LRU-caps at MAX_CANDIDATES (64) so a runaway preview loop can't
// exhaust memory; eviction on successful apply moves the patch to the durable
// patch-history.jsonl journal (the other half of the D-03 spine).
//
// MEM-02 boundary: this module is IN-MEMORY ONLY. It imports NOTHING from
// node:fs / node:fs/promises — no filesystem writes of any kind. The candidate
// store MUST stay ephemeral (lost on daemon restart by design); the durable
// spine is patch-history.ts. The boundary contract is enforced by
// daemon/src/store/boundary.ts; the structural test asserts no fs write
// symbols appear anywhere in this file (code or comments).
//
// Map lifecycle mirrors daemon/src/state/analyzer-registry.ts:98-122 — JS Map
// preserves insertion order, so the LRU eviction path is `map.keys().next()
// .value` (the oldest entry). patchId minting mirrors correlator.ts:27,91
// (`randomUUID()` from node:crypto). Pitfall 5: NEVER content-hash — two
// previews of the same logical transform yield DISTINCT patchIds (randomness
// is correct here: loopback-only, single-user, no collision concern).

import { randomUUID } from "node:crypto";
import type { Patch } from "../gen/patch.js";

/** The LRU cap. After MAX_CANDIDATES mints, the oldest entry is evicted. */
export const MAX_CANDIDATES = 64;

/**
 * D-05 ephemeral in-memory candidate store.
 *
 * `mint` stamps a fresh `pt_<randomUUID>` patchId onto the patch and stores it
 * (LRU-evicting the oldest when the cap is reached). `get` looks up by
 * patchId AND refreshes LRU order (re-inserts at the tail so a recently-read
 * candidate survives eviction). `evict` removes immediately (called after a
 * successful apply moves the patch to the durable journal).
 *
 * The store performs NO filesystem writes — see the MEM-02 boundary note above.
 * It is lost on daemon restart by design; a `bw-edit apply` against a
 * restarted daemon returns `candidate_not_found` (the producer must re-preview).
 *
 * @example
 * const store = new CandidateStore();
 * const candidate = store.mint({ scope, operations, rationale, ... });
 * // ... user runs `bw-edit apply <candidate.patchId> --confirm` ...
 * store.evict(candidate.patchId);
 */
export class CandidateStore {
  /** Insertion-ordered map of patchId → stored candidate (Patch + previewClipSid). */
  private readonly map = new Map<string, Patch & { previewClipSid?: string }>();

  /**
   * Mint a new candidate: stamp a fresh `pt_<randomUUID>` patchId onto `patch`,
   * store it, and LRU-evict the oldest when the cap is exceeded.
   *
   * D-04 (Phase 03.1 Plan 03): the second param `previewClipSid` is sourced
   * from `state.selection.clipSid` at mint time and stamped onto the stored
   * Patch as `previewClipSid`. The apply pre-flight reads it back + compares
   * to the live `state.selection.clipSid` to refuse wrong-clip targeting. The
   * empty-string fallback handles a missing clipSid (pre-Plan-02 state or a
   * disconnected bridge fold) — the gate treats `previewClipSid === ""` as a
   * pre-fix candidate (caveated, not refused).
   *
   * @returns the full Patch (with the minted patchId + stamped previewClipSid).
   */
  mint(patch: Omit<Patch, "patchId">, previewClipSid: string = ""): Patch & { previewClipSid: string } {
    const full = { ...patch, patchId: `pt_${randomUUID()}`, previewClipSid };
    this.map.set(full.patchId, full);
    if (this.map.size > MAX_CANDIDATES) {
      // Map.keys().next().value is the OLDEST entry (insertion order).
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
    return full;
  }

  /**
   * Look up a candidate by patchId (`bw-edit apply`). Returns `undefined` when
   * the patchId was evicted (LRU cap exceeded) or the daemon restarted (the
   * store is ephemeral — see the class doc).
   *
   * A successful lookup REFRESHES LRU order (delete + re-set moves the entry
   * to the tail / most-recently-used position), so a candidate the producer is
   * actively considering survives eviction.
   */
  get(patchId: string): (Patch & { previewClipSid?: string }) | undefined {
    const p = this.map.get(patchId) as (Patch & { previewClipSid?: string }) | undefined;
    if (p) {
      // Refresh LRU: delete + re-set re-orders the entry to most-recently-used.
      this.map.delete(patchId);
      this.map.set(patchId, p);
    }
    return p;
  }

  /**
   * Evict a candidate immediately. Called after a successful apply moves the
   * patch to the durable patch-history.jsonl journal (the candidate store is
   * the pre-apply holding area; once applied + journalled it leaves the
   * ephemeral store).
   */
  evict(patchId: string): void {
    this.map.delete(patchId);
  }
}
