import { randomBytes } from "node:crypto";
import type { ControllerCorrelationService, CorrelationScope } from "../sessions/controller-correlation.js";
import type { FocusRegistry } from "../sessions/focus-registry.js";
import type { ProjectRegistry } from "../sessions/project-registry.js";

export interface ProjectForkCommitted { type: "ProjectForkCommitted"; sourceProjectId: string; newProjectId: string; instanceIds: string[]; lineageVersion: number; }
export interface ForkInstanceRekey { connectionId: string; oldInstanceId: string; newInstanceId: string; }
export interface LinkScope extends CorrelationScope { clipSid?: string; }
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
    emit: (event: ProjectForkCommitted) => void | Promise<void>;
    planForkInstances: (connectionId: string, sourceProjectId: string, instanceIds: string[]) => ForkInstanceRekey[];
    commitForkInstances: (newProjectId: string, rekeys: ForkInstanceRekey[], event: ProjectForkCommitted) => void;
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
          trackSlot: scope.trackSlot,
          trackHint: scope.trackHint,
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
        this.deps.focus.set({
          projectId: pending.scope.projectId,
          instanceId: pending.scope.instanceId,
          ...(pending.scope.clipSid ? { clipSid: pending.scope.clipSid } : {}),
        });
        this.deps.markLinkConfirmed(pending.scope);
        return this.deps.sendTo(connectionId, { type: "link.status", status: "confirmed", scope: pending.scope });
      } catch { return this.deps.sendTo(connectionId, { type: "action.error", error: "link_confirmation_failed" }); }
    }
    if (message.type === "session.fork.request") {
      const sourceProjectId = String(message.sourceProjectId ?? ""), newProjectId = String(message.newProjectId ?? "");
      const source = await this.deps.projects.open(sourceProjectId);
      const token = randomBytes(24).toString("base64url");
      const pending = { token, sourceProjectId, newProjectId, instanceIds: Object.entries(source.links).filter(([, link]) => link.status === "confirmed").map(([instanceId]) => instanceId).sort() };
      this.pendingForks.set(connectionId, pending);
      return this.deps.sendTo(connectionId, { type: "session.fork.confirmation_required", ...pending });
    }
    if (message.type === "session.fork.confirm") {
      const pending = this.pendingForks.get(connectionId);
      if (!pending || message.token !== pending.token || message.sourceProjectId !== pending.sourceProjectId || message.newProjectId !== pending.newProjectId)
        return this.deps.sendTo(connectionId, { type: "action.error", error: "fork_confirmation_mismatch" });
      this.pendingForks.delete(connectionId); // consume before side effects; replay fails closed
      try {
        const rekeys = this.deps.planForkInstances(connectionId, pending.sourceProjectId, pending.instanceIds);
        const forked = await this.deps.projects.fork(pending.sourceProjectId, pending.newProjectId, rekeys);
        await this.deps.projects.setActiveProjectId(pending.newProjectId);
        const focused = this.deps.focus.get();
        if (focused?.projectId === pending.sourceProjectId) {
          const replacement = rekeys.find((rekey) => rekey.oldInstanceId === focused.instanceId)?.newInstanceId;
          if (!replacement) throw new Error("fork_focus_not_connected");
          this.deps.focus.set({ ...focused, projectId: pending.newProjectId, instanceId: replacement });
        }
        const event: ProjectForkCommitted = { type: "ProjectForkCommitted", sourceProjectId: pending.sourceProjectId, newProjectId: pending.newProjectId, instanceIds: rekeys.map((rekey) => rekey.newInstanceId), lineageVersion: forked.lineageVersion };
        await this.deps.emit(event);
        this.deps.commitForkInstances(pending.newProjectId, rekeys, event);
        return true;
      } catch { return this.deps.sendTo(connectionId, { type: "action.error", error: "fork_failed" }); }
    }
    return false;
  }
}
