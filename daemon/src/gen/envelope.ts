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
      type:
        | "selection.changed"
        | "track.name_changed"
        | "clip.name_changed"
        | "device.name_changed"
        | "transport.changed";
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
  | {
      version: string;
      type: "get.selected_clip" | "get.selected_device_chain" | "get.project_summary";
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
         * Non-empty array of primitive patch operations (add_note/remove_note/update_note_field). Element shape tightened (Phase 3, EDIT-01) to the patch.schema.json#/$defs/PrimitiveOp union — the cross-file $ref is resolved by $id at runtime when both schemas are registered in one Ajv instance.
         *
         * @minItems 1
         */
        operations: [
          (
            | {
                op: "add_note";
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                note: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
              }
            | {
                op: "remove_note";
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                note: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
              }
            | {
                op: "update_note_field";
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                before: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                after: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
              }
          ),
          ...(
            | {
                op: "add_note";
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                note: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
              }
            | {
                op: "remove_note";
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                note: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
              }
            | {
                op: "update_note_field";
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                before: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
                /**
                 * Canonical clip note shape. Reconciled against daemon/src/cli/diff-logic.ts Note (the SC#1 round-trip proven shape).
                 */
                after: {
                  /**
                   * Content-derived stable identity. Format: n:${pitch}:${startQuantized} (1/64-beat quantization — see inverse-ops.ts noteKey). pitch+start ARE identity; velocity/length are mutable content.
                   */
                  key: string;
                  pitch: number;
                  start: number;
                  length: number;
                  velocity: number;
                };
              }
          )[]
        ];
        [k: string]: unknown;
      };
    }
  | {
      [k: string]: unknown;
    }
);
