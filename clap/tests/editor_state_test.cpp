#include "PluginEditor.h"
#include "PluginProcessor.h"
#include "identity/InstanceState.h"
#include "model/UiState.h"

#include <cstdlib>
#include <iostream>
#include <memory>
#include <string_view>

namespace {
void check(bool condition, std::string_view message) {
  if (!condition) { std::cerr << message << '\n'; std::abort(); }
}
}

int main() {
  using namespace bw::ui;
  UiStateStore store;
  check(store.snapshot()->showContextStrip, "context strip must always render");
  check(store.snapshot()->showConversation, "conversation must always render");
  check(!store.snapshot()->showProposalDrawer, "empty proposal drawer must be absent");

  store.reduce(ConnectionChanged{"connected"});
  store.reduce(ScopeChanged{ScopeView{"project-a", "track hint", "inst-a", false}});
  store.reduce(LinkConfirmationPending{"nonce-a"});
  store.reduce(ProposalChanged{ProposalView{"proposal-a", 2, "clip-a", "inspect me"}});
  store.reduce(ArmChanged{"countdown", 3.5});
  auto snapshot = store.snapshot();
  check(snapshot->connection == "connected" && snapshot->link == "pending", "truthful connection/link state");
  check(snapshot->scope.projectId == "project-a" && !snapshot->scope.confirmed, "hint must not imply confirmed scope");
  check(snapshot->showProposalDrawer && snapshot->proposal->revision == 2, "inspectable proposal drawer");
  check(snapshot->scheduler == "countdown" && snapshot->countdownBeats == 3.5, "countdown visible");

  store.reduce(ScopeChanged{ScopeView{"project-a", "track hint", "inst-a", true, "clip-a"}});
  snapshot = store.snapshot();
  check(snapshot->scope.confirmed && snapshot->link == "confirmed", "confirmed link must rebind visible scope");
  check(snapshot->confirmationNonce.empty(), "confirmed link must consume pending nonce");

  std::string peerMessage;
  check(encodePeerAction(UiAction::linkConfirmRequest(), peerMessage) && peerMessage == "{\"type\":\"link.confirm.request\"}", "link request wire encoding");
  UiStateStore peerStore;
  check(reducePeerMessage(peerStore, "{\"type\":\"link.confirm.pending\",\"nonce\":\"nonce-a\",\"scope\":{\"projectId\":\"project-a\",\"instanceId\":\"inst-a\",\"trackSid\":\"trk_0123456789abcdef\",\"trackHint\":\"Bass 2\"}}"), "pending peer response reducer");
  check(peerStore.snapshot()->confirmationNonce == "nonce-a" && peerStore.snapshot()->scope.trackHint == "Bass 2", "pending scope must be visible");
  check(encodePeerAction(UiAction::linkConfirmAccept(peerStore.snapshot()->confirmationNonce), peerMessage) && peerMessage.find("link.confirm.accept") != std::string::npos, "link accept wire encoding");
  check(reducePeerMessage(peerStore, "{\"type\":\"link.status\",\"status\":\"confirmed\",\"scope\":{\"projectId\":\"project-a\",\"instanceId\":\"inst-a\",\"trackSid\":\"trk_0123456789abcdef\",\"trackHint\":\"Bass 2\"}}"), "confirmed peer response reducer");
  check(peerStore.snapshot()->scope.confirmed && peerStore.snapshot()->confirmationNonce.empty(), "confirmed peer response must consume nonce");

  auto analyzeAction = UiAction::analyze();
  analyzeAction.projectId = "project-a";
  analyzeAction.instanceId = "inst-a";
  analyzeAction.clipSid = "clip-a";
  analyzeAction.token = "analysis-1";
  check(encodePeerAction(analyzeAction, peerMessage), "Analyze must encode for the confirmed visible scope");
  check(peerMessage == "{\"type\":\"analysis.request\",\"requestId\":\"analysis-1\",\"scope\":{\"projectId\":\"project-a\",\"instanceId\":\"inst-a\",\"clipSid\":\"clip-a\"}}", "Analyze wire scope mismatch");
  check(reducePeerMessage(peerStore, "{\"type\":\"analysis.status\",\"requestId\":\"analysis-1\",\"status\":\"running\",\"scope\":{\"projectId\":\"project-a\",\"instanceId\":\"inst-a\",\"clipSid\":\"clip-a\"}}"), "analysis running response reducer");
  check(peerStore.snapshot()->analysis == "running" && peerStore.snapshot()->session == "open", "Analyze must visibly leave idle");
  check(reducePeerMessage(peerStore, "{\"type\":\"analysis.complete\",\"requestId\":\"analysis-1\",\"status\":\"error\",\"error\":\"analysis_failed\"}"), "analysis failure response reducer");
  check(peerStore.snapshot()->analysis == "error: analysis_failed", "Analyze failure must be visible");
  check(reducePeerMessage(peerStore, "{\"type\":\"analysis.complete\",\"requestId\":\"analysis-2\",\"status\":\"error\",\"error\":\"analysis_auth_required\"}"), "analysis auth response reducer");
  check(peerStore.snapshot()->analysis == "error: analysis_auth_required", "actionable Analyze auth failure must be visible");
  check(reducePeerMessage(peerStore, "{\"type\":\"session.fork.confirmation_required\",\"token\":\"fork-token\",\"sourceProjectId\":\"project-a\",\"newProjectId\":\"project-b\",\"instanceIds\":[\"inst-a\"]}"), "fork confirmation response reducer");
  check(peerStore.snapshot()->fork == "confirmation pending" && peerStore.snapshot()->forkConfirmation.has_value(), "fork confirmation must become visible pending state");
  const auto pendingFork = *peerStore.snapshot()->forkConfirmation;
  check(encodePeerAction(UiAction::forkConfirm(pendingFork.sourceProjectId, pendingFork.newProjectId, pendingFork.token), peerMessage), "pending fork must encode its exact confirmation");
  check(peerMessage == "{\"type\":\"session.fork.confirm\",\"sourceProjectId\":\"project-a\",\"newProjectId\":\"project-b\",\"token\":\"fork-token\"}", "fork confirmation wire mismatch");
  check(reducePeerMessage(peerStore, "{\"type\":\"ProjectForkCommitted\",\"sourceProjectId\":\"project-a\",\"newProjectId\":\"project-b\",\"instanceIds\":[\"inst-a\"],\"lineageVersion\":2}"), "fork commit response reducer");
  check(peerStore.snapshot()->scope.projectId == "project-b" && peerStore.snapshot()->fork == "committed" && !peerStore.snapshot()->forkConfirmation, "fork commit must rebind visible project and consume pending confirmation");

  UiActionQueue actions;
  check(actions.enqueue(UiAction::analyze()), "Analyze must be hosted action");
  check(actions.enqueue(UiAction::stop()), "Stop must be hosted action");
  check(actions.enqueue(UiAction::linkConfirmRequest()), "link confirmation request action");
  check(actions.enqueue(UiAction::linkConfirmAccept("nonce-a")), "link confirmation accept action");
  check(actions.enqueue(UiAction::focusSet("project-a", "inst-a", "clip-a")), "focus action");
  check(actions.enqueue(UiAction::forkConfirm("source-a", "fork-a", "fork-token")), "fork confirmation action");

  bw::PluginProcessor processor;
  bool generatedMix = false;
  for (auto* parameter : processor.getParameters()) {
    const auto name = parameter->getName(128).toStdString();
    check(name != "Analyze" && name != "Stop", "Analyze/Stop must not be parameters");
    if (name == "Generated Mix") {
      generatedMix = true;
      check(parameter->isAutomatable(), "musical control must be automatable");
      parameter->setValue(0.375F);
      check(parameter->getValue() > 0.3F && parameter->getValue() < 0.5F, "fractional musical automation");
    }
    if (name == "Connection Status" || name == "Session Status" || name == "Proposal Pending") {
      check(!parameter->isAutomatable(), "status/pending must be read-only non-automatable");
    }
  }
  check(generatedMix, "Generated Mix parameter missing");
  std::unique_ptr<juce::AudioProcessorEditor> editor(processor.createEditor());
  check(processor.hasEditor() && editor != nullptr, "hosted editor unavailable");

  juce::MemoryBlock saved;
  processor.getStateInformation(saved);
  bw::PluginProcessor reopened;
  reopened.setStateInformation(saved.getData(), static_cast<int>(saved.getSize()));
  auto* reopenedMix = reopened.getParameters().getLast();
  check(reopenedMix->getValue() > 0.3F && reopenedMix->getValue() < 0.5F, "musical setting did not reopen");

  bw::identity::InstanceState persistedIdentity(
      "inst-persisted-reopen", {.generatedMix = 0.625F});
  const auto persistedBytes = persistedIdentity.serialize();
  bw::PluginProcessor identityReopened;
  identityReopened.setStateInformation(persistedBytes.data(),
                                       static_cast<int>(persistedBytes.size()));
  check(identityReopened.uiSnapshot()->scope.instanceId ==
            "inst-persisted-reopen",
        "persisted instance identity did not reach live processor scope");
  return 0;
}
