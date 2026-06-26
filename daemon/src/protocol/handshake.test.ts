// daemon/src/protocol/handshake.test.ts
//
// SC#3 version-handshake rule made executable (RESEARCH.md §Validation row
// PROBE-02/SC#3 handshake, line 581; Pattern 3). Three cases from
// 01-02-PLAN.md Task 2 <behavior>:
//   1. matching major.minor => ok true, serverVersion echoed.
//   2. major mismatch        => ok false (reject — prevents protocol-drift
//      silent corruption, RESEARCH.md §Security, T-2-03).
//   3. same major, different minor => ok true (minor is advisory).
//
// negotiateVersion is pure + framework-free, so this needs no sockets.
import { describe, it, expect } from "vitest";
import { negotiateVersion } from "./handshake.js";

describe("negotiateVersion (SC#3 version handshake — drift prevention)", () => {
  it("accepts an exact major.minor match", () => {
    expect(negotiateVersion("1.0", "1.0")).toEqual({ ok: true, serverVersion: "1.0" });
  });

  it("rejects a major-version mismatch", () => {
    expect(negotiateVersion("2.0", "1.0")).toEqual({ ok: false });
  });

  it("accepts same-major different-minor (minor is advisory)", () => {
    expect(negotiateVersion("1.5", "1.3")).toEqual({ ok: true, serverVersion: "1.3" });
  });
});
