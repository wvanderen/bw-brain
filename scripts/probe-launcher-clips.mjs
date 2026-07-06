// scripts/probe-launcher-clips.mjs
//
// Standalone probe daemon for Plan 04-01 Task 2 (BLOCKING human-verify gate).
// Binds 127.0.0.1:7878, accepts the Bitwig bridge's reconnect, sends
// `get.launcher_clips` requests, and reports per-request wall-clock latency +
// payload shape so we can validate D-22 (500ms per-cell budget) and the
// cursor-walk behavioral characteristics on live Bitwig.
//
// USAGE:
//   1. Stop the real daemon:  pkill -f "tsx.*boot"  (or Ctrl-C the npm start)
//   2. Run this probe:        node scripts/probe-launcher-clips.mjs
//   3. Wait for "[probe] bridge connected" — the bridge auto-reconnects
//   4. The probe fires N requests sequentially and prints stats
//   5. WATCH BITWIG during the walk for GUI focus jumps / clip editor changes
//   6. Ctrl-C when done; restart the real daemon (`npm start` in daemon/)
//
// SECURITY: binds 127.0.0.1 only (loopback — matches the daemon's invariant).
// Sends ONE request type: get.launcher_clips (Plan 04-01's new pull handler).
//
// NOTE: the bridge sends NO hello envelope on connect (verified by reading
// bridge/src/main/java/.../BridgeExtension.java runConnectorCycle + boot.ts
// line 14 comment). The daemon initiates by sending get.project_summary. We
// initiate by sending get.launcher_clips — same pattern.

import * as net from "node:net";

const PORT = 7878;
const HOST = "127.0.0.1";
const REQUEST_COUNT = 5;          // number of get.launcher_clips requests to fire
const CONNECT_SETTLE_MS = 800;    // pause after connect so the pull thread arms
const REQUEST_GAP_MS = 2000;      // pause between requests (let GUI settle)
const RESPONSE_TIMEOUT_MS = 90000; // 128 cells × 500ms worst-case = 64s + slack

const bootMs = Date.now();

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil(p * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)];
}

function summarize(nums) {
  if (nums.length === 0) return "(no samples)";
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return `n=${sorted.length} min=${sorted[0]}ms max=${sorted[sorted.length-1]}ms mean=${(sum/sorted.length).toFixed(1)}ms p50=${percentile(sorted,0.5)}ms p95=${percentile(sorted,0.95)}ms`;
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") return `(non-object: ${typeof payload})`;
  const parts = [];
  if (Array.isArray(payload.tracks)) {
    parts.push(`tracks=${payload.tracks.length}`);
    const sample = payload.tracks[0];
    if (sample && Array.isArray(sample.scenes)) {
      parts.push(`scenesPerTrack=${sample.scenes.length}`);
      const totalCells = payload.tracks.length * sample.scenes.length;
      const hasContent = payload.tracks.reduce((acc, t) => acc + ((t.scenes || []).filter(s => s.hasContent).length), 0);
      parts.push(`hasContentCells=${hasContent}/${totalCells}`);
    }
  }
  if (payload.snapshotTruncated !== undefined) parts.push(`snapshotTruncated=${payload.snapshotTruncated}`);
  // List any other top-level keys for shape awareness.
  const known = new Set(["tracks", "snapshotTruncated"]);
  const extra = Object.keys(payload).filter(k => !known.has(k));
  if (extra.length) parts.push(`extra=[${extra.join(",")}]`);
  return parts.join(" ");
}

const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[probe] bridge connected from ${remote} (+${Date.now()-bootMs}ms)`);
  socket.setEncoding("utf8");
  socket.setNoDelay(true);

  const pending = new Map(); // id -> { timeout, t0 }
  let buf = "";
  let requestIdx = 0;
  const samples = [];
  const eventCounts = {};
  let lastPayloadShape = null;

  socket.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) {
        console.log(`[probe] non-JSON line from bridge (ignored): ${(e.message||"").slice(0,80)}`);
        continue;
      }
      if (msg.type === "response" && msg.id && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(entry.timeout);
        const elapsed = Date.now() - entry.t0;
        samples.push(elapsed);
        console.log(`[probe] response ${msg.id} ok=${msg.ok} elapsed=${elapsed}ms bytes=${line.length}`);
        if (msg.payload) {
          lastPayloadShape = summarizePayload(msg.payload);
          console.log(`[probe]   payload: ${lastPayloadShape}`);
          // Dump the first track's first 3 scenes for a quick visual check.
          try {
            const t0 = msg.payload.tracks?.[0];
            if (t0) {
              console.log(`[probe]   track[0] name=${JSON.stringify(t0.name)} scenes[0..2]=${JSON.stringify((t0.scenes||[]).slice(0,3))}`);
            }
          } catch {}
        }
        return;
      }
      if (msg.type && msg.type.endsWith(".changed")) {
        eventCounts[msg.type] = (eventCounts[msg.type] || 0) + 1;
        return;
      }
      if (msg.type === "hello") {
        console.log(`[probe] (unexpected) hello from bridge — version=${msg.payload?.version}`);
        return;
      }
      console.log(`[probe] other msg type=${msg.type} id=${msg.id ?? "-"} (first 200b: ${line.slice(0,200)})`);
    }
  });

  socket.on("error", (e) => console.log(`[probe] socket error: ${e.message}`));
  socket.on("close", () => {
    console.log(`[probe] bridge disconnected — eventCounts during session: ${JSON.stringify(eventCounts)}`);
  });

  function sendRequest() {
    if (requestIdx >= REQUEST_COUNT) {
      console.log("\n=== PROBE COMPLETE ===");
      console.log(`Wall-clock per request: ${summarize(samples)}`);
      console.log(`Payload shape (last): ${lastPayloadShape ?? "(no response)"}`);
      console.log(`Events observed during session: ${JSON.stringify(eventCounts)}`);
      console.log("\n>> REPORT: Did the Bitwig clip editor show focus jumps during the walks?");
      console.log(">>        Did the launchers visually highlight as the cursor walked them?");
      console.log(">>        (Ctrl-C to exit; restart the real daemon with `npm start` in daemon/)");
      return;
    }
    requestIdx++;
    const id = `probe-${requestIdx}`;
    const req = { version: "1.0", type: "get.launcher_clips", id, payload: {} };
    const t0 = Date.now();
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        console.log(`[probe] !! TIMEOUT after ${RESPONSE_TIMEOUT_MS}ms waiting for ${id} — walker likely stalled`);
        pending.delete(id);
        // Still try the next request after a gap.
        setTimeout(sendRequest, REQUEST_GAP_MS);
      }
    }, RESPONSE_TIMEOUT_MS);
    pending.set(id, { t0, timeout });
    console.log(`\n[probe] >>> request ${id} sent at +${Date.now()-bootMs}ms (${requestIdx}/${REQUEST_COUNT}) — WATCH BITWIG NOW`);
    try {
      socket.write(JSON.stringify(req) + "\n");
    } catch (e) {
      console.log(`[probe] write failed: ${e.message}`);
      clearTimeout(timeout);
      pending.delete(id);
    }
    setTimeout(sendRequest, REQUEST_GAP_MS);
  }

  // Give the bridge's pull thread a moment to arm after socket accept.
  setTimeout(sendRequest, CONNECT_SETTLE_MS);
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`[probe] FATAL: port ${PORT} already in use — stop the real daemon first:`);
    console.error(`         pkill -f "tsx.*boot"   (or Ctrl-C the daemon's npm start)`);
    process.exit(2);
  }
  console.error(`[probe] server error:`, e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[probe] listening on ${HOST}:${PORT} — waiting for Bitwig bridge to reconnect...`);
  console.log(`[probe] plan: fire ${REQUEST_COUNT} get.launcher_clips requests with ${REQUEST_GAP_MS}ms gaps`);
  console.log(`[probe] (if the bridge doesn't reconnect within ~10s, toggle the Bitwig controller or restart Bitwig)`);
  console.log(`[probe] (stop real daemon first — port ${PORT} must be free)`);
});

process.on("SIGINT", () => {
  console.log("\n[probe] SIGINT — exiting.");
  try { server.close(); } catch {}
  process.exit(0);
});
