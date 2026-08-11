#include "OwnedNoteLedger.h"
namespace bw::rt {
bool OwnedNoteLedger::noteOn(const GeneratedNoteKey& k)noexcept{for(auto&e:entries_)if(e.active&&e.key==k)return false;for(auto&e:entries_)if(!e.active){e={k,true};++size_;return true;}return false;}
bool OwnedNoteLedger::noteOff(const GeneratedNoteKey& k)noexcept{for(auto&e:entries_)if(e.active&&e.key==k){e.active=false;--size_;return true;}return false;}
std::size_t OwnedNoteLedger::drain(FixedEventBuffer& out)noexcept{out.count=0;if(!cleanup_)return 0;for(const auto&e:entries_)if(e.active&&out.count<out.events.size()){const auto&k=e.key;out[out.count++]={0,EventKind::noteOff,{static_cast<uint8_t>(0x80|k.channel),k.key,0},true,k};}return out.count;}
void OwnedNoteLedger::completeCleanup()noexcept{if(cleanup_)clear();}
void OwnedNoteLedger::clear()noexcept{for(auto&e:entries_)e.active=false;size_=0;cleanup_=false;}
}
