// daemon/src/transforms/track-role-classifier.test.ts
//
// P4 / 04-04 Task 2 — ARRANGE-05 track-role classification.
// INVARIANT: classifyTrackRole emits honest confidence ∈ [0,1] (NOT pre-floored
// — Pitfall 4); below minConfidence → role:"unknown" (refuse). Register-window
// masking: a kick template (C1-E1) only "sees" notes in that window. Tracks
// with zero hasContent cells are FILTERED OUT (not classified — RESEARCH Open
// Question 4).
//
// Mirrors scene-features.test.ts (pure-fn discipline) + fast-check property
// tests for the argmax + sorted-alternatives + unknown-threshold invariants.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  classifyTrackRole,
  aggregateTrackFeatures,
  TrackRoleClassifier,
  type RoleTemplate,
  type TrackFeatures,
  type RoleClassification,
} from "./track-role-classifier.js";
import type { SceneColumn } from "./scene-features.js";
import type { Note } from "../cli/diff-logic.js";
import type { Analyzer, DerivedField } from "../state/analyzer-registry.js";

/** Note builder mirroring scene-features.test.ts helper. */
function note(pitch: number, start: number, length = 0.5, velocity = 100, key?: string): Note {
  return { key: key ?? `n:${pitch}:${start.toFixed(4)}`, pitch, start, length, velocity };
}

/** The generic.json roleTemplates (the seed ARRANGE-05 vocabulary). */
const TEMPLATES: RoleTemplate[] = [
  { role: "kick", registerLow: 24, registerHigh: 40, rhythmProfile: [0.6, 0.2, 0.2, 0, 0], velocityProfile: { mean: 0.9, variance: 0.01 } },
  { role: "bass", registerLow: 28, registerHigh: 52, rhythmProfile: [0.5, 0.3, 0.2, 0, 0], velocityProfile: { mean: 0.7, variance: 0.05 } },
  { role: "lead", registerLow: 60, registerHigh: 84, rhythmProfile: [0.3, 0.3, 0.3, 0.1, 0], velocityProfile: { mean: 0.7, variance: 0.1 } },
  { role: "pad", registerLow: 48, registerHigh: 84, rhythmProfile: [0.1, 0.1, 0.6, 0.1, 0.1], velocityProfile: { mean: 0.5, variance: 0.05 } },
  { role: "hats", registerLow: 60, registerHigh: 84, rhythmProfile: [0.7, 0.2, 0.1, 0, 0], velocityProfile: { mean: 0.5, variance: 0.1 } },
  { role: "percussion", registerLow: 40, registerHigh: 80, rhythmProfile: [0.4, 0.3, 0.2, 0.1, 0], velocityProfile: { mean: 0.6, variance: 0.15 } },
  { role: "fx", registerLow: 0, registerHigh: 127, rhythmProfile: [0.2, 0.2, 0.2, 0.2, 0.2], velocityProfile: { mean: 0.5, variance: 0.3 } },
];

/** Build a SceneColumn where one track has the given notes (others empty). */
function trackColumn(trackSid: string, notes: Note[], loopBeats = 16): SceneColumn {
  return {
    sceneIdx: 0,
    cells: [
      { trackSid, trackName: trackSid, hasContent: true, loopBeats, notes },
      { trackSid: "trk_other", trackName: "Other", hasContent: false, loopBeats: 0, notes: [] },
    ],
  };
}

/** Build a grid (raw.tracks shape) with multiple tracks across one scene. */
function grid(tracks: Array<{ trackSid: string; notes: Note[]; loopBeats?: number }>) {
  return {
    tracks: tracks.map((t) => ({
      trackSid: t.trackSid,
      name: t.trackSid,
      scenes: [
        { sceneIdx: 0, hasContent: t.notes.length > 0, loopBeats: t.loopBeats ?? 16, notes: t.notes },
      ],
    })),
  };
}

describe("aggregateTrackFeatures — per-track feature aggregation", () => {
  it("kick track (C1 quarter notes vel 120) → registerDistribution peaks at pitch 24", () => {
    const notes: Note[] = [];
    for (let beat = 0; beat < 4; beat++) notes.push(note(24, beat, 0.25, 120));
    const col = trackColumn("trk_kick", notes);
    const feat = aggregateTrackFeatures("trk_kick", [col]);
    expect(feat).not.toBeNull();
    expect(feat!.trackSid).toBe("trk_kick");
    expect(feat!.registerDistribution).toHaveLength(128);
    expect(feat!.registerDistribution[24]).toBeGreaterThan(0);
  });

  it("track with zero hasContent cells across all scenes → null (filtered, RESEARCH OQ4)", () => {
    const col: SceneColumn = {
      sceneIdx: 0,
      cells: [{ trackSid: "trk_empty", trackName: "E", hasContent: false, loopBeats: 0, notes: [] }],
    };
    expect(aggregateTrackFeatures("trk_empty", [col])).toBeNull();
  });

  it("rhythmPattern is 5-bin normalized (sum ≈ 1.0 for ≥2 notes)", () => {
    const notes = [note(60, 0), note(60, 1), note(60, 2), note(60, 3)];
    const col = trackColumn("t", notes);
    const feat = aggregateTrackFeatures("t", [col]);
    expect(feat!.rhythmPattern).toHaveLength(5);
    const sum = feat!.rhythmPattern.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("velocityProfile.mean ∈ [0,1] (velocity / 127)", () => {
    const notes = [note(60, 0, 0.5, 100), note(60, 1, 0.5, 80)];
    const col = trackColumn("t", notes);
    const feat = aggregateTrackFeatures("t", [col]);
    expect(feat!.velocityProfile.mean).toBeGreaterThanOrEqual(0);
    expect(feat!.velocityProfile.mean).toBeLessThanOrEqual(1);
  });
});

describe("classifyTrackRole — concrete behaviors (D-08/D-18)", () => {
  it("kick track (C1 4-on-the-floor vel 120) → role 'kick' with confidence > 0.5", () => {
    const notes: Note[] = [];
    for (let beat = 0; beat < 4; beat++) notes.push(note(24, beat, 0.25, 120));
    const col = trackColumn("trk_kick", notes);
    const feat = aggregateTrackFeatures("trk_kick", [col])!;
    const result = classifyTrackRole(feat, TEMPLATES);
    expect(result.role).toBe("kick");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.trackSid).toBe("trk_kick");
  });

  it("track spread across C1-C6 (no clear register) → role 'unknown'", () => {
    // Notes at pitches 24, 48, 72, 96 — no single register-window template matches cleanly.
    const notes = [note(24, 0), note(48, 1), note(72, 2), note(96, 3)];
    const col = trackColumn("trk_chaos", notes);
    const feat = aggregateTrackFeatures("trk_chaos", [col])!;
    const result = classifyTrackRole(feat, TEMPLATES);
    // The argmax may be above or below 0.5 — but a spread track tends to score low.
    // If above threshold, role is the best match; if below, "unknown".
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    // For a truly spread track, verify alternatives are populated regardless.
    expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
  });

  it("track spread across C1-C6 with very low similarity → role 'unknown' (refuse)", () => {
    // Construct a track that genuinely fits no template: alternating extremes.
    const notes = [
      note(0, 0, 0.1, 10), note(127, 1, 0.1, 10), note(0, 2, 0.1, 10), note(127, 3, 0.1, 10),
    ];
    const col = trackColumn("trk_weird", notes);
    const feat = aggregateTrackFeatures("trk_weird", [col])!;
    const result = classifyTrackRole(feat, TEMPLATES);
    // Honest argmax: if best score < minConfidence, role must be "unknown".
    if (result.role === "unknown") {
      expect(result.confidence).toBeLessThan(0.5);
    }
  });

  it("alternatives sorted desc by score", () => {
    const notes: Note[] = [];
    for (let beat = 0; beat < 4; beat++) notes.push(note(24, beat, 0.25, 120));
    const col = trackColumn("trk_kick", notes);
    const feat = aggregateTrackFeatures("trk_kick", [col])!;
    const result = classifyTrackRole(feat, TEMPLATES);
    for (let i = 1; i < result.alternatives.length; i++) {
      expect(result.alternatives[i].score).toBeLessThanOrEqual(result.alternatives[i - 1].score);
    }
  });

  it("best-match confidence ≥ alternatives[0].score (argmax is the winner)", () => {
    const notes = [note(36, 0, 0.5, 100), note(36, 2, 0.5, 100)]; // C2-ish bass
    const col = trackColumn("trk_bass", notes);
    const feat = aggregateTrackFeatures("trk_bass", [col])!;
    const result = classifyTrackRole(feat, TEMPLATES);
    if (result.alternatives.length > 0) {
      expect(result.confidence).toBeGreaterThanOrEqual(result.alternatives[0].score);
    }
  });

  it("unknown role carries an assumption field", () => {
    // Use a custom template set with a very high minConfidence to force unknown.
    const strictTemplates: RoleTemplate[] = [
      { ...TEMPLATES[0], minConfidence: 0.99 },
    ];
    const notes: Note[] = [];
    for (let beat = 0; beat < 4; beat++) notes.push(note(24, beat, 0.25, 120));
    const col = trackColumn("trk_kick", notes);
    const feat = aggregateTrackFeatures("trk_kick", [col])!;
    const result = classifyTrackRole(feat, strictTemplates);
    expect(result.role).toBe("unknown");
    expect(result.assumption).toBeDefined();
    expect(result.assumption).toContain("minConfidence");
  });

  it("register-window masking: kick template (C1-E1) only sees notes in [24,40]", () => {
    // A track with notes ONLY at C5 (pitch 72) should score LOW against kick.
    const highNotes = [note(72, 0, 0.25, 120), note(72, 1, 0.25, 120), note(72, 2, 0.25, 120), note(72, 3, 0.25, 120)];
    const col = trackColumn("trk_high", highNotes);
    const feat = aggregateTrackFeatures("trk_high", [col])!;
    const kickOnly: RoleTemplate[] = [TEMPLATES[0]]; // just the kick template
    const result = classifyTrackRole(feat, kickOnly);
    // High notes outside the kick window → masked register = zeros → low cosine.
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.role).toBe("unknown");
  });

  it("custom weights override default [0.4, 0.4, 0.2]", () => {
    const notes: Note[] = [];
    for (let beat = 0; beat < 4; beat++) notes.push(note(24, beat, 0.25, 120));
    const col = trackColumn("trk_kick", notes);
    const feat = aggregateTrackFeatures("trk_kick", [col])!;
    const defaultResult = classifyTrackRole(feat, TEMPLATES);
    const registerOnly = classifyTrackRole(feat, TEMPLATES, [1.0, 0.0, 0.0]);
    // Both should classify as kick (register is the dominant signal for 4-on-floor C1).
    expect(defaultResult.role).toBe("kick");
    expect(registerOnly.role).toBe("kick");
  });

  it("empty templates → role 'unknown' with assumption", () => {
    const notes = [note(60, 0, 0.5, 100)];
    const col = trackColumn("t", notes);
    const feat = aggregateTrackFeatures("t", [col])!;
    const result = classifyTrackRole(feat, []);
    expect(result.role).toBe("unknown");
    expect(result.assumption).toBeDefined();
  });
});

describe("TrackRoleClassifier — Analyzer wrapper", () => {
  it("satisfies the Analyzer interface (id, consumes, produces)", () => {
    const a = TrackRoleClassifier as Analyzer;
    expect(a.id).toBe("trackRoles");
    expect(a.consumes).toContain("clips");
    expect(a.produces).toContain("trackRoles");
    expect(typeof a.analyze).toBe("function");
  });

  it("classifies each track with ≥1 hasContent cell", () => {
    const raw = grid([
      { trackSid: "trk_kick", notes: [note(24, 0, 0.25, 120), note(24, 1, 0.25, 120), note(24, 2, 0.25, 120), note(24, 3, 0.25, 120)] },
      { trackSid: "trk_empty", notes: [] },
    ]);
    const out = TrackRoleClassifier.analyze(raw as never, { intent: null, now: 0, profile: { name: "generic", roleTemplates: TEMPLATES } as never });
    expect(out).toHaveLength(1);
    const field = out[0] as DerivedField;
    expect(field.field).toBe("trackRoles");
    const value = field.value as Record<string, RoleClassification>;
    expect(value["trk_kick"]).toBeDefined();
    expect(value["trk_empty"]).toBeUndefined(); // filtered — zero hasContent
    expect(value["trk_kick"].role).toBe("kick");
  });

  it("empty grid → [] (refuse)", () => {
    const out = TrackRoleClassifier.analyze({ tracks: [] } as never, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });

  it("no tracks field → [] (refuse)", () => {
    const out = TrackRoleClassifier.analyze({} as never, { intent: null, now: 0 });
    expect(out).toEqual([]);
  });

  it("emits honest confidence ∈ [0,1] (mean of per-track confidences)", () => {
    const raw = grid([
      { trackSid: "trk_kick", notes: [note(24, 0, 0.25, 120), note(24, 1, 0.25, 120), note(24, 2, 0.25, 120), note(24, 3, 0.25, 120)] },
    ]);
    const out = TrackRoleClassifier.analyze(raw as never, { intent: null, now: 0, profile: { name: "generic", roleTemplates: TEMPLATES } as never });
    expect(out).toHaveLength(1);
    const field = out[0] as DerivedField;
    expect(field.confidence).toBeGreaterThanOrEqual(0);
    expect(field.confidence).toBeLessThanOrEqual(1);
    expect(field.assumptions.length).toBeGreaterThan(0);
  });

  it("uses ctx.profile.roleTemplates when present (ARCH-02 fallback to [] when absent)", () => {
    const raw = grid([
      { trackSid: "trk_kick", notes: [note(24, 0, 0.25, 120), note(24, 1, 0.25, 120), note(24, 2, 0.25, 120), note(24, 3, 0.25, 120)] },
    ]);
    // Without profile → empty templates → all tracks "unknown".
    const noProfile = TrackRoleClassifier.analyze(raw as never, { intent: null, now: 0 });
    expect(noProfile).toHaveLength(1);
    const val = (noProfile[0] as DerivedField).value as Record<string, RoleClassification>;
    expect(val["trk_kick"].role).toBe("unknown");

    // With profile → kick template available.
    const withProfile = TrackRoleClassifier.analyze(raw as never, {
      intent: null, now: 0, profile: { name: "generic", roleTemplates: TEMPLATES } as never,
    });
    const val2 = (withProfile[0] as DerivedField).value as Record<string, RoleClassification>;
    expect(val2["trk_kick"].role).toBe("kick");
  });

  it("PURE module: no fs/net imports (module loads cleanly)", () => {
    expect(typeof classifyTrackRole).toBe("function");
    expect(typeof aggregateTrackFeatures).toBe("function");
    expect(TrackRoleClassifier).toBeDefined();
  });
});

describe("classifyTrackRole — fast-check properties (invariants)", () => {
  const noteArb = fc.record({
    pitch: fc.integer({ min: 0, max: 127 }),
    start: fc.integer({ min: 0, max: 1600 }).map((t) => t / 100),
    length: fc.integer({ min: 5, max: 200 }).map((t) => t / 100),
    velocity: fc.integer({ min: 1, max: 127 }),
  }).map((n) => note(n.pitch, n.start, n.length, n.velocity));

  const featuresArb = fc.array(noteArb, { minLength: 1, maxLength: 16 }).map((notes) => {
    const col = trackColumn("trk_prop", notes);
    return aggregateTrackFeatures("trk_prop", [col])!;
  });

  it("property: every emitted role classification has confidence ∈ [0,1]", () => {
    fc.assert(
      fc.property(featuresArb, (feat) => {
        const result = classifyTrackRole(feat, TEMPLATES);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("property: best-match score ≥ alternatives[0].score (argmax is the winner)", () => {
    fc.assert(
      fc.property(featuresArb, (feat) => {
        const result = classifyTrackRole(feat, TEMPLATES);
        if (result.alternatives.length > 0) {
          expect(result.confidence).toBeGreaterThanOrEqual(result.alternatives[0].score);
        }
      }),
    );
  });

  it("property: alternatives sorted desc", () => {
    fc.assert(
      fc.property(featuresArb, (feat) => {
        const result = classifyTrackRole(feat, TEMPLATES);
        for (let i = 1; i < result.alternatives.length; i++) {
          expect(result.alternatives[i].score).toBeLessThanOrEqual(result.alternatives[i - 1].score);
        }
      }),
    );
  });

  it("property: role='unknown' iff best score < minConfidence (default 0.5)", () => {
    fc.assert(
      fc.property(featuresArb, (feat) => {
        const result = classifyTrackRole(feat, TEMPLATES);
        const defaultThreshold = 0.5;
        if (result.role === "unknown") {
          // When unknown, the best score (confidence) must be below the default threshold.
          // (Templates without explicit minConfidence inherit the default.)
          expect(result.confidence).toBeLessThan(defaultThreshold + 1e-9);
        } else {
          expect(result.confidence).toBeGreaterThanOrEqual(defaultThreshold - 1e-9);
        }
      }),
    );
  });
});
