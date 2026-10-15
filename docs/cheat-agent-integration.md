# Audited integration from cheat-agent

Source: https://github.com/heaven-hm/cheat-agent

Inspected local revision: `87b56e38b72aa4a98b62c4210ec751dfa6c213df`.
License: MIT, copyright 2026 Haseeb Mir. The full notice is preserved at [cheat-agent-MIT.txt](../licenses/cheat-agent-MIT.txt).

## Included

The read-only byte-buffer search algorithm in `native/src/pattern_scanner.cpp` is adapted into `src/domain/maintenance/MemoryPattern.ts` and used by the real `memory-snapshot-pattern` CLI operation. This portable implementation operates on explicitly supplied captured bytes, through existing regular-file admission. It has no process handles, memory writes, patching, injection, trainer generation or model-provider dependencies. Existing REA runtime providers remain the runtime owners.

The adaptation rejects malformed tokens, out-of-byte-range values and all-wildcard patterns; it bounds match retention and reports incomplete scans. The original parser instead coerces invalid tokens to wildcards and truncates parsed values to a byte. Those semantics were not adopted.

## Excluded following source review

- `cheat-agent-generators`, `.CT`/trainer generation and cheat definitions do not belong to this product's legacy-maintenance purpose.
- OS write-memory backends and the FFI write API are not imported. Existing explicit runtime capabilities retain their own authority boundaries.
- `cheat-agent-verifier` is not imported: its source sets behavior flags and PASSED/fully_verified statuses without performing those behavioral measurements. Process liveness and compiler success do not prove game behavior or persistence across restart.
- The pointer resolver's automatic 64-bit-to-32-bit fallback is not adopted. Pointer width must follow actual target architecture and verified structures.
- Model clients, SQLite storage and a second MCP server are not imported because REA already provides the corresponding host integration/evidence/controller interfaces.
- The source repository's license-compatibility table is not adopted as a legal audit of dependencies. Only the selected MIT algorithm is included here.

This is a selective, working read-only integration, not a wholesale merge or a claim that every feature advertised upstream works. See `licenses/cheat-agent-integration.json` for the selected source digests and attribution boundary.
