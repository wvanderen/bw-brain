#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "rt/Aggregator.h"

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
  rt::Aggregator& telemetry() noexcept { return telemetry_; }

private:
  template <typename Sample>
  void processTransparent(juce::AudioBuffer<Sample> &audio, juce::MidiBuffer &midi) noexcept {
    std::array<const Sample*, 2> pointers{};
    const int channels = juce::jmin(2, audio.getNumChannels());
    for (int c=0;c<channels;c++) pointers[c]=audio.getReadPointer(c);
    for (const auto metadata : midi) {
      const auto message=metadata.getMessage();
      if (message.isNoteOnOrOff()) telemetry_.note(static_cast<uint32_t>(metadata.samplePosition),0,static_cast<uint8_t>(message.getChannel()-1),static_cast<uint8_t>(message.getNoteNumber()),static_cast<uint8_t>(message.getVelocity()),message.isNoteOn());
    }
    telemetry_.process(pointers.data(), channels, audio.getNumSamples());
  }
  rt::Aggregator telemetry_{};
};

} // namespace bw
