#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace bw::ui {

inline juce::Viewport* textEditorViewport(juce::TextEditor& editor) {
  for (int index = 0; index < editor.getNumChildComponents(); ++index) {
    if (auto* viewport = dynamic_cast<juce::Viewport*>(editor.getChildComponent(index)))
      return viewport;
  }
  return nullptr;
}

inline void replaceTextPreservingViewport(juce::TextEditor& editor,
                                          const juce::String& replacement) {
  if (editor.getText() == replacement)
    return;

  auto* viewport = textEditorViewport(editor);
  const auto viewPosition = viewport != nullptr ? viewport->getViewPosition()
                                                 : juce::Point<int>{};
  editor.setText(replacement, false);
  if (viewport != nullptr)
    viewport->setViewPosition(viewPosition);
}

}  // namespace bw::ui
