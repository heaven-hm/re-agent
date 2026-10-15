# Project IGI (x86) — Cheat Agent Autonomous Trainer Integration

This directory demonstrates how **Cheat Agent** discovers, verifies, and generates trainers for **Project IGI: I'm Going In (v1.0 Retail, 32-bit x86 Windows executable)**.

---

## 1. Verified Binary Artifacts

- **Executable:** `igi.exe` / `Project-IGI.exe` (PE32 GUI Intel 80386)
- **Local Location (CrossOver / Wine):**
  `~/Library/Application Support/CrossOver/Bottles/project-igi/drive_c/IGI/igi.exe`
- **Architecture:** x86 (32-bit Little-Endian)

---

## 2. Reverse-Engineered Function Hooks & Offsets

Derived from Ghidra and radare2 dual-engine verification:

| Feature | Target Address / Hook | Original Bytes | Action / Patch |
|---|---|---|---|
| **Infinite Ammo** | `0x00478BB2` | `FF 4E 08` (`dec [esi+08]`) | NOP replacement (`90 90 90`) |
| **God Mode** | `0x00412440` (`Player_Hit_Override`) | `55 8B EC` | `ret 0004` (`C2 04 00`) |
| **Weapon Fire Evaluator** | `0x00478BA0` (`Gun_Fire`) | `55 8B EC 83 EC 18 53` | Fire-rate timer gate |
| **Player Health Pointer** | `[igi.exe+0x00142A18] -> +0x28 -> +0x14 -> +0x08` | Dynamic float | Freeze to `100.0f` |
| **Magazine Ammo Pointer** | `[igi.exe+0x00142A18] -> +0x28 -> +0x54 -> +0x08` | Dynamic int32 | Freeze to `99` |

---

## 3. Execution Workflows

### Mode A: Hosted Coding Agent (Claude Code / Codex via MCP)

Attach and scan Project IGI interactively via standard JSON-RPC MCP tools:

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "process_attach", "arguments": {"pid": 12345}}}
{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "memory_scan_aob", "arguments": {"pattern": "55 8B EC 83 EC 18 53 56 57 8B F9"}}}
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "trainer_generate", "arguments": {"cheat_path": "examples/project-igi/igi_cheat.json", "format": "cpp"}}}
```

### Mode B: Standalone AI Agent (Autonomous Loop)

Run Cheat Agent with local Ollama or OpenAI/Anthropic:

```bash
# Using local Ollama model
./target/debug/cheat-agent run \
  --provider ollama \
  --model qwen2.5-coder:32b \
  --goal "Find weapon ammo in Project IGI, verify freeze persistence across restarts, and generate standalone C++20 trainer"
```

### Generating Standalone Trainer Directly

```bash
# Generate C++20 standalone trainer
./target/debug/cheat-agent generate --cheat examples/project-igi/igi_cheat.json --lang cpp --output examples/project-igi/igi_trainer_generated.cpp

# Compile generated trainer natively
clang++ -std=c++20 examples/project-igi/igi_trainer.cpp -o build/examples/project-igi-trainer
```

---

## 4. Multi-OS CrossOver / Wine Notes

- On **Windows**: Cheat Agent uses Win32 `OpenProcess`, `VirtualQueryEx`, `ReadProcessMemory`, and `WriteProcessMemory`.
- On **macOS under CrossOver**: IGI runs in a Wine prefix container (`wine-preloader`). Cheat Agent attaches to the macOS PID of `wine-preloader` or operates within the CrossOver bottle context via GTLibCpp backend.
- Memory protection permissions (`PAGE_EXECUTE_READWRITE`) are queried before patching code segments, guaranteeing clean restoration on trainer termination.
