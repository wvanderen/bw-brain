// daemon/src/patch/patch-schema.ts
//
// Phase 3 (EDIT-01) — the Patch contract validator. Compiled ONCE at module
// load (AGENTS.md "standalone-compiled validators" pattern; mirrors
// daemon/src/state/intent-store.ts:17-27 and daemon/src/protocol/reader.ts).
//
// The Patch object crosses THREE process boundaries (CLI emit, daemon entry,
// bridge apply) and is validated by Ajv at each one (defense-in-depth). This
// module is the canonical validator loader — both the CLI and the daemon
// import it. The bridge (Java) re-validates against the same JSON schema via
// Jackson + a hand-rolled discriminator check.
//
// Cross-file $ref: edit.schema.json's operations.items $refs
// patch.schema.json#/$defs/PrimitiveOp. Ajv resolves this by $id at compile
// time when both schemas are registered in ONE instance (the json-schema-ref-
// parser limitation that forced scripts/gen-types.mjs does NOT apply at
// runtime). The edit envelope MUST be registered alongside the patch schema
// so the cross-file $ref resolves — this module loads both (mirrors
// daemon/src/protocol/schemas.test.ts:44-65).
//
// ESM + NodeNext: relative imports end in .js (AGENTS.md convention). The Ajv
// named import + .js ext is required under module:NodeNext (ajv 8.20 ships no
// exports map — see schemas.test.ts:16-25 rationale).

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import patchSchema from "../../../schemas/patch.schema.json" with { type: "json" };
import editSchema from "../../../schemas/protocol/edit.schema.json" with { type: "json" };
import envelopeSchema from "../../../schemas/protocol/envelope.schema.json" with { type: "json" };
import eventSchema from "../../../schemas/protocol/event.schema.json" with { type: "json" };
import requestSchema from "../../../schemas/protocol/request.schema.json" with { type: "json" };
import responseSchema from "../../../schemas/protocol/response.schema.json" with { type: "json" };
import handshakeSchema from "../../../schemas/protocol/handshake.schema.json" with { type: "json" };
import type { Patch } from "../gen/patch.js";

// Ajv2020 = JSON Schema Draft 2020-12 mode (AGENTS.md line 37). The default
// `new Ajv()` is draft-07 and would reject our `$schema`. Named import +
// `.js` extension are required under module:NodeNext (ajv 8.20 ships no
// exports map). addFormats NOT applied (no frozen schema uses `format:` —
// verified; see schemas.test.ts rationale).
const ajv = new Ajv2020({ allErrors: true, strict: false });

// Phase 3: register the patch contract FIRST so edit.schema.json's
// operations.items $ref to PrimitiveOp resolves by $id at compile time. Then
// register the rest of the protocol family so the envelope oneOf $refs
// resolve cleanly when a caller imports the envelope validator too.
ajv.addSchema(patchSchema);
ajv.addSchema(eventSchema);
ajv.addSchema(requestSchema);
ajv.addSchema(responseSchema);
ajv.addSchema(editSchema);
ajv.addSchema(handshakeSchema);
ajv.addSchema(envelopeSchema);

/**
 * Validate a candidate Patch object against `schemas/patch.schema.json`.
 *
 * Compiled ONCE at module load — never recompiled per call (AGENTS.md
 * standalone-compiled-validators pattern). `additionalProperties:false` +
 * the primitive discriminated union make this the structural trust-spine
 * gate: a malformed patch cannot pass.
 *
 * @returns `true` if `data` is a valid Patch; `false` otherwise (inspect
 *   `validatePatch.errors` for the Ajv error list).
 */
export const validatePatch: ValidateFunction<Patch> = ajv.getSchema(
  patchSchema.$id,
)! as ValidateFunction<Patch>;

/**
 * Validate `data` and either return it typed as {@link Patch} or throw a
 * structured Error carrying the Ajv errors JSON.
 *
 * Phase 5 (05-05): ALSO enforces the scope↔op pairing cross-property rule —
 * note ops (add_note/remove_note/update_note_field) require the ClipScope
 * variant; automation ops (set_parameter_value/automation_points/
 * remove_automation_points) require the AutomationScope variant. Pure 2020-12
 * cannot express cross-property rules without the non-standard $data keyword
 * (which the Java bridge's Jackson parser would ignore), so this lives at the
 * TS/runtime layer — the exact 03-01 precedent (Pitfall 2 layering).
 *
 * @throws Error("patch invalid: <ajv errors>") if `data` fails schema
 *   validation. The thrown message includes the Ajv errors so the caller
 *   (and the user, when the daemon surfaces it) can see exactly which
 *   constraint was violated.
 * @throws Error("patch invalid: scope/op pairing — ...") when an op kind and
 *   the scope variant disagree (e.g. an automation op under a ClipScope).
 *
 * Mirrors `intent-store.ts:69`'s structured-throw pattern.
 */

/** The note op discriminants (Phase 3 clip kinds). */
const NOTE_OPS: ReadonlySet<string> = new Set(["add_note", "remove_note", "update_note_field"]);

/** The automation op discriminants (Phase 5 05-05 kinds). */
const AUTOMATION_OPS: ReadonlySet<string> = new Set([
  "set_parameter_value",
  "automation_points",
  "remove_automation_points",
]);

/** Narrowing predicate: the AutomationScope variant of the Scope oneOf. */
export function isAutomationScope(
  scope: Patch["scope"],
): scope is Extract<Patch["scope"], { deviceSid: string }> {
  return "deviceSid" in scope;
}

/**
 * The scope↔op pairing rule (05-05 Task 1): every op's kind must match the
 * scope variant. Returns `null` when the pairing holds, or a human-readable
 * violation message otherwise (mirrors the Ajv-error surfacing style).
 */
export function scopeOpPairingError(patch: Patch): string | null {
  const automationScoped = isAutomationScope(patch.scope);
  for (const op of patch.operations) {
    if (automationScoped && NOTE_OPS.has(op.op)) {
      return `patch invalid: scope/op pairing — note op '${op.op}' requires the clip scope (ClipScope), not the automation scope`;
    }
    if (!automationScoped && AUTOMATION_OPS.has(op.op)) {
      return `patch invalid: scope/op pairing — automation op '${op.op}' requires the automation scope (AutomationScope), not the clip scope`;
    }
  }
  return null;
}

export function validatePatchOrThrow(data: unknown): Patch {
  if (!validatePatch(data)) {
    throw new Error(`patch invalid: ${JSON.stringify(validatePatch.errors)}`);
  }
  const pairing = scopeOpPairingError(data as Patch);
  if (pairing !== null) {
    throw new Error(pairing);
  }
  return data as Patch;
}
