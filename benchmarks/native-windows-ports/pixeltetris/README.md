# pixeltetris — proof (behavioral parity only)

Independent SDL2 reimplementation of a Windows GUI tetromino game for macOS.
Not byte-identical to the original executable; behavioral parity only
(see `reports/limitations.md:3-4`).

## Original binary identity

- Name/version: `Pixeltetris v1.0.0 (mvlassis/pixeltetris, MIT)` (`manifest.json:4`)
- Archive: `https://github.com/mvlassis/pixeltetris/releases/download/v1.0.0/Pixeltetris-v1.0.0-Windows-64bit.zip` (`manifest.json:5`)
- Archive SHA-256: `ccc68f4179ac3ad56a27b2a8c28d28818bca0857f9bd05ed377035de88d33268` (`manifest.json:6`)
- Binary: `Pixeltetris-v1.0.0-Windows-64bit/bin/Version 1.0.0 - 64 bit/Pixeltetris.exe` (`manifest.json:7`)
- Binary SHA-256: `3eabbe4a4de93c9d0b91589511203313697f60500e58f18dd67eb37f8e25ca81` (`manifest.json:8`, `reports/binary-analysis.json:17`)
- Format: `PE32+ x86-64 GUI, MSVC C++, SDL2 dynamic (SDL2/TTF/Image DLLs shipped)` (`manifest.json:9`, `reports/binary-analysis.json:19`)
- License: `mvlassis/pixeltetris v1.0.0 MIT` (`reports/license-audit.json:10-14`); release-metadata only (`reports/license-audit.json:3`); shipped PNG/TTF incl. OFL fonts retained under replica dirs (`reports/license-audit.json:32`)

## Analysis performed (binary only, no app source)

- Scale: `4945` procedures, `771` strings, `115` externals (`manifest.json:12-14`, `reports/binary-analysis.json:20-21`).
- Init: `FUN_140013ce0: SDL_Init(VIDEO), window 'Pixeltetris' 640x360 logical, IMG_Init JPG|PNG, TTF_Init, RenderSetLogicalSize, window scale by resolution factor, menu/game object construction` (`manifest.json:15`, `reports/binary-analysis.json:22`).
- Input map (`manifest.json:16-28`, input mapper `FUN_140015e90` per `reports/binary-analysis.json:23`): `1 quit/back (SDL_QUIT, Esc, q)`, `2 left`, `3 up`, `4 down`, `5 right`, `6 confirm (Enter)`, `7 space`, `8 X`, `9 hold (C/Ctrl)`, `10 pause (P)`, `0 none`.
- Game state: `FUN_1400154e0: score=0, width=10, RNG seeded by time, 'Game Over!' text object` (`manifest.json:29`).
- Event helpers: `FUN_140015e30 event drain`, `FUN_140015e90 per-event action mapper` (`manifest.json:30-33`).
- Original runtime note: `process alive, no crash from own dir; font-crash CWD issue recorded` (`manifest.json:48`).

## Replica build

Source/binary/assets as recorded in manifest (build not re-verified here):

```sh
cd benchmarks/native-windows-ports/pixeltetris/replica
clang -O2 -o pixelmac pixelmac.c -I/opt/homebrew/include -L/opt/homebrew/lib -lSDL2 -lSDL2_image -lSDL2_ttf
```

Build string source: `manifest.json:35-39`. Reported artifact: `pixeltetris/replica/pixelmac (36KB arm64 SDL2)` (`reports/functional-results.json:15`).

## Verification

| Case                                                                 | Status     | Basis                                                                                              |
| -------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| macOS build (clean)                                                  | PASS       | `manifest.json:46`, `reports/functional-results.json:15-16`                                        |
| Original runtime (alive, no crash)                                   | PASS       | `manifest.json:48`                                                                                 |
| macOS menu (real window capture, shipped button assets)              | PASS       | `manifest.json:53`                                                                                 |
| macOS gameplay (Enter starts game; falling piece + ghost + HUD live) | PASS       | `manifest.json:54`                                                                                 |
| Input semantics (codes exact; actions 6–10 guideline-inferred)       | PARTIAL    | `manifest.json:50`, `reports/functional-results.json:17-22`                                        |
| macOS menu render on-screen                                          | UNVERIFIED | `manifest.json:47` (older entry; superseded by `manifest.json:53` live capture — kept as recorded) |
| Original screenshot (X11 window not captured)                        | UNVERIFIED | `manifest.json:49`, `reports/limitations.md:12-14`                                                 |
| Pieces / colors / RNG                                                | UNVERIFIED | `manifest.json:51`, `reports/functional-results.json:17-22`                                        |
| Gravity / scoring (guideline values)                                 | UNVERIFIED | `manifest.json:52`, `reports/functional-results.json:17-22`, `reports/limitations.md:5-6`          |

Overall functional status: `PARTIAL` (`reports/functional-results.json:14`).

## Non-goals

- No byte-identical executable; hashes differ by design (`reports/limitations.md:3-4`).
- No exact tetromino rotation/score/gravity table recovery; guideline values used (`reports/limitations.md:5-6`).
- No verified piece RNG/colors or original-side GUI capture.
- Wine/CrossOver is a test harness for the original only, never the port vehicle (`reports/limitations.md:11`).

## Screenshots

Committed replica captures (relative links):

- [Menu](../screenshots/pixelmac-menu4.png)
- [Gameplay](../screenshots/pixelmac-play.png)

Note: `manifest.json:40-43` records older `pixelmac-menu3.png` / `pixelmac-play.png` names; the committed menu file is `pixelmac-menu4.png` (linked above).
