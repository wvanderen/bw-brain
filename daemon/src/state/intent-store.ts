// daemon/src/state/intent-store.ts
//
// STATE-03 user-authored intent read (D-09). Does an atomic validated read of
// <project>/.bw-brain/intent.json. NO inference, NO defaults — an absent file
// returns null (the daemon never synthesizes an intent). An invalid file
// throws a structured error carrying the Ajv errors so a user can see WHY.
//
// M1 is read-only (D-09 — user authors intent by hand). NO write path exists
// in this module (grep for writeFile/fs.writeFile returns nothing).
//
// The validate-on-read mirrors reader.ts lines 155-172 (validate-then-process
// + drop-never-throw at the boundary). Ajv is constructed and the validator
// COMPILED ONCE at module load (AGENTS.md 64-65 standalone-compiled pattern).
//
// Source: 02-PATTERNS.md Assignment 9 lines 352-363 + RESEARCH.md D-09 line 27.

import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import intentSchema from "../../../schemas/intent.schema.json" with { type: "json" };
import type { ProjectIntent } from "../gen/intent.js";

// Ajv2020 = JSON Schema Draft 2020-12 mode. Named import + .js ext required
// under module:NodeNext (ajv 8.20 ships no exports map). addFormats NOT applied
// (no frozen schema uses `format` — verified; see schemas.test.ts rationale).
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(intentSchema);
const validateIntent = ajv.getSchema(intentSchema.$id)!;

/**
 * Load + validate <project>/.bw-brain/intent.json.
 *
 * @returns the validated {@link ProjectIntent} (the full file: version +
 *   projectIntent), or `null` if the file is ABSENT.
 * @throws Error("intent.json invalid: <ajv errors>") if the file exists but
 *   fails schema validation. The thrown message carries the Ajv errors JSON
 *   so a user can see exactly which constraint was violated.
 *
 * D-09: an absent file returns null — the daemon NEVER infers or synthesizes
 * a default intent. A missing intent.json is a valid state ("the user has not
 * authored intent yet"), not an error.
 *
 * Note on the return shape: the gen type `ProjectIntent` is the WHOLE file
 * ({version, projectIntent: {summary, constraints?, targets?}}). The validated
 * file object is returned as-is so the analyzer-registry ctx.intent + the
 * query-server getIntent() share one type. Callers access intent via
 * `result.projectIntent.summary` etc.
 */
export async function loadIntent(path: string): Promise<ProjectIntent | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: unknown) {
    // Absent file -> null (D-09: NO inference, NO defaults). Any other I/O
    // error (permissions, etc.) rethrows — only ENOENT is the "absent" case.
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`intent.json invalid: not valid JSON (${path})`);
  }

  if (!validateIntent(parsed)) {
    throw new Error(`intent.json invalid: ${JSON.stringify(validateIntent.errors)}`);
  }

  return parsed as ProjectIntent;
}
