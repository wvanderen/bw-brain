#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

namespace bw::peer {

class LoopbackTransport final {
 public:
  using ConnectionChanged = std::function<void(bool)>;
  using RekeyReceived = std::function<void(const std::string&, const std::string&)>;
  using OutboundMessage = std::function<bool(std::string&)>;
  using InboundMessage = std::function<void(const std::string&)>;

  LoopbackTransport(std::string instanceId, ConnectionChanged connectionChanged,
                    RekeyReceived rekeyReceived = {}, std::uint16_t port = 7879,
                    std::chrono::milliseconds retryDelay = std::chrono::milliseconds(250),
                    OutboundMessage outboundMessage = {}, InboundMessage inboundMessage = {});
  ~LoopbackTransport();

  LoopbackTransport(const LoopbackTransport&) = delete;
  LoopbackTransport& operator=(const LoopbackTransport&) = delete;

  bool setInstanceId(std::string instanceId);

 private:
  void run();
  bool connectAndServe();
  [[nodiscard]] std::string currentInstanceId() const;

  mutable std::mutex instanceIdMutex_;
  std::string instanceId_;
  ConnectionChanged connectionChanged_;
  RekeyReceived rekeyReceived_;
  std::uint16_t port_;
  std::chrono::milliseconds retryDelay_;
  OutboundMessage outboundMessage_;
  InboundMessage inboundMessage_;
  std::atomic<bool> running_{true};
  std::atomic<int> socket_{-1};
  std::thread worker_;
};

}  // namespace bw::peer
