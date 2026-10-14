# Clipjar — Windows binary to native macOS reconstruction

**Overall status: PARTIAL.** The reconstructed storage layer passes three controlled synthetic checks. The original is a tray application; the corresponding full interactive behavior is not established.

## Inputs and implementation

- Original: Clipjar v1.2.0 Windows x64 PE, 5,338,624 bytes; SHA-256 `8841b01b45ac984d6e2b2521be7a7bc527949e92eb1da6eaf85db82ccf1bf8f4`. Analysis and DDL findings: [manifest](../../clipjar/manifest.json).
- Independent implementation: [main.swift](../../clipjar/replica/main.swift), [macOS binary](../../clipjar/replica/clipjarmac), ARM64 menu-bar application.
- The macOS code uses a same-schema SQLite database and native menu-bar UI, based on the documented observations.

## Evidence

The manifest records PASS for synthetic string capture into SQLite, persistence after restart, and duplicate-content hash handling. It records original Wine/X11 clean launch as a runtime observation. The global result ledger is [functional-results.json](../functional-results.json).

No captured screenshot is currently linked for Clipjar; none is claimed here.

## Open behavior

Search/delete/favorite UI flows, global hotkey permission handling, image clipboard, and automatic paste remain unverified. Static Ghidra import was unavailable under the recorded provider budget. See [limitations](../limitations.md).
