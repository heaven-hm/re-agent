# Legacy Notepad — Windows binary to native macOS reconstruction

**Overall status: PARTIAL.** A native AppKit replica was launched, typed into, and used for a save-byte check. The full editor feature set is not implemented or verified.

## Inputs and implementation

- Original: legacy-notepad v1.2.1 release, Windows x64 PE; SHA-256 `00e67923f531e5590ab404aa5b906470b7c1505ec75cf69f22db99509de9fb56`. Static analysis details, including WinMain, WndProc and menu evidence: [manifest](../../notepad/manifest.json).
- Independent implementation: [main.swift](../../notepad/replica/main.swift), [macOS binary](../../notepad/replica/notepadmac), ARM64 AppKit application.

## Genuine replica screenshots

- [Unicode file loaded](../../screenshots/notepadmac-hello.png) — SHA-256 `f449e7b0c988882b87bf485ba53bc1300fefe43ce3ae17c01a04e0ea4c25bbf8`.
- [Typed text](../../screenshots/notepadmac-typed2.png) — SHA-256 `10756bd29ed1ecf6f6136c0160c899e8f5eaabd282d1c81b04a6abe86551bc22`.

The manifest records window and typing observations and an exact UTF-8 save check. These screenshots are the replica, not an original-vs-replica image comparison.

## Open behavior

Reopen, find/replace, font persistence, printing, and broader Windows behavior remain unverified. See [functional results](../functional-results.json) and [limitations](../limitations.md).
