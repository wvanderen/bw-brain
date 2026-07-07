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
   * The 5 live M1 ops + diff (promoted per D-05) + Phase 3 extensions (EDIT-02/04/05, MIDI-02..05): edit.preview/apply/revert + midi.vary/counterline/voice_leading_fix/humanize + Phase 4 arrange.* (ARRANGE-01..05, UX-03): arrange.sections/repetition_report/energy_curve/review/current_section/refresh. Stubs (bw-automation) do NOT get ops here — they emit not_implemented results without ever querying the daemon.
   */
  op:
    | "focus.export"
    | "project.summary"
    | "project.region"
    | "midi.inspect"
    | "device.inspect"
    | "diff"
    | "edit.preview"
    | "edit.apply"
    | "edit.revert"
    | "midi.vary"
    | "midi.counterline"
    | "midi.voice_leading_fix"
    | "midi.humanize"
    | "arrange.sections"
    | "arrange.repetition_report"
    | "arrange.energy_curve"
    | "arrange.review"
    | "arrange.current_section"
    | "arrange.refresh";
  /**
   * Op-specific arguments. Open at the schema level; op-specific shapes (e.g. project.region {start,end}) are enforced by the daemon handler. Tightened per-op in Phase 3 if patterns stabilize.
   */
  payload?: {
    [k: string]: unknown;
  };
}
