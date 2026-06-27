// daemon/src/state/reconcile.ts
//
// STATE-04 reconcile-on-reconnect (RESEARCH.md Pattern 2 lines 463-492;
// 02-PATTERNS.md Assignment 6 lines 261-297). The canonical pure-function
// shape mirrors daemon/src/protocol/handshake.ts lines 16-46 (documented
// interface + @example, no I/O, no side effects beyond the caller-owned
// persisted map).
//
// On bridge (re)connect — AFTER the first post-reconnect raw-state snapshot —
// the daemon calls reconcile(observed, persisted, now) to match each observed
// Bitwig object to a stable sid. Four buckets:
//   - matched    : fingerprint hit (same name+type+neighbors+content).
//   - reassigned : fuzzy fallback hit (same name+type, OR same content-hash
//                  under a rename) — the sid is preserved and rebound.
//   - new        : no match in any index — a fresh sid is minted.
//   - vanished   : in persisted.lastSeen but not observed this round — kept
//                  in the map; the caller (02-03b stale-watchdog) expires after
//                  a grace window (60s, RESEARCH.md line 518).
//
// This is the SC#3 trust-spine gate: stable IDs survive a 20-track reorder on
// reconnect (held-out property test in reconcile.test.ts asserts >=18/20).
//
// PURE over `observed`: the caller's RawState is read but never mutated. The
// `persisted` StableIdMap IS mutated (fingerprints rebound, lastSeen touched,
// new sids registered) — this mirrors RESEARCH.md lines 480, 484-485 and is
// the documented contract: the caller owns persistence, reconcile updates it
// in place. `now` is injected (not Date.now()) so the held-out test is
// deterministic across runs.

import type { ProjectState } from "../gen/project-state.js";
import {
  fingerprint,
  mintSid,
  type FingerprintInput,
  type FingerprintType,
} from "./fingerprint.js";

/** The Plan-01-generated raw-state contract (gen/project-state.ts). */
export type RawState = ProjectState;

/**
 * An observed Bitwig object (track/clip/device) carrying the fingerprint
 * inputs. The RawState's tracks/clips/devices arrays are open `{}`[] at the
 * schema level (their element shape is tightened as STATE-04 lands); this
 * interface is the daemon-internal narrowing the reconciler expects each
 * element to satisfy. Extra fields pass through unchanged ([extra: string]).
 */
export interface ObservedObject extends FingerprintInput {
  [extra: string]: unknown;
}

/**
 * The persisted stable-ID map. The caller (daemon ingest path) owns the
 * instance; reconcile() mutates it in place to rebind/reassign/register.
 * Three indexes + a lastSeen clock:
 *  - byFingerprint : exact fingerprint → sid (the fast path).
 *  - byNameAndType : `${type}:${name}` → sid (fuzzy fallback #1 — survives
 *                    reorder where neighbors drift but name is stable).
 *  - byContentHash : contentHash → set of sids (fuzzy fallback #2 — survives
 *                    rename where name drifts but content is stable; the set
 *                    disambiguates when two objects share identical content).
 *  - lastSeen      : sid → epoch ms of last observation (drives vanished
 *                    detection + the 60s expiry in 02-03b).
 */
export interface StableIdMap {
  byFingerprint: Map<string, string>;
  byNameAndType: Map<string, string>;
  byContentHash: Map<string, Set<string>>;
  lastSeen: Map<string, number>;
}

/** A matched observed object (fingerprint hit). */
export interface MatchedEntry {
  sid: string;
  obj: ObservedObject;
}
/** A reassigned observed object (fuzzy fallback hit — sid preserved, rebound). */
export interface ReassignedEntry {
  sid: string;
  obj: ObservedObject;
  /** Why the reassignment happened: "name+type" or "content-hash". */
  reason: string;
}
/** A newly-minted observed object (no match in any index). */
export interface NewEntry {
  sid: string;
  obj: ObservedObject;
}
/** A previously-observed sid not seen this round (kept; caller expires after grace). */
export interface VanishedEntry {
  sid: string;
  /** Epoch ms of the last time this sid was observed. */
  lastSeen: number;
}

/** Result of {@link reconcile}. Four disjoint buckets. */
export interface ReconcileResult {
  matched: MatchedEntry[];
  reassigned: ReassignedEntry[];
  new: NewEntry[];
  vanished: VanishedEntry[];
}

/**
 * Construct an empty {@link StableIdMap}. The caller passes this to the first
 * reconcile round; subsequent rounds reuse the (mutated) instance.
 *
 * @example
 * const persisted = emptyStableIdMap();
 * const r1 = reconcile(firstSnapshot, persisted, Date.now());
 */
export function emptyStableIdMap(): StableIdMap {
  return {
    byFingerprint: new Map(),
    byNameAndType: new Map(),
    byContentHash: new Map(),
    lastSeen: new Map(),
  };
}

/**
 * Extract the observed-object list from a RawState. The RawState schema leaves
 * tracks/clips/devices element shapes open (`{}`[]); the daemon-side caller
 * guarantees each element carries the FingerprintInput fields. This helper
 * narrows once, at the boundary, so the reconciler body is shape-agnostic.
 */
function observedObjects(state: RawState): ObservedObject[] {
  const out: ObservedObject[] = [];
  for (const t of state.tracks ?? []) out.push(t as unknown as ObservedObject);
  for (const c of state.clips ?? []) out.push(c as unknown as ObservedObject);
  for (const d of state.devices ?? []) out.push(d as unknown as ObservedObject);
  return out;
}

/** Register a brand-new sid in all three indexes + lastSeen. */
function registerNew(
  persisted: StableIdMap,
  sid: string,
  obj: ObservedObject,
  now: number,
): void {
  const fp = fingerprintInputOf(obj);
  persisted.byFingerprint.set(fingerprint(fp), sid);
  persisted.byNameAndType.set(nameKey(obj), sid);
  // contentHash → Set<string>: a content hash may legitimately map to multiple
  // sids (two clips with identical notes). Track them all so the rename
  // fallback can detect ambiguity (set size > 1 → don't reassign).
  let bucket = persisted.byContentHash.get(obj.contentHash);
  if (!bucket) {
    bucket = new Set();
    persisted.byContentHash.set(obj.contentHash, bucket);
  }
  bucket.add(sid);
  persisted.lastSeen.set(sid, now);
}

/** Rebind an existing sid to a new fingerprint (neighbors/content/name drifted). */
function rebindFingerprint(persisted: StableIdMap, sid: string, obj: ObservedObject): void {
  persisted.byFingerprint.set(fingerprint(fingerprintInputOf(obj)), sid);
}

/** Remove any byNameAndType entries pointing at `sid`, then set the new key.
 *  O(n) in byNameAndType size — n is small (tracks/clips/devices, typically <50). */
function rebindName(persisted: StableIdMap, sid: string, obj: ObservedObject): void {
  const newKey = nameKey(obj);
  for (const [key, existingSid] of persisted.byNameAndType) {
    if (existingSid === sid && key !== newKey) {
      persisted.byNameAndType.delete(key);
    }
  }
  persisted.byNameAndType.set(newKey, sid);
}

function fingerprintInputOf(obj: ObservedObject): FingerprintInput {
  return {
    name: obj.name,
    type: obj.type,
    neighbors: obj.neighbors,
    contentHash: obj.contentHash,
  };
}

function nameKey(obj: ObservedObject): string {
  return `${obj.type}:${obj.name}`;
}

/**
 * Reconcile an observed RawState against the persisted stable-ID map.
 *
 * For each observed object (track/clip/device), in order:
 *  1. Compute its fingerprint. If `byFingerprint` has it → **matched**.
 *  2. Else if `byNameAndType` has `${type}:${name}` → **reassigned**
 *     (name+type fuzzy fallback — survives a reorder where neighbors drift).
 *  3. Else if `byContentHash` has exactly ONE sid for that contentHash →
 *     **reassigned** (content-hash fuzzy fallback — survives a rename where
 *     the name drifts but the note content is stable). If multiple sids share
 *     the contentHash the match is ambiguous → fall through to new.
 *  4. Else → **new** (mint a fresh sid + register).
 *
 * Vanished = sids in `persisted.lastSeen` not observed this round. They stay
 * in the map; the caller (02-03b stale-watchdog) expires them after the grace
 * window. This prevents an expire-storm on a brief bridge reload (RESEARCH.md
 * line 549, anti-pattern: aggressively expiring vanished objects).
 *
 * @param observed  - the post-(re)connect RawState snapshot (read-only).
 * @param persisted - the stable-ID map (mutated in place — rebind/reassign/register).
 * @param now       - injected epoch ms (deterministic for tests).
 * @returns the four reconcile buckets.
 *
 * @example
 * const persisted = emptyStableIdMap();
 * const r1 = reconcile(snapshot, persisted, Date.now()); // populates `persisted`
 * const r2 = reconcile(nextSnapshot, persisted, Date.now()); // reuses `persisted`
 */
export function reconcile(
  observed: RawState,
  persisted: StableIdMap,
  now: number,
): ReconcileResult {
  const result: ReconcileResult = {
    matched: [],
    reassigned: [],
    new: [],
    vanished: [],
  };
  const seenSids = new Set<string>();

  for (const obj of observedObjects(observed)) {
    const fp = fingerprint(fingerprintInputOf(obj));

    // 1. Exact fingerprint match.
    const fpSid = persisted.byFingerprint.get(fp);
    if (fpSid) {
      result.matched.push({ sid: fpSid, obj });
      persisted.lastSeen.set(fpSid, now);
      seenSids.add(fpSid);
      continue;
    }

    // 2. Fuzzy fallback #1: name+type match (survives neighbor reorder).
    const nameSid = persisted.byNameAndType.get(nameKey(obj));
    if (nameSid) {
      result.reassigned.push({ sid: nameSid, obj, reason: "name+type" });
      rebindFingerprint(persisted, nameSid, obj);
      persisted.lastSeen.set(nameSid, now);
      seenSids.add(nameSid);
      continue;
    }

    // 3. Fuzzy fallback #2: content-hash match (survives rename). Only
    //    reassign if EXACTLY ONE persisted sid shares this contentHash —
    //    ambiguity (two clips with identical notes) means we cannot guess
    //    which one was renamed, so mint new instead.
    const contentBucket = persisted.byContentHash.get(obj.contentHash);
    if (contentBucket && contentBucket.size === 1) {
      const contentSid = [...contentBucket][0];
      result.reassigned.push({ sid: contentSid, obj, reason: "content-hash" });
      rebindFingerprint(persisted, contentSid, obj);
      rebindName(persisted, contentSid, obj);
      persisted.lastSeen.set(contentSid, now);
      seenSids.add(contentSid);
      continue;
    }

    // 4. No match — mint a new sid.
    const newSid = mintSid(obj.type, fingerprintInputOf(obj));
    result.new.push({ sid: newSid, obj });
    registerNew(persisted, newSid, obj, now);
    seenSids.add(newSid);
  }

  // Vanished: sids in lastSeen not seen this round. Kept in the map; caller
  // expires after grace window.
  for (const [sid, lastSeen] of persisted.lastSeen) {
    if (!seenSids.has(sid)) {
      result.vanished.push({ sid, lastSeen });
    }
  }

  return result;
}
