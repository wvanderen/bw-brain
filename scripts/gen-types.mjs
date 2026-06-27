#!/usr/bin/env node
// scripts/gen-types.mjs
//
// Generates daemon/src/gen/*.ts from schemas/protocol/*.schema.json.
//
// Why a custom script instead of the literal `json2ts -i ... -o ...`:
// json-schema-to-typescript uses @apidevtools/json-schema-ref-parser, which
// resolves cross-file `$ref`s against the referencing schema's base URI. Our
// schemas carry absolute `$id`s under the `https://bw-brain.local/schemas/protocol/`
// scheme (required by SC#3 / the plan's acceptance criteria). ref-parser then
// tries to fetch the resolved https URL — which fails (bw-brain.local is an
// internal contract URI, not a real host). json2ts also compiles each input
// file independently, so it has no shared `$id → schema` registry.
//
// This script builds that registry, dereferences (inlines) every `$ref` by
// `$id` lookup, then calls json-schema-to-typescript's programmatic `compile()`
// on each self-contained schema. The contract files stay pristine (runtime Ajv
// resolves `$ref` by `$id` correctly when all schemas are added to one instance);
// only the *generated* TS is produced from the dereffed copies.
//
// Idempotent: deterministic input → deterministic output. Re-running produces
// no diff. Generated files carry a DO-NOT-EDIT header (AGENTS.md line 64:
// generated files are committed for bridge-side readability).
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
// Phase 2 (Plan 02-01): scan THREE schema roots instead of one. The $id-based
// deref logic below (lines 53-109) ALREADY handles cross-dir $refs because it
// suffix-matches against the byId registry — no deref change needed, only the
// input-directory loop. Order is protocol → schemas → cli-query (deterministic
// so re-runs produce stable output ordering).
const SCHEMA_DIRS = [
  join(REPO_ROOT, "schemas", "protocol"),
  join(REPO_ROOT, "schemas"),
  join(REPO_ROOT, "schemas", "cli-query"),
];
const OUT_DIR = join(REPO_ROOT, "daemon", "src", "gen");

// json-schema-to-typescript lives in daemon/node_modules (it's a daemon devDep).
// From scripts/ (repo root) Node's ESM bare-specifier resolution won't find it,
// so anchor a CJS require at daemon's package.json.
const daemonRequire = createRequire(
  pathToFileURL(join(REPO_ROOT, "daemon", "package.json")).href,
);
const { compile } = daemonRequire("json-schema-to-typescript");

const BANNER = `/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by \`npm run gen:types\`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */`;

/**
 * Recursively dereference every $ref by $id lookup. A node that is just
 * { "$ref": "<uri>" } is replaced by the target schema (recursively dereffed);
 * sibling keys (rare in our schemas) are merged onto the inlined target.
 */
function derefNode(node, byId, seen) {
  if (Array.isArray(node)) {
    return node.map((n) => derefNode(n, byId, seen));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  if (typeof node.$ref === "string") {
    // Resolve the $ref against the JSON Schema base-URI rules: the ref is
    // interpreted relative to the nearest enclosing $id. We pass the absolute
    // resolved URI in `seen` to detect cycles.
    const abs = node.$ref.includes("://")
      ? node.$ref
      : null; // already absolute if it has a scheme; our refs are bare filenames resolved per-file below
    // Our schemas use bare-filename refs (e.g. "event.schema.json") which
    // resolve against the referencing file's $id (https://bw-brain.local/.../<name>).
    // Build the absolute $id the ref resolves to.
    const targetId = abs ?? node.$ref;
    // Try direct lookup (works for absolute $id refs), else try resolving as a
    // filename suffix against every known $id (handles "event.schema.json" →
    // "https://bw-brain.local/schemas/protocol/event.schema.json").
    let target = byId.get(targetId);
    if (!target) {
      for (const id of byId.keys()) {
        if (id.endsWith("/" + node.$ref) || id.endsWith(node.$ref)) {
          target = byId.get(id);
          break;
        }
      }
    }
    if (!target) {
      throw new Error(`Unresolved $ref: ${node.$ref}`);
    }
    if (seen.has(target.$id)) {
      // Circular — leave a $ref pointer so json2ts can emit a circular-safe type.
      return { $ref: target.$id };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(target.$id);
    const dereffedTarget = derefNode(
      JSON.parse(JSON.stringify(target)),
      byId,
      nextSeen,
    );
    // Drop $id/$schema from the inlined copy so json2ts treats it as anonymous
    // (the top-level schema's title names the exported type; nested schemas
    // should not collide on title either).
    const { $id: _i, $schema: _s, title: _t, ...rest } = dereffedTarget;
    const { $ref: _r, ...sibling } = node;
    return { ...rest, ...sibling };
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = derefNode(v, byId, seen);
  }
  return out;
}

async function main() {
  // Scan all SCHEMA_DIRS, accumulating *.schema.json files from each. Duplicate
  // basenames across dirs would collide in daemon/src/gen/ — none exist today
  // (protocol/, schemas/, schemas/cli-query/ carry disjoint filenames), but we
  // guard with a per-basename seen-set so a future collision surfaces as an
  // explicit error rather than a silent overwrite.
  const files = [];
  const seenBasenames = new Set();
  for (const dir of SCHEMA_DIRS) {
    let entries = [];
    try {
      entries = await readdir(dir);
    } catch (err) {
      // A schema root may not exist yet on a fresh checkout (e.g. cli-query/
      // before Plan 02-01). Skip rather than crash — the existing protocol/
      // root is the only hard requirement.
      if (err.code === "ENOENT") continue;
      throw err;
    }
    for (const f of entries.filter((name) => name.endsWith(".schema.json"))) {
      if (seenBasenames.has(f)) {
        throw new Error(`Schema basename collision across dirs: ${f}`);
      }
      seenBasenames.add(f);
      files.push({ dir, name: f });
    }
  }
  if (files.length === 0) {
    console.error(`No *.schema.json found in ${SCHEMA_DIRS.join(", ")}`);
    process.exit(1);
  }

  // Pass 1: load everything, build $id → schema.
  const byId = new Map();
  const loaded = [];
  for (const { dir, name } of files) {
    const text = await readFile(join(dir, name), "utf8");
    const schema = JSON.parse(text);
    if (!schema.$id) {
      throw new Error(`${name}: missing $id (required by SC#3)`);
    }
    byId.set(schema.$id, schema);
    loaded.push({ fname: name, schema });
  }

  // Pass 2: dereference + compile each.
  await mkdir(OUT_DIR, { recursive: true });
  for (const { fname, schema } of loaded) {
    const dereffed = derefNode(
      JSON.parse(JSON.stringify(schema)),
      byId,
      new Set([schema.$id]),
    );
    // Strip the $id from the top before compile (json2ts gets confused by $id
    // pointing at a non-existent host); keep $schema + title so the TS type is
    // named after the title.
    const { $id: _drop, ...top } = dereffed;
    const ts = await compile(top, fname, {
      bannerComment: BANNER,
      cwd: join(REPO_ROOT, "schemas"),
      style: { singleQuote: false },
      additionalProperties: false,
    });
    const outName = basename(fname, ".schema.json") + ".ts";
    await writeFile(join(OUT_DIR, outName), ts);
    console.log(`✓ ${outName}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
