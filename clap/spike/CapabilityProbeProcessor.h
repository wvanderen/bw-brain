#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace bwbrain::capability {

enum class ParameterCategory { ReadOnlyStatus, MomentaryAction, AutomatableMusical };
struct ParameterCandidate {
  std::uint32_t id{};
  std::string_view name;
  ParameterCategory category{};
  bool readOnly{};
  bool automatable{};
};

struct MidiObservation {
  std::uint32_t sampleOffset{};
  std::uint8_t status{};
  std::uint8_t data1{};
  std::uint8_t data2{};
  bool operator==(const MidiObservation&) const = default;
};

struct TrackInfoInput {
  std::string_view name;
  std::uint32_t channelCount{};
};

struct TrackInfoObservation {
  bool available{};
  std::string name;
  std::uint32_t channelCount{};
};

class CapabilityProbeProcessor {
 public:
  [[nodiscard]] static const std::vector<ParameterCandidate>& parameterCandidates();
  template <typename Sample>
  void passThrough(const Sample* input, Sample* output, std::size_t count) const {
    if (input == output) return;
    for (std::size_t i = 0; i < count; ++i) output[i] = input[i];
  }

  [[nodiscard]] std::vector<MidiObservation>
  observeMidi(const std::vector<MidiObservation>& events) const;
  void setInstanceIdentity(std::string identity);
  [[nodiscard]] const std::string& instanceIdentity() const;
  [[nodiscard]] std::vector<std::byte> saveState() const;
  bool loadState(const std::vector<std::byte>& state);
  [[nodiscard]] TrackInfoObservation observeTrackInfo(const TrackInfoInput* info) const;

 private:
  std::string instanceIdentity_{"capability-probe-unset"};
};

}  // namespace bwbrain::capability
