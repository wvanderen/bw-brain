// daemon/src/ingest/normalizer.ts
//
// STATE-01 raw-state normalizer — the SECOND-stage validator (after the
// envelope). Receives an Ajv-validated envelope payload and produces a
// RawState validated against schemas/project-state.schema.json. Invalid ->
// drop + log, NEVER throw (Shared Pattern E: validate-at-boundary).
//
// PITFALL 2 defense: the project-state schema's selection.*Sid fields carry
// the ^trk_|^clip_|^dev_ fingerprint regex — a bare Bitwig slot index like
// "trk_5" is structurally invalid and drops here (fingerprint gate).
//
// Ajv is constructed and the validator COMPILED ONCE at module load
// (AGENTS.md 64-65 standalone-compiled pattern; mirrors reader.ts lines 32-59).
//
// Source: 02-PATTERNS.md Assignment 5 lines 227-257 + Shared Pattern E lines
// 684-697.

import { Ajv2020 } from "ajv/dist/2020.js";
import projectStateSchema from "../../../schemas/project-state.schema.json" with { type: "json" };
import type { RawState } from "../state/reconcile.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(projectStateSchema);
const validateProjectState = ajv.getSchema(projectStateSchema.$id)!;

/**
 * Normalize a raw envelope payload into a schema-valid RawState.
 *
 * @returns the validated RawState, or `null` if the payload fails schema
 *   validation (drop-never-throw — the caller's pipeline is never crashed by
 *   a bad payload; the drop is logged to console.error so it stays inspectable).
 *
 * This is the second-stage gate after the envelope (reader.ts is the first).
 * A payload that passed the envelope schema but is not a valid RawState
 * (e.g. a slot-index trackSid) drops here.
 */
export function normalize(payload: unknown): RawState | null {
  if (!validateProjectState(payload)) {
    console.error(
      "[normalizer] project-state validation failed:",
      JSON.stringify(validateProjectState.errors),
    );
    return null;
  }
  return payload as RawState;
}
