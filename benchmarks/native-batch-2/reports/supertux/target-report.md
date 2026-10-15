# supertux — Batch 2 game investigation

**Status: UNVERIFIED for gameplay and reconstruction.** The checked-in evidence proves acquisition identity and a bounded static PE resource-table observation only. No reconstructed macOS game, runtime gameplay test, original-versus-replica comparison, or target screenshot is recorded.

## Original binary and provenance

- Release: `v0.7.0`; architecture: `x86_64`; format: `PE32+`.
- Executable SHA-256: `6249f25a6ac1cc3d27955ca09852b8368618ce58ad9c13e0c5084051c2c02b43` (7259648 bytes).
- Acquisition details: [release manifest](../manifests/supertux-acquisition.json); downloaded Windows binary is a local-only input and is not redistributed.
- PE entry RVA: `0xb992`; imported DLL count: 30. These are header/import metadata, not recovered gameplay behavior.

## Static evidence produced

REA's `inspect_pe_resources` operation examined 3 resource directory entries and recorded 1 resources (coverage: `complete`). Resource type identifiers observed: 24. See the [hash-bound Evidence record](../../analysis/supertux/pe-resources.json) and shared [binary inventory](../binary-inventory.json).

The PE resource parser does not recover functions, control-flow graphs, game-loop logic, physics, AI, input handling, or renderer behavior. No Ghidra function inventory was retained for this target.

## Runtime and reconstruction status

- Original native-Windows gameplay executions: **0**.
- Reconstructed macOS game executable: **none**.
- Differential gameplay cases: **0**.
- Genuine original/replica game screenshots: **0**.
- License and asset caveats: [Batch 2 license audit](../license-audit.md).

## What would establish progress

Add a binary-hash-bound function inventory and runtime run identity; implement one named local gameplay feature independently; then retain paired original/replica inputs, outputs or state observations, regression cases, and genuine screenshots. Keep any unsupported game modes and assets explicitly unresolved. A finite feature pass would still not prove whole-game equivalence.
