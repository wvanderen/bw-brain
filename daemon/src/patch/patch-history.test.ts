// daemon/src/patch/patch-history.test.ts
//
// Phase 3 Plan 03-02 Task 1 — D-03 durable append-only journal (INV-14).
// RED tests authored before the implementation (TDD). INV-14 is the trust-spine
// property this plan owns: every patch-history.jsonl entry's inverseOperations
// set-equals inverseOps(entry.operations) — the inverse is computed at APPLY
// time (D-03), stamped into the journal, and replayed at revert time.
//
// Pattern authority: daemon/src/store/atomic-write.test.ts (atomic-write
// discipline + N-parallel property) + daemon/src/state/intent-store.test.ts
// (mkdtemp/rm fixture). Generative inputs from daemon/src/patch/arb.ts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import fc from "fast-check";
import { PatchHistory, type PatchHistoryEntry } from "./patch-history.js";
import { inverseOps, type PrimitiveOp, noteKey } from "./inverse-ops.js";
import { arbOpSeq } from "./arb.js";
import type { Patch } from "../gen/patch.js";

let tmpRoot: string;
let journalPath: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "bw-brain-history-"));
  journalPath = join(tmpRoot, "patch-history.jsonl");
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

const CLIP_SID = "clip_0123456789abcdef";

function note(pitch: number, start: number, velocity = 100, length = 0.25) {
  return { key: noteKey(pitch, start), pitch, start, length, velocity };
}

/** Build a PatchHistoryEntry from a primitive-op seq (inverseOps computed by the caller). */
function entryFromOps(patchId: string, ops: PrimitiveOp[], appliedAt: number): PatchHistoryEntry {
  const patch: Patch = {
    patchId,
    scope: { clipSid: CLIP_SID },
    operations: ops as Patch["operations"],
    rationale: `entry ${patchId}`,
    reversibility: "self-inverse",
    risk: ops.length > 5 ? "medium" : "low",
    undoLabel: `undo-${patchId}`,
  };
  return {
    ...patch,
    inverseOperations: inverseOps(ops),
    appliedAt,
    stateHashBefore: "sha256:fixture",
  };
}

describe("INV-14 history carries inverse (D-03 — inverseOps at apply time)", () => {
  it("an appended entry's inverseOperations deep-equals inverseOps(entry.operations)", async () => {
    const hist = new PatchHistory(journalPath);
    const ops: PrimitiveOp[] = [
      { op: "add_note", note: note(60, 0) },
      { op: "remove_note", note: note(64, 1) },
    ];
    await hist.append(entryFromOps("pt_aaaaaaaaaaaaaaaaaaaaaaaa", ops, 1_000));
    const entries = [];
    for await (const e of hist.entries()) entries.push(e);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.inverseOperations).toEqual(inverseOps(entries[0]!.operations as PrimitiveOp[]));
  });

  it("property: every appended entry carries inverseOps(operations) — INV-14 across generative seqs", async () => {
    await fc.assert(
      fc.asyncProperty(arbOpSeq, async ({ ops }) => {
        if (ops.length === 0) return; // schema minItems:1; skip degenerate
        const hist = new PatchHistory(join(tmpRoot, `prop-${Math.random()}.jsonl`));
        await hist.append(entryFromOps("pt_prop0000000000000000000000", ops, 1));
        for await (const e of hist.entries()) {
          expect(e.inverseOperations).toEqual(inverseOps(e.operations as PrimitiveOp[]));
        }
      }),
      { numRuns: 50 },
    );
  });

  it("find(patchId) returns the entry; null when absent", async () => {
    const hist = new PatchHistory(journalPath);
    const ops: PrimitiveOp[] = [{ op: "add_note", note: note(60, 0) }];
    await hist.append(entryFromOps("pt_findmefindmefindmefindmefind", ops, 2_000));
    const found = await hist.find("pt_findmefindmefindmefindmefind");
    expect(found).not.toBeNull();
    expect(found!.patchId).toBe("pt_findmefindmefindmefindmefind");
    expect(await hist.find("pt_nope")).toBeNull();
  });

  it("LIFO revert: append p1,p2,p3; find(p2) returns p2 (not p3); appliedRevertedAt stays absent until stamped", async () => {
    const hist = new PatchHistory(journalPath);
    await hist.append(entryFromOps("pt_p1p1p1p1p1p1p1p1p1p1p1p1p1", [{ op: "add_note", note: note(60, 0) }], 1_000));
    await hist.append(entryFromOps("pt_p2p2p2p2p2p2p2p2p2p2p2p2p2", [{ op: "add_note", note: note(62, 0) }], 2_000));
    await hist.append(entryFromOps("pt_p3p3p3p3p3p3p3p3p3p3p3p3p3", [{ op: "add_note", note: note(64, 0) }], 3_000));
    // Reverting p2 (NOT p3) finds p2 specifically — LIFO does not force popping p3.
    const p2 = await hist.find("pt_p2p2p2p2p2p2p2p2p2p2p2p2p2");
    expect(p2).not.toBeNull();
    expect(p2!.patchId).toBe("pt_p2p2p2p2p2p2p2p2p2p2p2p2p2");
    // No entry has appliedRevertedAt stamped yet (revert has not run).
    expect(p2!.appliedRevertedAt).toBeUndefined();
  });

  it("find skips entries already reverted (appliedRevertedAt set)", async () => {
    const hist = new PatchHistory(journalPath);
    const ops: PrimitiveOp[] = [{ op: "add_note", note: note(60, 0) }];
    const e = entryFromOps("pt_revertme1revertme1revertme", ops, 1_000);
    e.appliedRevertedAt = 5_000; // already reverted
    await hist.append(e);
    // find returns null because the only entry is marked reverted.
    expect(await hist.find("pt_revertme1revertme1revertme")).toBeNull();
  });
});

describe("Pitfall 8 corruption-skip (entries() never throws on malformed lines)", () => {
  it("appends a valid line, a truncated line, then a valid line — entries() yields the two valid, skips the garbage", async () => {
    // Hand-write the journal so we can inject a malformed line.
    const valid1 = JSON.stringify(entryFromOps("pt_valid1valid1valid1valid1v", [{ op: "add_note", note: note(60, 0) }], 1)) + "\n";
    const garbage = "{not-valid-json-missing-close\n";
    const valid2 = JSON.stringify(entryFromOps("pt_valid2valid2valid2valid2v", [{ op: "add_note", note: note(62, 0) }], 2)) + "\n";
    await writeFile(journalPath, valid1 + garbage + valid2, "utf8");

    const hist = new PatchHistory(journalPath);
    const entries: PatchHistoryEntry[] = [];
    // Must NOT throw — the per-line try/catch skips the garbage line.
    for await (const e of hist.entries()) entries.push(e);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.patchId).toBe("pt_valid1valid1valid1valid1v");
    expect(entries[1]!.patchId).toBe("pt_valid2valid2valid2valid2v");
  });

  it("an empty line (split artifact) does not break entries()", async () => {
    // JSON.stringify(entry)+"\n" then a trailing "\n" leaves an empty string
    // segment after split — the generator MUST skip it (not try JSON.parse("")).
    await writeFile(
      journalPath,
      JSON.stringify(entryFromOps("pt_onlyonlyonlyonlyonlyonl", [{ op: "add_note", note: note(60, 0) }], 1)) + "\n\n",
      "utf8",
    );
    const hist = new PatchHistory(journalPath);
    const entries: PatchHistoryEntry[] = [];
    for await (const e of hist.entries()) entries.push(e);
    expect(entries).toHaveLength(1);
  });

  it("append to a non-existent file auto-creates it (mkdir recursive on the parent dir)", async () => {
    const nestedPath = join(tmpRoot, "nested", "deep", "patch-history.jsonl");
    const hist = new PatchHistory(nestedPath);
    await hist.append(entryFromOps("pt_nestednestednestednestedne", [{ op: "add_note", note: note(60, 0) }], 1));
    const found = await hist.find("pt_nestednestednestednestedne");
    expect(found).not.toBeNull();
  });
});
