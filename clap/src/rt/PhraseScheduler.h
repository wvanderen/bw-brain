#pragma once
#include "EventMerge.h"
#include <array>
#include <cstdint>
#include <type_traits>

namespace bw::rt {
constexpr int64_t kBeatFixedOne=int64_t{1}<<31;
inline int64_t beatToFixed(double beat) noexcept { return static_cast<int64_t>(beat*static_cast<double>(kBeatFixedOne)); }
inline double fixedToBeat(int64_t beat) noexcept { return static_cast<double>(beat)/static_cast<double>(kBeatFixedOne); }
enum class LaunchQuantization:uint8_t { nextBeat,nextBar };
struct PhraseNote { uint8_t ordinal{}; double startBeats{},durationBeats{}; uint8_t port{},channel{},key{}; float velocity{}; int32_t noteId{-1}; };
struct ArmedPhrase { std::array<char,65> phraseId{},projectId{},instanceId{},clipSid{}; uint32_t revision{}; LaunchQuantization launch{}; double lengthBeats{}; uint8_t noteCount{}; std::array<PhraseNote,kMaxPhraseNotes> notes{}; };
static_assert(std::is_trivially_copyable_v<ArmedPhrase>);
struct TransportBlock { bool playing{},hasBeat{},hasTempo{},hasTimeSignature{}; int64_t beat{}; double tempo{}; uint8_t numerator{},denominator{}; double sampleRate{}; uint32_t frames{}; bool discontinuity{}; };
class PhraseScheduler {
public:
 bool arm(const ArmedPhrase&) noexcept; void disarm() noexcept; bool armed()const noexcept{return armed_;}
 bool launchScheduled()const noexcept{return launched_;} double launchBeat()const noexcept{return launchBeat_;}
 std::size_t render(const TransportBlock&,FixedEventBuffer&) noexcept;
private:
 ArmedPhrase phrase_{}; bool armed_{}; bool launched_{}; double launchBeat_{}; double previousEndBeat_{}; bool havePrevious_{};
};
}
