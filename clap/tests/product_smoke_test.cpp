#include "PluginProcessor.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <cassert>
#include <cmath>

namespace {

template <typename Sample>
void assertAudioAndMidiRemainTransparent() {
  bw::PluginProcessor processor;
  processor.setPlayConfigDetails(2, 2, 48'000.0, 16);
  processor.prepareToPlay(48'000.0, 16);

  juce::AudioBuffer<Sample> buffer(2, 16);
  for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
      buffer.setSample(channel, sample,
                       static_cast<Sample>((channel + 1) * 0.1 + sample * 0.01));
    }
  }

  std::array<std::array<Sample, 16>, 2> before{};
  for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
      before[static_cast<std::size_t>(channel)][static_cast<std::size_t>(sample)] =
          buffer.getSample(channel, sample);
    }
  }

  juce::MidiBuffer midi;
  const auto noteOn = juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100));
  midi.addEvent(noteOn, 7);

  processor.processBlock(buffer, midi);

  for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
      assert(buffer.getSample(channel, sample) ==
             before[static_cast<std::size_t>(channel)][static_cast<std::size_t>(sample)]);
    }
  }

  int eventCount = 0;
  for (const auto metadata : midi) {
    ++eventCount;
    assert(metadata.samplePosition == 7);
    assert(metadata.getMessage() == noteOn);
  }
  assert(eventCount == 1);
}

} // namespace

int main() {
  assertAudioAndMidiRemainTransparent<float>();
  assertAudioAndMidiRemainTransparent<double>();
  return 0;
}
