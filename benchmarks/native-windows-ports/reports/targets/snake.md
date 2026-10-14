# Snake — Windows binary to native macOS reconstruction

**Overall status: PARTIAL.** A narrow board-rendering structure and observed game-over text were reproduced. This does not establish full game behavior or byte-identical binaries.

## Inputs and implementation

- Original: `snake-game v1.1.0`, Windows x64 PE, 55,296 bytes; SHA-256 `207d311be674c17be31131df095534003e0120b1a00a6569b697e00ae0c2d373`. Acquisition metadata and analysis: [manifest](../../snake/manifest.json).
- Independent macOS implementation: [snake.c](../../snake/replica/snake.c); built artifact [snakemac](../../snake/replica/snakemac), ARM64.
- Static recovery recorded 381 procedures, 238 application functions, a 20×20 field, observed controls, HUD text, and persistence filenames. See manifest and [binary analysis](../binary-analysis.json).

## Evidence

- Reported comparison: 26 rendered lines with wall rows and HUD bytes matching the observed original, excluding dynamic snake/food cells; game-over structure and labels match observed bytes. The retained original capture is [original-run0.txt](../../snake/original-run0.txt).
- Scenario and limitations: [functional results](../functional-results.json), [known limitations](../limitations.md).

## Open behavior

Score-per-food, RNG, wall-clock tick timing, persistence checksum, and some PTY input behavior remain unverified. Do not interpret the structural comparisons as a full deterministic game test.
