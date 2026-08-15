import type * as net from "node:net";
import type { ClapPeerMessage } from "../gen/clap.js";

export interface PeerConnectionOptions {
  handshakeTimeoutMs: number;
  maxLineBytes: number;
  maxQueueMessages: number;
  maxQueueBytes: number;
  onHello: (connection: PeerConnection, message: Extract<ClapPeerMessage, { type: "clap.hello" }>) => void;
  onMessage?: (connectionId: string, message: object) => void;
  validateMessage?: (message: unknown) => boolean;
  onProtocolError?: (error: PeerProtocolError) => void;
  onClose: (connectionId: string) => void;
}

export interface PeerProtocolError {
  connectionId: string;
  reason: "schema_rejected";
  frame: unknown;
}

/** A single bounded CLAP socket. It owns framing, handshake state and writes. */
export class PeerConnection {
  private input = Buffer.alloc(0);
  private accepted = false;
  private closed = false;
  private blocked = false;
  private queuedBytes = 0;
  private readonly queue: Buffer[] = [];
  private readonly handshakeTimer: NodeJS.Timeout;
  private maxLineBytes: number;
  private maxQueueMessages: number;
  private maxQueueBytes: number;

  constructor(
    readonly connectionId: string,
    private readonly socket: net.Socket,
    private readonly options: PeerConnectionOptions,
  ) {
    this.maxLineBytes = options.maxLineBytes;
    this.maxQueueMessages = options.maxQueueMessages;
    this.maxQueueBytes = options.maxQueueBytes;
    socket.setEncoding?.("utf8");
    socket.on("data", (chunk: Buffer | string) => this.receive(chunk));
    socket.on("drain", () => this.flush());
    socket.on("error", () => this.close());
    socket.on("close", () => this.finishClose());
    this.handshakeTimer = setTimeout(() => this.close(), options.handshakeTimeoutMs);
    this.handshakeTimer.unref?.();
  }

  markAccepted(): void {
    if (this.closed) return;
    this.accepted = true;
    clearTimeout(this.handshakeTimer);
  }

  applyPeerLimits(limits: { maxLineBytes: number; maxQueueMessages: number; maxQueueBytes: number }): void {
    this.maxLineBytes = Math.min(this.maxLineBytes, limits.maxLineBytes);
    this.maxQueueMessages = Math.min(this.maxQueueMessages, limits.maxQueueMessages);
    this.maxQueueBytes = Math.min(this.maxQueueBytes, limits.maxQueueBytes);
  }

  isAccepted(): boolean {
    return this.accepted && !this.closed;
  }

  send(message: object): boolean {
    if (this.closed) return false;
    const line = Buffer.from(JSON.stringify(message) + "\n", "utf8");
    if (line.byteLength > this.maxLineBytes) {
      this.close();
      return false;
    }

    if (!this.blocked && this.queue.length === 0) {
      this.blocked = !this.socket.write(line);
      if (!this.blocked) return true;
      // A false write means this line was accepted by Node but future lines
      // must wait for drain; it does not itself occupy our pending queue.
      return true;
    }

    if (
      this.queue.length >= this.maxQueueMessages ||
      this.queuedBytes + line.byteLength > this.maxQueueBytes
    ) {
      // Commands are never silently dropped or coalesced in this foundation.
      this.close();
      return false;
    }
    this.queue.push(line);
    this.queuedBytes += line.byteLength;
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.handshakeTimer);
    this.socket.destroy();
    this.finishClose();
  }

  private receive(chunk: Buffer | string): void {
    if (this.closed) return;
    this.input = Buffer.concat([this.input, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8")]);
    if (this.input.byteLength > this.maxLineBytes && this.input.indexOf(0x0a) < 0) {
      this.close();
      return;
    }

    let newline: number;
    while ((newline = this.input.indexOf(0x0a)) >= 0) {
      const raw = this.input.subarray(0, newline);
      this.input = this.input.subarray(newline + 1);
      if (raw.byteLength > this.maxLineBytes) {
        this.close();
        return;
      }
      if (raw.byteLength === 0) continue;
      const text = raw[raw.length - 1] === 0x0d ? raw.subarray(0, -1).toString("utf8") : raw.toString("utf8");
      let message: unknown;
      try {
        message = JSON.parse(text);
      } catch {
        this.close();
        return;
      }
      if (!this.options.validateMessage?.(message)) {
        this.options.onProtocolError?.({ connectionId: this.connectionId, reason: "schema_rejected", frame: message });
        this.close();
        return;
      }
      if (!this.accepted) {
        if ((message as { type?: unknown }).type !== "clap.hello") {
          this.close();
          return;
        }
        this.options.onHello(this, message as Extract<ClapPeerMessage, { type: "clap.hello" }>);
      } else {
        this.options.onMessage?.(this.connectionId, message as object);
      }
      if (this.closed) return;
    }
  }

  private flush(): void {
    if (this.closed) return;
    this.blocked = false;
    while (this.queue.length > 0 && !this.blocked) {
      const line = this.queue.shift()!;
      this.queuedBytes -= line.byteLength;
      this.blocked = !this.socket.write(line);
    }
  }

  private finishClose(): void {
    if (!this.closed) this.closed = true;
    clearTimeout(this.handshakeTimer);
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.options.onClose(this.connectionId);
  }
}
