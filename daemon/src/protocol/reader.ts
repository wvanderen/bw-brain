// daemon/src/protocol/reader.ts
//
// The reader orchestrator — D-05 daemon-side framing spine (RESEARCH.md §Code
// Examples "Daemon reader wiring", lines 488–507). It wires:
//
//     transport ─▶ LineBuffer ─▶ JSON.parse(try/catch) ─▶ Ajv(envelope) ─▶ enqueue ─▶ onMessage
//
// The four SC#3 hard requirements live here:
//   1. Versioned messages  — the envelope schema carries `version` (frozen in
//      01-01); the handshake gate (handshake.ts) is applied by the daemon on
//      `hello`. The reader validates every message against the frozen envelope.
//   2. Atomic-line writes   — the transports own the send side (Pattern 4). The
//      reader owns the RECEIVE framing via LineBuffer.
//   3. Partial-line buffer  — LineBuffer reassembles arbitrary byte splits.
//   4. Explicit backpressure — the bounded per-connection queue below (Pattern 5).
//
// THREAT MITIGATIONS (01-02-PLAN.md <threat_model>):
//   - T-2-02 (DoS via malformed line): JSON.parse is wrapped in try/catch —
//     malformed lines are dropped, NEVER thrown. Ajv runs BEFORE any handler
//     sees the message, so invalid structures cannot reach handler logic.
//   - T-2-04 (DoS via unbounded queue under event flood): bounded queue with an
//     explicit class-based backpressure policy (drop-oldest observational events
//     + dropped notice; never-drop edits/requests).
//
// Ajv is constructed and the envelope validator COMPILED ONCE at module load
// (AGENTS.md lines 64–65: standalone-compiled validators — never recompile per
// message). The five message-type schemas are registered so the envelope's oneOf
// `$ref`s resolve by `$id` (Ajv implements 2020-12 $id-based $ref resolution;
// the json-schema-ref-parser limitation that forced scripts/gen-types.mjs does
// NOT apply at runtime).

import { Ajv2020 } from "ajv/dist/2020.js";
import envelopeSchema from "../../../schemas/protocol/envelope.schema.json" with { type: "json" };
import eventSchema from "../../../schemas/protocol/event.schema.json" with { type: "json" };
import requestSchema from "../../../schemas/protocol/request.schema.json" with { type: "json" };
import responseSchema from "../../../schemas/protocol/response.schema.json" with { type: "json" };
import editSchema from "../../../schemas/protocol/edit.schema.json" with { type: "json" };
import handshakeSchema from "../../../schemas/protocol/handshake.schema.json" with { type: "json" };
import { LineBuffer } from "./line-buffer.js";
import type { Transport } from "../transport/transport.js";

// --- Ajv: compiled ONCE at boot (standalone-compiled validator) -----------------
//
// Ajv2020 = JSON Schema Draft 2020-12 mode (AGENTS.md line 37). The default
// `new Ajv()` is draft-07 and would reject our `$schema`. Named import +
// `.js` extension are required under module:NodeNext (ajv 8.20 ships no exports
// map). addFormats is intentionally NOT applied: no frozen schema uses the
// `format` keyword (verified), and its CJS default-export interop is not callable
// as a static NodeNext import — see schemas.test.ts for the full rationale.
const ajv = new Ajv2020({ allErrors: true, strict: false });
// Register the message-type schemas first so the envelope's oneOf `$ref`s
// resolve by `$id`. Envelope registered last.
ajv.addSchema(eventSchema);
ajv.addSchema(requestSchema);
ajv.addSchema(responseSchema);
ajv.addSchema(editSchema);
ajv.addSchema(handshakeSchema);
ajv.addSchema(envelopeSchema);
const validateEnvelope = ajv.getSchema(envelopeSchema.$id)!;

// --- Backpressure classification (RESEARCH.md Pattern 5) -----------------------
//
// Observational events: the bridge fires them with no ack expected. A newer
// selection supersedes an older one, so dropping a stale event on overflow is
// safe (bw-brain is observational). Edits/requests: user intent, MUST be ack'd —
// never silently dropped. The set below is the Phase-1 frozen observational type
// (selection.changed); Phase 2 extends this as more event types freeze.
const OBSERVATIONAL_EVENT_TYPES: ReadonlySet<string> = new Set(["selection.changed"]);

function isObservationalEvent(msg: unknown): boolean {
  if (typeof msg !== "object" || msg === null) return false;
  const type = (msg as { type?: unknown }).type;
  return typeof type === "string" && OBSERVATIONAL_EVENT_TYPES.has(type);
}

/** Options for {@link createReader}. */
export interface ReaderOptions {
  /**
   * Max messages buffered per connection before the backpressure policy applies
   * (RESEARCH.md Pattern 5). Observational events overflow = drop-oldest +
   * dropped notice; edits/requests overflow = never dropped (Phase 2 pauses the
   * sender for ack). Default 256.
   */
  capacity?: number;
}

/** Default per-connection queue capacity. */
const DEFAULT_CAPACITY = 256;

/**
 * Wire a transport into the framing/validation/backpressure pipeline.
 *
 * @param transport - any {@link Transport} (TCP loopback or stdio).
 * @param onMessage - invoked for every validated message that survives the
 *   backpressure policy (and for each synthesized `dropped` notice).
 * @param opts      - optional {@link ReaderOptions}.
 * @returns `{ close }` to tear the reader + transport down.
 *
 * The onMessage callback is drained off the transport's data event via
 * `queueMicrotask` — heavy consumer work never blocks the byte stream
 * synchronously (RESEARCH.md Pitfall 3: never block inside an observer/data
 * callback).
 */
export function createReader(
  transport: Transport,
  onMessage: (msg: unknown) => void,
  opts: ReaderOptions = {},
): { close: () => void } {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY;
  const queue: unknown[] = [];
  let droppedSinceLastNotice = 0;
  let draining = false;

  /** Drain the queue off the data event — never process synchronously inline. */
  const scheduleDrain = (): void => {
    if (draining) return;
    draining = true;
    queueMicrotask(() => {
      draining = false;
      while (queue.length > 0) {
        // shift() is safe here: only this microtask drains the queue, and
        // scheduleDrain() re-arms if more arrive mid-drain (draining flag reset).
        onMessage(queue.shift());
      }
    });
  };

  /**
   * Apply the explicit backpressure rule (Pattern 5), then hand the message to
   * the drain → onMessage path.
   */
  const enqueue = (msg: unknown): void => {
    if (queue.length >= capacity) {
      if (isObservationalEvent(msg)) {
        // DROP-OLDEST: a newer selection supersedes an older one. bw-brain is
        // observational, so losing a stale event under flood is the safe choice.
        queue.shift();
        droppedSinceLastNotice += 1;
        // Emit a dropped notice so a consumer can observe that events were lost.
        onMessage({ version: "1.0", type: "dropped", payload: { count: droppedSinceLastNotice } });
      } else {
        // Edits / requests: NEVER drop. The sender MUST wait for an ack — real
        // backpressure PAUSES THE TRANSPORT (TCP backpressure / the bridge
        // blocks for ack), implemented in Phase 2. For the spike we preserve
        // the "edits are never silently lost" invariant by enqueueing past
        // capacity. (Documented per RESEARCH.md Pattern 5.)
      }
    }
    queue.push(msg);
    scheduleDrain();
  };

  // LineBuffer's onLine: parse → validate → enqueue. Pure framing lives in
  // LineBuffer; THIS callback owns JSON.parse (try/catch) + Ajv-at-boundary.
  const lines = new LineBuffer((line) => {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      // Malformed line — drop, NEVER throw (T-2-02 DoS hardening). A bad peer
      // cannot crash the reader by sending garbage.
      return;
    }
    if (!validateEnvelope(msg)) {
      // Invalid against the frozen envelope — log the errors and drop, never
      // process (V5: validate at the boundary). console.error keeps the channel
      //inspectable; the message is NOT handed to onMessage.
      console.error("[reader] envelope validation failed:", JSON.stringify(validateEnvelope.errors));
      return;
    }
    enqueue(msg);
  });

  // Transports deliver either a UTF-8 string (when they decode) or a Buffer;
  // LineBuffer handles both. Anything else is ignored defensively.
  transport.onMessage((chunk) => {
    if (typeof chunk === "string" || Buffer.isBuffer(chunk)) {
      lines.feed(chunk);
    }
  });

  return { close: () => transport.close() };
}
