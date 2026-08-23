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

  it("stampReverted marks the original entry; subsequent find returns null (double-revert protection)", async () => {
    const hist = new PatchHistory(journalPath);
    const ops: PrimitiveOp[] = [{ op: "add_note", note: note(60, 0) }];
    await hist.append(entryFromOps("pt_stampmestampmestampmestamp", ops, 1_000));
    // Before stamping, find returns the entry.
    expect(await hist.find("pt_stampmestampmestampmestamp")).not.toBeNull();
    // Stamp it reverted.
    await hist.stampReverted("pt_stampmestampmestampmestamp", 9_000);
    // After stamping, find returns null (double-revert is a no-op).
    expect(await hist.find("pt_stampmestampmestampmestamp")).toBeNull();
    // The entry still exists in the journal (append-only: it's rewritten with
    // appliedRevertedAt set, not deleted) — verified by reading raw entries.
    const all: PatchHistoryEntry[] = [];
    for await (const e of hist.entries()) all.push(e);
    expect(all).toHaveLength(1);
    expect(all[0]!.appliedRevertedAt).toBe(9_000);
  });

  it("stampReverted on an unknown patchId is a no-op (does not rewrite the journal)", async () => {
    const hist = new PatchHistory(journalPath);
    await hist.append(entryFromOps("pt_presentpresentpresentpresen", [{ op: "add_note", note: note(60, 0) }], 1));
    await hist.stampReverted("pt_absent-absent-absent-absent-", 9_000);
    const all: PatchHistoryEntry[] = [];
    for await (const e of hist.entries()) all.push(e);
    expect(all).toHaveLength(1);
    expect(all[0]!.appliedRevertedAt).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Phase 5 05-05 Task 3 — the optional additive automationBinding field
// (D-05-07). Legacy entries without it remain CAVEATED, NOT refused (the
// clipSid migration precedent) — the data side of that policy is that
// entries()/find() yield legacy lines untouched with automationBinding
// undefined.
// ---------------------------------------------------------------------------
describe("automationBinding journal field (D-05-07 — additive, legacy-caveated)", () => {
  const autoEntry = (patchId: string): PatchHistoryEntry => {
    const patch: Patch = {
      patchId,
      scope: { deviceSid: "dev_0123456789abcdef", paramIndex: 5, paramSource: "remote_page", region: { startBar: 0, lengthBars: 8 } },
      operations: [
        { op: "automation_points", points: [{ beat: 0, value: 0.5 }] },
        { op: "set_parameter_value", value: 0.8 },
      ] as unknown as Patch["operations"],
      rationale: "swell",
      reversibility: "self-inverse",
      risk: "medium",
      undoLabel: `undo-${patchId}`,
    };
    return {
      ...patch,
      inverseOperations: [
        { op: "remove_automation_points", points: [{ beat: 0, value: 0.5 }] },
        { op: "set_parameter_value", value: 0.25 },
      ],
      appliedAt: 1_000,
      stateHashBefore: "automation:dev_0123456789abcdef:5",
      automationBinding: { deviceSid: "dev_0123456789abcdef", paramIndex: 5, paramSource: "remote_page", priorValue: 0.25 },
    };
  };

  it("an automation entry round-trips through append/entries with automationBinding intact", async () => {
    const hist = new PatchHistory(journalPath);
    await hist.append(autoEntry("pt_automationroundtriptest1"));
    const found = await hist.find("pt_automationroundtriptest1");
    expect(found).not.toBeNull();
    expect(found!.automationBinding).toEqual({
      deviceSid: "dev_0123456789abcdef",
      paramIndex: 5,
      paramSource: "remote_page",
      priorValue: 0.25,
    });
  });

  it("a LEGACY line (pre-Phase-5, no automationBinding key) parses with automationBinding undefined — caveated, not refused", async () => {
    const hist = new PatchHistory(journalPath);
    await hist.append(entryFromOps("pt_legacylinelegacylinelega", [{ op: "add_note", note: note(60, 0) }], 2_000));
    const found = await hist.find("pt_legacylinelegacylinelega");
    expect(found).not.toBeNull();
    expect(found!.automationBinding).toBeUndefined();
    expect(found!.clipSid).toBeUndefined();
  });

  it("a journal mixing legacy and automation entries yields both in append order", async () => {
    const hist = new PatchHistory(journalPath);
    await hist.append(entryFromOps("pt_mixedlegacymixedlegacy1", [{ op: "add_note", note: note(60, 0) }], 1));
    await hist.append(autoEntry("pt_mixedautomationmixedauto"));
    const entries: PatchHistoryEntry[] = [];
    for await (const e of hist.entries()) entries.push(e);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.automationBinding).toBeUndefined();
    expect(entries[1]!.automationBinding?.priorValue).toBe(0.25);
  });
});
