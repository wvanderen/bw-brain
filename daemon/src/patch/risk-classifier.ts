// daemon/src/patch/risk-classifier.ts
//
// Phase 3 (EDIT-06 / D-07) — risk classification + scope-mismatch hard-error.
// PURE module: NO I/O (mirrors daemon/src/cli/diff-logic.ts discipline). The
// classifier is invoked at the daemon boundary after a patch validates; the
// caller translates a thrown ScopeMismatchError to `{ok:false,
// error:"scope_mismatch"}` (mirrors query-server.ts makeErr shape).
//
// D-07: the author (transform engine) self-declares a risk class; the daemon
// VALIDATES the declaration against a fixed ruleset (op count, blast radius)
// and may UPGRADE (never downgrade). belowBar (D-09) forces high; multi-track
// (D-02 — the daemon rejects >1 trackSid outright; if a multi-track signal
// reaches the classifier it forces high as a defense-in-depth backstop).
//
// INV-9 (scope containment): when scope.region is declared, any op whose note
// start falls outside [region.start, region.end) throws ScopeMismatchError
// carrying the offending start.
//
// INV-10 (risk monotonicity): result = max(declared, floor) where floor rises
// with op count (>5 → medium, >20 → high). The daemon never downgrades.
import type { PrimitiveOp } from "./inverse-ops.js";

/** The risk classes (PROJECT.md §Edit model + D-07). Ordered low < medium < high. */
export type RiskClass = "low" | "medium" | "high";

/** Ordered risk classes for max(declared, floor) comparison. */
const RISK_ORDER: readonly RiskClass[] = ["low", "medium", "high"] as const;

/**
 * Inputs to {@link classifyRisk}. The classifier is pure over this struct.
 */
export interface RiskInput {
  /** The transform engine's self-declared risk class. */
  declared: RiskClass;
  /** The resolved primitive ops (used for the op-count floor + region check). */
  operations: PrimitiveOp[];
  /**
   * The patch's declared scope. When `region` is present, classifyRisk enforces
   * that every op's note start is within [region.start, region.end) (INV-9).
   */
  scopeDeclared: {
    clipSid: string;
    region?: { start: number; end: number };
  };
  /**
   * D-09 below-bar override marker. true forces risk = high (a below-motif-
   * threshold near-miss the producer explicitly allowed via --allow-below-bar).
   */
  belowBar: boolean;
  /**
   * D-02 multi-track signal. The daemon rejects a patch declaring >1 trackSid
   * outright (hard error at the daemon boundary); this flag is a defense-in-
   * depth backstop — if it ever reaches the classifier as true, risk = high.
   */
  multiTrack?: boolean;
  /**
   * Forward-compat hook: the set of noteKeys the ops touch. The active INV-9
   * guard in this plan is region containment (op note starts vs scope.region);
   * a full scope.touched ⊆ scope.declared set-comparison lands with the daemon-
   * boundary clipSid enforcement in Plan 02. Unused here; kept for interface
   * stability (callers may pass it; it is not required).
   */
  scopeTouched?: Set<string>;
}

/**
 * Thrown by {@link classifyRisk} when an op references a note whose start is
 * outside the declared scope region (INV-9). The message carries the offending
 * note start so the caller can surface it in the structured error response.
 */
export class ScopeMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeMismatchError";
  }
}

/** Extract the start position an op references (for region containment). */
function opStart(op: PrimitiveOp): number {
  switch (op.op) {
    case "add_note":
      return op.note.start;
    case "remove_note":
      return op.note.start;
    case "update_note_field":
      // Identity-stable: before.start === after.start (Pitfall 2); use after.
      return op.after.start;
  }
}

/**
 * Classify a patch's risk: author declares, daemon floors (upgrade-only).
 *
 * Algorithm (D-07):
 *  1. SCOPE CHECK (INV-9): if `scopeDeclared.region` is present, throw
 *     {@link ScopeMismatchError} when any op's note start is outside
 *     [region.start, region.end). The thrown message names the offending start.
 *  2. FLOOR (op count): >20 → high, >5 → medium, else low.
 *  3. belowBar (D-09) → floor = high.
 *  4. multiTrack (D-02 backstop) → floor = high.
 *  5. RESULT = max(declared, floor) — the daemon NEVER downgrades.
 *
 * @returns the final risk class (never lower than `declared`).
 * @throws {ScopeMismatchError} if an op's note start is outside the region.
 *
 * @example
 * classifyRisk({ declared: "low", operations: ops, scopeDeclared: { clipSid }, belowBar: false })
 */
export function classifyRisk(input: RiskInput): RiskClass {
  // 1. Scope containment (INV-9) — hard error before any risk math.
  if (input.scopeDeclared.region) {
    const { start: rStart, end: rEnd } = input.scopeDeclared.region;
    for (const op of input.operations) {
      const noteStart = opStart(op);
      if (noteStart < rStart || noteStart >= rEnd) {
        throw new ScopeMismatchError(
          `scope_mismatch: op touches note at ${noteStart} outside declared region [${rStart}, ${rEnd})`,
        );
      }
    }
  }

  // 2. Compute the floor from op count.
  let floor: RiskClass;
  const n = input.operations.length;
  if (n > 20) floor = "high";
  else if (n > 5) floor = "medium";
  else floor = "low";

  // 3. belowBar (D-09) forces high.
  if (input.belowBar) floor = "high";

  // 4. multiTrack (D-02 backstop) forces high.
  if (input.multiTrack) floor = "high";

  // 5. max(declared, floor) — never downgrade.
  const declaredIdx = RISK_ORDER.indexOf(input.declared);
  const floorIdx = RISK_ORDER.indexOf(floor);
  return RISK_ORDER[Math.max(declaredIdx, floorIdx)];
}
