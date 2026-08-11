#include "PluginProcessor.h"
#include <cassert>
#include <cstdlib>
using namespace bw;
#define CHECK(x) do { if (!(x)) std::abort(); } while (false)
static rt::ArmedPhrase phrase(){ rt::ArmedPhrase p{}; p.revision=1;p.launch=rt::LaunchQuantization::nextBeat;p.lengthBeats=1;p.noteCount=1;p.notes[0]={0,0,2,0,0,60,1,5};return p; }
template<class Sample> static void transparency(int channels){ PluginProcessor p;p.prepareToPlay(48000,512);juce::AudioBuffer<Sample>b(channels,512);for(int c=0;c<channels;c++)for(int i=0;i<512;i++)b.setSample(c,i,Sample(0.25));juce::MidiBuffer m;m.addEvent(juce::MidiMessage::noteOn(1,48,(juce::uint8)100),3);p.processBlock(b,m);CHECK(std::abs(b.getSample(0,2)-Sample(0.25))<Sample(1e-9));CHECK(m.getNumEvents()>=1); }
int main(){transparency<float>(1);transparency<float>(2);transparency<double>(1);transparency<double>(2);PluginProcessor p;p.prepareToPlay(48000,512);CHECK(p.isBusesLayoutSupported({juce::AudioChannelSet::mono(),juce::AudioChannelSet::mono()}));CHECK(p.isBusesLayoutSupported({juce::AudioChannelSet::stereo(),juce::AudioChannelSet::stereo()}));CHECK(p.armPhrase(phrase()));p.setTestTransport({true,true,true,true,rt::beatToFixed(0.99),120,4,4,48000,512});juce::AudioBuffer<float>b(1,512);juce::MidiBuffer m;p.processBlock(b,m);CHECK(m.getNumEvents()==1&&p.ownedGeneratedNotes()==1);
 p.setTestOutputCapacity(0);p.stopGenerated();p.processBlock(b,m);CHECK(p.ownedGeneratedNotes()==1); // failed push retains cleanup
 p.setTestOutputCapacity(rt::kMaxEventsPerBlock);m.clear();p.processBlock(b,m);CHECK(p.ownedGeneratedNotes()==0&&m.getNumEvents()==1);
 CHECK(p.armPhrase(phrase()));p.disconnectGenerated();CHECK(!p.generationArmed());p.processBlock(b,m);CHECK(p.ownedGeneratedNotes()==0);
 CHECK(p.armPhrase(phrase()));p.setTestTransport({false,true,true,true,rt::beatToFixed(1),120,4,4,48000,512});m.clear();p.processBlock(b,m);CHECK(!p.generationArmed());
 CHECK(p.armPhrase(phrase()));p.reset();CHECK(!p.generationArmed());CHECK(p.armPhrase(phrase()));p.releaseResources();CHECK(!p.generationArmed());
 PluginProcessor full;for(int i=0;i<8;i++)CHECK(full.armPhrase(phrase()));CHECK(!full.armPhrase(phrase()));full.stopGenerated();CHECK(!full.generationArmed());return 0;}
