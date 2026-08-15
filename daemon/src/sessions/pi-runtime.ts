export type PiSessionEvent = { type: string; [key: string]: unknown };

export type PiRuntimeFailureCode = "pi_auth_required" | "pi_model_unavailable" | "pi_failed";

/** Bounded Pi failure classification. Raw SDK errors may contain local paths or provider details. */
export class PiRuntimeFailure extends Error {
  constructor(readonly code: PiRuntimeFailureCode) {
    super(code);
    this.name = "PiRuntimeFailure";
  }
}

export function classifyPiSdkFailure(error: unknown): PiRuntimeFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("No API key found for ") || message.startsWith("Authentication failed for ")) {
    return new PiRuntimeFailure("pi_auth_required");
  }
  if (message.startsWith("No model selected") || message.startsWith("No models available")) {
    return new PiRuntimeFailure("pi_model_unavailable");
  }
  return new PiRuntimeFailure("pi_failed");
}

export interface PiTool {
  readonly name: string;
  readonly description: string;
  execute(params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}

export interface PiProjectSession {
  readonly sessionFile?: string;
  subscribe(listener: (event: PiSessionEvent) => void): () => void;
  prompt(text: string, signal?: AbortSignal): Promise<void>;
  abort(): void;
  dispose(): void;
}

export interface PiRuntime {
  create(projectId: string, tools: PiTool[]): Promise<PiProjectSession>;
  open(projectId: string, tools: PiTool[]): Promise<PiProjectSession>;
  fork(sourceProjectId: string, targetProjectId: string, tools: PiTool[]): Promise<PiProjectSession>;
}
