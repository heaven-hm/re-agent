# Competitor Analysis & State of the Art

## Executive Summary

Cheat Agent is an autonomous, cross-platform reverse-engineering agent and trainer generator implemented in C17, C++20, and Rust. Unlike existing tools that are either interactive desktop GUIs (Cheat Engine, x64dbg), heavy dynamic instrumenters (Frida), or thin external MCP wrappers (Node.js/Python bridges), Cheat Agent provides a self-contained, native engine capable of autonomous memory discovery, pointer resolution, persistent verification across target restarts, and automated trainer compilation.

---

## Detailed Competitor Matrix

| Project | Implementation | Execution Model | MCP Support | Target Platforms | Autonomous Verification | Generated Output | License |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cheat Agent** (This Project) | C17, C++20, Rust | Stdio MCP & Standalone CLI Agent | Native Rust MCP (stdio) | Windows, Linux, macOS | Multi-stage with restart verification | Standalone C++20, Rust, .CT, JSON | MIT |
| **Official Cheat Engine** | Pascal / Delphi, C | Desktop GUI + DBK driver | None (community scripts) | Windows (partial Wine/macOS) | Manual user search | Lua trainer, .CT table | GPLv2/v3 |
| **AI Cheat Engine Proposal (#3274)** | N/A (Issue) | Conceptual GUI plugin | Conceptual | Windows | None | None | N/A |
| **Cheat Engine MCP Bridge** | TypeScript / Node.js | Subprocess bridge to CE socket | Yes (Node stdio) | Windows | No (LLM must prompt CE) | .CT modification | MIT |
| **CheatEngine.Mcp** | C# / .NET 8 | Bridge to CE process | Yes (.NET stdio) | Windows | No | None | MIT |
| **Frida Game Hacking MCP** | Python + Frida | Dynamic Instrumentation | Yes (Python stdio) | Cross-platform | Manual hook assertions | Python scripts | Apache 2.0 |
| **Rust Cheat Engine MCP** | Rust | Direct Win32 Memory API | Yes (Rust stdio) | Windows | None | None | MIT |
| **RE-MCP** | Python | Python wrapper over CE | Yes (Python stdio) | Windows | None | None | MIT |
| **scanmem** | C | CLI and libscanmem | None | Linux | Manual terminal search | None | GPLv3 |
| **Frida (Core)** | C (`frida-gum`), JS | Code injection & hooking | Via external tools | Cross-platform | Scriptable | Injected JS payloads | LGPL |
| **Ghidra** | Java, C++ (Decompiler) | Desktop GUI & headless Java | Via plugins (mrphrazer) | Cross-platform | Offline static only | Decompiled C | Apache 2.0 |
| **x64dbg** | C++ | Desktop Debugger | None | Windows | Interactive breakpointing | x64dbg patches | GPLv3 |

---

## Verified Capabilities vs. Claimed Features

### 1. Cheat Engine & Ecosystem
- **Claim:** "AI Cheat Engine can find cheats automatically."
- **Verified Reality:** Existing bridges (miscusi-peek, CheatEngineNet) only wrap Cheat Engine's socket or COM API to execute commands the LLM explicitly constructs. When memory addresses relocate on restart, these tools fail unless the user manually pointer-scans or writes Lua scripts. None verify game state persistence autonomously across restarts.
- **Architectural Limitation:** Cheat Engine is tied to Delphi and Windows-specific memory models. Its kernel driver (`dbk64.sys`) is frequently blocked by modern Windows HVCI and Driver Signature Enforcement.

### 2. Frida MCP Integrations
- **Claim:** "Hook any function and modify values on any platform."
- **Verified Reality:** Frida provides excellent dynamic instrumentation, but code injection into target processes on macOS requires disabling SIP or code-signing with debugging entitlements (`task_for_pid`). On Linux, Yama ptrace restrictions require `PTRACE_MODE_ATTACH`. Furthermore, Python MCP wrappers introduce massive runtime dependencies (100MB+ virtualenvs) violating self-contained requirements.

### 3. Rust & C++ Lightweight Tools
- **Claim:** "Native, safe memory manipulation."
- **Verified Reality:** Existing Rust MCP servers (e.g. `gede-cahya/cheat-engine-mcp`) are rudimentary, supporting only single-address read/write and basic exact-value scans. They lack:
  1. Multi-pass state differential scanning (changed, unchanged, increased, decreased).
  2. Bounded chunked scanning with page protection filtering.
  3. Multi-level pointer path finding.
  4. Array of Bytes (AoB) wildcard pattern scanning.
  5. Cross-platform abstraction for Windows, Linux, and macOS.

---

## Differentiating Innovation of Cheat Agent

1. **Closed-Loop Verification Across Restarts:**
   The cheat is not considered verified merely because a write succeeded. Cheat Agent launches a controlled test game, observes memory fluctuations, narrows candidates, resolves multi-level pointer chains or AoB signatures, restarts the game process, resolves the address again, and verifies that the desired game behavior persists.
2. **Deterministic Dual-Mode Native Generation:**
   Cheat Agent exports clean, idiomatic C++20 and Rust standalone trainer code using template-driven AST generation. The generated trainers compile cleanly without dependencies on Python or bulky runtimes.
3. **Strict Zero-Runtimes Enforcement:**
   Zero Python, zero Java, zero .NET, zero Node.js. Pure C17 + C++20 + Rust stable.
