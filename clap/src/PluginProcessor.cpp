#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <algorithm>
#include <cmath>
#include <span>
namespace {
class ReadOnlyStatusParameter final:public juce::AudioProcessorParameter{public:explicit ReadOnlyStatusParameter(juce::String n):name_(std::move(n)){}float getValue()const override{return value_.load();}void setValue(float)override{}float getDefaultValue()const override{return 0;}juce::String getName(int n)const override{return name_.substring(0,n);}juce::String getLabel()const override{return{};}int getNumSteps()const override{return 2;}juce::String getText(float,int)const override{return getValue()>.5F?"On":"Off";}float getValueForText(const juce::String&)const override{return getValue();}bool isAutomatable()const override{return false;}bool isOrientationInverted()const override{return false;}private:juce::String name_;std::atomic<float>value_{0};};
}

namespace bw {

PluginProcessor::PluginProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {addParameter(new ReadOnlyStatusParameter("Connection Status"));addParameter(new ReadOnlyStatusParameter("Session Status"));addParameter(new ReadOnlyStatusParameter("Proposal Pending"));generatedMixParameter_=new juce::AudioParameterFloat({"generated_mix",1},"Generated Mix",0.0F,1.0F,0.0F);addParameter(generatedMixParameter_);auto initialScope=uiSnapshot()->scope;initialScope.instanceId=instanceState_.instanceId();publishUi(ui::ScopeChanged{std::move(initialScope)});peerTransport_=std::make_unique<peer::LoopbackTransport>(instanceState_.instanceId(),[this](bool connected){publishUi(ui::ConnectionChanged{connected?"connected":"disconnected"});},[this](const std::string&oldId,const std::string&newId){{std::lock_guard lock(instanceStateMutex_);if(!instanceState_.applyDaemonRekey(oldId,newId))return;}auto scope=uiSnapshot()->scope;scope.instanceId=newId;publishUi(ui::ScopeChanged{std::move(scope)});updateHostDisplay(juce::AudioProcessorListener::ChangeDetails{}.withNonParameterStateChanged(true));},7879,std::chrono::milliseconds(250),[this](std::string&message){return nextPeerMessage(message);},[this](const std::string&message){handlePeerMessage(message);});}

bool PluginProcessor::nextPeerMessage(std::string& message) {
  ui::UiAction action;
  while (uiActions_.tryPop(action)) {
    if (ui::encodePeerAction(action,message)) return true;
    publishUi(ui::HealthChanged{uiSnapshot()->droppedSnapshots,"invalid_or_unsupported_action"});
  }
  return false;
}

void PluginProcessor::handlePeerMessage(const std::string& message) {
  const auto type=ui::peerMessageType(message);
  if(type=="phrase.arm"){
    rt::ArmedPhrase phrase{};
    if(!ui::decodeArmedPhrase(message,phrase)){
      publishUi(ui::HealthChanged{uiSnapshot()->droppedSnapshots,"invalid_phrase_arm"});
      return;
    }
    const auto scope=uiSnapshot()->scope;
    const bool exactScope=scope.confirmed&&scope.projectId==phrase.projectId.data()&&
      scope.instanceId==phrase.instanceId.data()&&scope.clipSid.value_or("")==phrase.clipSid.data();
    if(!exactScope||!armPhrase(phrase)){
      publishUi(ui::HealthChanged{uiSnapshot()->droppedSnapshots,"invalid_phrase_arm"});
      return;
    }
  }else if(type=="phrase.disarm"||type=="stop")requestDisarm();
  if(!ui::reducePeerMessage(uiState_,message)&&!type.empty())publishUi(ui::HealthChanged{uiSnapshot()->droppedSnapshots,"unsupported_peer_message"});
}

void PluginProcessor::prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock) { setRateAndBufferSizeDetails(sampleRate,maximumExpectedSamplesPerBlock); }
void PluginProcessor::releaseResources() { requestDisarm(); }
void PluginProcessor::reset() { requestDisarm(); }

bool PluginProcessor::armPhrase(const rt::ArmedPhrase& phrase) noexcept { Command c{CommandKind::arm,phrase}; if(!commands_.tryPushStrict(c))return false;disarmRequested_.store(false,std::memory_order_release);generationCountdownMilliBeats_.store(0,std::memory_order_release);generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::waitingForTransport),std::memory_order_release);generationArmed_.store(true,std::memory_order_release);return true; }
void PluginProcessor::requestDisarm() noexcept { disarmRequested_.store(true,std::memory_order_release);generationArmed_.store(false,std::memory_order_release);generationCountdownMilliBeats_.store(0,std::memory_order_release);generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::stopped),std::memory_order_release); }
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
 if(stopped){scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);generationCountdownMilliBeats_.store(0,std::memory_order_release);generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::stopped),std::memory_order_release);}
 else if(jumped)ledger_.requestCleanup();
 scheduler_.render(transport,generated); previousTransport_=transport;havePreviousTransport_=true;
 if(scheduler_.armed()){
   if(scheduler_.launchScheduled()&&transport.playing&&transport.hasBeat){
     const auto remaining=std::max(0.0,scheduler_.launchBeat()-rt::fixedToBeat(transport.beat));
     generationCountdownMilliBeats_.store(static_cast<std::int32_t>(std::llround(remaining*1000.0)),std::memory_order_release);
     generationStatus_.store(static_cast<std::uint8_t>(remaining>0.0005?GenerationUiStatus::countdown:GenerationUiStatus::playing),std::memory_order_release);
   }else{
     generationCountdownMilliBeats_.store(0,std::memory_order_release);
     generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::waitingForTransport),std::memory_order_release);
   }
 }
 if(ledger_.cleanupPending())ledger_.drain(cleanup);
 if(!rt::mergeEvents(generated,cleanup,merged)){scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::stopped),std::memory_order_release);return;}
 if(static_cast<std::size_t>(midi.getNumEvents())+merged.count>outputCapacity_){scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::stopped),std::memory_order_release);return;}
 bool outputOk=true;
 for(std::size_t i=0;i<merged.count;i++){const auto&e=merged[i];juce::MidiMessage message(e.midi.data(),3);midi.addEvent(message,static_cast<int>(e.time));if(e.generated){if(e.kind==rt::EventKind::noteOn){if(!ledger_.noteOn(e.owner))outputOk=false;}else if(e.kind==rt::EventKind::noteOff)ledger_.noteOff(e.owner);}}
 if(outputOk){if(ledger_.cleanupPending())ledger_.completeCleanup();}else{scheduler_.disarm();ledger_.requestCleanup();generationArmed_.store(false,std::memory_order_release);generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::stopped),std::memory_order_release);}
 if(!scheduler_.armed()){
   generationCountdownMilliBeats_.store(0,std::memory_order_release);
   if(generationArmed_.exchange(false,std::memory_order_acq_rel))generationStatus_.store(static_cast<std::uint8_t>(GenerationUiStatus::complete),std::memory_order_release);
 }
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
void PluginProcessor::setStateInformation(const void *data, int size) {
  std::string restoredInstanceId;
  identity::MusicalSettings restoredSettings;
  {
    std::lock_guard lock(instanceStateMutex_);
    if (size <= 0 ||
        !instanceState_.deserialize(std::span(
            static_cast<const std::uint8_t*>(data),
            static_cast<std::size_t>(size)))) {
      return;
    }
    restoredInstanceId = instanceState_.instanceId();
    restoredSettings = instanceState_.settings();
  }

  generatedMixParameter_->setValueNotifyingHost(restoredSettings.generatedMix);
  auto scope = uiSnapshot()->scope;
  scope.instanceId = restoredInstanceId;
  publishUi(ui::ScopeChanged{std::move(scope)});
  peerTransport_->setInstanceId(std::move(restoredInstanceId));
  updateHostDisplay(
      juce::AudioProcessorListener::ChangeDetails{}.withParameterInfoChanged(true));
}

} // namespace bw

juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() { return new bw::PluginProcessor(); }
