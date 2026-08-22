// bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java
//
// Production Bitwig Controller Extension. Replaces the Phase-1 throwaway
// SpikeExtension. init() opens the loopback socket to the daemon, wires the full
// Phase-2 observer set (Observers) + the get.* pull-handler dispatch
// (PullHandlers), and starts the Outbox writer thread. The extension is dumb by
// design (observers enqueue, writer drains, pull handlers answer requests) — all
// intelligence lives in the daemon.
//
// INVARIANTS (honored throughout):
//   - LOOPBACK = "127.0.0.1" ONLY (Pitfall 5 — the socket never binds the
//     wildcard; T-2-02-T mitigation).
//   - Observers enqueue to Outbox.offer(); the Outbox writer thread does ALL
//     socket writes (Pitfall 3 — never block the controller thread; T-2-02-D).
//   - Connector thread retries until the daemon is up (spike pattern).
package com.bwbrain.bridge;

import com.bitwig.extension.controller.ControllerExtension;
import com.bitwig.extension.controller.ControllerExtensionDefinition;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorDevice;
import com.bitwig.extension.controller.api.CursorTrack;
import com.bitwig.extension.controller.api.PinnableCursorClip;
import com.bitwig.extension.controller.api.SceneBank;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extension.controller.api.Transport;

import java.net.Socket;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

public final class BridgeExtension extends ControllerExtension {

    // Pitfall 5 — loopback ONLY (replicated from the spike lines 43-44).
    static final String LOOPBACK = "127.0.0.1";
    static final int PORT = 7878;
    // 16 keeps ordinary projects (including the live-UAT ninth-track Lead)
    // inside the launcher walk. LauncherGridWalker trims the unnamed phantom
    // tail, so the wider bank does not persist empty synthetic tracks.
    static final int BANK_SIZE = 16; // D-01 windowed TrackBank page size
    // Phase 4 Plan 04-01 (D-01) — SceneBank page size. 16 covers common producer
    // projects (RESEARCH §Bitwig Probe acceptance: "8×16=128 cells" worst case).
    // The live probe (Task 2 capabilities doc §7) confirms the actual project's
    // scene count; if producers need more, bump here + re-package.
    static final int SCENE_COUNT = 16;

    // Stored from the ctor: the inherited getHost() returns the base Host which
    // lacks println/createCursorTrack (same reason the spike stored host).
    private final ControllerHost host;

    private volatile boolean running = true;
    private Outbox outbox;
    private Observers observers;
    private LauncherGridWalker walker;
    private Thread connectorThread;
    private Socket socket;

    BridgeExtension(final ControllerExtensionDefinition definition, final ControllerHost host) {
        super(definition, host);
        this.host = host;
    }

    @Override
    public void init() {
        host.println("[bw-brain] init — cursor triple + windowed TrackBank[N=" + BANK_SIZE
                + "] + SceneBank[N=" + SCENE_COUNT + "] + transport -> " + LOOPBACK + ":" + PORT);

        // === Cursor triple + transport + windowed TrackBank (D-01) ===
        // CursorTrack (2-arg, non-deprecated — proven in spike). The cursor clip is
        // created FROM the cursor track (createLauncherCursorClip -> PinnableCursorClip;
        // host.createCursorClip returns a plain Clip without the pin surface). The
        // cursor device is created from the cursor track (-> PinnableCursorDevice,
        // which IS-A CursorDevice).
        // Phase 4 Plan 04-01 Task 2 fix — the third arg to createTrackBank is
        // numScenes (the per-track ClipLauncherSlotBank size). With numScenes=0,
        // Track.clipLauncherSlotBank() returned null for every track (live-
        // observed: 0/128 hasContent cells, all slotBank null). Passing
        // SCENE_COUNT gives every track a SCENE_COUNT-sized slotBank tied to
        // the same SceneBank the scene-name observers watch.
        final CursorTrack cursorTrack = host.createCursorTrack(0, 0);
        // gridWidth=64 covers a 4-bar clip at 16th-note resolution; must match
        // PullHandlers.GRID_W. See capabilities doc §2 (M4 live finding).
        final PinnableCursorClip cursorClip = cursorTrack.createLauncherCursorClip(64, 128);
        final CursorDevice cursorDevice = cursorTrack.createCursorDevice(); // deprecated-allow: 0-arg overload (non-deprecated); javadoc deprecates only the 4-arg (String,String,int,CursorDeviceFollowMode) form
        final Transport transport = host.createTransport();
        final TrackBank trackBank = host.createTrackBank(BANK_SIZE, 0, SCENE_COUNT);
        // Phase 4 Plan 04-01 (D-01) — SceneBank for the launcher-grid cursor-walk.
        // VERIFIED non-deprecated per RESEARCH §Bitwig Probe Javadoc scan
        // (ControllerHost.createSceneBank(int) → SceneBank; the deprecated
        // alternates are SceneBank.addSceneCountObserver / scrollTo /
        // scrollUp / scrollDown / scrollPageUp / scrollPageDown / setIndication).
        final SceneBank sceneBank = host.createSceneBank(SCENE_COUNT);

        // === Outbox + observers ===
        outbox = new Outbox(host::println);
        observers = new Observers(outbox, BANK_SIZE);
        // Phase 4 Plan 04-01 — wire the SceneBank name observers (PULL-ONLY;
        // Pitfall 6 — no new event type, just the sceneNames cache enrichment
        // for the D-12 grid response).
        observers.register(host, cursorTrack, cursorClip, cursorDevice, transport, trackBank,
                sceneBank, SCENE_COUNT);

        // === Phase 4 Plan 04-01 (D-01) — LauncherGridWalker construction.
        // The walker holds the grid dimensions (trackCount × sceneCount) and the
        // D-22 per-cell timeout budget (500ms default). The Bitwig binding
        // (SlotSelector / HasContentReader / NotesReader / ReadySignal) is
        // constructed per-request in PullHandlers.handleLauncherGrid so the
        // walker stays a pure state machine (testable without Bitwig).
        walker = new LauncherGridWalker(BANK_SIZE, SCENE_COUNT);

        // === Connector thread: retry-connect to the daemon, then start the
        // writer thread (Outbox) + pull-handler thread (PullHandlers) on the same
        // socket. Matches the spike's retry-until-connected pattern.
        // Phase 5 Plan 05-03 (Pitfall 3): cursorDevice threads through to
        // PullHandlers.start so the 05-06 write wave can reach parameters.
        startConnector(cursorClip, cursorDevice);
    }

    private void startConnector(final PinnableCursorClip cursorClip, final CursorDevice cursorDevice) {
        connectorThread = new Thread(() -> {
            // D-08 lifecycle loop (replaces the old connect-once-then-exit shape):
            // each iteration is one connect → run → socket-loss cycle. The cycle
            // returns false only when running goes false during connect/join (a
            // clean exit() shutdown); a socket loss returns true so the loop
            // re-enters CONNECT and self-heals without a controller toggle.
            while (running) {
                if (!runConnectorCycle(LOOPBACK, PORT, outbox, cursorClip, cursorDevice, observers, walker,
                        () -> running, s -> socket = s, host::println)) {
                    return;
                }
            }
        }, "bw-brain-connector");
        connectorThread.setDaemon(true);
        connectorThread.start();
    }

    /**
     * One D-08 lifecycle cycle: CONNECT → RUN → detect socket loss → NULL+RESET.
     * Returns {@code true} when the cycle completed because of a socket loss
     * (the caller should loop back and retry); returns {@code false} when
     * {@code isRunning} went false during the connect retry or the pull join
     * (clean shutdown — the caller exits).
     *
     * <p>Package-private so {@code BridgeExtensionReconnectTest} can exercise
     * the reconnect mechanic without a live Bitwig host ({@link BridgeExtension}
     * extends {@code ControllerExtension}, whose ctor requires a live
     * {@code ControllerHost}). The test passes a test port (ephemeral
     * ServerSocket) and {@code null} cursorClip/observers — when no inbound
     * request lines arrive, {@code PullHandlers.runLoop} just blocks on
     * {@code readLine} and exits on socket close, so the nulls are safe.</p>
     *
     * <p>Critical details (RESEARCH §D-08):</p>
     * <ol>
     *   <li><b>CONNECT</b> — inner retry loop opening {@code new Socket(loopback, port)}
     *       with the existing 1s sleep on failure. {@code loopback} is the
     *       {@code "127.0.0.1"} constant — Pitfall 5 preserved on every reconnect.</li>
     *   <li><b>RUN</b> — publish the socket via {@code setSocket} (so {@link #exit}
     *       can defensively close it), re-arm the Outbox writer CAS via
     *       {@code outbox.reset()} (Pitfall 2), start the writer + pull threads,
     *       then {@code pull.join()}. The pull thread's {@code readLine}
     *       IOException on socket close is the reliable loss signal (the writer
     *       may be parked on {@code queue.take()} and won't notice a quiet loss).</li>
     *   <li><b>NULL + RETRY</b> — null the published socket (so {@code exit} does
     *       not double-close), {@code outbox.stop()} (idempotent interrupt of the
     *       writer), {@code outbox.clear()} (D-07 — drop queued events; the
     *       daemon's {@code refreshSnapshot} is source of truth after reconnect).</li>
     * </ol>
     *
     * @param loopback      the bind host (always {@link #LOOPBACK} in production).
     * @param port          the daemon port (always {@link #PORT} in production).
     * @param outbox        the shared Outbox (writer re-arms each cycle via reset).
     * @param cursorClip    the cursor clip (nullable in tests — see above).
     * @param cursorDevice  the cursor device created at init (:84) — threaded
     *                      through to PullHandlers.start (Phase 5 Plan 05-03,
     *                      Pitfall 3; nullable in tests like cursorClip).
     * @param observers     the observers (nullable in tests — see above).
     * @param walker        the launcher-grid walker (nullable in tests — the
     *                      {@code get.launcher_clips} handler returns
     *                      {@code "internal"} when the walker is null).
     * @param isRunning     supplies the live {@code running} flag (loop condition).
     * @param setSocket     publishes/nulls the live socket for {@link #exit}'s cleanup.
     * @param logger        receives status/loss lines (production: {@code host::println}).
     * @return {@code true} to retry (socket loss), {@code false} to exit (shutdown).
     */
    static boolean runConnectorCycle(final String loopback,
                                      final int port,
                                      final Outbox outbox,
                                      final PinnableCursorClip cursorClip,
                                      final CursorDevice cursorDevice,
                                      final Observers observers,
                                      final LauncherGridWalker walker,
                                      final BooleanSupplier isRunning,
                                      final Consumer<Socket> setSocket,
                                      final Consumer<String> logger) {
        // (1) CONNECT — retry until connected or running goes false.
        Socket s = null;
        while (isRunning.getAsBoolean() && s == null) {
            try {
                s = new Socket(loopback, port); // loopback-only (Pitfall 5)
                logger.accept("[bw-brain] connected to daemon " + loopback + ":" + port);
            } catch (final Exception e) {
                try {
                    Thread.sleep(1000); // daemon not up yet; retry
                } catch (final InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
        }
        if (s == null) {
            return false; // running went false during the connect retry
        }
        setSocket.accept(s); // publish for exit()'s defensive cleanup
        // (2) RUN — re-arm the writer CAS (Pitfall 2), start writer + pull, JOIN
        //     the pull thread. The pull thread's readLine IOException on socket
        //     close is the reliable loss signal.
        outbox.reset();
        outbox.startWriterThread(s);
        final Thread pull = PullHandlers.start(s, outbox, cursorClip, cursorDevice, observers, walker);
        try {
            pull.join();
        } catch (final InterruptedException ie) {
            Thread.currentThread().interrupt();
            return false;
        }
        // (3) NULL + RETRY — null the published socket so exit() does not
        //     double-close; stop + clear the outbox for the next cycle.
        setSocket.accept(null);
        outbox.stop(); // idempotent — interrupts the (possibly parked) writer
        outbox.clear(); // D-07 — drop queued events
        return true; // socket loss detected — loop back to CONNECT
    }

    @Override
    public void exit() {
        running = false;
        if (outbox != null) {
            outbox.stop();
        }
        if (connectorThread != null) {
            connectorThread.interrupt();
        }
        // D-08 defensive close: if exit() fires while the connector is mid-cycle
        // (socket published, writer/pull still alive), close the live socket so
        // the pull thread's readLine unblocks (join returns) and the loop sees
        // running=false. The writer/pull try-with-resources handles the normal
        // case; this handles the live-connection-shutdown case.
        if (socket != null) {
            try {
                socket.close();
            } catch (final Exception ignored) {}
        }
        host.println("[bw-brain] exit");
    }

    @Override
    public void flush() {
        // no-op — all I/O is offloaded to the Outbox writer thread.
    }
}
