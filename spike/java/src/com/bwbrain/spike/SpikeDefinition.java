// spike/java/src/com/bwbrain/spike/SpikeDefinition.java
//
// Throwaway Bitwig Controller Extension DEFINITION (D-07 pivot JS→Java).
// Bitwig discovers this class inside SpikeProbe.bwextension and calls
// createInstance(host) to spawn the extension. DELETE IN PHASE 2.
package com.bwbrain.spike;

import com.bitwig.extension.api.PlatformType;
import com.bitwig.extension.controller.AutoDetectionMidiPortNamesList;
import com.bitwig.extension.controller.ControllerExtension;
import com.bitwig.extension.controller.ControllerExtensionDefinition;
import com.bitwig.extension.controller.api.ControllerHost;
import java.util.UUID;

public final class SpikeDefinition extends ControllerExtensionDefinition {

    // Valid UUID (the JS version was malformed and silently rejected). Same id
    // space as the throwaway JS SpikeProbe — fine for a spike.
    private static final UUID ID =
            UUID.fromString("adffe628-275c-412b-8b18-3d1ce626af8f");

    @Override
    public String getName() { return "SpikeProbe"; }

    @Override
    public String getAuthor() { return "bw-brain"; }

    @Override
    public String getVersion() { return "0.0.1-spike"; }

    @Override
    public UUID getId() { return ID; }

    @Override
    public int getRequiredAPIVersion() { return 21; } // extension-api:21 (AGENTS.md)

    @Override
    public String getHardwareVendor() { return "bw-brain"; }

    @Override
    public String getHardwareModel() { return "SpikeProbe"; }

    @Override
    public int getNumMidiInPorts() { return 0; }

    @Override
    public int getNumMidiOutPorts() { return 0; }

    @Override
    public void listAutoDetectionMidiPortNames(
            final AutoDetectionMidiPortNamesList list, final PlatformType platformType) {
        // No MIDI hardware — this spike has nothing to auto-detect.
    }

    @Override
    public ControllerExtension createInstance(final ControllerHost host) {
        return new SpikeExtension(this, host);
    }
}
