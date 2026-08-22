// daemon/src/store/boundary.ts
//
// MEM-02 / SC#5 architectural gate (RESEARCH.md lines 846, 1489;
// 02-PATTERNS.md Assignment 11 lines 395-417). Asserts the daemon's
// durable-write API surface EXCLUDES ephemeral writes: the
// cli-query/query.schema.json op enum has NO op that writes ephemeral data to
// .bw-brain/. All M1 ops are read-only; the only durable-write path
// (apply.patch) lands in M2 via a SEPARATE edit schema, NOT cli-query.
//
// This is the MEM-02 boundary unit test (SC#5). It is a pure allowlist gate:
// every op in the schema's op enum MUST be a known read-only cli-query op.
// An unknown op (e.g. "experiment.save") fails the gate. This is stronger
// than a denylist — an allowlist catches novel ephemeral-write ops by default.
//
// The validator shape mirrors scripts/check-capabilities-doc.mjs lines 84-143
// (structural validator returning an errors[] array; main() exits non-zero on
// failure). When this module is executed directly it runs the gate against the
// real query schema and exits 1 on violation.

import querySchema from "../../../schemas/cli-query/query.schema.json" with { type: "json" };

/**
 * The allowed cli-query op set. Every op in cli-query/query.schema.json's enum
 * MUST be in this set. MEM-02 / SC#5 invariant: no op causes a DIRECT CLI-side
 * write of ephemeral data to `.bw-brain/`. Phase 1/2 ops are read-only.
 *
 * Phase 3 (EDIT-02/04/05, MIDI-02..05) adds `edit.preview/apply/revert` and
 * `midi.vary/counterline/voice_leading_fix/humanize`:
 *   - `edit.apply` triggers a durable patch-history.jsonl append, BUT the write
 *     is daemon-mediated through the D-03 daemon-authoritative spine (the
 *     candidate store stays EPHEMERAL in-memory; the journal append happens
 *     only after a successful bridge apply.patch round-trip). The CLI never
 *     writes directly. MEM-02 holds.
 *   - `edit.preview/revert` and the `midi.*` transform ops query/transform
 *     state in the daemon; they cause no CLI-side durable write at all.
 */
const ALLOWED_QUERY_OPS: ReadonlySet<string> = new Set([
  // Phase 1/2 — read-only context ops.
  "focus.export",
  "project.summary",
  "project.region",
  "midi.inspect",
  "device.inspect",
  "diff",
  // Phase 3 — daemon-mediated edit + MIDI transform ops (see comment above).
  "edit.preview",
  "edit.apply",
  "edit.revert",
  "midi.vary",
  "midi.counterline",
  "midi.voice_leading_fix",
  "midi.humanize",
  // Phase 4 — arrangement intelligence (ARRANGE-01..05, UX-03). Read from the
  // durable arrangement snapshot; arrange.refresh re-pulls the grid + re-runs
  // analyzers. No ephemeral writes — the snapshot + roles.json are atomic
  // daemon-mediated durable writes (same trust-spine as edit.apply).
  "arrange.sections",
  "arrange.repetition_report",
  "arrange.energy_curve",
  "arrange.review",
  "arrange.current_section",
  "arrange.refresh",
  // Phase 5 (05-04 — AUTO-01) — automation salience. Reads the folded
  // movement aggregates + the durable salience snapshot; a refresh analyzes +
  // persists salience-snapshot.json. Same arrange.refresh class: atomic
  // daemon-mediated durable write, no CLI-side ephemeral write. MEM-02 holds.
  "automation.inspect",
  // Phase 5 (05-07 — AUTO-02) — advisory macro/XY suggestions. Reads the SAME
  // durable salience snapshot through the same 05-04 path; refresh shares the
  // automation.inspect refresh class. Purely advisory output (D-05-09) —
  // zero mutation surface anywhere on this op. MEM-02 holds.
  "device.macros_suggest",
]);

/**
 * Structural shape of a cli-query query schema — the subset this gate reads.
 * Kept loose so a test can pass a FAKE schema (the "experiment.save" counter-
 * test) without satisfying the full JSONSchema type.
 */
export interface QuerySchemaShape {
  properties?: {
    op?: {
      enum?: string[];
    };
  };
}

/**
 * MEM-02 / SC#5 boundary check. Enumerates the op enum in `schema` and asserts
 * every op is a known read-only cli-query op.
 *
 * @returns an array of error messages (empty = pass). One error per violating
 *   op, so a multi-violation schema reports all of them.
 *
 * Allowlist semantics: an op fails iff it is NOT in the allowed set. This
 * catches novel ephemeral-write ops by default — a future op like
 * "experiment.save" would fail until explicitly allowlisted (which would be a
 * MEM-02 review signal).
 */
export function checkMemoryBoundary(schema: QuerySchemaShape): string[] {
  const errors: string[] = [];
  const ops: string[] = schema.properties?.op?.enum ?? [];
  for (const op of ops) {
    if (!ALLOWED_QUERY_OPS.has(op)) {
      errors.push(
        `op "${op}" is not an allowed cli-query op (MEM-02 / SC#5: no ephemeral-write op in the query channel)`,
      );
    }
  }
  return errors;
}

// --- main() guard — run when executed directly (mirrors check-capabilities-doc.mjs) ---
//
// `node --experimental-strip-types src/store/boundary.ts` (or tsx) runs the
// gate against the real query schema and exits non-zero on violation. The
// vitest suite covers the assertion in CI; this guard covers ad-hoc invocations.
const isMain =
  typeof process !== "undefined" &&
  typeof process.argv[1] === "string" &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  const errors = checkMemoryBoundary(querySchema);
  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error("\ncli-query query.schema.json failed MEM-02 boundary check.");
    process.exit(1);
  }
  process.stdout.write("✓ cli-query query.schema.json passed MEM-02 boundary check.\n");
  process.exit(0);
}
