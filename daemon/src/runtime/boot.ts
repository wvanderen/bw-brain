// daemon/src/runtime/boot.ts
//
// Daemon main() — the assembly 02-03b explicitly deferred (02-03b-SUMMARY.md
// "Next Phase Readiness": "a daemon entry point that constructs StaleWatchdog
// + UnixDomainSocketServerTransport + startQueryServer, but that boot wiring
// is the remaining assembly step — out of this plan's scope"). 02-07 closes
// that gap.
//
// RESEARCH.md Pattern 3 (UDS path stable + cleaned on daemon exit) + Pitfall
// 5 (loopback + 0600) + Pitfall 3 (never block inside a data callback —
// persistence is DEBOUNCED 1s here, not sync on the event path).
//
// CRITICAL FINDING: the current bridge (BridgeExtension.startConnector:
// 80-103) does NOT emit a `hello` envelope on connect. It opens the socket +
// starts the writer/pull threads but sends no hello — verified by grep. So
// the reconnect trigger is "TCP accept + get.project_summary response", NOT
// "hello arrived." The dispatcher's hello branch is wired for forward
// compatibility + exercised by the smoke test's fake bridge.
//
// M1 LIMITATION CLOSED (Phase 5 Plan 05-03, D-05-16): the bridge now handles
// get.project_meta (tempo/timeSignature from pull-only Transport observers)
// and the connect path folds it into project state below (refreshSnapshot).
// DEFAULT_PROJECT survives ONLY as the disconnected/lastState-absent fallback
// and as the honest pre-fire default — never as a fabricated live value.

import * as net from "node:net";
import * as fs from "node:fs";
import { unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { TcpServerTransport } from "../transport/tcp.js";
import { UnixDomainSocketServerTransport } from "../transport/uds.js";
import { createReader } from "../protocol/reader.js";
import { RequestCorrelator } from "../protocol/correlator.js";
import { StaleWatchdog, STALE_THRESHOLD_MS } from "../state/stale-watchdog.js";
import { normalize } from "../ingest/normalizer.js";
import type { RawState } from "../state/reconcile.js";
import type { StableIdMap } from "../state/reconcile.js";
import { reconcile } from "../state/reconcile.js";
import { emptyStableIdMap } from "../state/reconcile.js";
import { loadOrInit, save, type StateCachePayload } from "../store/state-cache.js";
import { loadIntent } from "../state/intent-store.js";
import { createDispatcher } from "./dispatcher.js";
import { startQueryServer } from "../query/query-server.js";
import { DEFAULT_SOCKET } from "../cli/query-client.js";
import { CandidateStore } from "../patch/candidate-store.js";
import { PatchHistory } from "../patch/patch-history.js";
import { PeerServer } from "../peers/peer-server.js";
import { TelemetryDispatch } from "../peers/telemetry-dispatch.js";
import { ControllerCorrelationService } from "../sessions/controller-correlation.js";
import { EditService } from "./edit-service.js";
import { ActionDispatch } from "../peers/action-dispatch.js";
import { SessionActions } from "../peers/session-actions.js";
import { StopCoordinator } from "./stop-coordinator.js";
import { ProjectRegistry } from "../sessions/project-registry.js";
import { FocusRegistry, requireConfirmedFocusedScope } from "../sessions/focus-registry.js";
import { ProjectSessionManager } from "../sessions/project-session-manager.js";
import { PiSdkAdapter } from "../sessions/pi-sdk-adapter.js";
import { createRestrictedPiTools } from "../sessions/pi-tools.js";
import { ProposalStore, type ProposalInput } from "../proposals/proposal-store.js";
import { ApprovalStore } from "../proposals/approval-store.js";
import { ProposalDispatch } from "../proposals/proposal-dispatch.js";
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import type { Patch } from "../gen/patch.js";
import type { ProjectIntent } from "../gen/intent.js";
// Phase 4 Plan 04-05 — arrangement snapshot + roles stores (D-03 / ARRANGE-05).
import { saveArrangementSnapshot, loadArrangementSnapshot, type ArrangementSnapshot } from "../state/arrangement-snapshot.js";
// Phase 04.3 Plan 04.3-02 — shared arrangement review evidence assembly (single source).
import {
  assembleArrangementReviewEvidence,
  refreshArrangementSnapshot,
  type ArrangementReviewOutcome,
} from "../query/query-server.js";
// Phase 5 Plan 05-09 — device-review evidence assembly + macro single source
// (the injected deviceReview dependency follows the reviewArrangement seam).
import {
  assembleDeviceReviewEvidence,
  buildMacroSuggestions,
  refreshSalienceSnapshot,
  type DeviceReviewOutcome,
} from "../query/query-server.js";
import { loadSalienceSnapshot, type SalienceSnapshot } from "../state/salience-snapshot.js";
import type { ProposalScope } from "../proposals/proposal-store.js";
import type { Assumption } from "../state/analyzer-registry.js";

/** The daemon's protocol version. Matches bridge LineJson.VERSION (LineJson.java:25). */
export const OUR_VERSION = "1.0";

/** Default TCP port the bridge connects to (loopback-only — Pitfall 5). */
export const DEFAULT_TCP_PORT = 7878;

/** Default state-cache path (lives alongside the UDS socket). */
export const DEFAULT_STATE_CACHE_PATH: string = join(dirname(DEFAULT_SOCKET), "state-cache.json");

/**
 * Default intent path (M1 assumption: the daemon is launched from the project
 * root, so <cwd>/.bw-brain/intent.json is the project-local intent slot).
 */
export const DEFAULT_INTENT_PATH: string = join(process.cwd(), ".bw-brain", "intent.json");

/**
 * Phase 4 Plan 04-05 — path to .bw-brain/arrangement-snapshot.json (D-03). The
 * durable mirror of the launcher grid + derived analysis fields.
 */
export const DEFAULT_ARRANGEMENT_SNAPSHOT_PATH: string = join(process.cwd(), ".bw-brain", "arrangement-snapshot.json");

/**
 * Phase 4 Plan 04-05 — path to .bw-brain/roles.json (ARRANGE-05 durable store).
 * arrange.refresh persists track-role classifications here.
 */
export const DEFAULT_ROLES_PATH: string = join(process.cwd(), ".bw-brain", "roles.json");

/**
 * Phase 5 Plan 05-04 — path to .bw-brain/salience-snapshot.json (AUTO-01
 * durable store, D-05-04). automation.inspect refreshes/persists the ranked
 * per-parameter salience snapshot here.
 */
export const DEFAULT_SALIENCE_SNAPSHOT_PATH: string = join(process.cwd(), ".bw-brain", "salience-snapshot.json");

/**
 * 04.3 / 04.3-07 (DEFECT A daemon half) — per-request correlator deadline for
 * the get.launcher_clips pull (all three send sites). Derivation:
 *   5000ms  BankSyncWait settle-wait cap (Plan 04.3-06, BANK_SYNC_MAX_WAIT_MS)
 * + 64000ms 128 cells × 500ms D-22 per-cell ceiling
 *           (LauncherGridWalker.DEFAULT_PER_CELL_TIMEOUT_MS over
 *            BridgeExtension BANK_SIZE 8 × SCENE_COUNT 16 = 8×16=128 cells)
 * + margin  serialization/reply overhead
 * ≈ 90s. Empty cells return from the observers cache in microseconds, so
 * typical pulls finish FAR below this ceiling — the deadline exists so the
 * documented worst case can never be misreported as a bridge failure (the
 * 2026-08-21 live UAT dropped a populated-but-slow first walk at the 3000ms
 * default while its fast-empty predecessor poisoned the snapshot). Every
 * other get.* pull keeps the 3000ms correlator default.
 */
const LAUNCHER_GRID_PULL_TIMEOUT_MS = 90_000;

/** M1 LIMITATION (Minor 3 fix): the bridge does not pull project metadata. */
const DEFAULT_PROJECT = { name: "", tempo: 120, timeSignature: "4/4" } as const;

/**
 * Phase 5 Plan 05-03 (D-05-16) — pure fold of a get.project_meta response
 * into the project block. Defensive on every field (the 02-03b validate-at-
 * boundary discipline applies to the daemon's own state too): a non-positive/
 * non-finite/wrong-typed tempo and a non-`N/M` timeSignature are REJECTED —
 * the corresponding default survives rather than fabricating a live value.
 * A response carrying nothing usable returns the CURRENT block unchanged
 * (reference-equal no-op).
 *
 * `name` is intentionally never taken from the response: the bridge's
 * buildProjectMetaResponse pins it to "" (Project exposes no document name
 * in extension-api:21 — javap-verified), so the existing value (which may
 * come from persisted state) wins.
 */
export function foldProjectMeta(
  current: { name: string; tempo: number; timeSignature: string; [k: string]: unknown },
  response: unknown,
): { name: string; tempo: number; timeSignature: string; [k: string]: unknown } {
  if (response === null || typeof response !== "object") return current;
  const r = response as Record<string, unknown>;
  const tempo =
    typeof r.tempo === "number" && Number.isFinite(r.tempo) && r.tempo > 0 ? r.tempo : undefined;
  const timeSignature =
    typeof r.timeSignature === "string" && /^\d+\/\d+$/.test(r.timeSignature) ? r.timeSignature : undefined;
  if (tempo === undefined && timeSignature === undefined) return current;
  return {
    ...current,
    ...(tempo !== undefined ? { tempo } : {}),
    ...(timeSignature !== undefined ? { timeSignature } : {}),
  };
}

/** The baseline RawState the daemon seeds from a get.project_summary response. */
const BASELINE_RAW_STATE: RawState = {
  version: "1.0",
  project: { ...DEFAULT_PROJECT },
  selection: {},
  tracks: [],
  clips: [],
  devices: [],
};

type SelectedClipNote = { key: string; pitch: number; start: number; length: number; velocity: number };

/**
 * Convert the live controller pull into a bounded, exact-scope model context.
 * A cursor move between authorization and pull fails closed instead of feeding
 * Pi notes from a different clip.
 */
export function selectedClipAnalysisContext(expectedClipSid: string | undefined, response: unknown): { selectedClip: { clipSid: string; notes: SelectedClipNote[] } } {
  if (!expectedClipSid || !response || typeof response !== "object") throw new Error("analysis_context_unavailable");
  const value = response as Record<string, unknown>;
  if (value.clipSid !== expectedClipSid || !Array.isArray(value.notes) || value.notes.length > 512) throw new Error("analysis_context_scope_mismatch");
  const notes = value.notes.map((raw): SelectedClipNote => {
    if (!raw || typeof raw !== "object") throw new Error("analysis_context_invalid");
    const note = raw as Record<string, unknown>;
    const valid = typeof note.key === "string" && note.key.length > 0 && note.key.length <= 128
      && Number.isInteger(note.pitch) && Number(note.pitch) >= 0 && Number(note.pitch) <= 127
      && typeof note.start === "number" && Number.isFinite(note.start) && note.start >= 0 && note.start <= 4096
      && typeof note.length === "number" && Number.isFinite(note.length) && note.length > 0 && note.length <= 4096
      && typeof note.velocity === "number" && Number.isFinite(note.velocity) && note.velocity >= 1 && note.velocity <= 127;
    if (!valid) throw new Error("analysis_context_invalid");
    return { key: note.key as string, pitch: note.pitch as number, start: note.start as number, length: note.length as number, velocity: note.velocity as number };
  });
  return { selectedClip: { clipSid: expectedClipSid, notes } };
}

/** Options for {@link createArrangementReviewDependency} (04.3-02 Task 2). */
export interface ArrangementReviewDependencyOptions {
  /** Path to .bw-brain/arrangement-snapshot.json (absent → not_implemented). */
  arrangementSnapshotPath?: string;
  /** Path to .bw-brain/roles.json (refresh persists classifications). */
  rolesPath?: string;
  intent: () => ProjectIntent | null;
  /** Freshness source (the watchdog) — drives the disconnected+refresh refusal. */
  freshness: () => "live" | "stale" | "disconnected";
  /** The existing daemon→bridge get.launcher_clips pull (CLI refresh semantics). */
  pullLauncherGrid: () => Promise<unknown>;
}

/**
 * 04.3 / 04.3-02 Task 2 — the injected arrangement review dependency consumed
 * by ActionDispatch's arrangement.review branch (RB-03/RB-05/UX-03 daemon
 * half). Loads the durable snapshot (or pulls fresh when refresh is requested
 * while connected — mirroring the CLI arrange.* refresh semantics exactly),
 * then delegates to assembleArrangementReviewEvidence: the shared
 * transport-free evidence assembly from query-server.ts (single source).
 *
 * Scope gating is NOT repeated here — ActionDispatch's confirmed-scope gate
 * has already run before this dependency is invoked.
 */
export function createArrangementReviewDependency(
  options: ArrangementReviewDependencyOptions,
): (request: { scope: ProposalScope; refresh: boolean }) => Promise<ArrangementReviewOutcome> {
  return async (request) => {
    void request.scope; // evidence is snapshot-scoped; peer scope gating happened in ActionDispatch
    if (!options.arrangementSnapshotPath) return { kind: "refusal", reason: "not_implemented" };
    const freshness = options.freshness();
    // A fresh pull needs the bridge — hard-refuse instead of guessing from a
    // possibly-stale grid while disconnected (T-04.3-05 / Pitfall 5).
    if (freshness === "disconnected" && request.refresh) return { kind: "refusal", reason: "state_disconnected" };
    let snap: ArrangementSnapshot | null = null;
    // 04.3-07 (DEFECT C): distinguish INVALID from ABSENT. An invalid file
    // (without refresh) refuses visibly with the bounded snapshot_invalid code
    // — it must not masquerade as the honest no-snapshot outcome ("no
    // snapshot, run refresh" would lie about a file that EXISTS and is bad);
    // an absent file keeps the no-snapshot outcome via snap null below.
    let loadFailed = false;
    try {
      snap = await loadArrangementSnapshot(options.arrangementSnapshotPath);
    } catch (e) {
      // The deterministic review path never throws across the peer boundary.
      console.error("[boot] arrangement snapshot load failed:", (e as Error).message);
      loadFailed = true;
    }
    if (request.refresh) {
      // A refresh proceeds past a corrupted file — the fresh pull replaces it
      // (and lands in the 04.3-07 validated write gate on save).
      snap = await refreshArrangementSnapshot({
        pullLauncherGrid: options.pullLauncherGrid,
        arrangementSnapshotPath: options.arrangementSnapshotPath,
        rolesPath: options.rolesPath,
        intent: options.intent(),
      });
    } else if (loadFailed) {
      return { kind: "refusal", reason: "snapshot_invalid" };
    }
    return assembleArrangementReviewEvidence({
      snap,
      intent: options.intent(),
      freshness,
      refresh: request.refresh,
      snapshotConfigured: true,
    });
  };
}

/** Options for {@link createDeviceReviewDependency} (05-09 Task 2). */
export interface DeviceReviewDependencyOptions {
  /** Path to .bw-brain/salience-snapshot.json (absent → not_implemented). */
  salienceSnapshotPath?: string;
  /** Path to .bw-brain/roles.json — the roleSalience prior on refresh. */
  rolesPath?: string;
  /** Path to .bw-brain/arrangement-snapshot.json — the energyAtMovement prior on refresh. */
  arrangementSnapshotPath?: string;
  intent: () => ProjectIntent | null;
  /** Freshness source (the watchdog) — drives the disconnected+refresh refusal. */
  freshness: () => "live" | "stale" | "disconnected";
  /** Live folded state — the refresh source (parameters + selection) + the chain fallback cache. */
  state: () => RawState | null;
  /** The existing daemon→bridge get.selected_device_chain pull (chain summary). */
  pullDeviceChain: () => Promise<unknown>;
}

/**
 * 05-09 Task 2 — the injected device-review dependency consumed by
 * ActionDispatch's device.review branch (UX-04/SC#5). Mirrors
 * {@link createArrangementReviewDependency} exactly: the refusal ladder
 * (unconfigured / disconnected+refresh / corrupt-without-refresh), the
 * refresh via the shared refreshSalienceSnapshot (query-server single
 * source), then assembleDeviceReviewEvidence with the chain from the
 * existing device-chain read (fresh pull when live + cursor, the folded
 * cache otherwise — handleDeviceInspect semantics) and macros from the
 * macroSuggest single source. Deterministic: zero Pi on this path.
 *
 * Scope gating is NOT repeated here — ActionDispatch's confirmed-scope gate
 * has already run before this dependency is invoked.
 */
export function createDeviceReviewDependency(
  options: DeviceReviewDependencyOptions,
): (request: { scope: ProposalScope; refresh: boolean }) => Promise<DeviceReviewOutcome> {
  return async (request) => {
    void request.scope; // evidence is snapshot-scoped; peer scope gating happened in ActionDispatch
    if (!options.salienceSnapshotPath) return { kind: "refusal", reason: "not_implemented" };
    const freshness = options.freshness();
    // A fresh analysis needs the folded parameter movements — hard-refuse
    // instead of guessing from a possibly-stale snapshot while disconnected.
    if (freshness === "disconnected" && request.refresh) return { kind: "refusal", reason: "state_disconnected" };
    let snap: SalienceSnapshot | null = null;
    // The arrangement DEFECT C discipline: distinguish INVALID from ABSENT —
    // an invalid file (without refresh) refuses visibly with snapshot_invalid;
    // an absent file keeps the honest no-snapshot outcome via snap null below.
    let loadFailed = false;
    try {
      snap = await loadSalienceSnapshot(options.salienceSnapshotPath);
    } catch (e) {
      console.error("[boot] salience snapshot load failed:", (e as Error).message);
      loadFailed = true;
    }
    if (request.refresh) {
      // A refresh proceeds past a corrupted file — the fresh analysis replaces it.
      const state = options.state();
      snap = await refreshSalienceSnapshot({
        parameters: state?.parameters,
        trackKey: state?.selection.trackSid ?? "",
        salienceSnapshotPath: options.salienceSnapshotPath,
        rolesPath: options.rolesPath,
        arrangementSnapshotPath: options.arrangementSnapshotPath,
        intent: options.intent(),
      });
    } else if (loadFailed) {
      return { kind: "refusal", reason: "snapshot_invalid" };
    }
    // Chain summary: fresh pull when live + a cursor selection exists (the
    // handleDeviceInspect gate); every failure/no-cursor case serves the
    // folded devices cache — honest degradation, never fabricated.
    const state = options.state();
    const hasCursor = !!state?.selection.deviceSid || !!state?.selection.trackSid;
    let chain: unknown[] = (state?.devices as unknown[] | undefined) ?? [];
    if (freshness !== "disconnected" && hasCursor) {
      try {
        const fresh = (await options.pullDeviceChain()) as { devices?: unknown };
        if (Array.isArray(fresh?.devices)) chain = fresh.devices;
      } catch (e) {
        console.error("[boot] device-review chain pull failed; serving folded cache:", (e as Error).message);
      }
    }
    return assembleDeviceReviewEvidence({
      snap,
      chain,
      macros: snap ? buildMacroSuggestions(snap).suggestions : [],
      intent: options.intent(),
      freshness,
      refresh: request.refresh,
      snapshotConfigured: true,
    });
  };
}

/** The bounded arrangement evidence object resolveAnalysisContext enriches Analyze turns with (04.3-02). */
export interface ArrangementAnalysisEvidence {
  sections: Array<{ label: string; startScene: number; endScene: number }>;
  energy: { bars: number; peak: number };
  repetitionClusters: number;
  trackRoles: Record<string, { role: string; confidence: number }>;
  pulledAt: string | null;
  assumptions: Assumption[];
}

/** Options for {@link loadArrangementAnalysisEvidence} (04.3-02 Task 2). */
export interface ArrangementAnalysisEvidenceOptions {
  arrangementSnapshotPath?: string;
  intent: () => ProjectIntent | null;
}

/** Cap the enrichment so an explicit Analyze turn stays bounded (RB-05: bounded confirmed context only). */
const MAX_ANALYSIS_EVIDENCE_ENTRIES = 64;

/**
 * 04.3 / 04.3-02 Task 2 — load a BOUNDED arrangement-derived evidence object
 * for explicit Analyze turns (resolveAnalysisContext enrichment). Built on
 * the shared evidence assembly (single source); carries a pulledAt assumption
 * when a snapshot exists and an explicit no-snapshot assumption when it does
 * not (UX-06 discipline). Never throws — the Analyze turn is not hostage to
 * arrangement-file problems; degradation is logged + assumed.
 *
 * The Pi create_proposal-per-turn contract is untouched (T-04.3-09): this
 * only widens the context object the daemon hands to its own Pi runtime.
 */
export async function loadArrangementAnalysisEvidence(
  options: ArrangementAnalysisEvidenceOptions,
): Promise<{ arrangement: ArrangementAnalysisEvidence }> {
  const noSnapshot = (claim: string): { arrangement: ArrangementAnalysisEvidence } => ({
    arrangement: {
      sections: [],
      energy: { bars: 0, peak: 0 },
      repetitionClusters: 0,
      trackRoles: {},
      pulledAt: null,
      assumptions: [{ claim, confidence: 1.0, source: "default" }],
    },
  });
  try {
    if (!options.arrangementSnapshotPath) {
      return noSnapshot("arrangement analysis not configured on this daemon");
    }
    let snap: ArrangementSnapshot | null = null;
    try {
      snap = await loadArrangementSnapshot(options.arrangementSnapshotPath);
    } catch (e) {
      console.error("[boot] analysis-context arrangement snapshot load failed:", (e as Error).message);
    }
    const outcome = assembleArrangementReviewEvidence({
      snap,
      intent: options.intent(),
      freshness: "live", // enrichment never pulls + never refresh-refuses (refresh: false)
      refresh: false,
      snapshotConfigured: true,
    });
    if (outcome.kind !== "evidence") {
      return noSnapshot("no arrangement snapshot loaded — run a review with refresh to pull the grid");
    }
    const { evidence } = outcome;
    const trackRoles: ArrangementAnalysisEvidence["trackRoles"] = {};
    for (const [trackSid, role] of Object.entries(evidence.trackRoles).slice(0, MAX_ANALYSIS_EVIDENCE_ENTRIES)) {
      trackRoles[trackSid] = { role: role.role, confidence: role.confidence };
    }
    return {
      arrangement: {
        sections: evidence.sections
          .slice(0, MAX_ANALYSIS_EVIDENCE_ENTRIES)
          .map((s) => ({ label: s.label, startScene: s.startScene, endScene: s.endScene })),
        energy: {
          bars: evidence.energyCurve.length,
          peak: evidence.energyCurve.reduce((max, p) => Math.max(max, p.value), 0),
        },
        repetitionClusters: evidence.repetition.length,
        trackRoles,
        pulledAt: evidence.pulledAt,
        assumptions: [evidence.assumptions.at(-1) ?? { claim: "derived from the arrangement snapshot", confidence: 1.0, source: "default" }],
      },
    };
  } catch (e) {
    console.error("[boot] analysis-context arrangement enrichment failed:", (e as Error).message);
    return noSnapshot("arrangement evidence unavailable (load failed)");
  }
}

/** Options for {@link boot}. */
export interface BootOptions {
  /** UDS socket path (default {@link DEFAULT_SOCKET}). */
  socketPath?: string;
  /** TCP port for the bridge listener (default {@link DEFAULT_TCP_PORT}). */
  tcpPort?: number;
  /** Dedicated CLAP peer port (default 7879, never controller TCP). */
  peerPort?: number;
  /** Dedicated CLAP bind host; PeerServer refuses anything but 127.0.0.1. */
  peerHost?: string;
  /** State-cache path (default {@link DEFAULT_STATE_CACHE_PATH}). */
  stateCachePath?: string;
  /** Intent path (default {@link DEFAULT_INTENT_PATH}). */
  intentPath?: string;
  /** Phase 4: arrangement-snapshot path (default {@link DEFAULT_ARRANGEMENT_SNAPSHOT_PATH}). */
  arrangementSnapshotPath?: string;
  /** Phase 4: roles.json path (default {@link DEFAULT_ROLES_PATH}). */
  rolesPath?: string;
  /** Phase 5 (05-04): salience-snapshot path (default {@link DEFAULT_SALIENCE_SNAPSHOT_PATH}). */
  salienceSnapshotPath?: string;
}

/** Handle returned by boot() so callers (smoke test, harness) can shut down. */
export interface BootHandle {
  /** Actual CLAP peer port (useful when port 0 requests an ephemeral test port). */
  peerPort: number;
  /** Gracefully shut down: persist state, close transports, unlink socket. */
  shutdown: () => Promise<void>;
}

/**
 * Boot the daemon: probe stale socket, load persisted state, construct
 * transports + watchdog + correlator, wire the reader + dispatcher + query
 * server, install signal handlers. Returns a {@link BootHandle} for graceful
 * shutdown.
 *
 * @returns the boot handle (call `shutdown()` to tear down).
 * @throws if a live daemon is already serving at `socketPath` (the stale-
 *   socket probe connected — refusing to start a second instance).
 */
export async function boot(opts: BootOptions = {}): Promise<BootHandle> {
  const socketPath = opts.socketPath ?? DEFAULT_SOCKET;
  const tcpPort = opts.tcpPort ?? DEFAULT_TCP_PORT;
  const peerPort = opts.peerPort ?? PeerServer.DEFAULT_PORT;
  const stateCachePath = opts.stateCachePath ?? DEFAULT_STATE_CACHE_PATH;
  const intentPath = opts.intentPath ?? DEFAULT_INTENT_PATH;
  const arrangementSnapshotPath = opts.arrangementSnapshotPath ?? DEFAULT_ARRANGEMENT_SNAPSHOT_PATH;
  const rolesPath = opts.rolesPath ?? DEFAULT_ROLES_PATH;
  const salienceSnapshotPath = opts.salienceSnapshotPath ?? DEFAULT_SALIENCE_SNAPSHOT_PATH;

  // --- a. Stale-socket probe (RESEARCH.md Pattern 3 "cleaned on daemon exit"
  //     precedent; dbus/ssh-agent convention). Distinguishes live (connect ->
  //     refuse) from stale (ECONNREFUSED -> unlink). -------------------------
  await probeStaleSocket(socketPath);

  // --- b. Load persisted state (so a daemon restart doesn't lose project
  //     memory). -------------------------------------------------------------
  const cachePayload = await loadOrInit(stateCachePath);
  const stableIds = stableIdsFromPayload(cachePayload.stableIds);
  let lastState: RawState | null = (cachePayload.lastRawState as RawState | undefined) ?? null;
  let summaryTracks: { slot: number; name: string }[] = [];

  // --- c. Load intent (a malformed user-authored intent is user-fixable;
  //     the daemon stays up with null intent). ------------------------------
  let intent: ProjectIntent | null = null;
  try {
    intent = await loadIntent(intentPath);
  } catch (e) {
    console.error("[boot] intent.json invalid — proceeding with null intent:", (e as Error).message);
  }

  // --- d. Construct watchdog + transports + correlator. -------------------
  // Rule 2 fix: mkdir the socket parent dir before listen. node's
  // net.Server.listen(path) does NOT create the parent directory; without
  // this the default ~/.bw-brain/ daemon.sock path fails EACCES/ENOENT on a
  // fresh machine. The smoke test passes because it uses an existing temp
  // dir; production `npm start` would fail without this.
  fs.mkdirSync(dirname(socketPath), { recursive: true });
  const watchdog = new StaleWatchdog();
  const tcp = new TcpServerTransport({ port: tcpPort });
  const uds = new UnixDomainSocketServerTransport({ socketPath });
  await uds.ready; // chmod 0o600 runs here (Pitfall 5 — asserted in smoke test).
  // Phase 04.2: CLAP peers have a dedicated connection-aware endpoint.
  // It shares no transport or dispatcher with controller TCP, and at this
  // foundation stage accepts validated identity handshakes without starting
  // analysis, Pi, proposal, approval, or mutation work.
  let telemetry: TelemetryDispatch | undefined;
  let routePeerAction: ((connectionId: string, message: Record<string, unknown>) => void) | undefined;
  const peers = new PeerServer({ port: peerPort, host: opts.peerHost,
    onMessage: (connectionId, message) => { telemetry?.ingest(connectionId, message); routePeerAction?.(connectionId, message as Record<string, unknown>); },
  });
  telemetry = new TelemetryDispatch(peers.registry);
  await peers.ready;

  // `let` because step e swaps the correlator on bridge disconnect. The
  // query-server's pull callbacks + the dispatcher read this slot lazily so
  // the swap is transparent to both.
  let correlator: RequestCorrelator = new RequestCorrelator(tcp, { timeoutMs: 3_000 });
  const controllerCorrelation = new ControllerCorrelationService(correlator);

  // --- i. Persistence debounce (Pitfall 3: never sync disk I/O on the event
  //     path). 1s coalesces a burst of events into one atomic write. --------
  let persistTimer: NodeJS.Timeout | null = null;
  const schedulePersist = (s: RawState): void => {
    if (persistTimer) return;
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      try {
        await save(stateCachePath, {
          version: "1.0",
          stableIds: stableIdsToPayload(stableIds),
          lastRawState: s,
        });
      } catch (e) {
        console.error("[boot] state-cache save failed:", (e as Error).message);
      }
    }, 1_000);
  };

  // --- g. refreshSnapshot() — the (re)connect + reconcile path. ----------
  const refreshSnapshot = async (): Promise<void> => {
    try {
      const resp = (await correlator.send("get.project_summary")) as {
        tracks?: { slot: number; name: string }[];
      };
      const summaryTrackList = resp.tracks ?? [];
      // Rule 2 fix: the bridge returns ONLY {slot, name}. reconcile() needs
      // the full ObservedObject shape {name, type, neighbors, contentHash}.
      // Enrich each summary track into that shape (type="track"; neighbors =
      // sorted [prev, next] names; contentHash = stable M1 placeholder
      // derived from name — Phase 3+ will populate clip-derived content).
      const enrichedTracks = enrichSummaryTracks(summaryTrackList);
      const observed = normalize({
        ...BASELINE_RAW_STATE,
        tracks: enrichedTracks,
        // Preserve any previously-loaded project metadata (M1: still defaults
        // — get.project_summary carries none; this guards forward-compat).
        project: lastState?.project ?? { ...DEFAULT_PROJECT },
      });
      if (!observed) {
        console.error("[boot] get.project_summary response failed normalization");
        return;
      }
      summaryTracks = summaryTrackList;
      reconcile(observed, stableIds, Date.now());
      lastState = observed;

      // Phase 5 Plan 05-03 (D-05-16) — real project meta on (re)connect.
      // Best-effort secondary pull mirroring the D-03d clipSid reconcile
      // discipline (03.1 P02): a failed meta pull NEVER blocks boot — the
      // DEFAULT_PROJECT fallback (retained above) survives untouched and
      // nothing is fabricated. Closes the M1 tempo=120 limitation.
      try {
        const metaResp = (await correlator.send("get.project_meta")) as unknown;
        lastState = {
          ...lastState,
          project: foldProjectMeta(lastState.project, metaResp) as typeof lastState.project,
        };
      } catch (e) {
        console.error("[boot] get.project_meta pull failed:", (e as Error).message);
      }

      // D-03d (Phase 03.1-02): eagerly reconcile selection.clipSid on
      // (re)connect. CONTEXT.md claimed refreshSnapshot already pulled
      // get.selected_clip — it did NOT (only get.project_summary, RESEARCH
      // §D-03d / Pitfall 3). The bridge's get.selected_clip response now
      // carries the top-level clipSid field (D-03b); fold it into
      // selection.clipSid so the apply pre-flight has a fresh clipSid on
      // reconnect without waiting for the next clip.name_changed event.
      // Best-effort: the project_summary pull already succeeded; clipSid
      // populates lazily on the next clip.name_changed event if this fails.
      try {
        const clipResp = (await correlator.send("get.selected_clip")) as { clipSid?: string };
        if (typeof clipResp.clipSid === "string" && clipResp.clipSid) {
          lastState = {
            ...lastState,
            selection: { ...lastState.selection, clipSid: clipResp.clipSid },
          };
        }
      } catch (e) {
        console.error("[boot] get.selected_clip clipSid reconcile failed:", (e as Error).message);
      }

      // Phase 4 Plan 04-05 (D-19): best-effort launcher-grid pull on (re)connect.
      // Saves the raw grid to arrangement-snapshot.json (derived fields populate
      // lazily on `bw-arrange refresh` running the M3 analyzers). Failure does
      // NOT block daemon startup — the snapshot populates on demand.
      // 04.3-07: the pull waits honestly for the walk's documented worst case
      // (90s per-request deadline) and the save lands in the validated write
      // gate (DEFECT B) — a raced/incomplete grid is refused, prior file kept.
      try {
        const gridResp = (await correlator.send("get.launcher_clips", {}, { timeoutMs: LAUNCHER_GRID_PULL_TIMEOUT_MS })) as {
          tracks?: Array<{ scenes?: unknown[] }>;
          sceneNames?: string[];
        };
        if (Array.isArray(gridResp.tracks) && gridResp.tracks.length > 0) {
          const tracks = gridResp.tracks as Array<{
            trackSid: string;
            name: string;
            scenes: Array<{ sceneIdx: number; clipSid: string; hasContent: boolean; loopBeats: number; notes: Array<{ key: string; pitch: number; start: number; length: number; velocity: number }> }>;
          }>;
          const sceneCount = tracks.reduce((mx, t) => Math.max(mx, t.scenes?.length ?? 0), 0);
          await saveArrangementSnapshot(arrangementSnapshotPath, {
            version: "1.0",
            pulledAt: new Date().toISOString(),
            profile: intent?.projectIntent.profile ?? "generic",
            sceneCount,
            trackCount: tracks.length,
            grid: { tracks, sceneNames: gridResp.sceneNames ?? [] },
          });
        }
      } catch (e) {
        console.error("[boot] get.launcher_clips pull failed:", (e as Error).message);
      }

      schedulePersist(lastState);
    } catch (e) {
      console.error("[boot] get.project_summary pull failed:", (e as Error).message);
    }
  };

  // --- f. Build the dispatcher + wire the reader. ----------------------
  //     The `correlator` + `summaryTracks` deps are THUNKS so the dispatcher
  //     always sees the current values (the correlator swaps on disconnect;
  //     summaryTracks is reassigned by refreshSnapshot).
  const dispatch = createDispatcher({
    watchdog,
    correlator: () => correlator,
    tcpTransport: tcp,
    getState: () => lastState,
    setState: (s) => {
      lastState = s;
    },
    stableIds,
    summaryTracks: () => summaryTracks,
    setSummaryTracks: (t) => {
      summaryTracks = t;
    },
    onSnapshot: schedulePersist,
    bootVersion: OUR_VERSION,
  });
  createReader(tcp, dispatch);

  // --- e. Wire TCP disconnect -> watchdog (Blocker 1 fix — uses the
  //     additive hasConnectedSockets accessor from step 1). Polls every
  //     STALE_THRESHOLD_MS/2 (2.5s — well under the 5s stale threshold). ----
  let prevConnected = tcp.hasConnectedSockets();
  const checkBridgeAlive = async (): Promise<void> => {
    const connected = tcp.hasConnectedSockets();
    if (connected === prevConnected) return;
    if (!connected && prevConnected) {
      // true -> false: bridge socket-loss.
      if (watchdog.tick() !== "disconnected") {
        watchdog.onBridgeDisconnect();
      }
      correlator.close();
      controllerCorrelation.onControllerDisconnect();
      correlator = new RequestCorrelator(tcp, { timeoutMs: 3_000 });
    } else if (connected && !prevConnected) {
      // false -> true: bridge (re)connect — refresh the snapshot + rebind.
      controllerCorrelation.onControllerReconnect(correlator);
      await refreshSnapshot();
    } else if (connected && lastState === null) {
      // Gap-closure (live 2026-08-23 UAT): the connect-transition snapshot
      // can fail its 3s get.project_summary (a raced/slow bridge) — and with
      // prevConnected now true it would NEVER retry: every event after was
      // dropped ("arrived before first snapshot") while pulls kept answering,
      // leaving freshness stale + folds empty forever. Retry on each poll
      // tick (2.5s) until the baseline exists.
      void refreshSnapshot().catch(() => { /* logged inside */ });
    }
    prevConnected = connected;
  };
  const bridgePoll = setInterval(() => {
    void checkBridgeAlive().catch((e) => {
      console.error("[boot] checkBridgeAlive threw:", (e as Error).message);
    });
  }, Math.floor(STALE_THRESHOLD_MS / 2));

  // If the bridge connected before the daemon was up, the first poll's
  // false->true transition triggers refreshSnapshot. As a best-effort, also
  // try once now.
  if (tcp.hasConnectedSockets()) {
    void refreshSnapshot();
  }

  // --- h. startQueryServer (Major 2 — wire the on-demand pull deps). ----
  //     The pull callbacks close over the outer `correlator` slot (the `let`
  //     from step d). When step e swaps the correlator on disconnect, these
  //     callbacks pick up the new instance lazily.
  //
  //     Phase 3 Plan 03-02: also wire the ephemeral candidate store (D-05),
  //     the durable patch-history journal (D-03), and the daemon→bridge
  //     apply.patch round-trip callback. The candidate store is in-memory only
  //     (lost on restart — a producer must re-preview after a daemon restart);
  //     the journal persists at `<socketDir>/patch-history.jsonl`.
  const candidateStore = new CandidateStore();
  const patchHistory = new PatchHistory(join(dirname(socketPath), "patch-history.jsonl"));
  // Phase 5 gap-closure (deferred-items 05-06/05-08): the AutomationScope
  // rides the wire when present (the bridge resolves automation targets from
  // payload.scope.{paramIndex, paramSource}); the clip path omits it. The
  // bridge's capturedPriorValue (the D-05-07 prior freeze) threads through —
  // dropping it made every automation apply refuse prior_unavailable.
  const applyPatchOverBridge = (undoLabel: string, operations: PrimitiveOp[], scope?: Patch["scope"]): Promise<{ applied: number; failed: number; capturedPriorValue?: number }> =>
    correlator
      .send("apply.patch", scope ? { undoLabel, operations, scope } : { undoLabel, operations })
      .then((resp) => {
        const r = resp as { applied?: number; failed?: number; failures?: unknown[]; capturedPriorValue?: number };
        if ((r.failures?.length ?? 0) > 0) {
          console.error(`[debug apply.patch] ${r.failures!.length} failure(s): ${JSON.stringify(r.failures)}`);
        }
        return { applied: r.applied ?? 0, failed: r.failed ?? 0, ...(typeof r.capturedPriorValue === "number" ? { capturedPriorValue: r.capturedPriorValue } : {}) };
      });
  const editService = new EditService({ candidateStore, patchHistory, applyPatchOverBridge, pullSelectedClip: () => correlator.send("get.selected_clip") });
  const projectRoot = join(dirname(socketPath), "projects");
  const projects = new ProjectRegistry(projectRoot);
  const focus = new FocusRegistry();
  const approvals = new ApprovalStore();
  const proposals = new ProposalStore({ invalidateProposal: (proposalId) => approvals.invalidateProposal(proposalId) });
  const reportPiDiagnostic = process.env.BW_BRAIN_PI_DIAGNOSTICS === "1"
    ? (event: object) => console.error(`[pi] ${JSON.stringify(event)}`)
    : undefined;
  const proposalDispatch = new ProposalDispatch({
    proposals,
    approvals,
    editService,
    requireConfirmedScope: async (scope) => {
      await projects.requireConfirmedScope(scope.projectId, scope.instanceId);
      return scope;
    },
    requirePublicationScope: (scope) => requireConfirmedFocusedScope(projects, focus, scope),
    connectionForScope: (scope) => {
      const lease = peers.registry.getLease(scope.instanceId);
      return lease?.projectId === scope.projectId && lease.status === "confirmed" ? lease.connectionId : undefined;
    },
    sendTo: (connectionId, message) => peers.registry.sendTo(connectionId, message),
  });
  const sessions = new ProjectSessionManager(new PiSdkAdapter(join(dirname(socketPath), "pi"), undefined, { diagnostic: reportPiDiagnostic }), () => createRestrictedPiTools({
    readConfirmedScope: async () => focus.get() ?? null,
    readContext: async () => lastState,
    preview: async (input) => editService.preview(lastState ?? BASELINE_RAW_STATE, intent, watchdog.tick(), input),
    createProposal: async (input) => proposalDispatch.publish(input as unknown as ProposalInput),
  }), undefined, reportPiDiagnostic);
  const stop = new StopCoordinator({
    stopAnalysis: (projectId) => sessions.stop(projectId),
    invalidateApprovals: (projectId) => approvals.invalidateProject(projectId, "stop"),
    clearPending: () => undefined,
    projectPeers: (projectId) => peers.registry.projectPeers(projectId),
    sendTo: (connectionId, message) => peers.registry.sendTo(connectionId, message),
    publishStopped: () => undefined,
  });
  const actions = new ActionDispatch({
    requireConfirmedScope: async (connectionId, scope) => {
      peers.registry.requireConfirmed(connectionId, scope.projectId, scope.instanceId);
      return requireConfirmedFocusedScope(projects, focus, scope);
    },
    resolveAnalysisContext: async (scope) => ({
      project: lastState?.project ?? { ...DEFAULT_PROJECT },
      ...selectedClipAnalysisContext(scope.clipSid, await correlator.send("get.selected_clip")),
      // 04.3-02 (RB-03): explicit Analyze turns gain bounded arrangement
      // evidence (pulledAt assumption when present, explicit no-snapshot
      // assumption when absent). The Pi prompt + create_proposal-per-turn
      // contract are untouched (T-04.3-09).
      ...(await loadArrangementAnalysisEvidence({ arrangementSnapshotPath, intent: () => intent })),
    }),
    analyze: async (request) => { await sessions.connect(request.projectId, request.instanceId); await sessions.analyze(request); },
    // 04.3-02 (RB-03/RB-05/UX-03): the deterministic provider-free review —
    // reuses the already-wired arrangementSnapshotPath + pullLauncherGrid deps
    // and the query-server shared evidence assembly. Validated arrangement.review
    // peer messages reach this branch through the existing routing chain
    // (sessionActions fallthrough → actions.dispatch).
    // 04.3-07: the grid pull carries the 90s per-request deadline (DEFECT A).
    reviewArrangement: createArrangementReviewDependency({
      arrangementSnapshotPath,
      rolesPath,
      intent: () => intent,
      freshness: () => watchdog.tick(),
      pullLauncherGrid: () => correlator.send("get.launcher_clips", {}, { timeoutMs: LAUNCHER_GRID_PULL_TIMEOUT_MS }),
    }),
    // 05-09 (UX-04/SC#5): the deterministic device review — same injection
    // seam as reviewArrangement. The salience refresh reuses the live
    // parameter folds; the chain reuses the existing device-chain pull; the
    // macros come from the macroSuggest single source (query-server).
    deviceReview: createDeviceReviewDependency({
      salienceSnapshotPath,
      rolesPath,
      arrangementSnapshotPath,
      intent: () => intent,
      freshness: () => watchdog.tick(),
      state: () => lastState,
      pullDeviceChain: () => correlator.send("get.selected_device_chain"),
    }),
    getProposal: (proposalId, revision) => proposals.get(proposalId, revision),
    issueApproval: (proposal) => approvals.issue(proposal),
    consumeApproval: (request) => proposalDispatch.consume(request),
    stopProject: (projectId) => stop.stopProject(projectId),
    sendTo: (connectionId, message) => peers.registry.sendTo(connectionId, message),
    reportAnalysisFailure: ({ requestId, code }) => console.error(`[analysis] requestId=${requestId} code=${code}`),
  });
  const sessionActions = new SessionActions({
    projects,
    focus,
    correlation: controllerCorrelation,
    resolveLinkScope: async (connectionId) => {
      const lease = peers.registry.getConnectionLease(connectionId);
      if (!lease) throw new Error("link_scope_unavailable");
      const controllerEvidence = (await correlator.send("get.clap_correlation")) as {
        available?: boolean;
        trackSlot?: number;
        trackSidHint?: string | null;
        deviceHint?: string | null;
      };
      const trackSlot = controllerEvidence.trackSlot;
      if (controllerEvidence.available !== true || !Number.isInteger(trackSlot) || trackSlot! < 0) throw new Error("link_scope_unavailable");

      const summaryResp = (await correlator.send("get.project_summary")) as { tracks?: { slot: number; name: string }[] };
      const freshSummaryTracks = includeCursorSelectedTrack(
        summaryResp.tracks ?? [],
        trackSlot!,
        controllerEvidence.trackSidHint,
      );
      const observed = normalize({
        ...BASELINE_RAW_STATE,
        tracks: enrichSummaryTracks(freshSummaryTracks),
        project: lastState?.project ?? { ...DEFAULT_PROJECT },
      });
      if (!observed) throw new Error("link_scope_unavailable");
      summaryTracks = freshSummaryTracks;
      reconcile(observed, stableIds, Date.now());
      const selectedTrack = freshSummaryTracks.find((track) => track.slot === trackSlot);
      const trackHint = selectedTrack?.name ?? "";
      if (!trackHint) throw new Error("link_scope_unavailable");
      const trackSid = stableIds.byNameAndType.get(`track:${trackHint}`);
      if (!trackSid) throw new Error("link_scope_unavailable");
      const clipResp = (await correlator.send("get.selected_clip")) as { clipSid?: string };
      const clipSid = typeof clipResp.clipSid === "string" && clipResp.clipSid ? clipResp.clipSid : undefined;
      lastState = {
        ...observed,
        selection: { ...(lastState?.selection ?? {}), trackSid, ...(clipSid ? { clipSid } : {}) },
      };
      schedulePersist(lastState);
      const projectId = await projects.findConfirmedProjectId(lease.instanceId) ?? await projects.getOrCreateActiveProjectId();
      return {
        projectId,
        instanceId: lease.instanceId,
        trackSid,
        trackSlot: trackSlot!,
        ...(clipSid ? { clipSid } : {}),
        trackHint: trackHint.slice(0, 256),
        deviceHint: typeof controllerEvidence.deviceHint === "string" ? controllerEvidence.deviceHint.slice(0, 256) : null,
      };
    },
    markLinkPending: (scope) => peers.registry.setLeaseScope(scope.instanceId, scope.projectId, "pending"),
    markLinkConfirmed: (scope) => peers.registry.setLeaseScope(scope.instanceId, scope.projectId, "confirmed"),
    sendTo: (connectionId, message) => peers.registry.sendTo(connectionId, message),
    emit: (event) => sessions.onProjectForkCommitted(event),
    planForkInstances: (connectionId, sourceProjectId, instanceIds) => peers.registry.planProjectFork(connectionId, sourceProjectId, instanceIds),
    commitForkInstances: (newProjectId, rekeys, event) => peers.registry.commitProjectFork(newProjectId, rekeys, event),
  });
  routePeerAction = (connectionId, message) => {
    void (async () => {
      if (await sessionActions.dispatch(connectionId, message)) return;
      await actions.dispatch(connectionId, message);
    })().catch((error) => console.error("[boot] peer action failed:", (error as Error).message));
  };
  startQueryServer({
    transport: uds,
    watchdog,
    getState: () => lastState,
    getIntent: () => intent,
    pullDeviceChain: () => correlator.send("get.selected_device_chain"),
    pullSelectedClip: () => correlator.send("get.selected_clip"),
    candidateStore,
    patchHistory,
    applyPatchOverBridge,
    editService,
    // Phase 4 Plan 04-05 — arrangement intelligence deps.
    // 04.3-07: the grid pull carries the 90s per-request deadline (DEFECT A).
    pullLauncherGrid: () => correlator.send("get.launcher_clips", {}, { timeoutMs: LAUNCHER_GRID_PULL_TIMEOUT_MS }),
    arrangementSnapshotPath,
    rolesPath,
    // Phase 5 (05-04 — AUTO-01): the durable salience snapshot path. Wired
    // here so automation.inspect serves live in production; 05-09's peer
    // device-review path consumes the same store.
    salienceSnapshotPath,
  });

  // --- j. Signal handlers + shutdown. ----------------------------------
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error("[boot] shutting down...");
    clearInterval(bridgePoll);
    watchdog.onBridgeDisconnect();
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    correlator.close();
    for (const projectId of peers.registry.projectIds()) await stop.stopProject(projectId);
    sessions.dispose();
    try {
      await save(stateCachePath, {
        version: "1.0",
        stableIds: stableIdsToPayload(stableIds),
        lastRawState: lastState,
      });
    } catch (e) {
      console.error("[boot] final state-cache save failed:", (e as Error).message);
    }
    try {
      // Reject/close CLAP peers before the established controller/UDS close
      // sequence. No peer command can race the existing mutation authority.
      await peers.close();
    } catch (e) {
      console.error("[boot] peers.close failed:", (e as Error).message);
    }
    try {
      tcp.close();
    } catch (e) {
      console.error("[boot] tcp.close failed:", (e as Error).message);
    }
    try {
      await uds.close();
    } catch (e) {
      console.error("[boot] uds.close failed:", (e as Error).message);
    }
  };

  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });

  console.error(`[boot] bw-brain daemon up: pid=${process.pid} entry=${fileURLToPath(import.meta.url)} cwd=${process.cwd()} uds=${socketPath} tcp=127.0.0.1:${tcpPort} peers=127.0.0.1:${peers.port}`);

  return { shutdown, peerPort: peers.port };
}

/**
 * Probe the socket path: if a `net.createConnection` SUCCEEDS, another
 * daemon is live — throw + exit. If it errors ECONNREFUSED, the socket is
 * stale (left by a crashed daemon) — unlink it. Standard Unix daemon
 * pattern (dbus/ssh-agent) + RESEARCH.md Pattern 3 "cleaned on daemon exit".
 *
 * Justification for probe-and-unlink over refuse-and-exit: a crashed
 * daemon's stale socket is the COMMON case; refusing to start would require
 * the user to manually rm the socket after every crash — hostile.
 */
async function probeStaleSocket(socketPath: string): Promise<void> {
  if (!fs.existsSync(socketPath)) return;
  await new Promise<void>((resolve) => {
    const probe = net.createConnection({ path: socketPath });
    const t = setTimeout(() => {
      // 300ms timeout — bounded worst-case probe latency. If neither connect
      // nor error fires, treat as stale (a half-broken socket) + unlink.
      probe.destroy();
      resolve();
    }, 300);
    probe.on("connect", () => {
      // A live daemon answered — refuse to start a second instance.
      clearTimeout(t);
      probe.destroy();
      console.error(`[boot] daemon already running at ${socketPath} (refusing to start a second instance)`);
      process.exit(1);
    });
    probe.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(t);
      if (err.code === "ECONNREFUSED") {
        // Stale socket file (the prior daemon crashed without unlinking).
        // Best-effort unlink; ignore errors (the upcoming listen will surface
        // a real failure).
        void unlink(socketPath)
          .catch(() => undefined)
          .then(() => resolve());
      } else {
        // Unexpected error — log + proceed (the listen will fail loudly if
        // the socket is unusable).
        console.error(`[boot] stale-socket probe unexpected error (${err.code}); proceeding`);
        resolve();
      }
    });
  });
}

// --- StableIdMap <-> StateCachePayload helpers ---------------------------
//
// state-cache.ts stores the StableIdMap's Maps FLATTENED to tuple arrays
// (JSON has no Map literal — line 27-32). These two helpers are the bridge
// between state-cache's JSON shape + reconcile's Map shape. Both pure +
// exercised indirectly by the smoke test's round-trip.

/**
 * Rule 2 fix: enrich the bridge's `{slot, name}` summary tracks into the
 * full ObservedObject shape reconcile() needs (`{name, type, neighbors,
 * contentHash}`). The bridge's get.project_summary returns ONLY {slot, name}
 * (PullHandlers.java:91-100); without enrichment, reconcile's byNameAndType
 * keys become `"undefined:Kick"` instead of `"track:Kick"`, so the fold's
 * slot -> name -> sid resolution fails.
 *
 *  - type = "track" (always — summaryTracks are tracks).
 *  - neighbors = sorted [prev name, next name] (matches reconcile.test.ts
 *    buildTrackState's neighbors computation; survives reorders).
 *  - contentHash = stable M1 placeholder `track-m1-${name}` (Phase 3+ will
 *    populate clip-derived content; for M1 this is identity-stable per name).
 */
function enrichSummaryTracks(
  tracks: { slot: number; name: string }[],
): { name: string; type: "track"; neighbors: string[]; contentHash: string; slot?: number }[] {
  // Sort by slot so neighbors are positional (matches the windowed-bank order
  // the bridge emits).
  const sorted = [...tracks].sort((a, b) => a.slot - b.slot);
  return sorted.map((t, i) => {
    const prev = i > 0 ? sorted[i - 1].name : "";
    const next = i < sorted.length - 1 ? sorted[i + 1].name : "";
    const neighbors = [prev, next].filter((n) => n.length > 0).sort();
    return {
      name: t.name,
      type: "track" as const,
      neighbors,
      contentHash: `track-m1-${t.name}`,
      slot: t.slot,
    };
  });
}

/**
 * Ensure the controller-selected track participates in reconciliation even
 * when it lies outside the fixed TrackBank summary window. The correlation
 * response is cursor-derived and therefore authoritative for the selected
 * slot; the summary name remains preferred whenever that slot is in-window.
 */
export function includeCursorSelectedTrack(
  tracks: { slot: number; name: string }[],
  selectedSlot: number,
  cursorTrackHint?: string | null,
): { slot: number; name: string }[] {
  if (tracks.some((track) => track.slot === selectedSlot)) return tracks;
  const name = typeof cursorTrackHint === "string" ? cursorTrackHint.trim() : "";
  return name ? [...tracks, { slot: selectedSlot, name }] : tracks;
}

/** Convert an in-memory StableIdMap to the JSON-serializable payload shape. */
function stableIdsToPayload(m: StableIdMap): StateCachePayload["stableIds"] {
  return {
    byFingerprint: [...m.byFingerprint.entries()],
    byNameAndType: [...m.byNameAndType.entries()],
    byContentHash: [...m.byContentHash.entries()].map(([k, v]) => [k, [...v]]),
    lastSeen: [...m.lastSeen.entries()],
  };
}

/** Rebuild an in-memory StableIdMap from the JSON-serialized payload shape. */
function stableIdsFromPayload(s: StateCachePayload["stableIds"]): StableIdMap {
  const m: StableIdMap = emptyStableIdMap();
  for (const [k, v] of s.byFingerprint) m.byFingerprint.set(k, v);
  for (const [k, v] of s.byNameAndType) m.byNameAndType.set(k, v);
  for (const [k, arr] of s.byContentHash) m.byContentHash.set(k, new Set(arr));
  for (const [k, t] of s.lastSeen) m.lastSeen.set(k, t);
  return m;
}

// --- Main-entry guard -------------------------------------------------
//
// Mirrors the boundary.ts main-guard pattern (import.meta.url ===
// pathToFileURL(process.argv[1]).href). boot.ts is BOTH importable by the
// smoke test AND runnable as `tsx src/runtime/boot.ts`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void boot();
}
