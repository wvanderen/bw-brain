#include "PhraseScheduler.h"
#include <algorithm>
#include <cmath>

namespace bw::rt {
bool PhraseScheduler::arm(const ArmedPhrase& p) noexcept {
 if(p.noteCount==0||p.noteCount>kMaxPhraseNotes||!(p.lengthBeats>0&&p.lengthBeats<=64)) return false;
 for(std::size_t i=0;i<p.noteCount;i++) if(p.notes[i].ordinal>=kMaxPhraseNotes||p.notes[i].startBeats<0||p.notes[i].durationBeats<=0) return false;
 phrase_=p; armed_=true; launched_=false; havePrevious_=false; return true;
}
void PhraseScheduler::disarm() noexcept { armed_=false; launched_=false; havePrevious_=false; }
std::size_t PhraseScheduler::render(const TransportBlock& t,FixedEventBuffer& out) noexcept {
 out.count=0;
 if(!armed_||!t.playing||!t.hasBeat||!t.hasTempo||!t.hasTimeSignature||t.tempo<=0||t.sampleRate<=0) return 0;
 const double start=fixedToBeat(t.beat), beatsPerSample=t.tempo/(60.0*t.sampleRate), end=start+beatsPerSample*t.frames;
 if(t.discontinuity||(havePrevious_&&std::abs(start-previousEndBeat_)>beatsPerSample*2)){ launched_=false; }
 if(!launched_){
   if(phrase_.launch==LaunchQuantization::nextBeat) launchBeat_=std::ceil(start-1e-12);
   else { const double bar=static_cast<double>(t.numerator)*4.0/static_cast<double>(t.denominator); launchBeat_=std::ceil((start-1e-12)/bar)*bar; }
   launched_=true;
 }
 for(std::size_t i=0;i<phrase_.noteCount;i++){
   const auto& n=phrase_.notes[i]; const double on=launchBeat_+n.startBeats, off=on+n.durationBeats;
   auto add=[&](double beat,EventKind kind,uint8_t velocity){ if(beat+1e-12<start||beat>=end||out.count>=out.events.size()) return; auto sample=static_cast<uint32_t>(std::llround((beat-start)/beatsPerSample)); if(sample>=t.frames) return; out[out.count++]={sample,kind,{static_cast<uint8_t>((kind==EventKind::noteOn?0x90:0x80)|n.channel),n.key,velocity},true,{phrase_.revision,n.ordinal,n.port,n.channel,n.key,n.noteId}}; };
   add(on,EventKind::noteOn,static_cast<uint8_t>(std::clamp(n.velocity,0.0f,1.0f)*127.0f)); add(off,EventKind::noteOff,0);
 }
 std::stable_sort(out.events.begin(),out.events.begin()+static_cast<std::ptrdiff_t>(out.count),[](const auto&a,const auto&b){return a.time<b.time;});
 previousEndBeat_=end; havePrevious_=true;
 if(start>=launchBeat_+phrase_.lengthBeats){ armed_=false; launched_=false; }
 return out.count;
}
}
