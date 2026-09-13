# ADR-0008: Genre profiles enhance, never gate; generic core is literal

## Status

Accepted (2026-07, Phase 3; reaffirmed Phase 5)

## Context

Musical transforms need genre-sensitive bias (e.g. techno density), but hard-coding genre assumptions into the reasoning core would make the assistant wrong outside its first genre.

## Decision

The reasoning core is generic; genre knowledge is a **pluggable profile**. `loadProfile()` returns the neutral `generic.json` literally when no profile is selected — a profileless run is a real supported mode, not a missing config. Profiles add bias (weights, shapes, thresholds) and can only enhance behavior; absence of a profile never refuses work (enhance-never-gate). Electronic/techno is the first profile, not the architecture.

Unknown profile names degrade to unbiased ordering rather than refusing. Schema optionality (e.g. `automationShapes` present in both profiles, neutral in generic) keeps absence valid and consumers byte-identical between generic and profileless runs.

## Consequences

- Profile consumers default defensively (`ctx.profile?.x ?? DEFAULT`) so neutral runs stay byte-identical.
- Bias provenance is honest: uniform weights mean "no bias applied AND no bias claimed".
