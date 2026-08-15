import { randomBytes } from "node:crypto";

export interface CorrelationScope {
  projectId: string;
  instanceId: string;
  trackSid: string;
  trackSlot: number;
  trackHint?: string;
  deviceHint: string | null;
}

export interface ConfirmedCorrelation extends CorrelationScope {
  status: "confirmed";
  selectedDeviceEvidence: "controller-selected-device";
  nonce: string;
}

export type CorrelationState =
  | { status: "unconfirmed" | "stale" | "unlinked" }
  | { status: "confirmationPending"; scope: CorrelationScope; nonce: string; expiresAt: number }
  | ConfirmedCorrelation;

export interface CorrelationSender {
  send(type: string, payload?: object): Promise<object>;
}

interface Options {
  expiryMs?: number;
  now?: () => number;
  nonce?: () => string;
}

const DEFAULT_EXPIRY_MS = 10_000;

/** One-time, nonce-bound controller authority for linking one CLAP instance. */
export class ControllerCorrelationService {
  private sender: CorrelationSender;
  private readonly expiryMs: number;
  private readonly now: () => number;
  private readonly mintNonce: () => string;
  private current: CorrelationState = { status: "unconfirmed" };
  private generation = 0;

  constructor(sender: CorrelationSender, options: Options = {}) {
    this.sender = sender;
    this.expiryMs = options.expiryMs ?? DEFAULT_EXPIRY_MS;
    this.now = options.now ?? Date.now;
    this.mintNonce = options.nonce ?? (() => randomBytes(24).toString("base64url"));
  }

  state(): CorrelationState {
    return this.current;
  }

  async requestConfirmation(scope: CorrelationScope): Promise<ConfirmedCorrelation> {
    this.generation += 1;
    const nonce = this.mintNonce();
    const expiresAt = this.now() + this.expiryMs;
    const requestGeneration = this.generation;
    this.current = { status: "confirmationPending", scope: { ...scope }, nonce, expiresAt };
    let response: object;
    try {
      response = await this.sender.send("get.clap_correlation", { ...scope, nonce });
    } catch (error) {
      if (requestGeneration === this.generation) this.current = { status: "unconfirmed" };
      throw error;
    }
    const confirmed = requestGeneration === this.generation ? this.accept(response) : false;
    if (!confirmed) {
      if (requestGeneration === this.generation) this.current = { status: "unconfirmed" };
      throw new Error("controller confirmation rejected");
    }
    return confirmed;
  }

  /** Accept the current proof once; late, replayed, expired, or mismatched proofs fail closed. */
  accept(response: object): ConfirmedCorrelation | false {
    if (this.current.status !== "confirmationPending") return false;
    const pending = this.current;
    if (this.now() > pending.expiresAt) return false;
    const r = response as Record<string, unknown>;
    if (r.available !== true
        || r.projectId !== pending.scope.projectId
        || r.instanceId !== pending.scope.instanceId
        || r.trackSid !== pending.scope.trackSid
        || r.trackSlot !== pending.scope.trackSlot
        || r.nonce !== pending.nonce
        || r.selectedDeviceEvidence !== "controller-selected-device") return false;
    const confirmed: ConfirmedCorrelation = {
      status: "confirmed",
      ...pending.scope,
      selectedDeviceEvidence: "controller-selected-device",
      nonce: pending.nonce,
    };
    this.current = confirmed;
    return confirmed;
  }

  onControllerDisconnect(): void {
    this.generation += 1;
    this.current = { status: "stale" };
  }

  onControllerReconnect(sender: CorrelationSender): void {
    this.generation += 1;
    this.sender = sender;
    this.current = { status: "unlinked" };
  }
}
