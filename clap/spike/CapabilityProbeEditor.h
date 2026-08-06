#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace bwbrain::capability {

enum class EditorEvent { Created, Shown, Resized, Hidden, Destroyed };

class CapabilityProbeEditor {
 public:
  bool create(std::string api);
  bool show();
  bool resize(std::uint32_t width, std::uint32_t height);
  bool hide();
  void destroy();
  [[nodiscard]] const std::vector<EditorEvent>& events() const;
  [[nodiscard]] std::uint32_t lastWidth() const;
  [[nodiscard]] std::uint32_t lastHeight() const;

 private:
  bool created_{};
  bool visible_{};
  std::uint32_t width_{480};
  std::uint32_t height_{240};
  std::vector<EditorEvent> events_;
};

}  // namespace bwbrain::capability
