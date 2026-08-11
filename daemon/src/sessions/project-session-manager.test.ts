import { describe, expect, it } from "vitest";
import { ProjectSessionManager } from "./project-session-manager.js";
import type { PiProjectSession, PiRuntime, PiTool } from "./pi-runtime.js";

class FakeSession implements PiProjectSession {
  sessionFile = "fake"; prompts: string[] = []; aborted = 0; disposed = 0; failSubscribe = false;
  subscribe() { if (this.failSubscribe) throw Error("rebind"); return () => undefined; }
  async prompt(text: string) { this.prompts.push(text); }
  abort() { this.aborted++; }
  dispose() { this.disposed++; }
}
class FakeRuntime implements PiRuntime {
  sessions = new Map<string, FakeSession>(); fail?: "fork" | "open" | "rebind";
  async create(id: string, _tools: PiTool[]) { const s = new FakeSession(); this.sessions.set(id, s); return s; }
  async open(id: string, _tools: PiTool[]) { if (this.fail === "open") throw Error("open"); return this.sessions.get(id) ?? this.create(id, []); }
  async fork(source: string, target: string, _tools: PiTool[]) { if (this.fail === "fork") throw Error("fork"); const s = new FakeSession(); s.failSubscribe = this.fail === "rebind"; this.sessions.set(target, s); return s; }
}

describe("ProjectSessionManager", () => {
  it("shares one quiet session per project and serializes analyze", async () => {
    const runtime = new FakeRuntime(); const manager = new ProjectSessionManager(runtime, () => []);
    const a = await manager.connect("p", "i1") as FakeSession, b = await manager.connect("p", "i2") as FakeSession;
    expect(a).toBe(b); expect(runtime.sessions.size).toBe(1); expect(a.prompts).toHaveLength(0);
    await Promise.all([manager.analyze({ projectId: "p", instanceId: "i1", clipSid: "c1", prompt: "one" }), manager.analyze({ projectId: "p", instanceId: "i2", prompt: "two" })]);
    expect(a.prompts).toEqual([expect.stringContaining("one"), expect.stringContaining("two")]);
    expect((await manager.connect("q", "i3"))).not.toBe(a);
  });
  it("Stop aborts active/queued work but retains the resumable session", async () => {
    const runtime = new FakeRuntime(); const manager = new ProjectSessionManager(runtime, () => []);
    const s = await manager.connect("p", "i") as FakeSession; manager.stop("p");
    expect(s.aborted).toBe(1); expect(await manager.connect("p", "i")).toBe(s);
  });
  it("close disposes the project lifecycle and a later connect opens a distinct one", async () => {
    const runtime = new FakeRuntime(); const manager = new ProjectSessionManager(runtime, () => []);
    const first = await manager.connect("p", "i") as FakeSession; manager.close("p");
    expect(first.disposed).toBe(1); runtime.sessions.delete("p");
    expect(await manager.connect("p", "i")).not.toBe(first);
  });
  it("fork keeps source continuity, rolls back partial targets, and permits retry", async () => {
    const runtime = new FakeRuntime(); const failures: string[] = []; const manager = new ProjectSessionManager(runtime, () => [], e => failures.push(e.newProjectId));
    const source = await manager.connect("p", "i"); runtime.fail = "fork";
    await expect(manager.onProjectForkCommitted({ type: "ProjectForkCommitted", sourceProjectId: "p", newProjectId: "q", instanceIds: ["i"], lineageVersion: 2 })).rejects.toThrow();
    expect(await manager.connect("p", "i")).toBe(source); expect(failures).toEqual(["q"]);
    runtime.fail = undefined; await manager.onProjectForkCommitted({ type: "ProjectForkCommitted", sourceProjectId: "p", newProjectId: "q", instanceIds: ["i"], lineageVersion: 2 });
    expect(await manager.connect("q", "i")).not.toBe(source);
  });
  it("rolls back a target whose subscriber rebind fails, then retries idempotently", async () => {
    const runtime = new FakeRuntime(); const manager = new ProjectSessionManager(runtime, () => []);
    await manager.connect("p", "i"); runtime.fail = "rebind";
    const event = { type: "ProjectForkCommitted", sourceProjectId: "p", newProjectId: "q", instanceIds: ["i"], lineageVersion: 2 } as const;
    await expect(manager.onProjectForkCommitted(event)).rejects.toThrow("rebind");
    expect(runtime.sessions.get("q")!.disposed).toBe(1);
    runtime.fail = undefined; await manager.onProjectForkCommitted(event);
    expect(await manager.connect("q", "i")).toBe(runtime.sessions.get("q"));
  });
  it("does not retain a failed open and can retry connection", async () => {
    const runtime = new FakeRuntime(); runtime.fail = "open"; const manager = new ProjectSessionManager(runtime, () => []);
    await expect(manager.connect("p", "i")).rejects.toThrow("open");
    runtime.fail = undefined; expect(await manager.connect("p", "i")).toBe(runtime.sessions.get("p"));
  });
});
