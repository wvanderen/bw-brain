import { Ajv2020 } from "ajv/dist/2020.js";
import telemetrySchema from "../../../schemas/clap/telemetry.schema.json" with { type: "json" };
import type { ClapTelemetryMessage } from "../gen/clap.js";
import type { PeerRegistry } from "./peer-registry.js";

type Snapshot = Extract<ClapTelemetryMessage, { type: "telemetry.snapshot" }>;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile<Snapshot>(telemetrySchema);

/** Aggregate-only latest-value ingestion. This class has no Pi/session dependency by design. */
export class TelemetryDispatch {
  private readonly latest = new Map<string, Snapshot>();
  constructor(private readonly registry: Pick<PeerRegistry, "requireConfirmed">) {}
  ingest(connectionId: string, message: unknown): boolean {
    if (!validate(message) || message.type !== "telemetry.snapshot") return false;
    try { this.registry.requireConfirmed(connectionId, message.projectId, message.instanceId); }
    catch { return false; }
    // Schema closure is the disclosure allowlist; this explicit copy prevents
    // references supplied by ingress from being mutated after validation.
    const snapshot = structuredClone(message);
    this.latest.set(`${snapshot.projectId}:${snapshot.instanceId}`, snapshot);
    return true;
  }
  get(projectId: string, instanceId: string): Snapshot | undefined {
    const value = this.latest.get(`${projectId}:${instanceId}`);
    return value && structuredClone(value);
  }
  removeProject(projectId: string): void {
    for (const [key, value] of this.latest) if (value.projectId === projectId) this.latest.delete(key);
  }
}
