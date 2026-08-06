#include "CapabilityProbeProcessor.h"

#include <array>
#include <cassert>
#include <cstring>
#include <vector>

using bwbrain::capability::CapabilityProbeProcessor;
using bwbrain::capability::MidiObservation;

template <typename Sample>
void provesBitIdenticalPassThrough() {
  CapabilityProbeProcessor processor;
  std::array<Sample, 5> left{Sample(-1), Sample(-0.25), Sample(0), Sample(0.5), Sample(1)};
  std::array<Sample, 5> right{Sample(0.75), Sample(0.25), Sample(0), Sample(-0.5), Sample(-0.75)};
  std::array<Sample, 5> outputLeft{};
  std::array<Sample, 5> outputRight{};
  processor.passThrough(left.data(), outputLeft.data(), left.size());
  processor.passThrough(right.data(), outputRight.data(), right.size());
  assert(std::memcmp(left.data(), outputLeft.data(), sizeof(left)) == 0);
  assert(std::memcmp(right.data(), outputRight.data(), sizeof(right)) == 0);
}

int main() {
  provesBitIdenticalPassThrough<float>();
  provesBitIdenticalPassThrough<double>();

  CapabilityProbeProcessor processor;
  const std::vector<MidiObservation> midi{{0, 0x90, 60, 100}, {31, 0x80, 60, 0}};
  assert(processor.observeMidi(midi) == midi);

  processor.setInstanceIdentity("capability-copy-seed");
  const auto state = processor.saveState();
  CapabilityProbeProcessor reopened;
  assert(reopened.loadState(state));
  assert(reopened.instanceIdentity() == "capability-copy-seed");
  CapabilityProbeProcessor copied;
  assert(copied.loadState(state));
  assert(copied.instanceIdentity() == reopened.instanceIdentity());

  const auto absent = processor.observeTrackInfo(nullptr);
  assert(!absent.available);
  assert(absent.name.empty());
  assert(absent.channelCount == 0);
}
