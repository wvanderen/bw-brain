/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * D-07 daemon-local CLI result contract. The response half of the CLI↔daemon channel. stateFreshness is REQUIRED on every result (SC#3 surfaces here) and every result carries assumptions[] plumbing from day one (UX-06). Source: CONTEXT.md D-07/D-10 + RESEARCH.md Pattern 3 + 'assumptions[] shape'.
 */
export type CliResult = {
  [k: string]: unknown;
} & {
  /**
   * Schema contract version (major.minor).
   */
  version: string;
  /**
   * Discriminator. Always 'result' on the response half.
   */
  type: "result";
  /**
   * Success flag. REQUIRED. Drives the allOf conditional shape below.
   */
  ok: boolean;
  /**
   * SC#3 staleness marker. REQUIRED on every result so staleness surfaces to every CLI consumer (RESEARCH.md lines 598-601). 'live' = bridge recently observed; 'stale' = bridge silent past watchdog threshold; 'disconnected' = bridge gone.
   */
  stateFreshness: "live" | "stale" | "disconnected";
  /**
   * Op-specific result payload. Present (and allowed) only when ok:true. The allOf block FORBIDS payload when ok:false.
   */
  payload?: {};
  /**
   * Error code/message. REQUIRED when ok:false (e.g. 'not_implemented').
   */
  error?: string;
  /**
   * Milestone when this op ships for real. REQUIRED when ok:false (the stub arm). M2=MIDI patching, M3=arrangement, M4=automation.
   */
  availableFrom?: "M2" | "M3" | "M4";
  /**
   * UX-06: every result states the assumptions behind its payload. Attached from day one. Each item carries {claim, confidence, source}. Optional at the schema level (a minimal result like a stub's not_implemented may carry none); populated by every result that ships a derived/observed payload.
   */
  assumptions?: {
    /**
     * Human-readable assumption, e.g. 'selected clip has 32 notes' or 'intent says preserve bass motif'.
     */
    claim: string;
    /**
     * Confidence ∈ [0,1]. 1.0 = directly observed; 0.5 = inferred; <0.5 should not appear (dropped by the registry).
     */
    confidence: number;
    /**
     * Where the assumption came from.
     */
    source: "selection" | "intent" | "config" | "default";
  }[];
};
