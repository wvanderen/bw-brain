/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * STATE-03 projectIntent contract. The user-authored intent state that keeps the assistant from ruining the song. Source: docs/seed.md §C 'Intent state' + CONTEXT.md D-09.
 */
export interface ProjectIntent {
  /**
   * Schema contract version (major.minor).
   */
  version: string;
  /**
   * The user's authored intent for this project. summary is the only required field — a one-line statement of what the project is / should be.
   */
  projectIntent: {
    /**
     * MANDATORY non-empty one-line summary, e.g. 'techno track, dark, 130 BPM'. Cannot be blank.
     */
    summary: string;
    /**
     * Hard constraints the assistant must not violate, e.g. 'preserve bass motif'.
     */
    constraints?: string[];
    /**
     * Goals the assistant should aim for, e.g. 'build tension toward the drop'.
     */
    targets?: string[];
  };
}
