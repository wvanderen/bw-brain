// daemon/src/state/analyzer-registry.ts
//
// STATE-02 analyzer-plugin framework (D-08) + the M1 analyzer set. The
// registry ships EMPTY-but-pluggable: Phases 3-5 plug analyzers
// (sections/trackRoles/motifs/energyCurve/automationSalience) into it via the
// defined Analyzer interface. M1 registers EXACTLY ONE analyzer
// (IntentAnalyzer) — every other slot stays empty until its phase (D-08).
//
// The "below-threshold = refuse rather than guess" stance (CONTEXT.md
// specifics) is encoded in runAll: any DerivedField with confidence < 0.5 is
// DROPPED from the output (the analyzer refused rather than guessed).
//
// Source: RESEARCH.md Pattern 5 lines 673-721 (verbatim interfaces) +
// 02-PATTERNS.md Assignment 8 lines 333-348.

import type { ProjectState } from "../gen/project-state.js";
import type { ProjectIntent } from "../gen/intent.js";

/** The Plan-01-generated raw-state contract (re-aliased from 02-03a's reconcile.ts). */
export type RawState = ProjectState;

/**
 * The set of derived-state field names the framework knows about. Phases 3-5
 * fill sections/trackRoles/motifs/energyCurve/automationSalience; M1 only
 * emits "intent" (STATE-03).
 */
export type DerivedFieldName =
  | "sections"
  | "trackRoles"
  | "motifs"
  | "energyCurve"
  | "automationSalience"
  | "intent";

/**
 * UX-06 / D-10: every derived field states the assumptions behind it.
 * Source: RESEARCH.md "assumptions[] shape" lines 1263-1278.
 */
export interface Assumption {
  /** Human-readable claim, e.g. "selected clip has 32 notes" or "intent says 'preserve bass motif'". */
  claim: string;
  /** Confidence ∈ [0,1]. 1.0 = directly observed; 0.5 = inferred; <0.5 should not appear (dropped by the registry). */
  confidence: number;
  /** Where the assumption comes from. */
  source: "selection" | "intent" | "config" | "default";
}

/** Context handed to every Analyzer.analyze call. */
export interface AnalyzeContext {
  /** STATE-03 user-authored intent (null if absent — D-09 no inference). */
  intent: ProjectIntent | null;
  /** Injected clock for determinism. */
  now: number;
}

/** A single derived field emitted by an analyzer, carrying its confidence + assumptions. */
export interface DerivedField {
  field: DerivedFieldName;
  value: unknown;
  confidence: number;
  assumptions: Assumption[];
}

/**
 * D-08 analyzer-plugin interface. Phases 3-5 implement this for each analyzer
 * (section-detector, track-role-classifier, etc.). M1 has exactly one
 * implementation: IntentAnalyzer below.
 *
 * `analyze` MUST be PURE: never mutate `raw`. Returns 0+ derived fields, each
 * carrying a confidence ∈ [0,1] and the assumptions[] it made (UX-06).
 */
export interface Analyzer {
  /** Stable id for telemetry + the registry. e.g. "intent", "section-detector". */
  readonly id: string;
  /** Which raw-state fields this analyzer reads. */
  readonly consumes: readonly (keyof RawState)[];
  /** Which derived-state fields this analyzer produces. */
  readonly produces: readonly DerivedFieldName[];
  /** Pure function: returns 0+ derived fields. NEVER mutates raw. */
  analyze(raw: RawState, ctx: AnalyzeContext): DerivedField[];
}

/**
 * Confidence floor for emitting a derived field. Below this = refuse rather
 * than guess (CONTEXT.md "below-threshold = refuse rather than guess").
 * RESEARCH.md line 721: 0.5.
 */
export const CONFIDENCE_THRESHOLD = 0.5;

/**
 * The analyzer registry. register() at boot; runAll() against raw state on
 * demand. Mirrors the Ajv addSchema/getSchema registry pattern in
 * reader.ts (register all, then query) — PATTERNS.md Assignment 8.
 *
 * runAll applies the below-threshold refuse filter as its post-step: any
 * DerivedField with confidence < CONFIDENCE_THRESHOLD is dropped.
 */
export class AnalyzerRegistry {
  private readonly analyzers: Analyzer[] = [];

  register(a: Analyzer): void {
    this.analyzers.push(a);
  }

  /**
   * Run every registered analyzer against `raw`, collect their outputs, and
   * DROP any DerivedField with confidence < CONFIDENCE_THRESHOLD. Never
   * mutates `raw` (analyzers are pure; the snapshot is defensive).
   */
  runAll(raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    const out: DerivedField[] = [];
    for (const a of this.analyzers) {
      const fields = a.analyze(raw, ctx);
      for (const f of fields) {
        if (f.confidence >= CONFIDENCE_THRESHOLD) {
          out.push(f);
        }
      }
    }
    return out;
  }
}

/**
 * The ONE M1 analyzer. Reads ctx.intent (loaded user-authored from
 * .bw-brain/intent.json by intent-store) and emits it as a derived field with
 * confidence 1.0 + the "user-authored" assumption. Consumes nothing from raw
 * state (intent is orthogonal to the bridge snapshot). D-09: value is null
 * when intent is absent — NO inference, NO default synthesized.
 */
export const IntentAnalyzer: Analyzer = {
  id: "intent",
  consumes: [],
  produces: ["intent"],
  analyze(_raw: RawState, ctx: AnalyzeContext): DerivedField[] {
    return [
      {
        field: "intent",
        value: ctx.intent,
        confidence: 1.0,
        assumptions: [
          {
            claim: "user-authored in .bw-brain/intent.json",
            confidence: 1.0,
            source: "intent",
          },
        ],
      },
    ];
  },
};

/**
 * M1's complete analyzer set: EXACTLY ONE analyzer (IntentAnalyzer). D-08
 * defense — sections/trackRoles/motifs/energyCurve/automationSalience all
 * stay empty until their phase (P3/P4/P5).
 */
export const M1_ANALYZERS: readonly Analyzer[] = [IntentAnalyzer];
