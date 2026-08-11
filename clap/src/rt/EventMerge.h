#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

namespace bw::rt {
constexpr std::size_t kMaxPhraseNotes=16;
constexpr std::size_t kMaxOwnedNotes=16;
constexpr std::size_t kMaxEventsPerBlock=64;
enum class EventKind : uint8_t { midi, noteOn, noteOff };
struct GeneratedNoteKey { uint32_t phraseRevision{}; uint8_t ordinal{},port{},channel{},key{}; int32_t noteId{-1}; friend bool operator==(const GeneratedNoteKey&,const GeneratedNoteKey&)=default; };
struct FixedEvent { uint32_t time{}; EventKind kind{EventKind::midi}; std::array<uint8_t,3> midi{}; bool generated{}; GeneratedNoteKey owner{}; };
struct FixedEventBuffer { std::array<FixedEvent,kMaxEventsPerBlock> events{}; std::size_t count{}; FixedEvent& operator[](std::size_t i){return events[i];} const FixedEvent& operator[](std::size_t i)const{return events[i];} };
inline bool mergeEvents(const FixedEventBuffer& original,const FixedEventBuffer& generated,FixedEventBuffer& out) noexcept {
  out.count=0; std::size_t i=0,j=0;
  if(original.count+generated.count>out.events.size()) return false;
  while(i<original.count||j<generated.count){
    // At equal offsets original events remain first; order within each input is stable.
    const bool takeOriginal=j==generated.count||(i<original.count&&original[i].time<=generated[j].time);
    out[out.count++]=takeOriginal?original[i++]:generated[j++];
  }
  return true;
}
}
