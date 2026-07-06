// daemon/src/state/roles-store.ts
//
// P4 / 04-02 Task 2 — atomic validated read/write for
// <project>/.bw-brain/roles.json (D-09 + D-13). Mirrors arrangement-snapshot.ts
// EXACTLY: same ENOENT→null, same Ajv-at-boundary compile-once, same atomic
// temp+rename save. The roles file is the durable output of Wave 3 track-role
// classification (Plan 04-04); boot.ts (Plan 04-05) reads it to skip
// reclassification when the project state hasn't changed.
//
// D-09: an absent roles.json returns null — the daemon never fabricates roles
// (the analyzer refuses rather than guessing, mirrors motif-signature.ts:176).

import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { atomicWriteJson } from "../store/atomic-write.js";

/**
 * The durable track-role classification file. Keyed by trackSid; each entry
 * carries the chosen role, a confidence ∈ [0,1], and a ranked alternatives list
 * (so the CLI can surface "this could also be percussion, score 0.31"). An
 * optional `assumption` documents WHY the role was chosen (especially for
 * low-confidence "unknown" classifications — the producer can audit).
 *
 * Shape source: 04-RESEARCH.md §`roles.json` shape (lines 829-856).
 */
export interface RolesFile {
  version: string;
  /** ISO timestamp of the most recent classification. */
  classifiedAt: string;
  /** Profile name used for classification (role templates are profile-specific). */
  profile: string;
  tracks: Record<
    string,
    {
      role: string;
      confidence: number;
      alternatives: Array<{ role: string; score: number }>;
      /** Optional — documents why a low-confidence role was chosen. */
      assumption?: string;
    }
  >;
}

/**
 * Daemon-internal JSON Schema for roles.json (D-13 sibling of the snapshot
 * schema). Inline (NOT under schemas/) — the roles file never crosses the wire.
 * No `format:` keywords (AGENTS.md — addFormats NOT used).
 */
const rolesSchema = {
  $id: "urn:bw-brain:roles",
  type: "object",
  required: ["version", "classifiedAt", "profile", "tracks"],
  additionalProperties: false,
  properties: {
    version: { type: "string", minLength: 1 },
    classifiedAt: { type: "string", minLength: 1 },
    profile: { type: "string", minLength: 1 },
    tracks: {
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
          assumption: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;

// Ajv2020 = JSON Schema Draft 2020-12. Compile-once at module load (AGENTS.md
// 64-65 standalone-compiled pattern). addFormats NOT applied (no `format:`
// keywords in the schema — verified, mirrors intent-store.ts:25).
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(rolesSchema);
const validateRoles = ajv.getSchema(rolesSchema.$id)!;

/**
 * Load + validate `<project>/.bw-brain/roles.json`.
 *
 * @returns the validated {@link RolesFile}, or `null` if the file is ABSENT.
 *   An absent roles.json means no classification has run yet (Plan 04-04 will
 *   produce one); the daemon never fabricates a default (D-09).
 * @throws Error("roles.json invalid: ...") if the file exists but is unparseable
 *   or schema-invalid. The thrown message carries the path + Ajv errors.
 *
 * @example
 * const roles = await loadRoles(".bw-brain/roles.json");
 * if (roles === null) { /* run track-role classification (Plan 04-04) *\/ }
 */
export async function loadRoles(path: string): Promise<RolesFile | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`roles.json invalid: not valid JSON (${path})`);
  }

  if (!validateRoles(parsed)) {
    throw new Error(`roles.json invalid: ${JSON.stringify(validateRoles.errors)} (${path})`);
  }

  return parsed as RolesFile;
}

/**
 * Atomically save `<project>/.bw-brain/roles.json`. Same atomic-write discipline
 * as {@link saveArrangementSnapshot} — POSIX temp+rename on the same filesystem
 * (T-04-06 tampering defense). Parent directory auto-created.
 *
 * @example
 * await saveRoles(".bw-brain/roles.json", roles);
 */
export async function saveRoles(path: string, roles: RolesFile): Promise<void> {
  await atomicWriteJson(path, roles);
}
