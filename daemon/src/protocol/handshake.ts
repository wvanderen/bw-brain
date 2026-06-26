// daemon/src/protocol/handshake.ts
//
// Version handshake rule (RESEARCH.md Pattern 3, lines 300–308) made executable.
//
// On connect the sender emits `hello` (version + capabilities); the receiver
// compares MAJOR versions (the integer before the dot) and replies
// `hello.response` before any other traffic. Equal major => negotiation ok
// (minor is advisory). Different major => reject — prevents protocol-drift
// silent corruption (RESEARCH.md §Security, T-2-03).
//
// This is a PURE, framework-free function so it is unit-testable without
// sockets (handshake.test.ts). The daemon calls it when it receives a `hello`;
// the wire-level `hello`/`hello.response` shapes are frozen in
// schemas/protocol/handshake.schema.json (Ajv-validated at the boundary).

/** Result of {@link negotiateVersion}. */
export interface NegotiateVersionResult {
  /** true if the major versions match (handshake accepted). */
  ok: boolean;
  /** The server's protocol version, present when `ok` is true. */
  serverVersion?: string;
}

/**
 * Compare MAJOR versions of two `major.minor` version strings.
 *
 * @param theirVersion - the peer's declared version (from `hello`).
 * @param ourVersion   - this daemon's protocol version.
 * @returns `{ ok: true, serverVersion: ourVersion }` when the major components
 *   match; `{ ok: false }` otherwise.
 *
 * @example
 * negotiateVersion("1.0", "1.0"); // { ok: true,  serverVersion: "1.0" }
 * negotiateVersion("1.5", "1.3"); // { ok: true,  serverVersion: "1.3" }
 * negotiateVersion("2.0", "1.0"); // { ok: false }
 */
export function negotiateVersion(
  theirVersion: string,
  ourVersion: string,
): NegotiateVersionResult {
  const theirMajor = theirVersion.split(".")[0];
  const ourMajor = ourVersion.split(".")[0];
  if (theirMajor === ourMajor) {
    return { ok: true, serverVersion: ourVersion };
  }
  return { ok: false };
}
