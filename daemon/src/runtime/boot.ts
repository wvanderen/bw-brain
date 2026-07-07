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
// M1 LIMITATION (DEFAULT_PROJECT — Minor 3 fix): the bridge's
// get.project_summary response (PullHandlers.java:91-100, 193-200) returns
// ONLY `{ tracks: [{slot,name}, ...] }` — it does NOT carry `version`,
// `project`, or `selection`. Since normalize() requires a schema-valid
// RawState, the daemon supplies defaults: name="", tempo=120,
// timeSignature="4/4". Pulling project metadata is a Phase-3+ concern
// (PullHandlers.java:146-150 dispatches ONLY get.selected_clip /
// get.selected_device_chain / get.project_summary — no get.project_meta
// handler exists today). Documented in 02-07-SUMMARY.md.

import * as net from "node:net";
import * as fs from "node:fs";
import { unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

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
import type { PrimitiveOp } from "../patch/inverse-ops.js";
import type { ProjectIntent } from "../gen/intent.js";
// Phase 4 Plan 04-05 — arrangement snapshot + roles stores (D-03 / ARRANGE-05).
import { saveArrangementSnapshot } from "../state/arrangement-snapshot.js";

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

/** M1 LIMITATION (Minor 3 fix): the bridge does not pull project metadata. */
const DEFAULT_PROJECT = { name: "", tempo: 120, timeSignature: "4/4" } as const;

/** The baseline RawState the daemon seeds from a get.project_summary response. */
const BASELINE_RAW_STATE: RawState = {
  version: "1.0",
  project: { ...DEFAULT_PROJECT },
  selection: {},
  tracks: [],
  clips: [],
  devices: [],
};

/** Options for {@link boot}. */
export interface BootOptions {
  /** UDS socket path (default {@link DEFAULT_SOCKET}). */
  socketPath?: string;
  /** TCP port for the bridge listener (default {@link DEFAULT_TCP_PORT}). */
  tcpPort?: number;
  /** State-cache path (default {@link DEFAULT_STATE_CACHE_PATH}). */
  stateCachePath?: string;
  /** Intent path (default {@link DEFAULT_INTENT_PATH}). */
  intentPath?: string;
  /** Phase 4: arrangement-snapshot path (default {@link DEFAULT_ARRANGEMENT_SNAPSHOT_PATH}). */
  arrangementSnapshotPath?: string;
  /** Phase 4: roles.json path (default {@link DEFAULT_ROLES_PATH}). */
  rolesPath?: string;
}

/** Handle returned by boot() so callers (smoke test, harness) can shut down. */
export interface BootHandle {
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
  const stateCachePath = opts.stateCachePath ?? DEFAULT_STATE_CACHE_PATH;
  const intentPath = opts.intentPath ?? DEFAULT_INTENT_PATH;
  const arrangementSnapshotPath = opts.arrangementSnapshotPath ?? DEFAULT_ARRANGEMENT_SNAPSHOT_PATH;
  const rolesPath = opts.rolesPath ?? DEFAULT_ROLES_PATH;

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

  // `let` because step e swaps the correlator on bridge disconnect. The
  // query-server's pull callbacks + the dispatcher read this slot lazily so
  // the swap is transparent to both.
  let correlator: RequestCorrelator = new RequestCorrelator(tcp, { timeoutMs: 3_000 });

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
      try {
        const gridResp = (await correlator.send("get.launcher_clips")) as {
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
      correlator = new RequestCorrelator(tcp, { timeoutMs: 3_000 });
    } else if (connected && !prevConnected) {
      // false -> true: bridge (re)connect — refresh the snapshot + rebind.
      await refreshSnapshot();
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
  const applyPatchOverBridge = (undoLabel: string, operations: PrimitiveOp[]): Promise<{ applied: number; failed: number }> =>
    correlator
      .send("apply.patch", { undoLabel, operations })
      .then((resp) => {
        const r = resp as { applied?: number; failed?: number; failures?: unknown[] };
        if ((r.failures?.length ?? 0) > 0) {
          console.error(`[debug apply.patch] ${r.failures!.length} failure(s): ${JSON.stringify(r.failures)}`);
        }
        return { applied: r.applied ?? 0, failed: r.failed ?? 0 };
      });
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
    // Phase 4 Plan 04-05 — arrangement intelligence deps.
    pullLauncherGrid: () => correlator.send("get.launcher_clips"),
    arrangementSnapshotPath,
    rolesPath,
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

  console.error(`[boot] bw-brain daemon up: uds=${socketPath} tcp=127.0.0.1:${tcpPort}`);

  return { shutdown };
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
