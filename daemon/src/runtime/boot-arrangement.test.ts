// daemon/src/runtime/boot-arrangement.test.ts
//
// 04.3 / 04.3-02 Task 2 — focused unit tests for the boot-side arrangement
// wiring consumed by ActionDispatch and resolveAnalysisContext (RB-03 /
// RB-05 / UX-03 daemon half). The factories under test are the injected
// dependency implementations; the dispatch-branch contract itself is covered
// in action-dispatch.test.ts with fakes.
//
// Covers (plan behavior list):
//   - durable-snapshot read surfaces pulledAt assumptions; no snapshot →
//     honest no-snapshot outcome (never fabricated)
//   - disconnected + refresh → hard refusal state_disconnected (no pull)
//   - refresh while live pulls a fresh grid via the shared pull path and
//     persists the snapshot (CLI refresh semantics mirrored exactly)
//   - pull failure degrades to no-snapshot
//   - unconfigured snapshot path → refusal not_implemented
//   - Analyze-context enrichment: bounded arrangement evidence + pulledAt
//     assumption when present, explicit no-snapshot assumption when absent,
//     and never-throws on an unreadable snapshot file

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArrangementReviewDependency, includeCursorSelectedTrack, loadArrangementAnalysisEvidence } from "./boot.js";
import { loadArrangementSnapshot, saveArrangementSnapshot, type ArrangementSnapshot } from "../state/arrangement-snapshot.js";

const OLD_PULLED_AT = "2026-08-21T10:00:00.000Z";

// fix-04.3 (DEFECT D): the fixture carries one real track — the snapshot
// schema requires minItems:1 on grid.tracks (a zero-track "snapshot" is an
// incomplete grid the refresh path refuses, never a persistable file).
const snapshot = (pulledAt = OLD_PULLED_AT): ArrangementSnapshot => ({
  version: "1.0",
  pulledAt,
  profile: "generic",
  sceneCount: 0,
  trackCount: 1,
  grid: { tracks: [{ trackSid: "trk_bootarr000000001", name: "Kick", scenes: [] }], sceneNames: [] },
});

const withTmp = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "bw-brain-arr-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const liveGrid = { tracks: [{ trackSid: "t1", name: "bass", scenes: [] }], sceneNames: [] };

describe("includeCursorSelectedTrack (out-of-window link confirmation)", () => {
  it("adds the cursor-selected ninth track when the summary bank contains only slots 0-7", () => {
    const summary = Array.from({ length: 8 }, (_, slot) => ({ slot, name: `Track ${slot + 1}` }));
    expect(includeCursorSelectedTrack(summary, 8, "Lead")).toEqual([
      ...summary,
      { slot: 8, name: "Lead" },
    ]);
  });

  it("prefers the in-window summary name and does not duplicate the selected slot", () => {
    const summary = [{ slot: 1, name: "Bass" }];
    expect(includeCursorSelectedTrack(summary, 1, "stale cursor hint")).toBe(summary);
  });
});

describe("createArrangementReviewDependency (04.3-02 injected review dependency)", () => {
  it("serves durable snapshot evidence with pulledAt assumptions (no refresh)", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "arrangement-snapshot.json");
      await saveArrangementSnapshot(path, snapshot());
      const review = createArrangementReviewDependency({
        arrangementSnapshotPath: path,
        intent: () => null,
        freshness: () => "stale",
        pullLauncherGrid: vi.fn(),
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(outcome.kind).toBe("evidence");
      if (outcome.kind !== "evidence") return;
      expect(outcome.evidence.pulledAt).toBe(OLD_PULLED_AT);
      expect(outcome.evidence.assumptions.some((a) => a.claim.includes(OLD_PULLED_AT))).toBe(true);
    });
  });

  it("answers a missing snapshot with the honest no-snapshot outcome", async () => {
    await withTmp(async (dir) => {
      const review = createArrangementReviewDependency({
        arrangementSnapshotPath: join(dir, "absent.json"),
        intent: () => null,
        freshness: () => "live",
        pullLauncherGrid: vi.fn(),
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(outcome).toEqual({ kind: "no-snapshot" });
    });
  });

  it("hard-refuses disconnected + refresh with state_disconnected and pulls nothing", async () => {
    await withTmp(async (dir) => {
      const pullLauncherGrid = vi.fn();
      const review = createArrangementReviewDependency({
        arrangementSnapshotPath: join(dir, "arrangement-snapshot.json"),
        intent: () => null,
        freshness: () => "disconnected",
        pullLauncherGrid,
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: true });
      expect(outcome).toEqual({ kind: "refusal", reason: "state_disconnected" });
      expect(pullLauncherGrid).not.toHaveBeenCalled();
    });
  });

  it("refresh while live pulls a fresh grid via the shared pull path and persists it", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "arrangement-snapshot.json");
      await saveArrangementSnapshot(path, snapshot());
      const pullLauncherGrid = vi.fn(async () => liveGrid);
      const review = createArrangementReviewDependency({
        arrangementSnapshotPath: path,
        intent: () => null,
        freshness: () => "live",
        pullLauncherGrid,
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: true });
      expect(pullLauncherGrid).toHaveBeenCalledTimes(1);
      expect(outcome.kind).toBe("evidence");
      if (outcome.kind !== "evidence") return;
      expect(outcome.evidence.pulledAt).not.toBe(OLD_PULLED_AT);
      const persisted = await loadArrangementSnapshot(path);
      expect(persisted?.pulledAt).toBe(outcome.evidence.pulledAt);
      expect(persisted?.trackCount).toBe(1);
    });
  });

  it("degrades a failed refresh pull to no-snapshot (never fabricated evidence)", async () => {
    await withTmp(async (dir) => {
      const review = createArrangementReviewDependency({
        arrangementSnapshotPath: join(dir, "arrangement-snapshot.json"),
        intent: () => null,
        freshness: () => "live",
        pullLauncherGrid: async () => { throw new Error("bridge gone"); },
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: true });
      expect(outcome).toEqual({ kind: "no-snapshot" });
    });
  });

  it("refuses not_implemented when no snapshot path is configured", async () => {
    const review = createArrangementReviewDependency({
      intent: () => null,
      freshness: () => "live",
      pullLauncherGrid: vi.fn(),
    });
    const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
    expect(outcome).toEqual({ kind: "refusal", reason: "not_implemented" });
  });

  // ==========================================================================
  // 04.3 Plan 04.3-07 Task 2 — DEFECT C (peer half): an INVALID snapshot file
  // must refuse visibly with the bounded snapshot_invalid code — never the
  // degrade-to-no-snapshot masquerade (an invalid file is not "no snapshot,
  // run refresh") and never a crash across the peer boundary. Refresh:true
  // still proceeds past the corrupted file (a fresh pull replaces it).
  // ==========================================================================

  it("DEFECT C: invalid file without refresh returns refusal snapshot_invalid (visible, bounded, no masquerade)", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "arrangement-snapshot.json");
      await writeFile(path, "{ not json", "utf8");
      const review = createArrangementReviewDependency({
        arrangementSnapshotPath: path,
        intent: () => null,
        freshness: () => "live",
        pullLauncherGrid: vi.fn(),
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: false });
      expect(outcome).toEqual({ kind: "refusal", reason: "snapshot_invalid" });
    });
  });

  it("DEFECT C: refresh:true over an invalid file proceeds to the pull and returns evidence (corrupted file never blocks a refresh)", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "arrangement-snapshot.json");
      await writeFile(path, "{ not json", "utf8");
      const pullLauncherGrid = vi.fn(async () => liveGrid);
      const review = createArrangementReviewDependency({
        arrangementSnapshotPath: path,
        intent: () => null,
        freshness: () => "live",
        pullLauncherGrid,
      });
      const outcome = await review({ scope: { projectId: "p", instanceId: "i" }, refresh: true });
      expect(pullLauncherGrid).toHaveBeenCalledTimes(1);
      expect(outcome.kind).toBe("evidence");
    });
  });
});

describe("loadArrangementAnalysisEvidence (04.3-02 Analyze-context enrichment)", () => {
  it("carries bounded arrangement evidence with a pulledAt assumption when a snapshot exists", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "arrangement-snapshot.json");
      await saveArrangementSnapshot(path, snapshot());
      const { arrangement } = await loadArrangementAnalysisEvidence({ arrangementSnapshotPath: path, intent: () => null });
      expect(arrangement.pulledAt).toBe(OLD_PULLED_AT);
      expect(Array.isArray(arrangement.sections)).toBe(true);
      expect(typeof arrangement.energy.bars).toBe("number");
      expect(typeof arrangement.repetitionClusters).toBe("number");
      expect(arrangement.assumptions.some((a) => a.claim.includes(OLD_PULLED_AT))).toBe(true);
    });
  });

  it("carries an explicit no-snapshot assumption when no snapshot exists", async () => {
    await withTmp(async (dir) => {
      const { arrangement } = await loadArrangementAnalysisEvidence({ arrangementSnapshotPath: join(dir, "absent.json"), intent: () => null });
      expect(arrangement.pulledAt).toBeNull();
      expect(arrangement.assumptions.some((a) => /no arrangement snapshot/i.test(a.claim))).toBe(true);
    });
  });

  it("survives an unreadable snapshot file (logged degradation, never throws)", async () => {
    await withTmp(async (dir) => {
      const path = join(dir, "arrangement-snapshot.json");
      await writeFile(path, "{ not json", "utf8");
      const { arrangement } = await loadArrangementAnalysisEvidence({ arrangementSnapshotPath: path, intent: () => null });
      expect(arrangement.pulledAt).toBeNull();
      expect(arrangement.assumptions.some((a) => /no arrangement snapshot/i.test(a.claim))).toBe(true);
    });
  });
});
