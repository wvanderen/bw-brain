// daemon/src/state/fingerprint.test.ts
//
// SC#3 STATE-04 fingerprint property + unit tests (RESEARCH.md §Validation row
// STATE-04 (fingerprint) line 1392; 02-03a-PLAN.md Task 1 <behavior>; Shared
// Pattern H — pure-function unit cases + @example assertions).
//
// fingerprint() is PURE + framework-free (no sockets, files, or clocks), so
// these need no mocks. Three property classes:
//   1. Determinism — same input always yields the same 16-hex-char id.
//   2. Distinctness — any single component change yields a different id
//      (neighbors, contentHash, name, type).
//   3. Shape — the id matches project-state.schema.json's selection.*Sid body
//      pattern [0-9a-f]{16}$; mintSid produces the full ^{trk|clip|dev}_[0-9a-f]{16}$.
//
// ESM + NodeNext: .js import extensions (AGENTS.md convention; handshake.test.ts
// lines 12-13 shape).
import { describe, it, expect } from "vitest";
import { fingerprint, mintSid, FingerprintInput } from "./fingerprint.js";

const BASE: FingerprintInput = {
  name: "Kick",
  type: "track",
  neighbors: ["Bass", "Lead"],
  contentHash: "abc123",
};

describe("fingerprint (SC#3 STATE-04 — deterministic + distinct)", () => {
  it("is deterministic: same input twice → same id", () => {
    const a = fingerprint(BASE);
    const b = fingerprint({ ...BASE });
    expect(a).toBe(b);
  });

  it("returns a 16-char lowercase-hex string", () => {
    const id = fingerprint(BASE);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id.length).toBe(16);
    expect(id).toBe(id.toLowerCase());
  });

  it("differs when only `neighbors` differ (reorder/neighbor change)", () => {
    const a = fingerprint(BASE);
    const b = fingerprint({ ...BASE, neighbors: ["Bass", "Hats"] });
    expect(a).not.toBe(b);
  });

  it("differs when only `contentHash` differ (content edit)", () => {
    const a = fingerprint(BASE);
    const b = fingerprint({ ...BASE, contentHash: "xyz789" });
    expect(a).not.toBe(b);
  });

  it("differs when only `name` differ (rename)", () => {
    const a = fingerprint(BASE);
    const b = fingerprint({ ...BASE, name: "Kick Main" });
    expect(a).not.toBe(b);
  });

  it("differs when only `type` differ (track vs clip with same name)", () => {
    const a = fingerprint(BASE);
    const b = fingerprint({ ...BASE, type: "clip" });
    expect(a).not.toBe(b);
  });

  it("treats neighbor array order as significant within the pair", () => {
    // The fingerprint hashes the neighbors array as-is; the CALLER sorts (per
    // the FingerprintInput contract). Two different orderings produce different
    // ids — proving the caller must canonicalize.
    const a = fingerprint({ ...BASE, neighbors: ["Bass", "Lead"] });
    const b = fingerprint({ ...BASE, neighbors: ["Lead", "Bass"] });
    expect(a).not.toBe(b);
  });
});

describe("mintSid (STATE-04 — prefixed stable ID)", () => {
  it("produces trk_<16hex> for type 'track'", () => {
    const sid = mintSid("track", BASE);
    expect(sid).toMatch(/^trk_[0-9a-f]{16}$/);
  });

  it("produces clip_<16hex> for type 'clip'", () => {
    const sid = mintSid("clip", { ...BASE, type: "clip" });
    expect(sid).toMatch(/^clip_[0-9a-f]{16}$/);
  });

  it("produces dev_<16hex> for type 'device'", () => {
    const sid = mintSid("device", { ...BASE, type: "device" });
    expect(sid).toMatch(/^dev_[0-9a-f]{16}$/);
  });

  it("matches project-state.schema.json's selection.*Sid combined pattern", () => {
    // The schema uses ^(trk|clip|dev)_[0-9a-f]{16}$ on all three selection
    // fields (Pitfall 2 defense — a bare Bitwig slot index like "trk_5" is
    // structurally invalid as identity).
    const sid = mintSid("track", BASE);
    expect(sid).toMatch(/^(trk|clip|dev)_[0-9a-f]{16}$/);
  });

  it("is deterministic (same type+input → same sid)", () => {
    expect(mintSid("track", BASE)).toBe(mintSid("track", { ...BASE }));
  });
});
