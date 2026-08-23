# Deferred Items — Phase 5

## 2026-08-22 · Plan 05-02 (out-of-scope working-tree discovery)

- **`spike/automation-write-probe.control.js` shows an unstaged deletion in the working tree** (`git status` → ` D`). The producer removed the local copy after the live probe sessions; the file is fully preserved in git history at `cc73913` (recoverable via `git checkout cc73913 -- spike/automation-write-probe.control.js` if the end-of-phase UAT wants to re-run the JS probe). Not committed here deliberately: deleting the throwaway is a producer decision (Phase-1 precedent `618ab0c` deleted spike/ via a dedicated chore commit AFTER patterns were replicated), and sweeping the deletion into the docs commit would conflate concerns. Surface to the producer at phase close-out.

## 2026-08-22 · Plan 05-02 (evidence follow-up, tracked in docs)

- **Java-side `Device.getParameter(int)` live check** — the JS API hard-throws (deprecated-since-v2); the 05-03 Java path compiled with graceful per-index try/catch. Whether the Java host degrades gracefully or throws identically is flagged in `docs/bitwig-capabilities.md` §3/§4 for the end-of-phase UAT (05-10).
- **Launcher-armed write cells UNVERIFIED** — launchWrite was never armed during the live sessions; clip-targeted automation stays `ambiguous_target`-refused pending evidence (D-05-06).
