#include "test_main.hpp"
#include "gtlibcpp_adapter.hpp"
#include <map>
#include <vector>
#include <cstring>

namespace {

class MockProcessBackend final : public cheat_agent::IProcessBackend {
public:
    explicit MockProcessBackend(uint32_t pid) : pid_(pid) {}

    bool is_alive() const noexcept override { return alive_; }
    uint32_t get_pid() const noexcept override { return pid_; }

    int32_t read_memory(uint64_t address, void* buffer, size_t size, size_t& bytes_read) override {
        bytes_read = 0;
        if (!buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
        for (size_t i = 0; i < size; ++i) {
            auto it = memory_.find(address + i);
            if (it == memory_.end()) return CHEAT_STATUS_ERROR;
            static_cast<uint8_t*>(buffer)[i] = it->second;
        }
        bytes_read = size;
        return CHEAT_STATUS_OK;
    }

    int32_t write_memory(uint64_t address, const void* buffer, size_t size, size_t& bytes_written) override {
        bytes_written = 0;
        if (!buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
        for (size_t i = 0; i < size; ++i) {
            memory_[address + i] = static_cast<const uint8_t*>(buffer)[i];
        }
        bytes_written = size;
        return CHEAT_STATUS_OK;
    }

    std::vector<cheat_agent::MemoryRegion> query_regions() override { return {}; }
    std::vector<cheat_agent::ModuleInfo> query_modules() override { return {}; }

    void set_memory(uint64_t address, const std::vector<uint8_t>& bytes) {
        for (size_t i = 0; i < bytes.size(); ++i) {
            memory_[address + i] = bytes[i];
        }
    }

private:
    uint32_t pid_{1337};
    bool alive_{true};
    std::map<uint64_t, uint8_t> memory_{};
};

} // namespace

TEST_CASE(gtlibcpp_platform_availability_indicator) {
#if defined(_WIN32)
    REQUIRE(cheat_agent::gtlibcpp_has_native_win32_backend());
#else
    REQUIRE(!cheat_agent::gtlibcpp_has_native_win32_backend());
#endif
}

TEST_CASE(gtlibcpp_memory_backend_adapter_wraps_process_backend) {
    auto mock = std::make_shared<MockProcessBackend>(4242);
    std::vector<uint8_t> test_payload = {0xDE, 0xAD, 0xBE, 0xEF};
    mock->set_memory(0x1000, test_payload);

    gtlibcpp::TargetIdentity ident{};
    ident.pid = 4242;
    ident.architecture = gtlibcpp::Architecture::x64;

    auto adapter = std::make_shared<cheat_agent::GtlibMemoryBackendAdapter>(mock, ident);
    REQUIRE(adapter->is_alive());
    REQUIRE_EQ(adapter->identity().pid, 4242u);
    REQUIRE_EQ(adapter->target_id(), std::string("pid:4242"));

    gtlibcpp::MemorySession session(adapter);
    auto read_res = session.read_bytes(0x1000, 4);
    REQUIRE(read_res.ok());
    REQUIRE_EQ(read_res.value().size(), 4u);
    REQUIRE_EQ(read_res.value()[0], 0xDE);
    REQUIRE_EQ(read_res.value()[1], 0xAD);
    REQUIRE_EQ(read_res.value()[2], 0xBE);
    REQUIRE_EQ(read_res.value()[3], 0xEF);

    // Write through GTLibCpp session into backend
    std::vector<uint8_t> new_payload = {0x11, 0x22, 0x33, 0x44};
    auto write_res = session.write_bytes(0x1000, new_payload);
    REQUIRE(write_res.ok());
    REQUIRE_EQ(write_res.value(), 4u);

    std::vector<uint8_t> read_back(4);
    size_t bytes_read = 0;
    mock->read_memory(0x1000, read_back.data(), 4, bytes_read);
    REQUIRE_EQ(read_back[0], 0x11);
    REQUIRE_EQ(read_back[3], 0x44);

    // Safety caps: > 1 MiB rejected fail-closed
    auto huge_read = session.read_bytes(0x1000, (1u << 20) + 1);
    REQUIRE(!huge_read.ok());
    REQUIRE(huge_read.error().code == gtlibcpp::ErrorCode::invalid_size);

    // Address overflow wrap rejected fail-closed
    auto overflow_read = session.read_bytes(UINT64_MAX - 10, 20);
    REQUIRE(!overflow_read.ok());
    REQUIRE(overflow_read.error().code == gtlibcpp::ErrorCode::invalid_address);
}

TEST_CASE(gtlibcpp_process_backend_adapter_unauthenticated_write_fails_closed) {
    auto mock = std::make_shared<MockProcessBackend>(9999);
    mock->set_memory(0x2000, {0x00, 0x00, 0x00, 0x00});

    auto mem_adapter = std::make_shared<cheat_agent::GtlibMemoryBackendAdapter>(mock);
    auto session = std::make_shared<gtlibcpp::MemorySession>(mem_adapter);

    // Adapter with require_policy_authorization = true (default)
    cheat_agent::GtlibProcessBackendAdapter proc_adapter(session, true);
    REQUIRE(!proc_adapter.is_write_authorized());

    uint32_t val = 0x12345678;
    size_t written = 0;
    int32_t status = proc_adapter.write_memory(0x2000, &val, sizeof(val), written);

    // Must fail closed with PERMISSION_DENIED!
    REQUIRE_EQ(status, CHEAT_STATUS_PERMISSION_DENIED);
    REQUIRE_EQ(written, 0u);

    // Authorize write explicitly
    proc_adapter.authorize_write(true);
    REQUIRE(proc_adapter.is_write_authorized());

    status = proc_adapter.write_memory(0x2000, &val, sizeof(val), written);
    REQUIRE_EQ(status, CHEAT_STATUS_OK);
    REQUIRE_EQ(written, sizeof(val));

    uint32_t read_back = 0;
    size_t bytes_read = 0;
    status = proc_adapter.read_memory(0x2000, &read_back, sizeof(read_back), bytes_read);
    REQUIRE_EQ(status, CHEAT_STATUS_OK);
    REQUIRE_EQ(read_back, 0x12345678u);
}

TEST_CASE(gtlibcpp_architecture_aware_pointer_resolution) {
    auto mock = std::make_shared<MockProcessBackend>(1010);

    // Setup x86 32-bit pointer chain:
    // Base 0x1000 holds pointer 0x2000 (32-bit)
    uint32_t ptr32 = 0x2000;
    mock->set_memory(0x1000, {
        static_cast<uint8_t>(ptr32 & 0xFF),
        static_cast<uint8_t>((ptr32 >> 8) & 0xFF),
        static_cast<uint8_t>((ptr32 >> 16) & 0xFF),
        static_cast<uint8_t>((ptr32 >> 24) & 0xFF)
    });
    // Offset 0x10 -> Target 0x2010
    mock->set_memory(0x2010, {0xAA, 0xBB});

    auto mem_adapter = std::make_shared<cheat_agent::GtlibMemoryBackendAdapter>(mock);
    auto session = std::make_shared<gtlibcpp::MemorySession>(mem_adapter);
    cheat_agent::GtlibProcessBackendAdapter proc_adapter(session);

    auto res_x86 = proc_adapter.resolve_pointer_chain(0x1000, {0x0, 0x10}, gtlibcpp::Architecture::x86);
    REQUIRE(res_x86.ok());
    REQUIRE_EQ(res_x86.value(), 0x2010u);

    // Setup x64 64-bit pointer chain:
    // Base 0x3000 holds pointer 0x00007FFF10002000 (64-bit)
    uint64_t ptr64 = 0x00007FFF10002000ULL;
    std::vector<uint8_t> ptr64_bytes(8);
    std::memcpy(ptr64_bytes.data(), &ptr64, 8);
    mock->set_memory(0x3000, ptr64_bytes);

    auto res_x64 = proc_adapter.resolve_pointer_chain(0x3000, {0x0, 0x20}, gtlibcpp::Architecture::x64);
    REQUIRE(res_x64.ok());
    REQUIRE_EQ(res_x64.value(), 0x00007FFF10002020ULL);

    // Reject unknown architecture
    auto res_unknown = proc_adapter.resolve_pointer_chain(0x3000, {0x0, 0x20}, gtlibcpp::Architecture::unknown);
    REQUIRE(!res_unknown.ok());
    REQUIRE(res_unknown.error().code == gtlibcpp::ErrorCode::invalid_type);
}
