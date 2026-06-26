// =============================================================================
// spike/raw-tcp-probe.java  —  THROWAWAY Track B transport probe.
// =============================================================================
// DELETE IN PHASE 2. This file lives under spike/ so its throwaway status is
// unambiguous (D-05/D-06). It is NOT the production bridge.
//
// PURPOSE
//   Resolve the residual transport question A1: does raw java.net.ServerSocket
//   work directly inside the Bitwig extension JVM? The DrivenByMoss evidence
//   (RESEARCH.md §Transport Findings) proves the JVM is NOT sandboxed against
//   native code (JNA loads native libs), which makes raw java.net *very likely*
//   but not *certain* — no reference extension demonstrates raw TCP JSON-Lines
//   (they use OSC/UDP via the official API). This ~30-line probe settles A1 in
//   minutes by binding loopback, accepting one connection, and writing one
//   JSON-Lines line (a hello handshake). See RESEARCH.md line 155.
//
//   DECOUPLED from Track A (spike/bitwig-extension.js): SC#1 is never hostage
//   to whether JsApi exposes networking. If this probe confirms raw TCP, the
//   Transport Decision (Plan 03 Task 3) locks TCP. If JDK 21 is not installed,
//   the documented fallback is to reuse DrivenByMoss's proven OSC server as the
//   transport-proof stand-in (RESEARCH.md §Environment Availability line 551).
//
// ⚠️  JDK 21 IS NOT INSTALLED ON THIS MACHINE (RESEARCH.md §Environment).
//   Two options for Task 3:
//     (a) install OpenJDK 21 (part of this checkpoint), compile this file
//         against com.bitwig:extension-api:21, load it, and confirm raw TCP; OR
//     (b) skip this probe and reuse DrivenByMoss's OSC as the transport proof
//         (no JDK needed). Track B's purpose is satisfied either way; record
//         the chosen path + rationale in docs/bitwig-capabilities.md → Transport
//         Decision section.
//
// COMPILE + LOAD (only if JDK 21 is installed)
//   1. Fetch the extension-api jar once:
//        curl -O https://maven.bitwig.com/com/bitwig/extension-api/21/extension-api-21.jar
//   2. Compile (NO Maven — RESEARCH.md line 72/107):
//        javac -cp extension-api-21.jar spike/raw-tcp-probe.java
//   3. Package as a minimal .bwextension (a zip with the right manifest) and
//      drop into Bitwig's Extensions dir; OR — simpler for the spike — port the
//      ServerSocket logic into a tiny ControllerExtension skeleton. The point is
//      the JVM behavior, not the packaging.
//   4. Verify from a terminal:
//        nc 127.0.0.1 7878        # should print one JSON-Lines hello line
//      or:
//        node -e 'const s=require("net").connect(7878,"127.0.0.1");s.on("data",d=>process.stdout.write(d))'
//
// SECURITY (Pitfall 5 — applies to Java too)
//   The bind is `new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"))`
//   — loopback ONLY. Never the all-interfaces wildcard. This is the single
//   security-relevant decision in the spike (RESEARCH.md §Security).
// =============================================================================

import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.io.OutputStream;

// Minimal class shape — extend com.bitwig.extension.api.ControllerExtension in
// the real packaging; for the spike, the body below can also be wrapped in a
// tiny main() for a stand-alone JVM smoke test outside Bitwig. The point is to
// exercise ServerSocket inside the same JVM Bitwig runs.
public class raw_tcp_probe { // extends ControllerExtension {

    private static final int    PORT = 7878;                 // daemon's expected port
    private static final String HOST = "127.0.0.1";          // loopback ONLY (Pitfall 5)

    // In the real extension this is called from init(). For a stand-alone smoke
    // test, route here from main(String[] args).
    void probeBindAndHandshake() throws Exception {
        // Loopback-only bind (InetAddress.getByName("127.0.0.1") — never null/wildcard).
        ServerSocket server = new ServerSocket(PORT, 50, InetAddress.getByName(HOST));
        System.out.println("[raw-tcp-probe] listening on " + HOST + ":" + PORT);
        // Accept ONE connection, write ONE JSON-Lines hello handshake, close.
        // The line must satisfy schemas/protocol/handshake.schema.json:
        //   {"version":"1.0","type":"hello","payload":{"capabilities":["events","requests"]}}
        try (Socket client = server.accept()) {
            OutputStream out = client.getOutputStream();
            String line = "{\"version\":\"1.0\",\"type\":\"hello\",\"payload\":{\"capabilities\":[\"events\",\"requests\"]}}\n";
            out.write(line.getBytes("UTF-8"));   // atomic-line write (Pattern 4)
            out.flush();
            System.out.println("[raw-tcp-probe] handshake sent to " + client.getRemoteSocketAddress());
        } finally {
            server.close();
        }
    }

    // Optional stand-alone entry point (smoke-test the bind outside Bitwig).
    public static void main(String[] args) throws Exception {
        new raw_tcp_probe().probeBindAndHandshake();
    }
}
