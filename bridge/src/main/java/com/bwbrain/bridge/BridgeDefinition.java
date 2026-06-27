// bridge/src/main/java/com/bwbrain/bridge/BridgeDefinition.java
//
// Production Bitwig Controller Extension DEFINITION. Bitwig discovers this class
// inside bw-brain.bwextension via Java's ServiceLoader (the
// META-INF/services/com.bitwig.extension.ExtensionDefinition resource) and calls
// createInstance(host) to spawn the extension.
//
// Transcribed from the Phase-1 throwaway spike/java/.../SpikeDefinition.java
// (proven live on Bitwig 6.0.6 declaring API 21), with the package renamed to
// com.bwbrain.bridge, the class to BridgeDefinition, the product name to
// "bw-brain", the version to "0.1.0", and a fresh UUID (the spike's UUID is
// retained in the throwaway dir only). The required-API-version stays 21
// (AGENTS.md + DrivenByMoss 26.6.2 both target 21; loaded cleanly on 6.0.6).
package com.bwbrain.bridge;

import com.bitwig.extension.api.PlatformType;
import com.bitwig.extension.controller.AutoDetectionMidiPortNamesList;
import com.bitwig.extension.controller.ControllerExtension;
import com.bitwig.extension.controller.ControllerExtensionDefinition;
import com.bitwig.extension.controller.api.ControllerHost;
import java.util.UUID;

public final class BridgeDefinition extends ControllerExtensionDefinition {

    // Fresh UUID for the production bridge (distinct from the throwaway spike).
    private static final UUID ID =
            UUID.fromString("b8d7c2db-498c-4cd9-ba6c-6216eeae3c07");

    @Override
    public String getName() { return "bw-brain"; }

    @Override
    public String getAuthor() { return "bw-brain"; }

    @Override
    public String getVersion() { return "0.1.0"; }

    @Override
    public UUID getId() { return ID; }

    @Override
    public int getRequiredAPIVersion() { return 21; } // extension-api:21 (AGENTS.md)

    @Override
    public String getHardwareVendor() { return "bw-brain"; }

    @Override
    public String getHardwareModel() { return "bw-brain"; }

    @Override
    public int getNumMidiInPorts() { return 0; }

    @Override
    public int getNumMidiOutPorts() { return 0; }

    @Override
    public void listAutoDetectionMidiPortNames(
            final AutoDetectionMidiPortNamesList list, final PlatformType platformType) {
        // No MIDI hardware — this bridge mirrors state only, no auto-detection.
    }

    @Override
    public ControllerExtension createInstance(final ControllerHost host) {
        return new BridgeExtension(this, host);
    }
}
