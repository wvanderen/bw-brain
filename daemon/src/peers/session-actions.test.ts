import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { ProjectRegistry } from "../sessions/project-registry.js";
import { FocusRegistry } from "../sessions/focus-registry.js";
import { SessionActions } from "./session-actions.js";

describe("SessionActions", () => it("requires exact one-shot fork confirmation and emits after durability", async () => {
  const projects = new ProjectRegistry(await mkdtemp(join(tmpdir(), "actions-"))); await projects.confirmLink("source", "i1");
  const focus = new FocusRegistry(); focus.set({ projectId: "source", instanceId: "i1" });
  const sent: any[] = [], events: any[] = [];
  const actions = new SessionActions({ projects, focus, correlation: { state: () => ({ status: "unconfirmed" }) } as any,
    resolveLinkScope: async () => { throw new Error("unused"); }, markLinkPending: () => undefined, markLinkConfirmed: () => undefined,
    sendTo: (_id, m) => (sent.push(m), true), emit: (e) => events.push(e) });
  await actions.dispatch("c", { type: "session.fork.request", sourceProjectId: "source", newProjectId: "fork" });
  const request = sent.at(-1); await actions.dispatch("c", { type: "session.fork.confirm", sourceProjectId: "source", newProjectId: "fork", token: "wrong" });
  expect(events).toHaveLength(0);
  await actions.dispatch("c", { type: "session.fork.confirm", sourceProjectId: "source", newProjectId: "fork", token: request.token });
  expect(events[0]).toMatchObject({ type: "ProjectForkCommitted", sourceProjectId: "source", newProjectId: "fork", instanceIds: ["i1"] });
  expect(focus.get()?.projectId).toBe("fork");
  await actions.dispatch("c", { type: "session.fork.confirm", sourceProjectId: "source", newProjectId: "fork", token: request.token });
  expect(events).toHaveLength(1);
}));

describe("SessionActions identity link", () => it("derives a pending scope and consumes its exact nonce before granting authority", async () => {
  const projects = new ProjectRegistry(await mkdtemp(join(tmpdir(), "actions-link-")));
  const focus = new FocusRegistry();
  const scope = { projectId: "project-1", instanceId: "instance-1", trackSid: "trk_0123456789abcdef", trackSlot: 2, clipSid: "clip_0123456789abcdef", trackHint: "Bass 2", deviceHint: "bw-brain" };
  let correlationState: any = { status: "unconfirmed" };
  const correlation: any = {
    requestConfirmation: vi.fn(async (requested) => {
      correlationState = { status: "confirmed", ...requested, selectedDeviceEvidence: "controller-selected-device", nonce: "nonce-1" };
      return correlationState;
    }),
    state: () => correlationState,
  };
  const sent: any[] = [];
  const markLinkPending = vi.fn(), markLinkConfirmed = vi.fn();
  const actions = new SessionActions({ projects, focus, correlation, resolveLinkScope: async () => scope,
    markLinkPending, markLinkConfirmed, sendTo: (_id, message) => (sent.push(message), true) });

  await actions.dispatch("connection-1", { type: "link.confirm.request" });
  expect(correlation.requestConfirmation).toHaveBeenCalledWith({ projectId: scope.projectId, instanceId: scope.instanceId, trackSid: scope.trackSid, trackSlot: scope.trackSlot, trackHint: scope.trackHint, deviceHint: scope.deviceHint });
  expect(sent.at(-1)).toEqual({ type: "link.confirm.pending", nonce: "nonce-1", scope });
  expect(markLinkPending).toHaveBeenCalledWith(scope);

  await actions.dispatch("connection-1", { type: "link.confirm.accept", nonce: "wrong" });
  expect(sent.at(-1)).toEqual({ type: "action.error", error: "confirmation_mismatch" });
  await expect(projects.requireConfirmedScope(scope.projectId, scope.instanceId)).rejects.toThrow("scope_not_confirmed");

  await actions.dispatch("connection-1", { type: "link.confirm.accept", nonce: "nonce-1" });
  expect(sent.at(-1)).toEqual({ type: "link.status", status: "confirmed", scope });
  await expect(projects.requireConfirmedScope(scope.projectId, scope.instanceId)).resolves.toMatchObject({ trackSid: scope.trackSid });
  expect(focus.get()).toEqual({ projectId: scope.projectId, instanceId: scope.instanceId, clipSid: scope.clipSid });
  expect(markLinkConfirmed).toHaveBeenCalledWith(scope);

  await actions.dispatch("connection-1", { type: "link.confirm.accept", nonce: "nonce-1" });
  expect(sent.at(-1)).toEqual({ type: "action.error", error: "confirmation_mismatch" });
}));
