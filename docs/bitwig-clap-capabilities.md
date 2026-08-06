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
