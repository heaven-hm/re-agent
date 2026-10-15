#pragma once

#include <iostream>
#include <string>
#include <vector>
#include <functional>

namespace test_framework {

struct TestCase {
    std::string name;
    std::function<void()> func;
};

inline std::vector<TestCase>& get_tests() {
    static std::vector<TestCase> tests;
    return tests;
}

inline bool register_test(const std::string& name, std::function<void()> func) {
    get_tests().push_back({name, func});
    return true;
}

#define TEST_CASE(name) \
    static void test_func_##name(); \
    static bool registered_##name = test_framework::register_test(#name, test_func_##name); \
    static void test_func_##name()

#define REQUIRE(expr) \
    do { \
        if (!(expr)) { \
            std::cerr << "Assertion failed: " #expr << " at " << __FILE__ << ":" << __LINE__ << std::endl; \
            std::exit(1); \
        } \
    } while (0)

#define REQUIRE_EQ(a, b) \
    do { \
        if (!((a) == (b))) { \
            std::cerr << "Assertion failed: " #a " == " #b << " (" << (a) << " vs " << (b) << ") at " << __FILE__ << ":" << __LINE__ << std::endl; \
            std::exit(1); \
        } \
    } while (0)

} // namespace test_framework
