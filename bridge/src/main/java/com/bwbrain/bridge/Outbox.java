// bridge/src/main/java/com/bwbrain/bridge/Outbox.java
//
// The push half of the bridge transport: a non-blocking offer face for Bitwig
// observer callbacks (which fire on the controller thread and MUST return
// immediately — capabilities doc §5 / Pitfall 3), backed by an unbounded
// LinkedBlockingQueue drained by a dedicated daemon writer thread that does the
// loopback socket I/O off the controller thread.
//
// Split out of the Phase-1 throwaway spike/java/.../SpikeExtension.java writer
// loop (lines 49-55 + 100-132). The spike proved this exact pattern never stalls
// the audio engine. Replicated (not imported — the spike dir is throwaway) into
// production-quality Java.
//
// INVARIANTS:
//   - offer() NEVER blocks the caller (unbounded queue -> always immediate).
//   - The writer thread is a daemon (setDaemon(true)) so it never keeps the JVM
//     alive on its own; named "bw-brain-writer".
//   - FIFO drain: lines are written to the socket in offer() order.
//   - stop() terminates the writer thread cleanly via interrupt (outbox.take()
//     blocks, so interrupt unblocks it).
package com.bwbrain.bridge;

import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;

public final class Outbox {

    // Unbounded: the spike used an unbounded LinkedBlockingQueue and it never
    // stalled the audio engine. Backpressure is enforced daemon-side (Plan 02-01
    // reader bounded queue + drop-oldest on observational events); the bridge's
    // job is to never block the controller thread, which an unbounded queue
    // guarantees (offer() always returns immediately).
    private final LinkedBlockingQueue<String> queue = new LinkedBlockingQueue<>();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final ControllerHostShim host; // for println error reporting (nullable in tests)
    private Thread writerThread;

    /** Minimal shim so Outbox can report writer errors without a hard Bitwig dependency
     *  (tests pass a no-op shim; production passes one backed by ControllerHost.println). */
    @FunctionalInterface
    public interface ControllerHostShim {
        void println(String message);
    }

    public Outbox() {
        this(null);
    }

    public Outbox(final ControllerHostShim host) {
        this.host = host;
    }

    /**
     * Non-blocking enqueue. Safe to call from Bitwig observer callbacks on the
     * controller thread — returns in O(1), never blocks (Pitfall 3 / §5).
     */
    public void offer(final String line) {
        queue.offer(line);
    }

    /**
     * Start the daemon writer thread that drains the queue to the given
     * already-connected loopback socket. The socket lifecycle is owned by the
     * caller (BridgeExtension.init() handles connect/retry); Outbox only drains.
     */
    public void startWriterThread(final Socket socket) {
        if (!running.compareAndSet(false, true)) {
            return; // already started
        }
        writerThread = new Thread(() -> writerLoop(socket), "bw-brain-writer");
        writerThread.setDaemon(true);
        writerThread.start();
    }

    private void writerLoop(final Socket socket) {
        try (final Socket s = socket) {
            final OutputStream out = s.getOutputStream();
            while (running.get()) {
                final String line = queue.take(); // blocks until a line arrives
                out.write(line.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (final InterruptedException ie) {
            Thread.currentThread().interrupt(); // stop() — clean shutdown
        } catch (final Exception e) {
            if (host != null) {
                host.println("[bw-brain] writer error: " + e.getClass().getSimpleName()
                        + " " + e.getMessage());
            }
        }
    }

    /** Stop the writer thread and release the queue. Idempotent. */
    public void stop() {
        running.set(false);
        if (writerThread != null) {
            writerThread.interrupt(); // unblock queue.take()
        }
    }
}
