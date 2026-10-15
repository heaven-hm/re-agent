#pragma once

#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include <memory>
#include <optional>
#include "cheat_agent.h"

namespace cheat_agent {

struct MemoryRegion {
    uint64_t base_address{0};
    uint64_t size{0};
    uint32_t protection{0};
    bool is_readable{false};
    bool is_writable{false};
    bool is_executable{false};
};

struct ModuleInfo {
    std::string name;
    std::string path;
    uint64_t base_address{0};
    uint64_t size{0};
};

class IProcessBackend {
public:
    virtual ~IProcessBackend() = default;

    [[nodiscard]] virtual bool is_alive() const noexcept = 0;
    [[nodiscard]] virtual uint32_t get_pid() const noexcept = 0;

    virtual int32_t read_memory(uint64_t address, void* buffer, size_t size, size_t& bytes_read) = 0;
    virtual int32_t write_memory(uint64_t address, const void* buffer, size_t size, size_t& bytes_written) = 0;

    virtual std::vector<MemoryRegion> query_regions() = 0;
    virtual std::vector<ModuleInfo> query_modules() = 0;

    static std::unique_ptr<IProcessBackend> create(uint32_t pid);
};

} // namespace cheat_agent
