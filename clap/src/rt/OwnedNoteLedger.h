#pragma once
#include "EventMerge.h"
#include <array>
namespace bw::rt {
class OwnedNoteLedger { public: bool noteOn(const GeneratedNoteKey&)noexcept; bool noteOff(const GeneratedNoteKey&)noexcept; void requestCleanup()noexcept{cleanup_=true;} std::size_t drain(FixedEventBuffer&)noexcept; void completeCleanup()noexcept; void clear()noexcept; std::size_t size()const noexcept{return size_;} bool empty()const noexcept{return size_==0;} bool cleanupPending()const noexcept{return cleanup_;} private: struct Entry{GeneratedNoteKey key{};bool active{};};std::array<Entry,kMaxOwnedNotes> entries_{};std::size_t size_{};bool cleanup_{}; };
}
