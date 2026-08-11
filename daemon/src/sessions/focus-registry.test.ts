import { describe, expect, it } from "vitest";
import { FocusRegistry } from "./focus-registry.js";
describe("FocusRegistry", () => it("requires explicit scope and returns copies", () => {
  const focus = new FocusRegistry(); expect(() => focus.set({ projectId: "", instanceId: "i" })).toThrow();
  const scope = focus.set({ projectId: "p", instanceId: "i" }); scope.projectId = "changed";
  expect(focus.get()).toEqual({ projectId: "p", instanceId: "i" });
}));
