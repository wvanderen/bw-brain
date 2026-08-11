#include "identity/InstanceState.h"

#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <limits>
#include <utility>

namespace bw::identity {
namespace {

constexpr std::array<std::uint8_t, 4> kMagic{'B', 'W', 'I', 'S'};
constexpr std::size_t kHeaderBytes = kMagic.size() + sizeof(std::uint16_t) +
                                     sizeof(std::uint32_t);
constexpr std::size_t kPayloadFixedBytes = sizeof(std::uint8_t) + sizeof(float);

void appendU16(std::vector<std::uint8_t>& output, std::uint16_t value) {
  output.push_back(static_cast<std::uint8_t>(value & 0xFFU));
  output.push_back(static_cast<std::uint8_t>((value >> 8U) & 0xFFU));
}

void appendU32(std::vector<std::uint8_t>& output, std::uint32_t value) {
  for (unsigned int shift = 0; shift < 32; shift += 8) {
    output.push_back(static_cast<std::uint8_t>((value >> shift) & 0xFFU));
  }
}

bool readU16(std::span<const std::uint8_t> bytes, std::size_t& offset,
             std::uint16_t& result) noexcept {
  if (offset > bytes.size() || bytes.size() - offset < sizeof(result)) {
    return false;
  }
  result = static_cast<std::uint16_t>(bytes[offset]) |
           static_cast<std::uint16_t>(bytes[offset + 1U] << 8U);
  offset += sizeof(result);
  return true;
}

bool readU32(std::span<const std::uint8_t> bytes, std::size_t& offset,
             std::uint32_t& result) noexcept {
  if (offset > bytes.size() || bytes.size() - offset < sizeof(result)) {
    return false;
  }
  result = 0;
  for (unsigned int shift = 0; shift < 32; shift += 8) {
    result |= static_cast<std::uint32_t>(bytes[offset++]) << shift;
  }
  return true;
}

}  // namespace

InstanceState::InstanceState(std::string daemonMintedInstanceId,
                             MusicalSettings settings)
    : instanceId_(std::move(daemonMintedInstanceId)), settings_(settings) {}

const std::string& InstanceState::instanceId() const noexcept {
  return instanceId_;
}

const MusicalSettings& InstanceState::settings() const noexcept {
  return settings_;
}

bool InstanceState::isDirty() const noexcept { return dirty_; }

bool InstanceState::applyDaemonRekey(std::string_view expectedOldInstanceId,
                                     std::string newDaemonMintedInstanceId) {
  if (expectedOldInstanceId != instanceId_ ||
      !isValidInstanceId(newDaemonMintedInstanceId) ||
      newDaemonMintedInstanceId == instanceId_) {
    return false;
  }
  instanceId_ = std::move(newDaemonMintedInstanceId);
  dirty_ = true;
  return true;
}

bool InstanceState::setMusicalSettings(MusicalSettings settings) noexcept {
  if (!areValidSettings(settings)) {
    return false;
  }
  if (std::bit_cast<std::uint32_t>(settings_.generatedMix) !=
      std::bit_cast<std::uint32_t>(settings.generatedMix)) {
    settings_ = settings;
    dirty_ = true;
  }
  return true;
}

void InstanceState::clearDirty() noexcept { dirty_ = false; }

std::vector<std::uint8_t> InstanceState::serialize() const {
  if (!isValidInstanceId(instanceId_) || !areValidSettings(settings_)) {
    return {};
  }

  const auto payloadBytes = kPayloadFixedBytes + instanceId_.size();
  const auto totalBytes = kHeaderBytes + payloadBytes;
  if (totalBytes > kMaxStateBytes ||
      payloadBytes > std::numeric_limits<std::uint32_t>::max()) {
    return {};
  }

  std::vector<std::uint8_t> output;
  output.reserve(totalBytes);
  output.insert(output.end(), kMagic.begin(), kMagic.end());
  appendU16(output, kCurrentVersion);
  appendU32(output, static_cast<std::uint32_t>(payloadBytes));
  output.push_back(static_cast<std::uint8_t>(instanceId_.size()));
  output.insert(output.end(), instanceId_.begin(), instanceId_.end());
  appendU32(output, std::bit_cast<std::uint32_t>(settings_.generatedMix));
  return output;
}

bool InstanceState::deserialize(std::span<const std::uint8_t> bytes) {
  if (bytes.size() > kMaxStateBytes || bytes.size() < kHeaderBytes) {
    return false;
  }

  if (!std::equal(kMagic.begin(), kMagic.end(), bytes.begin())) {
    return false;
  }

  std::size_t offset = kMagic.size();
  std::uint16_t version = 0;
  std::uint32_t payloadBytes = 0;
  if (!readU16(bytes, offset, version) || version != kCurrentVersion ||
      !readU32(bytes, offset, payloadBytes) ||
      payloadBytes != bytes.size() - kHeaderBytes || offset >= bytes.size()) {
    return false;
  }

  const auto idBytes = static_cast<std::size_t>(bytes[offset++]);
  if (idBytes == 0 || idBytes > kMaxInstanceIdBytes ||
      offset > bytes.size() || bytes.size() - offset != idBytes + sizeof(float)) {
    return false;
  }

  std::string candidateId(bytes.begin() + static_cast<std::ptrdiff_t>(offset),
                          bytes.begin() + static_cast<std::ptrdiff_t>(offset + idBytes));
  offset += idBytes;
  std::uint32_t mixBits = 0;
  if (!readU32(bytes, offset, mixBits) || offset != bytes.size()) {
    return false;
  }
  const MusicalSettings candidateSettings{
      .generatedMix = std::bit_cast<float>(mixBits)};
  if (!isValidInstanceId(candidateId) || !areValidSettings(candidateSettings)) {
    return false;
  }

  instanceId_ = std::move(candidateId);
  settings_ = candidateSettings;
  dirty_ = false;
  return true;
}

bool InstanceState::isValidInstanceId(std::string_view value) noexcept {
  if (value.empty() || value.size() > kMaxInstanceIdBytes) {
    return false;
  }
  for (const char rawCharacter : value) {
    const auto character = static_cast<unsigned char>(rawCharacter);
    const bool valid = (character >= 'A' && character <= 'Z') ||
                       (character >= 'a' && character <= 'z') ||
                       (character >= '0' && character <= '9') ||
                       character == '.' || character == '_' || character == ':' ||
                       character == '-';
    if (!valid) {
      return false;
    }
  }
  return true;
}

bool InstanceState::areValidSettings(const MusicalSettings& value) noexcept {
  return std::isfinite(value.generatedMix) && value.generatedMix >= 0.0F &&
         value.generatedMix <= 1.0F;
}

}  // namespace bw::identity
