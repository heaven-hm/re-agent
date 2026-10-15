#include "memory_scanner.hpp"
#include "pattern_scanner.hpp"
#include <cstring>
#include <algorithm>
#include <cmath>

namespace cheat_agent {

namespace {

constexpr size_t kChunkSize = 64 * 1024; // 64 KiB chunks
constexpr size_t kMaxPatternWidth = 4 * 1024; // bounded overlap and progress

template <typename T>
bool compare_typed(const uint8_t* curr_ptr, const uint8_t* prev_ptr, int32_t mode, const void* v1, const void* v2) {
    T curr{};
    std::memcpy(&curr, curr_ptr, sizeof(T));

    T target1{};
    if (v1) std::memcpy(&target1, v1, sizeof(T));

    T target2{};
    if (v2) std::memcpy(&target2, v2, sizeof(T));

    T prev{};
    if (prev_ptr) std::memcpy(&prev, prev_ptr, sizeof(T));

    switch (mode) {
        case CHEAT_SCAN_MODE_EXACT:
            if constexpr (std::is_floating_point_v<T>) {
                return std::abs(curr - target1) < 0.0001;
            } else {
                return curr == target1;
            }
        case CHEAT_SCAN_MODE_UNKNOWN_INITIAL:
            return true;
        case CHEAT_SCAN_MODE_CHANGED:
            if (!prev_ptr) return false;
            if constexpr (std::is_floating_point_v<T>) {
                return std::abs(curr - prev) >= 0.0001;
            } else {
                return curr != prev;
            }
        case CHEAT_SCAN_MODE_UNCHANGED:
            if (!prev_ptr) return false;
            if constexpr (std::is_floating_point_v<T>) {
                return std::abs(curr - prev) < 0.0001;
            } else {
                return curr == prev;
            }
        case CHEAT_SCAN_MODE_INCREASED:
            if (!prev_ptr) return false;
            return curr > prev;
        case CHEAT_SCAN_MODE_DECREASED:
            if (!prev_ptr) return false;
            return curr < prev;
        case CHEAT_SCAN_MODE_RANGE:
            return (curr >= target1 && curr <= target2);
        default:
            return false;
    }
}

} // namespace

MemoryScanner::MemoryScanner(std::shared_ptr<IProcessBackend> backend)
    : backend_(std::move(backend)) {}

void MemoryScanner::reset() {
    candidates_.clear();
}

bool MemoryScanner::compare_values(
    const uint8_t* current,
    const uint8_t* previous,
    int32_t scan_mode,
    const void* val1,
    const void* val2) const {

    switch (data_type_) {
        case CHEAT_DATA_TYPE_INT8:
            return compare_typed<int8_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_UINT8:
            return compare_typed<uint8_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_INT16:
            return compare_typed<int16_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_UINT16:
            return compare_typed<uint16_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_INT32:
            return compare_typed<int32_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_UINT32:
            return compare_typed<uint32_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_INT64:
            return compare_typed<int64_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_UINT64:
            return compare_typed<uint64_t>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_FLOAT:
            return compare_typed<float>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_DOUBLE:
            return compare_typed<double>(current, previous, scan_mode, val1, val2);
        case CHEAT_DATA_TYPE_BYTE_ARRAY:
            if (scan_mode == CHEAT_SCAN_MODE_EXACT && val1) {
                return std::memcmp(current, val1, data_size_) == 0;
            }
            if (scan_mode == CHEAT_SCAN_MODE_CHANGED && previous) {
                return std::memcmp(current, previous, data_size_) != 0;
            }
            if (scan_mode == CHEAT_SCAN_MODE_UNCHANGED && previous) {
                return std::memcmp(current, previous, data_size_) == 0;
            }
            return false;
        default:
            return false;
    }
}

int32_t MemoryScanner::first_scan(
    int32_t data_type,
    int32_t scan_mode,
    const void* val1,
    const void* val2,
    size_t val_size) {

    if (!backend_ || !backend_->is_alive()) {
        return CHEAT_STATUS_NOT_CONNECTED;
    }

    reset();
    data_type_ = data_type;

    switch (data_type_) {
        case CHEAT_DATA_TYPE_INT8:
        case CHEAT_DATA_TYPE_UINT8:
            data_size_ = 1;
            break;
        case CHEAT_DATA_TYPE_INT16:
        case CHEAT_DATA_TYPE_UINT16:
            data_size_ = 2;
            break;
        case CHEAT_DATA_TYPE_INT32:
        case CHEAT_DATA_TYPE_UINT32:
        case CHEAT_DATA_TYPE_FLOAT:
            data_size_ = 4;
            break;
        case CHEAT_DATA_TYPE_INT64:
        case CHEAT_DATA_TYPE_UINT64:
        case CHEAT_DATA_TYPE_DOUBLE:
            data_size_ = 8;
            break;
        case CHEAT_DATA_TYPE_BYTE_ARRAY:
        case CHEAT_DATA_TYPE_STRING:
            data_size_ = (val_size > 0) ? val_size : 4;
            break;
        default:
            return CHEAT_STATUS_INVALID_ARGUMENT;
    }

    // The C ABI supplies one declared width for both value pointers.
    // Fail closed before any typed memcpy or byte-array memcmp.
    if (data_size_ == 0 || data_size_ > kMaxPatternWidth)
        return CHEAT_STATUS_INVALID_ARGUMENT;
    if ((val1 || val2) && val_size != data_size_)
        return CHEAT_STATUS_INVALID_ARGUMENT;
    if (scan_mode == CHEAT_SCAN_MODE_RANGE && (!val1 || !val2))
        return CHEAT_STATUS_INVALID_ARGUMENT;
    if (scan_mode == CHEAT_SCAN_MODE_EXACT && !val1)
        return CHEAT_STATUS_INVALID_ARGUMENT;
    if (scan_mode != CHEAT_SCAN_MODE_EXACT &&
        scan_mode != CHEAT_SCAN_MODE_UNKNOWN_INITIAL &&
        scan_mode != CHEAT_SCAN_MODE_RANGE)
        return CHEAT_STATUS_INVALID_ARGUMENT;

    auto regions = backend_->query_regions();
    std::vector<uint8_t> chunk(kChunkSize);

    // Alignment: align to data_size_ or 1
    const size_t step = (data_size_ <= 4) ? data_size_ : 4;

    for (const auto& reg : regions) {
        if (!reg.is_readable || reg.size == 0) continue;

        uint64_t current_addr = reg.base_address;
        if (reg.size > UINT64_MAX - reg.base_address) continue;
        uint64_t end_addr = reg.base_address + reg.size;
        if (reg.size < data_size_) continue;

        while (current_addr <= end_addr - data_size_) {
            size_t bytes_to_read = static_cast<size_t>(std::min<uint64_t>(kChunkSize, end_addr - current_addr));
            size_t bytes_read = 0;

            int32_t res = backend_->read_memory(current_addr, chunk.data(), bytes_to_read, bytes_read);
            if (res != CHEAT_STATUS_OK || bytes_read < data_size_) {
                current_addr += (bytes_to_read > 0) ? bytes_to_read : 4096;
                continue;
            }

            for (size_t offset = 0; offset + data_size_ <= bytes_read; offset += step) {
                const uint8_t* val_ptr = chunk.data() + offset;
                if (compare_values(val_ptr, nullptr, scan_mode, val1, val2)) {
                    CandidateMatch match;
                    match.address = current_addr + offset;
                    match.previous_value.assign(val_ptr, val_ptr + data_size_);
                    candidates_.push_back(std::move(match));

                    if (candidates_.size() >= 500000) {
                        // Cap maximum candidates to 500,000 for bounded memory
                        return CHEAT_STATUS_OK;
                    }
                }
            }

            // Move to the next aligned start address, retaining enough
            // overlap to discover values spanning adjacent scan chunks.
            const size_t advance = ((bytes_read - data_size_) / step + 1) * step;
            current_addr += advance;
        }
    }

    return CHEAT_STATUS_OK;
}

int32_t MemoryScanner::next_scan(
    int32_t scan_mode,
    const void* val1,
    const void* val2,
    size_t val_size) {

    if (!backend_ || !backend_->is_alive()) {
        return CHEAT_STATUS_NOT_CONNECTED;
    }

    if ((val1 || val2) && val_size != data_size_)
        return CHEAT_STATUS_INVALID_ARGUMENT;
    if (scan_mode == CHEAT_SCAN_MODE_EXACT && !val1)
        return CHEAT_STATUS_INVALID_ARGUMENT;
    if (scan_mode == CHEAT_SCAN_MODE_RANGE && (!val1 || !val2))
        return CHEAT_STATUS_INVALID_ARGUMENT;
    if (scan_mode < CHEAT_SCAN_MODE_EXACT || scan_mode > CHEAT_SCAN_MODE_RANGE)
        return CHEAT_STATUS_INVALID_ARGUMENT;

    if (candidates_.empty()) {
        return CHEAT_STATUS_OK;
    }

    std::vector<CandidateMatch> refined;
    refined.reserve(candidates_.size());
    std::vector<uint8_t> current_val(data_size_);

    for (const auto& cand : candidates_) {
        size_t bytes_read = 0;
        int32_t res = backend_->read_memory(cand.address, current_val.data(), data_size_, bytes_read);
        if (res == CHEAT_STATUS_OK && bytes_read == data_size_) {
            if (compare_values(current_val.data(), cand.previous_value.data(), scan_mode, val1, val2)) {
                CandidateMatch m;
                m.address = cand.address;
                m.previous_value = current_val;
                refined.push_back(std::move(m));
            }
        }
    }

    candidates_ = std::move(refined);
    return CHEAT_STATUS_OK;
}

int32_t MemoryScanner::scan_aob(const std::string& pattern_str) {
    if (!backend_ || !backend_->is_alive()) {
        return CHEAT_STATUS_NOT_CONNECTED;
    }

    reset();
    data_type_ = CHEAT_DATA_TYPE_AOB;

    auto parsed_pattern = PatternScanner::parse_pattern(pattern_str);
    if (parsed_pattern.empty() || parsed_pattern.size() > kMaxPatternWidth) {
        return CHEAT_STATUS_INVALID_ARGUMENT;
    }
    data_size_ = parsed_pattern.size();

    auto regions = backend_->query_regions();
    std::vector<uint8_t> chunk(kChunkSize);

    for (const auto& reg : regions) {
        if (!reg.is_readable || reg.size < data_size_) continue;

        uint64_t current_addr = reg.base_address;
        if (reg.size > UINT64_MAX - reg.base_address) continue;
        uint64_t end_addr = reg.base_address + reg.size;

        while (current_addr <= end_addr - data_size_) {
            size_t bytes_to_read = static_cast<size_t>(std::min<uint64_t>(kChunkSize, end_addr - current_addr));
            size_t bytes_read = 0;

            int32_t res = backend_->read_memory(current_addr, chunk.data(), bytes_to_read, bytes_read);
            if (res != CHEAT_STATUS_OK || bytes_read < data_size_) {
                current_addr += (bytes_to_read > 0) ? bytes_to_read : 4096;
                continue;
            }

            auto matches = PatternScanner::scan_buffer(chunk.data(), bytes_read, current_addr, parsed_pattern);
            for (auto addr : matches) {
                CandidateMatch m;
                m.address = addr;
                m.previous_value.assign(chunk.data() + (addr - current_addr),
                                        chunk.data() + (addr - current_addr) + data_size_);
                candidates_.push_back(std::move(m));
            }

            // Step forward allowing overlap for pattern matches across chunk boundary
            current_addr += (bytes_read > data_size_) ? (bytes_read - data_size_) : bytes_read;
        }
    }

    return CHEAT_STATUS_OK;
}

} // namespace cheat_agent
