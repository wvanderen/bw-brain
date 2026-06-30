// daemon/src/store/boundary.test.ts
//
// MEM-02 / SC#5 architectural gate (RESEARCH.md lines 846, 1489;
// 02-PATTERNS.md Assignment 11 lines 395-417). The boundary asserts the
// daemon's CLI→daemon query channel EXCLUDES ephemeral writes: every op in
// cli-query/query.schema.json must be a known allowlisted query op. M1 ops are
// read-only; Phase 3 adds daemon-mediated edit/MIDI ops (edit.preview/apply/
// revert + midi.vary/counterline/voice_leading_fix/humanize). The durable-write
// path for `edit.apply` is daemon-mediated via the D-03 spine — the CLI itself
// never writes to `.bw-brain/`, so MEM-02 holds.
//
// Source: check-capabilities-doc.mjs lines 84-143 (structural-validator shape).

import { describe, it, expect } from "vitest";
import { checkMemoryBoundary } from "./boundary.js";
import querySchema from "../../../schemas/cli-query/query.schema.json" with { type: "json" };

describe("checkMemoryBoundary (MEM-02 / SC#5 — no ephemeral-write op)", () => {
  it("the REAL cli-query query.schema.json passes (no ephemeral-write op)", () => {
    const errors = checkMemoryBoundary(querySchema);
    expect(errors).toEqual([]);
  });

  it("the real schema's op enum is the expected allowlisted set", () => {
    // Sanity: the enum we're gating is the one we think it is. Phase 3 extends
    // the M1 read-only 6 with the daemon-mediated edit + MIDI transform ops.
    const ops = querySchema.properties?.op?.enum;
    expect(ops).toEqual([
      "focus.export",
      "project.summary",
      "project.region",
      "midi.inspect",
      "device.inspect",
      "diff",
      "edit.preview",
      "edit.apply",
      "edit.revert",
      "midi.vary",
      "midi.counterline",
      "midi.voice_leading_fix",
      "midi.humanize",
    ]);
  });

  it("a FAKE schema with an ephemeral-write op ('experiment.save') FAILS the gate", () => {
    const fake = {
      properties: {
        op: {
          enum: ["focus.export", "experiment.save"],
        },
      },
    };
    const errors = checkMemoryBoundary(fake);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("experiment.save"))).toBe(true);
  });

  it("a FAKE schema with 'state.cache.write' FAILS the gate", () => {
    const fake = {
      properties: { op: { enum: ["project.summary", "state.cache.write"] } },
    };
    const errors = checkMemoryBoundary(fake);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("state.cache.write"))).toBe(true);
  });

  it("a schema with ONLY allowed ops passes even if the set is a subset", () => {
    const subset = {
      properties: { op: { enum: ["focus.export", "diff"] } },
    };
    const errors = checkMemoryBoundary(subset);
    expect(errors).toEqual([]);
  });

  it("a schema with an empty op enum passes vacuously (no op to violate)", () => {
    const empty = { properties: { op: { enum: [] } } };
    const errors = checkMemoryBoundary(empty);
    expect(errors).toEqual([]);
  });

  it("a schema missing the op.enum entirely passes vacuously (nothing to check)", () => {
    const noEnum = { properties: { op: {} } };
    const errors = checkMemoryBoundary(noEnum);
    expect(errors).toEqual([]);
  });

  it("returns one error PER violating op (not just the first)", () => {
    const fake = {
      properties: {
        op: {
          enum: ["experiment.save", "ephemeral.dump", "focus.export"],
        },
      },
    };
    const errors = checkMemoryBoundary(fake);
    expect(errors.length).toBe(2);
  });
});
