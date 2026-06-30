// daemon/src/state/analyzer-registry.test.ts
//
// STATE-02 framework-only analyzer registry (D-08) + the below-threshold refuse
// filter. M1 ships EXACTLY ONE analyzer (IntentAnalyzer); M2 (Plan 03-03)
// extends to TWO by registering MotifSignatureAnalyzer (MIDI-01, D-08 — the
// motif analyzer is the FIRST addition to the framework). sections/roles/
// energy/automation still stay empty until their phase (D-08 defense).
//
// Source: RESEARCH.md Pattern 5 lines 673-721 (Analyzer interface) +
// 02-PATTERNS.md Assignment 8 lines 333-348 + 03-03-PLAN Task 1.

import { describe, it, expect } from "vitest";
import {
  AnalyzerRegistry,
  M1_ANALYZERS,
  M2_ANALYZERS,
  IntentAnalyzer,
  CONFIDENCE_THRESHOLD,
  type Analyzer,
  type DerivedField,
  type AnalyzeContext,
} from "./analyzer-registry.js";
import { MotifSignatureAnalyzer } from "../transforms/motif-signature.js";
import type { RawState } from "./reconcile.js";
import type { ProjectIntent } from "../gen/intent.js";

/** Minimal valid RawState fixture (selection empty — enough for analyzers that consume []). */
function fixtureRaw(): RawState {
  return {
    version: "1.0",
    project: { name: "Test", tempo: 130, timeSignature: "4/4" },
    selection: {},
  };
}

function fixtureIntent(): ProjectIntent {
  return {
    version: "1.0",
    projectIntent: {
      summary: "techno track, dark, 130 BPM",
      constraints: ["preserve bass motif"],
      targets: ["build tension toward the drop"],
    },
  };
}

describe("M1_ANALYZERS (D-08 framework-only)", () => {
  it("registers EXACTLY ONE analyzer (IntentAnalyzer) — D-08 defense", () => {
    expect(M1_ANALYZERS).toHaveLength(1);
  });

  it("the one analyzer is IntentAnalyzer", () => {
    expect(M1_ANALYZERS[0].id).toBe("intent");
  });
});

describe("M2_ANALYZERS (Plan 03-03 — MotifSignatureAnalyzer added, MIDI-01)", () => {
  it("registers EXACTLY TWO analyzers (intent + motifs)", () => {
    expect(M2_ANALYZERS).toHaveLength(2);
  });

  it("contains IntentAnalyzer (id 'intent') + MotifSignatureAnalyzer (id 'motifs')", () => {
    const ids = M2_ANALYZERS.map((a) => a.id);
    expect(ids).toContain("intent");
    expect(ids).toContain("motifs");
  });

  it("M2 extends M1 (superset — M1's analyzer is still present in M2)", () => {
    expect(M2_ANALYZERS).toEqual(expect.arrayContaining([...M1_ANALYZERS]));
  });

  it("M2 still has NO sections/roles/energy/automation analyzers (D-08 — only motifs added in M2)", () => {
    const ids = M2_ANALYZERS.map((a) => a.id);
    expect(ids).not.toContain("sections");
    expect(ids).not.toContain("trackRoles");
    expect(ids).not.toContain("energyCurve");
    expect(ids).not.toContain("automationSalience");
  });
});

describe("IntentAnalyzer", () => {
  it("id is 'intent', consumes nothing, produces ['intent']", () => {
    expect(IntentAnalyzer.id).toBe("intent");
    expect(IntentAnalyzer.consumes).toEqual([]);
    expect(IntentAnalyzer.produces).toEqual(["intent"]);
  });

  it("emits exactly one DerivedField with field 'intent' + confidence 1.0 + non-empty assumptions (non-null intent)", () => {
    const ctx: AnalyzeContext = { intent: fixtureIntent(), now: 1_000 };
    const out = IntentAnalyzer.analyze(fixtureRaw(), ctx);
    expect(out).toHaveLength(1);
    const f = out[0];
    expect(f.field).toBe("intent");
    expect(f.confidence).toBe(1.0);
    expect(f.assumptions.length).toBeGreaterThan(0);
    expect(f.assumptions.every((a) => a.source === "intent")).toBe(true);
  });

  it("still emits field 'intent' with value null + confidence 1.0 when intent is null (no inference, no skip)", () => {
    const ctx: AnalyzeContext = { intent: null, now: 1_000 };
    const out = IntentAnalyzer.analyze(fixtureRaw(), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].field).toBe("intent");
    expect(out[0].value).toBeNull();
    expect(out[0].confidence).toBe(1.0);
  });
});

describe("AnalyzerRegistry.runAll", () => {
  it("with M1_ANALYZERS + non-null intent -> exactly one DerivedField {field:'intent', confidence:1.0}", () => {
    const reg = new AnalyzerRegistry();
    for (const a of M1_ANALYZERS) reg.register(a);
    const ctx: AnalyzeContext = { intent: fixtureIntent(), now: 1_000 };
    const out = reg.runAll(fixtureRaw(), ctx);
    expect(out).toHaveLength(1);
    expect(out[0].field).toBe("intent");
    expect(out[0].confidence).toBe(1.0);
    expect(out[0].assumptions.length).toBeGreaterThan(0);
  });

  it("DROPS a derived field with confidence < 0.5 (below-threshold refuse)", () => {
    const reg = new AnalyzerRegistry();
    // Register a FAKE analyzer that returns a low-confidence field.
    const flaky: Analyzer = {
      id: "flaky-sections",
      consumes: [],
      produces: ["sections"],
      analyze(): DerivedField[] {
        return [
          {
            field: "sections",
            value: ["intro"],
            confidence: 0.3, // BELOW threshold — must be dropped
            assumptions: [{ claim: "guess", confidence: 0.3, source: "default" }],
          },
        ];
      },
    };
    reg.register(flaky);
    const out = reg.runAll(fixtureRaw(), { intent: null, now: 1_000 });
    expect(out).toHaveLength(0);
  });

  it("KEEPS a derived field with confidence exactly at the threshold (0.5)", () => {
    const reg = new AnalyzerRegistry();
    const borderline: Analyzer = {
      id: "borderline",
      consumes: [],
      produces: ["sections"],
      analyze(): DerivedField[] {
        return [
          {
            field: "sections",
            value: ["intro"],
            confidence: CONFIDENCE_THRESHOLD,
            assumptions: [{ claim: "borderline", confidence: 0.5, source: "default" }],
          },
        ];
      },
    };
    reg.register(borderline);
    const out = reg.runAll(fixtureRaw(), { intent: null, now: 1_000 });
    expect(out).toHaveLength(1);
  });

  it("KEEPS a derived field with confidence 1.0", () => {
    const reg = new AnalyzerRegistry();
    reg.register(IntentAnalyzer);
    const out = reg.runAll(fixtureRaw(), { intent: fixtureIntent(), now: 1_000 });
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(1.0);
  });

  it("preserves the below-threshold refuse even when mixed with a confident field", () => {
    const reg = new AnalyzerRegistry();
    reg.register(IntentAnalyzer); // confidence 1.0 -> kept
    const flaky: Analyzer = {
      id: "flaky",
      consumes: [],
      produces: ["sections"],
      analyze(): DerivedField[] {
        return [
          {
            field: "sections",
            value: ["x"],
            confidence: 0.2,
            assumptions: [{ claim: "guess", confidence: 0.2, source: "default" }],
          },
        ];
      },
    };
    reg.register(flaky);
    const out = reg.runAll(fixtureRaw(), { intent: fixtureIntent(), now: 1_000 });
    expect(out).toHaveLength(1);
    expect(out[0].field).toBe("intent");
  });

  it("runAll never mutates the raw state (Analyzer.analyze is pure)", () => {
    const reg = new AnalyzerRegistry();
    for (const a of M1_ANALYZERS) reg.register(a);
    const raw = fixtureRaw();
    const snapshot = JSON.parse(JSON.stringify(raw));
    reg.runAll(raw, { intent: fixtureIntent(), now: 1_000 });
    expect(raw).toEqual(snapshot);
  });
});
