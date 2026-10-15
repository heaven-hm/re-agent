#include "test_main.hpp"
#include "pointer_resolver.hpp"
#include <cstring>

namespace {

class MockPointerBackend final : public cheat_agent::IProcessBackend {
public:
    MockPointerBackend() {
        memory_.resize(0x10000, 0);
    }

    [[nodiscard]] bool is_alive() const noexcept override { return true; }
    [[nodiscard]] uint32_t get_pid() const noexcept override { return 42; }

    int32_t read_memory(uint64_t address, void* buffer, size_t size, size_t& bytes_read) override {
        bytes_read = 0;
        if (address + size > memory_.size()) return CHEAT_STATUS_ERROR;
        std::memcpy(buffer, memory_.data() + address, size);
        bytes_read = size;
        return CHEAT_STATUS_OK;
    }

    int32_t write_memory(uint64_t address, const void* buffer, size_t size, size_t& bytes_written) override {
        bytes_written = 0;
        if (address + size > memory_.size()) return CHEAT_STATUS_ERROR;
        std::memcpy(memory_.data() + address, buffer, size);
        bytes_written = size;
        return CHEAT_STATUS_OK;
    }

    std::vector<cheat_agent::MemoryRegion> query_regions() override {
        return {
            {0x0000, 0x10000, CHEAT_PROTECT_READ | CHEAT_PROTECT_WRITE, true, true, false}
        };
    }

    std::vector<cheat_agent::ModuleInfo> query_modules() override {
        return {
            {"mock_game.exe", "/bin/mock_game.exe", 0x1000, 0x1000}
        };
    }

    void put_u64(uint64_t addr, uint64_t val) {
        size_t w = 0;
        write_memory(addr, &val, sizeof(val), w);
    }

private:
    std::vector<uint8_t> memory_;
};

} // namespace

TEST_CASE(pointer_resolver_multi_level_resolution) {
    MockPointerBackend backend;

    // Chain: mock_game.exe (0x1000) + 0x50 -> [0x1050] = 0x4000
    // [0x4000 + 0x20] = 0x8000
    // [0x8000 + 0x14] = target address (0x8014)
    backend.put_u64(0x1050, 0x4000);
    backend.put_u64(0x4020, 0x8000);

    CheatPointerChain chain{};
    std::strncpy(chain.base_module, "mock_game.exe", sizeof(chain.base_module) - 1);
    chain.base_offset = 0x50;
    chain.offsets[0] = 0x20;
    chain.offsets[1] = 0x14;
    chain.offset_count = 2;

    uint64_t resolved = 0;
    int32_t res = cheat_agent::PointerResolver::resolve(backend, chain, resolved);

    REQUIRE_EQ(res, CHEAT_STATUS_OK);
    REQUIRE_EQ(resolved, 0x8014u);
}
