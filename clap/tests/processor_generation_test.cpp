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
 PluginProcessor wire;wire.prepareToPlay(48000,512);auto wireScope=wire.uiSnapshot()->scope;wireScope.projectId="project-a";wireScope.instanceId="instance-a";wireScope.clipSid="clip-a";wireScope.confirmed=true;wire.publishUi(ui::ScopeChanged{wireScope});
 const std::string arm="{\"type\":\"phrase.arm\",\"armToken\":\"arm-a\",\"proposalId\":\"proposal-a\",\"revision\":1,\"phraseId\":\"phrase-a\",\"scope\":{\"projectId\":\"project-a\",\"instanceId\":\"instance-a\",\"clipSid\":\"clip-a\"},\"launch\":\"next_beat\",\"lengthBeats\":1,\"notes\":[{\"ordinal\":0,\"startBeats\":0,\"durationBeats\":0.5,\"port\":0,\"channel\":0,\"key\":60,\"velocity\":0.8,\"noteId\":-1}]}";
 auto wrongArm=arm;wrongArm.replace(wrongArm.find("project-a"),std::string("project-a").size(),"project-b");wire.handlePeerMessage(wrongArm);CHECK(!wire.generationArmed());
 wire.handlePeerMessage(arm);CHECK(wire.generationArmed());wire.setTestTransport({true,true,true,true,rt::beatToFixed(0.25),120,4,4,48000,512});juce::AudioBuffer<float>wireAudio(1,512);juce::MidiBuffer wireMidi;wire.processBlock(wireAudio,wireMidi);CHECK(wire.generationCountdownBeats()>0.7&&wire.generationCountdownBeats()<0.8);
 wire.setTestTransport({true,true,true,true,rt::beatToFixed(0.99),120,4,4,48000,512});wireMidi.clear();wire.processBlock(wireAudio,wireMidi);CHECK(wireMidi.getNumEvents()==1);
 PluginProcessor full;for(int i=0;i<8;i++)CHECK(full.armPhrase(phrase()));CHECK(!full.armPhrase(phrase()));full.stopGenerated();CHECK(!full.generationArmed());return 0;}
