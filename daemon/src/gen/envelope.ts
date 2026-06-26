/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * The versioned JSON-Lines wire envelope. This is the single cross-language source of truth both halves (Java bridge + TS daemon) bind FROM. A oneOf discriminator branches into the 5 message-type schemas (event/request/response/edit/handshake). Source: docs/seed.md §Proposed local protocol generalized + jsonlines.org + JSON Schema 2020-12 (RESEARCH.md §Code Examples).
 */
export type Envelope = {
  /**
   * Semantic major.minor protocol version. The major component drives the version-handshake gate (Pattern 3); enables protocol-drift detection (SC#3).
   */
  version: string;
  /**
   * Message type. Constrained per message-type sub-schema via enum (event/request/response/edit/handshake). Acts as the wire-level discriminator for the TS discriminated-union model (AGENTS.md line 35).
   */
  type: string;
  /**
   * Request/response correlation id. Required on requests + responses + edits (they are requests); optional on events (sender-originated, no ack expected) and handshake.
   */
  id?: string;
  /**
   * Unix-seconds timestamp, sender-originated. Required on events; optional elsewhere.
   */
  timestamp?: number;
  /**
   * Success flag. Required on responses + hello.response; absent on requests/events/edits.
   */
  ok?: boolean;
  /**
   * Message payload. Open object at the envelope level; constrained per message-type sub-schema. For the spike the payload shape is frozen only for the ~4 seed-example messages (Pitfall 4: do not over-freeze).
   */
  payload?: {};
} & (
  | {
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
  | {
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
  | {
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
  | {
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
  | {
      [k: string]: unknown;
    }
);
