function(bw_register_product_identity_tests product_target)
  if(NOT TARGET "${product_target}")
    message(FATAL_ERROR "Identity registration requires the product target: ${product_target}")
  endif()

  target_sources("${product_target}" PRIVATE
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/identity/InstanceState.cpp"
  )

  add_executable(instance_state_test
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tests/instance_state_test.cpp"
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/identity/InstanceState.cpp"
  )
  target_include_directories(instance_state_test PRIVATE
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src"
  )
  target_compile_features(instance_state_test PRIVATE cxx_std_20)
  add_test(NAME instance_state COMMAND instance_state_test)

  set_property(TARGET "${product_target}" PROPERTY BW_IDENTITY_TESTS_REGISTERED TRUE)
endfunction()
