#pragma once

#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include <optional>

namespace cheat_agent {

struct PatternByte {
    uint8_t value{0};
    bool is_wildcard{false};
};

class PatternScanner {
public:
    static std::vector<PatternByte> parse_pattern(const std::string& pattern_str);

    static std::vector<uint64_t> scan_buffer(
        const uint8_t* buffer,
        size_t buffer_size,
        uint64_t base_address,
        const std::vector<PatternByte>& pattern);
};

} // namespace cheat_agent
