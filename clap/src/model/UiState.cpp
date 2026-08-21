#include "model/UiState.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <limits>
#include <type_traits>

namespace bw::ui {
namespace {

using Object = juce::DynamicObject;

bool validPeerId(const std::string& value) {
  if (value.empty() || value.size() > 64) return false;
  return std::all_of(value.begin(), value.end(), [](const unsigned char c) {
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
           (c >= '0' && c <= '9') || c == '.' || c == '_' || c == ':' || c == '-';
  });
}

bool validDigest(const std::string& value) {
  return value.size() == 64 && std::all_of(value.begin(), value.end(), [](const unsigned char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
  });
}

juce::var parseJson(const std::string& message) {
  if (message.empty() || message.size() > 65'536) return {};
  return juce::JSON::parse(juce::String::fromUTF8(message.data(), static_cast<int>(message.size())));
}

juce::var property(const Object* object, const char* name) {
  return object ? object->getProperty(juce::Identifier(name)) : juce::var{};
}

bool stringProperty(const Object* object, const char* name, std::string& output) {
  const auto value = property(object, name);
  if (!value.isString()) return false;
  output = value.toString().toStdString();
  return true;
}

bool integerProperty(const Object* object, const char* name, std::int64_t& output) {
  const auto value = property(object, name);
  if (!value.isInt() && !value.isInt64()) return false;
  output = static_cast<juce::int64>(value);
  return true;
}

bool numberProperty(const Object* object, const char* name, double& output) {
  const auto value = property(object, name);
  if (!value.isInt() && !value.isInt64() && !value.isDouble()) return false;
  output = static_cast<double>(value);
  return std::isfinite(output);
}

bool boolProperty(const Object* object, const char* name, bool& output) {
  const auto value = property(object, name);
  if (!value.isBool()) return false;
  output = static_cast<bool>(value);
  return true;
}

struct WireScope { std::string projectId, instanceId, clipSid; };

bool parseScope(const juce::var& value, WireScope& scope, const bool requireClip = false) {
  const auto* object = value.getDynamicObject();
  if (!object || !stringProperty(object, "projectId", scope.projectId) ||
      !stringProperty(object, "instanceId", scope.instanceId) ||
      !validPeerId(scope.projectId) || !validPeerId(scope.instanceId)) return false;
  const auto clip = property(object, "clipSid");
  if (clip.isVoid()) return !requireClip;
  if (!clip.isString()) return false;
  scope.clipSid = clip.toString().toStdString();
  return validPeerId(scope.clipSid);
}

bool sameScope(const ProposalView& proposal, const ApprovalView& approval) {
  return proposal.proposalId == approval.proposalId && proposal.revision == approval.revision &&
         proposal.projectId == approval.projectId && proposal.instanceId == approval.instanceId &&
         proposal.clipSid == approval.clipSid && proposal.digest == approval.digest;
}

std::string scopeJson(const std::string& projectId, const std::string& instanceId,
                      const std::string& clipSid) {
  std::string result = "{\"projectId\":\"" + projectId + "\",\"instanceId\":\"" + instanceId + "\"";
  if (!clipSid.empty()) result += ",\"clipSid\":\"" + clipSid + "\"";
  result += "}";
  return result;
}

template <std::size_t Size>
bool copyId(const std::string& value, std::array<char, Size>& destination) {
  if (!validPeerId(value) || value.size() >= Size) return false;
  destination.fill(0);
  std::copy(value.begin(), value.end(), destination.begin());
  return true;
}

std::atomic<std::uint64_t> analysisSequence{0};
std::atomic<std::uint64_t> reviewSequence{0};

}  // namespace

UiStateStore::UiStateStore() : snapshot_(std::make_shared<const UiState>()) {}

std::shared_ptr<const UiState> UiStateStore::snapshot() const {
  std::lock_guard lock(mutex_);
  return snapshot_;
}

void UiStateStore::reduce(const UiEvent& event) {
  std::lock_guard lock(mutex_);
  auto next = std::make_shared<UiState>(*snapshot_);
  std::visit([&](const auto& value) {
    using T = std::decay_t<decltype(value)>;
    if constexpr (std::is_same_v<T, ConnectionChanged>) next->connection = value.value;
    else if constexpr (std::is_same_v<T, ScopeChanged>) {
      next->scope = value.value;
      if (value.value.confirmed) { next->link = "confirmed"; next->confirmationNonce.clear(); }
    } else if constexpr (std::is_same_v<T, LinkConfirmationPending>) {
      next->link = "pending"; next->confirmationNonce = value.nonce;
    } else if constexpr (std::is_same_v<T, ForkConfirmationPending>) {
      next->forkConfirmation = value.value; next->fork = "confirmation pending";
    } else if constexpr (std::is_same_v<T, ForkCommitted>) {
      if (next->scope.projectId == value.sourceProjectId) next->scope.projectId = value.newProjectId;
      next->forkConfirmation.reset(); next->fork = "committed";
    } else if constexpr (std::is_same_v<T, ForkFailed>) {
      next->forkConfirmation.reset(); next->fork = "error: " + value.error;
    }     else if constexpr (std::is_same_v<T, SessionChanged>) next->session = value.value;
    else if constexpr (std::is_same_v<T, AnalysisChanged>) next->analysis = value.value;
    else if constexpr (std::is_same_v<T, ConversationChunkReceived>) {
      if (next->lastChunkRequestId == value.requestId && value.sequence == next->lastChunkSequence + 1)
        next->analysis += "\n" + value.text;
      else next->analysis = value.text;
      next->lastChunkRequestId = value.requestId; next->lastChunkSequence = value.sequence;
    }
    else if constexpr (std::is_same_v<T, ProposalChanged>) {
      next->proposal = value.value; next->showProposalDrawer = value.value.has_value();
      next->approvalGrant.reset(); next->approval = "none";
    } else if constexpr (std::is_same_v<T, ApprovalIssued>) {
      next->approvalGrant = value.value; next->approval = "ready";
    } else if constexpr (std::is_same_v<T, ApprovalChanged>) {
      next->approval = value.value;
      if (value.value != "ready") next->approvalGrant.reset();
    } else if constexpr (std::is_same_v<T, ArmChanged>) {
      next->scheduler = value.value; next->countdownBeats = value.beats;
    } else if constexpr (std::is_same_v<T, HealthChanged>) {
      next->droppedSnapshots = value.dropped; next->error = value.error;
    }
  }, event);
  snapshot_ = std::move(next);
}

UiAction UiAction::analyze(std::string projectId, std::string instanceId, std::string clipSid) {
  UiAction action{.kind = Kind::analyze};
  action.projectId = std::move(projectId); action.instanceId = std::move(instanceId);
  action.clipSid = std::move(clipSid);
  action.token = "analysis-" + std::to_string(analysisSequence.fetch_add(1, std::memory_order_relaxed) + 1);
  return action;
}

UiAction UiAction::arrangementReview(std::string projectId, std::string instanceId, std::string clipSid, bool refresh) {
  UiAction action{.kind = Kind::arrangementReview};
  action.projectId = std::move(projectId); action.instanceId = std::move(instanceId);
  action.clipSid = std::move(clipSid); action.refresh = refresh;
  action.token = "review-" + std::to_string(reviewSequence.fetch_add(1, std::memory_order_relaxed) + 1);
  return action;
}

UiAction UiAction::stop(std::string projectId) {
  UiAction action{.kind = Kind::stop}; action.projectId = std::move(projectId); return action;
}
UiAction UiAction::linkConfirmRequest() { return {.kind = Kind::linkConfirmRequest}; }
UiAction UiAction::linkConfirmAccept(std::string token) { return {.kind = Kind::linkConfirmAccept, .token = std::move(token)}; }
UiAction UiAction::focusSet(std::string projectId, std::string instanceId, std::string clipSid) {
  UiAction action{.kind = Kind::focusSet}; action.projectId = std::move(projectId);
  action.instanceId = std::move(instanceId); action.clipSid = std::move(clipSid); return action;
}
UiAction UiAction::forkRequest(std::string sourceProjectId, std::string newProjectId) {
  UiAction action{.kind = Kind::forkRequest}; action.sourceProjectId = std::move(sourceProjectId);
  action.newProjectId = std::move(newProjectId); return action;
}
UiAction UiAction::forkConfirm(std::string sourceProjectId, std::string newProjectId, std::string token) {
  UiAction action{.kind = Kind::forkConfirm}; action.sourceProjectId = std::move(sourceProjectId);
  action.newProjectId = std::move(newProjectId); action.token = std::move(token); return action;
}

UiAction UiAction::proposalApprove(const ProposalView& proposal) {
  UiAction action{.kind = Kind::proposalApprove};
  action.projectId = proposal.projectId; action.instanceId = proposal.instanceId;
  action.clipSid = proposal.clipSid; action.proposalId = proposal.proposalId;
  action.revision = proposal.revision; return action;
}

UiAction UiAction::proposalApprove(const ProposalView& proposal, const ApprovalView& approval) {
  auto action = proposalApprove(proposal);
  if (sameScope(proposal, approval)) { action.token = approval.token; action.digest = approval.digest; }
  return action;
}

UiAction UiAction::phraseArm(const ProposalView& proposal, const ApprovalView& approval) {
  auto action = proposalApprove(proposal, approval); action.kind = Kind::phraseArm; return action;
}

bool UiActionQueue::enqueue(UiAction action) {
  std::lock_guard lock(mutex_);
  if (queue_.size() >= kCapacity) return false;
  queue_.push_back(std::move(action)); return true;
}

bool UiActionQueue::tryPop(UiAction& action) {
  std::lock_guard lock(mutex_);
  if (queue_.empty()) return false;
  action = std::move(queue_.front()); queue_.pop_front(); return true;
}

bool encodePeerAction(const UiAction& action, std::string& message) {
  switch (action.kind) {
    case UiAction::Kind::analyze:
      if (!validPeerId(action.token) || !validPeerId(action.projectId) || !validPeerId(action.instanceId) ||
          (!action.clipSid.empty() && !validPeerId(action.clipSid))) return false;
      message = "{\"type\":\"analysis.request\",\"requestId\":\"" + action.token + "\",\"scope\":" +
                scopeJson(action.projectId, action.instanceId, action.clipSid) + "}";
      return true;
    case UiAction::Kind::stop:
      if (!validPeerId(action.projectId)) return false;
      message = "{\"type\":\"stop\",\"projectId\":\"" + action.projectId + "\",\"reason\":\"user\"}";
      return true;
    case UiAction::Kind::linkConfirmRequest:
      message = "{\"type\":\"link.confirm.request\"}"; return true;
    case UiAction::Kind::linkConfirmAccept:
      if (!validPeerId(action.token)) return false;
      message = "{\"type\":\"link.confirm.accept\",\"nonce\":\"" + action.token + "\"}"; return true;
    case UiAction::Kind::focusSet:
      if (!validPeerId(action.projectId) || !validPeerId(action.instanceId) ||
          (!action.clipSid.empty() && !validPeerId(action.clipSid))) return false;
      message = "{\"type\":\"focus.set\",\"scope\":" + scopeJson(action.projectId, action.instanceId, action.clipSid) + "}";
      return true;
    case UiAction::Kind::forkRequest:
      if (!validPeerId(action.sourceProjectId) || !validPeerId(action.newProjectId)) return false;
      message = "{\"type\":\"session.fork.request\",\"sourceProjectId\":\"" + action.sourceProjectId +
                "\",\"newProjectId\":\"" + action.newProjectId + "\"}"; return true;
    case UiAction::Kind::forkConfirm:
      if (!validPeerId(action.sourceProjectId) || !validPeerId(action.newProjectId) || !validPeerId(action.token)) return false;
      message = "{\"type\":\"session.fork.confirm\",\"sourceProjectId\":\"" + action.sourceProjectId +
                "\",\"newProjectId\":\"" + action.newProjectId + "\",\"token\":\"" + action.token + "\"}";
      return true;
    case UiAction::Kind::proposalApprove:
    case UiAction::Kind::phraseArm: {
      if (!validPeerId(action.proposalId) || action.revision == 0 || !validPeerId(action.projectId) ||
          !validPeerId(action.instanceId) || (!action.clipSid.empty() && !validPeerId(action.clipSid))) return false;
      const auto scope = scopeJson(action.projectId, action.instanceId, action.clipSid);
      if (action.token.empty() && action.kind == UiAction::Kind::proposalApprove) {
        message = "{\"type\":\"proposal.approval.request\",\"proposalId\":\"" + action.proposalId +
                  "\",\"revision\":" + std::to_string(action.revision) + ",\"scope\":" + scope + "}";
        return true;
      }
      if (!validPeerId(action.token) || !validDigest(action.digest)) return false;
      message = "{\"type\":\"approval.consume\",\"token\":\"" + action.token +
                "\",\"proposalId\":\"" + action.proposalId + "\",\"revision\":" +
                std::to_string(action.revision) + ",\"scope\":" + scope + ",\"digest\":\"" + action.digest + "\"}";
      return true;
    }
    case UiAction::Kind::arrangementReview:
      if (!validPeerId(action.token) || !validPeerId(action.projectId) || !validPeerId(action.instanceId) ||
          (!action.clipSid.empty() && !validPeerId(action.clipSid))) return false;
      message = "{\"type\":\"arrangement.review\",\"requestId\":\"" + action.token + "\",\"scope\":" +
                scopeJson(action.projectId, action.instanceId, action.clipSid) +
                ",\"refresh\":" + (action.refresh ? "true" : "false") + "}";
      return true;
  }
  return false;
}

std::string peerMessageType(const std::string& message) {
  const auto parsed = parseJson(message);
  std::string type;
  return stringProperty(parsed.getDynamicObject(), "type", type) ? type : std::string{};
}

bool reducePeerMessage(UiStateStore& store, const std::string& message) {
  const auto parsed = parseJson(message);
  const auto* object = parsed.getDynamicObject();
  std::string type;
  if (!object || !stringProperty(object, "type", type)) return false;

  if (type == "link.confirm.pending" || type == "link.status") {
    const auto scopeValue = property(object, "scope"); const auto* scopeObject = scopeValue.getDynamicObject();
    WireScope wire; if (!parseScope(scopeValue, wire)) return false;
    auto scope = store.snapshot()->scope; scope.projectId = wire.projectId; scope.instanceId = wire.instanceId;
    scope.clipSid = wire.clipSid.empty() ? std::nullopt : std::optional<std::string>(wire.clipSid);
    std::string trackSid, trackHint; stringProperty(scopeObject, "trackSid", trackSid); stringProperty(scopeObject, "trackHint", trackHint);
    scope.trackHint = trackHint.empty() ? trackSid : trackHint;
    std::string status; stringProperty(object, "status", status); scope.confirmed = type == "link.status" && status == "confirmed";
    store.reduce(ScopeChanged{std::move(scope)});
    if (type == "link.confirm.pending") { std::string nonce; if (!stringProperty(object, "nonce", nonce)) return false; store.reduce(LinkConfirmationPending{nonce}); }
    return true;
  }
  if (type == "focus.status") {
    WireScope wire; if (!parseScope(property(object, "scope"), wire)) return false;
    auto scope = store.snapshot()->scope; scope.projectId = wire.projectId; scope.instanceId = wire.instanceId;
    scope.clipSid = wire.clipSid.empty() ? std::nullopt : std::optional<std::string>(wire.clipSid);
    store.reduce(ScopeChanged{std::move(scope)}); return true;
  }
  if (type == "session.fork.confirmation_required") {
    ForkConfirmationView pending;
    if (!stringProperty(object, "token", pending.token) || !stringProperty(object, "sourceProjectId", pending.sourceProjectId) ||
        !stringProperty(object, "newProjectId", pending.newProjectId)) return false;
    store.reduce(ForkConfirmationPending{std::move(pending)}); return true;
  }
  if (type == "ProjectForkCommitted") {
    std::string source, target;
    if (!stringProperty(object, "sourceProjectId", source) || !stringProperty(object, "newProjectId", target)) return false;
    store.reduce(ForkCommitted{source, target}); return true;
  }
  if (type == "analysis.status") {
    std::string status; if (!stringProperty(object, "status", status)) return false;
    store.reduce(SessionChanged{"open"}); store.reduce(AnalysisChanged{status}); return true;
  }
  if (type == "conversation.chunk") {
    std::string requestId, text; std::int64_t sequence{};
    if (!stringProperty(object, "requestId", requestId) || requestId.empty() ||
        !integerProperty(object, "sequence", sequence) || sequence < 0 || sequence > 65'535 ||
        !stringProperty(object, "text", text) || text.size() > 512) return false;
    store.reduce(ConversationChunkReceived{std::move(requestId), sequence, std::move(text)}); return true;
  }
  if (type == "analysis.complete") {
    std::string status, error, requestId; if (!stringProperty(object, "status", status)) return false;
    stringProperty(object, "error", error);
    stringProperty(object, "requestId", requestId);
    if (status == "ok" && !requestId.empty() && requestId == store.snapshot()->lastChunkRequestId) return true;
    store.reduce(AnalysisChanged{status == "error" ? "error: " + (error.empty() ? "analysis_failed" : error) : status}); return true;
  }
  if (type == "proposal.publish") {
    ProposalView proposal; std::int64_t revision{}; WireScope wire;
    if (!stringProperty(object, "proposalId", proposal.proposalId) || !integerProperty(object, "revision", revision) ||
        revision < 1 || revision > std::numeric_limits<std::uint32_t>::max() || !stringProperty(object, "kind", proposal.kind) ||
        !parseScope(property(object, "scope"), wire) || !stringProperty(object, "rationale", proposal.rationale) ||
        !stringProperty(object, "digest", proposal.digest) || !validPeerId(proposal.proposalId) || !validDigest(proposal.digest)) return false;
    const auto assumptionsValue = property(object, "assumptions"); const auto* assumptions = assumptionsValue.getArray();
    if (!assumptions || assumptions->size() > 8 || proposal.rationale.empty() || proposal.rationale.size() > 512) return false;
    for (const auto& assumption : *assumptions) {
      if (!assumption.isString()) return false;
      const auto text = assumption.toString(); if (text.isEmpty() || text.length() > 256) return false;
    }
    const auto materialValue = property(object, "material"); const auto* material = materialValue.getDynamicObject();
    if (!material || (proposal.kind != "existing_edit" && proposal.kind != "live_midi")) return false;
    std::string materialId;
    if (proposal.kind == "existing_edit") {
      if (!stringProperty(material, "patchId", materialId) || !validPeerId(materialId)) return false;
    } else if (!stringProperty(material, "phraseId", materialId) || !validPeerId(materialId)) return false;
    proposal.assumptionsSummary = juce::JSON::toString(assumptionsValue, true).toStdString();
    proposal.materialSummary = juce::JSON::toString(materialValue, true).toStdString();
    proposal.revision = static_cast<std::uint32_t>(revision); proposal.projectId = wire.projectId;
    proposal.instanceId = wire.instanceId; proposal.clipSid = wire.clipSid;
    const auto current = store.snapshot()->scope;
    if (!current.confirmed || current.projectId != proposal.projectId || current.instanceId != proposal.instanceId ||
        current.clipSid.value_or("") != proposal.clipSid) return false;
    store.reduce(ProposalChanged{std::move(proposal)}); return true;
  }
  if (type == "approval.issue") {
    ApprovalView approval; std::int64_t revision{}, expiresAt{}; WireScope wire;
    if (!stringProperty(object, "token", approval.token) || !stringProperty(object, "proposalId", approval.proposalId) ||
        !integerProperty(object, "revision", revision) || revision < 1 || revision > std::numeric_limits<std::uint32_t>::max() ||
        !parseScope(property(object, "scope"), wire) || !stringProperty(object, "digest", approval.digest) ||
        !integerProperty(object, "expiresAt", expiresAt) || expiresAt < 0 || !validPeerId(approval.token) ||
        !validPeerId(approval.proposalId) || !validDigest(approval.digest)) return false;
    approval.revision = static_cast<std::uint32_t>(revision); approval.projectId = wire.projectId;
    approval.instanceId = wire.instanceId; approval.clipSid = wire.clipSid;
    const auto proposal = store.snapshot()->proposal;
    if (!proposal || !sameScope(*proposal, approval)) return false;
    store.reduce(ApprovalIssued{std::move(approval)}); return true;
  }
  if (type == "approval.result") {
    std::string proposalId; bool ok{};
    if (!stringProperty(object, "proposalId", proposalId) || !boolProperty(object, "ok", ok)) return false;
    const auto proposal = store.snapshot()->proposal; if (!proposal || proposal->proposalId != proposalId) return false;
    std::string error; stringProperty(object, "error", error);
    store.reduce(ApprovalChanged{ok ? "approved" : "error: " + (error.empty() ? "consumed" : error)}); return true;
  }
  if (type == "phrase.arm") {
    store.reduce(ApprovalChanged{"consumed"}); store.reduce(ArmChanged{"armed", 0}); return true;
  }
  if (type == "phrase.status") {
    std::string status; if (!stringProperty(object, "status", status)) return false;
    store.reduce(ArmChanged{status, 0}); return true;
  }
  if (type == "phrase.disarm" || type == "stop") {
    store.reduce(ApprovalChanged{"none"}); store.reduce(ArmChanged{"stopped", 0}); return true;
  }
  if (type == "action.error") {
    std::string error; if (!stringProperty(object, "error", error)) return false;
    if (error.rfind("fork_", 0) == 0) store.reduce(ForkFailed{error});
    store.reduce(HealthChanged{store.snapshot()->droppedSnapshots, error}); store.reduce(AnalysisChanged{"error: " + error}); return true;
  }
  return false;
}

bool decodeArmedPhrase(const std::string& message, rt::ArmedPhrase& phrase) {
  const auto parsed = parseJson(message); const auto* object = parsed.getDynamicObject();
  std::string type, armToken, proposalId, phraseId, launch; std::int64_t revision{}; double lengthBeats{}; WireScope scope;
  if (!object || !stringProperty(object, "type", type) || type != "phrase.arm" ||
      !stringProperty(object, "armToken", armToken) || !validPeerId(armToken) ||
      !stringProperty(object, "proposalId", proposalId) || !validPeerId(proposalId) ||
      !integerProperty(object, "revision", revision) || revision < 1 || revision > std::numeric_limits<std::uint32_t>::max() ||
      !stringProperty(object, "phraseId", phraseId) || !parseScope(property(object, "scope"), scope, true) ||
      !stringProperty(object, "launch", launch) || (launch != "next_beat" && launch != "next_bar") ||
      !numberProperty(object, "lengthBeats", lengthBeats) || lengthBeats <= 0 || lengthBeats > 64) return false;
  const auto notesValue = property(object, "notes"); const auto* notes = notesValue.getArray();
  if (!notes || notes->isEmpty() || notes->size() > static_cast<int>(rt::kMaxPhraseNotes)) return false;

  rt::ArmedPhrase decoded{};
  if (!copyId(phraseId, decoded.phraseId) || !copyId(scope.projectId, decoded.projectId) ||
      !copyId(scope.instanceId, decoded.instanceId) || !copyId(scope.clipSid, decoded.clipSid)) return false;
  decoded.revision = static_cast<std::uint32_t>(revision);
  decoded.launch = launch == "next_bar" ? rt::LaunchQuantization::nextBar : rt::LaunchQuantization::nextBeat;
  decoded.lengthBeats = lengthBeats; decoded.noteCount = static_cast<std::uint8_t>(notes->size());
  for (int index = 0; index < notes->size(); ++index) {
    const auto* note = (*notes)[index].getDynamicObject(); std::int64_t ordinal{}, port{}, channel{}, key{}, noteId{};
    double start{}, duration{}, velocity{};
    if (!note || !integerProperty(note, "ordinal", ordinal) || ordinal < 0 || ordinal >= static_cast<std::int64_t>(rt::kMaxPhraseNotes) ||
        !numberProperty(note, "startBeats", start) || start < 0 || start > 64 ||
        !numberProperty(note, "durationBeats", duration) || duration <= 0 || duration > 64 ||
        !integerProperty(note, "port", port) || port < 0 || port > 255 ||
        !integerProperty(note, "channel", channel) || channel < 0 || channel > 15 ||
        !integerProperty(note, "key", key) || key < 0 || key > 127 ||
        !numberProperty(note, "velocity", velocity) || velocity < 0 || velocity > 1 ||
        !integerProperty(note, "noteId", noteId) || noteId < -1 || noteId > std::numeric_limits<std::int32_t>::max()) return false;
    decoded.notes[static_cast<std::size_t>(index)] = {
      static_cast<std::uint8_t>(ordinal), start, duration, static_cast<std::uint8_t>(port),
      static_cast<std::uint8_t>(channel), static_cast<std::uint8_t>(key), static_cast<float>(velocity), static_cast<std::int32_t>(noteId),
    };
  }
  phrase = decoded; return true;
}

}  // namespace bw::ui
