#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

product_build="clap/build"
capability_build="clap/build-capability"
build_config="Release"

echo "==> Checking generated schema surface"
(cd daemon && npm run gen:types)
git diff --exit-code -- daemon/src/gen/clap.ts

echo "==> Configuring isolated product build"
cmake -S clap -B "$product_build" \
  -DBW_BRAIN_CAPABILITY_ONLY=OFF \
  -DCMAKE_BUILD_TYPE="$build_config"
cmake --build "$product_build" --config "$build_config" \
  --target bw_brain_product_CLAP product_smoke_test clap-validator
ctest --test-dir "$product_build" -C "$build_config" --output-on-failure

product_bundle=$(find "$product_build" -type d -name 'bw-brain.clap' -print -quit)
if [[ -z "$product_bundle" ]]; then
  echo "ERROR: product bundle was not packaged below $product_build" >&2
  exit 1
fi

validator="$product_build/tools/clap-validator/clap-validator"
if [[ "${OS:-}" == "Windows_NT" ]]; then
  validator="${validator}.exe"
fi
if [[ ! -x "$validator" ]]; then
  echo "ERROR: pinned validator missing or not executable: $validator" >&2
  exit 1
fi

echo "==> Validating packaged product: $product_bundle"
"$validator" validate "$product_bundle"

echo "==> Running daemon schema, Pi-lock, and full-suite gates"
(cd daemon && node scripts/check-pi-lock.mjs && npm test)

echo "==> Running controller bridge JUnit gate"
(cd bridge && mvn test)

echo "==> Regressing capability evidence in its separate build root"
cmake -S clap -B "$capability_build" -DBW_BRAIN_CAPABILITY_ONLY=ON
cmake --build "$capability_build" --config "$build_config" \
  --target bw-brain-capability capability_probe_test clap-validator
ctest --test-dir "$capability_build" -C "$build_config" \
  -R '^capability_probe$' --output-on-failure

echo "PRODUCT_BUNDLE=$product_bundle"
echo "All product, daemon, bridge, capability, and pinned-validator gates passed."
