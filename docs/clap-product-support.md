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

## Release checklist

- [ ] Record a JUCE 8 release licensing disposition: AGPLv3, or a valid commercial JUCE license. This is a blocking release decision; a green build does not select a license.
- [x] Pass the complete dated macOS Bitwig 6.0.11 D-01–D-16 matrix in both supported hosting modes.
- [x] Confirm the installed bundle is the exact `clap/build` product artifact validated by the aggregate gate.
- [ ] Keep Windows and Linux labeled **live host unverified** until equivalent host evidence exists.
