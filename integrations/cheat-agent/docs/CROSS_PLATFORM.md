# Cross-Platform Architecture & OS Capabilities

## 1. Supported Platforms & Architectures

| OS | Supported Architectures | Native Syscalls / APIs | Process Privilege Requirements |
| :--- | :--- | :--- | :--- |
| **Windows 10 / 11** | x86 (32-bit), x86-64 | `VirtualQueryEx`, `ReadProcessMemory`, `WriteProcessMemory`, Named Pipes | Standard User (Administrator for elevated targets) |
| **Linux (Ubuntu, Debian, Fedora, Arch)** | x86-64, ARM64 | `process_vm_readv`, `process_vm_writev`, `/proc/[pid]/maps`, Unix Domain Sockets | `ptrace` permissions (`sysctl kernel.yama.ptrace_scope=0` or `CAP_SYS_PTRACE`) |
| **macOS (Sonoma, Sequoia, etc.)** | Apple Silicon (ARM64), Intel (x86-64) | `mach_vm_read_overwrite`, `mach_vm_write`, `mach_vm_region_recurse`, Mach ports | Task port entitlement (`task_for_pid`) or `sudo` for foreign processes |

---

## 2. Platform Capability Matrix

Cheat Agent queries the host OS at runtime to assemble a dynamic `PlatformCapabilities` struct:
- `can_read_virtual_memory`: `true` on Windows, Linux, macOS when permitted.
- `can_write_virtual_memory`: `true` when write permissions and authorization tokens are valid.
- `can_query_memory_regions`: Supported via `VirtualQueryEx` (Windows), `/proc/maps` (Linux), `mach_vm_region_recurse` (macOS).
- `supports_hardware_breakpoints`: Requires platform debugger backend.
- `supports_named_pipes`: Native on Windows; emulated via Unix domain sockets on Linux/macOS.

When a platform-specific feature is unavailable (e.g. `mach_vm_write` blocked by macOS Hardened Runtime), the engine returns an explicit `ErrorCode::capability_missing` rather than failing unexpectedly or hanging.
