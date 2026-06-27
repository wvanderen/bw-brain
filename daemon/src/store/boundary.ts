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
 * The allowed read-only cli-query op set in M1. Every op in
 * cli-query/query.schema.json's enum MUST be in this set. The only durable-
 * write path (apply.patch) lands in M2 via a SEPARATE edit schema, NOT here.
 */
const ALLOWED_READ_ONLY_OPS: ReadonlySet<string> = new Set([
  "focus.export",
  "project.summary",
  "project.region",
  "midi.inspect",
  "device.inspect",
  "diff",
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
    if (!ALLOWED_READ_ONLY_OPS.has(op)) {
      errors.push(
        `op "${op}" is not an allowed read-only cli-query op (MEM-02 / SC#5: no ephemeral-write op in the query channel)`,
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
