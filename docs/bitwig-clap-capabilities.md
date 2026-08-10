# Bitwig CLAP Capability Evidence

This ledger records Phase 04.1 evidence only. It does not approve a production architecture or resolve Q1–Q4 without the later live and human gates.

## Toolchain and native dependency lock

**Reviewed:** 2026-08-06  
**Build isolation:** capability work configures only in `clap/build-capability`; `clap/build` is reserved for future product work and must remain absent.

| Dependency | Immutable commit | Upstream | License | Disposition |
|---|---|---|---|---|
| CLAP 1.2.4 | `00113aabdccf69c2e27ac269c35b369770e8fa73` | `https://github.com/free-audio/clap.git` | MIT | Reviewed capability dependency |
| JUCE 8.0.15 | `91ad83ae34a81e0833b1a2b0866f54846370ae53` | `https://github.com/juce-framework/JUCE.git` | AGPLv3 or commercial | Candidate framework; product licensing decision remains deferred |
| clap-juce-extensions | `c1a5ad025f95d01e03267857fa8276ebeed16500` | `https://github.com/free-audio/clap-juce-extensions.git` | MIT | Unofficial adapter; capability evidence required |
| clap-validator 0.4.1 | `152b9823e992d782c5c1fd33bca0295478b919aa` | `https://github.com/free-audio/clap-validator.git` | MIT | Approved evidence tool only |

The preflight records Apple clang, CMake, and Cargo versions. The validator is built from the pinned source with Cargo's lockfile and copied to `clap/build-capability/tools/clap-validator/clap-validator`; no PATH-installed validator is used.

## GATE-02 automated capability evidence

**Status:** automated proof complete; every result below is **pending live Bitwig confirmation**. This throwaway probe does not select a Phase 04.2 product branch.

| Surface | Automated observation | Live status |
|---|---|---|
| Audio | Mono/stereo helper paths preserve float and double samples bit-for-bit; the bundle advertises stereo 32/64-bit in-place and out-of-place pass-through | **Observed 2026-08-10:** transparent in Bitwig |
| MIDI | Note and MIDI events are forwarded with their original CLAP event header, including the sample offset | **Observed 2026-08-10:** transparent in Bitwig; sample-offset fidelity still needs a dedicated live measurement |
| State | Deterministic state round-trips; loading copied state demonstrates that persisted identity alone cannot distinguish reopen from duplication | **Observed 2026-08-10:** parameter state persists |
| Track info | Host track-info is queried when offered; absence is recorded explicitly rather than inferred from a track name | pending live |
| Editor lifecycle | The probe records create → show → resize → hide → destroy and advertises a resizable embedded Cocoa surface | **Confirmed 2026-08-10 after probe correction:** visible Cocoa child view embeds successfully and remains correct through resize and reopen |
| Parameter categories | Three compact candidates are distinguishable by flags: read-only connection status, non-automatable momentary Analyze action, and automatable Generated Mix | **Confirmed 2026-08-10 after probe correction:** Generated Mix accepts fractional values. Connection Status is visible but remains a probe placeholder; Analyze is absent from Bitwig's device panel |

The capability-only CTest and pinned `clap-validator` both pass from `clap/build-capability`. The production cache `clap/build` remains absent. The editor is lifecycle instrumentation, not product UI; parameter names and flags are candidates for host evaluation, not a Q3 fallback decision.

### Live observation — 2026-08-10

The capability plug-in loaded successfully after reinstalling the bridge extension and restarting Bitwig. The daemon and bridge were connected, but this throwaway probe contains no daemon client: its `Connection Status` value is initialized to zero and is not a connectivity measurement. The initial probe accepted Bitwig's Cocoa parent without attaching an `NSView`; commit `d5936a7` corrected the capability-only view lifecycle and parameter metadata. The live retest confirmed visible embedding, resize/reopen behavior, and fractional Generated Mix values.

These results favor the Q3 fallback in which genuinely automatable musical controls use ordinary continuous CLAP parameters, while status and actions live in the hosted plug-in UI. A read-only status parameter can appear in Bitwig's device panel, but a non-automatable momentary Analyze parameter is not surfaced there.

## GATE-03 automated Controller API evidence

**Recorded:** 2026-08-06
**Status:** automated API-surface proof complete; runtime values remain **pending live Bitwig confirmation**.

The existing controller TCP now accepts one additive read-only request, `get.clap_capabilities`. It reports only the already-observed selected-device name and explicit availability flags. The installed `extension-api:21` exposes `Project.isModified()`, but neither `Project` nor `DocumentState` exposes a definitive document name, filesystem path, stable document ID, or Save As event. The response therefore records those identity fields as `null` with `*Available: false` and records `saveAsObservable: false`; it never derives project identity from a track, device, or display name.

The capability dispatcher recognizes only `get.clap_capabilities`. Mutation-shaped requests such as `apply.patch` and `set.project` are not dispatchable through it. The pre-existing top-level `apply.patch` handler and loopback TCP are unchanged; no instance-link or CLAP mutation authority was added.

| Surface | Automated observation | Live status |
|---|---|---|
| Project/document identity | No definitive name, path, or stable ID in the installed controller API | pending live |
| Save As | No definitive Save As event or path transition in the installed controller API | pending live |
| Selected device | Existing observer cache can report the selected device name, with absence explicit | pending live |
| Authority | Probe-only dispatcher rejects mutation request types; existing `apply.patch` tests remain unchanged | automated |

## Pi SDK package audit

**Audited:** 2026-08-06  
**Command:** `npm view @earendil-works/pi-coding-agent version dist.tarball time scripts dependencies --json`, followed by `npm pack <exact-dist-tarball> --ignore-scripts` in a temporary directory. No install or package code execution occurred.

| Evidence | Observed value |
|---|---|
| candidate version | `@earendil-works/pi-coding-agent@0.84.0` |
| exact tarball | `https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-0.84.0.tgz` |
| tarball integrity | `sha512-oxEU7BT9xuVT6UKNwUNDzNP5dVGb+DZRGfaEyMyAab8dRlqTSxxyhSlMAxmYsu//YOeasj9E8n2+px1BzIai0g==` |
| published | `2026-08-06T11:10:04.579Z` |
| publisher | npm trusted publisher `GitHub Actions <npm-oidc-no-reply@github.com>`; maintainers: `mitsuhiko`, `badlogic`, `rwachtler` |
| provenance | Registry advertises SLSA v1 provenance; trusted-publisher OIDC config `oidc:d271bff4-7c51-4c80-b055-5629ead5d835`; source `gitHead` `8199aca40c9cf27aff3de7ba852e420985a54bf5` |
| package identity | `author: Mario Zechner`, `license: MIT`, repository `earendil-works/pi`, directory `packages/coding-agent` |
| inventory | 956 files, 13,562,839 bytes unpacked: 789 `dist/`, 128 `examples/`, 35 `docs/`, plus package metadata, README, changelog, and npm shrinkwrap |
| exposed SDK layout | root ESM import, `./rpc-entry`, and `./client`; executable `pi` points to `dist/cli.js` |

### Dependencies

The direct runtime dependency set contains 22 packages. Five are version-aligned `@earendil-works/pi-*` packages (`agent-core`, `ai`, `client`, `protocol`, `tui`) declared with `^0.84.0`; other notable runtime dependencies include `undici@8.9.0`, `typebox@1.3.7`, `@silvia-odwyer/photon-node@0.3.4`, `jiti@2.7.0`, and `cross-spawn@7.0.6`. The tarball contains `npm-shrinkwrap.json`, but transitive dependency review remains part of the blocking human approval.

### Lifecycle scripts

Registry and tarball metadata agree on `clean`, `build`, `build:binary`, `copy-assets`, `copy-binary-assets`, `test`, `shrinkwrap`, and `prepublishOnly`. There are **no `preinstall`, `install`, or `postinstall` lifecycle scripts** in the candidate package. `npm pack --ignore-scripts` did not execute the publish-time scripts.

### Verdict

**SUS pending human approval.** The exact candidate is now inspectable and has registry signatures plus trusted-publisher provenance, but this automated audit does not authorize installation. `daemon/package.json` and its lockfile remain unchanged; Plan 02 must retain its blocking package approval gate.

## Q1–Q4 gate outcomes

### Q1 — Track context

- **Observed:** Pending. The capability plug-in queried `clap.track-info` when offered, but the current throwaway probe did not persist or display the live observation. Audio/MIDI transparency does not prove whether Bitwig supplied track-info.
- **Selected:** Pending one instrumented live observation. If present, track-info is hint-only; if absent, linking is controller-confirmation-only.

### Q2 — Project identity and Save As

- **Observed 2026-08-10:** The installed Controller API 21 exposes `Project.isModified()` but no definitive project/document name, filesystem path, stable document ID, or Save As event. The read-only `get.clap_capabilities` response therefore returns explicit unavailable fields and `saveAsObservable: false`; no display-name heuristic is used.
- **Selected:** Use explicit `session.fork` confirmation for Save As/project copies. Do not infer a fork from project, track, device, or window names.

### Q3 — Compact status and actions

- **Observed 2026-08-10:** Connection Status appears in Bitwig's device panel but is only a capability placeholder. The non-automatable Analyze parameter is absent from that panel. The corrected embedded Cocoa editor survives resize/reopen, and Generated Mix accepts fractional values.
- **Selected:** Put truthful read-only status and momentary non-recording actions in the hosted plug-in UI. Expose only musical controls such as Generated Mix as conventional automatable parameters.

### Q4 — Pi SDK package

- **Observed:** The exact `@earendil-works/pi-coding-agent@0.84.0` registry/tarball/publisher/dependency/script evidence is recorded above; no package was installed and no lifecycle script executed.
- **Selected:** Pending explicit human approval or rejection of this exact version and layout.
