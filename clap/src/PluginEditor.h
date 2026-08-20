#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
namespace bw{class PluginProcessor;class PluginEditor final:public juce::AudioProcessorEditor,private juce::Timer{public:explicit PluginEditor(PluginProcessor&);void paint(juce::Graphics&)override;void resized()override;private:void timerCallback()override;PluginProcessor&processor_;juce::Label context_,conversation_,status_;juce::TextEditor proposal_;juce::TextButton analyze_{"Analyze"},stop_{"Stop"},confirm_{"Confirm link"},focus_{"Set focus"},fork_{"Fork session"},approve_{"Approve"},arm_{"Arm"};};}
