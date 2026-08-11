function(bw_register_product_ui_tests product_target)
  if(NOT TARGET "${product_target}")
    message(FATAL_ERROR "UI registration requires the product target: ${product_target}")
  endif()
  set_property(TARGET "${product_target}" PROPERTY BW_UI_TESTS_REGISTERED TRUE)
  target_sources("${product_target}" PRIVATE
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/model/UiState.cpp"
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/PluginEditor.cpp"
  )
  add_executable(editor_state_test
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tests/editor_state_test.cpp"
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/model/UiState.cpp"
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/PluginEditor.cpp"
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/PluginProcessor.cpp"
    "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/identity/InstanceState.cpp"
  )
  target_include_directories(editor_state_test PRIVATE "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src")
  target_compile_features(editor_state_test PRIVATE cxx_std_20)
  target_compile_definitions(editor_state_test PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(editor_state_test PRIVATE juce::juce_audio_utils juce::juce_recommended_config_flags)
  add_test(NAME editor_state COMMAND editor_state_test)
endfunction()
