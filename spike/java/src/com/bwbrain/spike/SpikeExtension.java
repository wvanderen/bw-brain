// spike/java/src/com/bwbrain/spike/SpikeExtension.java
//
// Throwaway Bitwig Controller Extension (D-07 pivot JS→Java).
//
// WHY JAVA (not the JS spike per D-07): empirically confirmed in-app that the JS
// control-surface `host` exposes NO networking and NO file I/O — println to an
// in-app console is its only output, and that console was not surfacing in
// Bitwig 6.0.6. The Java extension API runs in the real Bitwig JVM (proven
// unsandboxed via DrivenByMoss OSC+JNA), so it gets java.net sockets. That makes
// the Java extension the ONLY path to a real end-to-end SC#1 round-trip. This
// finding goes in docs/bitwig-capabilities.md. DELETE IN PHASE 2.
//
// WHAT IT DOES:
//   Track A (selection observation): a CursorTrack follows the GUI selection.
//     We observe cursorTrack.position() — it changes whenever the selected track
//     changes — and emit a selection.changed line. (NOT a per-bank observer:
//     TrackBank.getTrack/getChannel are BOTH deprecated in API 21, and there is
//     no bank-level addSelectionObserver in the public control-surface API —
//     selection is observed via CursorTrack position/name or per-channel
//     addIsSelectedInMixerObserver.)
//   Track B (transport): a loopback-only TCP CLIENT connecting to the daemon's
//     dump CLI on 127.0.0.1:7878. On selection it writes one JSON-Lines
//     `selection.changed` line shaped to satisfy schemas/protocol/event.schema.json.
//
// INVARIANTS (held even in the throwaway):
//   - 127.0.0.1 ONLY (Pitfall 5) — the socket never touches another interface.
//   - never-block-an-observer (Pitfall 3) — the observer only offers to a queue;
//     a dedicated writer thread does the socket I/O.
package com.bwbrain.spike;

import com.bitwig.extension.callback.IntegerValueChangedCallback;
import com.bitwig.extension.controller.ControllerExtension;
import com.bitwig.extension.controller.ControllerExtensionDefinition;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorTrack;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.LinkedBlockingQueue;

public final class SpikeExtension extends ControllerExtension {

    private static final String LOOPBACK = "127.0.0.1";
    private static final int PORT = 7878;                 // daemon dump CLI (Plan 01-02)

    // ControllerHost stored from the ctor: the inherited getHost() returns the
    // base com.bitwig.extension.api.Host, which lacks println/createCursorTrack.
    private final ControllerHost host;
    private final LinkedBlockingQueue<String> outbox = new LinkedBlockingQueue<>();
    // Bitwig value-observers fire once on registration with the current value;
    // skip that initial fire so the daemon's first received line is a REAL
    // selection change, not the boot state (the dump CLI exits on line #1).
    private volatile boolean skipFirstFire = true;
    private volatile boolean running = true;
    private Thread writerThread;

    SpikeExtension(final ControllerExtensionDefinition definition, final ControllerHost host) {
        super(definition, host);
        this.host = host;
    }

    @Override
    public void init() {
        host.println("[spike-java] init — CursorTrack follows selection; TCP client → "
                + LOOPBACK + ":" + PORT);

        // Non-deprecated in API 21 (verified via -Xlint:deprecation). The cursor
        // track follows the user's selected track; position() is its track index.
        final CursorTrack cursor = host.createCursorTrack(0, 0);
        cursor.position().addValueObserver(new IntegerValueChangedCallback() {
            @Override
            public void valueChanged(final int trackIndex) {
                if (skipFirstFire) {
                    skipFirstFire = false;
                    host.println("[spike-java] initial position=" + trackIndex + " (skipped emit)");
                    return;
                }
                onSelected(trackIndex);
            }
        }, 1); // step=1: fire on any position change

        writerThread = new Thread(this::writerLoop, "spike-tcp-writer");
        writerThread.setDaemon(true);
        writerThread.start();
    }

    /** Build a schema-valid selection.changed line and hand it to the writer thread. */
    private void onSelected(final int trackIndex) {
        // Pitfall 3: observer fires on the controller thread — never block here.
        final long unixSec = System.currentTimeMillis() / 1000L;
        // Frozen envelope (event.schema.json): version+type+timestamp required,
        // payload.trackId optional string. additionalProperties:false everywhere.
        final String line =
                "{\"version\":\"1.0\",\"type\":\"selection.changed\",\"timestamp\":"
                + unixSec + ",\"payload\":{\"trackId\":\"trk_" + trackIndex + "\"}}\n";
        outbox.offer(line);
    }

    /** Connect (retry until the daemon dump CLI is up), then drain the outbox to the socket. */
    private void writerLoop() {
        Socket socket = null;
        while (running && socket == null) {
            try {
                socket = new Socket(LOOPBACK, PORT); // loopback-only (Pitfall 5)
                host.println("[spike-java] connected to daemon " + LOOPBACK + ":" + PORT);
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
        try (final Socket s = socket) {
            final OutputStream out = s.getOutputStream();
            while (running) {
                final String line = outbox.take(); // blocks until a selection event
                out.write(line.getBytes(StandardCharsets.UTF_8));
                out.flush();
                host.println("[spike-java] emitted " + line.trim());
            }
        } catch (final InterruptedException ie) {
            Thread.currentThread().interrupt();
        } catch (final Exception e) {
            host.println("[spike-java] writer error: " + e.getClass().getSimpleName()
                    + " " + e.getMessage());
        }
    }

    @Override
    public void exit() {
        running = false;
        if (writerThread != null) {
            writerThread.interrupt();
        }
        host.println("[spike-java] exit");
    }

    @Override
    public void flush() {
        // no-op — all I/O is offloaded to the writer thread
    }
}
