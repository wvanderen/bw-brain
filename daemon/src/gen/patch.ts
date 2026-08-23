/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * EDIT-01 patch contract. scope → operations → rationale → reversibility → risk. Primitive CRUD ops are canonical (D-01); transformIntent rides as metadata the bridge NEVER branches on. Source: CONTEXT.md D-01/D-02/D-03/D-11 + RESEARCH.md §Code Examples 'schemas/patch.schema.json sketch'.
 */
export interface Patch {
  /**
   * Random UUID minted by the daemon (correlator.ts:91 pattern). NEVER a content hash (Pitfall 5 — two previews of the same logical transform must yield distinct patchIds; the candidate store keys by patchId).
   */
  patchId: string;
  /**
   * MANDATORY non-empty undo label, lifted into Patch for durable history so revert has the label without needing the envelope. The bridge apply.patch envelope (edit.schema.json) ALSO requires undoLabel — defense-in-depth.
   */
  undoLabel?: string;
  /**
   * D-02/Phase 5: a patch targets EXACTLY ONE scope variant — a single cursor clip (ClipScope) OR a single device parameter (AutomationScope). The scope↔op pairing (note ops require ClipScope; automation ops require AutomationScope) is enforced at the TS layer by validatePatchOrThrow (03-01 precedent — pure 2020-12 cannot express cross-property rules).
   */
  scope:
    | {
        /**
         * The cursor clip's stable id (16 hex chars after the 'clip_' prefix).
         */
        clipSid: string;
        /**
         * D-11 region-aware transform target. Default (absent) is whole clip. When present, the transform operates ONLY within [start, end) beats; motif signature is computed over the region with the full clip as context.
         */
        region?: {
          start: number;
          end: number;
        };
      }
    | {
        /**
         * The target device's stable fingerprint id (16 hex chars after the 'dev_' prefix). IDENTICAL to the parameter.changed payload deviceKey (the cross-plan equivalence pin).
         */
        deviceSid: string;
        /**
         * The single targeted parameter index (D-05-14 bound: 0..127).
         */
        paramIndex: number;
        /**
         * The write surface the index addresses. remote_page = the live-proven CursorRemoteControlsPage knob path (05-02); device_parameter = the cursorDevice.getParameter(int) path (Java-side graceful degradation, live check flagged for the 05-10 UAT). Maps 1:1 to the parameter.changed payload source field.
         */
        paramSource: "device_parameter" | "remote_page";
        /**
         * D-05-14: the authored region is bounded to ≤ 16 bars starting at an arranger bar.
         */
        region: {
          /**
           * First arranger bar (0-based).
           */
          startBar: number;
          /**
           * Region length in bars. D-05-14 hard bound: 1..16.
           */
          lengthBars: number;
        };
      };
  /**
   * Non-empty array of primitive ops (D-01 hybrid catalog — primitives canonical). The bridge consumes ONLY primitive ops; transformIntent is metadata the bridge NEVER reads (Pitfall 7).
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
      | {
          op: "set_parameter_value";
          /**
           * Normalized target value (Pitfall 6 — the Parameter.set contract takes 0..1).
           */
          value: number;
        }
      | {
          op: "automation_points";
          /**
           * D-05-14: at most 64 authored points per op.
           *
           * @minItems 1
           * @maxItems 64
           */
          points: [
            {
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            },
            ...{
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            }[]
          ];
        }
      | {
          op: "remove_automation_points";
          /**
           * D-05-14: at most 64 points per op.
           *
           * @minItems 1
           * @maxItems 64
           */
          points: [
            {
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            },
            ...{
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            }[]
          ];
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
      | {
          op: "set_parameter_value";
          /**
           * Normalized target value (Pitfall 6 — the Parameter.set contract takes 0..1).
           */
          value: number;
        }
      | {
          op: "automation_points";
          /**
           * D-05-14: at most 64 authored points per op.
           *
           * @minItems 1
           * @maxItems 64
           */
          points: [
            {
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            },
            ...{
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            }[]
          ];
        }
      | {
          op: "remove_automation_points";
          /**
           * D-05-14: at most 64 points per op.
           *
           * @minItems 1
           * @maxItems 64
           */
          points: [
            {
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            },
            ...{
              /**
               * Position in beats (region-relative >= 0).
               */
              beat: number;
              /**
               * Normalized target value (Pitfall 6 — 0..1).
               */
              value: number;
            }[]
          ];
        }
    )[]
  ];
  /**
   * D-01 metadata. Human/audit readability. The bridge NEVER branches on this field (Pitfall 7) — new transforms emit the SAME primitive kinds, and dispatch stays discriminant-only forever (the retired '3-case forever' count is deliberate: Phase 5 added the automation op kinds; the branch count grows with the union, transformIntent never grows a branch).
   */
  transformIntent?: {
    /**
     * The semantic transform name. 'manual' covers hand-authored patches (no transform engine origin).
     */
    name?: "vary" | "counterline" | "voice-leading-fix" | "humanize" | "manual";
    /**
     * Free-form variant label (e.g. 'rhythmic-displacement', 'octave-overlay'). Readable in patch-history.jsonl audit entries.
     */
    variant?: string;
    /**
     * The genre profile that flavored this transform (e.g. 'generic', 'techno'). Set by the transform engine from intent.profile (D-14).
     */
    profile?: string;
  };
  /**
   * MANDATORY human-readable rationale. PROJECT.md §Edit model: every patch carries scope/operations/rationale/reversibility/risk.
   */
  rationale: string;
  /**
   * D-03: primitive ops are self-inverse at creation time, so most patches are 'self-inverse'. 'manual-inverse' covers patches requiring hand-rolled revert (rare). 'irreversible' is reserved for future destructive ops (none in P3).
   */
  reversibility: "self-inverse" | "manual-inverse" | "irreversible";
  /**
   * D-07 author-declares/daemon-floors risk classes. low: humanize/cleanup/macro (one-step ok). medium: add/remove few notes, section dup. high: reharmonization, broad arrangement, multi-track, belowBar (D-09). The daemon may UPGRADE (never downgrade).
   */
  risk: "low" | "medium" | "high";
  /**
   * D-09 override marker. true when this patch was a below-motif-threshold near-miss the producer explicitly allowed via --allow-below-bar. Forces risk=high (INV-10); stamped into patch-history.jsonl for audit.
   */
  belowBar?: boolean;
  /**
   * The motif-preservation score (MIDI-01). For cleanup transforms (D-10) this field may be absent. For creative transforms it gates accept-vs-refuse (D-08).
   */
  motifSimilarity?: number;
  /**
   * D-12 harmonic center. Default source is user-authored in intent.json; inferred fallback discloses via assumptions[] + source: 'inferred'.
   */
  harmonicCenter?: {
    key: "A" | "Bb" | "B" | "C" | "Db" | "D" | "Eb" | "E" | "F" | "F#" | "G" | "Ab";
    mode: "major" | "minor";
    source?: "authored" | "inferred";
    confidence?: number;
  };
  /**
   * UX-06: every suggestion states assumptions. Risk class, inferred harmonic center, motif-similarity score — all surface here.
   */
  assumptions?: {
    claim: string;
    confidence: number;
    source: "selection" | "intent" | "config" | "default";
  }[];
}
