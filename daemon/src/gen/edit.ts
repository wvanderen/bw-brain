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
     * Non-empty array of patch operations. Element shapes (midi_velocity_scale, insert_notes, ...) from seed.md §data model; tightened in Phase 3 (EDIT-01). For the spike, freeze the envelope-level requirement (non-empty array), not the element union.
     *
     * @minItems 1
     */
    operations: [{}, ...{}[]];
    [k: string]: unknown;
  };
}
