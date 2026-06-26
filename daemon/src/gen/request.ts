/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * A request message from client to bridge/daemon. id is REQUIRED (correlation key — echoed on the response). Frozen from docs/seed.md §Request example (get.selected_clip). $comment: payload is left open for parameterized requests in the spike; tighten in Phase 2 (Pitfall 4).
 */
export interface Request {
  version: string;
  type: "get.selected_clip";
  /**
   * Request/response correlation id. REQUIRED on every request.
   */
  id: string;
  /**
   * Optional request parameters. Open for the spike; tightened per request type in Phase 2.
   */
  payload?: {};
}
