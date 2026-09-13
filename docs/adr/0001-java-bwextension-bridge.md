# ADR-0001: Java `.bwextension` bridge; JS controller scripts ruled out

## Status

Accepted (2026-06-26, Phase 1 spike)

## Context

bw-brain needs a long-running process inside Bitwig that can observe project state and reach the network (localhost TCP to the daemon). Bitwig offers two paths: ControllerScript (JavaScript via JsApi) and `.bwextension` (Java, extension-api 21). The spike hoped to prototype in JS for iteration speed.

## Decision

The bridge is a Java `.bwextension` from day one. JS prototyping was ruled out by live probe: the JS `host` object exposes **no networking or file I/O** — it cannot open the required transport. Java is the official extension path, gives type safety and long-running stability, and matches the reference build (DrivenByMoss: extension-api 21, JDK 21, Maven shade → `.bwextension`).

## Consequences

- JDK 21 + Maven are required toolchain; the shaded jar is renamed to `.bwextension` and installed into Bitwig.
- A stale-artifact gate (`scripts/check-bridge-artifact.mjs`) prevents shipping an outdated `.bwextension` (regression class from the Phase-03.1 UAT).
- The deprecated-API gate (`scripts/check-deprecated-bridge.mjs`) catches extension-api deprecations at verification time.
- ControllerScript JS remains usable for throwaway in-app capability probes only (see `docs/bitwig-capabilities.md` Observed fields).
