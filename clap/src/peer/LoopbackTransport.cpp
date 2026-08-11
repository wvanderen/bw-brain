#include "peer/LoopbackTransport.h"

#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <netinet/in.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <string_view>

namespace bw::peer {
namespace {

constexpr std::size_t kMaxLineBytes = 65'536;

bool validId(std::string_view value) {
  if (value.empty() || value.size() > 64) return false;
  return std::all_of(value.begin(), value.end(), [](const char raw) {
    const auto c = static_cast<unsigned char>(raw);
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
           (c >= '0' && c <= '9') || c == '.' || c == '_' || c == ':' || c == '-';
  });
}

std::string jsonString(std::string_view line, std::string_view key) {
  const std::string marker = "\"" + std::string(key) + "\":\"";
  const auto begin = line.find(marker);
  if (begin == std::string_view::npos) return {};
  const auto valueBegin = begin + marker.size();
  const auto end = line.find('"', valueBegin);
  if (end == std::string_view::npos) return {};
  return std::string(line.substr(valueBegin, end - valueBegin));
}

bool sendAll(int socket, std::string_view bytes) {
  while (!bytes.empty()) {
#if defined(MSG_NOSIGNAL)
    const auto sent = ::send(socket, bytes.data(), bytes.size(), MSG_NOSIGNAL);
#else
    const auto sent = ::send(socket, bytes.data(), bytes.size(), 0);
#endif
    if (sent > 0) {
      bytes.remove_prefix(static_cast<std::size_t>(sent));
      continue;
    }
    if (sent < 0 && errno == EINTR) continue;
    return false;
  }
  return true;
}

}  // namespace

LoopbackTransport::LoopbackTransport(std::string instanceId,
                                     ConnectionChanged connectionChanged,
                                     RekeyReceived rekeyReceived,
                                     std::uint16_t port,
                                     std::chrono::milliseconds retryDelay)
    : instanceId_(std::move(instanceId)),
      connectionChanged_(std::move(connectionChanged)),
      rekeyReceived_(std::move(rekeyReceived)),
      port_(port),
      retryDelay_(retryDelay),
      worker_([this] { run(); }) {}

LoopbackTransport::~LoopbackTransport() {
  running_.store(false, std::memory_order_release);
  const int socket = socket_.exchange(-1, std::memory_order_acq_rel);
  if (socket >= 0) ::shutdown(socket, SHUT_RDWR);
  if (worker_.joinable()) worker_.join();
  if (socket >= 0) ::close(socket);
}

void LoopbackTransport::run() {
  while (running_.load(std::memory_order_acquire)) {
    connectAndServe();
    if (running_.load(std::memory_order_acquire)) std::this_thread::sleep_for(retryDelay_);
  }
}

bool LoopbackTransport::connectAndServe() {
  const int socket = ::socket(AF_INET, SOCK_STREAM, 0);
  if (socket < 0) return false;
  socket_.store(socket, std::memory_order_release);
#if defined(SO_NOSIGPIPE)
  int enabled = 1;
  ::setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &enabled, sizeof(enabled));
#endif
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(port_);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (::connect(socket, reinterpret_cast<const sockaddr*>(&address), sizeof(address)) != 0) {
    if (socket_.exchange(-1, std::memory_order_acq_rel) == socket) ::close(socket);
    return false;
  }

  const std::string hello =
      "{\"type\":\"clap.hello\",\"protocol\":\"1.0\",\"instanceId\":\"" + instanceId_ +
      "\",\"capabilities\":[\"telemetry.snapshot\"],\"limits\":{\"maxLineBytes\":65536,"
      "\"maxQueueMessages\":32,\"maxQueueBytes\":262144}}\n";
  if (!validId(instanceId_) || !sendAll(socket, hello)) {
    if (socket_.exchange(-1, std::memory_order_acq_rel) == socket) ::close(socket);
    return false;
  }

  bool accepted = false;
  bool rekeyed = false;
  std::string input;
  input.reserve(4096);
  while (running_.load(std::memory_order_acquire)) {
    fd_set readable;
    FD_ZERO(&readable);
    FD_SET(socket, &readable);
    timeval timeout{0, 100'000};
    const int ready = ::select(socket + 1, &readable, nullptr, nullptr, &timeout);
    if (ready < 0 && errno == EINTR) continue;
    if (ready <= 0) {
      if (ready < 0) break;
      continue;
    }
    char chunk[4096];
    const auto received = ::recv(socket, chunk, sizeof(chunk), 0);
    if (received <= 0) break;
    input.append(chunk, static_cast<std::size_t>(received));
    if (input.size() > kMaxLineBytes && input.find('\n') == std::string::npos) break;
    std::size_t newline = 0;
    while ((newline = input.find('\n')) != std::string::npos) {
      std::string line = input.substr(0, newline);
      input.erase(0, newline + 1);
      if (!line.empty() && line.back() == '\r') line.pop_back();
      if (line.size() > kMaxLineBytes) break;
      const auto type = jsonString(line, "type");
      if (type == "clap.accept") {
        const auto acceptedId = jsonString(line, "instanceId");
        const auto connectionId = jsonString(line, "connectionId");
        if (acceptedId == instanceId_ && validId(connectionId) && !accepted) {
          accepted = true;
          if (connectionChanged_) connectionChanged_(true);
        }
      } else if (type == "instance.rekey" && rekeyReceived_) {
        const auto oldId = jsonString(line, "oldInstanceId");
        const auto newId = jsonString(line, "newInstanceId");
        if (oldId == instanceId_ && validId(newId)) {
          rekeyReceived_(oldId, newId);
          instanceId_ = newId;
          rekeyed = true;
          break;
        }
      }
    }
    if (rekeyed) break;
  }
  if (accepted && connectionChanged_) connectionChanged_(false);
  if (socket_.exchange(-1, std::memory_order_acq_rel) == socket) ::close(socket);
  return accepted;
}

}  // namespace bw::peer
