# Cheat Agent

> **Experimental, cross-platform AI-assisted reverse-engineering and trainer-generation project.**  
> Built with **C17**, **C++20**, and **Rust** (stable). Zero Python. Zero Java. Zero .NET. Zero Node.js.

[![CI](https://github.com/heaven-hm/cheat-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/heaven-hm/cheat-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20Linux%20%7C%20macOS-informational.svg)](docs/CROSS_PLATFORM.md)

---

## What is Cheat Agent?

Cheat Agent is an autonomous, cross-platform AI reverse-engineering and trainer-generation system for authorized offline single-player games and controlled test processes.

Unlike existing tools that are interactive desktop GUIs (Cheat Engine, x64dbg) or thin Python MCP wrappers over external tools, Cheat Agent combines high-performance native memory scanners in C++20 with a robust, type-safe Rust orchestration layer.

### The Core Differentiator: Closed-Loop Verification

Most game manipulation tools stop after an address is written to. In real games, memory addresses relocate upon relaunch due to ASLR and dynamic heap allocation. **Cheat Agent is working toward a strict 5-stage verification loop (not fully implemented yet):**

```text
DISCOVER THE CHEAT → VERIFY THE CHEAT → GENERATE THE TRAINER → RESTART THE GAME → PROVE IT STILL WORKS.
```

1. **`MEMORY_WRITE_VERIFIED`**: Intended to validate the memory cell update (not implemented in the current verifier).
2. **`GAME_BEHAVIOR_VERIFIED`**: Intended to confirm in-game behavior (not implemented in the current verifier).
3. **`RESTART_VERIFIED`**: Intended to verify pointer/signature recovery, not just process relaunch (not implemented in the current verifier).
4. **`TRAINER_BUILD_VERIFIED`**: Standalone C++20 and Rust trainer sources compile with zero errors using native toolchains.
5. **`TRAINER_EXECUTION_VERIFIED`**: Intended to validate generated trainer execution (not implemented in the current verifier).

---

## Dual First-Class Execution Modes

### Mode A: Hosted Coding Agent (MCP)
Operates directly inside **OpenAI Codex**, **Claude Code**, or other MCP-compatible AI coding environments. The host agent provides the high-level reasoning and planning, while Cheat Agent provides real reverse-engineering tools, memory inspection, and trainer compilation over standard I/O:

```json
{
  "mcpServers": {
    "cheat-agent": {
      "command": "cheat-agent",
      "args": ["mcp"]
    }
  }
}
```

### Mode B: Standalone AI Agent
Provides experimental single-turn planning using direct model APIs or local model servers. Full autonomous tool dispatch is not implemented (see issue #2):
- **OpenAI API** (`gpt-4o`, `o1`, `gpt-4-turbo`)
- **Anthropic API** (`claude-3-5-sonnet`)
- **OpenRouter** (DeepSeek, Llama 3.3, Mistral)
- **Ollama** (offline local models: `qwen2.5-coder:32b`, `llama3.3:70b`)

```bash
# Autonomous run with local Ollama
cheat-agent run --provider ollama --model qwen2.5-coder:32b --goal "Discover player ammo and generate a verified trainer"

# Autonomous run with OpenAI
cheat-agent run --provider openai --model gpt-4o --goal "Find health in test game and verify across restarts"
```

---

## Architectural Layout

```text
cheat-agent/
├── CMakeLists.txt              # Native build system
├── Cargo.toml                  # Workspace manifest
├── native/                     # High-performance C17 / C++20 scanning engine
│   ├── include/
│   │   ├── cheat_agent.h       # C17 stable FFI header
│   │   ├── process_backend.hpp # C++20 IProcessBackend abstraction
│   │   ├── memory_scanner.hpp  # Multi-pass chunked scanner
│   │   ├── pointer_resolver.hpp# Multi-level pointer resolution
│   │   └── pattern_scanner.hpp # AoB wildcard pattern matcher
│   └── src/                    # Platform backends (Win32, /proc, mach_vm_*)
├── crates/
│   ├── cheat-agent-core/       # Core types, error handling, JSON models
│   ├── cheat-agent-ffi/        # Safe Rust wrapper over C/C++ engine
│   ├── cheat-agent-storage/    # SQLite persistence for sessions & candidates
│   ├── cheat-agent-generators/ # C++20, Rust, and .CT trainer generators
│   ├── cheat-agent-verifier/   # 5-stage closed-loop verification engine
│   ├── cheat-agent-providers/  # Native HTTP clients for OpenAI, Anthropic, Ollama
│   ├── cheat-agent-mcp/        # Stdio Model Context Protocol (MCP) server
│   └── cheat-agent-cli/        # Main binary (mcp, run, scan, verify, generate)
├── examples/
│   └── test-game/              # Native C++ test target with multi-level pointer chains
├── schemas/                    # Versioned JSON Schemas for cheats & verification
└── docs/                       # Architecture, MCP, Competitors, and Security specs
```

---

## Quickstart

### Prerequisites
- **C/C++ Compiler**: Clang 14+, GCC 11+, or MSVC 2019+ (C17 & C++20 support)
- **CMake**: 3.20 or newer
- **Rust**: Stable toolchain (1.80+)

### Building
```bash
# 1. Build native C/C++ engine and test game
cmake -B build -S .
cmake --build build

# 2. Run native C++ tests
ctest --test-dir build --output-on-failure

# 3. Build and test Rust workspace
cargo build
cargo test
```

### Experimental Process Restart Demo (not full cheat verification)
```bash
# Launch autonomous restart verification against the native test game
cargo run -p cheat-agent-cli -- verify \
  --cheat examples/test-game/test_cheat.json \
  --target-command "./build/examples/test-game/cheat_agent_test_game --daemon"

# Generate standalone C++, Rust, and Cheat Engine tables
cargo run -p cheat-agent-cli -- generate --cheat examples/test-game/test_cheat.json --lang cpp
cargo run -p cheat-agent-cli -- generate --cheat examples/test-game/test_cheat.json --lang rust
cargo run -p cheat-agent-cli -- generate --cheat examples/test-game/test_cheat.json --lang ct
```

---

## Project IGI trainer — GTLibCpp integration (Windows)

The [Project IGI example](examples/project-igi/igi_trainer.cpp) now uses
`gtlibcpp::WindowsBackendOptions` and `gtlibcpp::MemorySession` for **all
process-memory reads and writes**, instead of its own Win32/Mach/Linux R/W
implementations. Windows Toolhelp remains limited to PID discovery, and
`QueryFullProcessImageNameA` obtains the executable path for the backend.

```powershell
cmake -S . -B build -DCHEAT_AGENT_ENABLE_GTLIBCPP=ON -DCHEAT_AGENT_BUILD_IGI_EXAMPLE=ON
cmake --build build --config Release --target igi_trainer
.\build\Release\igi_trainer.exe --pid 1234        # read-only preflight
.\build\Release\igi_trainer.exe --pid 1234 --apply  # explicit opt-in
```

The example validates the expected byte signatures at its **historical,
version-specific** addresses before any change, checks the bytes after
writing, and attempts restoration on Ctrl+C or failure. It does not change
executable-page protections: some game builds will **reject code writes**, and
that failure is reported rather than bypassed. It also cannot guarantee
restoration if the game exits, the process crashes, or memory changes
externally. The program verifies byte readback, **not gameplay effects**.

Only run the write mode on a locally controlled, authorized offline game.
The example does not automatically call the agent's approval policy; a host
exposing this to third-party clients must enforce policy externally.

## Security & Ethics

Cheat Agent is strictly built for **authorized offline single-player games, educational research, and QA game-balance testing**.
- Default read-only behavior; mutations require explicit authorization.
- Target identity matching (PID + executable SHA-256 validation).
- Memory rollback and emergency stop kill switch.
- Multiplayer tampering, kernel driver exploits, and DRM circumvention are strictly out of scope.

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

---

## License

Distributed under the [MIT License](LICENSE).
Compatible with [GTLibCpp](https://github.com/heaven-hm/gtlibcpp), Zydis, and Capstone.
