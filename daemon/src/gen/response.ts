/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * A response to a prior request. id REQUIRED (echoes the originating request); ok boolean REQUIRED; payload open for the spike. Frozen from docs/seed.md §Response example ({id, ok:true, payload:{clipId, notes}}).
 */
export interface Response {
  version: string;
  type: "response";
  /**
   * Echoes the originating request id. REQUIRED.
   */
  id: string;
  /**
   * Success flag. REQUIRED on every response.
   */
  ok: boolean;
  /**
   * Response payload. Open for the spike; tightened per request type in Phase 2.
   */
  payload?: {};
}
