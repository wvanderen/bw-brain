// daemon/src/ingest/fold-event.ts
//
// STATE-04 live operation — the PURE event -> RawState fold for the 6
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
// reader's Ajv envelope gate already constrains `type` to the 6 enum
// values (event.schema.json), so the default branch is unreachable in
// practice — but defensive (a future event type added to the schema
// without a fold branch should not crash the dispatcher).
//
// clip.name_changed (Phase 03.1-02 D-03c): the bridge now derives a V1
// clipSid (sha256(trackSid:loopBeats).slice(0,16)) and emits it in the
// payload; this fold writes it into selection.clipSid. Pre-fix bridges
// (no clipSid in the payload) keep the documented NO-OP — see the
// backward-compat branch in the case below.
//
// parameter.changed (Phase 5, 05-01 — AUTO-01/D-05-01/D-05-02): the fold
// maintains state.parameters, a BOUNDED map of per-parameter MOVEMENT
// AGGREGATES keyed by `${deviceKey}:${source}:${paramIndex}` — NEVER an
// event log (Pitfall 5 / T-05-03: 8 bounded scalar fields, no value
// arrays). A movement counts only when the incoming value differs from
// the stored lastValue by more than MOVEMENT_EPSILON (1e-4). The map is
// capped at PARAM_AGGREGATE_CAP (512) entries with lowest-lastMovedAt
// eviction, so a parameter.changed flood can never grow state without
// bound (T-05-01) — on top of the reader's existing drop-oldest
// observational backpressure.

import type { RawState, StableIdMap } from "../state/reconcile.js";

/**
 * A value delta must exceed this to count as a movement (D-05-01: observer
 * fires with value delta > epsilon). 1e-4 absorbs float jitter from the
 * bridge's normalized [0,1] parameter values without hiding real nudges.
 */
export const MOVEMENT_EPSILON = 1e-4;

/**
 * Hard cap on the parameters aggregate map (Pitfall 5 / T-05-01). Mirrors
 * project-state.schema.json parameters.maxProperties (defense in depth: the
 * fold evicts, the schema refuses anything larger).
 */
export const PARAM_AGGREGATE_CAP = 512;

/** The per-source vocabulary of parameter.changed (event.schema.json `source`). */
type ParamSource = "device_parameter" | "remote_page";

/** The D-05-05 automation-write state object (event/project-state schemas). */
interface AutomationWriteState {
  arrangerWriteEnabled: boolean;
  launcherWriteEnabled: boolean;
  overrideActive: boolean;
  writeMode: "latch" | "touch" | "write";
}

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
 * @param event  - one of the 6 observational events. `payload` is optional
 *   + permissive (event.schema.json's payload union); each branch narrows.
 *   `timestamp` (optional here, required on the wire) feeds the parameter
 *   aggregates' lastMovedAt clock.
 * @param ctx    - the {@link FoldContext} for slot -> sid resolution.
 * @returns the new RawState (or the same reference for no-op folds).
 *
 * @example
 * state = foldEvent(state, { type: "selection.changed", payload: { slot: 0 } }, ctx);
 */
export function foldEvent(
  state: RawState,
  event: { type: string; payload?: Record<string, unknown> | undefined; timestamp?: unknown },
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
      // D-03c (Phase 03.1-02): the bridge now derives a V1 clipSid from the
      // cursor clip's parent track sid + loop length (sha256(trackSid:loopBeats)
      // .slice(0,16), see bridge/.../ClipSid.java + RESEARCH §D-01) and emits
      // it in the clip.name_changed payload. Fold it into selection.clipSid so
      // Plan 03's apply/revert pre-flight gates have an identity to read.
      //
      // BACKWARD COMPAT: a pre-fix bridge (no clipSid in the payload) keeps the
      // documented NO-OP — selection.clipSid is left untouched. The defensive
      // typeof check also covers a malformed (non-string) clipSid.
      const clipSid = typeof p.clipSid === "string" ? p.clipSid : undefined;
      if (clipSid === undefined) {
        return state;
      }
      return { ...state, selection: { ...state.selection, clipSid } };
    }

    case "device.name_changed": {
      const name = typeof p.name === "string" ? p.name : undefined;
      if (name === undefined) return state;
      // Phase 5 gap-closure (deferred-items 05-05): fold the cursor device's
      // deviceSid into selection — the 05-05 wrong_device_targeted gate reads
      // it as the live selected-device identity (undefined → ambiguous_target
      // fail-closed). The bridge computes the fingerprint with the SAME
      // deriveDeviceSid caches parameter.changed deviceKey uses, so the two
      // folds agree by construction.
      const deviceSid = typeof p.deviceSid === "string" ? p.deviceSid : undefined;
      const devices = (state.devices ?? []) as unknown as { name?: string; cursor?: boolean; [k: string]: unknown }[];
      // M1: push/update a {name, cursor:true} entry — the snapshot/reconcile
      // path is the canonical device list; this fold keeps the cursor-device
      // name fresh between snapshots. The on-demand device-chain pull
      // (query-server.ts) surfaces the `pages` array separately.
      const existingIdx = devices.findIndex((d) => d.cursor === true);
      const selection = deviceSid === undefined ? state.selection : { ...state.selection, deviceSid } as typeof state.selection;
      if (existingIdx >= 0) {
        const next = devices.slice();
        next[existingIdx] = { ...devices[existingIdx], name };
        return { ...state, devices: next as unknown as RawState["devices"], selection };
      }
      const next = devices.slice();
      next.push({ name, cursor: true });
      return { ...state, devices: next as unknown as RawState["devices"], selection };
    }

    case "transport.changed": {
      // Phase 5 (05-01): transport.changed may carry `playing` (Transport
      // play observer) AND/OR the optional `automationWrite` object (D-05-05
      // write-state observers — they fire independently of play state). An
      // event carrying neither is a defensive no-op.
      const playing = typeof p.playing === "boolean" ? p.playing : undefined;
      const automationWrite = parseAutomationWrite(p.automationWrite);
      if (playing === undefined && automationWrite === undefined) return state;
      const prevTransport = state.project.transport ?? {};
      const nextTransport = { ...prevTransport };
      if (playing !== undefined) nextTransport.playing = playing;
      if (automationWrite !== undefined) nextTransport.automationWrite = automationWrite;
      return {
        ...state,
        project: {
          ...state.project,
          transport: nextTransport,
        },
      };
    }

    case "parameter.changed": {
      // Phase 5 (05-01) — AUTO-01 observation spine. Defensive typeof guards
      // mirror the device.name_changed branch (the reader's Ajv gate already
      // constrains the payload; a malformed fold input must never crash the
      // dispatcher).
      const deviceKey = typeof p.deviceKey === "string" ? p.deviceKey : undefined;
      const paramIndex = typeof p.paramIndex === "number" ? p.paramIndex : undefined;
      const source: ParamSource | undefined =
        p.source === "device_parameter" || p.source === "remote_page" ? p.source : undefined;
      const value = typeof p.value === "number" ? p.value : undefined;
      if (deviceKey === undefined || paramIndex === undefined || source === undefined || value === undefined) {
        return state;
      }
      const paramName = typeof p.paramName === "string" ? p.paramName : undefined;
      const ts = typeof event.timestamp === "number" ? event.timestamp : 0;

      const key = `${deviceKey}:${source}:${paramIndex}`;
      const prevMap = (state.parameters ?? {}) as NonNullable<RawState["parameters"]>;
      const prev = prevMap[key];

      let nextEntry;
      if (prev === undefined) {
        // First observation of this param — no prior to differ from, so this
        // is NOT a movement (movementCount stays 0).
        nextEntry = {
          deviceKey,
          paramIndex,
          ...(paramName !== undefined ? { paramName } : {}),
          source,
          movementCount: 0,
          lastValue: value,
          minValue: value,
          maxValue: value,
          lastMovedAt: ts,
        };
      } else {
        const moved = Math.abs(value - prev.lastValue) > MOVEMENT_EPSILON;
        nextEntry = {
          ...prev,
          ...(paramName !== undefined ? { paramName } : {}),
          movementCount: prev.movementCount + (moved ? 1 : 0),
          lastValue: value,
          minValue: Math.min(prev.minValue, value),
          maxValue: Math.max(prev.maxValue, value),
          lastMovedAt: moved ? ts : prev.lastMovedAt,
        };
      }

      // Bounded map: cap PARAM_AGGREGATE_CAP entries, evicting the entry
      // with the LOWEST lastMovedAt (Pitfall 5 / T-05-01 — stale params go
      // first; actively-moved params survive).
      let nextMap = { ...prevMap, [key]: nextEntry };
      if (Object.keys(nextMap).length > PARAM_AGGREGATE_CAP) {
        let stalestKey: string | undefined;
        let stalestTs = Number.POSITIVE_INFINITY;
        for (const [k, entry] of Object.entries(nextMap)) {
          if (entry.lastMovedAt < stalestTs) {
            stalestTs = entry.lastMovedAt;
            stalestKey = k;
          }
        }
        const { [stalestKey as string]: _evicted, ...rest } = nextMap;
        nextMap = rest;
      }
      // Belt-and-braces (deferred-items 05-05): deviceKey IS the selected
      // device's deviceSid fingerprint — fold it into selection so the 05-05
      // wrong_device_targeted compare stays fresh on parameter movement
      // (consistent by construction with the salience-derived scopes).
      const selection = { ...state.selection, deviceSid: deviceKey } as typeof state.selection;
      return { ...state, parameters: nextMap, selection };
    }

    default:
      // Unknown event type — defensive. The reader's envelope Ajv gate
      // already constrains `type` to the 6 enum values (event.schema.json),
      // so this is unreachable in practice.
      return state;
  }
}

/**
 * Narrow an event-payload `automationWrite` value to the D-05-05 state
 * object, or `undefined` when absent/malformed (defensive — the reader's
 * Ajv gate already validated the shape; a malformed fold input no-ops
 * rather than writing garbage state).
 */
function parseAutomationWrite(raw: unknown): AutomationWriteState | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const w = raw as Record<string, unknown>;
  const arrangerWriteEnabled = typeof w.arrangerWriteEnabled === "boolean" ? w.arrangerWriteEnabled : undefined;
  const launcherWriteEnabled = typeof w.launcherWriteEnabled === "boolean" ? w.launcherWriteEnabled : undefined;
  const overrideActive = typeof w.overrideActive === "boolean" ? w.overrideActive : undefined;
  const writeMode =
    w.writeMode === "latch" || w.writeMode === "touch" || w.writeMode === "write" ? w.writeMode : undefined;
  if (
    arrangerWriteEnabled === undefined ||
    launcherWriteEnabled === undefined ||
    overrideActive === undefined ||
    writeMode === undefined
  ) {
    return undefined;
  }
  return { arrangerWriteEnabled, launcherWriteEnabled, overrideActive, writeMode };
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
