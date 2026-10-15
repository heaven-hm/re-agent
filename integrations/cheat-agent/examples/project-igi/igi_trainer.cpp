// Project IGI (x86) - GTLibCpp-backed offline trainer example.
// Windows only. Addresses and instruction signatures are build-specific.
#include <gtlibcpp/memory_session.hpp>
#include <gtlibcpp/windows_backend.hpp>
#include <windows.h>
#include <tlhelp32.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <csignal>
#include <cstdint>
#include <iostream>
#include <string>
#include <stdexcept>
#include <vector>

namespace {
std::atomic<bool> running{true};
void on_interrupt(int) { running.store(false); }

DWORD find_pid(const wchar_t* name) {
    const HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return 0;
    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);
    DWORD pid = 0;
    if (Process32FirstW(snapshot, &entry)) {
        do {
            if (_wcsicmp(entry.szExeFile, name) == 0) {
                pid = entry.th32ProcessID;
                break;
            }
        } while (Process32NextW(snapshot, &entry));
    }
    CloseHandle(snapshot);
    return pid;
}

std::string executable_path(DWORD pid) {
    HANDLE handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!handle) return {};
    std::array<char, 32768> path{};
    DWORD length = static_cast<DWORD>(path.size());
    const BOOL ok = QueryFullProcessImageNameA(handle, 0, path.data(), &length);
    CloseHandle(handle);
    return ok ? std::string(path.data(), length) : std::string{};
}

struct Patch {
    const char* name;
    gtlibcpp::Address address;
    std::vector<std::uint8_t> expected;
    std::vector<std::uint8_t> replacement;
    bool applied{false};
};

bool verify_signature(gtlibcpp::MemorySession& session, const Patch& patch) {
    const auto read = session.read_bytes(patch.address, patch.expected.size());
    if (!read) {
        std::cerr << "[!] " << patch.name << " read error: "
                  << read.error().message << '\n';
        return false;
    }
    if (read.value() != patch.expected) {
        std::cerr << "[!] " << patch.name
                  << " unexpected bytes; unsupported executable build. No write.\n";
        return false;
    }
    return true;
}

bool apply_patch(gtlibcpp::MemorySession& session, Patch& patch) {
    auto result = session.write_bytes(patch.address, patch.replacement);
    if (!result || result.value() != patch.replacement.size()) {
        std::cerr << "[!] " << patch.name
                  << " write denied/failed (target page may not be writable).\n";
        // A failing write can still be partial; make a best-effort rollback.
        auto undo = session.write_bytes(patch.address, patch.expected);
        auto verify = session.read_bytes(patch.address, patch.expected.size());
        if (!undo || !verify || verify.value() != patch.expected)
            std::cerr << "[!] Rollback unverified: " << patch.name << '\n';
        return false;
    }
    auto check = session.read_bytes(patch.address, patch.replacement.size());
    if (!check || check.value() != patch.replacement) {
        std::cerr << "[!] " << patch.name << " readback mismatch.\n";
        // Attempt restoring even when readback failed: a partial write may have occurred.
        auto undo = session.write_bytes(patch.address, patch.expected);
        if (!undo) std::cerr << "[!] Emergency restore failed: " << patch.name << '\n';
        return false;
    }
    patch.applied = true;
    return true;
}

bool restore(gtlibcpp::MemorySession& session, Patch& patch) {
    if (!patch.applied) return true;
    auto current = session.read_bytes(patch.address, patch.replacement.size());
    if (!current || current.value() != patch.replacement) {
        std::cerr << "[!] " << patch.name
                  << " changed externally: refusing to overwrite unknown bytes.\n";
        return false;
    }
    auto written = session.write_bytes(patch.address, patch.expected);
    auto checked = session.read_bytes(patch.address, patch.expected.size());
    if (!written || !checked || checked.value() != patch.expected) {
        std::cerr << "[!] Failed to restore " << patch.name << '\n';
        return false;
    }
    patch.applied = false;
    return true;
}
} // namespace

int main(int argc, char** argv) {
    std::signal(SIGINT, on_interrupt);
    bool apply = false;
    DWORD pid = 0;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--apply") apply = true;
        else if (arg == "--pid" && i + 1 < argc) {
            try {
                const auto parsed = std::stoull(argv[++i]);
                if (parsed == 0 || parsed > 0xFFFFFFFFULL) throw std::out_of_range("PID");
                pid = static_cast<DWORD>(parsed);
            } catch (...) { std::cerr << "Invalid PID\n"; return 2; }
        } else {
            std::cerr << "Usage: igi_trainer [--pid PID] [--apply]\n";
            return 2;
        }
    }
    if (!pid) pid = find_pid(L"igi.exe");
    if (!pid) {
        std::cerr << "Project IGI not running. Start your authorized offline copy.\n";
        return 1;
    }
    const std::string path = executable_path(pid);
    if (path.empty()) {
        std::cerr << "Cannot verify target executable path.\n";
        return 1;
    }
    // Read-only by default. Native Win32 process discovery stays outside GTLibCpp;
    // all process-memory reads/writes use MemorySession.
    gtlibcpp::WindowsBackendOptions options{};
    options.pid = pid;
    options.image_path = path;
    options.architecture = gtlibcpp::Architecture::x86;
    options.read_only = !apply;
    auto backend = gtlibcpp::make_windows_backend(options);
    if (!backend) {
        std::cerr << "GTLibCpp attach failed.\n";
        return 1;
    }
    gtlibcpp::MemorySession session(backend);
    // Historical IGI addresses and signatures: validate against your own game
    // binary before applying; unknown versions fail closed.
    std::vector<Patch> patches{
        {"ammo decrement", 0x00478BB2, {0xFF, 0x4E, 0x08}, {0x90, 0x90, 0x90}},
        {"player damage",  0x00412440, {0x55, 0x8B, 0xEC}, {0xC2, 0x04, 0x00}}
    };
    for (const auto& patch : patches) {
        if (!verify_signature(session, patch)) return 1;
    }
    std::cout << "Target: " << path << " (PID " << pid << ")\n";
    if (!apply) {
        std::cout << "Read-only preflight passed. Add --apply to request writes.\n";
        return 0;
    }
    std::cout << "Applying verified signatures with GTLibCpp MemorySession.\n";
    // write_bytes does not change page protections. RX code pages may reject
    // writes. Never silently elevate executable memory permissions.
    for (auto& patch : patches) {
        if (!apply_patch(session, patch)) {
            bool ok = true;
            for (auto it = patches.rbegin(); it != patches.rend(); ++it)
                ok = restore(session, *it) && ok;
            return ok ? 1 : 3;
        }
    }
    std::cout << "Byte readback verified; game behavior is NOT yet verified.\n"
              << "Press Ctrl+C to attempt restoration.\n";
    while (running.load()) Sleep(200);
    bool restored = true;
    for (auto it = patches.rbegin(); it != patches.rend(); ++it)
        restored = restore(session, *it) && restored;
    std::cout << (restored ? "Original bytes restored.\n"
                           : "Restoration incomplete; inspect target manually.\n");
    return restored ? 0 : 3;
}
