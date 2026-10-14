# clipjar — proof (behavioral parity only)

Independent menu-bar/SQLite reimplementation of a Windows clipboard manager for macOS.
Not byte-identical to the original executable; behavioral parity only
(see `reports/limitations.md:3-4`).

## Original binary identity

- Name/version: `Clipjar v1.2.0 (Startrek666/Clipjar, MIT)` (`manifest.json:4`)
- URL: `https://github.com/Startrek666/Clipjar/releases/download/v1.2.0/clipjar.exe` (`manifest.json:5`)
- SHA-256: `8841b01b45ac984d6e2b2521be7a7bc527949e92eb1da6eaf85db82ccf1bf8f4` (`manifest.json:6`, `reports/binary-analysis.json:43`)
- Size/format: `5338624` bytes, `PE32+ x86-64 GUI, Rust (egui 0.29.1/eframe/winit/arboard, rusqlite 0.32.1)` (`manifest.json:7-8`, `reports/binary-analysis.json:45`)
- License: `Startrek666/Clipjar v1.2.0 MIT` (`reports/license-audit.json:25-29`); release-metadata only (`reports/license-audit.json:3`)

## Analysis performed (binary only, no app source)

- Ghidra import: `UNAVAILABLE (5.3MB static Rust exceeds 330s provider budget, 3 attempts)` (`manifest.json:13`, `reports/binary-analysis.json:46`).
- Strings-only recovery: `53494` strings (`manifest.json:14`, `reports/binary-analysis.json:47`).
- Schema: `clipboard_items(id,content_type,text_content,text_preview,image_path,image_thumb,content_hash,content_size,is_favorite,created_at,source_app) + user_settings + 4 indexes (verbatim DDL recovered)` (`manifest.json:15`, `reports/binary-analysis.json:48`).
- Queries: `INSERT OR IGNORE, SELECT/DELETE by id, retention cleanup (non-favorites FIFO + image caps), created_at touch` (`manifest.json:16`).
- Settings: `14 AppSettings fields (retention days, storage path, auto-start, max items/images/size, preview length, geometry, shortcut, auto-paste, language, first-launch)` (`manifest.json:17`).
- Modules: `clipboard/handler, system/hotkey, system/tray, system/autopaste, utils/image_utils` (`manifest.json:18-24`).
- Runtime: `PASS (launches clean under Wine/X11, no errors; tray-only, no main window by design)` (`manifest.json:25`).

## Replica build

Source/binary/mapping as recorded in manifest (build not re-verified here):

```sh
cd benchmarks/native-windows-ports/clipjar/replica
swiftc -O -o clipjarmac main.swift -framework Cocoa -framework CryptoKit -lsqlite3
```

Build string source: `manifest.json:26-31`. Reported artifact: `clipjar/replica/clipjarmac (117KB arm64 menu-bar)` (`reports/functional-results.json:43`). Mapping: `tray->NSStatusItem menu-bar, egui->popover NSTableView+search, rusqlite->libsqlite3 same DDL, hotkey/autopaste/image-clipboard: partial/unverified` (`manifest.json:30`).

## Verification

| Case                                                                    | Status     | Basis                                                                  |
| ----------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| Synthetic capture (controlled string → SHA-256 row, same-schema SQLite) | PASS       | `manifest.json:33`, `reports/functional-results.json:44`               |
| Restart persistence (rows survive relaunch)                             | PASS       | `manifest.json:34`, `reports/functional-results.json:44`               |
| Hash dedupe (double copy → single row + timestamp touch)                | PASS       | `manifest.json:35`, `reports/functional-results.json:44`               |
| Search / delete / favorites UI paths                                    | UNVERIFIED | `manifest.json:36`, `reports/functional-results.json:45-50`            |
| Global hotkey (needs Accessibility permission flow)                     | UNVERIFIED | `manifest.json:37`, `reports/functional-results.json:45-50`            |
| Image clipboard / autopaste                                             | UNVERIFIED | `reports/functional-results.json:45-50`, `reports/limitations.md:9-10` |

Overall functional status: `PARTIAL` (`reports/functional-results.json:42`).

## Non-goals

- No byte-identical executable; hashes differ by design (`reports/limitations.md:3-4`).
- No full static-analysis recovery (Ghidra budget exceeded; strings + runtime only) (`reports/limitations.md:9-10`).
- No ported image clipboard, global hotkey, or autopaste behavior.
- Wine/CrossOver is a test harness for the original only, never the port vehicle (`reports/limitations.md:11`).

## Screenshots

No committed screenshots for this target in `../screenshots/` (present files cover only `notepadmac-*`, `pixelmac-*`, `tetrismac-*`).
