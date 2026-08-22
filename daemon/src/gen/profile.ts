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
  /**
   * D-05 energy-curve composite weights. The four weights MUST sum to 1.0 (validated at load by the daemon — Ajv 2020-12 has no native sum constraint, so the loader emits a warning when the sum deviates > 0.01 from 1.0; ARCH-02 'enhance never gate' — the loader logs but never throws).
   */
  energyWeights?: {
    noteDensity: number;
    velocityAggregate: number;
    polyphony: number;
    pitchCentroid: number;
  };
  /**
   * Phase 5 (D-05-13): bias for the fixed six-shape automation vocabulary (ramp_up, ramp_down, dip_recover, rise_fall, slow_cycle, hold_then_move). Bias values are relative weights (>= 0, no normalization constraint); depthRange constrains curve depth in [0,1]; rateRange constrains rate in cycles/bar (>= 0; min <= max is a consumer-side check — Ajv 2020-12 has no native cross-item ordering, mirroring the energyWeights sum precedent).
   */
  automationShapes?: {
    /**
     * Relative preference weight per shape name (the fixed D-05-13 shape set). Uniform weights = no bias.
     */
    shapeBias: {
      ramp_up: number;
      ramp_down: number;
      dip_recover: number;
      rise_fall: number;
      slow_cycle: number;
      hold_then_move: number;
    };
    /**
     * Curve depth bounds [min, max] in [0,1] (normalized automation depth).
     *
     * @minItems 2
     * @maxItems 2
     */
    depthRange: [number, number];
    /**
     * Curve rate bounds [min, max] in cycles/bar (e.g. 0.125 = one cycle per 8 bars).
     *
     * @minItems 2
     * @maxItems 2
     */
    rateRange: [number, number];
  };
  /**
   * D-07 vocabulary for section labeling. Generic ships [intro, build, peak, breakdown, outro]; techno REPLACES with [drop, break, roll]. Position+energy heuristics map a detected cluster to a label.
   */
  sectionLabels?: {
    label: string;
    position: "start" | "middle" | "end" | "any";
    /**
     * @minItems 2
     * @maxItems 2
     */
    energyRange: [number, number];
  }[];
  /**
   * D-08 track-role templates. Generic ships 7 (kick/bass/lead/pad/hats/percussion/fx); techno REPLACES with 2 (tighter kick/bass register windows — array-replace, not append).
   */
  roleTemplates?: {
    role: string;
    registerLow: number;
    registerHigh: number;
    /**
     * @minItems 5
     * @maxItems 5
     */
    rhythmProfile: [number, number, number, number, number];
    velocityProfile: {
      mean: number;
      variance: number;
    };
    minConfidence?: number;
  }[];
}
