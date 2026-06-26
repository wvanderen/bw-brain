// daemon/src/transport/stdio.ts
//
// StdioTransport — the documented fallback transport (AGENTS.md line 125:
// "TCP is the only option … stdio only for ephemeral CLI invocations";
// RESEARCH.md Transport Decision Rule outcome #3, lines 178–186).
//
// It exists so the reader scaffolding is provably transport-agnostic (D-05):
// the same reader.ts wiring drives a TCP listener or an injected stdin pipe.
// Do not over-invest — stdio is the fallback path, not the expected one.
//
// onMessage reads process.stdin chunks; send writes one atomic line
// (JSON.stringify(msg) + "\n") to process.stdout in a single write
// (RESEARCH.md Pattern 4); close destroys process.stdin.

import type { Transport } from "./transport.js";

/**
 * stdin/stdout transport. Reads process.stdin, writes process.stdout. Used by
 * the autonomous dump proof (`printf '<line>' | dump.ts --transport stdio`)
 * and as the documented fallback if raw TCP proves unavailable in-spike.
 */
export class StdioTransport implements Transport {
  private handler: (chunk: unknown) => void = () => {};

  constructor() {
    process.stdin.setEncoding("utf8");
    // Attach the listener (also resumes stdin — a paused pipe never delivers).
    process.stdin.on("data", (chunk: Buffer | string) => this.handler(chunk));
    // Swallow stdin read errors (peer closed pipe etc.); close() tears down.
    process.stdin.on("error", () => {
      /* cleaned up via close() */
    });
  }

  onMessage(handler: (chunk: unknown) => void): void {
    this.handler = handler;
  }

  // Pattern 4: one JSON.stringify + one "\n" + one write. JSON.stringify
  // escapes embedded newlines, so one write = one complete JSON value per line.
  send(msg: object): void {
    process.stdout.write(JSON.stringify(msg) + "\n");
  }

  close(): void {
    process.stdin.destroy();
  }
}
