// daemon/src/runtime/boot-device.test.ts
//
// Phase 5 Plan 05-09 Task 2 — focused unit + wiring tests for the boot-side
// device-review dependency consumed by ActionDispatch's device.review branch
// (UX-04 / SC#5). The factory under test is the injected dependency
// implementation mirroring createArrangementReviewDependency (04.3-02):
// durable-snapshot read, refusal ladder, refresh via the shared
// refreshSalienceSnapshot, chain from the existing device-chain pull, macros
// from the macroSuggest single source. The dispatch-branch contract itself
// is covered in action-dispatch.test.ts with fakes.
//
// Covers (plan behavior list 7):
//   - production wiring: ActionDispatch receives a non-null deviceReview
//     dependency (structural source assertion — the injected factory line)
//   - optional-dep discipline: boot still completes on the disconnected path
//     (no bridge connected) with the device wiring present

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { boot, createDeviceReviewDependency } from "./boot.js";
import { loadSalienceSnapshot, saveSalienceSnapshot, type SalienceSnapshot } from "../state/salience-snapshot.js";
import type { RawState } from "../state/reconcile.js";

const OLD_PULLED_AT = "2026-08-22T10:00:00.000Z";

const snapshot = (pulledAt = OLD_PULLED_AT): SalienceSnapshot => ({
  version: "1.0",
  pulledAt,
  profile: "generic",
  tracks: [
    {
      trackKey: "trk_bootdev000000001",
      params: [
        { paramKey: "dev_aaaaaaaaaaaaaaa1:device_parameter:3", deviceKey: "dev_aaaaaaaaaaaaaaa1", paramIndex: 3, paramName: "Filter Cutoff", source: "device_parameter", movementCount: 42, valueRange: 0.31, lastValue: 0.62, salience: 0.83 },
        { paramKey: "dev_bbbbbbbbbbbbbbb2:remote_page:0", deviceKey: "dev_bbbbbbbbbbbbbbb2", paramIndex: 0, paramName: "Macro 1", source: "remote_page", movementCount: 12, valueRange: 0.5, lastValue: 0.25, salience: 0.64 },
      ],
    },
  ],
});

/** Live folded state with one device param movement (the 05-01 fold shape). */
const foldedState = (): RawState =>
  ({
    version: "1.0",
    project: { name: "", tempo: 120, timeSignature: "4/4" },
    selection: { trackSid: "trk_bootdev000000001", deviceSid: "dev_aaaaaaaaaaaaaaa1" },
    tracks: [],
    clips: [],
    devices: [{ deviceSid: "dev_folded0000000001", name: "Folded Cache", isPlugin: false, position: 0 }],
    parameters: {
      "dev_aaaaaaaaaaaaaaa1:device_parameter:3": { deviceKey: "dev_aaaaaaaaaaaaaaa1", paramIndex: 3, paramName: "Filter Cutoff", source: "device_parameter", movementCount: 7, lastValue: 0.6, minValue: 0.4, maxValue: 0.8, lastMovedAt: 1 },
    },
  }) as unknown as RawState;

const withTmp = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "bw-brain-devrev-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const chainResponse = { devices: [{ deviceSid: "dev_aaaaaaaaaaaaaaa1", name: "Polymer", isPlugin: false, position: 0 }, { deviceSid: "dev_bbbbbbbbbbbbbbb2", name: "Surge XT", isPlugin: true, position: 1 }] };

describe("createDeviceReviewDependency (05-09 injected device-review dependency)", () => {
  it("serves durable evidence with the pulled chain + macros + pulledAt (no refresh)", async () => {
    await withTmp(async (dir) => {
      const saliencePath = join(dir, "salience-snapshot.json");
      await saveSalienceSnapshot(saliencePath, snapshot());
      const pullDeviceChain = vi.fn(async () => chainResponse);
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: saliencePath,
        intent: () => null,
        freshness: () => "live",
        state: () => foldedState(),
        pullDeviceChain,
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(outcome.kind).toBe("evidence");
      if (outcome.kind !== "evidence") return;
      expect(outcome.evidence.pulledAt).toBe(OLD_PULLED_AT);
      expect(outcome.evidence.chain).toEqual(chainResponse.devices);
      expect(outcome.evidence.salience.map((p) => p.salience)).toEqual([0.83, 0.64]);
      // Macros populated by the macroSuggest single source (same as the CLI op).
      expect(outcome.evidence.macros.length).toBeGreaterThan(0);
      expect(outcome.evidence.macros[0]!.alternatives.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("falls back to the folded devices cache when the chain pull fails (never fabricated)", async () => {
    await withTmp(async (dir) => {
      const saliencePath = join(dir, "salience-snapshot.json");
      await saveSalienceSnapshot(saliencePath, snapshot());
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: saliencePath,
        intent: () => null,
        freshness: () => "live",
        state: () => foldedState(),
        pullDeviceChain: async () => { throw new Error("bridge gone"); },
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(outcome.kind).toBe("evidence");
      if (outcome.kind !== "evidence") return;
      expect(outcome.evidence.chain).toEqual(foldedState().devices);
    });
  });

  it("serves the folded cache without a pull when no cursor selection exists", async () => {
    await withTmp(async (dir) => {
      const saliencePath = join(dir, "salience-snapshot.json");
      await saveSalienceSnapshot(saliencePath, snapshot());
      const state = foldedState();
      (state.selection as Record<string, unknown>).trackSid = undefined;
      (state.selection as Record<string, unknown>).deviceSid = undefined;
      const pullDeviceChain = vi.fn(async () => chainResponse);
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: saliencePath,
        intent: () => null,
        freshness: () => "live",
        state: () => state,
        pullDeviceChain,
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(pullDeviceChain).not.toHaveBeenCalled();
      expect(outcome.kind).toBe("evidence");
      if (outcome.kind !== "evidence") return;
      expect(outcome.evidence.chain).toEqual(state.devices);
    });
  });

  it("answers a missing snapshot with the honest no-snapshot outcome", async () => {
    await withTmp(async (dir) => {
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: join(dir, "absent.json"),
        intent: () => null,
        freshness: () => "live",
        state: () => foldedState(),
        pullDeviceChain: vi.fn(),
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(outcome).toEqual({ kind: "no-snapshot" });
    });
  });

  it("hard-refuses disconnected + refresh with state_disconnected and refreshes nothing", async () => {
    await withTmp(async (dir) => {
      const state = foldedState();
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: join(dir, "salience-snapshot.json"),
        intent: () => null,
        freshness: () => "disconnected",
        state: () => state,
        pullDeviceChain: vi.fn(),
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: true });
      expect(outcome).toEqual({ kind: "refusal", reason: "state_disconnected" });
    });
  });

  it("refuses snapshot_invalid when the file is corrupt and no refresh was requested (DEFECT C discipline)", async () => {
    await withTmp(async (dir) => {
      const saliencePath = join(dir, "salience-snapshot.json");
      await writeFile(saliencePath, "{ not json", "utf8");
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: saliencePath,
        intent: () => null,
        freshness: () => "live",
        state: () => foldedState(),
        pullDeviceChain: vi.fn(),
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(outcome).toEqual({ kind: "refusal", reason: "snapshot_invalid" });
    });
  });

  it("refresh while live re-analyzes the live folds and persists a fresh snapshot (corrupt file never blocks a refresh)", async () => {
    await withTmp(async (dir) => {
      const saliencePath = join(dir, "salience-snapshot.json");
      await writeFile(saliencePath, "{ not json", "utf8");
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: saliencePath,
        intent: () => null,
        freshness: () => "live",
        state: () => foldedState(),
        pullDeviceChain: async () => chainResponse,
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: true });
      expect(outcome.kind).toBe("evidence");
      if (outcome.kind !== "evidence") return;
      expect(outcome.evidence.pulledAt).not.toBe(OLD_PULLED_AT);
      const persisted = await loadSalienceSnapshot(saliencePath);
      expect(persisted?.pulledAt).toBe(outcome.evidence.pulledAt);
    });
  });

  it("degrades an empty-fold refresh to no-snapshot (refuse-incomplete, nothing fabricated)", async () => {
    await withTmp(async (dir) => {
      const emptyState = { ...foldedState(), parameters: {} } as RawState;
      const review = createDeviceReviewDependency({
        salienceSnapshotPath: join(dir, "salience-snapshot.json"),
        intent: () => null,
        freshness: () => "live",
        state: () => emptyState,
        pullDeviceChain: vi.fn(),
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: true });
      expect(outcome).toEqual({ kind: "no-snapshot" });
    });
  });

  it("refuses not_implemented when no salience snapshot path is configured", async () => {
    const review = createDeviceReviewDependency({
      intent: () => null,
      freshness: () => "live",
      state: () => foldedState(),
      pullDeviceChain: vi.fn(),
    });
    const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
    expect(outcome).toEqual({ kind: "refusal", reason: "not_implemented" });
  });
});

describe("boot device-review wiring (production injection, optional-dep discipline)", () => {
  it("wires the deviceReview dependency into ActionDispatch production wiring (non-null injection)", async () => {
    const src = await readFile(join(dirname(fileURLToPath(import.meta.url)), "boot.ts"), "utf8");
    expect(src).toMatch(/deviceReview:\s*createDeviceReviewDependency\(/);
    expect(src).toMatch(/import\s*\{[^}]*assembleDeviceReviewEvidence[^}]*\}\s*from\s+"\.\.\/query\/query-server\.js"/);
  });

  it("boots on the disconnected path with the device wiring present (no bridge ever connects)", { timeout: 15_000 }, async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bw-brain-devboot-"));
    try {
      const handle = await boot({
        socketPath: path.join(dir, "daemon.sock"),
        tcpPort: 17892,
        peerPort: 0,
        stateCachePath: path.join(dir, "state-cache.json"),
        intentPath: path.join(dir, "intent.json"),
      });
      expect(handle).toBeDefined();
      expect(typeof handle.shutdown).toBe("function");
      await handle.shutdown();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
