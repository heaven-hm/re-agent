#include "pattern_scanner.hpp"
#include <sstream>
#include <iomanip>
#include <cctype>

namespace cheat_agent {

std::vector<PatternByte> PatternScanner::parse_pattern(const std::string& pattern_str) {
    std::vector<PatternByte> result;
    std::istringstream stream(pattern_str);
    std::string token;

    while (stream >> token) {
        if (token == "?" || token == "??") {
            result.push_back({0, true});
        } else {
            try {
                auto val = static_cast<uint8_t>(std::stoul(token, nullptr, 16));
                result.push_back({val, false});
            } catch (...) {
                // If token cannot be parsed, treat as wildcard
                result.push_back({0, true});
            }
        }
    }
    return result;
}

std::vector<uint64_t> PatternScanner::scan_buffer(
    const uint8_t* buffer,
    size_t buffer_size,
    uint64_t base_address,
    const std::vector<PatternByte>& pattern) {

    std::vector<uint64_t> matches;
    if (pattern.empty() || buffer_size < pattern.size()) {
        return matches;
    }

    const size_t max_idx = buffer_size - pattern.size();
    for (size_t i = 0; i <= max_idx; ++i) {
        bool found = true;
        for (size_t j = 0; j < pattern.size(); ++j) {
            if (!pattern[j].is_wildcard && buffer[i + j] != pattern[j].value) {
                found = false;
                break;
            }
        }
        if (found) {
            matches.push_back(base_address + i);
        }
    }

    return matches;
}

} // namespace cheat_agent
