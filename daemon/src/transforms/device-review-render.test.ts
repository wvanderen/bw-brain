// daemon/src/transforms/device-review-render.test.ts
//
// Phase 5 Plan 05-09 Task 2 — tests for the CLAP device-review bounded-text
// render (UX-04 / SC#2 / SC#5 / D-05-11). The module adapts the
// arrangement-review-render layout (04.3-02) into bounded conversation.chunk
// texts: every emitted string is ≤512 chars and groups render in order —
// Chain / Parameter targets (ranked, sparkline) / Macro-XY opportunities /
// Assumptions + propose-via hint.
//
// Invariants under test (plan behavior list 1-3 + T-05-24):
//   - every chunk ≤512; oversized groups split at LINE boundaries
//   - the parameter list is RANKED with ≥ 2 entries when evidence carries
//     ≥ 2 params (SC#2 anti-pattern guard — never a lone unexplained best)
//   - ranked entries carry sparkline/block salience chars (visual scanability)
//   - macro opportunities carry an alternative each + assumptions + hint
//   - every group closes with the pulledAt assumptions line; null pulledAt
//     renders the explicit NO SALIENCE SNAPSHOT marker (never fabricated)
//   - ADVISORY PURITY (T-05-24): no ../patch/* imports; stringified
//     inputs/outputs contain no patchId/operations/risk tokens

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeviceReviewEvidence } from "../query/query-server.js";
import {
  MAX_CHUNK_CHARS,
  renderDeviceReview,
  renderDeviceReviewHint,
} from "./device-review-render.js";

const MODULE_PATH = dirname(fileURLToPath(import.meta.url));
const PULLED_AT = "2026-08-22T12:00:00.000Z";

const param = (overrides: Partial<DeviceReviewEvidence["salience"][number]>): DeviceReviewEvidence["salience"][number] => ({
  paramKey: "dev_aaaaaaaaaaaaaaa1:device_parameter:3",
  deviceKey: "dev_aaaaaaaaaaaaaaa1",
  paramIndex: 3,
  paramName: "Filter Cutoff",
  source: "device_parameter",
  movementCount: 42,
  valueRange: 0.31,
  lastValue: 0.62,
  salience: 0.83,
  ...overrides,
});

const populatedEvidence = (): DeviceReviewEvidence => ({
  chain: [
    { deviceSid: "dev_aaaaaaaaaaaaaaa1", name: "Polymer", isPlugin: false, position: 0 },
    { deviceSid: "dev_bbbbbbbbbbbbbbb2", name: "Surge XT", isPlugin: true, position: 1 },
  ],
  salience: [
    param({ salience: 0.83 }),
    param({ paramKey: "dev_bbbbbbbbbbbbbbb2:remote_page:0", deviceKey: "dev_bbbbbbbbbbbbbbb2", paramIndex: 0, paramName: "Macro 1", source: "remote_page", movementCount: 12, valueRange: 0.5, lastValue: 0.25, salience: 0.64 }),
    param({ paramKey: "dev_aaaaaaaaaaaaaaa1:device_parameter:7", paramIndex: 7, paramName: "Resonance", movementCount: 3, valueRange: 0.1, lastValue: 0.1, salience: 0.21 }),
  ],
  macros: [
    {
      kind: "macro",
      params: [{ paramKey: "dev_aaaaaaaaaaaaaaa1:device_parameter:3", paramName: "Filter Cutoff", deviceKey: "dev_aaaaaaaaaaaaaaa1", source: "device_parameter", movementCount: 42, salience: 0.83 }],
      evidence: [{ identity: "Filter Cutoff", device: "dev_aaaaaaaaaaaaaaa1", movementCount: 42, roleEnergyContext: "role salience 0.50 (default prior)" }],
      assumptions: [{ claim: "single-param macro on the highest-salience device parameter", confidence: 1.0, source: "default" }],
      alternatives: [{ identity: "Macro 1", device: "dev_bbbbbbbbbbbbbbb2", salience: 0.64 }],
      manualHint: "map a macro knob to Filter Cutoff on Polymer",
    },
  ],
  pulledAt: PULLED_AT,
  assumptions: [{ claim: `derived from salience snapshot pulled at ${PULLED_AT}`, confidence: 1.0, source: "default" }],
});

describe("renderDeviceReview (05-09 bounded text render)", () => {
  it("renders Chain → Parameter targets → Macro/XY → Assumptions groups, each ≤512 with pulledAt on every group", () => {
    const chunks = renderDeviceReview(populatedEvidence());
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    const joined = chunks.join("\n");
    const chain = joined.indexOf("Device chain (2 devices):");
    const targets = joined.indexOf("Parameter targets (ranked by salience");
    const macros = joined.indexOf("Macro / XY opportunities");
    const assumptions = joined.indexOf("Assumptions:");
    expect(chain).toBeGreaterThanOrEqual(0);
    expect(targets).toBeGreaterThan(chain);
    expect(macros).toBeGreaterThan(targets);
    expect(assumptions).toBeGreaterThan(macros);
    // Every group closes with the pulledAt assumptions line (Pitfall 5 honesty).
    expect(joined.split(PULLED_AT).length - 1).toBeGreaterThanOrEqual(4);
  });

  it("renders the chain with native/VST markers via isPlugin", () => {
    const joined = renderDeviceReview(populatedEvidence()).join("\n");
    expect(joined).toContain("Polymer [native]");
    expect(joined).toContain("Surge XT [VST]");
  });

  it("renders a RANKED parameter list with ≥2 entries — never a lone unexplained best (SC#2)", () => {
    const joined = renderDeviceReview(populatedEvidence()).join("\n");
    const ranked = joined.split("\n").filter((l) => /^\s+\d+\.\s.+\s[▁▂▃▄▅▆▇█]{2}\s+salience=/.test(l));
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    // Ranked highest first: 0.83 before 0.64 before 0.21.
    const saliences = ranked.map((l) => Number(/salience=([\d.]+)/.exec(l)![1]));
    expect(saliences).toEqual([...saliences].sort((a, b) => b - a));
    // Evidence lines: movements + range travel with every ranked entry.
    expect(ranked[0]).toContain("movements=42");
    expect(ranked[0]).toContain("range=0.31");
  });

  it("re-ranks defensively when the caller supplies unsorted evidence (never trusts order)", () => {
    const evidence = populatedEvidence();
    evidence.salience = [...evidence.salience].reverse();
    const joined = renderDeviceReview(evidence).join("\n");
    const saliences = joined
      .split("\n")
      .filter((l) => /^\s+\d+\.\s.+\s[▁▂▃▄▅▆▇█]{2}\s+salience=/.test(l))
      .map((l) => Number(/salience=([\d.]+)/.exec(l)![1]));
    expect(saliences[0]).toBe(0.83);
  });

  it("maps salience 0-1 onto the eight unicode block steps (visual scanability)", () => {
    const joined = renderDeviceReview(populatedEvidence()).join("\n");
    const ranked = joined.split("\n").filter((l) => /^\s+\d+\.\s.+\s[▁▂▃▄▅▆▇█]{2}\s+salience=/.test(l));
    // 0.83 → ▇▇, 0.64 → ▆▆, 0.21 → ▂▂ (two-char bars, the timeline-bars
    // precedent; step = floor(salience × 8) over "▁▂▃▄▅▆▇█").
    expect(ranked[0]).toContain("▇▇");
    expect(ranked[1]).toContain("▆▆");
    expect(ranked[2]).toContain("▂▂");
  });

  it("renders macro opportunities with an alternative, assumptions, and a manual hint (D-05-11)", () => {
    const joined = renderDeviceReview(populatedEvidence()).join("\n");
    expect(joined).toContain("[macro]");
    expect(joined).toContain("Filter Cutoff");
    expect(joined).toMatch(/alternative:.*Macro 1.*0\.64/);
    expect(joined).toContain("map a macro knob to Filter Cutoff on Polymer");
    expect(joined).toContain("single-param macro on the highest-salience device parameter");
  });

  it("carries the propose-via hint (advisory — mutation rides the existing approval drawer)", () => {
    const joined = renderDeviceReview(populatedEvidence()).join("\n");
    expect(joined).toMatch(/bw-automation propose/);
    expect(joined).toMatch(/approval drawer|assistant/);
  });

  it("renders honest placeholders for empty dimensions instead of silently omitting them", () => {
    const evidence = populatedEvidence();
    evidence.chain = [];
    evidence.salience = [];
    evidence.macros = [];
    const joined = renderDeviceReview(evidence).join("\n");
    expect(joined).toMatch(/no chain devices/i);
    expect(joined).toMatch(/no parameter movement observed/i);
    expect(joined).toMatch(/no macro opportunities/i);
  });

  it("renders the explicit NO SALIENCE SNAPSHOT marker when pulledAt is null (never a fabricated timestamp)", () => {
    const evidence = populatedEvidence();
    evidence.pulledAt = null;
    // A null-pulledAt evidence carries the no-snapshot assumption claim
    // (mirrors saliencePulledAtAssumption(null)) — never a stale timestamp.
    evidence.assumptions = [{ claim: "no salience snapshot loaded — move a knob and run `bw-automation inspect --refresh` while connected", confidence: 1.0, source: "default" }];
    const joined = renderDeviceReview(evidence).join("\n");
    expect(joined).toContain("NO SALIENCE SNAPSHOT");
    expect(joined).not.toContain(`pulled at ${PULLED_AT}`);
  });

  it("splits an oversized ranked list at line boundaries into contiguous ≤512 chunks", () => {
    const evidence = populatedEvidence();
    const many: DeviceReviewEvidence["salience"] = [];
    // Fixture Filter Cutoff (0.83) + 40 generated entries at 0.80..0.41 —
    // the fixture entry stays rank 1 under the bounded top-8 cap.
    for (let i = 0; i < 40; i++) {
      many.push(param({ paramKey: `dev_aaaaaaaaaaaaaaa1:device_parameter:${i}`, paramIndex: i, paramName: `Param ${i}`, salience: 0.8 - i * 0.01 }));
    }
    evidence.salience = [param({ salience: 0.83 }), ...many];
    const chunks = renderDeviceReview(evidence);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    // Line integrity: a rendered ranked line is a COMPLETE line (no mid-line cut).
    expect(chunks.join("\n").split("\n").some((l) => /^\s+1\.\sFilter Cutoff\s+▇▇\s+salience=0\.83/.test(l))).toBe(true);
  });

  it("is deterministic for identical input", () => {
    expect(renderDeviceReview(populatedEvidence())).toEqual(renderDeviceReview(populatedEvidence()));
  });

  it("stringified inputs and outputs contain no patch identifier, operations-list, or risk tokens (T-05-24)", () => {
    const evidence = populatedEvidence();
    const chunks = renderDeviceReview(evidence);
    expect(JSON.stringify([evidence, chunks])).not.toMatch(/patchId|inverseOperations|applyPatch|"operations"|"risk"/);
  });

  it("module imports nothing from fs/net/patch/sessions/peers (advisory purity)", async () => {
    const src = await readFile(join(MODULE_PATH, "device-review-render.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']node:fs/);
    expect(src).not.toMatch(/from\s+["']node:net/);
    expect(src).not.toMatch(/from\s+["']\.\.\/patch\//);
    expect(src).not.toMatch(/from\s+["']\.\.\/sessions\//);
    expect(src).not.toMatch(/from\s+["']\.\.\/peers\//);
  });
});

describe("renderDeviceReviewHint (no-snapshot path)", () => {
  it("is a short honest hint that names the knob + refresh remedy — never fabricated evidence", () => {
    const hint = renderDeviceReviewHint();
    expect(hint.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(hint).toMatch(/no salience snapshot/i);
    expect(hint).toMatch(/refresh/);
  });
});
