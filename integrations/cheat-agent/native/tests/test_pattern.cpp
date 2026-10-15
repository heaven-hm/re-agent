#include "test_main.hpp"
#include "pattern_scanner.hpp"

TEST_CASE(parse_pattern_standard_and_wildcards) {
    auto p = cheat_agent::PatternScanner::parse_pattern("48 8B 05 ? ? ? ? 48 85 C0");
    REQUIRE_EQ(p.size(), 10u);
    REQUIRE(!p[0].is_wildcard);
    REQUIRE_EQ(p[0].value, 0x48);
    REQUIRE(!p[1].is_wildcard);
    REQUIRE_EQ(p[1].value, 0x8B);
    REQUIRE(!p[2].is_wildcard);
    REQUIRE_EQ(p[2].value, 0x05);
    REQUIRE(p[3].is_wildcard);
    REQUIRE(p[4].is_wildcard);
    REQUIRE(p[5].is_wildcard);
    REQUIRE(p[6].is_wildcard);
    REQUIRE(!p[7].is_wildcard);
    REQUIRE_EQ(p[7].value, 0x48);
}

TEST_CASE(scan_buffer_finds_correct_offsets) {
    std::vector<uint8_t> buffer = {
        0x90, 0x90, 0x48, 0x89, 0x5C, 0x24, 0x08, 0xCC,
        0x90, 0x48, 0x89, 0x5C, 0x24, 0x10, 0xC3
    };

    auto pattern = cheat_agent::PatternScanner::parse_pattern("48 89 5C 24 ?");
    auto matches = cheat_agent::PatternScanner::scan_buffer(buffer.data(), buffer.size(), 0x1000, pattern);

    REQUIRE_EQ(matches.size(), 2u);
    REQUIRE_EQ(matches[0], 0x1002u);
    REQUIRE_EQ(matches[1], 0x1009u);
}
