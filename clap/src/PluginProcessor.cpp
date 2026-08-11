#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <span>
namespace {class ReadOnlyStatusParameter final:public juce::AudioProcessorParameter{public:explicit ReadOnlyStatusParameter(juce::String n):name_(std::move(n)){}float getValue()const override{return value_.load();}void setValue(float)override{}float getDefaultValue()const override{return 0;}juce::String getName(int n)const override{return name_.substring(0,n);}juce::String getLabel()const override{return{};}int getNumSteps()const override{return 2;}juce::String getText(float,int)const override{return getValue()>.5F?"On":"Off";}float getValueForText(const juce::String&)const override{return getValue();}bool isAutomatable()const override{return false;}bool isOrientationInverted()const override{return false;}private:juce::String name_;std::atomic<float>value_{0};};}

namespace bw {

PluginProcessor::PluginProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {addParameter(new ReadOnlyStatusParameter("Connection Status"));addParameter(new ReadOnlyStatusParameter("Session Status"));addParameter(new ReadOnlyStatusParameter("Proposal Pending"));generatedMixParameter_=new juce::AudioParameterFloat({"generated_mix",1},"Generated Mix",0.0F,1.0F,0.0F);addParameter(generatedMixParameter_);peerTransport_=std::make_unique<peer::LoopbackTransport>(instanceState_.instanceId(),[this](bool connected){publishUi(ui::ConnectionChanged{connected?"connected":"disconnected"});},[this](const std::string&oldId,const std::string&newId){{std::lock_guard lock(instanceStateMutex_);if(!instanceState_.applyDaemonRekey(oldId,newId))return;}auto scope=uiSnapshot()->scope;scope.instanceId=newId;publishUi(ui::ScopeChanged{std::move(scope)});});}

void PluginProcessor::prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock) { setRateAndBufferSizeDetails(sampleRate,maximumExpectedSamplesPerBlock); }
void PluginProcessor::releaseResources() { requestDisarm(); }
void PluginProcessor::reset() { requestDisarm(); }

bool PluginProcessor::armPhrase(const rt::ArmedPhrase& phrase) noexcept { Command c{CommandKind::arm,phrase}; if(!commands_.tryPushStrict(c))return false;disarmRequested_.store(false,std::memory_order_release);generationArmed_.store(true,std::memory_order_release);return true; }
void PluginProcessor::requestDisarm() noexcept { disarmRequested_.store(true,std::memory_order_release);generationArmed_.store(false,std::memory_order_release); }
void PluginProcessor::stopGenerated() noexcept { requestDisarm(); }
void PluginProcessor::disconnectGenerated() noexcept { requestDisarm(); }

rt::TransportBlock PluginProcessor::currentTransport(uint32_t frames) noexcept {
 if(useTestTransport_){auto t=testTransport_;t.frames=frames;return t;}
 rt::TransportBlock t{};t.frames=frames;t.sampleRate=getSampleRate();
 if(auto* playhead=getPlayHead()) if(auto pos=playhead->getPosition()){
   t.playing=pos->getIsPlaying();
   if(auto beat=pos->getPpqPosition()){t.hasBeat=true;t.beat=rt::beatToFixed(*beat);}
   if(auto tempo=pos->getBpm()){t.hasTempo=true;t.tempo=*tempo;}
   if(auto sig=pos->getTimeSignature()){t.hasTimeSignature=true;t.numerator=static_cast<uint8_t>(sig->numerator);t.denominator=static_cast<uint8_t>(sig->denominator);}
 }
 return t;
}

void PluginProcessor::processGeneration(juce::MidiBuffer& midi,uint32_t frames) noexcept {
 if(disarmRequested_.exchange(false,std::memory_order_acq_rel)){scheduler_.disarm();ledger_.requestCleanup();}
 Command command{};while(commands_.tryPop(command)){if(command.kind==CommandKind::arm){if(!scheduler_.arm(command.phrase))generationArmed_.store(false,std::memory_order_release);}else{scheduler_.disarm();ledger_.requestCleanup();}}
 rt::FixedEventBuffer generated{},cleanup{},merged{};
 const auto transport=currentTransport(frames);
 const bool stopped=havePreviousTransport_&&previousTransport_.playing&&!transport.playing;
 const bool jumped=transport.discontinuity;
 if(stopped){scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);}
 else if(jumped)ledger_.requestCleanup();
 scheduler_.render(transport,generated); previousTransport_=transport;havePreviousTransport_=true;
 if(ledger_.cleanupPending())ledger_.drain(cleanup);
 if(!rt::mergeEvents(generated,cleanup,merged)){scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);return;}
 if(static_cast<std::size_t>(midi.getNumEvents())+merged.count>outputCapacity_){scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);return;}
 bool outputOk=true;
 for(std::size_t i=0;i<merged.count;i++){const auto&e=merged[i];juce::MidiMessage message(e.midi.data(),3);midi.addEvent(message,static_cast<int>(e.time));if(e.generated){if(e.kind==rt::EventKind::noteOn){if(!ledger_.noteOn(e.owner))outputOk=false;}else if(e.kind==rt::EventKind::noteOff)ledger_.noteOff(e.owner);}}
 if(outputOk){if(ledger_.cleanupPending())ledger_.completeCleanup();}else{scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);}
 if(!scheduler_.armed())generationArmed_.store(false,std::memory_order_release);
}

bool PluginProcessor::isBusesLayoutSupported(const BusesLayout &layouts) const {
  return layouts.getMainInputChannelSet() == layouts.getMainOutputChannelSet() &&
         (layouts.getMainOutputChannelSet() == juce::AudioChannelSet::mono() ||
          layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo());
}

void PluginProcessor::processBlock(juce::AudioBuffer<float> &audio, juce::MidiBuffer &midi) {
  processTransparent(audio, midi);
}

void PluginProcessor::processBlock(juce::AudioBuffer<double> &audio, juce::MidiBuffer &midi) {
  processTransparent(audio, midi);
}

juce::AudioProcessorEditor *PluginProcessor::createEditor() { return new PluginEditor(*this); }
bool PluginProcessor::hasEditor() const { return true; }
const juce::String PluginProcessor::getName() const { return "bw-brain"; }
bool PluginProcessor::acceptsMidi() const { return true; }
bool PluginProcessor::producesMidi() const { return true; }
bool PluginProcessor::isMidiEffect() const { return false; }
double PluginProcessor::getTailLengthSeconds() const { return 0.0; }
int PluginProcessor::getNumPrograms() { return 1; }
int PluginProcessor::getCurrentProgram() { return 0; }
void PluginProcessor::setCurrentProgram(int) {}
const juce::String PluginProcessor::getProgramName(int) { return {}; }
void PluginProcessor::changeProgramName(int, const juce::String &) {}
void PluginProcessor::getStateInformation(juce::MemoryBlock &destinationData) { std::lock_guard lock(instanceStateMutex_);instanceState_.setMusicalSettings({generatedMixParameter_->get()});const auto bytes=instanceState_.serialize();destinationData.replaceAll(bytes.data(),bytes.size()); }
void PluginProcessor::setStateInformation(const void *data, int size) { std::lock_guard lock(instanceStateMutex_);if(size>0&&instanceState_.deserialize(std::span(static_cast<const std::uint8_t*>(data),static_cast<std::size_t>(size)))){generatedMixParameter_->setValueNotifyingHost(instanceState_.settings().generatedMix);updateHostDisplay(juce::AudioProcessorListener::ChangeDetails{}.withParameterInfoChanged(true));} }

} // namespace bw

juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() { return new bw::PluginProcessor(); }
