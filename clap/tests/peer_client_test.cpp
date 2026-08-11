#include "peer/PeerClient.h"
#include <array>
#include <cassert>
#include <string>
int main(){
  bw::rt::Snapshot s{};s.channels=1;s.tempo=120;s.numerator=4;s.denominator=4;std::string encoded;
  assert(bw::peer::PeerClient::encode(s,"project:1","instance:1",encoded));assert(encoded.find("telemetry.snapshot")!=std::string::npos);assert(encoded.find("pcm")==std::string::npos);assert(!bw::peer::PeerClient::encode(s,std::string(65,'p'),"i",encoded));s.recentNoteCount=17;assert(!bw::peer::PeerClient::encode(s,"p","i",encoded));return 0;
}
