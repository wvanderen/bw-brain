#pragma once
#include <array>
#include <atomic>
#include <cstddef>
#include <type_traits>

namespace bw::rt {
template <typename T, std::size_t Capacity> class SpscQueue {
  static_assert(Capacity > 0 && std::is_trivially_copyable_v<T>);
  static_assert(std::atomic<std::size_t>::is_always_lock_free);
public:
  bool tryPush(const T& value) noexcept {
    auto write = write_.load(std::memory_order_relaxed);
    auto read = read_.load(std::memory_order_acquire);
    bool dropped = false;
    if (write - read == Capacity) {
      read_.store(read + 1, std::memory_order_release);
      dropped = true;
    }
    storage_[write % Capacity] = value;
    write_.store(write + 1, std::memory_order_release);
    return !dropped;
  }
  bool tryPushStrict(const T& value) noexcept {
    const auto write = write_.load(std::memory_order_relaxed);
    const auto read = read_.load(std::memory_order_acquire);
    if (write - read == Capacity) return false;
    storage_[write % Capacity] = value;
    write_.store(write + 1, std::memory_order_release);
    return true;
  }
  bool tryPop(T& value) noexcept {
    const auto read = read_.load(std::memory_order_relaxed);
    const auto write = write_.load(std::memory_order_acquire);
    if (read == write) return false;
    value = storage_[read % Capacity];
    read_.store(read + 1, std::memory_order_release);
    return true;
  }
  static constexpr std::size_t capacity() noexcept { return Capacity; }
private:
  std::array<T, Capacity> storage_{};
  alignas(64) std::atomic<std::size_t> write_{0};
  alignas(64) std::atomic<std::size_t> read_{0};
};
}
