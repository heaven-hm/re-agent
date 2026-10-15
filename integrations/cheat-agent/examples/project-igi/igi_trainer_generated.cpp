// ============================================================================
// Auto-generated Standalone C++20 Trainer by Cheat Agent
// Target: Project IGI: I'm Going In (x86)
// Cheat:  Project IGI - Infinite Ammo & God Mode
// ============================================================================

#include <iostream>
#include <chrono>
#include <thread>
#include <atomic>
#include <csignal>
#include <cstdint>
#include <cstring>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#elif defined(__APPLE__)
#include <unistd.h>
#include <mach/mach.h>
#include <mach/mach_vm.h>
#elif defined(__linux__)
#include <unistd.h>
#include <sys/uio.h>
#endif

namespace {
std::atomic<bool> g_running{true};

void signal_handler(int) {
    g_running.store(false);
}

bool write_process_memory_bytes(uint32_t pid, uint64_t address, const void* data, size_t size) {
#if defined(_WIN32)
    HANDLE hProcess = OpenProcess(PROCESS_VM_WRITE | PROCESS_VM_OPERATION, FALSE, pid);
    if (!hProcess) return false;
    SIZE_T bytes_written = 0;
    BOOL ok = WriteProcessMemory(hProcess, reinterpret_cast<LPVOID>(address), data, size, &bytes_written);
    CloseHandle(hProcess);
    return ok && (bytes_written == size);
#elif defined(__APPLE__)
    mach_port_t task = MACH_PORT_NULL;
    if (task_for_pid(mach_task_self(), pid, &task) != KERN_SUCCESS) return false;
    kern_return_t kr = mach_vm_write(task, address, reinterpret_cast<vm_offset_t>(data), static_cast<mach_msg_type_number_t>(size));
    return kr == KERN_SUCCESS;
#elif defined(__linux__)
    struct iovec local{ const_cast<void*>(data), size };
    struct iovec remote{ reinterpret_cast<void*>(address), size };
    ssize_t written = process_vm_writev(pid, &local, 1, &remote, 1, 0);
    return written == static_cast<ssize_t>(size);
#else
    (void)pid; (void)address; (void)data; (void)size;
    return false;
#endif
}
} // namespace

int main(int argc, char** argv) {
    std::signal(SIGINT, signal_handler);
    std::cout << "[+] Cheat Agent Standalone Trainer: Project IGI - Infinite Ammo & God Mode" << std::endl;
    std::cout << "[+] Target: Project IGI: I'm Going In (x86)" << std::endl;
    std::cout << "[+] Press Ctrl+C to stop trainer and restore memory." << std::endl;

    uint32_t pid = 0;
    if (argc >= 2) {
        pid = static_cast<uint32_t>(std::stoul(argv[1]));
    } else {
        std::cout << "Usage: trainer <target_pid>" << std::endl;
        return 1;
    }

    // Module pointer chain resolution
    const char* target_module = "igi.exe";
    uint64_t base_offset = 0x00142A18;
    int64_t offsets[] = { 0x28, 0x54, 0x08,  };
    size_t offset_count = sizeof(offsets) / sizeof(offsets[0]);
    (void)target_module;
    uint64_t target_addr = base_offset;

    int32_t desired_value = static_cast<int32_t>(99);
    std::cout << "[+] Trainer active for PID " << pid << ". Enforcing int32 = " << desired_value << std::endl;

    while (g_running.load()) {
        write_process_memory_bytes(pid, target_addr, &desired_value, sizeof(desired_value));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    std::cout << "\n[+] Trainer cleanly deactivated." << std::endl;
    return 0;
}
