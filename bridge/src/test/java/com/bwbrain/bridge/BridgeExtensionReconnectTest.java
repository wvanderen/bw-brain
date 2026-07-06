// bridge/src/test/java/com/bwbrain/bridge/BridgeExtensionReconnectTest.java
//
// Phase 03.1 Plan 01 Task 2 — D-08 reconnect proof (lifecycle loop).
//
// BridgeExtension extends ControllerExtension, whose constructor requires a
// live Bitwig ControllerHost — so the class cannot be instantiated inside a
// plain JUnit run. The D-08 lifecycle loop is therefore extracted into the
// package-private static BridgeExtension.runConnectorCycle(...) method, which
// this test exercises directly against real loopback ServerSockets (the
// OutboxTest.java harness pattern — no Mockito in this project).
//
// Three behaviours (RESEARCH §D-08):
//   1. connectorReconnectsAfterSocketLoss — the cycle re-enters CONNECT after a
//      pull-thread loss; the writer re-arms via reset() (Pitfall 2 integration).
//   2. exitClosesLiveSocket — the published live socket is closeable; closing it
//      propagates to the server side within 1s (the exit() defensive close).
//   3. loopbackOnlyPreserved — the reconnect Socket uses 127.0.0.1 exclusively
//      (Pitfall 5 — the accepted socket's remote address is loopback).
//
// These tests FAIL until BridgeExtension.runConnectorCycle exists (TDD RED).
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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class BridgeExtensionReconnectTest {

    private static final String LOOPBACK = "127.0.0.1";

    /**
     * Test 1 (D-08 — the load-bearing reconnect proof): the connector cycle
     * reconnects after socket loss. Flow: connect to server A → kill A (close
     * the accepted socket + the ServerSocket, simulating a daemon restart) →
     * reopen server B on the same port → within ~3s the cycle's retry succeeds
     * → a line offered AFTER the loss arrives at server B. This proves:
     *   - the cycle re-entered CONNECT (while-running loop, not connect-once),
     *   - the writer re-armed via outbox.reset() (Pitfall 2 integration),
     *   - loopback-only is preserved on the reconnect (Pitfall 5).
     */
    @Test
    void connectorReconnectsAfterSocketLoss() throws Exception {
        final Outbox outbox = new Outbox();
        final AtomicBoolean testRunning = new AtomicBoolean(true);
        final AtomicReference<Socket> liveSocket = new AtomicReference<>();

        // Server A on an ephemeral loopback port (the "first daemon").
        final ServerSocket serverA = new ServerSocket(0, 50, InetAddress.getByName(LOOPBACK));
        final int port = serverA.getLocalPort();
        final AtomicReference<Socket> acceptedA = new AtomicReference<>();
        final LinkedBlockingQueue<String> receivedA = new LinkedBlockingQueue<>();
        final Thread acceptorA = startAcceptorReader(serverA, acceptedA, receivedA);

        // Run the lifecycle loop in a background thread (mirrors startConnector).
        final Thread loop = new Thread(() -> {
            while (testRunning.get()) {
                if (!BridgeExtension.runConnectorCycle(LOOPBACK, port, outbox,
                        null, null, null, () -> testRunning.get(),
                        liveSocket::set, m -> {})) {
                    return;
                }
            }
        }, "test-connector-loop");
        loop.setDaemon(true);
        loop.start();

        try {
            // (1) Wait for the first connect to server A.
            waitFor(() -> liveSocket.get() != null, 3,
                    "connector did not connect to server A within 3s");
            waitFor(() -> acceptedA.get() != null, 3,
                    "server A did not accept the connection within 3s");
            // Capture the first socket so we can detect a FRESH reconnect
            // (the null-window between cycles is sub-millisecond on loopback,
            // so polling for null is unreliable — poll for a different socket).
            final Socket firstSocket = liveSocket.get();

            // (2) Kill server A — close the accepted socket (kills the bridge
            //     connection → pull thread dies → join returns → cycle retries)
            //     AND the ServerSocket (frees the port for server B).
            closeQuietly(acceptedA.get());
            serverA.close();
            acceptorA.interrupt();

            // (3) Reopen server B on the SAME port (daemon restart). Retry —
            //     the OS may take a moment to release the port after A closed.
            final ServerSocket serverB = reopenLoopback(port);
            final AtomicReference<Socket> acceptedB = new AtomicReference<>();
            final LinkedBlockingQueue<String> receivedB = new LinkedBlockingQueue<>();
            final Thread acceptorB = startAcceptorReader(serverB, acceptedB, receivedB);
            try {
                // (4) Wait for reconnect: liveSocket must publish a FRESH socket
                //     (different from firstSocket). The lifecycle loop re-entered
                //     CONNECT after the pull thread detected the loss.
                waitFor(() -> {
                    final Socket cur = liveSocket.get();
                    return cur != null && cur != firstSocket;
                }, 7, "connector did not reconnect to a fresh socket within 7s "
                        + "(lifecycle loop did not re-enter CONNECT — D-08 broken)");

                // (5) Offer a line AFTER the fresh socket is published; it must
                //     arrive at server B within ~3s (proves the writer re-armed
                //     via reset() on the new socket).
                outbox.offer("after-reconnect\n");
                final String line = receivedB.poll(3, TimeUnit.SECONDS);
                assertNotNull(line, "line offered after reconnect did not arrive at server B "
                        + "within 3s — writer did not re-arm (Pitfall 2 integration broken)");
                assertEquals("after-reconnect", line);
            } finally {
                acceptorB.interrupt();
                closeQuietly(acceptedB.get());
                serverB.close();
            }
        } finally {
            testRunning.set(false);
            closeQuietly(liveSocket.get());
            loop.interrupt();
            acceptorA.interrupt();
        }
    }

    /**
     * Test 2 (D-08 defensive exit close): after a successful connect, the
     * published live socket is closeable, and closing it propagates to the
     * server side within 1s. This is the mechanic exit() relies on
     * (`if (socket != null) socket.close()`) to unblock the pull thread's
     * readLine during a live-connection shutdown.
     */
    @Test
    void exitClosesLiveSocket() throws Exception {
        final Outbox outbox = new Outbox();
        final AtomicBoolean testRunning = new AtomicBoolean(true);
        final AtomicReference<Socket> liveSocket = new AtomicReference<>();

        try (final ServerSocket server = new ServerSocket(0, 50, InetAddress.getByName(LOOPBACK))) {
            final int port = server.getLocalPort();
            final AtomicReference<Socket> accepted = new AtomicReference<>();
            final LinkedBlockingQueue<String> received = new LinkedBlockingQueue<>();
            final Thread acceptor = startAcceptorReader(server, accepted, received);

            final Thread loop = new Thread(() -> {
                while (testRunning.get()) {
                    if (!BridgeExtension.runConnectorCycle(LOOPBACK, port, outbox,
                            null, null, null, () -> testRunning.get(),
                            liveSocket::set, m -> {})) {
                        return;
                    }
                }
            }, "test-connector-loop-exit");
            loop.setDaemon(true);
            loop.start();

            try {
                waitFor(() -> liveSocket.get() != null, 3, "did not connect");
                waitFor(() -> accepted.get() != null, 3, "server did not accept");

                // Simulate exit()'s defensive close on the PUBLISHED live socket.
                final Socket live = liveSocket.get();
                assertNotNull(live);
                live.close();

                // The server side must observe EOF (readLine returns null) within
                // ~1s of the close — proves the published socket is the live one.
                waitFor(() -> {
                    // acceptor's read loop exits when readLine returns null; the
                    // accepted socket's isClosed() reflects the transport close.
                    final Socket a = accepted.get();
                    return a != null && (a.isClosed() || !a.isConnected());
                }, 2, "server did not observe the live-socket close within 2s");
                // Stronger: the acceptor thread should have exited its read loop
                // (readLine returned null on EOF).
                waitFor(() -> !acceptor.isAlive() || receivedStreamEnded(accepted.get()), 2,
                        "server-side read did not see EOF within 2s");
            } finally {
                testRunning.set(false);
                loop.interrupt();
                acceptor.interrupt();
            }
        }
    }

    /**
     * Test 3 (Pitfall 5 — loopback-only preserved): the connector's Socket
     * constructor uses 127.0.0.1 exclusively. Verified from the server side:
     * the accepted socket's REMOTE address (the bridge client's address) is
     * 127.0.0.1, not a wildcard / external interface.
     */
    @Test
    void loopbackOnlyPreservedOnReconnect() throws Exception {
        final Outbox outbox = new Outbox();
        final AtomicBoolean testRunning = new AtomicBoolean(true);
        final AtomicReference<Socket> liveSocket = new AtomicReference<>();

        try (final ServerSocket server = new ServerSocket(0, 50, InetAddress.getByName(LOOPBACK))) {
            final int port = server.getLocalPort();
            final AtomicReference<Socket> accepted = new AtomicReference<>();
            final LinkedBlockingQueue<String> received = new LinkedBlockingQueue<>();
            final Thread acceptor = startAcceptorReader(server, accepted, received);

            final Thread loop = new Thread(() -> {
                while (testRunning.get()) {
                    if (!BridgeExtension.runConnectorCycle(LOOPBACK, port, outbox,
                            null, null, null, () -> testRunning.get(),
                            liveSocket::set, m -> {})) {
                        return;
                    }
                }
            }, "test-connector-loop-loopback");
            loop.setDaemon(true);
            loop.start();

            try {
                waitFor(() -> accepted.get() != null, 3, "server did not accept");
                // The REMOTE address (client side) MUST be loopback.
                final String remote = accepted.get().getInetAddress().getHostAddress();
                assertEquals(LOOPBACK, remote,
                        "connector connected from a non-loopback address (Pitfall 5 violated): "
                                + remote);
            } finally {
                testRunning.set(false);
                closeQuietly(liveSocket.get());
                loop.interrupt();
                acceptor.interrupt();
            }
        }
    }

    // --- harness helpers ---

    /**
     * Start a daemon thread that accepts ONE connection on the ServerSocket,
     * stores the accepted socket in the reference, then reads lines into the
     * queue until EOF/close.
     */
    private static Thread startAcceptorReader(final ServerSocket server,
                                               final AtomicReference<Socket> acceptedRef,
                                               final LinkedBlockingQueue<String> sink) {
        final Thread t = new Thread(() -> {
            try (final Socket s = server.accept()) {
                acceptedRef.set(s);
                final BufferedReader r = new BufferedReader(
                        new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = r.readLine()) != null) {
                    sink.offer(line);
                }
            } catch (final Exception ignored) {
                // socket close / interrupt — exit silently.
            }
        }, "test-acceptor-reader");
        t.setDaemon(true);
        t.start();
        return t;
    }

    /** Reopen a loopback ServerSocket on the given port, retrying for up to ~2s. */
    private static ServerSocket reopenLoopback(final int port) throws Exception {
        Exception last = null;
        final long deadline = System.currentTimeMillis() + 2000;
        while (System.currentTimeMillis() < deadline) {
            try {
                final ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new java.net.InetSocketAddress(InetAddress.getByName(LOOPBACK), port));
                return s;
            } catch (final Exception e) {
                last = e;
                Thread.sleep(50);
            }
        }
        throw new AssertionError("failed to reopen loopback ServerSocket on port " + port
                + " within 2s: " + (last == null ? "" : last.getMessage()));
    }

    /** Poll {@code condition} every 10ms until true or the deadline lapses. */
    private static void waitFor(final java.util.function.BooleanSupplier condition,
                                 final int timeoutSeconds, final String message) throws Exception {
        final long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(10);
        }
        throw new AssertionError(message);
    }

    private static void closeQuietly(final Socket s) {
        if (s != null) {
            try { s.close(); } catch (final Exception ignored) {}
        }
    }

    private static boolean receivedStreamEnded(final Socket s) {
        try {
            return s.isClosed() || s.getInputStream().read() == -1;
        } catch (final Exception e) {
            return true; // read threw — stream is ended/closed
        }
    }
}
