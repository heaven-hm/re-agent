#include "test_main.hpp"

int main() {
    auto& tests = test_framework::get_tests();
    size_t passed = 0;

    std::cout << "Running " << tests.size() << " native tests..." << std::endl;

    for (const auto& t : tests) {
        std::cout << "  [RUN] " << t.name << "..." << std::flush;
        try {
            t.func();
            std::cout << " OK" << std::endl;
            passed++;
        } catch (const std::exception& e) {
            std::cout << " FAILED: " << e.what() << std::endl;
            return 1;
        } catch (...) {
            std::cout << " FAILED: unknown exception" << std::endl;
            return 1;
        }
    }

    std::cout << "All " << passed << " tests passed successfully!" << std::endl;
    return 0;
}
