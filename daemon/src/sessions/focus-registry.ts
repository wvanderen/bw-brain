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
