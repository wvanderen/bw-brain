#include "PluginProcessor.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>
#include <cstring>
#include <cstdlib>

namespace {

void require(const bool condition) {
  if (!condition) {
    std::abort();
  }
}

template <typename Sample>
bool bitEqual(const Sample left, const Sample right) {
  return std::memcmp(&left, &right, sizeof(Sample)) == 0;
}

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
      require(bitEqual(
          buffer.getSample(channel, sample),
          before[static_cast<std::size_t>(channel)][static_cast<std::size_t>(sample)]));
    }
  }

  int eventCount = 0;
  for (const auto metadata : midi) {
    ++eventCount;
    require(metadata.samplePosition == 7);
    const auto message = metadata.getMessage();
    require(message.getRawDataSize() == noteOn.getRawDataSize());
    require(std::memcmp(message.getRawData(), noteOn.getRawData(),
                        static_cast<std::size_t>(noteOn.getRawDataSize())) == 0);
  }
  require(eventCount == 1);
}

} // namespace

int main() {
  assertAudioAndMidiRemainTransparent<float>();
  assertAudioAndMidiRemainTransparent<double>();
  return 0;
}
