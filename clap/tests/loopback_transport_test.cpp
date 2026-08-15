#include "peer/LoopbackTransport.h"

#include <arpa/inet.h>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <deque>
#include <iostream>
#include <mutex>
#include <string>
#include <vector>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

using namespace std::chrono_literals;

namespace {
void require(const bool condition, const char* message) {
  if (!condition) {
    std::cerr << message << '\n';
    std::abort();
  }
}

std::string readLine(const int socket) {
  std::string line;
  char byte{};
  while (::recv(socket, &byte, 1, 0) == 1 && byte != '\n') line.push_back(byte);
  return line;
}
}

int main() {
  const int listener = ::socket(AF_INET, SOCK_STREAM, 0);
  require(listener >= 0, "failed to create test listener");
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  address.sin_port = 0;
  require(::bind(listener, reinterpret_cast<const sockaddr*>(&address), sizeof(address)) == 0,
          "failed to bind test listener");
  require(::listen(listener, 2) == 0, "failed to listen for test peers");
  socklen_t size = sizeof(address);
  require(::getsockname(listener, reinterpret_cast<sockaddr*>(&address), &size) == 0,
          "failed to read test listener address");

  std::mutex mutex;
  std::condition_variable changed;
  int connections = 0;
  int disconnections = 0;
  std::vector<std::string> hellos;
  std::vector<std::string> peerActions;
  std::vector<std::string> daemonMessages;
  std::deque<std::string> outbound;
  bool requestQueued = false;
  std::thread server([&] {
    for (int attempt = 0; attempt < 2; ++attempt) {
      const int client = ::accept(listener, nullptr, nullptr);
      require(client >= 0, "failed to accept transport connection");
      const std::string hello = readLine(client);
      hellos.push_back(hello);
      const std::string acceptedInstanceId =
          attempt == 0 ? "inst-local" : "inst-restored";
      const std::string accept =
          "{\"type\":\"clap.accept\",\"connectionId\":\"conn-test\","
          "\"instanceId\":\"" + acceptedInstanceId + "\"}\n";
      require(::send(client, accept.data(), accept.size(), 0) ==
                  static_cast<ssize_t>(accept.size()),
              "failed to send clap.accept");
      if (attempt == 0) {
        peerActions.push_back(readLine(client));
        const std::string pending =
            "{\"type\":\"link.confirm.pending\",\"nonce\":\"nonce-1\",\"scope\":{"
            "\"projectId\":\"project-1\",\"instanceId\":\"inst-local\","
            "\"trackSid\":\"trk_0123456789abcdef\",\"trackHint\":\"Bass 2\"}}\n";
        require(::send(client, pending.data(), pending.size(), 0) ==
                    static_cast<ssize_t>(pending.size()),
                "failed to send link confirmation pending");
        peerActions.push_back(readLine(client));
        const std::string confirmed =
            "{\"type\":\"link.status\",\"status\":\"confirmed\",\"scope\":{"
            "\"projectId\":\"project-1\",\"instanceId\":\"inst-local\","
            "\"trackSid\":\"trk_0123456789abcdef\",\"trackHint\":\"Bass 2\"}}\n";
        require(::send(client, confirmed.data(), confirmed.size(), 0) ==
                    static_cast<ssize_t>(confirmed.size()),
                "failed to send confirmed link status");
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
    require(changed.wait_for(lock, 3s, [&] {
      return connections >= 1 && daemonMessages.size() >= 2;
    }), "initial accepted connection did not complete identity message flow");
    lock.unlock();
    require(transport.setInstanceId("inst-restored"),
            "transport refused a valid restored instance ID");
    lock.lock();
    require(changed.wait_for(lock, 3s, [&] {
      return connections >= 2 && disconnections >= 1;
    }), "identity rebind did not disconnect and reconnect the transport");
  }
  ::close(listener);
  server.join();
  require(hellos.size() == 2, "transport did not send exactly two hellos");
  require(hellos[0].find("\"type\":\"clap.hello\"") != std::string::npos,
          "initial hello type missing");
  require(hellos[0].find("\"protocol\":\"1.0\"") != std::string::npos,
          "initial hello protocol missing");
  require(hellos[0].find("\"instanceId\":\"inst-local\"") != std::string::npos,
          "initial hello identity mismatch");
  require(hellos[0].find("identity.link") != std::string::npos,
          "initial hello capability missing");
  require(hellos[0].size() <= 65'536, "initial hello exceeds line bound");
  require(hellos[1].find("\"instanceId\":\"inst-restored\"") != std::string::npos,
          "reconnected hello did not use the restored instance ID");
  require(peerActions.size() == 2, "transport did not send both peer actions");
  require(peerActions[0] == "{\"type\":\"link.confirm.request\"}",
          "link confirmation request mismatch");
  require(peerActions[1] == "{\"type\":\"link.confirm.accept\",\"nonce\":\"nonce-1\"}",
          "link confirmation accept mismatch");
  require(daemonMessages[0].find("link.confirm.pending") != std::string::npos,
          "pending daemon message missing");
  require(daemonMessages[1].find("link.status") != std::string::npos,
          "confirmed daemon message missing");
}
