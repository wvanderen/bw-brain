#include "CapabilityProbeProcessor.h"

#include <algorithm>
#include <array>

namespace bwbrain::capability {

std::vector<MidiObservation> CapabilityProbeProcessor::observeMidi(
    const std::vector<MidiObservation>& events) const {
  return events;
}

void CapabilityProbeProcessor::setInstanceIdentity(std::string identity) {
  instanceIdentity_ = std::move(identity);
}

const std::string& CapabilityProbeProcessor::instanceIdentity() const {
  return instanceIdentity_;
}

std::vector<std::byte> CapabilityProbeProcessor::saveState() const {
  constexpr std::string_view magic = "BWCP1:";
  std::vector<std::byte> state(magic.size() + instanceIdentity_.size());
  std::transform(magic.begin(), magic.end(), state.begin(),
                 [](char value) { return std::byte(static_cast<unsigned char>(value)); });
  std::transform(instanceIdentity_.begin(), instanceIdentity_.end(), state.begin() + magic.size(),
                 [](char value) { return std::byte(static_cast<unsigned char>(value)); });
  return state;
}

bool CapabilityProbeProcessor::loadState(const std::vector<std::byte>& state) {
  constexpr std::string_view magic = "BWCP1:";
  if (state.size() <= magic.size() || state.size() > 128) return false;
  for (std::size_t i = 0; i < magic.size(); ++i)
    if (state[i] != std::byte(static_cast<unsigned char>(magic[i]))) return false;
  instanceIdentity_.resize(state.size() - magic.size());
  std::transform(state.begin() + magic.size(), state.end(), instanceIdentity_.begin(),
                 [](std::byte value) { return static_cast<char>(value); });
  return true;
}

TrackInfoObservation CapabilityProbeProcessor::observeTrackInfo(const TrackInfoInput* info) const {
  if (!info) return {};
  return {true, std::string(info->name), info->channelCount};
}

}  // namespace bwbrain::capability
