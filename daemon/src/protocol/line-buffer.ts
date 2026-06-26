// daemon/src/protocol/line-buffer.ts
//
// Partial-line reassembly for newline-delimited JSON streams (SC#3's
// "partial-line buffer" requirement, RESEARCH.md Pattern 2 lines 278–298).
//
// Both TCP and stdio deliver byte STREAMS, not messages — a `\n` can fall
// mid-message across two `data` chunks. LineBuffer accumulates incoming bytes,
// splits on `\n`, emits each complete line via the onLine callback, and retains
// any trailing partial fragment for the next feed.
//
// This is PURE framing:
//   - no JSON.parse here
//   - no schema validation here
//   - no error throwing here
// JSON.parse + Ajv validation happen in the reader (see reader.ts). A malformed
// line is still emitted as a line; the reader decides whether to drop it.
//
// @see https://jsonlines.org

/**
 * Reassembles newline-delimited lines from arbitrary byte chunks.
 *
 * @example
 * ```ts
 * const lb = new LineBuffer((line) => console.log("got:", line));
 * lb.feed('{"a":1}\n{"b":'); // emits '{"a":1}', retains '{"b":'
 * lb.feed('2}\n');            // emits '{"b":2}'
 * ```
 */
export class LineBuffer {
  private buf = "";

  constructor(private readonly onLine: (line: string) => void) {}

  /**
   * Feed a chunk (string or Buffer; Buffers are coerced to UTF-8). Emits zero
   * or more complete lines and retains any trailing partial fragment. Blank
   * lines are skipped (not valid JSON Lines — jsonlines.org). A trailing
   * carriage-return is stripped to tolerate the `\r\n` form.
   */
  feed(chunk: string | Buffer): void {
    this.buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, ""); // tolerate \r\n (jsonlines.org)
      this.buf = this.buf.slice(i + 1);
      if (line.length > 0) this.onLine(line); // blank lines are not valid JSON Lines
    }
  }
}
