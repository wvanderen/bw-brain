#include "Aggregator.h"
#include <cmath>
#include <limits>
namespace bw::rt {
static uint16_t bump(uint16_t value) noexcept { return value == std::numeric_limits<uint16_t>::max() ? value : static_cast<uint16_t>(value + 1); }
void Aggregator::note(uint32_t offset,uint8_t port,uint8_t channel,uint8_t key,uint8_t velocity,bool on) noexcept {
  if (noteCount_ < notes_.size()) notes_[noteCount_++]={offset,port,static_cast<uint8_t>(channel&15),static_cast<uint8_t>(key&127),velocity,static_cast<uint8_t>(on)};
  if (on) { noteTotal_++; pitch_[key%12]=bump(pitch_[key%12]); velocity_[velocity>>5]=bump(velocity_[velocity>>5]); rhythm_[(offset>>6)&15]=bump(rhythm_[(offset>>6)&15]); }
}
void Aggregator::transport(bool playing,float tempo,uint8_t numerator,uint8_t denominator) noexcept { playing_=playing; tempo_=tempo; numerator_=numerator; denominator_=denominator; }
void Aggregator::publish() noexcept {
  Snapshot s{}; s.sequence=sequence_++; s.droppedSnapshots=dropped_; s.channels=channels_; s.recentNoteCount=noteCount_; s.playing=playing_; s.tempo=tempo_; s.numerator=numerator_; s.denominator=denominator_;
  for (int c=0;c<channels_;c++) { s.rms[c]=sampleCount_ ? static_cast<float>(std::sqrt(sums_[c]/sampleCount_)) : 0; s.peak[c]=static_cast<float>(peaks_[c]); }
  s.noteDensity=blocks_ ? static_cast<float>(noteTotal_)/blocks_ : 0; s.pitchClass=pitch_; s.velocityBins=velocity_; s.rhythmBins=rhythm_; s.recentNotes=notes_;
  if (!queue_.tryPush(s)) dropped_++; sums_={}; peaks_={}; pitch_={}; velocity_={}; rhythm_={}; notes_={}; sampleCount_=blocks_=noteTotal_=0; noteCount_=0;
}
}
