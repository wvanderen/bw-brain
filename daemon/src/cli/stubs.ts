// daemon/src/cli/stubs.ts
//
// Shared `not_implemented` JSON emitter for the 3 stub commands (bw-arrange,
// bw-automation, bw-edit). D-05: M1 ships 5 live commands + 3 stubs; the stubs
// emit a structured failure that honors CLI-01 ("all 8 emit JSON, fail clearly").
//
// EXIT 0 (NOT 1): emitting a structured not-implemented JSON IS the clear
// failure. A non-zero exit would break shell pipelines that grep the JSON
// (RESEARCH.md lines 663-671, T-2-04-D mitigation). The result.schema.json
// allOf if/then arm requires error+availableFrom on every ok:false result —
// emitStub produces exactly that shape.

/** Milestone when a stub command ships for real. */
export type AvailableFrom = "M2" | "M3" | "M4";

/** Options for {@link emitStub}. */
export interface EmitStubOptions {
  /** The shim name being invoked, e.g. "bw-arrange". */
  name: string;
  /** Milestone when this command ships for real. */
  availableFrom: AvailableFrom;
}

/**
 * Emit a structured `not_implemented` JSON result to stdout and exit 0.
 *
 * @param opts - the stub name + the milestone it ships in.
 *
 * @example
 * emitStub({ name: "bw-arrange", availableFrom: "M3" });
 * // → stdout: {"version":"1.0","ok":false,"error":"not_implemented",
 * //           "command":"bw-arrange","availableFrom":"M3"}
 * // → exit 0
 */
export function emitStub(opts: EmitStubOptions): never {
  const envelope = {
    version: "1.0",
    ok: false,
    error: "not_implemented",
    command: opts.name,
    availableFrom: opts.availableFrom,
  };
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
  process.exit(0);
}
