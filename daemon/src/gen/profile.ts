/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * ARCH-01 genre-profile contract. A declarative JSON config of constants + a small fixed set of OPTIONAL override hooks (designed, exercised only when a real genre-specific constraint emerges — D-13). Used by the daemon profile loader (Plan 03). Source: CONTEXT.md D-13/D-14 + RESEARCH.md §Code Examples 'profile JSON shape'.
 */
export interface Profile {
  /**
   * Profile identifier. 'generic' is the strict neutral default (D-14); 'techno' is the first opt-in profile.
   */
  name: string;
  /**
   * Optional parent profile name. The loader deep-merges over the parent (thresholds/curves/scales/roleSalience). 'techno' extends 'generic'.
   */
  extends?: string;
  /**
   * Motif-similarity thresholds per transform type. Creative transforms (vary/counterline) refuse below threshold (D-08); cleanup transforms (voiceLeadingFix/humanize) skip the motif gate (D-10 → 0.0).
   */
  thresholds: {
    vary: number;
    counterline: number;
    voiceLeadingFix: number;
    humanize: number;
  };
  /**
   * MIDI-05 velocity humanize parameters. jitter = ±N velocity (gaussian); curve shapes the distribution.
   */
  velocityHumanize?: {
    jitter: number;
    curve: "gaussian" | "uniform";
  };
  /**
   * MIDI-05 timing humanize parameters. jitterBeats = ±N beats (gaussian).
   */
  timingHumanize?: {
    jitterBeats: number;
  };
  /**
   * Track role → motif-salience weight. 'kick', 'bass', 'lead', 'pad', 'hats', 'percussion', 'fx' are the conventional keys; the open map allows profile-specific extensions.
   */
  roleSalience?: {
    [k: string]: number;
  };
  /**
   * Scale/mode names preferred for the inferred-harmony fallback (D-12). tonal Scale.get() consumes these. Generic prefers [minor, dorian, phrygian]; techno prefers [minor, phrygian, locrian].
   */
  preferredScales?: string[];
  /**
   * Beat positions within a 4/4 bar that count as 'strong' (counterline target, vary anchor). Generic: [0,1,2,3] (every beat); techno: [0,2] (4-on-the-floor).
   */
  strongBeatGrid?: number[];
}
