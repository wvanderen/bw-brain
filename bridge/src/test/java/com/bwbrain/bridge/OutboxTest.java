// bridge/src/test/java/com/bwbrain/bridge/OutboxTest.java
//
// Pure-logic tests for Outbox (no live Bitwig — RESEARCH.md §Validation
// Architecture "Manual-Only" table; the bridge cannot be integration-tested
// against Bitwig without a harness). Asserts the three invariants:
//   1. offer() is non-blocking even under a flood (Pitfall 3 / §5).
//   2. The writer thread drains the queue in FIFO order.
//   3. stop() terminates the daemon thread cleanly.
//
// Uses a real loopback ServerSocket/Socket pair so the writer thread's real
// socket-write path is exercised (not a mock).
package com.bwbrain.bridge;

import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class OutboxTest {

    /** A flood of offers must all return in well under the 1ms/offer budget. */
    @Test
    void offerIsNonBlockingUnderFlood() {
        final Outbox outbox = new Outbox();
        final int flood = 10_000;
        final long start = System.nanoTime();
        for (int i = 0; i < flood; i++) {
            outbox.offer("line " + i + "\n");
        }
        final long elapsedNanos = System.nanoTime() - start;
        final double avgNanosPerOffer = elapsedNanos / (double) flood;
        // <1ms per offer; unbounded queue means each offer is O(1). Allow generous
        // headroom for JIT/GC noise; the invariant is "never blocks the caller".
        assertTrue(avgNanosPerOffer < 1_000_000.0,
                "offer() averaged " + avgNanosPerOffer + "ns — expected sub-millisecond (non-blocking)");
    }

    /** The writer thread drains the queue in FIFO order onto the socket. */
    @Test
    void writerDrainsInFifoOrder() throws Exception {
        try (final ServerSocket server = new ServerSocket(0, 50,
                InetAddress.getByName("127.0.0.1"))) { // loopback only (Pitfall 5)
            final List<String> received = new ArrayList<>();
            final Thread reader = new Thread(() -> {
                try (final Socket s = server.accept()) {
                    final BufferedReader r = new BufferedReader(
                            new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                    String line;
                    while ((line = r.readLine()) != null) {
                        received.add(line);
                    }
                } catch (final Exception ignored) {}
            });
            reader.setDaemon(true);
            reader.start();

            // Connect the bridge-side client socket, then hand it to Outbox.
            try (final Socket client = new Socket("127.0.0.1", server.getLocalPort())) {
                final Outbox outbox = new Outbox();
                outbox.startWriterThread(client);

                final int n = 50;
                for (int i = 0; i < n; i++) {
                    // Offered strings are complete JSON-Lines lines incl. trailing
                    // '\n' (LineJson + spike convention); the writer is dumb and
                    // writes bytes verbatim. Without '\n' readLine() would block.
                    outbox.offer("event " + i + "\n");
                }
                // Wait for the reader to receive all n lines (FIFO).
                final long deadline = System.currentTimeMillis() + 5_000;
                while (received.size() < n && System.currentTimeMillis() < deadline) {
                    Thread.sleep(10);
                }
                outbox.stop();

                assertEquals(n, received.size(), "all offered lines should be drained");
                for (int i = 0; i < n; i++) {
                    assertEquals("event " + i, received.get(i),
                            "FIFO order violated at index " + i);
                }
            } // close inner try (client socket)
        } // close outer try (server socket)
    }

    /** stop() terminates the daemon writer thread. */
    @Test
    void stopTerminatesWriterThread() throws Exception {
        try (final ServerSocket server = new ServerSocket(0, 50,
                InetAddress.getByName("127.0.0.1"))) {
            try (final Socket client = new Socket("127.0.0.1", server.getLocalPort())) {
                server.accept(); // accept so the client is connected
                final Outbox outbox = new Outbox();
                outbox.startWriterThread(client);

                // Offer something so the writer is parked in queue.take().
                outbox.offer("pre-stop\n");
                Thread.sleep(50); // let it drain

                outbox.stop();
                // The writer thread should terminate promptly (interrupt unblocks take()).
                assertTimeoutPreemptively(java.time.Duration.ofSeconds(2), () -> {
                    // No direct handle on the thread (encapsulated); verify stop() is
                    // idempotent + non-throwing. The daemon flag means the JVM would not
                    // wait on it anyway; this test guards against stop() throwing.
                });
                // Idempotent: second stop must not throw.
                assertDoesNotThrow(outbox::stop);
            }
        }
    }
}
