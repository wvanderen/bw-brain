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
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extension.controller.api.Transport;

import java.net.Socket;

public final class BridgeExtension extends ControllerExtension {

    // Pitfall 5 — loopback ONLY (replicated from the spike lines 43-44).
    static final String LOOPBACK = "127.0.0.1";
    static final int PORT = 7878;
    static final int BANK_SIZE = 8; // D-01 windowed TrackBank page size

    // Stored from the ctor: the inherited getHost() returns the base Host which
    // lacks println/createCursorTrack (same reason the spike stored host).
    private final ControllerHost host;

    private volatile boolean running = true;
    private Outbox outbox;
    private Observers observers;
    private Thread connectorThread;
    private Thread pullThread;
    private Socket socket;

    BridgeExtension(final ControllerExtensionDefinition definition, final ControllerHost host) {
        super(definition, host);
        this.host = host;
    }

    @Override
    public void init() {
        host.println("[bw-brain] init — cursor triple + windowed TrackBank[N=" + BANK_SIZE
                + "] + transport -> " + LOOPBACK + ":" + PORT);

        // === Cursor triple + transport + windowed TrackBank (D-01) ===
        // CursorTrack (2-arg, non-deprecated — proven in spike). The cursor clip is
        // created FROM the cursor track (createLauncherCursorClip -> PinnableCursorClip;
        // host.createCursorClip returns a plain Clip without the pin surface). The
        // cursor device is created from the cursor track (-> PinnableCursorDevice,
        // which IS-A CursorDevice).
        final CursorTrack cursorTrack = host.createCursorTrack(0, 0);
        final PinnableCursorClip cursorClip = cursorTrack.createLauncherCursorClip(16, 128);
        final CursorDevice cursorDevice = cursorTrack.createCursorDevice(); // deprecated-allow: 0-arg overload (non-deprecated); javadoc deprecates only the 4-arg (String,String,int,CursorDeviceFollowMode) form
        final Transport transport = host.createTransport();
        final TrackBank trackBank = host.createTrackBank(BANK_SIZE, 0, 0);

        // === Outbox + observers ===
        outbox = new Outbox(host::println);
        observers = new Observers(outbox, BANK_SIZE);
        observers.register(host, cursorTrack, cursorClip, cursorDevice, transport, trackBank);

        // === Connector thread: retry-connect to the daemon, then start the
        // writer thread (Outbox) + pull-handler thread (PullHandlers) on the same
        // socket. Matches the spike's retry-until-connected pattern.
        startConnector(cursorClip);
    }

    private void startConnector(final PinnableCursorClip cursorClip) {
        connectorThread = new Thread(() -> {
            while (running && socket == null) {
                try {
                    socket = new Socket(LOOPBACK, PORT); // loopback-only (Pitfall 5)
                    host.println("[bw-brain] connected to daemon " + LOOPBACK + ":" + PORT);
                } catch (final Exception e) {
                    try {
                        Thread.sleep(1000); // daemon not up yet; retry
                    } catch (final InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
            if (socket == null) {
                return;
            }
            outbox.startWriterThread(socket);
            pullThread = PullHandlers.start(socket, outbox, cursorClip, observers);
        }, "bw-brain-connector");
        connectorThread.setDaemon(true);
        connectorThread.start();
    }

    @Override
    public void exit() {
        running = false;
        if (outbox != null) {
            outbox.stop();
        }
        if (pullThread != null) {
            pullThread.interrupt();
        }
        if (connectorThread != null) {
            connectorThread.interrupt();
        }
        host.println("[bw-brain] exit");
    }

    @Override
    public void flush() {
        // no-op — all I/O is offloaded to the Outbox writer thread.
    }
}
