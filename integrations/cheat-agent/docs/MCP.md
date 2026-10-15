# MCP Server Specification

## Overview

Cheat Agent provides a native Model Context Protocol (MCP) server over `stdio` conforming to the Model Context Protocol 2024-11-05 specification. It connects seamlessly to AI coding environments including:
- **OpenAI Codex**
- **Claude Code**
- **Cursor / VS Code MCP Extensions**
- **Other MCP-compliant agent runtimes**

---

## Tool Catalog

### 1. Process Management Tools
- `process_list`: Enumerates running processes with PID, name, architecture (x86, x64, arm64), and path.
- `process_inspect`: Queries module list, base addresses, memory map regions, and process integrity level.
- `process_attach`: Attaches to an authorized target process and initializes scanning context.
- `process_detach`: Detaches from current process and releases resources.

### 2. Memory Inspection & Scanning Tools
- `memory_regions`: Lists committed memory regions with permissions (`READ`, `WRITE`, `EXECUTE`).
- `memory_read`: Reads typed data or raw bytes from an address.
- `memory_scan_exact`: Initiates or refines a scan for an exact numerical or string value.
- `memory_scan_unknown`: Initializes an unknown-initial-value scan across readable/writable memory.
- `memory_scan_changed`: Filters candidates for addresses where values have changed since last scan.
- `memory_scan_unchanged`: Filters candidates for addresses where values have stayed identical.
- `memory_scan_increased`: Filters candidates for addresses where values have increased.
- `memory_scan_decreased`: Filters candidates for addresses where values have decreased.
- `memory_scan_range`: Filters candidates for values between `[min, max]`.
- `memory_scan_aob`: Scans module code or heap for an Array of Bytes pattern with `?` or `??` wildcards.

### 3. Pointer & Signature Resolution Tools
- `pointer_resolve`: Traverses a module-relative pointer chain (`module.dll + base -> [offset1] -> [offset2]`).
- `pointer_scan`: Discovers pointer paths leading to a verified candidate address within maximum depth and offset limits.
- `module_list`: Lists loaded modules with base addresses and sizes.
- `module_inspect`: Inspects exported symbols, sections (.text, .data, .rdata), and relocation status.

### 4. Cheat Lifecycle & Mutation Tools
- `cheat_candidates`: Returns ranked candidate addresses with stability and confidence metrics.
- `cheat_validate`: Validates candidate behavior against controlled game changes.
- `cheat_save`: Saves a verified cheat specification to disk conforming to `cheat.schema.json`.
- `cheat_load`: Loads a cheat specification from disk.

### 5. Trainer Generation & Verification Tools
- `trainer_generate`: Generates C++20, Rust, or Cheat Engine `.CT` trainer artifacts from a cheat definition.
- `trainer_compile`: Compiles the generated C++20 or Rust trainer into a standalone binary.
- `trainer_verify`: Executes the compiled trainer against the game process and verifies behavioral persistence.
- `trainer_export`: Packages the verified trainer binary, cheat table, and verification report into a distributable archive.

### 6. Workflow & Telemetry Tools
- `workflow_status`: Returns current state in the 10-stage autonomous discovery workflow.
- `workflow_cancel`: Gracefully halts ongoing scans or generation workflows.
- `workflow_report`: Emits the full execution audit, candidate reduction log, and verification proof.

---

## Configuration Example

### Claude Code (`~/.claude.json` or project configuration):
```json
{
  "mcpServers": {
    "cheat-agent": {
      "command": "/usr/local/bin/cheat-agent",
      "args": ["mcp"],
      "env": {
        "RUST_LOG": "info"
      }
    }
  }
}
```

### Codex (`codex.json`):
```json
{
  "tools": {
    "cheat_agent": {
      "type": "stdio",
      "command": "cheat-agent",
      "args": ["mcp"]
    }
  }
}
```
