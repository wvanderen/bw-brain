include(FetchContent)
include(ExternalProject)
include(${CMAKE_CURRENT_LIST_DIR}/dependency-lock.cmake)

# Declare the product-candidate dependencies so their source and immutable lock
# are inspectable during the evidence phase. They are intentionally not made
# available: Plan 04.1-01 builds no production plug-in target.
FetchContent_Declare(clap
  GIT_REPOSITORY ${BW_CLAP_URL}
  GIT_TAG ${BW_CLAP_SHA}
  GIT_SHALLOW FALSE
)
FetchContent_Declare(juce
  GIT_REPOSITORY ${BW_JUCE_URL}
  GIT_TAG ${BW_JUCE_SHA}
  GIT_SHALLOW FALSE
)
FetchContent_Declare(clap_juce_extensions
  GIT_REPOSITORY ${BW_CLAP_JUCE_EXTENSIONS_URL}
  GIT_TAG ${BW_CLAP_JUCE_EXTENSIONS_SHA}
  GIT_SHALLOW FALSE
)

set(BW_VALIDATOR_SOURCE_DIR "${CMAKE_BINARY_DIR}/_deps/clap-validator-src")
set(BW_VALIDATOR_CARGO_TARGET_DIR "${CMAKE_BINARY_DIR}/_deps/clap-validator-target")
set(BW_VALIDATOR_OUTPUT_DIR "${CMAKE_BINARY_DIR}/tools/clap-validator")

ExternalProject_Add(clap_validator_external
  PREFIX "${CMAKE_BINARY_DIR}/_deps/clap-validator"
  GIT_REPOSITORY ${BW_CLAP_VALIDATOR_URL}
  GIT_TAG ${BW_CLAP_VALIDATOR_SHA}
  GIT_SHALLOW FALSE
  SOURCE_DIR "${BW_VALIDATOR_SOURCE_DIR}"
  CONFIGURE_COMMAND ""
  BUILD_COMMAND ${CMAKE_COMMAND} -E env
    CARGO_TARGET_DIR=${BW_VALIDATOR_CARGO_TARGET_DIR}
    cargo build --release --locked --manifest-path ${BW_VALIDATOR_SOURCE_DIR}/Cargo.toml
  INSTALL_COMMAND
    ${CMAKE_COMMAND} -E make_directory ${BW_VALIDATOR_OUTPUT_DIR}
    COMMAND ${CMAKE_COMMAND} -E copy
      ${BW_VALIDATOR_CARGO_TARGET_DIR}/release/clap-validator
      ${BW_VALIDATOR_OUTPUT_DIR}/clap-validator
  BUILD_BYPRODUCTS "${BW_VALIDATOR_OUTPUT_DIR}/clap-validator"
  USES_TERMINAL_DOWNLOAD TRUE
  USES_TERMINAL_BUILD TRUE
)

add_custom_target(clap-validator DEPENDS clap_validator_external)
