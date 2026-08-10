#include "CapabilityProbeEditor.h"

#import <Cocoa/Cocoa.h>

#include <cassert>

using bwbrain::capability::CapabilityProbeEditor;

int main() {
  @autoreleasepool {
    auto* parent = [[NSView alloc] initWithFrame:NSMakeRect(0.0, 0.0, 480.0, 240.0)];
    CapabilityProbeEditor editor;
    assert(editor.create("cocoa"));
    assert(editor.setParent(parent));
    assert(editor.isAttached());
    assert([[parent subviews] count] == 1);

    NSView* child = [[parent subviews] firstObject];
    assert(editor.show());
    assert(![child isHidden]);
    assert(editor.resize(640, 360));
    assert(NSWidth([child frame]) == 640.0);
    assert(NSHeight([child frame]) == 360.0);
    assert(editor.hide());
    assert([child isHidden]);

    editor.destroy();
    assert(!editor.isAttached());
    assert([[parent subviews] count] == 0);
    [parent release];
  }
}
