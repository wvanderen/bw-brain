cmake_minimum_required(VERSION 3.22)
project(bw_brain_clap_capability LANGUAGES C CXX)

option(BW_BRAIN_CAPABILITY_ONLY "Configure only Phase 04.1 evidence targets" ON)
if(NOT BW_BRAIN_CAPABILITY_ONLY)
  message(FATAL_ERROR "Phase 04.1 supports capability-only configuration. Use -DBW_BRAIN_CAPABILITY_ONLY=ON")
endif()

include(cmake/Dependencies.cmake)
