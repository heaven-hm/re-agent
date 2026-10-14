# snake — proof (behavioral parity only)

Independent reimplementation of a Windows console snake game for macOS.
Not byte-identical to the original executable; behavioral parity only
(see `reports/limitations.md:3-4`).

## Original binary identity

- Name/version: `snake-game v1.1.0 (MiguelMochizuki/snake-game, MIT)` (`manifest.json:4`)
- URL: `https://github.com/MiguelMochizuki/snake-game/releases/download/v1.1.0/snake-windows-x86_64.exe` (`manifest.json:5`)
- SHA-256: `207d311be674c17be31131df095534003e0120b1a00a6569b697e00ae0c2d373` (`manifest.json:6`, `reports/binary-analysis.json:3`)
- Size/format: `55296` bytes, `PE32+ x86-64 console, MSVC C++17` (`manifest.json:7-8`, `reports/binary-analysis.json:4-5`)
- License: `MiguelMochizuki/snake-game v1.1.0 MIT` (`reports/license-audit.json:5-9`); method was release-metadata only, no app source inspected (`reports/license-audit.json:3`)

## Analysis performed (binary only, no app source)

- Scale: `381` procedures, `238` app functions, `220` strings (`manifest.json:12-13`, `reports/binary-analysis.json:6-7`).
- Entry chain: `CRT -> __scrt chain -> invoke_main FUN_1400070d0 -> driver FUN_1400042e0` (`manifest.json:13`, `reports/binary-analysis.json:8`).
- Render routine: `FUN_140003210 (891B, ostringstream board)` (`manifest.json:14`, `reports/binary-analysis.json:9`).
- Recovered strings: `Score: / Best: / Controls: WASD to move, Q to quit / Final Score: / Games Played: / Average Score: / [R]Restart[Q]Quit` (`manifest.json:16-26`).
- Persistence markers: `/best_score.txt / /score_history.txt / /score_checksum.txt` (`manifest.json:20-22`, `reports/binary-analysis.json:10-14`).
- Driver model: `render -> input poll (anti-reverse pairs 0/1,2/3) -> move -> render -> QPC+Sleep tick; death -> stats -> menu -> restart loop` (`manifest.json:28`).
- Recovered behavior: `20x20 + # walls (22x22 render)`, start `len 3 horizontal moving right`, `tick 200ms`, `WASD move / Q quit-to-menu / R restart`, HUD `Score/Best + controls line, CRLF`, game-over `Final/Best/GamesPlayed/Average + [R]/[Q]`, persistence `best_score.txt, score_history.txt, score_checksum.txt` (`manifest.json:30-38`).

## Replica build

Source/binary as recorded in manifest (build not re-verified here):

```sh
cd benchmarks/native-windows-ports/snake/replica
clang -O2 -o snakemac snake.c
```

Build string source: `manifest.json:39-43`. Reported artifact: `snake/replica/snakemac (34KB arm64)` (`reports/functional-results.json:4`).

## Verification

| Case                                                         | Status     | Basis                                                      |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| Original transcript captured                                 | OBSERVED   | `original-run0.txt`; no paired replica output is retained  |
| Static frame parity (26 lines, modulo dynamic cells)         | UNVERIFIED | No paired transcript or comparison receipt is included     |
| Game-over parity                                             | UNVERIFIED | No paired original/replica receipt is retained             |
| Replica build                                                | PASS       | `replica/build.sh` compiles the current ARM64 candidate    |
| Input path (PTY drives menus; piped stdin ignored by design) | PARTIAL    | `manifest.json:51`                                         |
| Score per food (+1 assumed)                                  | UNVERIFIED | `manifest.json:47`, `reports/functional-results.json:6-11` |
| Food RNG distribution                                        | UNVERIFIED | `manifest.json:48`, `reports/functional-results.json:6-11` |
| Tick wall-clock (200 ms from binary; Wine console too slow)  | UNVERIFIED | `manifest.json:49`, `reports/limitations.md:8-9`           |
| Persistence format (checksum scheme unknown)                 | UNVERIFIED | `manifest.json:50`, `reports/functional-results.json:6-11` |

Overall functional status: `PARTIAL`; the retained evidence does not establish original-versus-replica equality.

## Non-goals

- No byte-identical executable; hashes differ by design (`reports/limitations.md:3-4`).
- No exact food RNG, score-per-food, or checksum-scheme recovery.
- No wall-clock tick corroboration under Wine.
- No piped-stdin input support (PTY-driven by design).

## Screenshots

No committed screenshots for this target in `../screenshots/` (present files cover only `notepadmac-*`, `pixelmac-*`, `tetrismac-*`).
