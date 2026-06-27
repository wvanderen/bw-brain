// daemon/src/state/fingerprint.ts
//
// STATE-04 stable-ID synthesis (RESEARCH.md Pattern 2 lines 432-461; 02-PATTERNS.md
// Assignment 6 lines 261-297). The canonical pure-function shape mirrors
// daemon/src/protocol/handshake.ts lines 16-46 (documented interface + @example,
// no I/O, no side effects).
//
// Bitwig exposes NO native stable IDs (capabilities doc §6 verified in Phase 1).
// The daemon synthesizes them from a content-addressed fingerprint:
//   fingerprint = sha256(canonical-json(name + type + neighbors + contentHash))[0:16]
// The 16-hex-char truncation matches project-state.schema.json's selection.*Sid
// body pattern [0-9a-f]{16}$ (the ^{trk|clip|dev}_ prefix is added by mintSid).
// Together this is the Pitfall 2 defense — a bare Bitwig slot index like
// "trk_5" is structurally invalid as identity (RESEARCH.md lines 800-805).
//
// PURE: no sockets, no files, no clocks. Unit-testable without mocks
// (fingerprint.test.ts). The daemon's reconcile() path (reconcile.ts) and the
// state-cache layer (state-cache.ts) consume these primitives unchanged.

import { createHash } from "node:crypto";

/** Object class. Drives the sid prefix (trk_/clip_/dev_). */
export type FingerprintType = "track" | "clip" | "device";

/** sid prefix per type (project-state.schema.json selection.*Sid pattern). */
export const SID_PREFIX: Readonly<Record<FingerprintType, "trk" | "clip" | "dev">> = {
  track: "trk",
  clip: "clip",
  device: "dev",
};

/**
 * Inputs to {@link fingerprint}. All four components are REQUIRED — dropping
 * any one weakens identity (RESEARCH.md lines 457-461 explains why each matters):
 *  - `name`         — primary signal (a track named "Kick" is probably the same Kick across reloads).
 *  - `type`         — disambiguates a track "Kick" from a clip "Kick".
 *  - `neighbors`    — survives reorders; the caller sorts so the pair is order-independent.
 *  - `contentHash`  — survives renames (same notes = same clip identity).
 */
export interface FingerprintInput {
  /** Bitwig name() value. Settable, not stable alone. */
  name: string;
  /** Object class. */
  type: FingerprintType;
  /** Sorted identity hints: [prevName, nextName] for tracks; [parentTrackName]
   *  for clips; [parentTrackName, chainIndex] for devices. The caller sorts so
   *  two snapshots of the same pair hash identically regardless of array order. */
  neighbors: string[];
  /** Content hash. For clips: note-set hash. For tracks: clip-count + first-clip-name hash. For devices: param-page-values hash. */
  contentHash: string;
}

/**
 * Compute the 16-hex-char fingerprint of a {@link FingerprintInput}.
 *
 * Canonical JSON (insertion-sorted keys n/t/nb/ch) is sha256-hashed and
 * truncated to 16 hex chars. Deterministic: same input → same id. Distinct:
 * any differing component → differing id. The 16-char width matches
 * project-state.schema.json's selection.*Sid body pattern.
 *
 * @param input - the four identity components.
 * @returns 16 lowercase-hex-char fingerprint (no prefix).
 *
 * @example
 * fingerprint({ name: "Kick", type: "track", neighbors: ["Bass","Lead"], contentHash: "abc" });
 * // => "f1d2d3..."  (deterministic for this exact input)
 */
export function fingerprint(input: FingerprintInput): string {
  // Canonical JSON: keys in fixed insertion order (n, t, nb, ch). JSON.stringify
  // preserves insertion order, so this is stable across V8 versions and across
  // call sites (the object literal here is the single canonicalization point).
  const canon = JSON.stringify({
    n: input.name,
    t: input.type,
    nb: input.neighbors,
    ch: input.contentHash,
  });
  return createHash("sha256").update(canon).digest("hex").slice(0, 16);
}

/**
 * Mint a prefixed stable ID: `${prefix}_${fingerprint}`. The result matches
 * project-state.schema.json's selection.*Sid pattern
 * `^(trk|clip|dev)_[0-9a-f]{16}$` (Pitfall 2 defense — a bare Bitwig slot
 * index like "trk_5" can never match a minted sid).
 *
 * @param type  - object class; selects the prefix.
 * @param input - fingerprint inputs.
 * @returns prefixed sid, e.g. `"trk_f1d2d3f1d2d3f1d2"`.
 *
 * @example
 * mintSid("track", { name: "Kick", type: "track", neighbors: ["Bass"], contentHash: "abc" });
 * // => "trk_f1d2d3f1d2d3f1d2"
 */
export function mintSid(type: FingerprintType, input: FingerprintInput): string {
  return `${SID_PREFIX[type]}_${fingerprint(input)}`;
}
