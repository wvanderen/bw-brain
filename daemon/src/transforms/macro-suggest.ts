// daemon/src/transforms/macro-suggest.ts
//
// Phase 5 / 05-07 Task 1 — AUTO-02 macro/XY suggestion generator
// (D-05-09 advisory only + D-05-11 evidence/alternatives + D-05-12 XY v1).
//
// Consumes the 05-04 salience-ranked observations (RankedSalienceParam /
// SalienceParamEntry — structurally identical) and emits RANKED, ADVISORY
// suggestions for which controls deserve macro-knob / XY-pad exposure: the
// params the producer ACTUALLY performs, evidenced by observed movement.
//
// D-05-09 INVARIANT (the transition-suggest.ts:11-18 discipline copied
// verbatim in spirit): this module is PURELY ADVISORY. It carries NO
// patchId, NO operations[], NO risk field. Macro wiring is a producer
// hand-action in Bitwig — a suggestion is text evidence, never a mutation.
// The module never imports from the patch pipeline (the sibling patch
// directory is off-limits here; the test asserts the import surface + the
// serialized key surface structurally — T-05-19 tampering mitigation).
//
// D-05-11: every suggestion carries an evidence line (param identity +
// device + movement count + role/energy context), a non-empty assumptions[]
// (UX-06), and AT LEAST ONE alternative candidate — never a single
// unexplained best target (SC#2 disambiguation duty).
//
// D-05-12 (XY v1, RESEARCH §Open Questions 5 recommendation): two params
// pair onto X/Y only when BOTH individually rank in the top 16 AND their
// names do not collide. Pairs need a third non-selected candidate to exist
// (otherwise no alternative could be named — the ≥1-alternative invariant
// takes precedence over pairing).
//
// D-05-03 (inherited from the salience ranking): remote_page (macro) sources
// rank ahead of equally-salient device params — explicit intent beats
// inference.
//
// ARCH-02 (enhance-never-gate): ctx.profile.automationShapes.shapeBias
// reorders suggestions ONLY when present AND non-uniform ("uniform weights
// = no bias" — gen/profile.ts JSDoc); absent or uniform shapes leave the
// salience rank byte-identical.
//
// PURE module: no fs/net, no side effects, no clock reads. Deterministic
// (explicit tie-breaks everywhere). The pulledAt honesty suffix
// (transition-suggest :73-76/:113 pattern) renders from ctx.pulledAt; the
// daemon op passes the snapshot's pulledAt.

import type { Assumption } from "../state/analyzer-registry.js";
import type { Profile } from "../gen/profile.js";

/** Default cap on emitted suggestions (bounded-drawer discretion). */
export const DEFAULT_TOP_N = 8;

/** XY v1 rule: both members must individually rank in the top 16 (D-05-12). */
export const XY_TOP_POOL = 16;

/** Default cap on XY pairs (bounded-drawer discretion — v1 stays modest). */
export const DEFAULT_MAX_XY_PAIRS = 2;

/** The fixed six-shape automation vocabulary (D-05-13). */
type ShapeName = "ramp_up" | "ramp_down" | "dip_recover" | "rise_fall" | "slow_cycle" | "hold_then_move";

/**
 * One salience-ranked parameter observation — structurally satisfied by
 * automation-salience.ts `RankedSalienceParam` and salience-snapshot.ts
 * `SalienceParamEntry` (both feed this transform unchanged). Optional
 * context strings (sectionsContext / roleEnergyContext) are attached by the
 * caller when prior context is available; absent context degrades to honest
 * default disclosure in the evidence line (never fabricated).
 */
export interface SalienceEntry {
  /** `${source}:${paramIndex}` — stable per-device param identity. */
  paramKey: string;
  /** Device identity key (the 05-03 dev_+16-hex fingerprint — same as deviceSid). */
  deviceKey: string;
  /** Parameter index within the device window. */
  paramIndex: number;
  /** Optional human-readable parameter name. */
  paramName?: string;
  /** Movement origin — remote_page knobs are the user-exposed macro surface. */
  source: "device_parameter" | "remote_page";
  /** Movements observed (delta > 1e-4). */
  movementCount: number;
  /** Observed value range (max − min), normalized [0,1]. */
  valueRange?: number;
  /** Latest observed normalized value. */
  lastValue?: number;
  /** Salience ∈ [0,1] (05-04 formula — already clamped, 3-decimal). */
  salience: number;
  /** Optional context: which sections the movement clustered in (caller-attached). */
  sectionsContext?: string;
  /** Optional context: role/energy prior context (caller-attached). */
  roleEnergyContext?: string;
}

/** A param identity carried on a suggestion (1 for macro, 2 for xy_pair). */
export interface MacroParamRef {
  paramKey: string;
  paramName?: string;
  deviceKey: string;
  source: "device_parameter" | "remote_page";
  movementCount: number;
  salience: number;
}

/** The D-05-11 evidence line — one per param on a suggestion. */
export interface MacroSuggestionEvidence {
  /** Human-first identity (paramName when known, else paramKey). */
  identity: string;
  /** The device the param lives on (deviceKey). */
  device: string;
  /** Observed movement count behind the ranking. */
  movementCount: number;
  /** Optional sections context (present only when the caller attached it). */
  sectionsContext?: string;
  /** Role/energy context — always a non-empty honest string. */
  roleEnergyContext: string;
}

/** A next-ranked candidate that could have taken the slot (SC#2 duty). */
export interface AlternativeCandidate {
  identity: string;
  device: string;
  salience: number;
}

/**
 * A D-05-09 advisory suggestion. NO patch fields (patchId/operations/risk
 * are FORBIDDEN — the test asserts their absence structurally).
 */
export interface MacroSuggestion {
  kind: "macro" | "xy_pair";
  /** 1 param (macro) or 2 params (xy_pair — X is the stronger member). */
  params: MacroParamRef[];
  /** One evidence line per param, same order as params. */
  evidence: MacroSuggestionEvidence[];
  /** UX-06 — never empty. */
  assumptions: Assumption[];
  /** ≥ 1 next-ranked non-selected candidate (D-05-11 — never alone). */
  alternatives: AlternativeCandidate[];
  /** Short producer-actionable hint (never a patch operation). */
  manualHint: string;
}

/** Options for {@link macroSuggest}. All optional (sensible defaults). */
export interface MacroSuggestContext {
  /** ARCH-01 profile — automationShapes.shapeBias biases ordering only when present + non-uniform. */
  profile?: Profile;
  /** Cap on emitted suggestions (default 8). */
  topN?: number;
  /** ISO timestamp of the snapshot these observations came from (honesty suffix). */
  pulledAt?: string;
  /** Cap on XY pairs (default 2 — bounded-drawer discretion). */
  maxXyPairs?: number;
}

/**
 * The advisory result: a ranked suggestions list + a top-level manualHint
 * that stays honest on the EMPTY path (thin evidence names the hand-action,
 * never a synthesized filler ranking — Task 1 Test 9).
 */
export interface MacroSuggestResult {
  suggestions: MacroSuggestion[];
  manualHint: string;
}

/** Clamp into [0,1] (defensive — hand-edited snapshot entries). */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Runtime guard for salience-entry-shaped values (the isParamObservation discipline). */
function isSalienceEntry(v: unknown): v is SalienceEntry {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.paramKey === "string" &&
    typeof o.deviceKey === "string" &&
    typeof o.paramIndex === "number" &&
    (o.source === "device_parameter" || o.source === "remote_page") &&
    typeof o.movementCount === "number" &&
    typeof o.salience === "number"
  );
}

/** Human-first identity: the name when known, else the stable key. */
function identityOf(e: SalienceEntry): string {
  return e.paramName !== undefined && e.paramName.length > 0 ? e.paramName : e.paramKey;
}

/** D-05-03-aware ordering: salience desc, remote_page first on ties, key asc for determinism. */
function compareBySalience(a: SalienceEntry, b: SalienceEntry): number {
  if (b.salience !== a.salience) return b.salience - a.salience;
  const aMacro = a.source === "remote_page" ? 1 : 0;
  const bMacro = b.source === "remote_page" ? 1 : 0;
  if (aMacro !== bMacro) return bMacro - aMacro; // macro (remote_page) first
  return a.paramKey < b.paramKey ? -1 : a.paramKey > b.paramKey ? 1 : 0;
}

/**
 * The dominant D-05-13 shape for one observation — a heuristic read of the
 * bounded aggregates the fold stores (range + last value; min/max are NOT
 * carried into ranked entries). ADVISORY ORDERING BIAS ONLY (A8 tunable);
 * disclosed via a "config"-source assumption when applied.
 */
function dominantShape(e: SalienceEntry): ShapeName {
  const range = clamp01(e.valueRange ?? 0);
  const last = clamp01(e.lastValue ?? 0.5);
  if (range < 0.1) return "hold_then_move"; // barely moved — held then nudged
  if (last >= 0.75) return "ramp_up"; // ended high — riser behavior
  if (last <= 0.25) return "ramp_down"; // ended low — fall behavior
  if (range >= 0.5) return "slow_cycle"; // wide sweep ending mid — cyclical
  return last >= 0.5 ? "dip_recover" : "rise_fall";
}

/**
 * ARCH-02 shape-bias factor ∈ [0.8, 1.2] from the profile's relative
 * preference for the param's dominant shape. Returns EXACTLY 1 for every
 * param when the weights are uniform ("uniform weights = no bias") or
 * absent — the generic core runs literally.
 */
function shapeBiasFactor(e: SalienceEntry, weights: Record<ShapeName, number>): number {
  const values = Object.values(weights);
  const maxW = Math.max(...values);
  const minW = Math.min(...values);
  if (!(maxW > minW)) return 1; // uniform (or degenerate) — literally no bias
  const w = clamp01(weights[dominantShape(e)] / Math.max(maxW, 1e-9));
  return 0.8 + 0.4 * ((w - minW) / Math.max(maxW - minW, 1e-9));
}

/** Name-collision check for XY pairing (D-05-12): same key or same non-empty name. */
function nameCollides(a: SalienceEntry, b: SalienceEntry): boolean {
  if (a.paramKey === b.paramKey) return true;
  return a.paramName !== undefined && a.paramName.length > 0 && a.paramName === b.paramName;
}

/** Build the param ref carried on a suggestion. */
function refOf(e: SalienceEntry): MacroParamRef {
  return {
    paramKey: e.paramKey,
    ...(e.paramName !== undefined ? { paramName: e.paramName } : {}),
    deviceKey: e.deviceKey,
    source: e.source,
    movementCount: Math.max(0, Math.round(e.movementCount)),
    salience: e.salience,
  };
}

/** Build the D-05-11 evidence line for one param (honest defaults for absent context). */
function evidenceOf(e: SalienceEntry): MacroSuggestionEvidence {
  return {
    identity: identityOf(e),
    device: e.deviceKey,
    movementCount: Math.max(0, Math.round(e.movementCount)),
    ...(e.sectionsContext !== undefined && e.sectionsContext.length > 0
      ? { sectionsContext: e.sectionsContext }
      : {}),
    roleEnergyContext:
      e.roleEnergyContext ?? "role/energy priors not attached — defaulted 0.5 each (D-05-01 fallback)",
  };
}

/**
 * Generate ranked advisory macro/XY suggestions from salience-ranked
 * observations. Pure + deterministic.
 *
 * Ranking: salience desc with D-05-03 macro-first tie-breaks; when a
 * non-uniform automationShapes bias is present it scales the ORDERING score
 * only (never the reported salience — the evidence stays honest).
 *
 * Emission: greedy XY pairing over the top-16 pool (both members top-16,
 * no name collision, capped at maxXyPairs), then macro suggestions for the
 * remaining ranked params; combined list sorted by strongest-member score,
 * capped at topN. Every suggestion carries ≥ 1 alternative (the next-ranked
 * non-selected candidates) — guaranteed because the thin-evidence path
 * (fewer than 2 usable observations, or a pair that would consume the whole
 * list) refuses honestly instead.
 *
 * @example
 * macroSuggest(rankParamSalience(fold)); // -> { suggestions: [...], manualHint: "..." }
 */
export function macroSuggest(
  observations: SalienceEntry[],
  ctx: MacroSuggestContext = {},
): MacroSuggestResult {
  const topN = Math.max(1, Math.round(ctx.topN ?? DEFAULT_TOP_N));
  const maxXy = Math.max(0, Math.round(ctx.maxXyPairs ?? DEFAULT_MAX_XY_PAIRS));
  const pulledAtSuffix = ctx.pulledAt ? ` (snapshot pulled ${ctx.pulledAt})` : "";

  const ranked = observations.filter(isSalienceEntry).sort(compareBySalience);
  if (ranked.length < 2) {
    return {
      suggestions: [],
      manualHint:
        `not enough observed parameter movement to rank macro candidates (need at least 2 distinct params) — ` +
        `move controls in Bitwig and re-run; the producer wires macros by hand (D-05-09)`,
    };
  }

  // --- Ordering score: salience, shape-biased only when shapes are present
  // AND non-uniform ("uniform weights = no bias" — gen/profile.ts JSDoc; a
  // uniform block is the generic core running literally, so the honest
  // assumption set is the no-bias one, byte-identical to the profile-less run).
  const shapes = ctx.profile?.automationShapes;
  const shapeWeights = shapes !== undefined ? (shapes.shapeBias as unknown as Record<ShapeName, number>) : undefined;
  const shapeValues = shapeWeights !== undefined ? Object.values(shapeWeights) : [];
  const biased = shapeWeights !== undefined && Math.max(...shapeValues) > Math.min(...shapeValues);
  const orderScore = new Map<string, number>();
  if (biased && shapeWeights !== undefined) {
    for (const e of ranked) orderScore.set(e.paramKey, e.salience * shapeBiasFactor(e, shapeWeights));
  } else {
    for (const e of ranked) orderScore.set(e.paramKey, e.salience);
  }
  // Bias-aware ordering with the SAME tie-breaks as the salience rank.
  const ordered = [...ranked].sort((a, b) => {
    const sa = orderScore.get(a.paramKey)!;
    const sb = orderScore.get(b.paramKey)!;
    if (sb !== sa) return sb - sa;
    return compareBySalience(a, b);
  });

  // --- XY pairing (D-05-12): both members from the top-16 pool, no name
  // collision, and only when a third candidate remains to name as the
  // alternative (the ≥1-alternative invariant outranks pairing).
  const usedInPair = new Set<string>();
  const pairs: Array<{ x: SalienceEntry; y: SalienceEntry; score: number; second: number }> = [];
  if (ranked.length >= 3 && maxXy > 0) {
    const pool = ordered.slice(0, XY_TOP_POOL);
    while (pairs.length < maxXy && pool.length >= 2) {
      const x = pool.shift()!;
      const yi = pool.findIndex((y) => !nameCollides(x, y));
      if (yi === -1) continue; // x pairs with nothing remaining — macro only
      const y = pool.splice(yi, 1)[0]!;
      usedInPair.add(x.paramKey);
      usedInPair.add(y.paramKey);
      pairs.push({
        x,
        y,
        score: Math.max(orderScore.get(x.paramKey)!, orderScore.get(y.paramKey)!),
        second: Math.min(orderScore.get(x.paramKey)!, orderScore.get(y.paramKey)!),
      });
    }
  }

  // --- Build the candidate suggestions (score = strongest member).
  interface Candidate {
    kind: "macro" | "xy_pair";
    members: SalienceEntry[];
    score: number;
    second: number;
  }
  const candidates: Candidate[] = pairs.map((p) => ({
    kind: "xy_pair" as const,
    members: orderScore.get(p.x.paramKey)! >= orderScore.get(p.y.paramKey)! ? [p.x, p.y] : [p.y, p.x],
    score: p.score,
    second: p.second,
  }));
  for (const e of ordered) {
    if (usedInPair.has(e.paramKey)) continue;
    candidates.push({
      kind: "macro",
      members: [e],
      score: orderScore.get(e.paramKey)!,
      second: orderScore.get(e.paramKey)!,
    });
  }

  // --- Ranked combined order (score desc, macro before pair on exact ties,
  // then first-member key asc — deterministic), capped at topN.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.second !== a.second) return b.second - a.second;
    if (a.kind !== b.kind) return a.kind === "macro" ? -1 : 1;
    const ak = a.members[0]!.paramKey;
    const bk = b.members[0]!.paramKey;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
  const selected = candidates.slice(0, topN);

  // --- Render suggestions with evidence, assumptions, alternatives, hints.
  const suggestions: MacroSuggestion[] = selected.map((c) => {
    const params = c.members.map(refOf);
    const evidence = c.members.map(evidenceOf);
    const memberKeys = new Set(c.members.map((m) => m.paramKey));
    // ≥ 1 next-ranked non-selected candidate (SC#2) — guaranteed non-empty:
    // the thin-evidence path refused, and pairing never consumes the list.
    const alternatives = ordered
      .filter((e) => !memberKeys.has(e.paramKey))
      .slice(0, 2)
      .map((e) => ({ identity: identityOf(e), device: e.deviceKey, salience: e.salience }));

    const assumptions: Assumption[] = [
      {
        claim:
          `ranked from observed movement only: ${c.members
            .map((m) => `${identityOf(m)} moved ${Math.max(0, Math.round(m.movementCount))} times (salience ${m.salience})`)
            .join(" + ")}${pulledAtSuffix}`,
        confidence: 1.0,
        source: "selection",
      },
      {
        claim:
          "macro (remote-page) sources outrank device parameters at equal evidence — explicit intent beats inference (D-05-03)",
        confidence: 1.0,
        source: "default",
      },
    ];
    if (c.kind === "xy_pair") {
      assumptions.push({
        claim: `XY v1 rule satisfied: both params individually rank in the top ${XY_TOP_POOL} with distinct names (D-05-12)`,
        confidence: 1.0,
        source: "default",
      });
    }
    assumptions.push(
      biased
        ? {
            claim: `ordering biased by profile "${ctx.profile?.name ?? "unknown"}" automationShapes.shapeBias — ordering only, never the reported salience (ARCH-02 enhance-never-gate)`,
            confidence: 1.0,
            source: "config",
          }
        : {
            claim: "no automationShapes bias applied — ordering is the salience rank (ARCH-02 generic core runs literally)",
            confidence: 1.0,
            source: "default",
          },
    );
    assumptions.push({
      claim: "advisory only — no patch is emitted; the producer wires macros by hand in Bitwig (D-05-09)",
      confidence: 1.0,
      source: "default",
    });

    const manualHint =
      c.kind === "xy_pair"
        ? `map "${identityOf(c.members[0]!)}" to X and "${identityOf(c.members[1]!)}" to Y on an XY control by hand in Bitwig — advisory only${pulledAtSuffix}`
        : `wire "${identityOf(c.members[0]!)}" to a macro knob by hand in Bitwig — advisory only${pulledAtSuffix}`;

    return { kind: c.kind, params, evidence, assumptions, alternatives, manualHint };
  });

  return {
    suggestions,
    manualHint:
      `top ${suggestions.length} macro/XY candidates ranked from observed expressiveness — ` +
      `the producer wires macros by hand in Bitwig; advisory only, no patches are emitted (D-05-09)`,
  };
}
