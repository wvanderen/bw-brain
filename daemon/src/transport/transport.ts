// daemon/src/transport/transport.ts
//
// Transport abstraction — D-05 core (RESEARCH.md Pattern 1, lines 261–276).
//
// The JSON-Lines reader (protocol/reader.ts) consumes ONLY this interface,
// never a raw net.Socket. That decoupling is what makes TCP and stdio swappable
// regardless of the Transport Decision Rule outcome (RESEARCH.md lines 178–186):
// the kept daemon-side scaffolding stays reusable either way.
//
// `send` THROWS on unrecoverable write failure — it never silently swallows.
// Edits/requests are user intent and MUST be ack'd or errored; a transport that
// swallowed a dropped apply.patch would break the trust model (AGENTS.md line 17).
//
// The transport moves BYTES only — it does not parse JSON or validate. Framing
// (LineBuffer) and contract validation (Ajv at the boundary) live in the reader.

/**
 * Transport-agnostic byte stream the daemon reader consumes.
 * Implementations: {@link TcpServerTransport} (loopback-only), {@link StdioTransport}.
 */
export interface Transport {
  /**
   * Register the handler invoked for every raw chunk received from the peer.
   * The chunk is delivered as-is (a UTF-8 string when the transport decodes,
   * or a Buffer); the reader's LineBuffer handles both.
   */
  onMessage(handler: (chunk: unknown) => void): void;

  /**
   * Send one message to the peer. Implementations issue a SINGLE atomic-line
   * write of `JSON.stringify(msg) + "\n"` (RESEARCH.md Pattern 4). Throws on
   * unrecoverable write failure — never silently swallows.
   */
  send(msg: object): void;

  /** Tear down the transport (close socket / destroy stdin). */
  close(): void;
}
