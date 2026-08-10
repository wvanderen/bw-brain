#pragma once

#include <atomic>
#include <cstdint>
#include <string>
#include <vector>

namespace bwbrain::capability {

struct MidiOffsetSnapshot {
  std::uint32_t receivedOffset{};
  std::uint32_t forwardedOffset{};
  std::uint32_t observationCount{};
  bool pushSucceeded{};
};

class MidiOffsetMeasurement {
 public:
  void publish(std::uint32_t receivedOffset, bool pushSucceeded) noexcept {
    sequence_.fetch_add(1U, std::memory_order_acq_rel);
    receivedOffset_.store(receivedOffset, std::memory_order_relaxed);
    forwardedOffset_.store(pushSucceeded ? receivedOffset : 0U, std::memory_order_relaxed);
    pushSucceeded_.store(pushSucceeded ? 1U : 0U, std::memory_order_relaxed);
    observationCount_.fetch_add(1U, std::memory_order_relaxed);
    sequence_.fetch_add(1U, std::memory_order_release);
  }

  [[nodiscard]] bool read(MidiOffsetSnapshot& snapshot) const noexcept {
    for (int attempt = 0; attempt < 3; ++attempt) {
      const auto before = sequence_.load(std::memory_order_acquire);
      if ((before & 1U) != 0U) continue;
      MidiOffsetSnapshot candidate{
          receivedOffset_.load(std::memory_order_relaxed),
          forwardedOffset_.load(std::memory_order_relaxed),
          observationCount_.load(std::memory_order_relaxed),
          pushSucceeded_.load(std::memory_order_relaxed) != 0U};
      const auto after = sequence_.load(std::memory_order_acquire);
      if (before == after) {
        snapshot = candidate;
        return true;
      }
    }
    return false;
  }

 private:
  std::atomic<std::uint32_t> sequence_{};
  std::atomic<std::uint32_t> receivedOffset_{};
  std::atomic<std::uint32_t> forwardedOffset_{};
  std::atomic<std::uint32_t> observationCount_{};
  std::atomic<std::uint32_t> pushSucceeded_{};
};

static_assert(std::atomic<std::uint32_t>::is_always_lock_free,
              "MIDI offset measurement requires always-lock-free 32-bit atomics");

enum class EditorEvent { Created, Shown, Resized, Hidden, Destroyed };

class CapabilityProbeEditor {
 public:
  explicit CapabilityProbeEditor(const MidiOffsetMeasurement* measurement = nullptr)
      : measurement_(measurement) {}
  ~CapabilityProbeEditor();
  bool create(std::string api);
  bool setParent(void* parent);
  bool show();
  bool resize(std::uint32_t width, std::uint32_t height);
  bool hide();
  void destroy();
  [[nodiscard]] const std::vector<EditorEvent>& events() const;
  [[nodiscard]] std::uint32_t lastWidth() const;
  [[nodiscard]] std::uint32_t lastHeight() const;
  [[nodiscard]] bool isAttached() const;

 private:
  bool created_{};
  bool visible_{};
  std::uint32_t width_{480};
  std::uint32_t height_{240};
  void* nativeView_{};
  const MidiOffsetMeasurement* measurement_{};
  std::vector<EditorEvent> events_;
};

}  // namespace bwbrain::capability
