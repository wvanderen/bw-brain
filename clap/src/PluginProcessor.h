#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

namespace bw {

class PluginProcessor final : public juce::AudioProcessor {
public:
  PluginProcessor();

  void prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock) override;
  void releaseResources() override;
  bool isBusesLayoutSupported(const BusesLayout &layouts) const override;
  void processBlock(juce::AudioBuffer<float> &audio, juce::MidiBuffer &midi) override;
  void processBlock(juce::AudioBuffer<double> &audio, juce::MidiBuffer &midi) override;

  juce::AudioProcessorEditor *createEditor() override;
  bool hasEditor() const override;
  const juce::String getName() const override;
  bool acceptsMidi() const override;
  bool producesMidi() const override;
  bool isMidiEffect() const override;
  double getTailLengthSeconds() const override;
  int getNumPrograms() override;
  int getCurrentProgram() override;
  void setCurrentProgram(int index) override;
  const juce::String getProgramName(int index) override;
  void changeProgramName(int index, const juce::String &name) override;
  void getStateInformation(juce::MemoryBlock &destinationData) override;
  void setStateInformation(const void *data, int sizeInBytes) override;

private:
  template <typename Sample>
  static void processTransparent(juce::AudioBuffer<Sample> &, juce::MidiBuffer &) noexcept {}
};

} // namespace bw
