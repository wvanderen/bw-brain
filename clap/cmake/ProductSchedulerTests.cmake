function(bw_register_product_scheduler_tests product_target)
  if(NOT TARGET "${product_target}")
    message(FATAL_ERROR "Scheduler registration requires the product target: ${product_target}")
  endif()
  set(BW_SCHEDULER_SOURCES
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/rt/PhraseScheduler.cpp
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/rt/OwnedNoteLedger.cpp)
  target_sources("${product_target}" PRIVATE ${BW_SCHEDULER_SOURCES})
  target_sources(product_smoke_test PRIVATE ${BW_SCHEDULER_SOURCES})

  add_executable(scheduler_test
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tests/scheduler_test.cpp
    ${BW_SCHEDULER_SOURCES})
  target_include_directories(scheduler_test PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src)
  target_compile_features(scheduler_test PRIVATE cxx_std_20)
  add_test(NAME scheduler COMMAND scheduler_test)

  add_executable(owned_note_ledger_test
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tests/owned_note_ledger_test.cpp
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/rt/OwnedNoteLedger.cpp)
  target_include_directories(owned_note_ledger_test PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src)
  target_compile_features(owned_note_ledger_test PRIVATE cxx_std_20)
  add_test(NAME owned_note_ledger COMMAND owned_note_ledger_test)

  add_executable(processor_generation_test
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tests/processor_generation_test.cpp
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/PluginProcessor.cpp
    ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src/rt/Aggregator.cpp
    ${BW_SCHEDULER_SOURCES})
  target_include_directories(processor_generation_test PRIVATE ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../src)
  target_compile_features(processor_generation_test PRIVATE cxx_std_20)
  target_compile_definitions(processor_generation_test PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(processor_generation_test PRIVATE
    juce::juce_audio_utils juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
  add_test(NAME processor_generation COMMAND processor_generation_test)
  set_property(TARGET "${product_target}" PROPERTY BW_SCHEDULER_TESTS_REGISTERED TRUE)
endfunction()
