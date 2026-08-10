#include "CapabilityProbeEditor.h"

#import <Cocoa/Cocoa.h>

@interface BWCapabilityProbeView : NSView
@end

@implementation BWCapabilityProbeView
- (BOOL)isFlipped { return YES; }

- (void)drawRect:(NSRect)dirtyRect {
  [super drawRect:dirtyRect];
  [[NSColor colorWithCalibratedRed:0.08 green:0.10 blue:0.14 alpha:1.0] setFill];
  NSRectFill(dirtyRect);

  NSDictionary* titleAttributes = @{
    NSFontAttributeName : [NSFont boldSystemFontOfSize:22.0],
    NSForegroundColorAttributeName : [NSColor colorWithCalibratedRed:0.55 green:0.86 blue:1.0 alpha:1.0]
  };
  NSDictionary* bodyAttributes = @{
    NSFontAttributeName : [NSFont systemFontOfSize:14.0],
    NSForegroundColorAttributeName : [NSColor whiteColor]
  };
  [@"bw-brain Capability Probe" drawAtPoint:NSMakePoint(24.0, 24.0)
                              withAttributes:titleAttributes];
  [@"Embedded Cocoa editor attached successfully."
      drawAtPoint:NSMakePoint(24.0, 64.0)
   withAttributes:bodyAttributes];
  [@"Use the device panel to evaluate CLAP parameters."
      drawAtPoint:NSMakePoint(24.0, 88.0)
   withAttributes:bodyAttributes];
}
@end

namespace bwbrain::capability {

CapabilityProbeEditor::~CapabilityProbeEditor() { destroy(); }

bool CapabilityProbeEditor::create(std::string api) {
  if (created_ || api != "cocoa") return false;
  created_ = true;
  events_.push_back(EditorEvent::Created);
  return true;
}

bool CapabilityProbeEditor::setParent(void* parent) {
  if (!created_ || !parent || nativeView_) return false;
  NSView* parentView = static_cast<NSView*>(parent);
  auto* child = [[BWCapabilityProbeView alloc]
      initWithFrame:NSMakeRect(0.0, 0.0, static_cast<CGFloat>(width_),
                              static_cast<CGFloat>(height_))];
  if (!child) return false;
  [child setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
  [child setHidden:!visible_];
  [parentView addSubview:child];
  nativeView_ = child;
  return true;
}

bool CapabilityProbeEditor::show() {
  if (!created_) return false;
  visible_ = true;
  if (nativeView_) [static_cast<NSView*>(nativeView_) setHidden:NO];
  events_.push_back(EditorEvent::Shown);
  return true;
}

bool CapabilityProbeEditor::resize(std::uint32_t width, std::uint32_t height) {
  if (!created_ || width == 0 || height == 0) return false;
  width_ = width;
  height_ = height;
  if (nativeView_)
    [static_cast<NSView*>(nativeView_)
        setFrameSize:NSMakeSize(static_cast<CGFloat>(width), static_cast<CGFloat>(height))];
  events_.push_back(EditorEvent::Resized);
  return true;
}

bool CapabilityProbeEditor::hide() {
  if (!created_) return false;
  visible_ = false;
  if (nativeView_) [static_cast<NSView*>(nativeView_) setHidden:YES];
  events_.push_back(EditorEvent::Hidden);
  return true;
}

void CapabilityProbeEditor::destroy() {
  if (!created_) return;
  if (nativeView_) {
    NSView* child = static_cast<NSView*>(nativeView_);
    [child removeFromSuperview];
    [child release];
    nativeView_ = nullptr;
  }
  created_ = false;
  visible_ = false;
  events_.push_back(EditorEvent::Destroyed);
}

const std::vector<EditorEvent>& CapabilityProbeEditor::events() const { return events_; }
std::uint32_t CapabilityProbeEditor::lastWidth() const { return width_; }
std::uint32_t CapabilityProbeEditor::lastHeight() const { return height_; }
bool CapabilityProbeEditor::isAttached() const { return nativeView_ != nullptr; }

}  // namespace bwbrain::capability
