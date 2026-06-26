// daemon/src/protocol/line-buffer.test.ts
//
// SC#3 "partial-line buffer" requirement made executable (RESEARCH.md §Validation
// row PROBE-02/SC#3 framing; 01-VALIDATION.md Wave 0). Property test: for any
// random byte-chunking of N newline-terminated lines, feeding the chunks in
// order yields exactly N lines, byte-identical to the originals. Plus the four
// edge cases from 01-02-PLAN.md Task 2 <behavior>: mid-newline split, trailing
// partial line, CRLF tolerance, blank-line dropping.
//
// A SEEDED RNG (mulberry32) makes failures reproducible — same seed, same chunk
// sequence. ESM + NodeNext: .js import extensions (AGENTS.md convention).
import { describe, it, expect } from "vitest";
import { LineBuffer } from "./line-buffer.js";

/** mulberry32 — small, fast, deterministic PRNG. Same seed => same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fresh collector + LineBuffer pair. */
function fresh(): { lines: string[]; lb: LineBuffer } {
  const lines: string[] = [];
  const lb = new LineBuffer((line) => lines.push(line));
  return { lines, lb };
}

describe("LineBuffer property test (SC#3 partial-line buffer)", () => {
  it("reassembles arbitrary byte-splits of N lines byte-identically", () => {
    const rng = mulberry32(0xc0ffee);
    const N = 500;
    const originals: string[] = [];
    for (let i = 0; i < N; i++) {
      // JSON-ish content. JSON.stringify never emits a raw \n, so each line is a
      // single complete JSON value — exactly the jsonlines.org contract.
      originals.push(JSON.stringify({ i, s: `t${Math.floor(rng() * 1_000_000)}`, n: rng() }));
    }
    const blob = originals.join("\n") + "\n";

    // Feed the blob as random-length chunks (1..7 bytes) — a `\n` will frequently
    // fall mid-message across two feeds, which the buffer must reassemble.
    const { lines, lb } = fresh();
    let pos = 0;
    while (pos < blob.length) {
      const step = 1 + Math.floor(rng() * 7);
      lb.feed(blob.slice(pos, pos + step));
      pos += step;
    }
    expect(lines).toEqual(originals);
    expect(lines.length).toBe(N);
  });

  it("reassembles when a newline falls mid-message across two feeds", () => {
    const { lines, lb } = fresh();
    lb.feed('{"a":1}\n{"b":');
    lb.feed('2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("retains a trailing partial line until the next feed", () => {
    const { lines, lb } = fresh();
    lb.feed('{"a":1}\n{"b":');
    expect(lines).toEqual(['{"a":1}']);
    lb.feed('2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("tolerates CRLF line endings (jsonlines.org)", () => {
    const { lines, lb } = fresh();
    lb.feed('{"a":1}\r\n{"b":2}\r\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("drops blank lines (not valid JSON Lines)", () => {
    const { lines, lb } = fresh();
    lb.feed('{"a":1}\n\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("accepts Buffer chunks (coerced to UTF-8)", () => {
    const { lines, lb } = fresh();
    lb.feed(Buffer.from('{"a":"☃"}\n', "utf8"));
    expect(lines).toEqual(['{"a":"☃"}']);
  });
});
