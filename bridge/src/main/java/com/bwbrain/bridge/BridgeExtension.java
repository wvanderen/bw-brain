// bridge/src/main/java/com/bwbrain/bridge/BridgeExtension.java
//
// STUB — Task 1 skeleton only. Task 2 replaces init() with the full Phase-2
// observer set (CursorTrack + PinnableCursorClip + CursorDevice + Transport +
// windowed TrackBank[N=8]) + the get.* pull-handler dispatch + the loopback
// socket + the Outbox writer thread. This minimal form exists so the Task-1
// skeleton (BridgeDefinition.createInstance -> new BridgeExtension(...)) compiles.
package com.bwbrain.bridge;

import com.bitwig.extension.controller.ControllerExtension;
import com.bitwig.extension.controller.ControllerExtensionDefinition;
import com.bitwig.extension.controller.api.ControllerHost;

public final class BridgeExtension extends ControllerExtension {

    BridgeExtension(final ControllerExtensionDefinition definition, final ControllerHost host) {
        super(definition, host);
    }

    @Override
    public void init() {
        // Task 2 fills this in: loopback socket + Observers.register + PullHandlers.start.
    }

    @Override
    public void exit() {
        // Task 2 fills this in: stop Outbox + PullHandlers.
    }

    @Override
    public void flush() {
        // no-op — all I/O offloaded to daemon threads (Task 2).
    }
}
