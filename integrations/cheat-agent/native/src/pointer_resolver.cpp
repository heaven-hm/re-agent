#include "pointer_resolver.hpp"
#include <cstring>
#include <cmath>
#include <algorithm>

namespace cheat_agent {

int32_t PointerResolver::resolve(
    IProcessBackend& backend,
    const CheatPointerChain& chain,
    uint64_t& out_address) {

    uint64_t current = 0;

    if (chain.base_module[0] != '\0') {
        auto modules = backend.query_modules();
        bool found_module = false;
        for (const auto& mod : modules) {
            if (mod.name == chain.base_module) {
                current = mod.base_address + chain.base_offset;
                found_module = true;
                break;
            }
        }
        if (!found_module) {
            return CHEAT_STATUS_NOT_FOUND;
        }
    } else {
        current = chain.base_offset;
    }

    for (size_t i = 0; i < chain.offset_count; ++i) {
        uint64_t ptr_val = 0;
        size_t bytes_read = 0;

        // Support standard 64-bit pointer read
        int32_t res = backend.read_memory(current, &ptr_val, sizeof(uint64_t), bytes_read);
        if (res != CHEAT_STATUS_OK || bytes_read != sizeof(uint64_t) || ptr_val == 0) {
            // Also try 32-bit pointer read fallback
            uint32_t ptr_val32 = 0;
            res = backend.read_memory(current, &ptr_val32, sizeof(uint32_t), bytes_read);
            if (res != CHEAT_STATUS_OK || bytes_read != sizeof(uint32_t) || ptr_val32 == 0) {
                return CHEAT_STATUS_ERROR;
            }
            ptr_val = ptr_val32;
        }

        current = ptr_val + chain.offsets[i];
    }

    out_address = current;
    return CHEAT_STATUS_OK;
}

std::vector<CheatPointerChain> PointerResolver::scan(
    IProcessBackend& backend,
    uint64_t target_address,
    size_t /*max_depth*/,
    int64_t max_offset,
    size_t max_chains) {

    std::vector<CheatPointerChain> results;
    auto modules = backend.query_modules();
    auto regions = backend.query_regions();

    // Map each module address range
    for (const auto& mod : modules) {
        if (mod.size == 0) continue;

        // Read module memory in chunks
        constexpr size_t kChunkSize = 64 * 1024;
        std::vector<uint8_t> buffer(kChunkSize);

        uint64_t cur = mod.base_address;
        uint64_t end = mod.base_address + mod.size;

        while (cur + sizeof(uint64_t) <= end) {
            size_t to_read = static_cast<size_t>(std::min<uint64_t>(kChunkSize, end - cur));
            size_t bytes_read = 0;
            int32_t res = backend.read_memory(cur, buffer.data(), to_read, bytes_read);
            if (res != CHEAT_STATUS_OK || bytes_read < sizeof(uint64_t)) {
                cur += 4096;
                continue;
            }

            for (size_t i = 0; i + sizeof(uint64_t) <= bytes_read; i += 8) {
                uint64_t candidate_ptr = 0;
                std::memcpy(&candidate_ptr, buffer.data() + i, sizeof(uint64_t));

                if (candidate_ptr != 0) {
                    int64_t diff = static_cast<int64_t>(target_address) - static_cast<int64_t>(candidate_ptr);
                    if (diff >= 0 && diff <= max_offset) {
                        CheatPointerChain chain{};
                        std::strncpy(chain.base_module, mod.name.c_str(), sizeof(chain.base_module) - 1);
                        chain.base_offset = (cur + i) - mod.base_address;
                        chain.offsets[0] = diff;
                        chain.offset_count = 1;
                        results.push_back(chain);

                        if (results.size() >= max_chains) {
                            return results;
                        }
                    }
                }
            }

            cur += bytes_read;
        }
    }

    return results;
}

} // namespace cheat_agent
