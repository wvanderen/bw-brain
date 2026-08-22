// daemon/src/state/salience-snapshot.ts
//
// Phase 5 / 05-04 Task 2 — atomic validated read/write for
// <project>/.bw-brain/salience-snapshot.json (D-05-04: the 04.3
// snapshot+freshness pattern). Mirrors arrangement-snapshot.ts EXACTLY
// (the roles-store.ts sibling-clone precedent):
//   - ENOENT → null (D-09: an absent snapshot is a valid state — the daemon
//     never synthesizes a default; automation.inspect pulls fresh on demand).
//   - Parse error throws with the path in the message (inspectable).
//   - Ajv boundary validation (compile-once at module load, AGENTS.md 64-65).
//   - Save is a SCHEMA GATE: validate BEFORE atomicWriteJson (04.3-07
//     DEFECT B discipline) — a rejected snapshot never touches disk.
//
// BOUNDED AGGREGATES ONLY (T-05-10 information-disclosure mitigation): every
// param entry is scalar aggregates (counts/range/last/salience) — NEVER an
// event stream or raw movement history. The per-track params cap (512, T-05-11
// DoS mitigation) mirrors the 05-01 fold cap; the load/save paths share one
// compiled validator so a hand-edited file is refused at the same boundary
// (T-05-09 tampering mitigation — surfaced by callers as snapshot_invalid per
// the query-server outcome-reason union precedent).
//
// Schema location (D-13): INLINE here (daemon-internal TS interface +
// standalone-compiled Ajv schema). NOT under schemas/ — that dir is the
// cross-language wire contract; the snapshot never crosses the wire. No
// `format:` keywords (AGENTS.md — addFormats NOT used).

import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { atomicWriteJson } from "../store/atomic-write.js";

/**
 * One ranked per-parameter salience entry — bounded aggregates only
 * (movementCount/valueRange/lastValue/salience; NO event history, T-05-10).
 * Structural twin of transforms/automation-salience.ts RankedSalienceParam.
 */
export interface SalienceParamEntry {
  /** `${source}:${paramIndex}` — stable per-device param identity. */
  paramKey: string;
  /** Device identity key (the 05-03 dev_+16-hex fingerprint — same as deviceSid). */
  deviceKey: string;
  paramIndex: number;
  /** Optional human-readable parameter name. */
  paramName?: string;
  source: "device_parameter" | "remote_page";
  movementCount: number;
  /** Observed value range (max − min), normalized [0,1]. */
  valueRange: number;
  /** Latest observed normalized value. */
  lastValue: number;
  /** Salience ∈ [0,1] (clamped, 3-decimal). */
  salience: number;
}

/**
 * The durable salience snapshot (D-05-04): ranked per-parameter salience with
 * visible freshness. Written by the query-server salience refresh
 * (refreshSalienceSnapshot — fold aggregates → AutomationSalience analyzer →
 * schema-gated save); read by automation.inspect (stale-but-readable when
 * disconnected) and the 05-09 device-review peer path.
 *
 * `tracks` groups the observed params under the selection-at-refresh-time
 * trackKey (the 05-01 fold keys params by device, not track — attribution is
 * the refresh-time selection, disclosed via assumptions[] on the read path).
 */
export interface SalienceSnapshot {
  version: string;
  /** ISO timestamp of the analysis pull (visible freshness — D-05-04). */
  pulledAt: string;
  /** Profile name used for this snapshot. */
  profile: string;
  tracks: Array<{
    /** Selection trackSid at refresh time ("unknown" when unattributed). */
    trackKey: string;
    /** Ranked params (salience desc), bounded ≤ 512 per track. */
    params: SalienceParamEntry[];
  }>;
}

/**
 * Daemon-internal JSON Schema for salience-snapshot.json (D-13 sibling of the
 * arrangement-snapshot schema). Inline (NOT under schemas/) because the
 * snapshot never crosses the wire as a JSON-Lines message — it's a
 * daemon-owned durable file. No `format:` keywords (AGENTS.md — addFormats
 * deliberately NOT used; ISO timestamps validated structurally as strings,
 * the daemon emits them via `new Date().toISOString()`).
 */
const snapshotSchema = {
  $id: "urn:bw-brain:salience-snapshot",
  type: "object",
  required: ["version", "pulledAt", "profile", "tracks"],
  additionalProperties: false,
  properties: {
    version: { type: "string", minLength: 1 },
    pulledAt: { type: "string", minLength: 1 },
    profile: { type: "string", minLength: 1 },
    tracks: {
      type: "array",
      // A persistable snapshot carries at least one track — the refresh
      // refuses empty folds up front, so an empty snapshot never reaches disk
      // through ANY path (the arrangement snapshot's DEFECT D minItems
      // backstop discipline).
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        required: ["trackKey", "params"],
        additionalProperties: false,
        properties: {
          trackKey: { type: "string", minLength: 1 },
          params: {
            type: "array",
            // T-05-11: bounded aggregates — mirrors the 05-01 fold cap so a
            // snapshot can never inflate beyond the fold that fed it.
            maxItems: 512,
            items: {
              type: "object",
              required: [
                "paramKey",
                "deviceKey",
                "paramIndex",
                "source",
                "movementCount",
                "valueRange",
                "lastValue",
                "salience",
              ],
              additionalProperties: false,
              properties: {
                paramKey: { type: "string", minLength: 1 },
                deviceKey: { type: "string", minLength: 1 },
                paramIndex: { type: "number", minimum: 0 },
                paramName: { type: "string", minLength: 1 },
                source: { type: "string", enum: ["device_parameter", "remote_page"] },
                movementCount: { type: "number", minimum: 0 },
                valueRange: { type: "number", minimum: 0, maximum: 1 },
                lastValue: { type: "number", minimum: 0, maximum: 1 },
                salience: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
    },
  },
} as const;

// Ajv2020 = JSON Schema Draft 2020-12 mode. Named import + .js ext required
// under module:NodeNext (ajv 8.20 ships no exports map). addFormats NOT applied
// (no schema uses `format` — verified; mirrors arrangement-snapshot.ts:215).
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(snapshotSchema);
const validateSnapshot = ajv.getSchema(snapshotSchema.$id)!;

/**
 * Load + validate `<project>/.bw-brain/salience-snapshot.json`.
 *
 * @returns the validated {@link SalienceSnapshot}, or `null` if the file is
 *   ABSENT (the daemon never synthesizes a default — automation.inspect pulls
 *   fresh from the live folds when connected).
 * @throws Error("salience-snapshot.json invalid: ...") if the file exists but
 *   is unparseable JSON or fails Ajv validation. The thrown message carries
 *   the path + Ajv errors JSON so a user can see exactly what's wrong.
 *   Callers surface this as the bounded `snapshot_invalid` refusal (04.3-07
 *   DEFECT C discipline — never a crash, never a silent fallback).
 *
 * @example
 * const snap = await loadSalienceSnapshot(".bw-brain/salience-snapshot.json");
 * if (snap === null) { /* refresh from the live folds (connected) *\/ }
 */
export async function loadSalienceSnapshot(path: string): Promise<SalienceSnapshot | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    // Absent file → null. Any other I/O error rethrows — only ENOENT is the
    // "absent" case (mirrors arrangement-snapshot.ts:239-243).
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`salience-snapshot.json invalid: not valid JSON (${path})`);
  }

  if (!validateSnapshot(parsed)) {
    throw new Error(`salience-snapshot.json invalid: ${JSON.stringify(validateSnapshot.errors)} (${path})`);
  }

  return parsed as SalienceSnapshot;
}

/**
 * Atomically save `<project>/.bw-brain/salience-snapshot.json`.
 *
 * The write path is a SCHEMA GATE (04.3-07 DEFECT B): the snapshot is
 * validated against the module's compile-once {@link validateSnapshot} BEFORE
 * {@link atomicWriteJson} runs — a schema-invalid snapshot is rejected without
 * touching disk, so the previous file survives atomically. Callers treat a
 * rejection as a FAILED refresh (query-server returns null; nothing derived
 * is persisted), never as a crash.
 *
 * Valid writes go via {@link atomicWriteJson} (POSIX temp+rename on the same
 * filesystem): a crash mid-write leaves either the old or the new file, NEVER
 * a half-written one (T-05-09 tampering defense). The parent directory is
 * auto-created.
 *
 * @throws Error("salience-snapshot.json save rejected: ...") when `snap`
 *   fails schema validation. The thrown message carries the stringified Ajv
 *   errors + the path (mirroring loadSalienceSnapshot's error shape).
 *
 * @example
 * await saveSalienceSnapshot(".bw-brain/salience-snapshot.json", snap);
 */
export async function saveSalienceSnapshot(path: string, snap: SalienceSnapshot): Promise<void> {
  if (!validateSnapshot(snap)) {
    throw new Error(`salience-snapshot.json save rejected: ${JSON.stringify(validateSnapshot.errors)} (${path})`);
  }
  await atomicWriteJson(path, snap);
}
