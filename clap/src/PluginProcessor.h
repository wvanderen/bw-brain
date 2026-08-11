#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "rt/Aggregator.h"
#include "rt/PhraseScheduler.h"
#include "rt/OwnedNoteLedger.h"
#include "rt/SpscQueue.h"
#include <atomic>

namespace bw {

class PluginProcessor final : public juce::AudioProcessor {
public:
  PluginProcessor();

  void prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock) override;
  void releaseResources() override;
  void reset() override;
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
  bool armPhrase(const rt::ArmedPhrase&) noexcept;
  void stopGenerated() noexcept;
  void disconnectGenerated() noexcept;
  bool generationArmed() const noexcept { return generationArmed_.load(std::memory_order_acquire); }
  std::size_t ownedGeneratedNotes() const noexcept { return ledger_.size(); }
  void setTestTransport(const rt::TransportBlock& transport) noexcept { testTransport_=transport; useTestTransport_=true; }
  void clearTestTransport() noexcept { useTestTransport_=false; }
  void setTestOutputCapacity(std::size_t capacity) noexcept { outputCapacity_=capacity; }

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
    processGeneration(midi,static_cast<uint32_t>(audio.getNumSamples()));
  }
  enum class CommandKind:uint8_t{arm,disarm}; struct Command{CommandKind kind{};rt::ArmedPhrase phrase{};};
  void requestDisarm() noexcept;
  void processGeneration(juce::MidiBuffer&,uint32_t) noexcept;
  rt::TransportBlock currentTransport(uint32_t) noexcept;
  rt::Aggregator telemetry_{};
  rt::SpscQueue<Command,8> commands_{};
  rt::PhraseScheduler scheduler_{};
  rt::OwnedNoteLedger ledger_{};
  std::atomic<bool> generationArmed_{false};
  std::atomic<bool> disarmRequested_{false};
  rt::TransportBlock testTransport_{}; bool useTestTransport_{};
  rt::TransportBlock previousTransport_{}; bool havePreviousTransport_{};
  std::size_t outputCapacity_{rt::kMaxEventsPerBlock};
};

} // namespace bw
