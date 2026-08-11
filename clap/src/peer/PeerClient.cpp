#include "PeerClient.h"
#include <cstdio>
namespace bw::peer {
static bool validId(const std::string& id) { if(id.empty()||id.size()>64)return false; for(unsigned char c:id) if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='.'||c=='_'||c==':'||c=='-')) return false; return true; }
PeerClient::PeerClient(rt::Aggregator& source,std::string projectId,std::string instanceId,Send send):source_(source),projectId_(std::move(projectId)),instanceId_(std::move(instanceId)),send_(std::move(send)),worker_([this]{run();}){}
PeerClient::~PeerClient(){running_.store(false);if(worker_.joinable())worker_.join();}
void PeerClient::accept(std::string id){ if(validId(id)){std::lock_guard lock(connectionMutex_);connectionId_=std::move(id);connected_.store(true,std::memory_order_release);} }
void PeerClient::disconnect() noexcept { std::lock_guard lock(connectionMutex_); connected_.store(false,std::memory_order_release); connectionId_.clear(); }
bool PeerClient::encode(const rt::Snapshot&s,const std::string&p,const std::string&i,std::string& out){
  if(!validId(p)||!validId(i)||s.channels<1||s.channels>2||s.recentNoteCount>16)return false;
  char b[8192]; int n=std::snprintf(b,sizeof(b),"{\"type\":\"telemetry.snapshot\",\"projectId\":\"%s\",\"instanceId\":\"%s\",\"sequence\":%u,\"droppedSnapshots\":%u,\"aggregate\":{\"rms\":[%.8g%s%.8g],\"peak\":[%.8g%s%.8g],\"noteDensity\":%.8g,\"pitchClass\":[%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u],\"velocityBins\":[%u,%u,%u,%u,%u,%u,%u,%u],\"rhythmBins\":[%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u,%u],\"transport\":{\"playing\":%s,\"tempo\":%.8g,\"numerator\":%u,\"denominator\":%u}},\"recentNotes\":[",
  p.c_str(),i.c_str(),s.sequence,s.droppedSnapshots,s.rms[0],s.channels==2?",":"",s.channels==2?s.rms[1]:0,s.peak[0],s.channels==2?",":"",s.channels==2?s.peak[1]:0,s.noteDensity,
  s.pitchClass[0],s.pitchClass[1],s.pitchClass[2],s.pitchClass[3],s.pitchClass[4],s.pitchClass[5],s.pitchClass[6],s.pitchClass[7],s.pitchClass[8],s.pitchClass[9],s.pitchClass[10],s.pitchClass[11],
  s.velocityBins[0],s.velocityBins[1],s.velocityBins[2],s.velocityBins[3],s.velocityBins[4],s.velocityBins[5],s.velocityBins[6],s.velocityBins[7],
  s.rhythmBins[0],s.rhythmBins[1],s.rhythmBins[2],s.rhythmBins[3],s.rhythmBins[4],s.rhythmBins[5],s.rhythmBins[6],s.rhythmBins[7],s.rhythmBins[8],s.rhythmBins[9],s.rhythmBins[10],s.rhythmBins[11],s.rhythmBins[12],s.rhythmBins[13],s.rhythmBins[14],s.rhythmBins[15],s.playing?"true":"false",s.tempo,s.numerator,s.denominator);
  if(n<0||static_cast<size_t>(n)>=sizeof(b))return false; out.assign(b,n);
  for(uint8_t x=0;x<s.recentNoteCount;x++){const auto&q=s.recentNotes[x];char note[192];int z=std::snprintf(note,sizeof(note),"%s{\"offset\":%u,\"port\":%u,\"channel\":%u,\"key\":%u,\"velocity\":%.8g,\"kind\":\"%s\"}",x?",":"",q.offset,q.port,q.channel,q.key,q.velocity/255.0,q.kind?"on":"off");if(z<0||out.size()+z+3>=65536)return false;out.append(note,z);} out+="]}"; return out.size()<=65536;
}
bool PeerClient::pumpOnce(){rt::Snapshot s{};std::string target;{std::lock_guard lock(connectionMutex_);if(!connected())return false;target=connectionId_;}if(!source_.tryPop(s))return false;std::string line;if(!encode(s,projectId_,instanceId_,line)||!send_(target,line)){disconnect();return false;}return true;}
void PeerClient::run(){while(running_.load(std::memory_order_acquire)){if(!pumpOnce())std::this_thread::sleep_for(std::chrono::milliseconds(5));}}
}
