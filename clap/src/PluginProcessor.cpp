#include "PluginProcessor.h"

namespace bw {

PluginProcessor::PluginProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {}

void PluginProcessor::prepareToPlay(double, int) {}
void PluginProcessor::releaseResources() {}

bool PluginProcessor::isBusesLayoutSupported(const BusesLayout &layouts) const {
  return layouts.getMainInputChannelSet() == layouts.getMainOutputChannelSet() &&
         (layouts.getMainOutputChannelSet() == juce::AudioChannelSet::mono() ||
          layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo());
}

void PluginProcessor::processBlock(juce::AudioBuffer<float> &audio, juce::MidiBuffer &midi) {
  processTransparent(audio, midi);
}

void PluginProcessor::processBlock(juce::AudioBuffer<double> &audio, juce::MidiBuffer &midi) {
  processTransparent(audio, midi);
}

juce::AudioProcessorEditor *PluginProcessor::createEditor() { return nullptr; }
bool PluginProcessor::hasEditor() const { return false; }
const juce::String PluginProcessor::getName() const { return "bw-brain"; }
bool PluginProcessor::acceptsMidi() const { return true; }
bool PluginProcessor::producesMidi() const { return true; }
bool PluginProcessor::isMidiEffect() const { return false; }
double PluginProcessor::getTailLengthSeconds() const { return 0.0; }
int PluginProcessor::getNumPrograms() { return 1; }
int PluginProcessor::getCurrentProgram() { return 0; }
void PluginProcessor::setCurrentProgram(int) {}
const juce::String PluginProcessor::getProgramName(int) { return {}; }
void PluginProcessor::changeProgramName(int, const juce::String &) {}
void PluginProcessor::getStateInformation(juce::MemoryBlock &destinationData) { destinationData.reset(); }
void PluginProcessor::setStateInformation(const void *, int) {}

} // namespace bw

juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() { return new bw::PluginProcessor(); }
