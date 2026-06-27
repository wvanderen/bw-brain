// daemon/src/state/describe.ts
//
// The literal grounded description generator (D-10). describe() is a PURE
// function: given a RawState + ProjectIntent + Freshness, it produces a
// Description whose whatThisIs is grounded ONLY in those inputs.
//
// PITFALL 7 (D-10 hard rule): describe() NEVER claims sections, motifs, track
// roles, energy levels, or automation salience. Those analyzers do not exist
// until Phases 3-5; inventing them here would violate the "accurate first,
// creative later" stance (PROJECT.md). describe.test.ts asserts this via a
// negative match on the forbidden terms.
//
// This is the engine the Pi /analyze skill (Plan 02-05 Task 2) wraps: the
// SKILL.md prompt instructs the model to exec bw-focus export + bw-project
// summary, then shape the output exactly like describe()'s return value.
//
// Mirrors the pure-function pattern of handshake.ts (documented interface,
// @example, deterministic given inputs, no I/O, no side effects).
//
// Source: 02-05-PLAN.md Task 1 + RESEARCH.md §Code Examples "Pi /analyze
// SKILL.md" (lines 1213-1261) + CONTEXT.md D-10/D-11/D-12.

import type { ProjectIntent } from "../gen/intent.js";
import type { Assumption } from "./analyzer-registry.js";
import type { RawState } from "./reconcile.js";

/** SC#3 freshness — the daemon's view of how recent the bridge state is. */
export type Freshness = "live" | "stale" | "disconnected";

/** A single suggested next-action, carrying its grounding assumptions (UX-06). */
export interface NextAction {
  /** The read command to run, e.g. "bw-midi inspect --json". */
  action: string;
  /** Why this action is suggested + what it assumes (UX-06 — never empty). */
  assumptions: Assumption[];
}

/** The State block: track/clip/device/transport/section (D-11). */
export interface DescriptionState {
  track: string;
  clip: string;
  device: string;
  transport: string;
  /** D-11: section is RESERVED as em-dash until Phase 4 ships section detection. */
  section: string;
}

/** The complete /analyze output shape (D-10/D-11/UX-06). */
export interface Description {
  state: DescriptionState;
  /** One-paragraph literal description grounded ONLY in raw state + intent. */
  whatThisIs: string;
  /** 2-4 next-actions, each pointing at a read command available now. */
  nextActions: NextAction[];
  /** Top-level grounding assumptions (UX-06 — never empty when describing). */
  assumptions: Assumption[];
}

/** D-11: the reserved section slot — never a fabricated section label. */
export const SECTION_RESERVED = "—";

/**
 * Track-type words used by the grounded mismatch heuristic. If an intent
 * constraint/target mentions one of these AND the selected track name does NOT
 * contain it, the mismatch sentence fires. This is literal keyword matching,
 * NOT semantic inference (D-10: grounded only).
 */
const TRACK_TYPE_WORDS = [
  "kick",
  "bass",
  "lead",
  "pad",
  "hats",
  "hat",
  "perc",
  "percussion",
  "snare",
  "clap",
] as const;

/** Open-object element narrowing: the daemon-internal shape (reconcile.ts ObservedObject). */
interface NamedObserved {
  sid?: unknown;
  name?: unknown;
}

/**
 * Look up a name for a sid in an open-object array. The schema leaves
 * tracks/clips/devices element shapes open (`{}`[]); the daemon-internal
 * narrowing (reconcile.ts ObservedObject) guarantees each element carries
 * `{sid, name, type, ...}`. We read ONLY sid + name here — nothing else.
 */
function nameForSid(
  arr: {}[] | undefined,
  sid: string | undefined,
  fallback: string = SECTION_RESERVED,
): string {
  if (!sid || !arr) return fallback;
  for (const el of arr) {
    const o = el as unknown as NamedObserved;
    if (o.sid === sid && typeof o.name === "string") return o.name;
  }
  return fallback;
}

/** Build the transport string from the project.transport block + tempo. */
function transportString(state: RawState): string {
  const t = state.project.transport;
  if (!t) {
    return `stopped at ${state.project.tempo} BPM`;
  }
  const play = t.playing === true ? "playing" : "stopped";
  const tempo = state.project.tempo;
  const pos =
    typeof t.positionBeats === "number" ? ` at ${t.positionBeats} beats` : "";
  return `${play} at ${tempo} BPM${pos}`;
}

/**
 * Grounded mismatch heuristic (D-10). If any intent constraint/target mentions
 * a track-type word that does NOT appear in the selected track name, flag it.
 * This is literal keyword matching — NO semantic role inference. Returns true
 * when a mismatch is detected.
 */
function detectIntentMismatch(
  intent: ProjectIntent,
  selectedTrack: string,
): boolean {
  const selectedLower = selectedTrack.toLowerCase();
  const texts = [
    ...(intent.projectIntent.constraints ?? []),
    ...(intent.projectIntent.targets ?? []),
  ];
  for (const text of texts) {
    const textLower = text.toLowerCase();
    for (const word of TRACK_TYPE_WORDS) {
      if (textLower.includes(word) && !selectedLower.includes(word)) {
        return true;
      }
    }
  }
  return false;
}

/** Build a refusal Description (freshness != live OR state == null). */
function refuse(reason: string, assumptions: Assumption[]): Description {
  return {
    state: {
      track: SECTION_RESERVED,
      clip: SECTION_RESERVED,
      device: SECTION_RESERVED,
      transport: SECTION_RESERVED,
      section: SECTION_RESERVED,
    },
    whatThisIs: reason,
    nextActions: [],
    assumptions,
  };
}

/**
 * Produce the literal grounded description (D-10). PURE: never mutates inputs,
 * never does I/O, never throws. Refuses to describe when freshness != "live"
 * (SC#3 surfacing at the describe layer).
 *
 * PITFALL 7 (D-10 hard rule): the output contains ONLY claims grounded in the
 * raw state + intent. It NEVER claims sections, motifs, track roles, energy
 * levels, or automation salience — those analyzers do not exist until
 * Phases 3-5. describe.test.ts asserts this via a negative match.
 *
 * @param state      - the RawState (null if the bridge has not produced a snapshot yet).
 * @param intent     - the user-authored ProjectIntent (null if .bw-brain/intent.json
 *                     is absent — D-09: NO inference, NO default synthesized).
 * @param freshness  - SC#3 freshness; "live" required to describe.
 * @returns the Description (state block + whatThisIs + nextActions + assumptions).
 *
 * @example
 * describe(rawState, null, "live");
 * // { state: {track:"Kick", clip:"Kick Pattern", device:"Kick Drum", ...}, ... }
 */
export function describe(
  state: RawState | null,
  intent: ProjectIntent | null,
  freshness: Freshness,
): Description {
  // SC#3 surfacing at the describe layer (D-10 hard rule): refuse when not live.
  if (freshness !== "live") {
  return refuse(
    `Bridge state is ${freshness} — refusing to describe until live.`,
      [{ claim: `bridge state is ${freshness}`, confidence: 1.0, source: "selection" }],
    );
  }
  if (state === null) {
    return refuse(
      "Bridge connected but no snapshot yet — refusing to describe.",
      [{ claim: "no raw state snapshot available", confidence: 1.0, source: "selection" }],
    );
  }

  const sel = state.selection;
  const trackName = nameForSid(state.tracks, sel.trackSid);
  const clipName = nameForSid(state.clips, sel.clipSid);
  const deviceName = nameForSid(state.devices, sel.deviceSid);
  const transport = transportString(state);

  const stateBlock: DescriptionState = {
    track: trackName,
    clip: clipName,
    device: deviceName,
    transport,
    section: SECTION_RESERVED, // D-11: reserved em-dash — never a fabricated label.
  };

  // PITFALL 7 (D-10): whatThisIs is grounded ONLY in selection + transport +
  // intent. NEVER claim sections/motifs/roles/energy/automation.
  const parts: string[] = [`${trackName} track`];
  if (sel.clipSid) parts.push(`${clipName} clip`);
  if (sel.deviceSid) parts.push(`${deviceName} device`);
  let whatThisIs = `${parts.join(", ")} selected. Transport ${transport}.`;

  // Intent mismatch surfacing (D-10): grounded keyword match. If intent is
  // present AND its constraints/targets reference a track-type word not in the
  // selected track name, add a mismatch sentence.
  let mismatch = false;
  if (intent !== null) {
    mismatch = detectIntentMismatch(intent, trackName);
    if (mismatch) {
      const refs = [
        ...(intent.projectIntent.constraints ?? []),
        ...(intent.projectIntent.targets ?? []),
      ].join("; ");
      whatThisIs += ` Intent references ${refs} but the selection is ${trackName}/${clipName}/${deviceName} — possible mismatch.`;
    }
  }

  // Build nextActions (2-4, each pointing at a read command available now).
  const nextActions: NextAction[] = [];
  if (sel.clipSid) {
    nextActions.push({
      action: "bw-midi inspect --json",
      assumptions: [
        { claim: "a clip is selected", confidence: 1.0, source: "selection" },
      ],
    });
  }
  if (sel.deviceSid) {
    nextActions.push({
      action: "bw-device inspect --json",
      assumptions: [
        { claim: "a device is selected", confidence: 1.0, source: "selection" },
      ],
    });
  }
  // Always suggest editing intent if intent is absent OR mismatches the selection.
  if (intent === null || mismatch) {
    nextActions.push({
      action: "edit .bw-brain/intent.json",
      assumptions: [
        {
          claim: "intent.json is the authored source of truth",
          confidence: 1.0,
          source: "intent",
        },
      ],
    });
  }
  nextActions.push({
    action: "bw-project region --json",
    assumptions: [
      {
        claim: "project window context is available",
        confidence: 1.0,
        source: "selection",
      },
    ],
  });

  // Top-level grounding assumptions (UX-06).
  const assumptions: Assumption[] = [
    {
      claim: "track name resolved from selection.trackSid via the tracks array",
      confidence: sel.trackSid ? 1.0 : 0.0,
      source: "selection",
    },
    {
      claim: "transport state observed from bridge snapshot",
      confidence: 1.0,
      source: "selection",
    },
  ];
  if (intent !== null) {
    assumptions.push({
      claim: "intent authored in .bw-brain/intent.json",
      confidence: 1.0,
      source: "intent",
    });
  } else {
    assumptions.push({
      claim: "no intent.json present (D-09: not inferred, not defaulted)",
      confidence: 1.0,
      source: "selection",
    });
  }

  return { state: stateBlock, whatThisIs, nextActions, assumptions };
}
