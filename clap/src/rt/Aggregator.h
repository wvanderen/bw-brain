#pragma once
#include "SpscQueue.h"
#include <array>
#include <cstdint>

namespace bw::rt {
struct RecentNote { uint32_t offset{}; uint8_t port{}, channel{}, key{}, velocity{}, kind{}; };
struct Snapshot {
  uint32_t sequence{}, droppedSnapshots{};
  uint8_t channels{}, recentNoteCount{};
  std::array<float,2> rms{}, peak{};
  float noteDensity{};
  std::array<uint16_t,12> pitchClass{};
  std::array<uint16_t,8> velocityBins{};
  std::array<uint16_t,16> rhythmBins{};
  bool playing{}; float tempo{120}; uint8_t numerator{4}, denominator{4};
  std::array<RecentNote,16> recentNotes{};
};
class Aggregator {
public:
  static constexpr uint32_t kPublishBlocks = 8;
  template<typename Sample> void process(const Sample* const* channels, int channelCount, int samples) noexcept {
    const int boundedChannels = channelCount < 2 ? channelCount : 2;
    for (int c=0;c<boundedChannels;c++) for (int i=0;i<samples;i++) {
      const auto value = static_cast<double>(channels[c][i]);
      sums_[c] += value * value; const auto magnitude = value < 0 ? -value : value;
      if (magnitude > peaks_[c]) peaks_[c] = magnitude;
    }
    sampleCount_ += static_cast<uint32_t>(samples);
    channels_ = static_cast<uint8_t>(boundedChannels);
    if (++blocks_ >= kPublishBlocks) publish();
  }
  void note(uint32_t offset, uint8_t port, uint8_t channel, uint8_t key, uint8_t velocity, bool on) noexcept;
  void transport(bool playing, float tempo, uint8_t numerator, uint8_t denominator) noexcept;
  bool tryPop(Snapshot& snapshot) noexcept { return queue_.tryPop(snapshot); }
private:
  void publish() noexcept;
  SpscQueue<Snapshot,4> queue_{};
  std::array<double,2> sums_{}, peaks_{}; uint32_t sampleCount_{}, blocks_{}, sequence_{}, dropped_{}; uint8_t channels_{};
  std::array<uint16_t,12> pitch_{}; std::array<uint16_t,8> velocity_{}; std::array<uint16_t,16> rhythm_{};
  std::array<RecentNote,16> notes_{}; uint8_t noteCount_{}; uint32_t noteTotal_{};
  bool playing_{}; float tempo_{120}; uint8_t numerator_{4}, denominator_{4};
};
}
