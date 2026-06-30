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
 *
 * `currentDoc` is the top-level schema currently being dereferenced — used to
 * resolve bare-fragment refs (`#/$defs/X`) which are local to the same document.
 */
function derefNode(node, byId, seen, currentDoc) {
  if (Array.isArray(node)) {
    return node.map((n) => derefNode(n, byId, seen, currentDoc));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  if (typeof node.$ref === "string") {
    // Resolve the $ref against the JSON Schema base-URI rules: the ref is
    // interpreted relative to the nearest enclosing $id. We pass the absolute
    // resolved URI in `seen` to detect cycles.
    //
    // Four $ref shapes are supported:
    //  1. Bare filename (e.g. "event.schema.json") — resolved against the
    //     referencing file's $id by suffix-match below.
    //  2. Absolute $id URI (e.g. "https://bw-brain.local/schemas/intent.schema.json")
    //     — direct byId lookup.
    //  3. Absolute $id URI + JSON-pointer fragment (e.g.
    //     "https://bw-brain.local/schemas/patch.schema.json#/$defs/PrimitiveOp") —
    //     strip the fragment, look up the target schema by $id, then walk the
    //     pointer into the target's $defs (or anywhere via slash-split). Phase 3
    //     edit.schema.json uses shape #3 for the cross-file PrimitiveOp $ref.
    //  4. Bare JSON-pointer fragment (e.g. "#/$defs/Note") — local to the
    //     current document; resolved against `currentDoc`. Phase 3
    //     patch.schema.json uses shape #4 for its internal $defs cross-refs.
    const fragmentIdx = node.$ref.indexOf("#");
    const baseRef = fragmentIdx >= 0 ? node.$ref.slice(0, fragmentIdx) : node.$ref;
    const fragment = fragmentIdx >= 0 ? node.$ref.slice(fragmentIdx + 1) : "";
    const abs = baseRef.includes("://") ? baseRef : null;
    const targetId = abs ?? baseRef;
    let target;
    let resolvedId;
    if (targetId === "" && currentDoc) {
      // Shape #4: bare-fragment ref local to the current document.
      target = currentDoc;
      resolvedId = currentDoc.$id;
    } else {
      target = byId.get(targetId);
      if (!target) {
        for (const id of byId.keys()) {
          if (id.endsWith("/" + baseRef) || id.endsWith(baseRef)) {
            target = byId.get(id);
            break;
          }
        }
      }
      if (!target) {
        throw new Error(`Unresolved $ref: ${node.$ref}`);
      }
      resolvedId = target.$id;
    }
    // If a JSON-pointer fragment is present, walk into the target. Fragment
    // grammar: "/$defs/PrimitiveOp" → ["", "$defs", "PrimitiveOp"]. The leading
    // empty string (from the slash before "defs") is skipped. URI-encoded
    // segments are decoded (~1 → /, ~0 → ~) per RFC 6901.
    if (fragment.startsWith("/")) {
      const segments = fragment.split("/").slice(1).map((s) =>
        s.replace(/~1/g, "/").replace(/~0/g, "~")
      );
      let walked = target;
      for (const seg of segments) {
        if (walked === null || typeof walked !== "object" || !(seg in walked)) {
          throw new Error(`Unresolved $ref pointer: ${node.$ref} (missing "${seg}")`);
        }
        walked = walked[seg];
      }
      target = walked;
      // Synthetic identity for cycle detection: parent document $id + fragment.
      resolvedId = `${resolvedId}#${fragment}`;
    }
    if (seen.has(resolvedId)) {
      // Circular — leave a $ref pointer so json2ts can emit a circular-safe type.
      return { $ref: resolvedId };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(resolvedId);
    // Thread the current document for nested bare-fragment refs. The doc a
    // nested ref resolves against is whichever top-level schema the target lives
    // in: the current doc for bare-fragment refs (shape #4); the byId-looked-up
    // doc for cross-file refs (shapes #2/#3). When a fragment walked us into a
    // sub-node, the parent doc is still where the fragment rooted.
    let nextDoc;
    if (targetId === "") {
      nextDoc = currentDoc;
    } else {
      // Cross-file (with or without fragment) — the new doc is the byId entry.
      nextDoc = byId.get(targetId) ?? currentDoc;
    }
    const dereffedTarget = derefNode(
      JSON.parse(JSON.stringify(target)),
      byId,
      nextSeen,
      nextDoc,
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
    out[k] = derefNode(v, byId, seen, currentDoc);
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
      schema,
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
