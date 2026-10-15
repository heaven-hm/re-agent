#include "process_backend.hpp"

#if defined(__APPLE__)
#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <libproc.h>
#include <unistd.h>
#include <signal.h>
#include <sys/sysctl.h>
#include <cstring>
#include <iostream>

namespace cheat_agent {

class MacosProcessBackend final : public IProcessBackend {
public:
    explicit MacosProcessBackend(uint32_t pid) : pid_(pid) {
        if (pid_ != 0) {
            kern_return_t kr = task_for_pid(mach_task_self(), static_cast<int>(pid_), &task_);
            if (kr != KERN_SUCCESS) {
                task_ = MACH_PORT_NULL;
            }
        }
    }

    ~MacosProcessBackend() override {
        if (task_ != MACH_PORT_NULL) {
            mach_port_deallocate(mach_task_self(), task_);
            task_ = MACH_PORT_NULL;
        }
    }

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

        if (task_ == MACH_PORT_NULL) {
            // Task port unavailable; return permission error
            return CHEAT_STATUS_PERMISSION_DENIED;
        }

        mach_vm_size_t read_size = 0;
        kern_return_t kr = mach_vm_read_overwrite(
            task_,
            static_cast<mach_vm_address_t>(address),
            static_cast<mach_vm_size_t>(size),
            reinterpret_cast<mach_vm_address_t>(buffer),
            &read_size);

        if (kr != KERN_SUCCESS) {
            return CHEAT_STATUS_ERROR;
        }

        bytes_read = static_cast<size_t>(read_size);
        return CHEAT_STATUS_OK;
    }

    int32_t write_memory(uint64_t address, const void* buffer, size_t size, size_t& bytes_written) override {
        bytes_written = 0;
        if (!buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;

        if (task_ == MACH_PORT_NULL) {
            return CHEAT_STATUS_PERMISSION_DENIED;
        }

        kern_return_t kr = mach_vm_write(
            task_,
            static_cast<mach_vm_address_t>(address),
            reinterpret_cast<vm_offset_t>(buffer),
            static_cast<mach_msg_type_number_t>(size));

        if (kr != KERN_SUCCESS) {
            return CHEAT_STATUS_ERROR;
        }

        bytes_written = size;
        return CHEAT_STATUS_OK;
    }

    std::vector<MemoryRegion> query_regions() override {
        std::vector<MemoryRegion> regions;
        if (task_ == MACH_PORT_NULL) return regions;

        mach_vm_address_t address = 0;
        mach_vm_size_t size = 0;
        uint32_t depth = 0;
        vm_region_submap_info_data_64_t info{};
        mach_msg_type_number_t count = VM_REGION_SUBMAP_INFO_COUNT_64;

        while (true) {
            kern_return_t kr = mach_vm_region_recurse(
                task_,
                &address,
                &size,
                &depth,
                reinterpret_cast<vm_region_recurse_info_t>(&info),
                &count);

            if (kr != KERN_SUCCESS) break;

            if (info.is_submap) {
                depth++;
                continue;
            }

            MemoryRegion reg{};
            reg.base_address = static_cast<uint64_t>(address);
            reg.size = static_cast<uint64_t>(size);
            reg.is_readable = (info.protection & VM_PROT_READ) != 0;
            reg.is_writable = (info.protection & VM_PROT_WRITE) != 0;
            reg.is_executable = (info.protection & VM_PROT_EXECUTE) != 0;

            if (reg.is_readable) {
                regions.push_back(reg);
            }

            address += size;
        }

        return regions;
    }

    std::vector<ModuleInfo> query_modules() override {
        std::vector<ModuleInfo> modules;
        if (pid_ == 0) return modules;

        char path_buf[PROC_PIDPATHINFO_MAXSIZE];
        if (proc_pidpath(static_cast<int>(pid_), path_buf, sizeof(path_buf)) > 0) {
            ModuleInfo main_mod{};
            main_mod.path = path_buf;
            std::string path_str(path_buf);
            auto slash = path_str.find_last_of('/');
            main_mod.name = (slash != std::string::npos) ? path_str.substr(slash + 1) : path_str;
            main_mod.base_address = 0x100000000ULL; // Standard Mach-O ASLR slide base
            main_mod.size = 0x1000000;
            modules.push_back(main_mod);
        }

        return modules;
    }

private:
    uint32_t pid_{0};
    mach_port_t task_{MACH_PORT_NULL};
};

std::unique_ptr<IProcessBackend> IProcessBackend::create(uint32_t pid) {
    return std::make_unique<MacosProcessBackend>(pid);
}

} // namespace cheat_agent
#endif
