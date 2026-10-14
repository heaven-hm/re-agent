# PixelTetris — Windows binary to native macOS reconstruction

**Overall status: PARTIAL.** The ARM64 application builds and has genuine menu and gameplay captures. Important mechanics were not recovered from the Windows program and remain estimates or unverified.

## Inputs and implementation

- Original: PixelTetris v1.0.0, Windows x64 PE; SHA-256 `3eabbe4a4de93c9d0b91589511203313697f60500e58f18dd67eb37f8e25ca81`; release archive SHA-256 `ccc68f4179ac3ad56a27b2a8c28d28818bca0857f9bd05ed377035de88d33268`. Details and static observations: [manifest](../../pixeltetris/manifest.json).
- Independent implementation: [pixelmac.c](../../pixeltetris/replica/pixelmac.c), [macOS binary](../../pixeltetris/replica/pixelmac), with release assets/licenses retained beside the source.
- Build: Clang with SDL2, SDL2_image and SDL2_ttf; ARM64 macOS.

## Genuine replica screenshots

- [Menu](../../screenshots/pixelmac-menu4.png) — SHA-256 `a780d65b6afe4be8a6def4ca6715ac6074b9d6cf7f76699e6d65eed45d62747e`.
- [Gameplay](../../screenshots/pixelmac-play.png) — SHA-256 `317b5a6f5c7bc804c7a72bdeb10d23f074d3487adfb7ec608a3aba557b5e1966`.

![PixelTetris macOS replica menu](../../screenshots/pixelmac-menu4.png)

![PixelTetris macOS replica gameplay](../../screenshots/pixelmac-play.png)

These are captures of the macOS replica, not of the original Windows game. The target manifest records original runtime as process-start/no-crash evidence and marks original GUI capture unverified.

## Open behavior

Piece sequence/colors, gravity and scoring are not established as equivalent; some action meanings were inferred. See [functional results](../functional-results.json) and [limitations](../limitations.md). A live falling piece shows an executable scenario, not equivalent physics.
