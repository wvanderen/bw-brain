// daemon/src/state/arrangement-snapshot.ts
//
// P4 / 04-02 Task 2 — atomic validated read/write for
// <project>/.bw-brain/arrangement-snapshot.json (D-03 + D-13). The snapshot
// is the durable mirror of the launcher grid (Plan 04-01's get.launcher_clips
// pull handler) plus optional derived analysis fields (sections, repetition,
// energyCurve, trackRoles) that Wave 3 analyzers (Plans 03/04) populate.
//
// Mirrors intent-store.ts (the canonical atomic-validated-read pattern):
//   - ENOENT → null (D-09: an absent snapshot is a valid state — the daemon
//     never synthesizes a default; boot.ts in Plan 04-05 pulls fresh on demand).
//   - Parse error throws with the path in the message (inspectable).
//   - Ajv boundary validation (compile-once at module load, AGENTS.md 64-65).
//   - Atomic save via atomic-write.ts (POSIX temp+rename — Pitfall 4 defense).
//
// Schema location (D-13): the snapshot schema lives INLINE here (daemon-internal
// TS interface + standalone-compiled Ajv schema). NOT under schemas/ — that
// dir is the cross-language wire contract; the snapshot never crosses the wire.
// The inline schema avoids `format:` keywords (AGENTS.md — addFormats NOT used).

import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { atomicWriteJson } from "../store/atomic-write.js";

/**
 * The launcher-grid snapshot + optional derived analysis. Written by Plan 04-05
 * (boot.ts refresh path); read by Wave 3 analyzers (Plans 03/04) and the
 * `bw-arrange review` CLI (Plan 04-06).
 *
 * `derived` is OPTIONAL — a freshly pulled snapshot pre-analysis is valid.
 * Wave 3 analyzers populate `derived` after running.
 */
export interface ArrangementSnapshot {
  version: string;
  /** ISO timestamp of the pull. */
  pulledAt: string;
  /** Profile name used for this snapshot (analyzers may re-key on profile change). */
  profile: string;
  sceneCount: number;
  trackCount: number;
  grid: {
    tracks: Array<{
      trackSid: string;
      name: string;
      scenes: Array<{
        sceneIdx: number;
        clipSid: string;
        hasContent: boolean;
        loopBeats: number;
        /** Empty when hasContent is false. Note shape is the diff-logic Note. */
        notes: Array<{ key: string; pitch: number; start: number; length: number; velocity: number }>;
      }>;
    }>;
    sceneNames: string[];
  };
  /** Optional — populated by Wave 3 analyzers (section-detector, repetition-report, etc.). */
  derived?: {
    sections?: Array<{ startScene: number; endScene: number; label: string; avgSimilarity: number; confidence: number }>;
    repetition?: Array<{ group: number[]; similarity: number; matchedOn: string[] }>;
    energyCurve?: Array<{ bar: number; value: number }>;
    trackRoles?: Record<string, { role: string; confidence: number; alternatives: Array<{ role: string; score: number }> }>;
  };
}

/**
 * Daemon-internal JSON Schema for arrangement-snapshot.json (D-13). Inline (NOT
 * under schemas/) because the snapshot never crosses the wire as a JSON-Lines
 * message — it's a daemon-owned durable file. No `format:` keywords (AGENTS.md
 * — addFormats deliberately NOT used; ISO timestamps are validated structurally
 * as strings, the daemon emits them via `new Date().toISOString()`).
 */
const snapshotSchema = {
  $id: "urn:bw-brain:arrangement-snapshot",
  type: "object",
  required: ["version", "pulledAt", "profile", "sceneCount", "trackCount", "grid"],
  additionalProperties: false,
  properties: {
    version: { type: "string", minLength: 1 },
    pulledAt: { type: "string", minLength: 1 },
    profile: { type: "string", minLength: 1 },
    sceneCount: { type: "number", minimum: 0 },
    trackCount: { type: "number", minimum: 0 },
    grid: {
      type: "object",
      required: ["tracks", "sceneNames"],
      additionalProperties: false,
      properties: {
        tracks: {
          type: "array",
          // fix-04.3 (DEFECT D): a persistable snapshot carries at least one
          // track. A zero-track pull is an INCOMPLETE grid (unsynced bank /
          // stale bridge) that refreshArrangementSnapshot refuses up front —
          // minItems is the write-gate backstop so tracks: [] can never
          // reach disk through ANY path (and the shared validator refuses a
          // hand-written empty file at load).
          minItems: 1,
          items: {
            type: "object",
            required: ["trackSid", "name", "scenes"],
            additionalProperties: false,
            properties: {
              trackSid: { type: "string", minLength: 1 },
              name: { type: "string" },
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  required: ["sceneIdx", "clipSid", "hasContent", "loopBeats", "notes"],
                  additionalProperties: false,
                  properties: {
                    sceneIdx: { type: "number", minimum: 0 },
                    clipSid: { type: "string" },
                    hasContent: { type: "boolean" },
                    loopBeats: { type: "number", minimum: 0 },
                    notes: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["key", "pitch", "start", "length", "velocity"],
                        additionalProperties: false,
                        properties: {
                          key: { type: "string" },
                          pitch: { type: "number", minimum: 0, maximum: 127 },
                          start: { type: "number", minimum: 0 },
                          length: { type: "number", minimum: 0 },
                          velocity: { type: "number", minimum: 0, maximum: 127 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        sceneNames: { type: "array", items: { type: "string" } },
      },
    },
    derived: {
      type: "object",
      additionalProperties: false,
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            required: ["startScene", "endScene", "label", "avgSimilarity", "confidence"],
            additionalProperties: false,
            properties: {
              startScene: { type: "number", minimum: 0 },
              endScene: { type: "number", minimum: 0 },
              label: { type: "string", minLength: 1 },
              avgSimilarity: { type: "number", minimum: 0, maximum: 1 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
        repetition: {
          type: "array",
          items: {
            type: "object",
            required: ["group", "similarity", "matchedOn"],
            additionalProperties: false,
            properties: {
              group: { type: "array", items: { type: "number", minimum: 0 } },
              similarity: { type: "number", minimum: 0, maximum: 1 },
              matchedOn: { type: "array", items: { type: "string", minLength: 1 } },
            },
          },
        },
        energyCurve: {
          type: "array",
          items: {
            type: "object",
            required: ["bar", "value"],
            additionalProperties: false,
            properties: {
              bar: { type: "number", minimum: 0 },
              value: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
        trackRoles: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["role", "confidence", "alternatives"],
            additionalProperties: false,
            properties: {
              role: { type: "string", minLength: 1 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              alternatives: {
                type: "array",
                items: {
                  type: "object",
                  required: ["role", "score"],
                  additionalProperties: false,
                  properties: {
                    role: { type: "string", minLength: 1 },
                    score: { type: "number", minimum: 0, maximum: 1 },
                  },
                },
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
// (no schema uses `format` — verified; mirrors intent-store.ts:25).
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(snapshotSchema);
const validateSnapshot = ajv.getSchema(snapshotSchema.$id)!;

/**
 * Load + validate `<project>/.bw-brain/arrangement-snapshot.json`.
 *
 * @returns the validated {@link ArrangementSnapshot}, or `null` if the file is
 *   ABSENT (the daemon never synthesizes a default — boot.ts pulls fresh).
 * @throws Error("arrangement-snapshot.json invalid: ...") if the file exists
 *   but is unparseable JSON or fails Ajv validation. The thrown message carries
 *   the path + Ajv errors JSON so a user can see exactly what's wrong.
 *
 * @example
 * const snap = await loadArrangementSnapshot(".bw-brain/arrangement-snapshot.json");
 * if (snap === null) { /* pull fresh via get.launcher_clips *\/ }
 */
export async function loadArrangementSnapshot(path: string): Promise<ArrangementSnapshot | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    // Absent file → null. Any other I/O error (permissions, etc.) rethrows —
    // only ENOENT is the "absent" case (mirrors intent-store.ts:48-59).
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`arrangement-snapshot.json invalid: not valid JSON (${path})`);
  }

  if (!validateSnapshot(parsed)) {
    throw new Error(`arrangement-snapshot.json invalid: ${JSON.stringify(validateSnapshot.errors)} (${path})`);
  }

  return parsed as ArrangementSnapshot;
}

/**
 * Atomically save `<project>/.bw-brain/arrangement-snapshot.json`.
 *
 * 04.3 / 04.3-07 (DEFECT B): the write path is a SCHEMA GATE — the snapshot is
 * validated against the module's compile-once {@link validateSnapshot} BEFORE
 * {@link atomicWriteJson} runs. A schema-invalid snapshot (e.g. a raced
 * launcher grid with an empty trackSid) is rejected without touching disk, so
 * the previous file — if any — survives atomically. Callers treat a rejection
 * as a FAILED refresh/pull (query-server returns null; boot logs and
 * continues), never as a crash and never as license to render the invalid
 * grid from memory.
 *
 * Valid writes go via {@link atomicWriteJson} (POSIX temp+rename on the same
 * filesystem): a crash mid-write leaves either the old or the new file, NEVER
 * a half-written one (T-04-06 tampering defense). The parent directory is
 * auto-created.
 *
 * @throws Error("arrangement-snapshot.json save rejected: ...") when `snap`
 *   fails schema validation. The thrown message carries the stringified Ajv
 *   errors + the path (mirroring loadArrangementSnapshot's error shape so both
 *   surfaces are inspectable).
 *
 * @example
 * await saveArrangementSnapshot(".bw-brain/arrangement-snapshot.json", snap);
 */
export async function saveArrangementSnapshot(path: string, snap: ArrangementSnapshot): Promise<void> {
  if (!validateSnapshot(snap)) {
    throw new Error(`arrangement-snapshot.json save rejected: ${JSON.stringify(validateSnapshot.errors)} (${path})`);
  }
  await atomicWriteJson(path, snap);
}
