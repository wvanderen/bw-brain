// daemon/src/transforms/motif-signature.ts
//
// MIDI-01 motif signature (pitch-class profile + inter-onset-interval rhythm
// histogram + density) + similarity. Adapted from librosa's chroma concept but
// MIDI-trivial (each note's pitch is known — no STFT). The signature supports
// the preserve-motif-identity check (creative transforms, D-10), similarity
// scoring (the belowBarCandidate near-miss, D-08), and region-scoped
// computation (D-11).
//
// Plugs into analyzer-registry.ts D-08 framework (produces "motifs") as the
// FIRST analyzer addition (M1 -> M2). Caching is EPHEMERAL (recompute per
// transform invocation); durable motif identity waits for ARRANGE-05 track
// roles (P4).
//
// PURE module: no fs/net imports. Mirrors diff-logic.ts discipline (documented
// interfaces, @example, NO side effects). Consumes Note from diff-logic (does
// NOT redefine it — canonical shape).

import type { Note } from "../cli/diff-logic.js";
import type {
  Analyzer,
  AnalyzeContext,
  DerivedField,
  RawState,
} from "../state/analyzer-registry.js";

/**
 * A motif signature: a compact, comparable fingerprint of a note set.
 *
 * - `pcp`: 12-bin pitch-class profile (C-indexed), weighted by velocity ×
 *   length, normalized to sum ~1.0. Captures the harmonic/color identity.
 * - `rhythm`: 5-bucket inter-onset-interval histogram (bucket edges
 *   [0.25, 0.5, 1.0, 2.0] beats), normalized to sum ~1.0. Captures rhythmic
 *   identity.
 * - `density`: notes-per-beat density. Captures texture density.
 *
 * INV-6: every field is FINITE for any input (empty/single-note clips do not
 * NaN — divide-by-zero is guarded).
 */
export interface MotifSignature {
  /** 12-bin normalized pitch-class profile (weighted by velocity × length). */
  pcp: number[];
  /** 5-bucket inter-onset-interval histogram (normalized). */
  rhythm: number[];
  /** Notes-per-beat density. */
  density: number;
}

/** IOI bucket edges in beats; 5 buckets result from 4 edges. */
const IOI_BUCKETS = [0.25, 0.5, 1.0, 2.0];

/**
 * Compute the motif signature of a note set. Pure (never mutates `notes`).
 *
 * @param notes - the clip notes (any order; sorted internally by start).
 * @param regionBeats - OPTIONAL region {start, end} in beats (D-11). When
 *   provided, `rhythm` + `density` are computed over notes whose start is in
 *   [start, end); `pcp` additionally includes 1 beat of context on each side
 *   ([start-1, end+1)) for harmonic continuity. Omit for whole-clip.
 * @returns the signature (pcp[12], rhythm[5], density). Always finite fields.
 *
 * @example
 * const sig = motifSignature([
 *   { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.5, velocity: 100 },
 * ]);
 * // sig.pcp[0] > 0 (C weighted); sig.density finite; no NaN anywhere.
 */
export function motifSignature(
  notes: Note[],
  regionBeats?: { start: number; end: number },
): MotifSignature {
  // --- PCP: velocity × length weighted, 12-bin, with region context. ---
  const pcpNotes = regionBeats
    ? notes.filter((n) => n.start >= regionBeats.start - 1 && n.start < regionBeats.end + 1)
    : notes;
  const pcpRaw = new Array(12).fill(0);
  for (const n of pcpNotes) {
    pcpRaw[n.pitch % 12] += n.velocity * n.length; // salience = loud × long
  }
  const pcpSum = pcpRaw.reduce((a, b) => a + b, 0) || 1; // divide-by-zero guard (INV-6)
  const pcp = pcpRaw.map((v) => v / pcpSum);

  // --- Rhythm: IOI histogram over notes strictly in [start, end). ---
  const rhythmNotes = regionBeats
    ? notes.filter((n) => n.start >= regionBeats.start && n.start < regionBeats.end)
    : notes;
  const sorted = [...rhythmNotes].sort((a, b) => a.start - b.start);
  const rhythmRaw = new Array(5).fill(0);
  for (let i = 1; i < sorted.length; i++) {
    const ioi = sorted[i].start - sorted[i - 1].start;
    const bucket =
      ioi <= IOI_BUCKETS[0] ? 0
      : ioi <= IOI_BUCKETS[1] ? 1
      : ioi <= IOI_BUCKETS[2] ? 2
      : ioi <= IOI_BUCKETS[3] ? 3
      : 4;
    rhythmRaw[bucket]++;
  }
  const rhythmSum = rhythmRaw.reduce((a, b) => a + b, 0) || 1; // guard (INV-6)
  const rhythm = rhythmRaw.map((v) => v / rhythmSum);

  // --- Density: notes / span (over the in-region set). ---
  const span = sorted.length > 1 ? sorted[sorted.length - 1].start - sorted[0].start : 1;
  const density = rhythmNotes.length / Math.max(span, 0.25);

  return { pcp, rhythm, density };
}

/**
 * Motif similarity ∈ [0, 1]. `0.6·cosine(PCP)` + `0.4·histogramIntersection(rhythm)`.
 *
 * - cosine ∈ [-1, 1] is remapped to [0, 1] via `(cos + 1) / 2` so the PCP
 *   component is non-negative.
 * - histogramIntersection ∈ [0, 1] (sum of per-bucket minima of two
 *   normalized histograms).
 *
 * INV-6: `motifSimilarity(sig, sig) === 1.0` (within float epsilon); symmetric
 * `sim(a, b) === sim(b, a)`; finite for any inputs (zero-magnitude vectors
 * yield cosine 0, not NaN).
 *
 * Pure.
 *
 * @example
 * const a = motifSignature(notesA);
 * const b = motifSignature(notesB);
 * motifSimilarity(a, b); // 0.0..1.0
 */
export function motifSimilarity(a: MotifSignature, b: MotifSignature): number {
  const cos = cosine(a.pcp, b.pcp); // ∈ [-1, 1]
  const pcpSim = (cos + 1) / 2; // ∈ [0, 1]
  const rhythmSim = histogramIntersection(a.rhythm, b.rhythm); // ∈ [0, 1]
  return 0.6 * pcpSim + 0.4 * rhythmSim;
}

/** Cosine similarity. Returns 0 (not NaN) when either vector has zero magnitude. */
function cosine(u: number[], v: number[]): number {
  let dot = 0;
  let magU = 0;
  let magV = 0;
  for (let i = 0; i < u.length; i++) {
    dot += u[i] * v[i];
    magU += u[i] ** 2;
    magV += v[i] ** 2;
  }
  const denom = Math.sqrt(magU) * Math.sqrt(magV);
  return denom === 0 ? 0 : dot / denom;
}

/** Histogram intersection: sum of per-bin minima. ∈ [0, 1] for normalized inputs. */
function histogramIntersection(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.min(a[i], b[i]);
  return sum;
}

/**
 * D-08 analyzer-plugin: motif signature. id "motifs", consumes ["clips"],
 * produces ["motifs"]. Pure (never mutates raw).
 *
 * The analyzer defensively extracts clip notes from `raw.clips` (the
 * ProjectState clips array, which may carry Note-shaped entries — the same
 * fallback convention the daemon's midi-inspect path uses). When no clip
 * notes are available, it REFUSES (returns [] — no guess, consistent with the
 * "below-threshold = refuse rather than guess" stance). The signature function
 * itself is exercised exhaustively by motif-signature.test.ts.
 *
 * Caching is EPHEMERAL — this analyzer recomputes per invocation; durable
 * motif identity waits for ARRANGE-05 track roles (P4).
 */
export const MotifSignatureAnalyzer: Analyzer = {
  id: "motifs",
  consumes: ["clips"],
  produces: ["motifs"],
  analyze(raw: RawState, _ctx: AnalyzeContext): DerivedField[] {
    const notes = extractNotes(raw);
    if (notes.length === 0) return []; // refuse — no clip notes, no guess
    const signature = motifSignature(notes);
    return [
      {
        field: "motifs",
        value: signature,
        confidence: 1.0,
        assumptions: [
          {
            claim: "motif signature computed from clip notes (PCP + IOI + density)",
            confidence: 1.0,
            source: "default",
          },
        ],
      },
    ];
  },
};

/**
 * Defensively extract Note-shaped entries from raw.clips. The ProjectState
 * clips field is open-typed ({}[]); midi-inspect treats it as a Note[]
 * fallback. Here we coerce items that carry the Note identity fields
 * (pitch/start/length/velocity). Items lacking them are skipped.
 */
function extractNotes(raw: RawState): Note[] {
  const clips = (raw as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) return [];
  const out: Note[] = [];
  for (const c of clips) {
    if (
      c !== null &&
      typeof c === "object" &&
      typeof (c as Note).pitch === "number" &&
      typeof (c as Note).start === "number" &&
      typeof (c as Note).length === "number" &&
      typeof (c as Note).velocity === "number"
    ) {
      const n = c as Note;
      out.push({
        key: typeof n.key === "string" ? n.key : `n:${n.pitch}:${n.start.toFixed(4)}`,
        pitch: n.pitch,
        start: n.start,
        length: n.length,
        velocity: n.velocity,
      });
    }
  }
  return out;
}
