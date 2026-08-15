import { describe, expect, it } from "vitest";
import { ControllerCorrelationService } from "./controller-correlation.js";

const scope = { projectId: "project-1", instanceId: "instance-1", trackSid: "trk_0123456789abcdef", trackSlot: 3, trackHint: "Bass 2", deviceHint: "Polymer" };
const reply = (nonce: string) => ({ ...scope, trackSidHint: scope.trackHint, selectedDeviceEvidence: "controller-selected-device", nonce, available: true });

describe("ControllerCorrelationService", () => {
  it("confirms only an exact tuple and consumes the nonce once", async () => {
    const sent: object[] = [];
    const service = new ControllerCorrelationService({ send: async (_type, payload) => { sent.push(payload ?? {}); return reply("nonce-1"); } }, { nonce: () => "nonce-1" });
    expect(await service.requestConfirmation(scope)).toMatchObject({ status: "confirmed", ...scope, nonce: "nonce-1" });
    expect(sent).toEqual([{ ...scope, nonce: "nonce-1" }]);
    expect(service.accept(reply("nonce-1"))).toBe(false);
  });

  it("rejects unavailable evidence and every authoritative tuple mismatch", async () => {
    for (const response of [
      { ...reply("n"), available: false },
      { ...reply("n"), projectId: "other" },
      { ...reply("n"), instanceId: "other" },
      { ...reply("n"), trackSid: "other" },
      { ...reply("n"), trackSlot: 4 },
      { ...reply("other") },
      { ...reply("n"), selectedDeviceEvidence: "name-match" },
    ]) {
      const service = new ControllerCorrelationService({ send: async () => response }, { nonce: () => "n" });
      await expect(service.requestConfirmation(scope)).rejects.toThrow("controller confirmation rejected");
      expect(service.state().status).toBe("unconfirmed");
    }
  });

  it("keeps track and device names hint-only", async () => {
    const response = { ...reply("n"), trackSidHint: "Master", deviceHint: "Other device" };
    const service = new ControllerCorrelationService({ send: async () => response }, { nonce: () => "n" });
    await expect(service.requestConfirmation(scope)).resolves.toMatchObject({ status: "confirmed", trackSlot: 3 });
  });

  it("expires pending evidence", async () => {
    let now = 10;
    const service = new ControllerCorrelationService({ send: async () => { now = 100; return reply("n"); } }, { nonce: () => "n", now: () => now, expiryMs: 50 });
    await expect(service.requestConfirmation(scope)).rejects.toThrow("controller confirmation rejected");
  });

  it("returns to unconfirmed when the controller request fails", async () => {
    const service = new ControllerCorrelationService({ send: async () => { throw new Error("controller stale"); } });
    await expect(service.requestConfirmation(scope)).rejects.toThrow("controller stale");
    expect(service.state().status).toBe("unconfirmed");
  });

  it("invalidates reconnect nonces, marks stale, and recovers with a new proof", async () => {
    let resolveFirst!: (value: object) => void;
    let nonce = "old";
    const correlator = { send: async () => new Promise<object>((resolve) => { resolveFirst = resolve; }) };
    const service = new ControllerCorrelationService(correlator, { nonce: () => nonce });
    const pending = service.requestConfirmation(scope);
    expect(service.state().status).toBe("confirmationPending");
    service.onControllerDisconnect();
    expect(service.state().status).toBe("stale");
    resolveFirst(reply("old"));
    await expect(pending).rejects.toThrow("controller confirmation rejected");

    nonce = "new";
    service.onControllerReconnect({ send: async () => reply("new") });
    expect(service.state().status).toBe("unlinked");
    await expect(service.requestConfirmation(scope)).resolves.toMatchObject({ status: "confirmed", nonce: "new" });
  });
});
