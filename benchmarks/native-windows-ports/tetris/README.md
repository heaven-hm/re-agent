# tetris — proof (behavioral parity only)

Independent SDL2 reimplementation of a Windows tetromino game for macOS.
Not byte-identical to the original executable; behavioral parity only
(see `reports/limitations.md:3-4`).

## Original binary identity

- Name/version: `Tetris v1.0.0 (oleh-maliuta/tetris, MIT)` (`manifest.json:4`)
- Archive: `https://github.com/oleh-maliuta/tetris/releases/download/v1.0.0/Tetris.zip` (`manifest.json:5`)
- Archive SHA-256: `494a8db7fcb8f5d5ba61959df000a81027e3e19a97adb5ecd2476678496edd66` (`manifest.json:6`)
- Binary: `Tetris/Tetris.exe` (`manifest.json:7`)
- Binary SHA-256: `846b7cf2db372981b5989863a8d560f7abfacb9c7f8219a7c059275d68760351` (`manifest.json:8`, `reports/binary-analysis.json:26`)
- Format: `PE32+ x86-64 console-subsystem, MSVC DEBUG C++ (RTTI intact), SDL2/TTF/Mixer dynamic` (`manifest.json:9`, `reports/binary-analysis.json:28`)
- License: `oleh-maliuta/tetris v1.0.0 MIT` (`reports/license-audit.json:15-19`); release-metadata only (`reports/license-audit.json:3`); shipped fonts/images retained under replica dirs, audio excluded (`manifest.json:44`, `reports/license-audit.json:32`)

## Analysis performed (binary only, no app source)

- Scale: `11157` procedures, `1567` strings (`manifest.json:12-13`, `reports/binary-analysis.json:29-30`).
- Architecture: `namespace Tetris: Application, Page, MainMenuPage, GuidePage, ControlsPage, SettingsPage, ScoreValuesPage, PlayPage; Renderable/Layout/Text/Texture primitives` (`manifest.json:14`, `reports/binary-analysis.json:31` — incl. `96 RTTI records`).
- Pages: `MainMenu, Guide, Controls, Settings, ScoreValues, Play` (`manifest.json:15-22`).
- Play handlers: `initKeyDownEvents x6 lambdas, initKeyUpEvents x2, initPauseMenu x4, initGameOverMenu x3` (`manifest.json:23-28`).
- Widgets: `score__text, score_value__text, level_value__text, pause_menu__layout, Game Over` (`manifest.json:29-35`).
- Original runtime note: `process alive under Wine/X11, no crash; GUI screenshot pending` (`manifest.json:38`).

## Replica build

Source/binary/assets as recorded in manifest (build not re-verified here):

```sh
cd benchmarks/native-windows-ports/tetris/replica
clang -O2 -o tetrismac tetris.c -I/opt/homebrew/include -L/opt/homebrew/lib -lSDL2 -lSDL2_image -lSDL2_ttf -lSDL2_mixer
```

Build string source: `manifest.json:41-50`. Reported artifact: `tetris/replica/tetrismac (52KB arm64 SDL2)` (`reports/functional-results.json:26`).

## Verification

| Case                                                                 | Status     | Basis                                                                                                                |
| -------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Original runtime (alive, no crash)                                   | PASS       | `manifest.json:38`                                                                                                   |
| macOS build (clean)                                                  | PASS       | `manifest.json:39`                                                                                                   |
| macOS menu (real window capture: TETRIS + 6 entries + hints)         | PASS       | `manifest.json:40`, `reports/functional-results.json:27`                                                             |
| macOS gameplay (Enter starts game; falling piece + ghost + HUD live) | PASS       | `manifest.json:49`                                                                                                   |
| Gameplay / key bindings / scoring / audio                            | UNVERIFIED | `reports/functional-results.json:28` (gameplay live-capture in `manifest.json:49` is the newer recorded observation) |

Overall functional status: `PARTIAL` (`reports/functional-results.json:25`).

## Non-goals

- No byte-identical executable; hashes differ by design (`reports/limitations.md:3-4`).
- No exact rotation/score/gravity table recovery; guideline values used (`reports/limitations.md:5-6`).
- No verified key bindings, scoring, or audio parity.
- Wine/CrossOver is a test harness for the original only, never the port vehicle (`reports/limitations.md:11`).

## Screenshots

Committed replica captures (relative links):

- [Menu](../screenshots/tetrismac-menu.png)
- [Gameplay](../screenshots/tetrismac-play.png)

Screenshot list source: `manifest.json:45-48`.
