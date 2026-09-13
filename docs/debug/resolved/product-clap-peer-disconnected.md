---
status: resolved
trigger: "Product CLAP loads in Bitwig but remains disconnected after daemon restart even though the daemon listens on the dedicated peer port."
created: 2026-08-11
updated: 2026-08-12
---

# Debug Session: Product CLAP peer disconnected

## Symptoms

- **Expected:** A loaded product instance connects to the daemon's dedicated loopback peer endpoint, completes `clap.hello`/`clap.accept`, and updates the hosted UI from disconnected to connected/unlinked.
- **Actual:** The product loads and renders, but remains `disconnected | closed | idle` with empty project/track/instance fields.
- **Errors:** No Bitwig error dialog. Daemon listens on both controller `7878` and peer `7879`.
- **Timeline:** First live product UAT on 2026-08-11.
- **Reproduction:** Start current daemon, load product bundle in Bitwig 6.0.11, open editor, observe disconnected state.

## Current Focus

- **hypothesis:** Native `PeerClient` is implemented only around an injected send callback and is never constructed by `PluginProcessor`; therefore the product cannot open the daemon socket or receive `clap.accept`, so its UI necessarily stays disconnected.
- **test:** Add one production loopback transport, construct it from `PluginProcessor`, and exercise the exact daemon handshake plus reconnect behavior in a native integration test.
- **expecting:** The test server receives a bounded schema-valid `clap.hello`, the product observes `clap.accept`, publishes `connected`, then observes disconnect and reconnects without touching the audio thread.
- **next_action:** Complete. Live Bitwig verification confirmed initial connection, disconnect on daemon stop, and automatic reconnection after daemon restart.

reasoning_checkpoint:
  hypothesis: "The product stays disconnected because PluginProcessor constructs no peer client and the compiled PeerClient has no socket connect/read implementation."
  confirming_evidence:
    - "Repository-wide construction search found no production PeerClient instance under clap/src."
    - "PluginProcessor owns telemetry and UI state but no peer transport, while the daemon is directly observed listening on 127.0.0.1:7879."
    - "PeerClient.cpp only invokes an injected send callback; it contains no socket/connect/hello/accept path."
  falsification_test: "A production PluginProcessor path that opens 127.0.0.1:7879 and processes clap.accept, or a native test showing the current product sends clap.hello, would disprove the hypothesis; neither exists."
  fix_rationale: "Constructing a bounded worker-thread loopback transport in PluginProcessor supplies the missing causal path from product load to daemon handshake and UI connection state, while keeping all networking off the audio thread."
  blind_spots: "Live Bitwig bundle replacement and host lifecycle can only be confirmed after automated native tests and a rebuilt bundle are exercised in the real host."

## Evidence

- timestamp: 2026-08-11
  observation: `lsof` shows the restarted daemon listening on `127.0.0.1:7878` and `127.0.0.1:7879`.
- timestamp: 2026-08-11
  observation: Screenshot shows product editor rendered but state `disconnected | closed | idle` and empty identity context.
- timestamp: 2026-08-11
  observation: Repository search finds no production construction of `PeerClient` and no socket/connect call under `clap/src`.
- timestamp: 2026-08-11
  observation: Product CMake includes PeerClient.cpp, but PluginProcessor has no PeerClient member or constructor call; PeerClient only wraps an injected send callback and never performs a network handshake.
- timestamp: 2026-08-11
  observation: New native loopback integration test observed two complete hello/accept lifecycles with an intervening disconnect and passed consistently.
- timestamp: 2026-08-11
  observation: All 9 native CTest targets passed, the rebuilt CLAP passed clap-validator with 34 passed, 0 failed, 1 pre-existing warning, and 9 skipped.
- timestamp: 2026-08-11
  observation: Daemon suite completed 64/65 files and 738/745 tests; all peer-server tests passed. The only failures were runtime smoke tests colliding with the already-running live daemon on ports 7879/17878.
- timestamp: 2026-08-12
  observation: Live Bitwig verification worked as expected: the product showed connected, stopping the daemon changed it to disconnected, and restarting the daemon automatically returned it to connected.

## Eliminated

- hypothesis: The restarted daemon lacks the dedicated endpoint.
  reason: Port 7879 is actively listening in the current daemon process.
- hypothesis: The plug-in failed to load or render.
  reason: Bitwig scan/load and hosted editor rendering pass.

## Resolution

- **root_cause:** The production CLAP processor never constructs a peer transport, and the existing PeerClient has no socket/connect/read implementation, so no clap.hello can reach port 7879 and no clap.accept can update UI state.
- **fix:** Added a bounded loopback worker transport that sends schema-valid clap.hello, handles clap.accept and instance.rekey, publishes connection UI state, and reconnects after socket loss; wired it into PluginProcessor and all processor-bearing native targets.
- **verification:** Native reconnect integration test passed; all 9 CTest targets passed; rebuilt product bundle passed clap-validator with zero failures; daemon peer tests passed; live Bitwig verification confirmed connected, disconnected on daemon stop, and automatic reconnection after daemon restart.
- **files_changed:** clap/src/peer/LoopbackTransport.h, clap/src/peer/LoopbackTransport.cpp, clap/src/PluginProcessor.h, clap/src/PluginProcessor.cpp, clap/tests/loopback_transport_test.cpp, clap/cmake/ProductTelemetryTests.cmake, clap/cmake/ProductUiTests.cmake
