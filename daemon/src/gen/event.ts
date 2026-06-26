/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * An observational event fired by the bridge (sender-originated, no ack expected). Frozen from docs/seed.md §Event example (selection.changed). timestamp is REQUIRED on events (sender-originated). $comment: only selection.changed is frozen in Phase 1 (the 1-event spike honestly validates this); additional event types are Phase 2-extensible (Pitfall 4 — do not over-freeze guesses).
 */
export interface Event {
  version: string;
  type: "selection.changed";
  /**
   * Unix-seconds, sender-originated. Required on every event.
   */
  timestamp: number;
  /**
   * selection.changed payload. All fields optional — selection can be empty (deselection).
   */
  payload?: {
    trackId?: string;
    clipId?: string;
    deviceId?: string;
  };
}
