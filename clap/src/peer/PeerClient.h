#pragma once
#include "rt/Aggregator.h"
#include <atomic>
#include <chrono>
#include <functional>
#include <string>
#include <thread>

namespace bw::peer {
class PeerClient {
public:
  using Send = std::function<bool(const std::string&, const std::string&)>;
  PeerClient(rt::Aggregator& source, std::string projectId, std::string instanceId, Send send);
  ~PeerClient();
  void accept(std::string connectionId);
  void disconnect() noexcept;
  bool connected() const noexcept { return connected_.load(std::memory_order_acquire); }
  bool pumpOnce();
  static bool encode(const rt::Snapshot&, const std::string&, const std::string&, std::string&);
private:
  void run();
  rt::Aggregator& source_; const std::string projectId_, instanceId_; Send send_;
  std::string connectionId_; std::atomic<bool> running_{true}, connected_{false}; std::thread worker_;
};
}
