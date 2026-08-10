cmake_minimum_required(VERSION 3.22)
project(bw_brain_clap VERSION 0.1.0 LANGUAGES C CXX)

option(BW_BRAIN_CAPABILITY_ONLY "Configure only Phase 04.1 evidence targets" ON)

include(cmake/Dependencies.cmake)

enable_testing()

if(BW_BRAIN_CAPABILITY_ONLY)
FetchContent_MakeAvailable(clap)

set(BW_CAPABILITY_EDITOR_SOURCE spike/CapabilityProbeEditor.cpp)
if(APPLE)
  set(BW_CAPABILITY_EDITOR_SOURCE spike/CapabilityProbeEditor.mm)
endif()

else()
FetchContent_MakeAvailable(juce clap_juce_extensions)

# JUCE 8 is dual licensed (AGPLv3/commercial). A release build may ship only
# after the project owner records which JUCE release license applies.
set(BW_JUCE_RELEASE_LICENSE_GATE "UNRESOLVED" CACHE STRING
  "Required before release packaging: AGPLv3 or a valid JUCE commercial license")

juce_add_plugin(bw_brain_product
  COMPANY_NAME "bw-brain"
  BUNDLE_ID "local.bw-brain.companion"
  PLUGIN_MANUFACTURER_CODE BwBr
  PLUGIN_CODE BwCp
  PRODUCT_NAME "bw-brain"
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT TRUE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE
)

target_sources(bw_brain_product PRIVATE src/PluginProcessor.cpp)
target_include_directories(bw_brain_product PUBLIC ${CMAKE_CURRENT_LIST_DIR}/src)
target_compile_features(bw_brain_product PUBLIC cxx_std_20)
target_compile_definitions(bw_brain_product PUBLIC
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
)
target_link_libraries(bw_brain_product PRIVATE
  juce::juce_audio_utils
  juce::juce_recommended_config_flags
  juce::juce_recommended_lto_flags
  juce::juce_recommended_warning_flags
)

clap_juce_extensions_plugin(TARGET bw_brain_product
  CLAP_ID "local.bw-brain.companion"
  CLAP_FEATURES audio-effect midi-effect utility
)

add_executable(product_smoke_test
  tests/product_smoke_test.cpp
  src/PluginProcessor.cpp
)
target_include_directories(product_smoke_test PRIVATE ${CMAKE_CURRENT_LIST_DIR}/src)
target_compile_features(product_smoke_test PRIVATE cxx_std_20)
target_compile_definitions(product_smoke_test PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(product_smoke_test PRIVATE
  juce::juce_audio_utils
  juce::juce_recommended_config_flags
  juce::juce_recommended_warning_flags
)
add_test(NAME product_smoke COMMAND product_smoke_test)

include(cmake/ProductIdentityTests.cmake)
include(cmake/ProductTelemetryTests.cmake)
include(cmake/ProductSchedulerTests.cmake)
include(cmake/ProductUiTests.cmake)
bw_register_product_identity_tests(bw_brain_product)
bw_register_product_telemetry_tests(bw_brain_product)
bw_register_product_scheduler_tests(bw_brain_product)
bw_register_product_ui_tests(bw_brain_product)
endif()
if(BW_BRAIN_CAPABILITY_ONLY)
add_library(bw_brain_capability_core STATIC
  spike/CapabilityProbeProcessor.cpp
  ${BW_CAPABILITY_EDITOR_SOURCE}
)
target_include_directories(bw_brain_capability_core PUBLIC
  ${CMAKE_CURRENT_LIST_DIR}/spike
  ${clap_SOURCE_DIR}/include
)
target_compile_features(bw_brain_capability_core PUBLIC cxx_std_20)
if(APPLE)
  target_link_libraries(bw_brain_capability_core PUBLIC "-framework Cocoa")
endif()

add_library(bw-brain-capability MODULE
  spike/CapabilityProbePlugin.cpp
)
target_link_libraries(bw-brain-capability PRIVATE bw_brain_capability_core)
target_compile_features(bw-brain-capability PRIVATE cxx_std_20)
set_target_properties(bw-brain-capability PROPERTIES
  PREFIX ""
  SUFFIX ".clap"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
)
if(APPLE)
  set_target_properties(bw-brain-capability PROPERTIES
    BUNDLE TRUE
    BUNDLE_EXTENSION clap
    MACOSX_BUNDLE_GUI_IDENTIFIER com.bwbrain.capability-probe
    MACOSX_BUNDLE_BUNDLE_NAME bw-brain-capability
    MACOSX_BUNDLE_BUNDLE_VERSION "0"
    MACOSX_BUNDLE_SHORT_VERSION_STRING "0.0.0"
    MACOSX_BUNDLE_INFO_PLIST "${clap_SOURCE_DIR}/src/plugins.plist.in"
  )
endif()

add_executable(capability_probe_test tests/capability_probe_test.cpp)
target_link_libraries(capability_probe_test PRIVATE bw_brain_capability_core)
target_compile_features(capability_probe_test PRIVATE cxx_std_20)
add_test(NAME capability_probe COMMAND capability_probe_test)

if(APPLE)
  add_executable(capability_probe_cocoa_test tests/capability_probe_cocoa_test.mm)
  target_link_libraries(capability_probe_cocoa_test PRIVATE bw_brain_capability_core)
  target_compile_features(capability_probe_cocoa_test PRIVATE cxx_std_20)
  add_test(NAME capability_probe_cocoa COMMAND capability_probe_cocoa_test)
endif()
endif()
