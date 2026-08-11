#include "PluginEditor.h"
#include "PluginProcessor.h"
#include "model/UiState.h"

#include <cstdlib>
#include <iostream>
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

  UiActionQueue actions;
  check(actions.enqueue(UiAction::analyze()), "Analyze must be hosted action");
  check(actions.enqueue(UiAction::stop()), "Stop must be hosted action");
  check(actions.enqueue(UiAction::linkConfirmAccept("nonce-a")), "link confirmation action");
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
      parameter->setValueNotifyingHost(0.375F);
      check(parameter->getValue() > 0.37F && parameter->getValue() < 0.38F, "fractional musical automation");
    }
    if (name == "Connection Status" || name == "Session Status" || name == "Proposal Pending") {
      check(!parameter->isAutomatable(), "status/pending must be read-only non-automatable");
    }
  }
  check(generatedMix, "Generated Mix parameter missing");
  check(processor.hasEditor() && processor.createEditor() != nullptr, "hosted editor unavailable");

  juce::MemoryBlock saved;
  processor.getStateInformation(saved);
  bw::PluginProcessor reopened;
  reopened.setStateInformation(saved.getData(), static_cast<int>(saved.getSize()));
  auto* reopenedMix = reopened.getParameters().back();
  check(reopenedMix->getValue() > 0.37F && reopenedMix->getValue() < 0.38F, "musical setting did not reopen");
  return 0;
}
