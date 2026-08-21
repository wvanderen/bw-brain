# bw-brain CLAP product support

## Platform status

| Platform | Automated status | Live Bitwig status |
|---|---|---|
| macOS | Product configure/build, complete CTest suite, bundle packaging, pinned `clap-validator`, daemon/Pi-lock, bridge JUnit, and isolated capability regression | **Live verified in Bitwig 6.0.11 on 2026-08-20 in together and per-plug-in/separate-process hosting** |
| Windows | Product configure/build, complete CTest suite, bundle packaging, pinned `clap-validator`, daemon/Pi-lock, bridge JUnit, and isolated capability regression in CI | **Live host unverified** |
| Linux | Product configure/build, complete CTest suite, bundle packaging, pinned `clap-validator`, daemon/Pi-lock, bridge JUnit, and isolated capability regression in CI | **Live host unverified** |

Passing CI does not imply live-host support. The macOS label is backed by the dated D-01–D-16 matrix in `04.2-UAT.md`; Windows and Linux require equivalent dated Bitwig evidence before that label changes.

## Build and evidence boundaries

- `clap/build` is the product configure, test, package, and validator root.
- `clap/build-capability` is the Phase 04.1 evidence root. It is configured and regressed separately and is never reused as product output.
- `scripts/validate-clap-product.sh` is the aggregate local and CI gate. It checks generated CLAP schema drift, the daemon Pi SDK lock and full test suite, bridge JUnit tests, all product CTests, the packaged product with the pinned validator, and the isolated capability regression.
- The validator is built from the immutable commit in `clap/cmake/dependency-lock.cmake`; no PATH-installed validator is accepted.

## Arrangement review (operator notes)

- The hosted **Review** action renders deterministic section, repetition, energy, track-role, and transition evidence from the arrangement snapshot into the conversation pane — it is analyzer output, not model output, and **works with no reasoning provider configured**.
- Every rendered evidence group carries its `pulledAt` freshness assumption; a review that requires a fresh grid pull is refused with `state_disconnected` when the bridge is down rather than silently rendering a stale snapshot.
- Arrangement observations are advisory: they carry no patch fields and cannot mutate the project. Escalation to mutation happens only through the existing proposal drawer approval path (Analyze → `preview_edit`/`create_proposal` → one-shot approval → controller `apply.patch` + journal).
- The external Pi `/review` ASCII-pane acceptance wording is superseded (2026-08-20 CLAP-first rebaseline); the `bw-arrange` CLI commands and the `/review` skill remain as secondary automation assets.

## Provider policy (local-first reasoning)

- **What stays local:** DAW integration, raw project state, authorization, persistence, and mutation. Non-AI inspection, arrangement review, and control continue to work with no reasoning provider configured.
- **Provider authority:** reasoning uses the Pi SDK agentDir configuration — verified at 0.84.0 to be `~/.pi/agent/` (overridable via `PI_CODING_AGENT_DIR`): `models.json` declares custom local or remote providers (`providers.<id>` with `baseUrl`/`api`/`models`), `auth.json` holds API keys/OAuth tokens (0600 permissions), and `settings.json` selects `defaultProvider`/`defaultModel`. The daemon passes no `model`/`modelRuntime`, so provider selection resolves entirely from these files, which live **outside this repo** and never receive repo-committed keys.
- **Egress bounds:** only bounded confirmed context is sent to the configured provider, and only after an explicit **Analyze** action. Raw audio never leaves the plug-in and never enters a Pi session.
- **Failure behavior:** provider absence or authentication failure surfaces as a bounded visible error state (`analysis_auth_required` / `analysis_model_unavailable`) — never a silent fallback to another provider, never a daemon crash, and raw SDK error strings (local paths, provider details) never cross the peer boundary.

## Release checklist

- [ ] Record a JUCE 8 release licensing disposition: AGPLv3, or a valid commercial JUCE license. This is a blocking release decision; a green build does not select a license.
- [x] Pass the complete dated macOS Bitwig 6.0.11 D-01–D-16 matrix in both supported hosting modes.
- [x] Confirm the installed bundle is the exact `clap/build` product artifact validated by the aggregate gate.
- [ ] Pass the focused CLAP arrangement review UAT (`04.3-UAT.md` in the Phase 04.3 planning directory) before any release labeling.
- [ ] Keep Windows and Linux labeled **live host unverified** until equivalent host evidence exists.
