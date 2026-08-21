// daemon/src/protocol/correlator.test.ts
//
// RequestCorrelator — the get.* request/response-by-id primitive with a 3s
// timeout (RESEARCH.md Pattern 3 — bridge must respond promptly; bounds the
// CLI's worst-case wait). Mirrors handshake.ts documented-interface +
// defensive-throw discipline; NOT pure (owns a Map + timers) but the surface
// is small + honest.
//
// Case 7 is the Minor 4 transport-throws gate: RequestCorrelator.send wraps
// transport.send() in try/catch — TcpServerTransport.send (tcp.ts:88-92)
// throws synchronously when sockets.size===0; without the catch the
// {resolve,reject,timer} entry would leak with a dangling 3s timer.
//
// Source: 02-07-PLAN.md Task 1 <behavior>.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RequestCorrelator,
  DEFAULT_CORRELATOR_TIMEOUT_MS,
} from "./correlator.js";
import type { Transport } from "../transport/transport.js";

/** Recorded transport — captures every send() in `sent` for assertions. */
class FakeTransport {
  sent: object[] = [];
  send(msg: object): void {
    this.sent.push(msg);
  }
  onMessage(): void {}
  close(): void {}
}

/** A transport whose send() throws synchronously (Minor 4 fixture). */
class ThrowingTransport {
  send(_msg: object): void {
    throw new Error("no connected client");
  }
  onMessage(): void {}
  close(): void {}
}

/** Extract the id of the last-sent message (typed helper). */
function lastId(t: FakeTransport): string {
  const last = t.sent[t.sent.length - 1] as { id?: string };
  return last?.id ?? "";
}

describe("RequestCorrelator (get.* request/response by id with timeout)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("DEFAULT_CORRELATOR_TIMEOUT_MS is 3000ms (documented)", () => {
    expect(DEFAULT_CORRELATOR_TIMEOUT_MS).toBe(3_000);
  });

  it("send(type) returns a promise + the transport received {version,type,id,payload}", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const p = c.send("get.project_summary");
    // The transport received exactly one line with the right shape.
    expect(t.sent).toHaveLength(1);
    const sent = t.sent[0] as { version: string; type: string; id: string; payload: unknown };
    expect(sent.version).toBe("1.0");
    expect(sent.type).toBe("get.project_summary");
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/); // uuid
    expect(sent.payload).toEqual({});
    // Promise is pending.
    const pending = vi.fn();
    p.then(pending);
    await vi.advanceTimersByTimeAsync(1);
    expect(pending).not.toHaveBeenCalled();
    // Cleanup: resolve it so no dangling rejection leaks.
    c.resolve(sent.id, { ok: true });
    await p;
  });

  it("resolve(id, payload) resolves the promise with payload", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const p = c.send("get.project_summary");
    const id = lastId(t);
    c.resolve(id, { tracks: [{ slot: 0, name: "Kick" }] });
    await expect(p).resolves.toEqual({ tracks: [{ slot: 0, name: "Kick" }] });
    expect(c.outstanding()).toBe(0);
  });

  it("timeout (no response within timeoutMs) rejects with the timeout Error", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const p = c.send("get.project_summary");
    // Attach a noop handler up-front so the timer-flushed rejection does
    // not surface as an unhandled rejection before `expect().rejects` runs.
    const caught: Promise<Error> = p.then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_CORRELATOR_TIMEOUT_MS + 1);
    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/get\.project_summary timed out after 3000ms/);
    expect(c.outstanding()).toBe(0);
  });

  it("resolve() with an unknown id logs + does NOT throw (unsolicited-response gate)", () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => c.resolve("never-sent-id", { whatever: true })).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("close() rejects all pending promises with 'correlator closed' + outstanding()===0 after", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    // Attach catch handlers up-front so close()'s rejections are not
    // surfaced as unhandled before the awaits below. Type as Promise<Error>
    // so the awaited value carries `.message`.
    const p1: Promise<Error> = c.send("get.project_summary").then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    const p2: Promise<Error> = c.send("get.selected_clip").then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    expect(c.outstanding()).toBe(2);
    c.close();
    const e1 = await p1;
    const e2 = await p2;
    expect(e1).toBeInstanceOf(Error);
    expect(e2).toBeInstanceOf(Error);
    expect(e1.message).toMatch(/correlator closed/);
    expect(e2.message).toMatch(/correlator closed/);
    expect(c.outstanding()).toBe(0);
  });

  it("id is a unique uuid across two send() calls (uniqueness gate)", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    // Attach rejection handlers up-front so the cleanup close() does not
    // surface as an unhandled rejection.
    const p1: Promise<Error> = c.send("get.project_summary").then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    const p2: Promise<Error> = c.send("get.selected_clip").then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    const id1 = (t.sent[0] as { id: string }).id;
    const id2 = (t.sent[1] as { id: string }).id;
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);
    expect(id2).toMatch(/^[0-9a-f-]{36}$/);
    // Cleanup pending timers + settle the rejections.
    c.close();
    await Promise.all([p1, p2]);
  });

  it("Minor 4: transport.send() throws synchronously -> promise REJECTS + outstanding()===0 + no dangling timer after advanceTimersByTime(10_000)", async () => {
    const t = new ThrowingTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const p = c.send("get.project_summary");
    // The promise rejects with the underlying transport error.
    await expect(p).rejects.toThrow(/no connected client/);
    // The entry was deleted immediately; no dangling 3s timer.
    expect(c.outstanding()).toBe(0);
    // Advancing fake timers past the (cleared) timeout fires NO further
    // rejection + no unhandled error.
    const handled = vi.fn();
    p.catch(handled);
    await vi.advanceTimersByTimeAsync(10_000);
    // handled() was called exactly once (the immediate rejection); no second
    // invocation from a leaked timer.
    expect(handled).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // 04.3 Plan 04.3-07 Task 3 — DEFECT A (daemon half): per-request timeoutMs
  // override on send(). The launcher-grid walk's documented worst case
  // (5000ms BankSyncWait cap + 128 cells × 500ms D-22 ceiling ≈ 69s + margin)
  // exceeds the 3000ms default — a populated-but-slow first walk must no
  // longer be dropped as a timeout while a fast-empty predecessor poisons the
  // snapshot. Every other get.* pull keeps the default (per-REQUEST override
  // only — T-04.3-23).
  // ==========================================================================

  it("per-request timeoutMs SHORTER than the default rejects at the overridden deadline; message carries the effective value", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const p: Promise<Error> = c.send("get.launcher_clips", {}, { timeoutMs: 100 }).then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    await vi.advanceTimersByTimeAsync(100 + 1);
    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/get\.launcher_clips timed out after 100ms/);
    expect(c.outstanding()).toBe(0);
  });

  it("per-request timeoutMs LONGER than the default EXTENDS the deadline (pending at 3000ms, rejects only at the override)", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const p: Promise<Error> = c.send("get.launcher_clips", {}, { timeoutMs: 10_000 }).then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    let settled = false;
    void p.then(() => { settled = true; });
    // Still pending past the 3000ms default — the override extends, never caps.
    await vi.advanceTimersByTimeAsync(DEFAULT_CORRELATOR_TIMEOUT_MS + 1);
    expect(settled).toBe(false);
    expect(c.outstanding()).toBe(1);
    // Rejects only at the overridden deadline, with the effective value.
    await vi.advanceTimersByTimeAsync(10_000 - DEFAULT_CORRELATOR_TIMEOUT_MS + 1);
    const err = await p;
    expect(err.message).toMatch(/get\.launcher_clips timed out after 10000ms/);
    expect(c.outstanding()).toBe(0);
  });

  it("NO per-request opts keeps the instance-configured deadline (backward compatibility — existing message shape)", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport, { timeoutMs: 4_500 });
    const p: Promise<Error> = c.send("get.project_summary").then(
      () => new Error("unexpected resolve"),
      (e: unknown) => e as Error,
    );
    await vi.advanceTimersByTimeAsync(4_500 + 1);
    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/get\.project_summary timed out after 4500ms/);
    expect(c.outstanding()).toBe(0);
  });

  it("resolve() within the extended window settles the promise (a populated-but-slow grid walk completes instead of being dropped)", async () => {
    const t = new FakeTransport();
    const c = new RequestCorrelator(t as unknown as Transport);
    const payload = { tracks: [{ trackSid: "t1", name: "bass", scenes: [] }] };
    const p = c.send("get.launcher_clips", {}, { timeoutMs: 10_000 });
    // 5000ms in: past the 3000ms default but inside the override. The
    // late-but-legit response now RESOLVES instead of arriving after the
    // deadline and being dropped as unsolicited.
    await vi.advanceTimersByTimeAsync(5_000);
    c.resolve(lastId(t), payload);
    await expect(p).resolves.toEqual(payload);
    expect(c.outstanding()).toBe(0);
  });
});
