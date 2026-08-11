#include "rt/OwnedNoteLedger.h"
#include <cassert>
using namespace bw::rt;
int main(){ OwnedNoteLedger l; GeneratedNoteKey k{9,2,0,1,60,44};
  assert(l.noteOn(k)); assert(!l.noteOn(k)); assert(l.size()==1);
  l.requestCleanup(); FixedEventBuffer out{}; assert(l.drain(out)==1); assert(out[0].kind==EventKind::noteOff); assert(l.empty());
  assert(l.drain(out)==0); // exactly once
  for(std::size_t i=0;i<kMaxOwnedNotes;i++){ k.ordinal=static_cast<uint8_t>(i); k.key=static_cast<uint8_t>(i); assert(l.noteOn(k)); }
  k.noteId=999; assert(!l.noteOn(k)); // limit+1
  return 0; }
