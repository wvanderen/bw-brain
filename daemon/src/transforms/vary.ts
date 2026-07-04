// daemon/src/transforms/vary.ts
//
// MIDI-02 vary — A/B/C motif-preserving variants (creative tier, D-08/D-09).
//
// Emits three variants of the source motif:
//   A — rhythmic displacement: ~20% of notes shifted ±1/16 beat.
//   B — interval contraction:  each in-scale note moved one degree toward the
//       tonic (requires a harmonic center; skipped — identity variant — when
//       harmonic is absent).
//   C — octave overlay:        low-velocity octave-below doublings at strong
//       beats.
//
// INV-7 (creative gate): each candidate is EITHER motifSimilarity>=threshold
//   OR status:"refused" — NO THIRD STATE (a below-bar candidate that applied
//   silently is a bug).
// INV-10 (audit-trail floor, vary-side half): the refused branch stamps
//   risk:"high" at BIRTH (RESEARCH.md:880 + D-09). The daemon-side re-validation
//   via classifyRisk({belowBar: status==="refused"}) lands in Task 2
//   (handleMidiVary) — defense-in-depth so patch-history.jsonl can never record
//   a below-bar candidate as medium.
// INV-11 (below-bar default refuses): a refused candidate carries status:"refused"
//   + the near-miss score; applying requires --allow-below-bar AND --confirm
//   (enforced at the apply path, Plan 02).
// Pitfall 1: exactly-at-threshold ACCEPTS (>=, not >).
// Pitfall 2: pitch changes fall out of diffToOps naturally as remove+add pairs
//   (a changed pitch yields a different key → set semantics → remove+add).
//
// PURE module: no fs/net. The candidate-store mint happens in the daemon
// dispatch (Task 2 handleMidiVary), NOT here. vary self-declares risk (D-07);
// the daemon re-validates via classifyRisk before minting.

import type { Note } from "../cli/diff-logic.js";
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import { noteKey } from "../patch/inverse-ops.js";
import type { RiskClass } from "../patch/risk-classifier.js";
import type { Profile } from "../gen/profile.js";
import { motifSignature, motifSimilarity } from "./motif-signature.js";
import { materializeScale, type HarmonicDetection } from "./harmonic-detect.js";
import { Note as TonalNote } from "tonal";

/** Optional region window (D-11) + optional harmonic center (D-12). */
export type Region = { start: number; end: number };
export type Harmonic = { key: string; mode: "major" | "minor" };

/**
 * A single vary candidate. The `status` field is ABSENT on accepted candidates
 * and `"refused"` on below-bar candidates (INV-7 — exactly two states).
 *
 * `risk` is widened from the literal "medium" so the refused branch can carry
 * "high" (D-09/INV-10 — a below-bar override RECLASSIFIES as high at birth).
 */
export interface VaryCandidate {
  label: "A" | "B" | "C";
  description: string;
  /** Primitive ops encoding the variant diff (empty when refused). */
  operations: PrimitiveOp[];
  /** Self-declared risk: "medium" accepted / "high" refused (D-07/D-09). */
  risk: RiskClass;
  /** The motif-similarity score ∈ [0,1] (the near-miss score when refused). */
  motifSimilarity: number;
  /** Present (="refused") ONLY on below-bar candidates. Absent on accepted. */
  status?: "refused";
}

/** The 1/16-beat grid step used by rhythmic displacement (0.0625 beats). */
const SIXTEENTH = 1 / 16;

/**
 * Generate three motif-preserving A/B/C variants of `source`. Pure.
 *
 * @param source   - the clip notes (any order; filtered to `region` internally).
 * @param region   - OPTIONAL {start,end} beats window (D-11). Whole clip when
 *                   undefined.
 * @param profile  - the genre profile (provides thresholds.vary + strongBeatGrid).
 * @param harmonic - OPTIONAL harmonic center (D-12). When present, variant B
 *                   performs in-scale interval contraction; when absent, B is an
 *                   identity variant (the contraction is skipped, not guessed).
 * @returns three candidates labelled A, B, C. Each is either accepted
 *          (operations non-empty, risk "medium") or refused (operations empty,
 *          risk "high", status "refused").
 */
export function vary(
  source: Note[],
  region: Region | undefined,
  profile: Profile,
  harmonic: Harmonic | undefined,
): VaryCandidate[] {
  const src = filterRegion(source, region);
  const sourceSig = motifSignature(src);
  const threshold = profile.thresholds.vary;
  const strongBeats = profile.strongBeatGrid ?? [0, 1, 2, 3];

  const a = rhythmicDisplacement(src);
  const b = harmonic ? intervalContraction(src, harmonic) : src;
  const c = octaveOverlay(src, strongBeats);

  return [
    mkCandidate("A", "rhythmic displacement (~20% shifted ±1/16)", src, a, threshold),
    mkCandidate(
      "B",
      harmonic ? "interval contraction (one scale-degree toward tonic)" : "interval contraction (skipped — no harmonic center)",
      src,
      b,
      threshold,
    ),
    mkCandidate("C", "octave overlay (low-velocity doublings at strong beats)", src, c, threshold),
  ];
}

/** Filter `source` to notes whose start is in [region.start, region.end). Whole clip when region absent. */
function filterRegion(source: Note[], region: Region | undefined): Note[] {
  if (!region) return [...source];
  return source.filter((n) => n.start >= region.start && n.start < region.end);
}

/**
 * Build a candidate: compute the variant's motif similarity vs the source and
 * ACCEPT (risk "medium", diff ops) when sim >= threshold, or REFUSE (risk
 * "high", empty ops, status "refused") otherwise. The refused branch stamps
 * risk:"high" at BIRTH (D-09/INV-10 — the below-bar audit-trail floor).
 *
 * Pitfall 1: uses `>=` so exactly-at-threshold ACCEPTS.
 */
function mkCandidate(
  label: "A" | "B" | "C",
  description: string,
  source: Note[],
  variant: Note[],
  threshold: number,
): VaryCandidate {
  const sim = motifSimilarity(sourceSig(source), motifSignature(variant));
  if (sim >= threshold) {
    return {
      label,
      description,
      operations: diffToOps(source, variant),
      risk: "medium",
      motifSimilarity: sim,
    };
  }
  // D-08 refuse + tag (INV-11); D-09 belowBar → risk "high" at BIRTH (INV-10).
  return {
    label,
    description,
    operations: [],
    risk: "high",
    motifSimilarity: sim,
    status: "refused",
  };
}

/** Memo-free source-sig helper (kept tiny so mkCandidate reads cleanly). */
function sourceSig(source: Note[]): ReturnType<typeof motifSignature> {
  return motifSignature(source);
}

/**
 * Variant A — rhythmic displacement. Shift ~20% of notes (every 5th, by index)
 * forward by one 1/16-beat grid step. Deterministic + pure.
 *
 * The shifted notes' starts change → their keys change (start IS identity) →
 * diffToOps emits remove_note(old)+add_note(new) pairs (Pitfall 2-correct).
 *
 * Boundary guard (live finding, 2026-06-30): the clip has a finite grid (bridge
 * `gridWidth` columns ↔ `loopBeats`). A note near the clip end, displaced
 * forward, would land past the boundary → the bridge's `getStep` rejects it →
 * apply.patch records a partial failure → the patch is NOT journaled → revert
 * can't find it. So derive the effective clip end from the source notes (the
 * last note's start is the closest proxy for `loopBeats` the pure transform
 * has) and SKIP displacing any note whose shifted start would exceed it. This
 * keeps every emitted op in-grid, so apply is clean + journaled + revertable.
 */
function rhythmicDisplacement(src: Note[]): Note[] {
  const maxStart = src.reduce((m, n) => (n.start > m ? n.start : m), 0);
  return src.map((n, i) => {
    if (i % 5 !== 0) return n; // ~20% of notes
    const shifted = n.start + SIXTEENTH;
    if (shifted > maxStart) return n; // boundary guard — would overflow the clip grid
    return { ...n, start: shifted, key: noteKey(n.pitch, shifted) };
  });
}

/**
 * Variant B — interval contraction. Move each in-scale note one degree toward
 * the tonic (index - 1, clamped at 0). Out-of-scale notes are left unchanged.
 * The new pitch is chosen in the same octave register as the original (nearest
 * pitch with the target pitch class). Deterministic + pure.
 *
 * Pitch changes → key changes → diffToOps emits remove+add (Pitfall 2). A
 * contraction whose target key would collide with another variant note is
 * skipped for that note (keeps the variant set well-formed).
 */
function intervalContraction(src: Note[], harmonic: Harmonic): Note[] {
  const det: HarmonicDetection = { key: harmonic.key, mode: harmonic.mode, confidence: 1.0 };
  const scalePcs = materializeScale(det).map((name) => TonalNote.chroma(name)); // e.g. [0,2,4,5,7,9,11]
  const existingKeys = new Set(src.map((n) => n.key));
  return src.map((n) => {
    const pc = ((n.pitch % 12) + 12) % 12;
    const idx = scalePcs.indexOf(pc);
    if (idx <= 0) return n; // tonic or out-of-scale — leave unchanged
    const targetPc = scalePcs[idx - 1];
    // Pick the nearest pitch with the target pc in the same octave register.
    const octaveBase = n.pitch - pc;
    const candidates = [octaveBase + targetPc, octaveBase + targetPc - 12, octaveBase + targetPc + 12];
    const target = candidates
      .filter((p) => p >= 0 && p <= 127)
      .reduce((best, p) => (Math.abs(p - n.pitch) < Math.abs(best - n.pitch) ? p : best));
    const key = noteKey(target, n.start);
    if (key === n.key || existingKeys.has(key)) return n; // no-op or collision — skip
    return { ...n, pitch: target, key };
  });
}

/**
 * Variant C — octave overlay. At each strong-beat source note, add a
 * low-velocity octave-below doubling (pitch - 12, velocity halved). The
 * original notes are retained; doublings are ADDITIONS. Deterministic + pure.
 *
 * Added notes have new keys → diffToOps emits add_note ops. The added octave
 * shares the source pitch class so PCP similarity stays high (the motif's
 * harmonic color is preserved — the whole point of an "overlay").
 */
function octaveOverlay(src: Note[], strongBeats: number[]): Note[] {
  const out: Note[] = [...src];
  const existingKeys = new Set(src.map((n) => n.key));
  for (const n of src) {
    const beat = Math.floor(n.start) % 4; // beat-within-bar position
    if (!strongBeats.includes(beat)) continue;
    const pitch = n.pitch - 12;
    if (pitch < 0) continue; // below MIDI range
    const key = noteKey(pitch, n.start);
    if (existingKeys.has(key)) continue; // already present
    existingKeys.add(key);
    out.push({ pitch, start: n.start, length: n.length, velocity: Math.max(1, Math.floor(n.velocity / 2)), key });
  }
  return out;
}

/**
 * Derive a PrimitiveOp[] from a before/after Note[] pair (set semantics).
 * - added   → add_note
 * - removed → remove_note
 * - changed (same key, differing velocity/length) → update_note_field
 *
 * Pitfall 2: a pitch or start change yields a DIFFERENT key → the note lands in
 * the added/removed buckets (remove+add), NEVER in the changed bucket. So every
 * emitted update_note_field has before.key === after.key by construction.
 *
 * Mirrors daemon/src/patch/arb.ts diffToOps (kept local here so the production
 * transform does not import a test-only module).
 */
function diffToOps(before: Note[], after: Note[]): PrimitiveOp[] {
  const beforeByKey = new Map(before.map((n) => [n.key, n]));
  const afterByKey = new Map(after.map((n) => [n.key, n]));
  const ops: PrimitiveOp[] = [];
  // removes: in before not after.
  for (const [key, n] of beforeByKey) {
    if (!afterByKey.has(key)) ops.push({ op: "remove_note", note: n });
  }
  // updates: in both, content differs (key identical → identity-stable, Pitfall 2).
  for (const [key, bn] of beforeByKey) {
    const an = afterByKey.get(key);
    if (an && (an.velocity !== bn.velocity || an.length !== bn.length || an.pitch !== bn.pitch || an.start !== bn.start)) {
      ops.push({ op: "update_note_field", before: bn, after: an });
    }
  }
  // adds: in after not before.
  for (const [key, n] of afterByKey) {
    if (!beforeByKey.has(key)) ops.push({ op: "add_note", note: n });
  }
  return ops;
}
