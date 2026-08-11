function(bw_register_product_telemetry_tests product_target)
  if(NOT TARGET "${product_target}")
    message(FATAL_ERROR "Telemetry registration requires the product target: ${product_target}")
  endif()
  target_sources("${product_target}" PRIVATE
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/rt/Aggregator.cpp
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/peer/PeerClient.cpp)
  target_sources(product_smoke_test PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/rt/Aggregator.cpp)

  add_executable(telemetry_test
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tests/telemetry_test.cpp
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/rt/Aggregator.cpp)
  target_include_directories(telemetry_test PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src)
  target_compile_features(telemetry_test PRIVATE cxx_std_20)
  target_compile_definitions(telemetry_test PRIVATE BW_SOURCE_ROOT="${CMAKE_CURRENT_FUNCTION_LIST_DIR}/..")
  add_test(NAME telemetry COMMAND telemetry_test)

  add_executable(peer_client_test
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tests/peer_client_test.cpp
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/peer/PeerClient.cpp)
  target_include_directories(peer_client_test PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src)
  target_compile_features(peer_client_test PRIVATE cxx_std_20)
  add_test(NAME peer_client COMMAND peer_client_test)
  set_property(TARGET "${product_target}" PROPERTY BW_TELEMETRY_TESTS_REGISTERED TRUE)
endfunction()
