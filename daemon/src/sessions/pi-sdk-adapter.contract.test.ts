import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PiSdkAdapter } from "./pi-sdk-adapter.js";

describe("PiSdkAdapter real 0.84.0 contract", () => {
  it("creates, opens, resumes, forks, subscribes, aborts, and disposes without prompting", async () => {
    const root = await mkdtemp(join(tmpdir(), "bw-pi-sdk-"));
    const adapter = new PiSdkAdapter(root);
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
    reopened.dispose(); forked.dispose();
  });
});
