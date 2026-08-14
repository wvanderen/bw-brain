import { randomBytes } from "node:crypto";
import type { ControllerCorrelationService, CorrelationScope } from "../sessions/controller-correlation.js";
import type { FocusRegistry } from "../sessions/focus-registry.js";
import type { ProjectRegistry } from "../sessions/project-registry.js";

export interface ProjectForkCommitted { type: "ProjectForkCommitted"; sourceProjectId: string; newProjectId: string; instanceIds: string[]; lineageVersion: number; }
export interface LinkScope extends CorrelationScope { clipSid?: string; trackHint?: string; }
type Sender = (connectionId: string, message: object) => boolean;

export class SessionActions {
  private readonly pendingForks = new Map<string, { token: string; sourceProjectId: string; newProjectId: string; instanceIds: string[] }>();
  private readonly pendingLinks = new Map<string, { nonce: string; scope: LinkScope }>();
  constructor(private readonly deps: {
    projects: ProjectRegistry;
    focus: FocusRegistry;
    correlation: ControllerCorrelationService;
    resolveLinkScope: (connectionId: string) => Promise<LinkScope>;
    markLinkPending: (scope: LinkScope) => void;
    markLinkConfirmed: (scope: LinkScope) => void;
    sendTo: Sender;
    emit?: (event: ProjectForkCommitted) => void;
  }) {}

  async dispatch(connectionId: string, message: Record<string, unknown>): Promise<boolean> {
    if (message.type === "focus.set") {
      const scope = message.scope as { projectId?: string; instanceId?: string; clipSid?: string };
      if (!scope?.projectId || !scope.instanceId) return this.deps.sendTo(connectionId, { type: "action.error", error: "invalid_scope" });
      try {
        await this.deps.projects.requireConfirmedScope(scope.projectId, scope.instanceId);
        this.deps.focus.set(scope as { projectId: string; instanceId: string; clipSid?: string });
        return this.deps.sendTo(connectionId, { type: "focus.status", scope });
      } catch { return this.deps.sendTo(connectionId, { type: "action.error", error: "scope_not_confirmed" }); }
    }
    if (message.type === "link.confirm.request") {
      try {
        const scope = await this.deps.resolveLinkScope(connectionId);
        const confirmed = await this.deps.correlation.requestConfirmation({
          projectId: scope.projectId,
          instanceId: scope.instanceId,
          trackSid: scope.trackSid,
          deviceHint: scope.deviceHint,
        });
        const pending = { nonce: confirmed.nonce, scope };
        this.pendingLinks.set(connectionId, pending);
        this.deps.markLinkPending(scope);
        return this.deps.sendTo(connectionId, { type: "link.confirm.pending", ...pending });
      } catch { return this.deps.sendTo(connectionId, { type: "action.error", error: "link_confirmation_failed" }); }
    }
    if (message.type === "link.confirm.accept") {
      const pending = this.pendingLinks.get(connectionId);
      const state = this.deps.correlation.state();
      if (!pending || message.nonce !== pending.nonce || state.status !== "confirmed" ||
          state.nonce !== pending.nonce || state.projectId !== pending.scope.projectId ||
          state.instanceId !== pending.scope.instanceId || state.trackSid !== pending.scope.trackSid)
        return this.deps.sendTo(connectionId, { type: "action.error", error: "confirmation_mismatch" });
      this.pendingLinks.delete(connectionId);
      try {
        await this.deps.projects.confirmLink(pending.scope.projectId, pending.scope.instanceId, {
          trackSid: pending.scope.trackSid,
          deviceHint: pending.scope.deviceHint,
        });
        this.deps.markLinkConfirmed(pending.scope);
        return this.deps.sendTo(connectionId, { type: "link.status", status: "confirmed", scope: pending.scope });
      } catch { return this.deps.sendTo(connectionId, { type: "action.error", error: "link_confirmation_failed" }); }
    }
    if (message.type === "session.fork.request") {
      const sourceProjectId = String(message.sourceProjectId ?? ""), newProjectId = String(message.newProjectId ?? "");
      const source = await this.deps.projects.open(sourceProjectId);
      const token = randomBytes(24).toString("base64url");
      const pending = { token, sourceProjectId, newProjectId, instanceIds: Object.keys(source.links) };
      this.pendingForks.set(connectionId, pending);
      return this.deps.sendTo(connectionId, { type: "session.fork.confirmation_required", ...pending });
    }
    if (message.type === "session.fork.confirm") {
      const pending = this.pendingForks.get(connectionId);
      if (!pending || message.token !== pending.token || message.sourceProjectId !== pending.sourceProjectId || message.newProjectId !== pending.newProjectId)
        return this.deps.sendTo(connectionId, { type: "action.error", error: "fork_confirmation_mismatch" });
      this.pendingForks.delete(connectionId); // consume before side effects; replay fails closed
      try {
        const forked = await this.deps.projects.fork(pending.sourceProjectId, pending.newProjectId);
        await this.deps.projects.setActiveProjectId(pending.newProjectId);
        const focused = this.deps.focus.get();
        if (focused?.projectId === pending.sourceProjectId) this.deps.focus.set({ ...focused, projectId: pending.newProjectId });
        const event: ProjectForkCommitted = { type: "ProjectForkCommitted", sourceProjectId: pending.sourceProjectId, newProjectId: pending.newProjectId, instanceIds: pending.instanceIds, lineageVersion: forked.lineageVersion };
        this.deps.emit?.(event);
        return this.deps.sendTo(connectionId, event);
      } catch { return this.deps.sendTo(connectionId, { type: "action.error", error: "fork_failed" }); }
    }
    return false;
  }
}
