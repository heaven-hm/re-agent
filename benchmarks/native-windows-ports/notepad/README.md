# notepad (legacy-notepad) — proof (behavioral parity only)

Independent AppKit reimplementation of a Windows Win32 notepad for macOS.
Not byte-identical to the original executable; behavioral parity only
(see `reports/limitations.md:3-4`).

## Original binary identity

- Name/version: `legacy-notepad v1.2.1 (ForLoopCodes/legacy-notepad, MIT; binary reports v1.2.0)` (`manifest.json:4`)
- URL: `https://github.com/forloopcodes/legacy-notepad/releases/download/v1.2.1/legacy-notepad-x64.exe` (`manifest.json:5`)
- SHA-256: `00e67923f531e5590ab404aa5b906470b7c1505ec75cf69f22db99509de9fb56` (`manifest.json:6`, `reports/binary-analysis.json:34`)
- Size/format: `262656` bytes, `PE32+ x86-64 GUI, MSVC C++17, pure Win32 + GDI+ + RichEdit` (`manifest.json:7-8`, `reports/binary-analysis.json:35-36`)
- License: `ForLoopCodes/legacy-notepad v1.2.1 MIT` (`reports/license-audit.json:20-24`); release-metadata only (`reports/license-audit.json:3`)

## Analysis performed (binary only, no app source)

- Scale: `895` procedures, `587` strings (`manifest.json:11-12`, `reports/binary-analysis.json:37-38`).
- WinMain: `FUN_140004910: DPI PerMonitorV2, class NotepadClass, WndProc FUN_140003450, menu 0x65, icon 0x67, accelerators 0x66, saved window geometry, cmdline file open` (`manifest.json:13`, `reports/binary-analysis.json:39` — menu/accel subset).
- WndProc: `FUN_140003450, 91 callees: WM_COMMAND 0x9c41-0x9c6c menu map, WM_CTLCOLOREDIT dark theme (0x2d2d2d), WM_DROPFILES, WM_MOUSEWHEEL+Ctrl zoom` (`manifest.json:14`, `reports/binary-analysis.json:40` — callee/cmd-map subset).
- Menus: `File(New/Ctrl+N,Open/Ctrl+O,Save/Ctrl+S,SaveAs/Ctrl+Shift+S,Print/Ctrl+P,Recent), Edit(Undo/Ctrl+Z,Copy, Paste,Find/Ctrl+F,Next F3/Shift+F3,Font), View, Help` (`manifest.json:15`).
- Dialogs: `Find and Replace, save-changes prompt, file filters (images, ico), font panel (FontName/Size/Weight persisted)` (`manifest.json:16`).
- About: `Legacy Notepad v1.2.0, fast lightweight editor, C++ Win32` (`manifest.json:17`).
- Replica plan: `AppKit NSTextView + menu bar mirroring recovered labels/shortcuts + open/save dialogs + find/replace + font panel + dark theme + drag-drop + recent files` (`manifest.json:19`).

## Replica build

Source/binary as recorded in manifest (build not re-verified here):

```sh
cd benchmarks/native-windows-ports/notepad/replica
swiftc -O -o notepadmac main.swift -framework Cocoa
```

Build string source: `manifest.json:20-23`. Reported artifact: `notepad/replica/notepadmac (111KB arm64 AppKit)` (`reports/functional-results.json:32`).

## Verification

| Case                                                    | Status     | Basis                                                       |
| ------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| Window (real Unicode capture; cmdline open + title)     | PASS       | `manifest.json:31`, `reports/functional-results.json:33`    |
| Typing (scripted keystrokes rendered on-screen)         | PASS       | `manifest.json:32`                                          |
| Save roundtrip (append + Cmd+S wrote exact UTF-8 bytes) | PASS       | `manifest.json:33`                                          |
| Reopen                                                  | UNVERIFIED | `manifest.json:34`, `reports/functional-results.json:34-39` |
| Find / replace paths                                    | UNVERIFIED | `manifest.json:35`, `reports/functional-results.json:34-39` |
| Font persistence                                        | UNVERIFIED | `manifest.json:36`, `reports/functional-results.json:34-39` |
| Print                                                   | UNVERIFIED | `manifest.json:37`, `reports/functional-results.json:34-39` |

Overall functional status: `PARTIAL` (`reports/functional-results.json:31`).

## Non-goals

- No byte-identical executable; hashes differ by design (`reports/limitations.md:3-4`).
- No verified reopen, find/replace, font-persistence, or print parity.
- No Win32 control/message-level port; AppKit behavior mapping only.

## Screenshots

Committed replica captures (relative links):

- [Unicode file loaded, title from cmdline open](../screenshots/notepadmac-hello.png)
- [Scripted typing rendered](../screenshots/notepadmac-typed2.png)

Screenshot list source: `manifest.json:24-28`.
