#include "CapabilityProbeEditor.h"

namespace bwbrain::capability {

bool CapabilityProbeEditor::create(std::string api) {
  if (created_ || api.empty()) return false;
  created_ = true;
  events_.push_back(EditorEvent::Created);
  return true;
}
bool CapabilityProbeEditor::show() {
  if (!created_) return false;
  visible_ = true;
  events_.push_back(EditorEvent::Shown);
  return true;
}
bool CapabilityProbeEditor::resize(std::uint32_t width, std::uint32_t height) {
  if (!created_ || width == 0 || height == 0) return false;
  width_ = width;
  height_ = height;
  events_.push_back(EditorEvent::Resized);
  return true;
}
bool CapabilityProbeEditor::hide() {
  if (!created_) return false;
  visible_ = false;
  events_.push_back(EditorEvent::Hidden);
  return true;
}
void CapabilityProbeEditor::destroy() {
  if (!created_) return;
  created_ = false;
  visible_ = false;
  events_.push_back(EditorEvent::Destroyed);
}
const std::vector<EditorEvent>& CapabilityProbeEditor::events() const { return events_; }
std::uint32_t CapabilityProbeEditor::lastWidth() const { return width_; }
std::uint32_t CapabilityProbeEditor::lastHeight() const { return height_; }

}  // namespace bwbrain::capability
