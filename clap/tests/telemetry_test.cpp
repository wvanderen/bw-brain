#include "rt/Aggregator.h"
#include <array>
#include <cassert>
#include <fstream>
#include <iterator>
#include <string>
#include <type_traits>
int main() {
  static_assert(std::is_trivially_copyable_v<bw::rt::Snapshot>);
  bw::rt::Aggregator a; std::array<float,64> left{}, right{}; left.fill(.5f); right.fill(-.25f); const float* p[]{left.data(),right.data()};
  a.note(0,0,0,60,127,true); for (unsigned i=0;i<bw::rt::Aggregator::kPublishBlocks;i++) a.process(p,2,64);
  bw::rt::Snapshot s{}; assert(a.tryPop(s)); assert(s.channels==2 && s.rms[0]>.49f && s.peak[1]==.25f); assert(s.pitchClass[0]==1 && s.recentNoteCount==1);
  for (int n=0;n<6;n++) for (unsigned i=0;i<bw::rt::Aggregator::kPublishBlocks;i++) a.process(p,2,64);
  while(a.tryPop(s)){} for (unsigned i=0;i<bw::rt::Aggregator::kPublishBlocks;i++) a.process(p,2,64); assert(a.tryPop(s) && s.droppedSnapshots>0);
  std::ifstream source(std::string(BW_SOURCE_ROOT)+"/src/PluginProcessor.h"); const std::string text((std::istreambuf_iterator<char>(source)),{});
  const auto begin=text.find("void processTransparent"); const auto end=text.find("rt::Aggregator telemetry_",begin); assert(begin!=std::string::npos&&end!=std::string::npos);
  const auto seam=text.substr(begin,end-begin); for(const char* forbidden:{"new ","mutex","lock_guard","printf","cout","JSON","socket","send(","write("}) assert(seam.find(forbidden)==std::string::npos);
  return 0;
}
