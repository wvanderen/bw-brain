#include "rt/EventMerge.h"
#include "rt/PhraseScheduler.h"
#include <cassert>
#include <cstdlib>
#include <cmath>

using namespace bw::rt;
#define CHECK(x) do { if (!(x)) std::abort(); } while (false)

static ArmedPhrase phrase(LaunchQuantization launch = LaunchQuantization::nextBeat) {
  ArmedPhrase p{}; p.revision=7; p.launch=launch; p.lengthBeats=1.0; p.noteCount=2;
  p.notes[0]={0,0.0,0.25,0,0,60,0.5f,10}; p.notes[1]={1,0.5,0.25,0,0,64,0.5f,11};
  return p;
}

int main() {
  PhraseScheduler s; FixedEventBuffer generated{};
  TransportBlock t{true,true,true,true,beatToFixed(1.75),120.0,4,4,48000.0,12000};
  CHECK(s.render(t,generated)==0); // unarmed
  auto immutable=phrase(); CHECK(s.arm(immutable)); immutable.notes[0].key=99;
  t.beat=beatToFixed(2.0); CHECK(s.render(t,generated)>=1); CHECK(generated[0].time==0&&generated[0].midi[1]==60);
  s.disarm();t.beat=beatToFixed(1.75);
  CHECK(s.arm(phrase())); CHECK(s.render(t,generated)==1); CHECK(generated[0].time==6000);
  s.disarm(); auto bar=phrase(LaunchQuantization::nextBar); CHECK(s.arm(bar));
  t.beat=beatToFixed(3.5); t.frames=12001; CHECK(s.render(t,generated)==1); CHECK(generated[0].time==12000);
  s.disarm(); CHECK(s.arm(phrase())); t.hasTempo=false; CHECK(s.render(t,generated)==0);
  t.hasTempo=true; t.hasTimeSignature=false; CHECK(s.render(t,generated)==0);
  t.hasTimeSignature=true; t.discontinuity=true; t.frames=12000; t.beat=beatToFixed(7.75); CHECK(s.render(t,generated)==1);
  CHECK(generated[0].time==6000); // recomputed after jump

  FixedEventBuffer original{}; original.count=2;
  original[0]={6000,EventKind::midi,{0x90,50,90},false,{}};
  original[1]={7000,EventKind::midi,{0x80,50,0},false,{}};
  FixedEventBuffer merged{}; CHECK(mergeEvents(original,generated,merged));
  CHECK(merged.count==3 && !merged[0].generated && merged[1].generated); // original first at tie

  ArmedPhrase max{}; max.launch=LaunchQuantization::nextBeat; max.lengthBeats=64; max.noteCount=kMaxPhraseNotes;
  for(std::size_t i=0;i<kMaxPhraseNotes;i++) max.notes[i]={static_cast<uint8_t>(i),0,64,0,0,static_cast<uint8_t>(i),1,-1};
  s.disarm(); CHECK(s.arm(max)); max.noteCount=kMaxPhraseNotes+1; CHECK(!s.arm(max));
  FixedEventBuffer fullA{},fullB{},overflow{};fullA.count=kMaxEventsPerBlock;fullB.count=1;CHECK(!mergeEvents(fullA,fullB,overflow));
  return 0;
}
