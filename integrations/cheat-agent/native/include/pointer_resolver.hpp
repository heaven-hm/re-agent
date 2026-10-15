#pragma once

#include <cstdint>
#include <cstddef>
#include <vector>
#include <string>
#include "process_backend.hpp"
#include "cheat_agent.h"

namespace cheat_agent {

class PointerResolver {
public:
    static int32_t resolve(IProcessBackend& backend, const CheatPointerChain& chain, uint64_t& out_address);

    static std::vector<CheatPointerChain> scan(
        IProcessBackend& backend,
        uint64_t target_address,
        size_t max_depth,
        int64_t max_offset,
        size_t max_chains);
};

} // namespace cheat_agent
