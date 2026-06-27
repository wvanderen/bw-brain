// daemon/src/cli/query-client.ts
//
// D-07 thin CLI query client over the daemon's Unix Domain Socket.
//
// The CLI is a STATELESS thin client: each invocation connects to the daemon's
// UDS socket (~/.bw-brain/daemon.sock), sends ONE {op, payload} query, reads ONE
// result line, prints it, and disconnects. It holds NO state between
// invocations — separate from the bridge TCP port (127.0.0.1:7878) which stays
// bridge-only (Pitfall 3 / D-07). Transcribed from RESEARCH.md lines 1058-1089.
//
// When the socket is absent (daemon not running, Plan 03b not yet shipped), the
// connection rejects with a clear error; the live commands catch it and emit a
// fail-closed {ok:false, stateFreshness:"disconnected"} envelope (SC#3).
//
// `DEFAULT_SOCKET` honors the BW_BRAIN_SOCKET env var so tests can point at a
// fake UDS server on a temp socket (see cli.test.ts).
import * as net from "node:net";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CliResult } from "../gen/result.js";

/** Default UDS path: ~/.bw-brain/daemon.sock (Plan 03b). Override via BW_BRAIN_SOCKET. */
export const DEFAULT_SOCKET: string =
  process.env.BW_BRAIN_SOCKET ?? join(homedir(), ".bw-brain", "daemon.sock");

/**
 * Send one query to the daemon and resolve its FULL result envelope. One-shot:
 * connect, write the query line, read the first result line, disconnect.
 *
 * Resolves with the complete {@link CliResult} (NOT just `payload`) so the live
 * commands can surface `stateFreshness` (SC#3) and `assumptions[]` (UX-06) on
 * every output — both are required on every result per the frozen
 * result.schema.json. Plan 03b's daemon populates them; the CLI prints them
 * verbatim.
 *
 * @param op         - one of the 5 live M1 ops + diff (query.schema.json enum).
 * @param payload    - op-specific arguments (default `{}`).
 * @param socketPath - UDS path (default {@link DEFAULT_SOCKET}).
 * @returns the daemon's full CliResult envelope (version/ok/stateFreshness/
 *   payload/assumptions) when `ok:true`.
 * @throws when the daemon returns `ok:false` (Error carries error+availableFrom),
 *   the socket is missing/unreachable (clear connection error), or the daemon
 *   closes before sending a complete result line.
 *
 * @example
 * const result = await query("focus.export");
 * // result = { version:"1.0", ok:true, stateFreshness:"live", payload:{...}, assumptions:[...] }
 */
export function query(op: string, payload: unknown = {}, socketPath: string = DEFAULT_SOCKET): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    let buf = "";
    let settled = false;
    const sock = net.createConnection({ path: socketPath }, () => {
      sock.write(JSON.stringify({ version: "1.0", type: "query", op, payload }) + "\n");
    });
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      const i = buf.indexOf("\n");
      if (i >= 0) {
        const line = buf.slice(0, i);
        sock.end();
        if (settled) return;
        settled = true;
        let result: CliResult;
        try {
          result = JSON.parse(line) as CliResult;
        } catch (e) {
          reject(new Error(`daemon returned a non-JSON line: ${(e as Error).message}`));
          return;
        }
        if (result.ok) {
          resolve(result);
        } else {
          const tail = result.availableFrom ? ` (available from ${result.availableFrom})` : "";
          reject(new Error(`${result.error ?? "unknown daemon error"}${tail}`));
        }
      }
    });
    sock.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      // Surface a clear message for the common socket-absent case so the live
      // commands can report stateFreshness:"disconnected" cleanly (SC#3).
      if (err.code === "ENOENT" || err.code === "ECONNREFUSED" || err.code === "EACCES") {
        reject(
          new Error(
            `daemon socket not reachable at ${socketPath} (${err.code}) — is the bw-brain daemon running?`,
          ),
        );
      } else {
        reject(err);
      }
    });
    sock.on("close", () => {
      if (settled) return;
      settled = true;
      if (!buf.includes("\n")) {
        reject(new Error("daemon closed the connection before sending a complete result"));
      }
    });
  });
}
