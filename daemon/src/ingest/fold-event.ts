// daemon/src/ingest/fold-event.ts
//
// STATE-04 live operation — the PURE event -> RawState fold for the 5
// observational event types (RESEARCH.md Pattern 2 lines 463-492;
// 02-PATTERNS.md Assignment 6 lines 261-297; Observers.java:83-162 the
// exact payload each observer emits). This is the SECOND-stage ingest
// primitive: where normalizer.ts validates a full snapshot, fold-event
// applies ONE incremental event to an existing RawState and returns the
// updated state.
//
// PURITY (mirrors normalizer.ts, NOT reconcile.ts): every branch returns a
// NEW RawState (shallow spread). The input state is NEVER mutated. The
// dispatcher does `state = foldEvent(state, event, ctx)` (reassignment) —
// matches normalizer.ts's "validate-then-return-new" stance, distinct from
// reconcile.ts's caller-owned-map in-place mutation. Rationale (PLAN.md
// Decision 4): events are applied in sequence and the intermediate states
// are debuggable; a pure fold is trivially testable; a thrown exception
// leaves the prior state intact.
//
// ROBUSTNESS: an unknown event type returns the state unchanged. The
// reader's Ajv envelope gate already constrains `type` to the 5 enum
// values (event.schema.json), so the default branch is unreachable in
// practice — but defensive (a future event type added to the schema
// without a fold branch should not crash the dispatcher).
//
// clip.name_changed empty-payload NO-OP (Observers.java:104-116): the
// bridge emits the event TYPE via cursorClip.getLoopLength() but cannot
// fill in the clip name (the public Clip/CursorClip surface has no name()
// accessor). The daemon CANNOT synthesize a clip sid from an empty
// payload — selection.clipSid is set ONLY via the snapshot/reconcile path
// (a clip pull). This is the documented M1 limitation.

import type { RawState, StableIdMap } from "../state/reconcile.js";

/**
 * Context the fold needs to resolve raw Bitwig slot indices to stable IDs.
 *  - `summaryTracks` is the last `get.project_summary` response: an array
 *    of `{ slot, name }` the bridge emitted (PullHandlers.java:91-100).
 *  - `stableIds.byNameAndType` is the `${type}:${name}` -> sid map populated
 *    by reconcile() (STATE-04). The fold reads but never mutates it.
 */
export interface FoldContext {
  summaryTracks: { slot: number; name: string }[];
  stableIds: StableIdMap;
}

/**
 * Apply ONE validated event to a RawState; return the new state.
 *
 * PURITY: never mutates `state`. Returns a new shallow-cloned object per
 * branch (the unchanged branches return the same reference — that is also
 * a valid pure return: the caller's contract is `state = foldEvent(...)`).
 *
 * @param state  - the current RawState (read-only).
 * @param event  - one of the 5 observational events. `payload` is optional
 *   + permissive (event.schema.json's payload union); each branch narrows.
 * @param ctx    - the {@link FoldContext} for slot -> sid resolution.
 * @returns the new RawState (or the same reference for no-op folds).
 *
 * @example
 * state = foldEvent(state, { type: "selection.changed", payload: { slot: 0 } }, ctx);
 */
export function foldEvent(
  state: RawState,
  event: { type: string; payload?: Record<string, unknown> | undefined },
  ctx: FoldContext,
): RawState {
  const p = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "selection.changed": {
      const slot = typeof p.slot === "number" ? p.slot : undefined;
      const trackSid = slot === undefined ? undefined : resolveSlotToSid(slot, ctx);
      // If unresolvable, OMIT trackSid (the field is optional in the schema;
      // we preserve any other selection fields via spread).
      const nextSelection = { ...state.selection };
      if (trackSid === undefined) {
        delete nextSelection.trackSid;
      } else {
        nextSelection.trackSid = trackSid;
      }
      return { ...state, selection: nextSelection };
    }

    case "track.name_changed": {
      // Two shapes: cursor form {name} (Observers.java:96-101) vs windowed
      // form {slot, name} (Observers.java:154-159). The windowed form has a
      // precise target (tracks[slot]); the cursor form is ambiguous (the
      // cursor track is the selected one, but matching by PREVIOUS cursor
      // name is racy). M1: windowed form updates tracks[slot]; cursor form
      // is a documented best-effort no-op when ambiguous.
      const slot = typeof p.slot === "number" ? p.slot : undefined;
      const name = typeof p.name === "string" ? p.name : undefined;
      if (slot === undefined || name === undefined) {
        // Cursor form (no slot) — M1 best-effort no-op. Documented.
        return state;
      }
      const tracks = (state.tracks ?? []).slice() as unknown as { name?: string; slot?: number; [k: string]: unknown }[];
      // Ensure the array is long enough; pad with empty objects.
      while (tracks.length <= slot) tracks.push({});
      tracks[slot] = { ...tracks[slot], name, slot };
      return { ...state, tracks: tracks as unknown as RawState["tracks"] };
    }

    case "clip.name_changed": {
      // NO-OP (Observers.java:104-116): the bridge emits the event type via
      // cursorClip.getLoopLength() but cannot fill in the name (Clip has no
      // name() accessor). The daemon's selection.clipSid comes from the
      // snapshot/reconcile path only. Documented as a known M1 limitation.
      return state;
    }

    case "device.name_changed": {
      const name = typeof p.name === "string" ? p.name : undefined;
      if (name === undefined) return state;
      const devices = (state.devices ?? []) as unknown as { name?: string; cursor?: boolean; [k: string]: unknown }[];
      // M1: push/update a {name, cursor:true} entry — the snapshot/reconcile
      // path is the canonical device list; this fold keeps the cursor-device
      // name fresh between snapshots. The on-demand device-chain pull
      // (query-server.ts) surfaces the `pages` array separately.
      const existingIdx = devices.findIndex((d) => d.cursor === true);
      if (existingIdx >= 0) {
        const next = devices.slice();
        next[existingIdx] = { ...devices[existingIdx], name };
        return { ...state, devices: next as unknown as RawState["devices"] };
      }
      const next = devices.slice();
      next.push({ name, cursor: true });
      return { ...state, devices: next as unknown as RawState["devices"] };
    }

    case "transport.changed": {
      const playing = typeof p.playing === "boolean" ? p.playing : undefined;
      if (playing === undefined) return state;
      const prevTransport = state.project.transport ?? {};
      return {
        ...state,
        project: {
          ...state.project,
          transport: { ...prevTransport, playing },
        },
      };
    }

    default:
      // Unknown event type — defensive. The reader's envelope Ajv gate
      // already constrains `type` to the 5 enum values (event.schema.json),
      // so this is unreachable in practice.
      return state;
  }
}

/**
 * Resolve a raw Bitwig cursor slot index to a stable track sid via the
 * summary's slot -> name mapping + the stableIds.byNameAndType index.
 *
 * Returns `undefined` when:
 *  - `summaryTracks` is empty (the snapshot pull has not landed yet), OR
 *  - the slot is not in the summary (out-of-window cursor), OR
 *  - the name is not in `byNameAndType` (reconcile has not minted a sid
 *    for that name yet).
 *
 * In any of those cases, selection.trackSid is OMITTED (the field is
 * optional in project-state.schema.json).
 */
function resolveSlotToSid(slot: number, ctx: FoldContext): string | undefined {
  const entry = ctx.summaryTracks.find((t) => t.slot === slot);
  if (!entry) return undefined;
  return ctx.stableIds.byNameAndType.get(`track:${entry.name}`);
}
