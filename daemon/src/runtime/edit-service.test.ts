import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { EditService } from "./edit-service.js";
import { buildAutomationInverse, type AutomationOp, type PrimitiveOp } from "../patch/inverse-ops.js";
import type { PatchHistoryEntry } from "../patch/patch-history.js";

// ---------------------------------------------------------------------------
// Clip path (Phase 3) — byte-parity guard. This test predates Phase 5 05-05
// and MUST keep passing unchanged (plan Task 3 Test 9).
// ---------------------------------------------------------------------------
describe("EditService", () => it("does not journal or evict a failed controller mutation", async () => {
  const candidate = { patchId: "pt_1", scope: { clipSid: "clip" }, operations: [], rationale: "x", reversibility: "self-inverse", risk: "low", previewClipSid: "clip", undoLabel: "x" };
  const append = vi.fn(), evict = vi.fn();
  const service = new EditService({ candidateStore: { get: () => candidate, evict } as any, patchHistory: { append } as any, applyPatchOverBridge: async () => ({ applied: 0, failed: 1 }) });
  const result = await service.apply({ selection: { clipSid: "clip" } } as any, null, "live", { patchId: "pt_1" });
  expect(result.payload).toMatchObject({ ok: false, error: "apply_failed" }); expect(append).not.toHaveBeenCalled(); expect(evict).not.toHaveBeenCalled();
}));

// ---------------------------------------------------------------------------
// Automation apply path (Phase 5 05-05 Task 3 — D-05-05/06/07/08/10).
//
// The gate ladder order pinned by plan Test 2:
//   state_disconnected → candidate/validation → wrong_device_targeted →
//   transport (write-arm) gates → confirmation.
// The transport-gate internal order (pinned here):
//   automation_write_disabled → ambiguous_target (launcher lane) →
//   automation_override_active.
// ---------------------------------------------------------------------------

const AUTO_SCOPE = { deviceSid: "dev_0123456789abcdef", paramIndex: 5, paramSource: "remote_page", region: { startBar: 0, lengthBars: 8 } } as const;
const AUTO_OPS: AutomationOp[] = [
  { op: "automation_points", points: [{ beat: 0, value: 0.5 }, { beat: 4, value: 1 }] },
  { op: "set_parameter_value", value: 0.8 },
];

function autoCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { patchId: "pt_auto1", scope: AUTO_SCOPE, operations: AUTO_OPS, rationale: "swell", reversibility: "self-inverse", risk: "medium", previewClipSid: "", undoLabel: "auto swell", ...overrides };
}

/** The live write-arm fold shape (state.project.transport.automationWrite). */
function arm(overrides: Record<string, unknown> = {}) {
  return { arrangerWriteEnabled: true, launcherWriteEnabled: false, overrideActive: false, writeMode: "latch", ...overrides };
}

/** A live RawState with the given selected device + write-arm fold. */
function autoState(selection: Record<string, unknown> = { deviceSid: AUTO_SCOPE.deviceSid }, automationWrite: unknown = arm()): Record<string, unknown> {
  const project: Record<string, unknown> = { name: "throwaway", tempo: 120, timeSignature: "4/4" };
  if (automationWrite !== null) (project as { transport?: unknown }).transport = { automationWrite };
  return { version: "1.0", project, selection };
}

function autoService(opts: { candidate?: Record<string, unknown>; bridge?: unknown } = {}) {
  const candidate = opts.candidate ?? autoCandidate();
  const bridge = (opts.bridge ?? vi.fn(async () => ({ applied: 2, failed: 0, capturedPriorValue: 0.25 }))) as ReturnType<typeof vi.fn>;
  const append = vi.fn(), evict = vi.fn();
  const service = new EditService({
    candidateStore: { get: () => candidate, evict } as any,
    patchHistory: { append } as any,
    applyPatchOverBridge: bridge as any,
  });
  return { service, bridge, append, evict };
}

describe("EditService automation apply — gate ladder precedence (Test 2)", () => {
  it("wrong device + unarmed + stopped → wrong_device_targeted (the FIRST gate wins; bridge never called)", async () => {
    // Transport stopped (playing:false), write disabled, AND the cursor device
    // differs — the documented ladder puts the identity compare BEFORE the
    // write-arm gates, so wrong_device_targeted is the surfaced refusal.
    const { service, bridge, append } = autoService();
    const state = autoState({ deviceSid: "dev_ffffffffffffffff" }, arm({ arrangerWriteEnabled: false, launcherWriteEnabled: false }));
    (state.project as { transport: unknown }).transport = { playing: false, automationWrite: arm({ arrangerWriteEnabled: false, launcherWriteEnabled: false }) };
    const result = await service.apply(state as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("wrong_device_targeted");
    expect(bridge).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
});

describe("EditService automation apply — named refusals from folded state (Tests 3-4)", () => {
  it("write-arm unobserved (no automationWrite fold) → automation_write_disabled (never risk a silent no-op)", async () => {
    const { service, bridge } = autoService();
    const result = await service.apply(autoState({ deviceSid: AUTO_SCOPE.deviceSid }, null) as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("automation_write_disabled");
    expect((result.details as Record<string, unknown>).hint).toBeTruthy();
    expect(bridge).not.toHaveBeenCalled();
  });

  it("neither arranger nor launcher write enabled → automation_write_disabled (THE operative gate — armed+stopped writes, unarmed is a silent no-op)", async () => {
    const { service, bridge } = autoService();
    const state = autoState({ deviceSid: AUTO_SCOPE.deviceSid }, arm({ arrangerWriteEnabled: false, launcherWriteEnabled: false }));
    const result = await service.apply(state as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("automation_write_disabled");
    expect((result.details as Record<string, unknown>).hint).toContain("write");
    expect(bridge).not.toHaveBeenCalled();
  });

  it("live selected-device identity unverifiable from folds → ambiguous_target (D-05-06 never a guess-write)", async () => {
    const { service, bridge } = autoService();
    const result = await service.apply(autoState({}) as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ambiguous_target");
    expect(bridge).not.toHaveBeenCalled();
  });

  it("launcher-armed-only (clip/launcher lane) → ambiguous_target (launcher path UNVERIFIED live — D-05-06)", async () => {
    const { service, bridge } = autoService();
    const state = autoState({ deviceSid: AUTO_SCOPE.deviceSid }, arm({ arrangerWriteEnabled: false, launcherWriteEnabled: true }));
    const result = await service.apply(state as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ambiguous_target");
    expect(bridge).not.toHaveBeenCalled();
  });

  it("override active (arranger armed) → automation_override_active", async () => {
    const { service, bridge } = autoService();
    const state = autoState({ deviceSid: AUTO_SCOPE.deviceSid }, arm({ overrideActive: true }));
    const result = await service.apply(state as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("automation_override_active");
    expect((result.details as Record<string, unknown>).hint).toBeTruthy();
    expect(bridge).not.toHaveBeenCalled();
  });

  it("candidate deviceSid ≠ live selected device → wrong_device_targeted with {expectedDeviceSid, actualDeviceSid, hint} BEFORE any bridge round-trip (Test 4)", async () => {
    const { service, bridge } = autoService();
    const result = await service.apply(autoState({ deviceSid: "dev_aaaaaaaaaaaaaaaa" }) as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("wrong_device_targeted");
    expect(result.details).toMatchObject({ expectedDeviceSid: AUTO_SCOPE.deviceSid, actualDeviceSid: "dev_aaaaaaaaaaaaaaaa" });
    expect(typeof (result.details as Record<string, unknown>).hint).toBe("string");
    expect(bridge).not.toHaveBeenCalled();
  });
});

describe("EditService automation apply — confirmation gate (Test 5, EDIT-06)", () => {
  it("medium automation candidate without confirm → confirmation_required; bridge not called", async () => {
    const { service, bridge } = autoService();
    const result = await service.apply(autoState() as any, null, "live", { patchId: "pt_auto1" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("confirmation_required");
    expect(bridge).not.toHaveBeenCalled();
  });
});

describe("EditService automation apply — prior freeze + journal stamping (Tests 6-7)", () => {
  it("successful apply stamps automationBinding {deviceSid, paramIndex, paramSource, priorValue} + frozen buildAutomationInverse output (D-05-07, INV-14)", async () => {
    const { service, append, evict } = autoService();
    const result = await service.apply(autoState() as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(true);
    expect(append).toHaveBeenCalledTimes(1);
    const entry = append.mock.calls[0][0] as PatchHistoryEntry;
    expect(entry.automationBinding).toEqual({ deviceSid: AUTO_SCOPE.deviceSid, paramIndex: 5, paramSource: "remote_page", priorValue: 0.25 });
    expect(entry.inverseOperations).toEqual(buildAutomationInverse(AUTO_OPS, 0.25));
    expect(evict).toHaveBeenCalledWith("pt_auto1");
  });

  it("bridge response WITHOUT capturedPriorValue → prior_unavailable, journals nothing, never a guessed inverse (Test 7)", async () => {
    const bridge = vi.fn(async () => ({ applied: 2, failed: 0 }));
    const { service, append, evict } = autoService({ bridge });
    const result = await service.apply(autoState() as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("prior_unavailable");
    expect((result.details as Record<string, unknown>).hint).toBeTruthy();
    expect(append).not.toHaveBeenCalled();
    expect(evict).not.toHaveBeenCalled();
  });
});

describe("EditService automation + legacy revert (Test 8)", () => {
  function revertService(entry: Record<string, unknown>) {
    const bridge = vi.fn(async () => ({ applied: 2, failed: 0 }));
    const append = vi.fn();
    const service = new EditService({
      candidateStore: {} as any,
      patchHistory: { find: async () => entry, append, stampReverted: vi.fn() } as any,
      applyPatchOverBridge: bridge as any,
    });
    return { service, bridge, append };
  }

  it("revert of a legacy journal entry lacking automationBinding proceeds caveated (assumptions surfaced), not refused", async () => {
    // A pre-Phase-5 note entry: no automationBinding, no clipSid (pre-03.1 fix).
    const entry = { patchId: "pt_old", scope: { clipSid: "clip_0123456789abcdef" }, operations: [{ op: "add_note", note: { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.5, velocity: 100 } }], inverseOperations: [{ op: "remove_note", note: { key: "n:60:0.0000", pitch: 60, start: 0, length: 0.5, velocity: 100 } }], appliedAt: 1, stateHashBefore: "clip:x", risk: "low" };
    const { service, bridge, append } = revertService(entry);
    const result = await service.revert({ selection: { clipSid: "clip_0123456789abcdef" } } as any, null, "live", "pt_old");
    expect(result.ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(1);
    // Caveat surfaced honestly (the clipSid-migration mirror).
    expect(result.assumptions.some((a) => /pre-binding|unverified/i.test(a.claim))).toBe(true);
  });

  it("automation entry with matching live device reverts through the frozen inverse; mismatch → wrong_device_targeted without a bridge call", async () => {
    const entry = { patchId: "pt_auto2", scope: AUTO_SCOPE, operations: AUTO_OPS, inverseOperations: buildAutomationInverse(AUTO_OPS, 0.25), appliedAt: 1, stateHashBefore: "automation:x", risk: "medium", undoLabel: "auto swell", automationBinding: { deviceSid: AUTO_SCOPE.deviceSid, paramIndex: 5, paramSource: "remote_page", priorValue: 0.25 } };
    const { service: s1, bridge: b1 } = revertService(entry);
    const ok = await s1.revert(autoState() as any, null, "live", "pt_auto2");
    expect(ok.ok).toBe(true);
    expect(b1).toHaveBeenCalledWith("revert auto swell", entry.inverseOperations, AUTO_SCOPE);

    const { service: s2, bridge: b2 } = revertService(entry);
    const refused = await s2.revert(autoState({ deviceSid: "dev_aaaaaaaaaaaaaaaa" }) as any, null, "live", "pt_auto2");
    expect(refused.ok).toBe(false);
    expect(refused.error).toBe("wrong_device_targeted");
    expect(b2).not.toHaveBeenCalled();
  });

  it("automation entry WITHOUT automationBinding (legacy/partial) reverts caveated, not refused", async () => {
    const entry = { patchId: "pt_auto3", scope: AUTO_SCOPE, operations: AUTO_OPS, inverseOperations: buildAutomationInverse(AUTO_OPS, 0.25), appliedAt: 1, stateHashBefore: "automation:x", risk: "medium", undoLabel: "auto swell" };
    const { service, bridge } = revertService(entry);
    const result = await service.revert(autoState() as any, null, "live", "pt_auto3");
    expect(result.ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(result.assumptions.some((a) => /automationBinding|provenance|unverified/i.test(a.claim))).toBe(true);
  });
});

describe("EditService automation apply — D-05-08 execute-immediately (Test 10, structural)", () => {
  it("the apply path contains no timer/queueing machinery — execution is immediate-after-gates", async () => {
    const src = await readFile(fileURLToPath(new URL("./edit-service.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/\b(setTimeout|setInterval|queueMicrotask)\b/);
    expect(src).not.toMatch(/schedul/i);
  });
});

describe("EditService automation apply — scope rides the wire (deferred-items gap closure)", () => {
  // The bridge resolves automation targets from payload.scope.{paramIndex,
  // paramSource} (PullHandlers.handleApplyPatch reads them); ops carry values
  // only. Until the scope rides the wire every automation op fails honestly
  // per-op (unresolvable target) — deferred-items 05-06/05-08.
  it("applyAutomation passes the AutomationScope as the third applyPatchOverBridge arg", async () => {
    const { service, bridge } = autoService();
    const result = await service.apply(autoState() as any, null, "live", { patchId: "pt_auto1", confirm: true });
    expect(result.ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(1);
    const [undoLabel, operations, scope] = bridge.mock.calls[0];
    expect(undoLabel).toBe("auto swell");
    expect(operations).toBe(AUTO_OPS as any);
    expect(scope).toEqual(AUTO_SCOPE);
  });

  it("revertAutomation passes the entry scope on the wire too (revert re-targets the same param)", async () => {
    const { service, bridge, append } = autoService();
    await service.apply(autoState() as any, null, "live", { patchId: "pt_auto1", confirm: true });
    const entry = append.mock.calls[0][0];
    expect(entry.automationBinding).toMatchObject({ deviceSid: AUTO_SCOPE.deviceSid, priorValue: 0.25 });
    // The revert path reads the journal — serve the entry the apply just wrote.
    (service as any).deps.patchHistory.find = vi.fn(async () => entry);
    bridge.mockClear();
    const reverted = await service.revert(autoState() as any, null, "live", "pt_auto1");
    expect(reverted.ok).toBe(true);
    expect(bridge).toHaveBeenCalledTimes(1);
    const [, , scope] = bridge.mock.calls[0];
    expect(scope).toEqual(AUTO_SCOPE);
  });

  it("the clip path still calls applyPatchOverBridge with two args (scope undefined — clip targeting is previewClipSid-based)", async () => {
    const candidate = { patchId: "pt_clip", scope: { clipSid: "clip_a" }, operations: [{ op: "add_note", pitch: 60, start: 0, duration: 1, velocity: 100 }], rationale: "x", reversibility: "self-inverse", risk: "low", previewClipSid: "clip_a", undoLabel: "clip edit" };
    const bridge = vi.fn(async () => ({ applied: 1, failed: 0 }));
    const service = new EditService({ candidateStore: { get: () => candidate, evict: vi.fn() } as any, patchHistory: { append: vi.fn() } as any, applyPatchOverBridge: bridge as any });
    const res = await service.apply({ selection: { clipSid: "clip_a" } } as any, null, "live", { patchId: "pt_clip" });
    expect(res.ok).toBe(true);
    expect(bridge.mock.calls[0][2]).toBeUndefined();
  });
});
