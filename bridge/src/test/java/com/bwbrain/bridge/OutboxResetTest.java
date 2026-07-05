// bridge/src/test/java/com/bwbrain/bridge/OutboxResetTest.java
//
// Phase 03.1 Plan 01 Task 1 — Pitfall 2 regression proof (D-07 / D-08).
//
// The Outbox writer thread is started via startWriterThread(), which guards on
// `running.compareAndSet(false, true)`. After stop() flips running back to
// false, the CAS is re-armable — BUT the stale writerThread reference must be
// cleared (reset()) and queued events from the dead socket must be dropped
// (clear()) so the D-08 connector loop can start a fresh writer on a fresh
// socket without replaying stale events into the reconnected daemon.
//
// These three tests prove the reconnect primitives end-to-end against real
// loopback ServerSockets (the OutboxTest.java harness pattern). They FAIL until
// reset() and clear() are added to Outbox.java (TDD RED).
package com.bwbrain.bridge;

import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class OutboxResetTest {

    /**
     * Test 1 (Pitfall 2 — the load-bearing regression): after startWriterThread
     * on socket1 → stop() → reset() → startWriterThread on socket2, a line
     * offered AFTER the reset arrives at socket2 within 1s. This proves the CAS
     * re-armed (without reset() nulling the stale writerThread + the running
     * flag being false, the second startWriterThread would either NO-OP or the
     * old writer would still own the field).
     */
    @Test
    void startWriterThreadIsReCallableAfterStopAndReset() throws Exception {
        // Server A on an ephemeral loopback port (Pitfall 5 — loopback only).
        try (final ServerSocket serverA = new ServerSocket(0, 50,
                InetAddress.getByName("127.0.0.1"))) {
            final LinkedBlockingQueue<String> receivedA = new LinkedBlockingQueue<>();
            final Thread readerA = startReader(serverA, receivedA);
            try (final Socket socket1 = new Socket("127.0.0.1", serverA.getLocalPort())) {
                // readerA owns serverA.accept(); the main thread must not race it.
                final Outbox outbox = new Outbox();
                outbox.startWriterThread(socket1);
                // Drain anything + let the writer park on queue.take().
                outbox.offer("on-socket1\n");
                waitForLines(receivedA, 1, 2);
                // Tear down the first writer.
                outbox.stop();
                outbox.reset(); // D-08 / Pitfall 2 — re-arm CAS + null writerThread.

                // Server B on a second ephemeral loopback port.
                try (final ServerSocket serverB = new ServerSocket(0, 50,
                        InetAddress.getByName("127.0.0.1"))) {
                    final LinkedBlockingQueue<String> receivedB = new LinkedBlockingQueue<>();
                    final Thread readerB = startReader(serverB, receivedB);
                    try (final Socket socket2 = new Socket("127.0.0.1", serverB.getLocalPort())) {
                        // readerB owns serverB.accept().
                        // The re-arm: second startWriterThread MUST start a fresh
                        // writer (not a NO-OP) that drains to socket2.
                        outbox.startWriterThread(socket2);
                        outbox.offer("after-reset\n");
                        final String line = receivedB.poll(1, TimeUnit.SECONDS);
                        assertNotNull(line, "line offered after reset() did not arrive at socket2 "
                                + "within 1s — startWriterThread did NOT re-arm (Pitfall 2)");
                        assertEquals("after-reset", line);
                    }
                    readerB.interrupt();
                }
            } finally {
                readerA.interrupt();
            }
        }
    }

    /**
     * Test 2 (D-07 — drop queued events on loss): offer a line, clear(), then
     * startWriterThread — the writer drains NOTHING (the queue is empty). This
     * proves stale events do not replay into the reconnected daemon; the
     * daemon's refreshSnapshot is the source of truth after reconnect.
     */
    @Test
    void clearDropsQueuedEventsSoWriterDrainsNothing() throws Exception {
        try (final ServerSocket server = new ServerSocket(0, 50,
                InetAddress.getByName("127.0.0.1"))) {
            final LinkedBlockingQueue<String> received = new LinkedBlockingQueue<>();
            final Thread reader = startReader(server, received);
            try (final Socket client = new Socket("127.0.0.1", server.getLocalPort())) {
                // reader owns server.accept().
                final Outbox outbox = new Outbox();
                outbox.offer("stale-event-1\n");
                outbox.offer("stale-event-2\n");
                outbox.clear(); // D-07 — drop the queued events.
                outbox.startWriterThread(client);
                // The writer is now parked on queue.take() with an empty queue.
                final String line = received.poll(1, TimeUnit.SECONDS);
                assertNull(line, "writer drained a line after clear() — stale events leaked "
                        + "into the new socket (D-07 violated)");
            } finally {
                reader.interrupt();
            }
        }
    }

    /**
     * Test 3 (idempotence): calling reset() twice does not throw and leaves
     * running=false — proven end-to-end by a subsequent startWriterThread
     * successfully arming (CAS false→true) and draining a line.
     */
    @Test
    void resetIsIdempotent() throws Exception {
        try (final ServerSocket server = new ServerSocket(0, 50,
                InetAddress.getByName("127.0.0.1"))) {
            final LinkedBlockingQueue<String> received = new LinkedBlockingQueue<>();
            final Thread reader = startReader(server, received);
            try (final Socket client = new Socket("127.0.0.1", server.getLocalPort())) {
                // reader owns server.accept().
                final Outbox outbox = new Outbox();
                assertDoesNotThrow(outbox::reset);
                assertDoesNotThrow(outbox::reset); // twice — idempotent.
                // running is false after reset → startWriterThread arms cleanly.
                outbox.startWriterThread(client);
                outbox.offer("post-double-reset\n");
                final String line = received.poll(1, TimeUnit.SECONDS);
                assertNotNull(line, "startWriterThread did not arm after double reset() — "
                        + "running was not false (idempotence broken)");
                assertEquals("post-double-reset", line);
            } finally {
                reader.interrupt();
            }
        }
    }

    // --- harness helpers (mirror OutboxTest.java's loopback ServerSocket pattern) ---

    /** Start a daemon reader thread that accepts one connection and queues lines. */
    private static Thread startReader(final ServerSocket server,
                                       final LinkedBlockingQueue<String> sink) {
        final Thread t = new Thread(() -> {
            try (final Socket s = server.accept()) {
                final BufferedReader r = new BufferedReader(
                        new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = r.readLine()) != null) {
                    sink.offer(line);
                }
            } catch (final Exception ignored) {
                // socket close / interrupt — exit silently.
            }
        }, "outbox-reset-test-reader");
        t.setDaemon(true);
        t.start();
        return t;
    }

    /** Wait until the queue has at least {@code n} lines or the deadline lapses. */
    private static void waitForLines(final LinkedBlockingQueue<String> queue,
                                      final int n, final int timeoutSeconds) throws Exception {
        final long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
        while (queue.size() < n && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
    }
}
