import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PiSdkAdapter } from "./pi-sdk-adapter.js";

describe("PiSdkAdapter real 0.84.0 contract", () => {
  it("creates, opens, resumes, forks, subscribes, aborts, and disposes without prompting", async () => {
    const root = await mkdtemp(join(tmpdir(), "bw-pi-sdk-"));
    const agentDir = join(root, "shared-agent");
    const adapter = new PiSdkAdapter(root, agentDir);
    const source = await adapter.create("project-a", []);
    const path = source.sessionFile;
    expect(path).toContain(join("projects", "project-a"));
    source.subscribe(() => undefined)();
    source.abort();
    source.dispose();
    const reopened = await adapter.open("project-a", []);
    expect(reopened.sessionFile).toBe(path);
    const forked = await adapter.fork("project-a", "project-b", []);
    expect(forked.sessionFile).not.toBe(path);
    expect(JSON.parse((await readFile(forked.sessionFile!, "utf8")).split("\n")[0]!).parentSession).toBe(path);
    await expect(stat(agentDir)).resolves.toMatchObject({});
    await expect(stat(join(root, "projects", "project-a", "agent"))).rejects.toMatchObject({ code: "ENOENT" });
    reopened.dispose(); forked.dispose();
  });

  it("classifies an empty agent credential store without leaking the raw SDK guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "bw-pi-sdk-auth-"));
    const session = await new PiSdkAdapter(root, join(root, "empty-agent")).create("project-auth", []);
    await expect(session.prompt("bounded diagnostic")).rejects.toMatchObject({
      name: "PiRuntimeFailure",
      code: "pi_auth_required",
      message: "pi_auth_required",
    });
    session.dispose();
  });
});
