/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * STATE-01 raw project-state contract. The daemon normalizes bridge snapshots into this shape; every RawState the daemon holds is valid against this schema. Source: docs/seed.md §A 'Raw project state' generalized into JSON Schema 2020-12 (RESEARCH.md §Code Examples 'raw-state schema seed').
 */
export interface ProjectState {
  /**
   * Schema contract version (major.minor). Drives version-drift detection.
   */
  version: string;
  /**
   * SC#3 staleness marker. Optional on the persisted raw-state; REQUIRED on cli-query results. 'live' = bridge recently observed; 'stale' = bridge silent past watchdog threshold; 'disconnected' = bridge gone.
   */
  stateFreshness?: "live" | "stale" | "disconnected";
  /**
   * Project-level metadata mirrored from Bitwig.
   */
  project: {
    /**
     * Bitwig project name.
     */
    name: string;
    /**
     * BPM.
     */
    tempo: number;
    /**
     * e.g. '4/4'.
     */
    timeSignature: string;
    /**
     * Optional, e.g. 'A minor'.
     */
    keySignature?: string;
    /**
     * Transport state (pushed by Transport observers).
     */
    transport?: {
      playing?: boolean;
      positionBeats?: number;
      loop?: {
        enabled?: boolean;
        start?: number;
        length?: number;
      };
      /**
       * Automation-write state folded verbatim from transport.changed payloads (Phase 5, D-05-05) — the refusal-gate vocabulary for the automation apply path (05-05+).
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
         * An automation override is currently active.
         */
        overrideActive: boolean;
        /**
         * Transport automation write mode.
         */
        writeMode: "latch" | "touch" | "write";
      };
    };
  };
  /**
   * The GUI selection (cursor triple). All fields optional — selection can be empty (deselection). *Sid fields are STATE-04 fingerprint IDs, NOT Bitwig slot indices (Pitfall 2).
   */
  selection: {
    /**
     * STATE-04 fingerprint of the selected track. NEVER a bare slot index.
     */
    trackSid?: string;
    /**
     * STATE-04 fingerprint of the pinned/selected clip.
     */
    clipSid?: string;
    /**
     * STATE-04 fingerprint of the selected device.
     */
    deviceSid?: string;
    region?: {
      /**
       * Region start in beats.
       */
      start?: number;
      /**
       * Region end in beats.
       */
      end?: number;
    };
  };
  /**
   * Windowed TrackBank[N=8] snapshot (D-01). Open objects — element shape tightened when STATE-04 fingerprint map lands.
   */
  tracks?: {}[];
  /**
   * Pull-result cache (bw-midi inspect NoteStep dump). Open objects — element shape tightened in Phase 3.
   */
  clips?: {}[];
  /**
   * Pull-result cache (bw-device inspect CursorRemoteControlsPage walk, incl. VST/AU per D-02). Open objects — element shape tightened in Phase 5.
   */
  devices?: {}[];
  /**
   * D-04: automation mirror is deferred to Phase 5 (AUTO-01). The slot is RESERVED EMPTY in M1 — maxItems 0 enforces this at the schema level so producers cannot leak automation data prematurely.
   *
   * @maxItems 0
   */
  automation?: [];
  /**
   * Phase 5 (AUTO-01/D-05-01): bounded per-parameter MOVEMENT AGGREGATES keyed by `${deviceKey}:${source}:${paramIndex}`, folded daemon-side from parameter.changed events. NEVER an event log — each entry is 8 bounded scalar fields (T-05-03) and the map is capped at 512 entries (the fold evicts the lowest-lastMovedAt entry; maxProperties mirrors the cap for defense in depth).
   */
  parameters?: {
    [k: string]: {
      /**
       * Device identity key in the selected track's chain.
       */
      deviceKey: string;
      /**
       * Parameter index within the device (cursorDevice.getParameter(int) window).
       */
      paramIndex: number;
      /**
       * Optional human-readable parameter name.
       */
      paramName?: string;
      /**
       * Movement origin.
       */
      source: "device_parameter" | "remote_page";
      /**
       * Movements observed (incoming value differing from lastValue by more than 1e-4).
       */
      movementCount: number;
      /**
       * Latest observed normalized value.
       */
      lastValue: number;
      /**
       * Minimum observed value.
       */
      minValue: number;
      /**
       * Maximum observed value.
       */
      maxValue: number;
      /**
       * Unix-seconds timestamp of the last movement (drives lowest-lastMovedAt eviction).
       */
      lastMovedAt: number;
    };
  };
}
