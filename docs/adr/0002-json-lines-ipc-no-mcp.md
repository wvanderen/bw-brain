# ADR-0002: Thin JSON-Lines IPC over loopback TCP; no MCP

## Status

Accepted (2026-06, Phase 1)

## Context

The bridge (in-Bitwig JVM) and the daemon (TypeScript, outside) need a bidirectional protocol for events (`selection.changed`), pulls (`get.selected_clip`), and edit requests (`apply.patch`). A tool-registry protocol (MCP) was considered.

## Decision

Newline-delimited JSON over localhost TCP, versioned messages, JSON Schema 2020-12 as the single cross-language contract (hand-authored in `schemas/`, Ajv validates at the daemon boundary, Jackson parses in the bridge). No MCP.

Transport discipline:

- Loopback bind is constructor-enforced (`TcpServerTransport` throws on any host ≠ 127.0.0.1).
- The reader consumes only a `Transport` interface (TCP + stdio implementations), so framing is reusable.
- Explicit backpressure: observational events drop-oldest with a dropped notice; edits/requests never drop.
- CLI↔daemon uses a UDS query channel (0600) with stale-socket probe-and-unlink (crashed-daemon stale sockets are the common case).

## Consequences

- The contract is inspectable (`nc localhost 7878 | jq -c`) and composable from bash.
- Pure JSON Schema 2020-12 only: no `$data`/cross-property keywords that Jackson cannot express (e.g. note-identity invariants are enforced in code + property tests, not schema).
- Ajv 2020-12 must be imported as `{ Ajv2020 }` from `ajv/dist/2020.js` under NodeNext.
