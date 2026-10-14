# Snake — Windows binary to native macOS reconstruction

**Overall status: PARTIAL; original-versus-replica parity is unverified.** Static observations and one original transcript are retained, but a paired replica transcript and repeatable comparison receipt are missing. The former “26-line parity” claim cannot be reproduced from committed evidence.

## Inputs and implementation

- Original: `snake-game v1.1.0`, Windows x64 PE, 55,296 bytes; SHA-256 `207d311be674c17be31131df095534003e0120b1a00a6569b697e00ae0c2d373`. Acquisition metadata and analysis: [manifest](../../snake/manifest.json).
- Independent macOS implementation: [snake.c](../../snake/replica/snake.c); built artifact [snakemac](../../snake/replica/snakemac), ARM64.
- Static recovery recorded 381 procedures, 238 application functions, a 20×20 field, observed controls, HUD text, and persistence filenames. See manifest and [binary analysis](../binary-analysis.json).

## Evidence

- Retained original observation: [original-run0.txt](../../snake/original-run0.txt). No paired replica transcript or machine-readable diff is included, so no exact frame or game-over parity result is claimed here.
- Scenario and limitations: [functional results](../functional-results.json), [known limitations](../limitations.md).

## Open behavior

Score-per-food, RNG, wall-clock tick timing, persistence checksum, PTY input behavior, and the reported original-versus-replica frame match remain unverified. The replica source exists and builds, but feature parity is not established by a retained paired run.
