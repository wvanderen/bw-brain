// daemon/src/transforms/device-review-render.ts
//
// Phase 5 Plan 05-09 Task 2 — CLAP device-review bounded-text render (UX-04 /
// SC#2 / SC#5 / D-05-11). Adapts the arrangement-review-render layout
// (04.3-02) into bounded conversation.chunk texts: every emitted string is
// ≤512 chars (the frozen ConversationChunk text bound) and groups render in
// order — Chain / Parameter targets (ranked, sparkline) / Macro-XY
// opportunities / Assumptions + propose-via hint.
//
// ADVISORY INVARIANT (T-05-24, extends T-04.3-06): this module renders
// OBSERVATIONS ONLY. It carries NO patchId, NO operations[], NO risk field.
// Escalation to mutation stays on the explicit preview → proposal →
// approval → controller apply.patch spine; automation proposals ride the
// EXISTING proposal/approval drawer path with zero changes (RB-04).
//
// RANKED-LIST DUTY (SC#2, D-05-11): the drawer never shows a single
// unexplained best target — the ranked parameter list renders every entry
// the bounded cap admits, and every macro opportunity carries its
// next-ranked alternative. Empty dimensions render explicit honest
// placeholders.
//
// FRESHNESS HONESTY (Pitfall 5): every group closes with an assumptions
// line carrying the pulledAt value of the evidence it rendered. A null
// pulledAt renders an explicit NO SALIENCE SNAPSHOT marker — never a
// fabricated timestamp and never silent omission.
//
// PURE module: no fs/net imports, no Pi/session imports, no patch-module
// imports, no peer-runtime imports. Snapshot loading + chain pulling stay at
// the wiring layer (boot.ts); the dispatcher (action-dispatch.ts) assigns
// sequence numbers — this module only produces ordered chunk texts.

import type { DeviceReviewEvidence } from "../query/query-server.js";
import type { MacroSuggestion } from "./macro-suggest.js";

/** Hard cap per rendered chunk — mirrors ConversationChunk text maxLength. */
export const MAX_CHUNK_CHARS = 512;

/** The eight unicode block steps 0–1 maps onto (the arrangement precedent). */
const SPARK_STEPS = "▁▂▃▄▅▆▇█";

/** Explicit honesty marker rendered in place of a timestamp when pulledAt is null. */
const NO_SNAPSHOT_MARKER = "NO SALIENCE SNAPSHOT";

/** Bounded-drawer cap on ranked parameter entries (never a lone best — but never unbounded). */
const MAX_PARAM_TARGETS = 8;

/** Map a 0–1 salience value onto a two-char block bar (the timeline-bars precedent). */
function salienceBar(value: number): string {
  const step = Math.max(0, Math.min(SPARK_STEPS.length - 1, Math.floor(value * SPARK_STEPS.length)));
  return SPARK_STEPS[step]!.repeat(2);
}

/** The assumptions line every group closes with (pulledAt or the honesty marker). */
function assumptionsLine(pulledAt: string | null): string {
  return pulledAt === null
    ? `assumptions: ${NO_SNAPSHOT_MARKER} (no pulledAt) — turn a device knob and request a review with refresh to build parameter salience evidence`
    : `assumptions: derived from salience snapshot pulled at ${pulledAt}`;
}

/** Defensive read of one chain device (the 05-03 DeviceView wire shape, open-typed). */
interface ChainDevice {
  name?: string;
  deviceSid?: string;
  isPlugin?: boolean;
  position?: number;
}

function readChainDevice(entry: unknown): ChainDevice {
  if (entry === null || typeof entry !== "object") return {};
  const record = entry as Record<string, unknown>;
  return {
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(typeof record.deviceSid === "string" ? { deviceSid: record.deviceSid } : {}),
    ...(typeof record.isPlugin === "boolean" ? { isPlugin: record.isPlugin } : {}),
    ...(typeof record.position === "number" ? { position: record.position } : {}),
  };
}

/** Human-first identity: the name when known, else the stable key (macro-suggest precedent). */
function paramIdentity(entry: DeviceReviewEvidence["salience"][number]): string {
  return entry.paramName !== undefined && entry.paramName.length > 0 ? entry.paramName : entry.paramKey;
}

/** Deterministic ranking: salience desc, remote_page first on ties, key asc (the D-05-03 discipline). */
function compareBySalience(a: DeviceReviewEvidence["salience"][number], b: DeviceReviewEvidence["salience"][number]): number {
  if (b.salience !== a.salience) return b.salience - a.salience;
  const aMacro = a.source === "remote_page" ? 1 : 0;
  const bMacro = b.source === "remote_page" ? 1 : 0;
  if (aMacro !== bMacro) return bMacro - aMacro;
  return a.paramKey < b.paramKey ? -1 : a.paramKey > b.paramKey ? 1 : 0;
}

/** Human-first identity for a macro param ref (name when known, else key). */
function macroParamIdentity(ref: MacroSuggestion["params"][number]): string {
  return ref.paramName !== undefined && ref.paramName.length > 0 ? ref.paramName : ref.paramKey;
}

/**
 * Build the four ordered groups as line arrays. Each group's final line is
 * the pulledAt assumptions line (the arrangement-review discipline).
 */
function buildGroups(evidence: DeviceReviewEvidence): string[][] {
  const pulled = assumptionsLine(evidence.pulledAt);

  // --- Group 1: Chain (native/VST markers via isPlugin — the 05-03 read) ---
  const chain: string[] = [`Device chain (${evidence.chain.length} device${evidence.chain.length === 1 ? "" : "s"}):`];
  if (evidence.chain.length === 0) {
    chain.push("  (no chain devices observed — the device-chain read returned none)");
  }
  for (const entry of evidence.chain) {
    const device = readChainDevice(entry);
    const name = device.name !== undefined && device.name.length > 0 ? device.name : (device.deviceSid ?? "unnamed");
    const marker = device.isPlugin === true ? "[VST]" : "[native]";
    const position = typeof device.position === "number" ? `#${device.position}` : "#?";
    const sid = device.deviceSid ?? "no-sid";
    chain.push(`  - ${name} ${marker} (${position}, ${sid})`);
  }
  chain.push(pulled);

  // --- Group 2: Parameter targets (RANKED — never a lone unexplained best) ---
  const targets: string[] = ["Parameter targets (ranked by salience, highest first):"];
  const ranked = [...evidence.salience].sort(compareBySalience).slice(0, MAX_PARAM_TARGETS);
  if (ranked.length === 0) {
    targets.push("  (no parameter movement observed yet — turn a device knob and re-run with refresh)");
  }
  ranked.forEach((entry, index) => {
    targets.push(
      `  ${index + 1}. ${paramIdentity(entry)} ${salienceBar(entry.salience)} salience=${entry.salience.toFixed(2)}` +
        ` movements=${entry.movementCount} range=${entry.valueRange.toFixed(2)} last=${entry.lastValue.toFixed(2)} [${entry.deviceKey}]`,
    );
  });
  targets.push(pulled);

  // --- Group 3: Macro/XY opportunities (ADVISORY — D-05-09/D-05-11) ---
  const macros: string[] = ["Macro / XY opportunities (ADVISORY — wire macros by hand in Bitwig):"];
  if (evidence.macros.length === 0) {
    macros.push("  (no macro opportunities above the evidence threshold — salience movement is too thin to rank confidently)");
  }
  evidence.macros.forEach((suggestion, index) => {
    const identity = suggestion.params.map(macroParamIdentity).join(" ⟷ ");
    macros.push(`  ${index + 1}. [${suggestion.kind}] ${identity}`);
    for (const line of suggestion.evidence) {
      macros.push(`     evidence: ${line.identity} on ${line.device} (${line.movementCount} movements; role/energy: ${line.roleEnergyContext})`);
    }
    for (const alternative of suggestion.alternatives) {
      macros.push(`     alternative: ${alternative.identity} (${alternative.device}, salience ${alternative.salience.toFixed(2)})`);
    }
    const claims = suggestion.assumptions.map((a) => a.claim).join("; ");
    if (claims.length > 0) macros.push(`     assumptions: ${claims}`);
    macros.push(`     hint: ${suggestion.manualHint}`);
  });
  macros.push(pulled);

  // --- Group 4: Assumptions + propose-via hint (RB-04: the existing drawer
  //     renders automation proposals — this review never mutates anything). ---
  const assumptions: string[] = ["Assumptions:"];
  if (evidence.assumptions.length === 0) {
    assumptions.push("  - (none declared)");
  }
  for (const assumption of evidence.assumptions) assumptions.push(`  - ${assumption.claim}`);
  assumptions.push(
    "Proposals: this review is ADVISORY — propose automation via `bw-automation propose` (CLI) or the assistant; automation proposals render in the existing approval drawer.",
  );
  assumptions.push(pulled);

  return [chain, targets, macros, assumptions];
}

/**
 * Pack a group's lines into contiguous chunks, each ≤{@link MAX_CHUNK_CHARS}.
 * Splits happen at LINE boundaries; only a single line longer than the cap is
 * hard-cut at the cap (documented exception — bounded output wins). Copied
 * verbatim from arrangement-review-render.ts (the 04.3-02 precedent).
 */
function chunkGroup(lines: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  const flush = (): void => {
    if (current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      length = 0;
    }
  };
  for (const original of lines) {
    let line = original;
    while (line.length > MAX_CHUNK_CHARS) {
      flush();
      chunks.push(line.slice(0, MAX_CHUNK_CHARS));
      line = line.slice(MAX_CHUNK_CHARS);
    }
    if (line.length === 0) continue;
    const separator = current.length > 0 ? 1 : 0;
    if (length + separator + line.length > MAX_CHUNK_CHARS) flush();
    current.push(line);
    length += (current.length > 1 ? 1 : 0) + line.length;
  }
  flush();
  return chunks;
}

/**
 * Render the device-review evidence (chain + ranked salience + macros) into
 * ordered chunk texts for conversation.chunk emission. Pure and
 * deterministic: identical input → identical output. The dispatcher assigns
 * sequence numbers.
 *
 * @example
 * const texts = renderDeviceReview(evidence); // string[] each ≤512
 */
export function renderDeviceReview(evidence: DeviceReviewEvidence): string[] {
  return buildGroups(evidence).flatMap((group) => chunkGroup(group));
}

/**
 * The honest no-snapshot hint (dispatched as a single bounded chunk when the
 * daemon has no salience snapshot): names the remedy, fabricates nothing.
 */
export function renderDeviceReviewHint(): string {
  return "No salience snapshot loaded — turn a device knob, then request a device review with refresh enabled to build parameter salience evidence.";
}
