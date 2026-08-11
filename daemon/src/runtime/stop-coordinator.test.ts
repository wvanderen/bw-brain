import { describe, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { StopCoordinator } from "./stop-coordinator.js";

describe("generated-only global Stop", () => {
  it("aborts reasoning, invalidates grants, disarms every project peer, and preserves journal bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stop-contract-"));
    const journal = join(dir, "patch-history.jsonl");
    await writeFile(journal, '{"patchId":"kept"}\n');
    const before = await readFile(journal);
    const sent: Array<{ connectionId: string; message: object }> = [];
    const stop = new StopCoordinator({
      stopAnalysis: vi.fn(), invalidateApprovals: vi.fn(), clearPending: vi.fn(),
      projectPeers: () => [{ connectionId: "c1", instanceId: "i1" }, { connectionId: "c2", instanceId: "i2" }],
      sendTo: (connectionId, message) => (sent.push({ connectionId, message }), true),
      publishStopped: vi.fn(),
    });
    const result = await stop.stopProject("project-a");
    expect(result).toEqual({ ok: true, targeted: 2 });
    expect(sent).toEqual([
      { connectionId: "c1", message: { type: "stop", projectId: "project-a", reason: "user" } },
      { connectionId: "c2", message: { type: "stop", projectId: "project-a", reason: "user" } },
    ]);
    expect(await readFile(journal)).toEqual(before);
    expect(Object.keys((stop as any).deps).some((key) => /patch|journal|revert|history/i.test(key))).toBe(false);
  });
});
