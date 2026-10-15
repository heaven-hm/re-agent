#include "process_backend.hpp"

#if defined(_WIN32)
#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <vector>
#include <string>

namespace cheat_agent {

class WindowsProcessBackend final : public IProcessBackend {
public:
    explicit WindowsProcessBackend(uint32_t pid) : pid_(pid) {
        if (pid_ != 0) {
            handle_ = ::OpenProcess(
                PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_QUERY_INFORMATION,
                FALSE,
                pid_);
        }
    }

    ~WindowsProcessBackend() override {
        if (handle_ && handle_ != INVALID_HANDLE_VALUE) {
            ::CloseHandle(handle_);
            handle_ = nullptr;
        }
    }

    [[nodiscard]] bool is_alive() const noexcept override {
        if (!handle_ || handle_ == INVALID_HANDLE_VALUE) return false;
        DWORD exit_code = 0;
        if (::GetExitCodeProcess(handle_, &exit_code)) {
            return exit_code == STILL_ACTIVE;
        }
        return false;
    }

    [[nodiscard]] uint32_t get_pid() const noexcept override {
        return pid_;
    }

    int32_t read_memory(uint64_t address, void* buffer, size_t size, size_t& bytes_read) override {
        bytes_read = 0;
        if (!handle_ || !buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;

        SIZE_T read = 0;
        if (!::ReadProcessMemory(handle_, reinterpret_cast<LPCVOID>(address), buffer, size, &read)) {
            return CHEAT_STATUS_ERROR;
        }

        bytes_read = static_cast<size_t>(read);
        return CHEAT_STATUS_OK;
    }

    int32_t write_memory(uint64_t address, const void* buffer, size_t size, size_t& bytes_written) override {
        bytes_written = 0;
        if (!handle_ || !buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;

        SIZE_T written = 0;
        if (!::WriteProcessMemory(handle_, reinterpret_cast<LPVOID>(address), buffer, size, &written)) {
            return CHEAT_STATUS_ERROR;
        }

        bytes_written = static_cast<size_t>(written);
        return CHEAT_STATUS_OK;
    }

    std::vector<MemoryRegion> query_regions() override {
        std::vector<MemoryRegion> regions;
        if (!handle_) return regions;

        SYSTEM_INFO si;
        ::GetSystemInfo(&si);

        uint8_t* addr = static_cast<uint8_t*>(si.lpMinimumApplicationAddress);
        uint8_t* max_addr = static_cast<uint8_t*>(si.lpMaximumApplicationAddress);

        MEMORY_BASIC_INFORMATION mbi;
        while (addr < max_addr && ::VirtualQueryEx(handle_, addr, &mbi, sizeof(mbi)) == sizeof(mbi)) {
            if (mbi.State == MEM_COMMIT && !(mbi.Protect & PAGE_NOACCESS) && !(mbi.Protect & PAGE_GUARD)) {
                MemoryRegion reg{};
                reg.base_address = reinterpret_cast<uint64_t>(mbi.BaseAddress);
                reg.size = mbi.RegionSize;
                reg.is_readable = true;
                reg.is_writable = (mbi.Protect & (PAGE_READWRITE | PAGE_WRITECOPY | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) != 0;
                reg.is_executable = (mbi.Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) != 0;
                regions.push_back(reg);
            }
            addr += mbi.RegionSize;
        }

        return regions;
    }

    std::vector<ModuleInfo> query_modules() override {
        std::vector<ModuleInfo> modules;
        if (pid_ == 0) return modules;

        HANDLE snap = ::CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid_);
        if (snap != INVALID_HANDLE_VALUE) {
            MODULEENTRY32W me;
            me.dwSize = sizeof(me);
            if (::Module32FirstW(snap, &me)) {
                do {
                    ModuleInfo info{};
                    char narrow_name[256];
                    ::WideCharToMultiByte(CP_UTF8, 0, me.szModule, -1, narrow_name, sizeof(narrow_name), nullptr, nullptr);
                    char narrow_path[1024];
                    ::WideCharToMultiByte(CP_UTF8, 0, me.szExePath, -1, narrow_path, sizeof(narrow_path), nullptr, nullptr);

                    info.name = narrow_name;
                    info.path = narrow_path;
                    info.base_address = reinterpret_cast<uint64_t>(me.modBaseAddr);
                    info.size = me.modBaseSize;
                    modules.push_back(info);
                } while (::Module32NextW(snap, &me));
            }
            ::CloseHandle(snap);
        }

        return modules;
    }

private:
    uint32_t pid_{0};
    HANDLE handle_{nullptr};
};

std::unique_ptr<IProcessBackend> IProcessBackend::create(uint32_t pid) {
    return std::make_unique<WindowsProcessBackend>(pid);
}

} // namespace cheat_agent
#endif
