#pragma once
#include <cstdint>
#include <deque>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <variant>
namespace bw::ui {
struct ScopeView { std::string projectId, trackHint, instanceId; bool confirmed{}; std::optional<std::string> clipSid; };
struct ProposalView { std::string proposalId; int revision{}; std::string clipSid, rationale; };
struct UiState { bool showContextStrip{true},showConversation{true},showProposalDrawer{};std::string connection{"disconnected"},link{"unlinked"},session{"closed"},analysis{"idle"},approval{"none"},scheduler{"idle"},error{},confirmationNonce{};std::uint32_t droppedSnapshots{};double countdownBeats{};ScopeView scope{};std::optional<ProposalView> proposal; };
struct ConnectionChanged{std::string value;};struct ScopeChanged{ScopeView value;};struct LinkConfirmationPending{std::string nonce;};struct SessionChanged{std::string value;};struct AnalysisChanged{std::string value;};struct ProposalChanged{std::optional<ProposalView> value;};struct ApprovalChanged{std::string value;};struct ArmChanged{std::string value;double beats{};};struct HealthChanged{std::uint32_t dropped{};std::string error;};
using UiEvent=std::variant<ConnectionChanged,ScopeChanged,LinkConfirmationPending,SessionChanged,AnalysisChanged,ProposalChanged,ApprovalChanged,ArmChanged,HealthChanged>;
class UiStateStore final{public:UiStateStore();void reduce(const UiEvent&);std::shared_ptr<const UiState> snapshot()const;private:mutable std::mutex mutex_;std::shared_ptr<const UiState> snapshot_;};
struct UiAction{enum class Kind{analyze,stop,linkConfirmAccept,focusSet,forkRequest,forkConfirm,proposalApprove,phraseArm};Kind kind{};std::string projectId,instanceId,clipSid,token,sourceProjectId,newProjectId,proposalId;int revision{};static UiAction analyze();static UiAction stop();static UiAction linkConfirmAccept(std::string);static UiAction focusSet(std::string,std::string,std::string={});static UiAction forkRequest(std::string,std::string);static UiAction forkConfirm(std::string,std::string,std::string);};
class UiActionQueue final{public:static constexpr std::size_t kCapacity=32;bool enqueue(UiAction);bool tryPop(UiAction&);private:std::mutex mutex_;std::deque<UiAction> queue_;};
}
