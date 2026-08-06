cmake_minimum_required(VERSION 3.22)
project(bw_brain_clap_capability LANGUAGES C CXX)

option(BW_BRAIN_CAPABILITY_ONLY "Configure only Phase 04.1 evidence targets" ON)
if(NOT BW_BRAIN_CAPABILITY_ONLY)
  message(FATAL_ERROR "Phase 04.1 supports capability-only configuration. Use -DBW_BRAIN_CAPABILITY_ONLY=ON")
endif()

include(cmake/Dependencies.cmake)

FetchContent_MakeAvailable(clap)

enable_testing()

add_library(bw_brain_capability_core STATIC
  spike/CapabilityProbeProcessor.cpp
)
target_include_directories(bw_brain_capability_core PUBLIC
  ${CMAKE_CURRENT_LIST_DIR}/spike
  ${clap_SOURCE_DIR}/include
)
target_compile_features(bw_brain_capability_core PUBLIC cxx_std_20)

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

add_executable(capability_probe_test tests/capability_probe_test.cpp)
target_link_libraries(capability_probe_test PRIVATE bw_brain_capability_core)
target_compile_features(capability_probe_test PRIVATE cxx_std_20)
add_test(NAME capability_probe COMMAND capability_probe_test)
