#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <string>
#include <thread>

namespace bw::peer {

class LoopbackTransport final {
 public:
  using ConnectionChanged = std::function<void(bool)>;
  using RekeyReceived = std::function<void(const std::string&, const std::string&)>;

  LoopbackTransport(std::string instanceId, ConnectionChanged connectionChanged,
                    RekeyReceived rekeyReceived = {}, std::uint16_t port = 7879,
                    std::chrono::milliseconds retryDelay = std::chrono::milliseconds(250));
  ~LoopbackTransport();

  LoopbackTransport(const LoopbackTransport&) = delete;
  LoopbackTransport& operator=(const LoopbackTransport&) = delete;

 private:
  void run();
  bool connectAndServe();

  std::string instanceId_;
  ConnectionChanged connectionChanged_;
  RekeyReceived rekeyReceived_;
  std::uint16_t port_;
  std::chrono::milliseconds retryDelay_;
  std::atomic<bool> running_{true};
  std::atomic<int> socket_{-1};
  std::thread worker_;
};

}  // namespace bw::peer
