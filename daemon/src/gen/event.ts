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
  type: "selection.changed" | "track.name_changed" | "clip.name_changed" | "device.name_changed" | "transport.changed";
  /**
   * Unix-seconds, sender-originated. Required on every event.
   */
  timestamp: number;
  /**
   * Event payload. Fields are a permissive union across the 5 observational event types (all optional). selection.changed carries trackId/clipId/deviceId (legacy identity) + slot (raw cursor position). *.name_changed carry name (+ slot for windowed-bank tracks). transport.changed carries playing. slot is a RAW Bitwig position index — NOT a stable id; the daemon computes STATE-04 fingerprints from it (Pitfall 2).
   */
  payload?: {
    /**
     * Raw identity string for selection.changed (kept for backward-compat with the Phase-1 captured round-trip).
     */
    trackId?: string;
    clipId?: string;
    deviceId?: string;
    /**
     * Raw Bitwig position index (cursor or windowed-bank slot). NOT a stable id.
     */
    slot?: number;
    /**
     * Observed name for track/clip/device name_changed events.
     */
    name?: string;
    /**
     * Transport play state for transport.changed (from Transport.isPlaying()).
     */
    playing?: boolean;
    /**
     * STATE-04 fingerprint of the clip (D-03 push). Populated by the bridge on every clip.name_changed event; the daemon folds this into selection.clipSid immediately. Pre-fix bridges omit it (backward-compat NO-OP in fold-event.ts).
     */
    clipSid?: string;
  };
}
