cmake_minimum_required(VERSION 3.20)
project(cheat_agent VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

enable_testing()

add_subdirectory(native)
add_subdirectory(examples/test-game)

# Windows-only Project IGI example: all target memory I/O goes through GTLibCpp.
# Disabled by default because it contains executable-build-specific signatures.
option(CHEAT_AGENT_BUILD_IGI_EXAMPLE "Build the Windows GTLibCpp Project IGI trainer example" OFF)
if(CHEAT_AGENT_BUILD_IGI_EXAMPLE)
    if(NOT WIN32)
        message(FATAL_ERROR "The GTLibCpp Project IGI trainer requires native Windows")
    endif()
    if(NOT CHEAT_AGENT_ENABLE_GTLIBCPP)
        message(FATAL_ERROR "The IGI trainer requires CHEAT_AGENT_ENABLE_GTLIBCPP=ON")
    endif()
    add_executable(igi_trainer examples/project-igi/igi_trainer.cpp)
    target_link_libraries(igi_trainer PRIVATE gtlibcpp::win32)
    target_compile_definitions(igi_trainer PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
endif()
