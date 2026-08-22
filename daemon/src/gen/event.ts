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
  type:
    | "selection.changed"
    | "track.name_changed"
    | "clip.name_changed"
    | "device.name_changed"
    | "transport.changed"
    | "parameter.changed";
  /**
   * Unix-seconds, sender-originated. Required on every event.
   */
  timestamp: number;
  /**
   * Event payload. Fields are a permissive union across the 6 observational event types (all optional). selection.changed carries trackId/clipId/deviceId (legacy identity) + slot (raw cursor position). *.name_changed carry name (+ slot for windowed-bank tracks). transport.changed carries playing + the optional automationWrite object (D-05-05 write-state vocabulary). parameter.changed carries deviceKey/paramIndex/paramName?/source/value. slot is a RAW Bitwig position index — NOT a stable id; the daemon computes STATE-04 fingerprints from it (Pitfall 2).
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
    /**
     * Device identity key for parameter.changed (Phase 5) — identifies the device in the selected track's chain whose parameter moved (D-05-02).
     */
    deviceKey?: string;
    /**
     * Parameter index within the device for parameter.changed (Phase 5) — the cursorDevice.getParameter(int) window (A1-NEGATED fallback surface).
     */
    paramIndex?: number;
    /**
     * Optional human-readable parameter name for parameter.changed (Phase 5).
     */
    paramName?: string;
    /**
     * Movement origin for parameter.changed (Phase 5): direct device parameter vs remote-controls page knob.
     */
    source?: "device_parameter" | "remote_page";
    /**
     * Normalized observed value [0,1] for parameter.changed (Phase 5). Scale conversion happens at the bridge boundary (Pitfall 6).
     */
    value?: number;
    /**
     * Automation-write state for transport.changed (Phase 5, D-05-05) — the refusal-gate vocabulary the daemon's automation apply path consumes (transport_stopped / automation_write_disabled / automation_override_active).
     */
    automationWrite?: {
      /**
       * Arranger automation write armed.
       */
      arrangerWriteEnabled: boolean;
      /**
       * Launcher automation write armed.
       */
      launcherWriteEnabled: boolean;
      /**
       * An automation override is currently active (e.g. a touched parameter fighting the envelope).
       */
      overrideActive: boolean;
      /**
       * Transport automation write mode.
       */
      writeMode: "latch" | "touch" | "write";
    };
  };
}
