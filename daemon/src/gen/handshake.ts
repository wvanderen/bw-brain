/**
 * DO NOT EDIT — generated from schemas/protocol/<name>.schema.json by `npm run gen:types`.
 * Source of truth: schemas/protocol/*.schema.json (JSON Schema 2020-12).
 * To regenerate: cd daemon && npm run gen:types
 */

/**
 * Version-negotiation handshake — the first messages exchanged on every new connection (RESEARCH.md Pattern 3). Client emits hello; server validates the major version and replies hello.response before any other traffic. Prevents protocol-drift silent corruption (SC#3 / §Security).
 */
export type Handshake = {
  [k: string]: unknown;
} & {
  version: string;
  type: "hello" | "hello.response";
  id?: string;
  /**
   * Required on hello.response; absent on hello.
   */
  ok?: boolean;
  /**
   * hello payload = {capabilities: string[]}; hello.response payload = {serverVersion: string}. Discriminated by type.
   */
  payload?: {
    /**
     * hello: client-declared capabilities (e.g. ['events','requests']).
     */
    capabilities?: string[];
    /**
     * hello.response: server's negotiated protocol version.
     */
    serverVersion?: string;
  };
};
