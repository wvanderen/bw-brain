#include "PluginProcessor.h"
#include <cassert>
using namespace bw;
static rt::ArmedPhrase phrase(){ rt::ArmedPhrase p{}; p.revision=1;p.launch=rt::LaunchQuantization::nextBeat;p.lengthBeats=1;p.noteCount=1;p.notes[0]={0,0,2,0,0,60,1,5};return p; }
template<class Sample> static void transparency(){ PluginProcessor p;p.prepareToPlay(48000,512);juce::AudioBuffer<Sample>b(2,512);for(int c=0;c<2;c++)for(int i=0;i<512;i++)b.setSample(c,i,Sample(0.25));juce::MidiBuffer m;m.addEvent(juce::MidiMessage::noteOn(1,48,(juce::uint8)100),3);p.processBlock(b,m);assert(b.getSample(0,2)==Sample(0.25));assert(m.getNumEvents()>=1); }
int main(){transparency<float>();transparency<double>();PluginProcessor p;p.prepareToPlay(48000,512);assert(p.armPhrase(phrase()));p.setTestTransport({true,true,true,true,rt::beatToFixed(0.99),120,4,4,48000,512});juce::AudioBuffer<float>b(1,512);juce::MidiBuffer m;p.processBlock(b,m);assert(m.getNumEvents()==1);p.stopGenerated();p.processBlock(b,m);assert(p.ownedGeneratedNotes()==0);assert(p.armPhrase(phrase()));p.disconnectGenerated();assert(!p.generationArmed());p.reset();p.releaseResources();return 0;}
