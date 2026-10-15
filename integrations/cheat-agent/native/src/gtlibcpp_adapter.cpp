#include "gtlibcpp_adapter.hpp"
#include <cstring>
#include <limits>

namespace cheat_agent {

// ============================================================================
// GtlibMemoryBackendAdapter Implementation
// ============================================================================

GtlibMemoryBackendAdapter::GtlibMemoryBackendAdapter(
    std::shared_ptr<IProcessBackend> backend,
    gtlibcpp::TargetIdentity identity)
    : backend_(std::move(backend)), identity_(std::move(identity)) {
    if (identity_.pid == 0 && backend_) {
        identity_.pid = backend_->get_pid();
    }
}

gtlibcpp::Result<std::vector<std::uint8_t>>
GtlibMemoryBackendAdapter::read(gtlibcpp::Address address, std::size_t size) {
    auto valid = gtlibcpp::validate_read_request(address, size);
    if (!valid.ok()) {
        return gtlibcpp::Result<std::vector<std::uint8_t>>::failure(valid.error());
    }

    if (!backend_) {
        return gtlibcpp::Result<std::vector<std::uint8_t>>::failure(
            gtlibcpp::make_error(gtlibcpp::ErrorCode::not_connected, "process backend is null",
                                 "GtlibMemoryBackendAdapter::read", address, size));
    }

    std::vector<std::uint8_t> buffer(size);
    std::size_t bytes_read = 0;
    int32_t status = backend_->read_memory(address, buffer.data(), size, bytes_read);

    if (status != CHEAT_STATUS_OK) {
        return gtlibcpp::Result<std::vector<std::uint8_t>>::failure(
            gtlibcpp::make_error(gtlibcpp::ErrorCode::read_failed, "backend read_memory failed",
                                 "GtlibMemoryBackendAdapter::read", address, size));
    }

    if (bytes_read < size) {
        buffer.resize(bytes_read);
    }

    return gtlibcpp::Result<std::vector<std::uint8_t>>::success(std::move(buffer));
}

gtlibcpp::Result<std::size_t>
GtlibMemoryBackendAdapter::write(gtlibcpp::Address address, const std::vector<std::uint8_t>& bytes) {
    auto valid = gtlibcpp::validate_write_request(address, bytes.size());
    if (!valid.ok()) {
        return gtlibcpp::Result<std::size_t>::failure(valid.error());
    }

    if (!backend_) {
        return gtlibcpp::Result<std::size_t>::failure(
            gtlibcpp::make_error(gtlibcpp::ErrorCode::not_connected, "process backend is null",
                                 "GtlibMemoryBackendAdapter::write", address, bytes.size()));
    }

    std::size_t bytes_written = 0;
    int32_t status = backend_->write_memory(address, bytes.data(), bytes.size(), bytes_written);

    if (status != CHEAT_STATUS_OK) {
        return gtlibcpp::Result<std::size_t>::failure(
            gtlibcpp::make_error(gtlibcpp::ErrorCode::write_failed, "backend write_memory failed",
                                 "GtlibMemoryBackendAdapter::write", address, bytes.size()));
    }

    return gtlibcpp::Result<std::size_t>::success(bytes_written);
}

bool GtlibMemoryBackendAdapter::is_alive() noexcept {
    return backend_ && backend_->is_alive();
}

std::string GtlibMemoryBackendAdapter::target_id() const {
    if (!backend_) return "pid:0";
    return "pid:" + std::to_string(backend_->get_pid());
}

gtlibcpp::TargetIdentity GtlibMemoryBackendAdapter::identity() const {
    return identity_;
}

// ============================================================================
// GtlibProcessBackendAdapter Implementation
// ============================================================================

GtlibProcessBackendAdapter::GtlibProcessBackendAdapter(
    std::shared_ptr<gtlibcpp::MemorySession> session,
    bool require_policy_authorization)
    : session_(std::move(session)),
      require_policy_authorization_(require_policy_authorization) {}

bool GtlibProcessBackendAdapter::is_alive() const noexcept {
    return session_ && session_->backend() && session_->backend()->is_alive();
}

uint32_t GtlibProcessBackendAdapter::get_pid() const noexcept {
    if (!session_ || !session_->backend()) return 0;
    return session_->backend()->identity().pid;
}

int32_t GtlibProcessBackendAdapter::read_memory(
    uint64_t address, void* buffer, size_t size, size_t& bytes_read) {
    bytes_read = 0;
    if (!buffer || size == 0) {
        return CHEAT_STATUS_INVALID_ARGUMENT;
    }
    if (!session_) {
        return CHEAT_STATUS_NOT_CONNECTED;
    }

    auto valid = gtlibcpp::validate_read_request(address, size);
    if (!valid.ok()) {
        return CHEAT_STATUS_INVALID_ARGUMENT;
    }

    auto res = session_->read_bytes(address, size);
    if (!res.ok()) {
        switch (res.error().code) {
            case gtlibcpp::ErrorCode::invalid_size:
            case gtlibcpp::ErrorCode::invalid_address:
            case gtlibcpp::ErrorCode::invalid_type:
                return CHEAT_STATUS_INVALID_ARGUMENT;
            case gtlibcpp::ErrorCode::policy_denied:
            case gtlibcpp::ErrorCode::approval_required:
                return CHEAT_STATUS_PERMISSION_DENIED;
            case gtlibcpp::ErrorCode::not_connected:
            case gtlibcpp::ErrorCode::target_not_found:
            case gtlibcpp::ErrorCode::target_dead:
                return CHEAT_STATUS_NOT_CONNECTED;
            case gtlibcpp::ErrorCode::partial_read:
                return CHEAT_STATUS_PARTIAL_READ;
            default:
                return CHEAT_STATUS_ERROR;
        }
    }

    const auto& data = res.value();
    std::memcpy(buffer, data.data(), data.size());
    bytes_read = data.size();
    return CHEAT_STATUS_OK;
}

int32_t GtlibProcessBackendAdapter::write_memory(
    uint64_t address, const void* buffer, size_t size, size_t& bytes_written) {
    bytes_written = 0;
    if (!buffer || size == 0) {
        return CHEAT_STATUS_INVALID_ARGUMENT;
    }
    if (!session_) {
        return CHEAT_STATUS_NOT_CONNECTED;
    }

    // Fail-closed policy check: unauthenticated writes are strictly denied.
    if (require_policy_authorization_ && !write_authorized_) {
        return CHEAT_STATUS_PERMISSION_DENIED;
    }

    auto valid = gtlibcpp::validate_write_request(address, size);
    if (!valid.ok()) {
        return CHEAT_STATUS_INVALID_ARGUMENT;
    }

    const auto* p = static_cast<const std::uint8_t*>(buffer);
    std::vector<std::uint8_t> bytes(p, p + size);

    auto res = session_->write_bytes(address, bytes);
    if (!res.ok()) {
        switch (res.error().code) {
            case gtlibcpp::ErrorCode::invalid_size:
            case gtlibcpp::ErrorCode::invalid_address:
            case gtlibcpp::ErrorCode::invalid_type:
                return CHEAT_STATUS_INVALID_ARGUMENT;
            case gtlibcpp::ErrorCode::policy_denied:
            case gtlibcpp::ErrorCode::approval_required:
                return CHEAT_STATUS_PERMISSION_DENIED;
            case gtlibcpp::ErrorCode::not_connected:
            case gtlibcpp::ErrorCode::target_not_found:
            case gtlibcpp::ErrorCode::target_dead:
                return CHEAT_STATUS_NOT_CONNECTED;
            default:
                return CHEAT_STATUS_ERROR;
        }
    }

    bytes_written = res.value();
    return CHEAT_STATUS_OK;
}

std::vector<MemoryRegion> GtlibProcessBackendAdapter::query_regions() {
    return {};
}

std::vector<ModuleInfo> GtlibProcessBackendAdapter::query_modules() {
    return {};
}

gtlibcpp::Result<gtlibcpp::Address>
GtlibProcessBackendAdapter::resolve_pointer_chain(
    gtlibcpp::Address base_address,
    const std::vector<int64_t>& offsets,
    gtlibcpp::Architecture arch) {
    if (!session_) {
        return gtlibcpp::Result<gtlibcpp::Address>::failure(
            gtlibcpp::make_error(gtlibcpp::ErrorCode::not_connected, "no session attached",
                                 "resolve_pointer_chain", base_address, 0));
    }

    size_t ptr_width = 0;
    if (arch == gtlibcpp::Architecture::x86) {
        ptr_width = 4;
    } else if (arch == gtlibcpp::Architecture::x64) {
        ptr_width = 8;
    } else {
        return gtlibcpp::Result<gtlibcpp::Address>::failure(
            gtlibcpp::make_error(gtlibcpp::ErrorCode::invalid_type,
                                 "unsupported architecture for pointer resolution",
                                 "resolve_pointer_chain", base_address, 0));
    }

    gtlibcpp::Address current = base_address;

    for (size_t i = 0; i < offsets.size(); ++i) {
        int64_t off = offsets[i];
        bool is_last = (i == offsets.size() - 1);

        if (!is_last) {
            // Dereference pointer at current address
            auto read_res = session_->read_bytes(current, ptr_width);
            if (!read_res.ok()) {
                return gtlibcpp::Result<gtlibcpp::Address>::failure(read_res.error());
            }

            gtlibcpp::Address next_base = 0;
            if (ptr_width == 4) {
                uint32_t val32 = 0;
                std::memcpy(&val32, read_res.value().data(), 4);
                next_base = val32;
            } else {
                uint64_t val64 = 0;
                std::memcpy(&val64, read_res.value().data(), 8);
                next_base = val64;
            }

            if (next_base == 0) {
                return gtlibcpp::Result<gtlibcpp::Address>::failure(
                    gtlibcpp::make_error(gtlibcpp::ErrorCode::invalid_address,
                                         "null pointer dereference in chain",
                                         "resolve_pointer_chain", current, i));
            }

            // Check overflow adding offset to next_base
            if (off < 0 && static_cast<uint64_t>(-off) > next_base) {
                return gtlibcpp::Result<gtlibcpp::Address>::failure(
                    gtlibcpp::make_error(gtlibcpp::ErrorCode::invalid_address,
                                         "negative pointer offset underflows address 0",
                                         "resolve_pointer_chain", next_base, off));
            }
            if (off > 0 && (std::numeric_limits<uint64_t>::max() - next_base) < static_cast<uint64_t>(off)) {
                return gtlibcpp::Result<gtlibcpp::Address>::failure(
                    gtlibcpp::make_error(gtlibcpp::ErrorCode::invalid_address,
                                         "pointer offset overflows address space",
                                         "resolve_pointer_chain", next_base, off));
            }

            current = (off >= 0) ? (next_base + static_cast<uint64_t>(off))
                                 : (next_base - static_cast<uint64_t>(-off));
        } else {
            // Apply last offset directly to current
            if (off < 0 && static_cast<uint64_t>(-off) > current) {
                return gtlibcpp::Result<gtlibcpp::Address>::failure(
                    gtlibcpp::make_error(gtlibcpp::ErrorCode::invalid_address,
                                         "final pointer offset underflows address 0",
                                         "resolve_pointer_chain", current, off));
            }
            if (off > 0 && (std::numeric_limits<uint64_t>::max() - current) < static_cast<uint64_t>(off)) {
                return gtlibcpp::Result<gtlibcpp::Address>::failure(
                    gtlibcpp::make_error(gtlibcpp::ErrorCode::invalid_address,
                                         "final pointer offset overflows address space",
                                         "resolve_pointer_chain", current, off));
            }
            current = (off >= 0) ? (current + static_cast<uint64_t>(off))
                                 : (current - static_cast<uint64_t>(-off));
        }
    }

    return gtlibcpp::Result<gtlibcpp::Address>::success(current);
}

} // namespace cheat_agent
