#include "identity/InstanceState.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

namespace {

int failures = 0;

void expect(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "FAIL: " << message << '\n';
    ++failures;
  }
}

void expectNear(float actual, float expected, const char* message) {
  expect(std::fabs(actual - expected) < 0.0001F, message);
}

}  // namespace

int main() {
  using bw::identity::InstanceState;
  using bw::identity::MusicalSettings;

  const MusicalSettings settings{.generatedMix = 0.625F};
  InstanceState original("daemon-minted-instance-1", settings);
  const auto saved = original.serialize();
  expect(!saved.empty(), "valid state serializes");
  expect(saved.size() <= InstanceState::kMaxStateBytes,
         "serialized state stays within the state byte cap");

  InstanceState reopened;
  expect(reopened.deserialize(saved), "saved state loads on reopen");
  expect(reopened.instanceId() == original.instanceId(),
         "reopen resumes the same daemon-minted instance ID");
  expectNear(reopened.settings().generatedMix, settings.generatedMix,
             "reopen restores musical settings");
  expect(!reopened.isDirty(), "loading host state does not mark it dirty");

  InstanceState duplicate;
  expect(duplicate.deserialize(saved), "copied host state loads");
  expect(duplicate.instanceId() == original.instanceId(),
         "copied state initially has the colliding ID");
  expect(!duplicate.applyDaemonRekey("different-old-id", "daemon-minted-instance-2"),
         "rekey refuses a stale old ID");
  expect(duplicate.applyDaemonRekey(original.instanceId(), "daemon-minted-instance-2"),
         "worker-side daemon rekey replaces the colliding ID");
  expect(duplicate.isDirty(), "successful rekey requests host state persistence");
  const auto rekeyed = duplicate.serialize();
  duplicate.clearDirty();
  InstanceState reopenedDuplicate;
  expect(reopenedDuplicate.deserialize(rekeyed), "rekeyed state reloads");
  expect(reopenedDuplicate.instanceId() == "daemon-minted-instance-2",
         "daemon-issued replacement persists");

  const std::string maximumId(InstanceState::kMaxInstanceIdBytes, 'a');
  InstanceState maximum(maximumId, MusicalSettings{.generatedMix = 1.0F});
  const auto maximumBytes = maximum.serialize();
  InstanceState maximumReloaded;
  expect(!maximumBytes.empty() && maximumReloaded.deserialize(maximumBytes),
         "schema-maximum instance ID round-trips");
  expect(maximumReloaded.instanceId() == maximumId,
         "maximum ID is not truncated");

  expect(InstanceState(std::string(InstanceState::kMaxInstanceIdBytes + 1U, 'a'), settings)
             .serialize()
             .empty(),
         "schema limit plus one refuses serialization");
  expect(InstanceState("track name with spaces", settings).serialize().empty(),
         "display names cannot become instance authority");

  InstanceState unchanged("safe-id", MusicalSettings{.generatedMix = 0.25F});
  const auto beforeId = unchanged.instanceId();
  const auto beforeMix = unchanged.settings().generatedMix;
  auto malformed = saved;
  malformed[0] ^= 0xFFU;
  expect(!unchanged.deserialize(malformed), "bad magic fails closed");
  expect(unchanged.instanceId() == beforeId &&
             unchanged.settings().generatedMix == beforeMix,
         "malformed state cannot partially replace current identity/settings");
  expect(!unchanged.deserialize(std::vector<std::uint8_t>(
             InstanceState::kMaxStateBytes + 1U, 0U)),
         "oversized state fails closed before parsing");

  const std::string serializedText(saved.begin(), saved.end());
  for (const char* forbidden : {"projectId", "session", "conversation", "history",
                                "trackName", "deviceName", "fork", "link"}) {
    expect(serializedText.find(forbidden) == std::string::npos,
           "state contains no project/session/link/name authority");
  }

  if (failures != 0) {
    std::cerr << failures << " assertion(s) failed\n";
    return 1;
  }
  std::cout << "instance state contract passed\n";
  return 0;
}
