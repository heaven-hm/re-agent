# Cheat Agent — Architecture Specification

## 1. High-Level System Architecture

Cheat Agent delivers a production-grade, cross-platform autonomous reverse-engineering and trainer-generation engine. It supports two primary execution modes sharing an identical core engine:

```text
                    AI CODING AGENT
                 Codex / Claude Code
                          |
                          | MCP (stdio JSON-RPC)
                          v
                +--------------------+
                | Cheat Agent Server |
                | Rust / Tokio       |
                +--------------------+
                          |
                          |
  DIRECT API / LOCAL LLM  |
  (OpenAI / Anthropic /   |
   Ollama / OpenRouter)   |
             |            |
             v            v
       +--------------------------+
       | Agent Orchestration      |
       | Rust                     |
       | Planning / Tool Routing  |
       | Verification / Budgets   |
       +--------------------------+
                     |
                     | Stable C17 FFI Boundary
                     v
       +--------------------------+
       | Native Analysis Engine   |
       | C17 / C++20              |
       | Scanning / Pointers / AoB|
       | Process / Module APIs    |
       +--------------------------+
                     |
                     v
       +--------------------------+
       | Platform Backend         |
       | Windows: Win32/GTLibCpp  |
       | Linux:   process_vm_*    |
       | macOS:   mach_vm_*       |
       +--------------------------+
                     |
                     v
              AUTHORIZED GAME
```

---

## 2. Core Subsystems

### A. Native Engine (C17 / C++20)
- **High-Performance Memory Scanner:**
  - Value types: `int8`, `uint8`, `int16`, `uint16`, `int32`, `uint32`, `int64`, `uint64`, `float`, `double`, byte arrays, UTF-8/UTF-16 strings, and wildcard AoB patterns.
  - Multi-pass filter modes: Exact value, Unknown initial, Changed, Unchanged, Increased, Decreased, Within range.
  - Chunked reading with page boundary awareness and protection mask checking (`PAGE_READWRITE`, `PROT_READ|PROT_WRITE`).
- **Pointer Resolution & Multilevel Path Search:**
  - Evaluates pointer candidates up to N levels deep.
  - Identifies module-relative base addresses (e.g. `game.exe + 0x123456 -> [0x10] -> [0x20]`).
  - Cross-restart relocation validation.
- **Platform Abstraction Layer:**
  - Windows: Win32 (`VirtualQueryEx`, `ReadProcessMemory`, `WriteProcessMemory`, `CreateToolhelp32Snapshot`) + `GTLibCpp` integration adapter.
  - Linux: `/proc/[pid]/maps` parsing, `process_vm_readv`, `process_vm_writev`.
  - macOS: `mach_vm_read_overwrite`, `mach_vm_write`, `mach_vm_region_recurse`.

### B. Rust FFI Boundary (`cheat-agent-ffi`)
- Exposes opaque pointers and C-compatible ABI (`cheat_agent.h`).
- Guarantees zero undefined behavior: all raw pointers validated before dereferencing, buffer lengths checked, memory deallocations owned by the originating allocator.

### C. Rust Orchestration & MCP (`cheat-agent-mcp`, `cheat-agent-runtime`)
- Implements MCP (Model Context Protocol) over stdio.
- Implements direct LLM provider execution (OpenAI, Anthropic, Ollama, OpenRouter) via asynchronous Tokio runtime and Reqwest.
- Enforces token budgets, call limits, and cancellation tokens.
- SQLite-backed state persistence for resume, replay, and telemetry.

### D. Self-Verification Engine (`cheat-agent-verifier`)
- Multi-tier validation gates:
  1. `MEMORY_WRITE_VERIFIED`: Memory cell updated without error.
  2. `GAME_BEHAVIOR_VERIFIED`: In-game state responds to mutation (e.g. ammo decrement prevented).
  3. `RESTART_VERIFIED`: Process restarted; pointer chain or AoB signature resolves to fresh address.
  4. `TRAINER_BUILD_VERIFIED`: C++20 and Rust standalone trainers compile cleanly without errors.
  5. `TRAINER_EXECUTION_VERIFIED`: Compiled trainer connects to restarted game and modifies value successfully.

### E. Code Generator (`cheat-agent-generators`)
- Deterministic, template-based generation:
  - C++20 standalone trainer executable.
  - Rust standalone trainer executable.
  - Cheat Engine 7.x `.CT` XML table.
  - Versioned JSON cheat specification (`schemas/cheat.schema.json`).
