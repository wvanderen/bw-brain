#include "rt/OwnedNoteLedger.h"
#include <cassert>
#include <cstdlib>
using namespace bw::rt;
#define CHECK(x) do { if (!(x)) std::abort(); } while (false)
int main(){ OwnedNoteLedger l; GeneratedNoteKey k{9,2,0,1,60,44};
  CHECK(l.noteOn(k)); CHECK(!l.noteOn(k)); CHECK(l.size()==1);
  l.requestCleanup(); FixedEventBuffer out{}; CHECK(l.drain(out)==1); CHECK(out[0].kind==EventKind::noteOff); CHECK(l.size()==1); l.completeCleanup(); CHECK(l.empty());
  CHECK(l.drain(out)==0); // exactly once
  for(std::size_t i=0;i<kMaxOwnedNotes;i++){ k.ordinal=static_cast<uint8_t>(i); k.key=static_cast<uint8_t>(i); CHECK(l.noteOn(k)); }
  k.noteId=999; CHECK(!l.noteOn(k)); // limit+1
  return 0; }
