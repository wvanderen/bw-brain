#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace bw::identity {

struct MusicalSettings final {
  float generatedMix = 0.0F;
};

// Instance-local persisted state only. Project identity, controller links,
// conversation, focus, fork lineage, and history remain daemon-owned.
class InstanceState final {
 public:
  static constexpr std::uint16_t kCurrentVersion = 1;
  static constexpr std::size_t kMaxInstanceIdBytes = 64;
  static constexpr std::size_t kMaxStateBytes = 65'536;

  InstanceState() = default;
  explicit InstanceState(std::string daemonMintedInstanceId,
                         MusicalSettings settings = {});

  [[nodiscard]] const std::string& instanceId() const noexcept;
  [[nodiscard]] const MusicalSettings& settings() const noexcept;
  [[nodiscard]] bool isDirty() const noexcept;

  // Called by the non-real-time peer worker after a validated
  // instance.rekey command. The old ID comparison prevents stale commands.
  bool applyDaemonRekey(std::string_view expectedOldInstanceId,
                        std::string newDaemonMintedInstanceId);
  bool setMusicalSettings(MusicalSettings settings) noexcept;
  void clearDirty() noexcept;

  [[nodiscard]] std::vector<std::uint8_t> serialize() const;
  bool deserialize(std::span<const std::uint8_t> bytes);

 private:
  static bool isValidInstanceId(std::string_view value) noexcept;
  static bool areValidSettings(const MusicalSettings& value) noexcept;

  std::string instanceId_;
  MusicalSettings settings_{};
  bool dirty_ = false;
};

}  // namespace bw::identity
