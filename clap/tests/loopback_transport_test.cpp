#include "peer/LoopbackTransport.h"

#include <arpa/inet.h>
#include <cassert>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <string>
#include <vector>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

using namespace std::chrono_literals;

namespace {
std::string readLine(const int socket) {
  std::string line;
  char byte{};
  while (::recv(socket, &byte, 1, 0) == 1 && byte != '\n') line.push_back(byte);
  return line;
}
}

int main() {
  const int listener = ::socket(AF_INET, SOCK_STREAM, 0);
  assert(listener >= 0);
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = 0;
  assert(::bind(listener, reinterpret_cast<const sockaddr*>(&address), sizeof(address)) == 0);
  assert(::listen(listener, 2) == 0);
  socklen_t size = sizeof(address);
  assert(::getsockname(listener, reinterpret_cast<sockaddr*>(&address), &size) == 0);

  std::mutex mutex;
  std::condition_variable changed;
  int connections = 0;
  int disconnections = 0;
  std::string firstHello;
  std::vector<std::string> peerActions;
  std::vector<std::string> daemonMessages;
  std::deque<std::string> outbound;
  bool requestQueued = false;
  std::thread server([&] {
    for (int attempt = 0; attempt < 2; ++attempt) {
      const int client = ::accept(listener, nullptr, nullptr);
      assert(client >= 0);
      const std::string hello = readLine(client);
      if (attempt == 0) firstHello = hello;
      const std::string accept =
          "{\"type\":\"clap.accept\",\"connectionId\":\"conn-test\","
          "\"instanceId\":\"inst-local\"}\n";
      assert(::send(client, accept.data(), accept.size(), 0) == static_cast<ssize_t>(accept.size()));
      if (attempt == 0) {
        peerActions.push_back(readLine(client));
        const std::string pending =
            "{\"type\":\"link.confirm.pending\",\"nonce\":\"nonce-1\",\"scope\":{"
            "\"projectId\":\"project-1\",\"instanceId\":\"inst-local\","
            "\"trackSid\":\"trk_0123456789abcdef\",\"trackHint\":\"Bass 2\"}}\n";
        assert(::send(client, pending.data(), pending.size(), 0) == static_cast<ssize_t>(pending.size()));
        peerActions.push_back(readLine(client));
        const std::string confirmed =
            "{\"type\":\"link.status\",\"status\":\"confirmed\",\"scope\":{"
            "\"projectId\":\"project-1\",\"instanceId\":\"inst-local\","
            "\"trackSid\":\"trk_0123456789abcdef\",\"trackHint\":\"Bass 2\"}}\n";
        assert(::send(client, confirmed.data(), confirmed.size(), 0) == static_cast<ssize_t>(confirmed.size()));
      }
      std::this_thread::sleep_for(30ms);
      ::shutdown(client, SHUT_RDWR);
      ::close(client);
    }
  });

  {
    bw::peer::LoopbackTransport transport(
        "inst-local",
        [&](bool connected) {
          std::lock_guard lock(mutex);
          if (connected) {
            ++connections;
            if (!requestQueued) {
              outbound.push_back("{\"type\":\"link.confirm.request\"}");
              requestQueued = true;
            }
          } else {
            ++disconnections;
          }
          changed.notify_all();
        },
        {}, ntohs(address.sin_port), 10ms,
        [&](std::string& message) {
          std::lock_guard lock(mutex);
          if (outbound.empty()) return false;
          message = std::move(outbound.front());
          outbound.pop_front();
          return true;
        },
        [&](const std::string& message) {
          std::lock_guard lock(mutex);
          daemonMessages.push_back(message);
          if (message.find("\"type\":\"link.confirm.pending\"") != std::string::npos) {
            outbound.push_back("{\"type\":\"link.confirm.accept\",\"nonce\":\"nonce-1\"}");
          }
          changed.notify_all();
        });
    std::unique_lock lock(mutex);
    assert(changed.wait_for(lock, 3s, [&] { return connections >= 2 && disconnections >= 1 && daemonMessages.size() >= 2; }));
  }
  ::close(listener);
  server.join();
  assert(firstHello.find("\"type\":\"clap.hello\"") != std::string::npos);
  assert(firstHello.find("\"protocol\":\"1.0\"") != std::string::npos);
  assert(firstHello.find("\"instanceId\":\"inst-local\"") != std::string::npos);
  assert(firstHello.find("identity.link") != std::string::npos);
  assert(firstHello.size() <= 65'536);
  assert(peerActions.size() == 2);
  assert(peerActions[0] == "{\"type\":\"link.confirm.request\"}");
  assert(peerActions[1] == "{\"type\":\"link.confirm.accept\",\"nonce\":\"nonce-1\"}");
  assert(daemonMessages[0].find("link.confirm.pending") != std::string::npos);
  assert(daemonMessages[1].find("link.status") != std::string::npos);
}
