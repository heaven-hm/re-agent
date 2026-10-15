#include "test_main.hpp"
#include "memory_scanner.hpp"
#include <cstring>

namespace {

class MockProcessBackend final : public cheat_agent::IProcessBackend {
public:
    MockProcessBackend() {
        memory_.resize(0x20000, 0); // 128 KiB, allowing boundary-spanning test values
    }

    [[nodiscard]] bool is_alive() const noexcept override { return true; }
    [[nodiscard]] uint32_t get_pid() const noexcept override { return 1337; }

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
            {0x0000, 0x20000, CHEAT_PROTECT_READ | CHEAT_PROTECT_WRITE, true, true, false}
        };
    }

    std::vector<cheat_agent::ModuleInfo> query_modules() override {
        return {
            {"mock_game.exe", "/bin/mock_game.exe", 0x1000, 0x2000}
        };
    }

    std::vector<uint8_t>& memory() { return memory_; }

private:
    std::vector<uint8_t> memory_;
};

} // namespace

TEST_CASE(memory_scanner_exact_and_decreased_refinement) {
    auto backend = std::make_shared<MockProcessBackend>();
    cheat_agent::MemoryScanner scanner(backend);

    // Write initial game state:
    // Ammo at 0x2040 = 100
    // Another variable at 0x3040 = 100
    uint32_t val100 = 100;
    size_t written = 0;
    backend->write_memory(0x2040, &val100, sizeof(val100), written);
    backend->write_memory(0x3040, &val100, sizeof(val100), written);

    // First scan: exact uint32 = 100
    int32_t res = scanner.first_scan(CHEAT_DATA_TYPE_UINT32, CHEAT_SCAN_MODE_EXACT, &val100, nullptr, 4);
    REQUIRE_EQ(res, CHEAT_STATUS_OK);
    REQUIRE(scanner.get_match_count() >= 2u);

    // Simulate ammo firing: ammo at 0x2040 decreases to 95, other variable stays 100
    uint32_t val95 = 95;
    backend->write_memory(0x2040, &val95, sizeof(val95), written);

    // Next scan: decreased
    res = scanner.next_scan(CHEAT_SCAN_MODE_DECREASED, nullptr, nullptr, 4);
    REQUIRE_EQ(res, CHEAT_STATUS_OK);

    // Only 0x2040 should match
    bool found_ammo = false;
    for (const auto& c : scanner.get_candidates()) {
        if (c.address == 0x2040) found_ammo = true;
        REQUIRE(c.address != 0x3040); // 0x3040 stayed 100, so it must not match decreased
    }
    REQUIRE(found_ammo);
}


TEST_CASE(memory_scanner_rejects_incorrect_value_width) {
    auto backend = std::make_shared<MockProcessBackend>();
    cheat_agent::MemoryScanner scanner(backend);
    uint8_t one_byte = 42;
    uint32_t four_bytes = 42;

    // Must reject the size mismatch before touching the pointer.
    REQUIRE_EQ(scanner.first_scan(CHEAT_DATA_TYPE_UINT32,
        CHEAT_SCAN_MODE_EXACT, &one_byte, nullptr, 1),
        CHEAT_STATUS_INVALID_ARGUMENT);
    REQUIRE_EQ(scanner.first_scan(CHEAT_DATA_TYPE_UINT32,
        CHEAT_SCAN_MODE_EXACT, nullptr, nullptr, 4),
        CHEAT_STATUS_INVALID_ARGUMENT);
    REQUIRE_EQ(scanner.first_scan(CHEAT_DATA_TYPE_UINT32,
        CHEAT_SCAN_MODE_RANGE, &four_bytes, nullptr, 4),
        CHEAT_STATUS_INVALID_ARGUMENT);

    REQUIRE_EQ(scanner.first_scan(CHEAT_DATA_TYPE_UINT32,
        CHEAT_SCAN_MODE_EXACT, &four_bytes, nullptr, 4), CHEAT_STATUS_OK);
    REQUIRE_EQ(scanner.next_scan(CHEAT_SCAN_MODE_EXACT,
        &one_byte, nullptr, 1), CHEAT_STATUS_INVALID_ARGUMENT);
    REQUIRE_EQ(scanner.next_scan(CHEAT_SCAN_MODE_RANGE,
        &four_bytes, nullptr, 4), CHEAT_STATUS_INVALID_ARGUMENT);
}

TEST_CASE(memory_scanner_finds_typed_value_across_chunk_boundary) {
    auto backend = std::make_shared<MockProcessBackend>();
    cheat_agent::MemoryScanner scanner(backend);
    const uint64_t special = 0xCAFE12345678BEEFULL;
    size_t written = 0;
    REQUIRE_EQ(backend->write_memory(0xFFFC, &special, sizeof(special), written), CHEAT_STATUS_OK);
    REQUIRE_EQ(scanner.first_scan(CHEAT_DATA_TYPE_UINT64, CHEAT_SCAN_MODE_EXACT,
                                  &special, nullptr, sizeof(special)), CHEAT_STATUS_OK);
    bool found = false;
    for (const auto& match : scanner.get_candidates()) {
        if (match.address == 0xFFFC) found = true;
    }
    REQUIRE(found);
}

TEST_CASE(memory_scanner_finds_aob_across_chunk_boundary) {
    auto backend = std::make_shared<MockProcessBackend>();
    cheat_agent::MemoryScanner scanner(backend);
    const uint8_t pattern[] = {0xDE, 0xAD, 0xBE, 0xEF};
    size_t written = 0;
    REQUIRE_EQ(backend->write_memory(0xFFFE, pattern, sizeof(pattern), written), CHEAT_STATUS_OK);
    REQUIRE_EQ(scanner.scan_aob("DE AD BE EF"), CHEAT_STATUS_OK);
    bool found = false;
    for (const auto& match : scanner.get_candidates()) {
        if (match.address == 0xFFFE) found = true;
    }
    REQUIRE(found);
}


TEST_CASE(memory_scanner_rejects_oversized_patterns) {
    auto backend = std::make_shared<MockProcessBackend>();
    cheat_agent::MemoryScanner scanner(backend);
    std::vector<uint8_t> bytes(4097, 0xAA);
    REQUIRE_EQ(scanner.first_scan(CHEAT_DATA_TYPE_BYTE_ARRAY,
        CHEAT_SCAN_MODE_EXACT, bytes.data(), nullptr, bytes.size()),
        CHEAT_STATUS_INVALID_ARGUMENT);
    std::string pattern;
    for (size_t i = 0; i < bytes.size(); ++i) {
        if (!pattern.empty()) pattern += ' ';
        pattern += "AA";
    }
    REQUIRE_EQ(scanner.scan_aob(pattern), CHEAT_STATUS_INVALID_ARGUMENT);
}
