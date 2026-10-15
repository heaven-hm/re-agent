#pragma once

#include <cstdint>
#include <cstddef>
#include <memory>
#include <string>
#include <vector>

#include <gtlibcpp/backend.hpp>
#include <gtlibcpp/memory_session.hpp>
#include <gtlibcpp/policy.hpp>
#include <gtlibcpp/types.hpp>
#include <gtlibcpp/result.hpp>

#include "process_backend.hpp"
#include "cheat_agent.h"

namespace cheat_agent {

/**
 * Platform availability indicator for native Win32 GTLibCpp backend vs cross-platform adapter.
 */
[[nodiscard]] constexpr bool gtlibcpp_has_native_win32_backend() noexcept {
#if defined(_WIN32)
    return true;
#else
    return false;
#endif
}

/**
 * Adapter that exposes Cheat Agent's IProcessBackend as a gtlibcpp::IMemoryBackend.
 * Allows GTLibCpp's MemorySession, freeze routines, and policies to operate on top
 * of Cheat Agent's cross-platform process backends (macOS Mach, Linux procfs, Windows Win32).
 */
class GtlibMemoryBackendAdapter final : public gtlibcpp::IMemoryBackend {
public:
    explicit GtlibMemoryBackendAdapter(
        std::shared_ptr<IProcessBackend> backend,
        gtlibcpp::TargetIdentity identity = {});

    ~GtlibMemoryBackendAdapter() override = default;

    [[nodiscard]] gtlibcpp::Result<std::vector<std::uint8_t>>
    read(gtlibcpp::Address address, std::size_t size) override;

    [[nodiscard]] gtlibcpp::Result<std::size_t>
    write(gtlibcpp::Address address, const std::vector<std::uint8_t>& bytes) override;

    [[nodiscard]] bool is_alive() noexcept override;

    [[nodiscard]] std::string target_id() const override;

    [[nodiscard]] gtlibcpp::TargetIdentity identity() const override;

private:
    std::shared_ptr<IProcessBackend> backend_;
    gtlibcpp::TargetIdentity identity_;
};

/**
 * Adapter that exposes GTLibCpp's MemorySession as a Cheat Agent IProcessBackend.
 * Enforces explicit policy authorization checks to guarantee unauthenticated writes
 * or freeze operations fail closed.
 */
class GtlibProcessBackendAdapter final : public IProcessBackend {
public:
    explicit GtlibProcessBackendAdapter(
        std::shared_ptr<gtlibcpp::MemorySession> session,
        bool require_policy_authorization = true);

    ~GtlibProcessBackendAdapter() override = default;

    [[nodiscard]] bool is_alive() const noexcept override;
    [[nodiscard]] uint32_t get_pid() const noexcept override;

    int32_t read_memory(uint64_t address, void* buffer, size_t size, size_t& bytes_read) override;
    int32_t write_memory(uint64_t address, const void* buffer, size_t size, size_t& bytes_written) override;

    std::vector<MemoryRegion> query_regions() override;
    std::vector<ModuleInfo> query_modules() override;

    /**
     * Authorize writes using an explicit policy action.
     */
    void authorize_write(bool authorized) noexcept {
        write_authorized_ = authorized;
    }

    [[nodiscard]] bool is_write_authorized() const noexcept {
        return write_authorized_;
    }

    /**
     * Architecture-aware pointer chain resolution comparing x86 (32-bit) vs x64 (64-bit) pointer semantics.
     */
    [[nodiscard]] gtlibcpp::Result<gtlibcpp::Address>
    resolve_pointer_chain(
        gtlibcpp::Address base_address,
        const std::vector<int64_t>& offsets,
        gtlibcpp::Architecture arch);

    [[nodiscard]] std::shared_ptr<gtlibcpp::MemorySession> session() const noexcept {
        return session_;
    }

private:
    std::shared_ptr<gtlibcpp::MemorySession> session_;
    bool require_policy_authorization_{true};
    bool write_authorized_{false};
};

} // namespace cheat_agent
