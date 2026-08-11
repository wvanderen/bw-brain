import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ProjectRegistry } from "../sessions/project-registry.js";
import { FocusRegistry } from "../sessions/focus-registry.js";
import { SessionActions } from "./session-actions.js";

describe("SessionActions", () => it("requires exact one-shot fork confirmation and emits after durability", async () => {
  const projects = new ProjectRegistry(await mkdtemp(join(tmpdir(), "actions-"))); await projects.confirmLink("source", "i1");
  const focus = new FocusRegistry(); focus.set({ projectId: "source", instanceId: "i1" });
  const sent: any[] = [], events: any[] = [];
  const actions = new SessionActions({ projects, focus, correlation: { state: () => ({ status: "unconfirmed" }) } as any, sendTo: (_id, m) => (sent.push(m), true), emit: (e) => events.push(e) });
  await actions.dispatch("c", { type: "session.fork.request", sourceProjectId: "source", newProjectId: "fork" });
  const request = sent.at(-1); await actions.dispatch("c", { type: "session.fork.confirm", sourceProjectId: "source", newProjectId: "fork", token: "wrong" });
  expect(events).toHaveLength(0);
  await actions.dispatch("c", { type: "session.fork.confirm", sourceProjectId: "source", newProjectId: "fork", token: request.token });
  expect(events[0]).toMatchObject({ type: "ProjectForkCommitted", sourceProjectId: "source", newProjectId: "fork", instanceIds: ["i1"] });
  expect(focus.get()?.projectId).toBe("fork");
  await actions.dispatch("c", { type: "session.fork.confirm", sourceProjectId: "source", newProjectId: "fork", token: request.token });
  expect(events).toHaveLength(1);
}));
