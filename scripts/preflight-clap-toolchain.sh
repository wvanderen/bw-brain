#!/usr/bin/env bash
set -euo pipefail

minimum_cmake="3.22.0"

if ! command -v clang >/dev/null 2>&1; then
  echo "ERROR: Apple clang is required. Install the Xcode Command Line Tools with: xcode-select --install" >&2
  exit 1
fi

if ! clang --version | head -n 1 | grep -q "Apple clang"; then
  echo "ERROR: Apple clang is required; found: $(clang --version | head -n 1)" >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "ERROR: CMake >= ${minimum_cmake} is required. Install it with: brew install cmake" >&2
  exit 1
fi

cmake_version=$(cmake --version | awk 'NR == 1 { print $3 }')
if ! printf '%s\n%s\n' "$minimum_cmake" "$cmake_version" | sort -V -C; then
  echo "ERROR: CMake >= ${minimum_cmake} is required; found ${cmake_version}. Upgrade it with: brew upgrade cmake" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "ERROR: cargo is required to build the pinned clap-validator. Install Rust from: https://rustup.rs/" >&2
  exit 1
fi

echo "Apple clang: $(clang --version | head -n 1)"
echo "CMake: ${cmake_version}"
echo "Cargo: $(cargo --version)"
echo "Capability build directory: clap/build-capability"
