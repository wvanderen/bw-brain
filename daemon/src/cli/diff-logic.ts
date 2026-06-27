// daemon/src/cli/diff-logic.ts
//
// Pure state-vs-state diff logic for `bw-diff` (SC#1, D-05 promotion).
//
// This is the PURE function half of bw-diff, extracted from the I/O-bound
// commands/diff.ts so SC#1's "bw-diff round-trips 100%" bar is a mechanically
// provable property test (diff-logic.test.ts) rather than an integration test
// against live files. Mirrors the handshake.ts pure-function pattern:
// documented interfaces, @example, NO I/O, NO side effects.
//
// NOTE identity is BY KEY + content (set semantics), NOT array position. A
// reordered note list is NOT a change — note order in the JSON array is
// presentation, not musical identity. The round-trip property
//   computeStateDiff(applyDiff(a, computeStateDiff(a, b)), b)
// is empty across notesAdded/notesRemoved/notesChanged.
//
// DESIGN NOTE on RawState/Note: the frozen project-state.schema.json
// (STATE-01) leaves `clips`/`tracks`/`devices` as open objects ("element shape
// tightened in Phase 3") — there is no concrete `Note` type in gen/. diff-logic
// therefore defines its OWN working `Note` + `RawState` view (the concrete shape
// the diff operates on). Phase 3's note-shape tightening will reconcile against
// this; the schema stays pristine. The bw-diff command reads two JSON files and
// passes them here — fields the files happen to carry that diff-logic doesn't
// touch are preserved verbatim by applyDiff (structural spread).

/**
 * A single MIDI note. `key` is the stable identity used for set comparison
 * (added/removed/changed). Phase 3 tightens this against the clip note shape.
 */
export interface Note {
  /** Stable identity for set operations (e.g. a STATE-04 fingerprint or index key). */
  key: string;
  /** MIDI pitch (0–127). */
  pitch: number;
  /** Start position in beats. */
  start: number;
  /** Length in beats. */
  length: number;
  /** Velocity (1–127). */
  velocity: number;
}

/**
 * The diff's working view of a raw state. Carries the fields diff-logic touches:
 * `notes` (the notes under comparison), `automation` (a param→value map), and
 * `scopeTrackSids` (tracks in scope). Compatible with the persisted raw-state
 * JSON via structural typing; fields not listed here pass through unchanged.
 */
export interface RawState {
  /** The notes to diff. Defaults to empty when absent. */
  notes?: Note[];
  /**
   * Automation parameter map (param name → value). The raw-state schema reserves
   * `automation` EMPTY in M1 (D-04, maxItems 0 on the array form); diff-logic
   * supports a map form for forward-compat + so synthetic fixtures can exercise
   * the automationTouched report. Empty/absent in real M1 state.
   */
  automation?: Record<string, number>;
  /** Track sids referenced by this state (scope). Defaults to empty when absent. */
  scopeTrackSids?: string[];
  /** Index signature: extra fields pass through applyDiff untouched. */
  [k: string]: unknown;
}

/** A single changed note: its before/after representation. */
export interface NoteChange {
  before: Note;
  after: Note;
}

/** The result of {@link computeStateDiff}. */
export interface StateDiff {
  /** Notes present in b but not a. */
  notesAdded: Note[];
  /** Notes present in a but not b. */
  notesRemoved: Note[];
  /** Notes with the same key but different content (velocity/pitch/start/length). */
  notesChanged: NoteChange[];
  /** Automation parameter names whose values differ between a and b (informational). */
  automationTouched: string[];
  /** Union of track sids referenced by either side (the scope of the diff). */
  scopeTrackSids: string[];
}

/** True when two notes have identical content (key already guaranteed equal by caller). */
function noteContentEqual(x: Note, y: Note): boolean {
  return (
    x.pitch === y.pitch &&
    x.start === y.start &&
    x.length === y.length &&
    x.velocity === y.velocity
  );
}

/** Index a notes array by key (last write wins on duplicate keys). */
function indexByKey(notes: Note[] | undefined): Map<string, Note> {
  const m = new Map<string, Note>();
  for (const n of notes ?? []) m.set(n.key, n);
  return m;
}

/**
 * Compute a read-only state-vs-state diff between two raw states.
 *
 * @param a - the "before" raw state.
 * @param b - the "after" raw state.
 * @returns the diff (notesAdded/Removed/Changed + automationTouched + scopeTrackSids).
 *
 * @example
 * const diff = computeStateDiff(
 *   { notes: [{ key: "n1", pitch: 60, start: 0, length: 0.5, velocity: 100 }] },
 *   { notes: [{ key: "n1", pitch: 60, start: 0, length: 0.5, velocity: 127 }] },
 * );
 * // diff.notesChanged.length === 1  (velocity 100→127)
 * // diff.notesAdded.length === 0
 */
export function computeStateDiff(a: RawState, b: RawState): StateDiff {
  const aNotes = indexByKey(a.notes);
  const bNotes = indexByKey(b.notes);

  const notesAdded: Note[] = [];
  const notesRemoved: Note[] = [];
  const notesChanged: NoteChange[] = [];

  // Added: in b not a.
  for (const [key, bn] of bNotes) {
    if (!aNotes.has(key)) notesAdded.push(bn);
  }
  // Removed + changed: walk a.
  for (const [key, an] of aNotes) {
    const bn = bNotes.get(key);
    if (bn === undefined) {
      notesRemoved.push(an);
    } else if (!noteContentEqual(an, bn)) {
      notesChanged.push({ before: an, after: bn });
    }
  }

  // Automation touched: param names whose values differ (or are present on only
  // one side). Values coerced to strings for comparison to avoid NaN edge cases.
  const automationTouched: string[] = [];
  const aAuto = a.automation ?? {};
  const bAuto = b.automation ?? {};
  const autoKeys = new Set([...Object.keys(aAuto), ...Object.keys(bAuto)]);
  for (const k of autoKeys) {
    const av = aAuto[k];
    const bv = bAuto[k];
    if (av !== bv) automationTouched.push(k);
  }

  // Scope: union of both sides' track sids (de-duplicated, stable order).
  const seen = new Set<string>();
  const scopeTrackSids: string[] = [];
  for (const sid of [...(a.scopeTrackSids ?? []), ...(b.scopeTrackSids ?? [])]) {
    if (!seen.has(sid)) {
      seen.add(sid);
      scopeTrackSids.push(sid);
    }
  }

  return { notesAdded, notesRemoved, notesChanged, automationTouched, scopeTrackSids };
}

/**
 * Apply a diff to a base raw state, producing the reconstructed state.
 *
 * Notes are reconciled losslessly: removed dropped, changed updated, added
 * appended. Automation/scope pass through from base unchanged (the diff reports
 * them but does not encode after-values; M4 formalizes automation diffs). Extra
 * base fields pass through untouched.
 *
 * @param base - the starting raw state.
 * @param diff - a diff produced by {@link computeStateDiff}.
 * @returns a new raw state with the diff applied (base is NOT mutated).
 *
 * @example
 * const diff = computeStateDiff(a, b);
 * const reconstructed = applyDiff(a, diff);
 * // computeStateDiff(reconstructed, b).notesAdded.length === 0 (lossless)
 */
export function applyDiff(base: RawState, diff: StateDiff): RawState {
  const removed = new Set(diff.notesRemoved.map((n) => n.key));
  const changedByKey = new Map(diff.notesChanged.map((c) => [c.after.key, c.after]));

  // Start from base's surviving notes: drop removed, update changed.
  const out: Note[] = [];
  for (const n of base.notes ?? []) {
    if (removed.has(n.key)) continue;
    out.push(changedByKey.get(n.key) ?? n);
  }
  // Append added notes.
  for (const n of diff.notesAdded) out.push(n);

  // Structural spread preserves any extra base fields diff-logic doesn't touch.
  return { ...base, notes: out };
}
