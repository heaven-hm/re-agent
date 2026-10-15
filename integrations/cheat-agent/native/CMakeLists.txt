cmake_minimum_required(VERSION 3.20)
project(cheat_agent_native LANGUAGES C CXX)

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(CHEAT_AGENT_ENABLE_GTLIBCPP "Enable GTLibCpp backend integration" ON)

if(CHEAT_AGENT_ENABLE_GTLIBCPP)
    set(GTLIBCPP_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(GTLIBCPP_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(GTLIBCPP_BUILD_DEMOS OFF CACHE BOOL "" FORCE)
    set(GTLIBCPP_ENABLE_WERROR OFF CACHE BOOL "" FORCE)

    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../../gtlibcpp/CMakeLists.txt")
        message(STATUS "Integrating local GTLibCpp from ../../gtlibcpp")
        add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../gtlibcpp" "${CMAKE_CURRENT_BINARY_DIR}/gtlibcpp" EXCLUDE_FROM_ALL)
    else()
        message(STATUS "Fetching GTLibCpp from github.com/heaven-hm/gtlibcpp")
        include(FetchContent)
        FetchContent_Declare(
            gtlibcpp
            GIT_REPOSITORY https://github.com/heaven-hm/gtlibcpp.git
            GIT_TAG ad67ead3a617840e68d6586de0ec0e61877fe0b3
        )
        FetchContent_MakeAvailable(gtlibcpp)
    endif()
endif()

set(NATIVE_SOURCES
    src/pattern_scanner.cpp
    src/memory_scanner.cpp
    src/pointer_resolver.cpp
    src/ffi.cpp
)

if(CHEAT_AGENT_ENABLE_GTLIBCPP)
    list(APPEND NATIVE_SOURCES src/gtlibcpp_adapter.cpp)
endif()

if(APPLE)
    list(APPEND NATIVE_SOURCES src/macos/process_backend.cpp)
elseif(WIN32)
    list(APPEND NATIVE_SOURCES src/windows/process_backend.cpp)
else()
    list(APPEND NATIVE_SOURCES src/linux/process_backend.cpp)
endif()

add_library(cheat_agent_native STATIC ${NATIVE_SOURCES})
target_include_directories(cheat_agent_native PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

if(CHEAT_AGENT_ENABLE_GTLIBCPP)
    target_link_libraries(cheat_agent_native PUBLIC gtlibcpp::core)
endif()

if(MSVC)
    target_compile_options(cheat_agent_native PRIVATE /W4 /permissive-)
else()
    target_compile_options(cheat_agent_native PRIVATE -Wall -Wextra -Wpedantic)
endif()

# Native unit tests
add_executable(cheat_agent_native_tests
    tests/test_main.cpp
    tests/test_scanner.cpp
    tests/test_pattern.cpp
    tests/test_pointer.cpp
)
if(CHEAT_AGENT_ENABLE_GTLIBCPP)
    target_sources(cheat_agent_native_tests PRIVATE tests/test_gtlibcpp_adapter.cpp)
endif()
target_link_libraries(cheat_agent_native_tests PRIVATE cheat_agent_native)
add_test(NAME cheat_agent_native_tests COMMAND cheat_agent_native_tests)
