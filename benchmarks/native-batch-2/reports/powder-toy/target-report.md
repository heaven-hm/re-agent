# powder-toy — Batch 2 game investigation

**Status: UNVERIFIED for gameplay and reconstruction.** The checked-in evidence proves acquisition identity and a bounded static PE resource-table observation only. No reconstructed macOS game, runtime gameplay test, original-versus-replica comparison, or target screenshot is recorded.

## Original binary and provenance

- Release: `v100.1.400`; architecture: `x86_64`; format: `PE32+`.
- Executable SHA-256: `df32b616b31dabae10b82028731ebdfd6867c872198b81f29d418cbafbf460c3` (8690342 bytes).
- Acquisition details: [release manifest](../manifests/powder-toy-acquisition.json); downloaded Windows binary is a local-only input and is not redistributed.
- PE entry RVA: `0x1470`; imported DLL count: 27. These are header/import metadata, not recovered gameplay behavior.

## Static evidence produced

REA's `inspect_pe_resources` operation examined 28 resource directory entries and recorded 12 resources (coverage: `complete`). Resource type identifiers observed: 14, 16, 24, 3. See the [hash-bound Evidence record](../../analysis/powder-toy/rea-pe-resources.json) and shared [binary inventory](../binary-inventory.json).

The PE resource parser does not recover functions, control-flow graphs, game-loop logic, physics, AI, input handling, or renderer behavior. No Ghidra function inventory was retained for this target.

## Runtime and reconstruction status

- Original native-Windows gameplay executions: **0**.
- Reconstructed macOS game executable: **none**.
- Differential gameplay cases: **0**.
- Genuine original/replica game screenshots: **0**.
- License and asset caveats: [Batch 2 license audit](../license-audit.md).

## What would establish progress

Add a binary-hash-bound function inventory and runtime run identity; implement one named local gameplay feature independently; then retain paired original/replica inputs, outputs or state observations, regression cases, and genuine screenshots. Keep any unsupported game modes and assets explicitly unresolved. A finite feature pass would still not prove whole-game equivalence.
