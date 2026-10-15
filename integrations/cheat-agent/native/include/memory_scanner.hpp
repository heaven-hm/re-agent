#pragma once

#include <cstdint>
#include <cstddef>
#include <vector>
#include <memory>
#include "process_backend.hpp"
#include "cheat_agent.h"

namespace cheat_agent {

struct CandidateMatch {
    uint64_t address{0};
    std::vector<uint8_t> previous_value;
};

class MemoryScanner {
public:
    explicit MemoryScanner(std::shared_ptr<IProcessBackend> backend);
    ~MemoryScanner() = default;

    void reset();

    int32_t first_scan(int32_t data_type, int32_t scan_mode, const void* val1, const void* val2, size_t val_size);
    int32_t next_scan(int32_t scan_mode, const void* val1, const void* val2, size_t val_size);
    int32_t scan_aob(const std::string& pattern);

    [[nodiscard]] size_t get_match_count() const noexcept { return candidates_.size(); }
    [[nodiscard]] const std::vector<CandidateMatch>& get_candidates() const noexcept { return candidates_; }

private:
    bool compare_values(const uint8_t* current, const uint8_t* previous, int32_t scan_mode, const void* val1, const void* val2) const;

    std::shared_ptr<IProcessBackend> backend_;
    int32_t data_type_{CHEAT_DATA_TYPE_INT32};
    size_t data_size_{4};
    std::vector<CandidateMatch> candidates_;
};

} // namespace cheat_agent
