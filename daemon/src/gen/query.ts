/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * D-07 daemon-local CLI query contract. The query half of the CLI↔daemon channel (separate from the bridge TCP protocol — Pitfall 3 defense). Source: CONTEXT.md D-07 + RESEARCH.md Pattern 3 'Query/response shape'.
 */
export interface CliQuery {
  /**
   * Schema contract version (major.minor).
   */
  version: string;
  /**
   * Discriminator. Always 'query' on the request half.
   */
  type: "query";
  /**
   * The 5 live M1 ops + diff (promoted per D-05). Stubs (bw-arrange/bw-automation/bw-edit) do NOT get ops here — they emit not_implemented results without ever querying the daemon.
   */
  op: "focus.export" | "project.summary" | "project.region" | "midi.inspect" | "device.inspect" | "diff";
  /**
   * Op-specific arguments. Open at the schema level; op-specific shapes (e.g. project.region {start,end}) are enforced by the daemon handler. Tightened per-op in Phase 3 if patterns stabilize.
   */
  payload?: {
    [k: string]: unknown;
  };
}
