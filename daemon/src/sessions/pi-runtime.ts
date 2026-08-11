export type PiSessionEvent = { type: string; [key: string]: unknown };

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
