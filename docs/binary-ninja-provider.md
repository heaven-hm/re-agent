# Binary Ninja MCP Provider

REA adapts an existing Binary Ninja MCP server into its native analysis tools. Install and configure your selected Binary Ninja engine and upstream MCP server following their instructions. REA does not install, license, activate, or bundle Binary Ninja.

Configure an upstream MCP JSON registration and set `REA_BINJA_MCP_CONFIG` (or `REA_BINARYNINJA_MCP_CONFIG`) to that file, then select `binaryninja` through `REA_ANALYSIS_PROVIDER`, the CLI's `--provider binaryninja`, or MCP's `open_binary.provider_id`.

No provider startup occurs during discovery.

---

## 1. Registration Configuration

REA accepts either a standard `command`/`args`/`env` stdio configuration or a local Streamable HTTP URL endpoint (`http://127.0.0.1:...` or `http://localhost:...`).

### Option A: Direct stdio registration

```json
{
  "command": "python",
  "args": ["/path/to/binaryninja_mcp/server.py"],
  "mode": "attached"
}
```

### Option B: Wrapped in `mcpServers`

An existing `mcpServers` object with a `binaryninja-mcp` (or `binja-mcp`, `binaryninja`) entry is also accepted:

```json
{
  "mcpServers": {
    "binaryninja-mcp": {
      "command": "binaryninja-mcp",
      "args": []
    }
  }
}
```

### Option C: Local HTTP endpoint

```json
{
  "url": "http://127.0.0.1:9000/mcp",
  "mode": "attached",
  "headers": {
    "Authorization": "Bearer local-token"
  }
}
```

> **Security Guardrail:** Remote HTTP endpoints and URL embedded credentials (`http://user:pass@...`) are strictly prohibited and rejected by schema validation. All authorization credentials in headers are redacted from diagnostics and traces.

---

## 2. Using Binary Ninja in REA

Set the environment variable pointing to your registration JSON:

```bash
export REA_BINJA_MCP_CONFIG=/absolute/path/to/binja-mcp.json
export REA_ANALYSIS_PROVIDER=binaryninja
```

Then run analysis operations via CLI or MCP:

```bash
# Verify registration via doctor
rea doctor --provider binaryninja

# List procedures
rea procedures /path/to/binary --json

# Decompile a procedure (HLIL / pseudo-C)
rea decompile /path/to/binary main --json

# Analyze function dossier
rea function /path/to/binary main --json
```

---

## 3. Supported Operations

The Binary Ninja adapter is **read-only** and supports:

1. `list_procedures`: Enumerates discovered functions and coordinates
2. `search_procedures`: Searches functions by regex or literal name matching
3. `list_strings`: Lists extracted strings across the binary
4. `search_strings`: Searches strings by regex or literal matching
5. `procedure_address`: Resolves procedure entry coordinates
6. `procedure_pseudo_code`: Recovers High-Level IL (HLIL) or decompiled pseudo-C
7. `procedure_assembly`: Retrieves architecture disassembly instructions
8. `procedure_callers`: Inspects incoming direct call relationships
9. `procedure_callees`: Inspects outgoing call references
10. `read_function_instructions`: Provides bounded raw instruction windows
11. `xrefs`: Inspects cross-references to code and data addresses
12. `analyze_function`: Aggregates assembly, decompilation, callers, callees, and metadata into a complete `FunctionDossier`

Mutating operations (such as `set_comment`, `set_address_name`, or binary modification) are fail-closed and rejected by the adapter.

---

## 4. Diagnostics & Verification

Run `rea doctor --provider binaryninja` to verify that the registration file is valid without launching the disassembler engine:

```bash
rea doctor --provider binaryninja
```

Expected output confirms the registration is syntactically valid and reports readiness.
