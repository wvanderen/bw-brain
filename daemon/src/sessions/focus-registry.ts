import type { ProjectRegistry } from "./project-registry.js";

export interface FocusScope { projectId: string; instanceId: string; clipSid?: string; }

/** Bounded ephemeral visible focus. It never rewrites a stored proposal or project link. */
export class FocusRegistry {
  private current?: FocusScope;
  set(scope: FocusScope): FocusScope {
    if (!scope.projectId || !scope.instanceId) throw new Error("focus requires projectId and instanceId");
    this.current = { ...scope }; return this.get()!;
  }
  get(): FocusScope | undefined { return this.current ? { ...this.current } : undefined; }
  clear(): void { this.current = undefined; }
}

/** Compose durable link ownership with the exact ephemeral visible target. */
export async function requireConfirmedFocusedScope(
  projects: Pick<ProjectRegistry, "requireConfirmedScope">,
  focus: FocusRegistry,
  requested: FocusScope,
): Promise<FocusScope> {
  await projects.requireConfirmedScope(requested.projectId, requested.instanceId);
  const focused = focus.get();
  if (!focused) throw new Error("scope_not_focused");
  return focused;
}
