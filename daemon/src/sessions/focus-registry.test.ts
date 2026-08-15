import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectRegistry } from "./project-registry.js";
import { FocusRegistry, requireConfirmedFocusedScope } from "./focus-registry.js";

describe("FocusRegistry", () => {
  it("requires explicit scope and returns copies", () => {
    const focus = new FocusRegistry(); expect(() => focus.set({ projectId: "", instanceId: "i" })).toThrow();
    const scope = focus.set({ projectId: "p", instanceId: "i" }); scope.projectId = "changed";
    expect(focus.get()).toEqual({ projectId: "p", instanceId: "i" });
  });

  it("composes durable link ownership with exact ephemeral clip focus", async () => {
    const projects = new ProjectRegistry(await mkdtemp(join(tmpdir(), "focus-authority-")));
    const focus = new FocusRegistry();
    const scope = { projectId: "project-1", instanceId: "instance-1", clipSid: "clip-1" };

    await projects.confirmLink(scope.projectId, scope.instanceId);
    await expect(requireConfirmedFocusedScope(projects, focus, scope)).rejects.toThrow("scope_not_focused");

    focus.set(scope);
    await expect(requireConfirmedFocusedScope(projects, focus, scope)).resolves.toEqual(scope);
    await expect(requireConfirmedFocusedScope(projects, focus, { ...scope, instanceId: "unlinked" })).rejects.toThrow("scope_not_confirmed");
  });
});
