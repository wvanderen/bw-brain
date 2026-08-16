import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ProjectRegistry } from "./project-registry.js";

describe("ProjectRegistry", () => {
  it("mints one durable active project identity without using display names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "projects-active-"));
    const first = new ProjectRegistry(dir);
    const projectId = await first.getOrCreateActiveProjectId();
    expect(projectId).toMatch(/^project-[0-9a-f-]{36}$/);
    await first.updateHints(projectId, { projectName: "A display-only name" });
    expect(await new ProjectRegistry(dir).getOrCreateActiveProjectId()).toBe(projectId);
  });

  it("keeps hints non-authoritative and forks durable divergent lineage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "projects-")); const registry = new ProjectRegistry(dir);
    await registry.updateHints("source", { projectName: "Renamed" });
    await expect(registry.requireConfirmedScope("source", "i1")).rejects.toThrow("scope_not_confirmed");
    await registry.confirmLink("source", "i1", { trackSid: "t1" });
    await registry.appendHistory("source", "before");
    const fork = await registry.fork("source", "fork", [{ oldInstanceId: "i1", newInstanceId: "i2" }]);
    await expect(registry.requireConfirmedScope("fork", "i1")).rejects.toThrow("scope_not_confirmed");
    await expect(registry.requireConfirmedScope("fork", "i2")).resolves.toMatchObject({ trackSid: "t1" });
    await registry.appendHistory("fork", "fork-only"); await registry.appendHistory("source", "source-only");
    expect((await registry.open("source")).history).toEqual(["before", "source-only"]);
    expect((await registry.open("fork")).history).toEqual(["before", "fork-only"]);
    expect(await new ProjectRegistry(dir).findConfirmedProjectId("i1")).toBe("source");
    expect(await new ProjectRegistry(dir).findConfirmedProjectId("i2")).toBe("fork");
    expect(fork.lineageVersion).toBe(2);
    expect(JSON.parse(await readFile(join(dir, "fork", "project-registry.json"), "utf8")).parentProjectId).toBe("source");
  });
});
