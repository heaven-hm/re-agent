#include "process_backend.hpp"

#if defined(__linux__)
#include <sys/uio.h>
#include <sys/types.h>
#include <signal.h>
#include <unistd.h>
#include <fstream>
#include <sstream>
#include <cstring>
#include <iostream>

namespace cheat_agent {

class LinuxProcessBackend final : public IProcessBackend {
public:
    explicit LinuxProcessBackend(uint32_t pid) : pid_(pid) {}
    ~LinuxProcessBackend() override = default;

    [[nodiscard]] bool is_alive() const noexcept override {
        if (pid_ == 0) return false;
        return kill(static_cast<pid_t>(pid_), 0) == 0;
    }

    [[nodiscard]] uint32_t get_pid() const noexcept override {
        return pid_;
    }

    int32_t read_memory(uint64_t address, void* buffer, size_t size, size_t& bytes_read) override {
        bytes_read = 0;
        if (!buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;

        struct iovec local_iov{};
        local_iov.iov_base = buffer;
        local_iov.iov_len = size;

        struct iovec remote_iov{};
        remote_iov.iov_base = reinterpret_cast<void*>(address);
        remote_iov.iov_len = size;

        ssize_t res = process_vm_readv(static_cast<pid_t>(pid_), &local_iov, 1, &remote_iov, 1, 0);
        if (res < 0) {
            return CHEAT_STATUS_ERROR;
        }

        bytes_read = static_cast<size_t>(res);
        return CHEAT_STATUS_OK;
    }

    int32_t write_memory(uint64_t address, const void* buffer, size_t size, size_t& bytes_written) override {
        bytes_written = 0;
        if (!buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;

        struct iovec local_iov{};
        local_iov.iov_base = const_cast<void*>(buffer);
        local_iov.iov_len = size;

        struct iovec remote_iov{};
        remote_iov.iov_base = reinterpret_cast<void*>(address);
        remote_iov.iov_len = size;

        ssize_t res = process_vm_writev(static_cast<pid_t>(pid_), &local_iov, 1, &remote_iov, 1, 0);
        if (res < 0) {
            return CHEAT_STATUS_ERROR;
        }

        bytes_written = static_cast<size_t>(res);
        return CHEAT_STATUS_OK;
    }

    std::vector<MemoryRegion> query_regions() override {
        std::vector<MemoryRegion> regions;
        if (pid_ == 0) return regions;

        std::string maps_path = "/proc/" + std::to_string(pid_) + "/maps";
        std::ifstream file(maps_path);
        if (!file.is_open()) return regions;

        std::string line;
        while (std::getline(file, line)) {
            std::istringstream iss(line);
            std::string range, perms;
            if (!(iss >> range >> perms)) continue;

            auto dash = range.find('-');
            if (dash == std::string::npos) continue;

            uint64_t start = std::stoull(range.substr(0, dash), nullptr, 16);
            uint64_t end = std::stoull(range.substr(dash + 1), nullptr, 16);

            MemoryRegion reg{};
            reg.base_address = start;
            reg.size = (end > start) ? (end - start) : 0;
            reg.is_readable = perms.size() > 0 && perms[0] == 'r';
            reg.is_writable = perms.size() > 1 && perms[1] == 'w';
            reg.is_executable = perms.size() > 2 && perms[2] == 'x';

            if (reg.is_readable) {
                regions.push_back(reg);
            }
        }

        return regions;
    }

    std::vector<ModuleInfo> query_modules() override {
        std::vector<ModuleInfo> modules;
        if (pid_ == 0) return modules;

        char exe_buf[1024];
        std::string exe_link = "/proc/" + std::to_string(pid_) + "/exe";
        ssize_t len = readlink(exe_link.c_str(), exe_buf, sizeof(exe_buf) - 1);
        if (len > 0) {
            exe_buf[len] = '\0';
            ModuleInfo main_mod{};
            main_mod.path = exe_buf;
            std::string p(exe_buf);
            auto slash = p.find_last_of('/');
            main_mod.name = (slash != std::string::npos) ? p.substr(slash + 1) : p;

            // Lookup base address from /proc/maps
            auto regions = query_regions();
            if (!regions.empty()) {
                main_mod.base_address = regions[0].base_address;
            }
            modules.push_back(main_mod);
        }

        return modules;
    }

private:
    uint32_t pid_{0};
};

std::unique_ptr<IProcessBackend> IProcessBackend::create(uint32_t pid) {
    return std::make_unique<LinuxProcessBackend>(pid);
}

} // namespace cheat_agent
#endif
