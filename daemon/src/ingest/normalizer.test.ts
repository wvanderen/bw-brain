// daemon/src/ingest/normalizer.test.ts
//
// STATE-01 raw-state normalization. The normalizer is the SECOND-stage
// validator (after the envelope): it receives an Ajv-validated envelope payload
// and produces a RawState validated against schemas/project-state.schema.json.
// Invalid -> drop + log, NEVER throw (Shared Pattern E: validate-at-boundary).
//
// Pitfall 2 defense: a slot-index trackSid like "trk_5" is structurally invalid
// (the ^trk_[0-9a-f]{16}$ regex rejects it) and must drop.
//
// Source: 02-PATTERNS.md Assignment 5 lines 227-257 + Shared Pattern E.

import { describe, it, expect } from "vitest";
import { normalize } from "./normalizer.js";
import type { RawState } from "../state/reconcile.js";

/** A valid raw-state fixture (STATE-01 happy path). */
function validRaw(): RawState {
  return {
    version: "1.0",
    project: { name: "Demo", tempo: 128, timeSignature: "4/4" },
    selection: {
      trackSid: "trk_0123456789abcdef",
      clipSid: "clip_0123456789abcdef",
    },
  };
}

describe("normalize (STATE-01 — second-stage schema validator)", () => {
  it("returns RawState for a valid payload", () => {
    const out = normalize(validRaw());
    expect(out).not.toBeNull();
    expect(out!.version).toBe("1.0");
    expect(out!.project.tempo).toBe(128);
    expect(out!.selection.trackSid).toBe("trk_0123456789abcdef");
  });

  it("returns null for a payload missing the required version", () => {
    const bad = validRaw() as unknown as Record<string, unknown>;
    delete bad.version;
    expect(normalize(bad)).toBeNull();
  });

  it("returns null for a payload missing the required project block", () => {
    const bad = validRaw() as unknown as Record<string, unknown>;
    delete bad.project;
    expect(normalize(bad)).toBeNull();
  });

  it("returns null for a payload missing the required selection block", () => {
    const bad = validRaw() as unknown as Record<string, unknown>;
    delete bad.selection;
    expect(normalize(bad)).toBeNull();
  });

  it("returns null when project is missing a required field (tempo)", () => {
    const bad = validRaw();
    delete (bad.project as Record<string, unknown>).tempo;
    expect(normalize(bad)).toBeNull();
  });

  it("Pitfall 2: returns null for a slot-index trackSid like 'trk_5' (regex gate)", () => {
    const bad = validRaw();
    bad.selection.trackSid = "trk_5"; // bare slot index — NOT a fingerprint
    expect(normalize(bad)).toBeNull();
  });

  it("Pitfall 2: returns null for a slot-index clipSid like 'clip_19'", () => {
    const bad = validRaw();
    bad.selection.clipSid = "clip_19";
    expect(normalize(bad)).toBeNull();
  });

  it("Pitfall 2: returns null for a slot-index deviceSid like 'dev_2'", () => {
    const bad = validRaw();
    bad.selection.deviceSid = "dev_2";
    expect(normalize(bad)).toBeNull();
  });

  it("accepts a fingerprint trackSid of the correct shape (trk_ + 16 hex)", () => {
    const good = validRaw();
    good.selection.trackSid = "trk_deadbeefcafebabe";
    expect(normalize(good)).not.toBeNull();
  });

  it("drops NEVER throws (Shared Pattern E — invalid payload returns null, does not throw)", () => {
    const bad = { totally: "unrelated" };
    expect(() => normalize(bad)).not.toThrow();
    expect(normalize(bad)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalize(null)).toBeNull();
  });

  it("returns null for a non-object input", () => {
    expect(normalize("not an object")).toBeNull();
    expect(normalize(42)).toBeNull();
    expect(normalize([])).toBeNull();
  });

  it("automation array MUST be empty in M1 (maxItems 0 — D-04)", () => {
    const bad = validRaw();
    // @ts-expect-error — deliberately violate the reserved-empty slot
    bad.automation = [{ anything: true }];
    expect(normalize(bad)).toBeNull();
  });

  it("accepts an explicitly-empty automation array", () => {
    const good = validRaw();
    good.automation = [];
    expect(normalize(good)).not.toBeNull();
  });

  it("version must match the ^\\d+\\.\\d+$ pattern", () => {
    const bad = validRaw();
    bad.version = "v1.0.0";
    expect(normalize(bad)).toBeNull();
  });
});
