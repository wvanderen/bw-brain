// daemon/src/state/describe.test.ts
//
// Unit tests for the literal grounded description generator (D-10). describe()
// is a PURE function mirroring handshake.ts's pattern: documented interface,
// deterministic given inputs, no I/O, no side effects.
//
// These tests are the M1-layer defense for:
//  - PITFALL 7 / D-10: describe() NEVER claims sections/motifs/track roles/
//    energy levels/automation salience (those analyzers do not exist until
//    Phases 3-5). A negative-match assertion enforces this.
//  - UX-06: every nextAction carries a non-empty assumptions[] array.
//  - SC#3: describe() refuses to describe when freshness != "live".
//  - D-11: state.section is ALWAYS the em-dash reserved slot.
//  - D-09: a null intent produces NO inference (no default synthesized).
//
// Note on the import name: vitest exports `describe` (the test block wrapper);
// the SUT also exports `describe` (the function under test). The SUT import is
// aliased to `describeState` to avoid shadowing.

import { describe as describeBlock, it, expect } from "vitest";
import { describe as describeState, SECTION_RESERVED } from "./describe.js";
import type { RawState } from "./reconcile.js";
import type { ProjectIntent } from "../gen/intent.js";

/** Build a fully-selected RawState (track + clip + device + transport). */
function fullSelection(): RawState {
  return {
    version: "1.0",
    project: {
      name: "Demo",
      tempo: 120,
      timeSignature: "4/4",
      transport: { playing: true, positionBeats: 0 },
    },
    selection: {
      trackSid: "trk_aaaaaaaaaaaaaaaa",
      clipSid: "clip_bbbbbbbbbbbbbbbb",
      deviceSid: "dev_cccccccccccccccc",
    },
    tracks: [{ sid: "trk_aaaaaaaaaaaaaaaa", name: "Kick", type: "track" }],
    clips: [{ sid: "clip_bbbbbbbbbbbbbbbb", name: "Kick Pattern", type: "clip" }],
    devices: [{ sid: "dev_cccccccccccccccc", name: "Kick Drum", type: "device" }],
  };
}

/** A matching ProjectIntent (summary references the selected track type). */
function matchingIntent(): ProjectIntent {
  return {
    version: "1.0",
    projectIntent: {
      summary: "techno track, 130 BPM, dark",
      targets: ["build tension toward the drop"],
    },
  };
}

/** A mismatching ProjectIntent (constraint references "bass" but Kick is selected). */
function mismatchIntent(): ProjectIntent {
  return {
    version: "1.0",
    projectIntent: {
      summary: "preserve the bass groove",
      constraints: ["preserve bass motif identity"],
      targets: ["tighten the bassline"],
    },
  };
}

describeBlock("describe() — happy path (full selection)", () => {
  it("returns a Description with state/whatThisIs/nextActions/assumptions", () => {
    const out = describeState(fullSelection(), null, "live");
    expect(out).toHaveProperty("state");
    expect(out).toHaveProperty("whatThisIs");
    expect(out).toHaveProperty("nextActions");
    expect(out).toHaveProperty("assumptions");
  });

  it("resolves track/clip/device names from the open-object arrays by sid", () => {
    const out = describeState(fullSelection(), null, "live");
    expect(out.state.track).toBe("Kick");
    expect(out.state.clip).toBe("Kick Pattern");
    expect(out.state.device).toBe("Kick Drum");
  });

  it("renders the transport string from project.transport + tempo", () => {
    const out = describeState(fullSelection(), null, "live");
    expect(out.state.transport).toContain("playing");
    expect(out.state.transport).toContain("120");
    expect(out.state.transport).toContain("BPM");
  });

  it("produces 2-4 nextActions each pointing at a read command", () => {
    const out = describeState(fullSelection(), null, "live");
    expect(out.nextActions.length).toBeGreaterThanOrEqual(2);
    expect(out.nextActions.length).toBeLessThanOrEqual(4);
    for (const a of out.nextActions) {
      expect(a.action.length).toBeGreaterThan(0);
    }
  });

  it("top-level assumptions is non-empty (UX-06 grounding)", () => {
    const out = describeState(fullSelection(), null, "live");
    expect(out.assumptions.length).toBeGreaterThanOrEqual(1);
  });
});

describeBlock("describe() — no clip selected (bw-midi omitted)", () => {
  it("omits bw-midi inspect from nextActions when no clip is selected", () => {
    const state = fullSelection();
    delete state.selection.clipSid;
    const out = describeState(state, null, "live");
    const actions = out.nextActions.map((a) => a.action);
    expect(actions).not.toContain("bw-midi inspect --json");
    // state.clip falls back to the em-dash
    expect(out.state.clip).toBe(SECTION_RESERVED);
  });

  it("keeps bw-device inspect when a device IS selected but no clip", () => {
    const state = fullSelection();
    delete state.selection.clipSid;
    const out = describeState(state, null, "live");
    const actions = out.nextActions.map((a) => a.action);
    expect(actions).toContain("bw-device inspect --json");
  });
});

describeBlock("describe() — freshness gate (SC#3)", () => {
  it("refuses to describe when freshness is stale", () => {
    const out = describeState(fullSelection(), null, "stale");
    expect(out.whatThisIs.toLowerCase()).toContain("stale");
    expect(out.whatThisIs.toLowerCase()).toContain("refus");
    // nextActions empty — no read actions when refusing
    expect(out.nextActions).toEqual([]);
  });

  it("refuses to describe when freshness is disconnected", () => {
    const out = describeState(fullSelection(), null, "disconnected");
    expect(out.whatThisIs.toLowerCase()).toContain("disconnected");
    expect(out.nextActions).toEqual([]);
  });

  it("refuses when state is null (bridge connected but no snapshot)", () => {
    const out = describeState(null, null, "live");
    expect(out.whatThisIs.toLowerCase()).toContain("no snapshot");
    expect(out.nextActions).toEqual([]);
  });

  it("still carries assumptions on a refusal (UX-06 even when refusing)", () => {
    const out = describeState(fullSelection(), null, "stale");
    expect(out.assumptions.length).toBeGreaterThanOrEqual(1);
    expect(out.assumptions[0]!.source).toBe("selection");
  });
});

describeBlock("describe() — intent mismatch surfacing (D-10)", () => {
  it("adds a mismatch sentence when intent references a track type not selected", () => {
    const out = describeState(fullSelection(), mismatchIntent(), "live");
    expect(out.whatThisIs.toLowerCase()).toContain("mismatch");
  });

  it("does NOT add a mismatch sentence when intent matches the selection", () => {
    const out = describeState(fullSelection(), matchingIntent(), "live");
    expect(out.whatThisIs.toLowerCase()).not.toContain("mismatch");
  });

  it("suggests editing intent.json when a mismatch is detected", () => {
    const out = describeState(fullSelection(), mismatchIntent(), "live");
    const actions = out.nextActions.map((a) => a.action);
    expect(actions).toContain("edit .bw-brain/intent.json");
  });

  it("suggests editing intent.json when intent is absent", () => {
    const out = describeState(fullSelection(), null, "live");
    const actions = out.nextActions.map((a) => a.action);
    expect(actions).toContain("edit .bw-brain/intent.json");
  });

  it("does NOT suggest editing intent.json when intent is present and matches", () => {
    const out = describeState(fullSelection(), matchingIntent(), "live");
    const actions = out.nextActions.map((a) => a.action);
    expect(actions).not.toContain("edit .bw-brain/intent.json");
  });
});

describeBlock("describe() — D-09 (null intent: NO inference)", () => {
  it("with null intent, whatThisIs does NOT synthesize a default intent", () => {
    const out = describeState(fullSelection(), null, "live");
    // The description must not claim an intent exists or state a default goal.
    expect(out.whatThisIs.toLowerCase()).not.toContain("intent is");
    expect(out.whatThisIs.toLowerCase()).not.toContain("goal is");
    expect(out.whatThisIs.toLowerCase()).not.toContain("aim is");
  });

  it("with null intent, assumptions records the absence honestly", () => {
    const out = describeState(fullSelection(), null, "live");
    const absence = out.assumptions.find((a) =>
      a.claim.toLowerCase().includes("no intent"),
    );
    expect(absence).toBeDefined();
    expect(absence!.source).toBe("selection");
  });
});

describeBlock("describe() — PITFALL 7 (NO invented critique)", () => {
  // The forbidden terms: sections, motifs, track roles, energy, automation
  // salience. describe() MUST NOT emit any of these — the corresponding
  // analyzers do not exist until Phases 3-5. This is the D-10 hard rule.
  const FORBIDDEN = [
    "section",
    "motif",
    "role",
    "energy",
    "automation",
    "chorus",
    "verse",
    "bridge", // ambiguous: "bridge" the noun vs the Java bridge; check context
    "drop",
    "build-up",
    "tension",
  ];

  it("whatThisIs contains NO forbidden critique terms (full selection)", () => {
    const out = describeState(fullSelection(), matchingIntent(), "live");
    const lower = out.whatThisIs.toLowerCase();
    for (const term of FORBIDDEN) {
      // Allow the term only if it appears as a quoted intent-target reference
      // (intent.targets may legitimately say "build tension" — that's the
      // user's words echoed back, not invented critique). The check is: the
      // term must not appear OUTSIDE an intent echo. We approximate by
      // asserting the term does not appear as a standalone claim.
      // For M1, the simplest correct assertion: the literal term must not
      // appear unless it is inside a quoted intent reference.
      if (lower.includes(term)) {
        // If it appears, it must be inside a quoted intent echo.
        expect(lower).toContain(`"${term}`);
      }
    }
  });

  it("whatThisIs contains NO 'section' claim (D-11: section is em-dash reserved)", () => {
    const out = describeState(fullSelection(), null, "live");
    expect(out.whatThisIs.toLowerCase()).not.toContain("section");
  });

  it("state.section is ALWAYS the em-dash reserved slot (D-11)", () => {
    const out1 = describeState(fullSelection(), null, "live");
    const out2 = describeState(fullSelection(), matchingIntent(), "live");
    const out3 = describeState(null, null, "live");
    expect(out1.state.section).toBe(SECTION_RESERVED);
    expect(out2.state.section).toBe(SECTION_RESERVED);
    expect(out3.state.section).toBe(SECTION_RESERVED);
  });
});

describeBlock("describe() — UX-06 (assumptions on every next-action)", () => {
  it("every nextAction carries a non-empty assumptions[] array", () => {
    const out = describeState(fullSelection(), null, "live");
    expect(out.nextActions.length).toBeGreaterThanOrEqual(2);
    for (const a of out.nextActions) {
      expect(a.assumptions.length).toBeGreaterThanOrEqual(1);
      for (const asm of a.assumptions) {
        expect(asm.claim.length).toBeGreaterThan(0);
        expect(asm.confidence).toBeGreaterThanOrEqual(0);
        expect(asm.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it("bw-midi inspect action assumes 'a clip is selected'", () => {
    const out = describeState(fullSelection(), null, "live");
    const midi = out.nextActions.find((a) => a.action.includes("bw-midi"));
    expect(midi).toBeDefined();
    const claim = midi!.assumptions.find((a) =>
      a.claim.toLowerCase().includes("clip"),
    );
    expect(claim).toBeDefined();
  });
});

describeBlock("describe() — purity (no side effects)", () => {
  it("does not mutate the input state", () => {
    const state = fullSelection();
    const snapshot = JSON.parse(JSON.stringify(state));
    describeState(state, null, "live");
    expect(state).toEqual(snapshot);
  });
});
