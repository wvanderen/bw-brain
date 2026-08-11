#include "peer/LoopbackTransport.h"

#include <arpa/inet.h>
#include <cassert>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <string>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>

using namespace std::chrono_literals;

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
  std::thread server([&] {
    for (int attempt = 0; attempt < 2; ++attempt) {
      const int client = ::accept(listener, nullptr, nullptr);
      assert(client >= 0);
      std::string hello;
      char byte{};
      while (::recv(client, &byte, 1, 0) == 1 && byte != '\n') hello.push_back(byte);
      if (attempt == 0) firstHello = hello;
      const std::string accept =
          "{\"type\":\"clap.accept\",\"connectionId\":\"conn-test\","
          "\"instanceId\":\"inst-local\"}\n";
      assert(::send(client, accept.data(), accept.size(), 0) == static_cast<ssize_t>(accept.size()));
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
          connected ? ++connections : ++disconnections;
          changed.notify_all();
        },
        {}, ntohs(address.sin_port), 10ms);
    std::unique_lock lock(mutex);
    assert(changed.wait_for(lock, 3s, [&] { return connections >= 2 && disconnections >= 1; }));
  }
  ::close(listener);
  server.join();
  assert(firstHello.find("\"type\":\"clap.hello\"") != std::string::npos);
  assert(firstHello.find("\"protocol\":\"1.0\"") != std::string::npos);
  assert(firstHello.find("\"instanceId\":\"inst-local\"") != std::string::npos);
  assert(firstHello.size() <= 65'536);
}
