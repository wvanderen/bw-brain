// daemon/src/profiles/profile-loader.ts
//
// ARCH-01/02 genre-profile loader (D-13/D-14). Resolves the active profile
// from an OPTIONAL name. INV-13: with NO name (or "generic"), returns the
// generic.json literal — the strict neutral default. ARCH-02 ("generic core
// runs without a profile") is LITERALLY true: generic.json has NO extends and
// NO techno flavor; an unknown name THROWS (T-3-14 tampering defense), it
// never silently defaults to techno.
//
// Mirrors intent-store.ts (the boot-time config-loader analog): one JSON
// import per profile (via the `with { type: "json" }` assertion pattern),
// NO inference, structured throw on unknown input.
//
// D-13 hook contract: a profile MAY ship a small set of OPTIONAL override
// hooks (motifSalience / constrainTransform / defaultThreshold). electronic/
// techno v1 ships JSON-ONLY — the loader detects a `hooks.js` sibling
// (absent for v1) and skips hook invocation when missing. The ProfileHooks
// interface is designed-not-exercised in v1.
//
// P4 / 04-02 Task 3 — additive extension (D-05/D-07/D-08): mergeProfiles now
// deep-merges energyWeights (object-spread, child wins per-key) + array-replaces
// sectionLabels and roleTemplates (child's arrays are complete, NOT appended to
// parent). The loader emits a warning (NOT a throw — ARCH-02 "enhance never
// gate") when energyWeights deviates > 0.01 from sum=1.0.

import genericProfile from "./generic.json" with { type: "json" };
import technoProfile from "./techno.json" with { type: "json" };
import type { Profile } from "../gen/profile.js";

// Re-export the gen Profile type so callers import it from the loader (single
// public surface for profile data + the loader).
export type { Profile };

/**
 * The set of profiles shipped inside the daemon package (D-14).
 *
 * Raw JSON profiles may be PARTIAL: a profile that `extends` a parent omits
 * inherited fields (techno omits voiceLeadingFix/humanize — inherited from
 * generic). The loader deep-merges over the parent, so a RESOLVED profile is
 * always complete. `generic` is authored complete; `techno` is partial and
 * only ever returned after merging over generic. The cast-through-unknown on
 * techno documents this (the data invariant — generic complete, techno
 * extends generic — guarantees the merged result satisfies `Profile`).
 */
const PROFILES: Record<string, Profile> = {
  generic: genericProfile as Profile,
  techno: technoProfile as unknown as Profile,
};

/**
 * Thrown when loadProfile() receives an unrecognized profile name. Carries
 * the bad name so a caller can surface it (mirrors intent-store.ts:69
 * structured-throw-with-context). T-3-14 mitigation: an unknown name NEVER
 * silently falls back to techno or generic.
 */
export class UnknownProfileError extends Error {
  constructor(readonly named: string) {
    super(`unknown profile: "${named}" (known: ${Object.keys(PROFILES).join(", ")})`);
    this.name = "UnknownProfileError";
  }
}

/**
 * D-13 optional override hooks. A profile MAY provide any subset; absent
 * hooks fall back to the data default. electronic/techno v1 ships NO hooks
 * (JSON-only) — the interface is designed to be additive when a real
 * genre-specific constraint emerges that data cannot express.
 *
 * Designed, NOT exercised in v1. Defined here so the loader + transforms can
 * type-check against it; no hooks module exists for v1.
 */
export interface ProfileHooks {
  /** Override motif salience by track role. Default: roleSalience[role]. */
  motifSalience?(role: string): number;
  /**
   * Constrain or reject a candidate the data rules allowed.
   * Default: pass-through (return the candidate unchanged).
   */
  constrainTransform?<TCandidate, TCtx>(candidate: TCandidate, ctx: TCtx): TCandidate | null;
  /** Override the default threshold for a transform type. Default: thresholds[type]. */
  defaultThreshold?(transformType: string): number;
}

/**
 * Load a genre profile by name. Pure (no fs at call time — profiles are
 * imported at module load).
 *
 * @param named - the profile name from intent.profile. Omit (or "generic")
 *   for the strict neutral default (INV-13).
 * @returns the resolved profile. For a profile that `extends` a parent, the
 *   child is deep-merged over the parent (child wins per-key on object
 *   fields; child replaces arrays/scalars).
 * @throws {UnknownProfileError} if `named` is not a known profile.
 *
 * D-14: generic is the default. No name → generic core runs literally.
 *
 * @example
 * const p = loadProfile();                 // generic (vary: 0.85)
 * const t = loadProfile("techno");         // merged (vary: 0.88)
 * loadProfile("nope");                     // throws UnknownProfileError
 */
export function loadProfile(named?: string): Profile {
  // D-14 / INV-13: generic is the strict default. No name -> generic literally.
  if (!named || named === "generic") {
    warnIfEnergyWeightsOffSum(PROFILES.generic);
    return PROFILES.generic;
  }
  const p = PROFILES[named];
  if (!p) throw new UnknownProfileError(named);
  // If the profile extends a parent, deep-merge child over parent.
  const resolved = p.extends ? mergeProfiles(loadProfile(p.extends), p) : p;
  // D-05 invariant: energyWeights should sum to 1.0 (advisory — ARCH-02 never
  // gates on profile data; the daemon emits a warning and proceeds).
  warnIfEnergyWeightsOffSum(resolved);
  return resolved;
}

/**
 * Emit a `console.warn` when `profile.energyWeights` (if present) deviates from
 * sum=1.0 by more than 0.01. ARCH-02 ("enhance never gate") — the loader NEVER
 * throws on profile-data drift; analyzers gate on field-presence and use
 * whatever weights are configured. The warning surfaces the drift so a profile
 * author notices during development.
 *
 * Pure (no throw); reads only.
 */
function warnIfEnergyWeightsOffSum(profile: Profile): void {
  const w = profile.energyWeights;
  if (!w) return; // ARCH-02: field absent is valid (generic core runs literally)
  const sum = w.noteDensity + w.velocityAggregate + w.polyphony + w.pitchCentroid;
  if (Math.abs(sum - 1.0) > 0.01) {
    // Use console.warn — the daemon has no logger import here (the loader is
    // intentionally fs-free at call time). The warning is advisory; analyzers
    // consume the weights as-authored.
    console.warn(
      `[bw-brain] profile "${profile.name}" energyWeights sums to ${sum.toFixed(4)} (expected 1.0 ± 0.01). ` +
        `Analyzers will use the weights as-authored (ARCH-02: enhance, never gate).`,
    );
  }
}

/**
 * Deep-merge a child profile over a parent. Object-valued fields (thresholds,
 * roleSalience, velocityHumanize, timingHumanize) merge per-key with the
 * child winning; arrays + scalars (preferredScales, strongBeatGrid, name) are
 * replaced wholesale by the child when present, else inherited from parent.
 *
 * The `extends` metadata field is preserved on the merged result so callers
 * can audit the lineage (it is harmless to downstream transforms, which read
 * thresholds/curves/scales, never `extends`).
 *
 * Pure.
 */
function mergeProfiles(parent: Profile, child: Profile): Profile {
  // Object-valued fields merge per-key (child wins); arrays/scalars replaced
  // wholesale by the child when present, else inherited from the parent. The
  // spreads over optional fields (velocityHumanize/timingHumanize/roleSalience)
  // produce a structurally-complete object at runtime whenever parent OR child
  // supplies the field; the `as Profile` cast documents that the data invariant
  // (generic authored complete, techno extends generic) guarantees the result
  // satisfies `Profile`. Pure.
  //
  // P4 / 04-02 Task 3 (D-05/D-07/D-08):
  //   - energyWeights: object-spread (techno overrides per-key — e.g. just
  //     noteDensity; the other three inherit from generic).
  //   - sectionLabels + roleTemplates: array-replace (child's array is the
  //     COMPLETE set, not appended to parent). This matches the existing
  //     preferredScales + strongBeatGrid discipline.
  const merged = {
    ...parent,
    ...child,
    thresholds: { ...parent.thresholds, ...child.thresholds },
    velocityHumanize: { ...parent.velocityHumanize, ...child.velocityHumanize },
    timingHumanize: { ...parent.timingHumanize, ...child.timingHumanize },
    roleSalience: { ...parent.roleSalience, ...child.roleSalience },
    energyWeights: { ...parent.energyWeights, ...child.energyWeights },
    // Arrays replace (not concatenate): preferredScales + strongBeatGrid +
    // sectionLabels + roleTemplates.
    preferredScales: child.preferredScales ?? parent.preferredScales,
    strongBeatGrid: child.strongBeatGrid ?? parent.strongBeatGrid,
    sectionLabels: child.sectionLabels ?? parent.sectionLabels,
    roleTemplates: child.roleTemplates ?? parent.roleTemplates,
  };
  return merged as Profile;
}
