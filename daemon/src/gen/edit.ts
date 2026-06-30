/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * An edit request (apply.patch). This is the trust-spine: payload.undoLabel is MANDATORY and payload.operations MUST be a non-empty array (PROJECT.md / AGENTS.md line 17: 'undo labels mandatory'). Frozen from docs/seed.md §Edit request example + §data model patch operations.
 */
export interface Edit {
  version: string;
  type: "apply.patch";
  /**
   * Edit requests ARE requests — correlation id REQUIRED.
   */
  id: string;
  /**
   * Patch payload. undoLabel + operations are both REQUIRED (trust-spine).
   */
  payload: {
    /**
     * MANDATORY non-empty undo label. PROJECT.md trust model: every applied patch gets an undo label. Enforced at schema level.
     */
    undoLabel: string;
    /**
     * Non-empty array of primitive patch operations (add_note/remove_note/update_note_field). Element shape tightened (Phase 3, EDIT-01) to the patch.schema.json#/$defs/PrimitiveOp union — the cross-file $ref is resolved by $id at runtime when both schemas are registered in one Ajv instance.
     *
     * @minItems 1
     */
    operations: [
      (
        | {
            op: "add_note";
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            note: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
          }
        | {
            op: "remove_note";
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            note: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
          }
        | {
            op: "update_note_field";
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            before: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            after: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
          }
      ),
      ...(
        | {
            op: "add_note";
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            note: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
          }
        | {
            op: "remove_note";
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            note: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
          }
        | {
            op: "update_note_field";
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            before: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
            /**
             * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
             */
            after: {
              /**
               * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
               */
              key: string;
              pitch: number;
              start: number;
              length: number;
              velocity: number;
            };
          }
      )[]
    ];
    [k: string]: unknown;
  };
}
