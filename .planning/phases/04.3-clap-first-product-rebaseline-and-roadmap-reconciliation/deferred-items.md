# Deferred Items — Phase 04.3

## 2026-08-21 (discovered during 04.3-01 execution)

- **REQUIREMENTS.md traceability Status column is stale for marked-complete requirements.** `requirements.mark-complete RB-01 RB-02 RB-05` checked the `### Requirements` checkboxes (authoritative) but the `## Requirement Traceability` table rows still read `Pending`. This matches the pre-existing state of older completed requirements (BRIDGE-01/02/03, PROBE-01 rows equally read `Pending` while only the 04.2 D-* rows read `Complete`), so it is a tooling/convention gap outside this plan's scope — not a regression introduced by 04.3-01. Candidate fix: extend the `requirements.mark-complete` handler to also rewrite the traceability table Status cell.
