# Tetris — Windows binary to native macOS reconstruction

**Overall status: PARTIAL.** The native macOS program builds and displays a menu and live play state. This is not complete behavior or full application equivalence.

## Inputs and implementation

- Original: Tetris v1.0.0, Windows x64 PE; SHA-256 `846b7cf2db372981b5989863a8d560f7abfacb9c7f8219a7c059275d68760351`; archive SHA-256 `494a8db7fcb8f5d5ba61959df000a81027e3e19a97adb5ecd2476678496edd66`. The manifest records static page/widget and handler findings: [manifest](../../tetris/manifest.json).
- Independent implementation: [tetris.c](../../tetris/replica/tetris.c), [macOS binary](../../tetris/replica/tetrismac), ARM64 SDL2 application.
- Reused images and fonts are in the replica asset directory; source notices are included there.

## Genuine replica screenshots

- [Menu](../../screenshots/tetrismac-menu.png) — SHA-256 `57005667ac2927751096d8cde88bbbd98939ad71e986931819a4fe98bd8e1bfe`.
- [Gameplay](../../screenshots/tetrismac-play.png) — SHA-256 `2de390eaee69d4449695450ae3c6e44b63289cb22a25ef4ea4a95c95430a826a`.

The screenshots show the macOS replica; original-side GUI comparison is not evidenced here.

## Open behavior

Piece mechanics, scoring, controls and audio are not comprehensively verified against the original. See [functional results](../functional-results.json) and [limitations](../limitations.md). Menu appearance and a falling-piece state do not demonstrate game-level equivalence.
