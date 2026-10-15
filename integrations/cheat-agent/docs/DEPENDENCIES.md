# Project Dependencies & Technical Boundaries

## 1. Approved Implementation Languages

All code in `cheat-agent` is written strictly in:
1. **C17** (`-std=c17` / `/std:c17`)
2. **C++20** (`-std=c++20` / `/std:c++20`)
3. **Rust** (Current Stable Toolchain 1.80+)

### Strictly Prohibited Dependencies
- Python (runtime, scripts, or pip packages)
- Java (JVM, JARs, Gradle/Maven)
- C# / .NET / Mono
- JavaScript / TypeScript / Node.js / Bun / Deno
- Electron

---

## 2. Core Build Systems

- **CMake 3.20+**: Builds native scanning engine, process backends, and C/C++ trainers.
- **Cargo**: Builds Rust orchestration layer, MCP stdio server, standalone CLI, and Rust trainers.
- **CTest**: Drives cross-platform native unit and regression tests.
- **cargo test**: Runs Rust unit and integration suites.

---

## 3. Native C/C++ Components & Libraries

| Component | Role | Platform | License |
| :--- | :--- | :--- | :--- |
| **GTLibCpp** | Windows backend, FreezeManager, Policy, CE parser | Windows (Win32) | Community Modding License |
| **Native Posix Backend** | Linux `/proc/PID/mem` and `process_vm_readv` | Linux (x86_64, ARM64) | MIT (Internal) |
| **Native Mach Backend** | macOS `mach_vm_read_overwrite` & `mach_vm_region_recurse` | macOS (Intel, Apple Silicon) | MIT (Internal) |
| **Zydis / Capstone** | Fast disassembly for AoB signature derivation | Windows, Linux, macOS | MIT / BSD |

---

## 4. Rust Crates (Cargo)

All crates must be pure Rust or link to system C libraries with zero runtime overhead:

| Crate | Purpose | Scope |
| :--- | :--- | :--- |
| `tokio` (features = ["full"]) | Async I/O, stdio MCP transport, subprocess management | Workspace |
| `serde` & `serde_json` | Serialization, MCP JSON-RPC, cheat definitions | Workspace |
| `rusqlite` (bundled) | Embedded persistent telemetry, candidate history, session replay | `cheat-agent-storage` |
| `reqwest` (features = ["json", "stream"]) | Native HTTP client for direct LLM APIs (OpenAI, Anthropic, Ollama) | `cheat-agent-providers` |
| `clap` (features = ["derive"]) | Command-line interface parsing | `cheat-agent-cli` |
| `thiserror` & `anyhow` | Type-safe error handling and diagnostics | Workspace |
| `libc` | POSIX bindings for Linux process APIs | `cheat-agent-core` |
| `windows-sys` | Zero-cost Win32 bindings on Windows | `cheat-agent-core` |
| `tracing` & `tracing-subscriber` | Structured telemetry, redacting secrets from logs | Workspace |

---

## 5. FFI Boundary Contract

The boundary between Rust and C/C++ uses an explicit, stable C17 ABI:
- **No C++ STL types across FFI** (no `std::string`, `std::vector`, `std::function`).
- **No Rust heap objects across FFI** (no `String`, `Vec`, `Box` directly).
- Opaque pointers (`CheatScannerHandle*`, `ProcessBackendHandle*`).
- Explicit buffers with pointer + length (`const uint8_t* data, size_t len`).
- Standard error codes (`int32_t status_code`).
