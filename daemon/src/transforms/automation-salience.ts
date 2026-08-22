// daemon/src/transforms/automation-salience.ts
//
// Phase 5 / 05-04 Task 1 — AUTO-01 automation-salience analyzer
// (D-05-01 observed-movement evidence + D-05-03 macro-first ranking).
//
// Salience is computed from OBSERVED live parameter movement (the 05-01
// bounded per-param fold: state.parameters, fed by the 05-03 bridge
// parameter.changed observers) boosted by roles.json + energy-curve priors.
// NEVER from reading automation envelopes (D-05-01 — no envelope-read API is
// touched anywhere in this module; verified by the structural purity test).
//
// Formula (RESEARCH.md §Code Examples "Salience statistics sketch" as the
// first draft — constants are TUNABLE DISCRETION, A8):
//
//   L = log1p(movementCount) / log1p(512)   — count normalized against the
//                                             05-01 fold cap (512), so L ∈ [0,1]
//   R = valueRange (max - min, clamped [0,1])
//   V = min(1, varianceProxy * 4)
//   base(remote_page)            = 0.6 + 0.4·L      — user-exposed macro/page
//                                                      knobs first (D-05-03)
//   base(device_parameter)       = 0.4·L + 0.35·R + 0.25·V
//   multiplier = 1 + 0.2·roleSalience + 0.2·energyAtMovement (absent priors
//   default 0.5 each)
//   score = Number(min(1, base·multiplier).toFixed(3))
//
// DEVIATION FROM THE LITERAL SKETCH CONSTANTS (documented, structure kept):
// the sketch's raw `1.0 + 0.5·log1p(count)` / `0.4·log1p(count) + …` bases
// both exceed 1.0 at movementCount ≈ 20 (log1p(20) ≈ 3.04), so after the
// mandatory [0,1] clamp a macro knob and a device param TIE at 1.0 — the
// plan's own pinned Test 1 (macro strictly outscores device at count 20)
// cannot hold. Normalizing the log term against the fold cap (512) keeps
// every base ∈ [0,1] BEFORE the prior multiplier, so the macro-first
// ordering survives at every evidence level (A8 tunable: the 0.6 macro
// floor + weight splits are the knobs, no architecture change).
//
// varianceProxy: the fold stores ONLY min/max/last (8 bounded scalars —
// T-05-03), so a true rolling variance is unavailable. Honest proxy from
// what IS stored: a param that ENDS near the midpoint of its observed range
// plausibly swept back and forth (varied); one that ends AT an extreme may
// have moved once directionally. proxy = 1 − |last − mid| / (range/2)
// (∈ [0,1]; 0 when range is 0 — no variance information).
//
// PURE module (the energy-curve/vary discipline): no fs/net, no ../patch/*
// imports, no side effects. Persistence + prior-file loading live in the
// daemon dispatch (query-server refreshSalienceSnapshot, Task 3).

import type {
  Analyzer,
  AnalyzeContext,
  DerivedField,
  RawState,
} from "../state/analyzer-registry.js";

/**
 * The 05-01 folded per-parameter movement aggregate (state.parameters entry —
 * structural twin of fold-event.ts's nextEntry; 8 bounded scalar fields, NEVER
 * an event log, T-05-03).
 */
export interface ParamObservation {
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
  /** Latest observed normalized value. */
  lastValue: number;
  /** Minimum observed value. */
  minValue: number;
  /** Maximum observed value. */
  maxValue: number;
  /** Epoch ms of the last counted movement. */
  lastMovedAt: number;
}

/**
 * Prior context for one observation (D-05-01): roles.json track-role salience
 * + the energy-curve level around movement. Both OPTIONAL — absent priors
 * default 0.5 inside the formula (honest fallback, disclosed via assumptions[]).
 */
export interface SaliencePriors {
  roleSalience?: number;
  energyAtMovement?: number;
}

/** A ranked per-parameter result — the snapshot/CLI param entry shape. */
export interface RankedSalienceParam {
  /** `${source}:${paramIndex}` — stable per-device param identity. */
  paramKey: string;
  deviceKey: string;
  paramIndex: number;
  paramName?: string;
  source: "device_parameter" | "remote_page";
  movementCount: number;
  valueRange: number;
  lastValue: number;
  /** Salience ∈ [0,1] (clamped, 3-decimal). */
  salience: number;
}

/** Default prior value when a prior is absent (0.5 — neutral, D-05-01). */
export const DEFAULT_PRIOR = 0.5;

/**
 * The fold-cap reference for count normalization (05-01 PARAM_AGGREGATE_CAP).
 * log1p(512) ≈ 6.244.
 */
export const COUNT_REFERENCE = 512;

/** Clamp into [0,1] (defensive — bridge values are normalized [0,1]). */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Compute one parameter's salience ∈ [0,1]. Pure.
 *
 * Macro-first (D-05-03): a `remote_page` observation carries a 0.6 base floor
 * the best `device_parameter` evidence cannot match at equal counts — explicit
 * intent beats inference. Priors boost BOTH branches by the same multiplier,
 * so they can never flip the macro-vs-device rank order.
 *
 * @example
 * automationSalience({ deviceKey: "dev_x", paramIndex: 0, source: "remote_page",
 *   movementCount: 20, lastValue: 0.5, minValue: 0.2, maxValue: 0.8, lastMovedAt: 0 });
 * // → 0.954 (macro base 0.795 × absent-prior multiplier 1.2)
 */
export function automationSalience(obs: ParamObservation, priors?: SaliencePriors): number {
  // L: log-scaled movement count normalized against the fold cap ∈ [0,1].
  const count = clamp01(obs.movementCount / COUNT_REFERENCE) * COUNT_REFERENCE;
  const L = Math.log1p(count) / Math.log1p(COUNT_REFERENCE);

  // R: observed value range, clamped into [0,1] (defensive against a
  // hand-edited fold entry with min/max outside the normalized domain).
  const min = clamp01(obs.minValue);
  const max = clamp01(obs.maxValue);
  const R = clamp01(max - min);

  // V: variance proxy (documented above) — last's distance from the observed
  // range midpoint, scaled ×4 and clamped (A8 first-draft scaling).
  const last = clamp01(obs.lastValue);
  const mid = (min + max) / 2;
  const halfRange = (max - min) / 2;
  const varianceProxy = halfRange > 0 ? clamp01(1 - Math.abs(last - mid) / halfRange) : 0;
  const V = Math.min(1, varianceProxy * 4);

  const base =
    obs.source === "remote_page"
      ? 0.6 + 0.4 * L
      : 0.4 * L + 0.35 * R + 0.25 * V;

  const roleSalience = priors?.roleSalience ?? DEFAULT_PRIOR;
  const energyAtMovement = priors?.energyAtMovement ?? DEFAULT_PRIOR;
  const multiplier = 1 + 0.2 * clamp01(roleSalience) + 0.2 * clamp01(energyAtMovement);

  return Number(Math.min(1, base * multiplier).toFixed(3));
}

/**
 * Rank a folded parameter map into a salience-descending list. Pure — the
 * single scoring path shared by the Analyzer plugin and the snapshot refresh
 * (Task 3). Malformed entries are skipped defensively (the reader's Ajv gate
 * already constrains the fold; a hostile hand-edit must not crash analysis).
 */
export function rankParamSalience(
  parameters: Record<string, ParamObservation>,
  priors?: SaliencePriors,
): RankedSalienceParam[] {
  const out: RankedSalienceParam[] = [];
  for (const [foldKey, entry] of Object.entries(parameters)) {
    if (!isParamObservation(entry)) continue; // defensive skip
    const min = clamp01(entry.minValue);
    const max = clamp01(entry.maxValue);
    const last = clamp01(entry.lastValue);
    const ranked: RankedSalienceParam = {
      paramKey: `${entry.source}:${entry.paramIndex}`,
      deviceKey: entry.deviceKey,
      paramIndex: entry.paramIndex,
      ...(entry.paramName !== undefined ? { paramName: entry.paramName } : {}),
      source: entry.source,
      movementCount: Math.max(0, Math.round(entry.movementCount)),
      valueRange: Number(clamp01(max - min).toFixed(3)),
      lastValue: last,
      salience: automationSalience(entry, priors),
    };
    void foldKey; // identity is rebuilt from the entry's own fields
    out.push(ranked);
  }
  out.sort((a, b) => b.salience - a.salience);
  return out;
}

/**
 * D-08 analyzer-plugin: automation salience. id "automationSalience" (the
 * DerivedFieldName reserved since M1), consumes ["parameters"] (the 05-01
 * fold), produces ["automationSalience"]. Pure (never mutates raw).
 *
 * Refuse-on-empty: no folded parameters → [] (no data, no guess — the
 * runAll gate then emits nothing rather than a fabricated ranking).
 *
 * Prior channel: roles.json/energyCurve priors reach the analyzer through the
 * DOCUMENTED runtime sidecar `automationPriors` on the raw state the refresh
 * path builds (the same open-typed defensive-read discipline energy-curve.ts
 * uses for `raw.tracks` — RawState's generated type does not describe the
 * analysis sidecar, the runtime contract does). Absent sidecar → honest
 * default-0.5 priors with a "default"-source assumption (UX-06).
 */
export const AutomationSalience: Analyzer = {
  id: "automationSalience",
  consumes: ["parameters"],
  produces: ["automationSalience"],
  analyze(raw: RawState, _ctx: AnalyzeContext): DerivedField[] {
    const parameters = extractParameters(raw);
    if (parameters.size === 0) return []; // refuse — no observations, no ranking

    const priors = (raw as { automationPriors?: SaliencePriors }).automationPriors;
    const ranked = rankParamSalience(Object.fromEntries(parameters), priors);
    if (ranked.length === 0) return []; // every entry malformed — same refusal

    const assumptions = [
      {
        claim: `ranked ${ranked.length} observed parameter aggregates from live movement only — never automation envelopes (D-05-01)`,
        confidence: 1.0,
        source: "selection" as const,
      },
      priors !== undefined
        ? {
            claim: `role/energy priors applied (roleSalience ${
              priors.roleSalience ?? DEFAULT_PRIOR
            }, energyAtMovement ${priors.energyAtMovement ?? DEFAULT_PRIOR}) from roles.json/energyCurve`,
            confidence: 1.0,
            source: "config" as const,
          }
        : {
            claim: "role/energy priors absent — defaulted 0.5 each (D-05-01 prior fallback)",
            confidence: 1.0,
            source: "default" as const,
          },
      {
        claim: "remote-page (macro) sources rank above device parameters at equal evidence — explicit intent beats inference (D-05-03)",
        confidence: 1.0,
        source: "default" as const,
      },
    ];

    return [
      {
        field: "automationSalience",
        value: ranked,
        confidence: 1.0, // deterministic from the folded aggregates — honest 1.0
        assumptions,
      },
    ];
  },
};

/**
 * Defensively extract the folded parameter map from `raw.parameters` (open
 * object at the type level; runtime entries validated per-key). Returns a
 * Map keyed by the fold key — empty when absent/not-an-object (caller refuses).
 */
function extractParameters(raw: RawState): Map<string, ParamObservation> {
  const out = new Map<string, ParamObservation>();
  const parameters = (raw as { parameters?: unknown }).parameters;
  if (typeof parameters !== "object" || parameters === null) return out;
  for (const [key, entry] of Object.entries(parameters as Record<string, unknown>)) {
    if (isParamObservation(entry)) out.set(key, entry);
  }
  return out;
}

/** Runtime guard for fold-entry-shaped values (mirrors energy-curve isNote). */
function isParamObservation(v: unknown): v is ParamObservation {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.deviceKey === "string" &&
    typeof o.paramIndex === "number" &&
    (o.source === "device_parameter" || o.source === "remote_page") &&
    typeof o.movementCount === "number" &&
    typeof o.lastValue === "number" &&
    typeof o.minValue === "number" &&
    typeof o.maxValue === "number"
  );
}
