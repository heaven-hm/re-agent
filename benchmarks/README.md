# Real software and game reconstruction benchmarks

These are scoped, reproducible demonstrations operated by the host coding agent through the engine's existing managed analysis, reconstruction import, owned process capture and compilation paths. No model API key is required. Exact tested output bytes are compared; whole executable byte identity is not established.

## One command on the verified macOS ARM64 profile

```sh
npm ci
npm run build:cached
node scripts/verify-managed-benchmarks.mjs
```

The verified profile reuses installed .NET 10, ARM64 Mono, Mono's shared-library dependencies and XQuartz. It installs the bundled ILSpy package from a local-only NuGet feed when missing, reuses a healthy installation, runs software cases, recovers/rebuilds the game, automatically launches a token-owned local Xvfb display with TCP disabled, runs game comparisons, then verifies display cleanup. Output contains canonical REA evidence, hashes, build diagnostics, images, comparison reports and the cleanup result.

A fresh checkout downloads the software original from its official publisher only when absent, checks the pinned archive and DLL SHA-256, and keeps it local. The original software is not redistributed here. The supplied game original is GPL-licensed and has accompanying source and licensing records.

This is a verified host profile, not a claim that these dependencies are present on every machine or that the entire distribution is self-contained. See the tool inventory and required dependencies below.

## Software: LTRData Luhn utility

- Original publisher download: https://static.ltr-data.se/files/net10.0/luhn.zip
- Original archive SHA-256: `aff368c553a460a4ff2b14046cb1388d38d92b255ba648becb0542041ef885df`.
- Original managed DLL SHA-256: `e30a028e8db474b8a3b17f7088efb8054b818f08b1e30011a50112480d5be353`.
- Engine `inspect-managed-members` recovered four methods and actual CIL anchors; ILSpy recovered the compiled implementation. No original source repository was consulted.
- The independent C# implementation is [LuhnReplica.cs](../scripts/benchmarks/LuhnReplica.cs). It preserves the observed UTF-16 string-length parity and Unicode-digit counting rules, rather than substituting a typical Luhn implementation.
- Five declared suites compare terminal bytes without path/PID/port/text normalization, with successful exits and untruncated captures. This includes 230 numeric and Unicode input lines, `/PG`, case-insensitive flags, usage output and blank-line termination.
- The original and rebuilt managed PE assemblies execute on macOS .NET. This is not native Windows OS execution.

Individual reproduction:

```sh
node scripts/verify-luhn-reconstruction.mjs /absolute/path/to/luhn.dll
```

The supplied replica can be executed with `dotnet benchmarks/luhn/replica/Replica.dll` and newline-separated standard input. Its executable hash differs from the original.

## Game: published TicTacToe-AI

Original: [tatlead/TicTacToe-AI](https://github.com/tatlead/TicTacToe-AI/tree/ce0f81b05e190dcfb72ea68c5fbb1114fa994a5a). The engine inspected the shipped executable and recovered C# and resources from its binary. The original source was not consulted during reconstruction. The pinned source archive was fetched afterward for GPL redistribution obligations.

[Original executable](tictactoe/original/TicTacToe.exe), [reconstructed executable/source](tictactoe/reconstructed), [GPL license](tictactoe/LICENSE).

The recovery script records static evidence, uses bundled ILSpy, extracts original embedded resources, and compiles recovered source with installed Roslyn and Mono references. A compiler-detected invalid decompiler base-class call is repaired once against the original CIL evidence. REA imports `CheckGameStatus` reconstruction against its exact artifact hash, MVID, token, signature and normalized IL hash; imported source remains an inference until tested.

The probe executes the real original or rebuilt code. It contains no replacement game algorithm. It enumerates all `3^9 = 19,683` board configurations for `CheckGameStatus`, compares returned values and row/column indicator state bytes, then presses actual game buttons and captures six actual `Form.DrawToBitmap` images. PNG files and their pixel bytes matched exactly in the recorded run.

This exhausts that declared board input domain, not every possible UI state or entire game execution. AI/RNG, all menus, timing and sound remain unverified. Both applications run on the same ARM Mono/X11 runtime on macOS. Images are real Mono form renders, not Windows desktop screenshots; the runtime's rendering quirks apply to both.

Individual recovery and testing with an existing caller-owned X11 display:

```sh
node scripts/recover-tictactoe-replica.mjs /absolute/path/to/new-recovery-directory
DISPLAY=:97 REA_GDIPLUS_DIRECTORY=third_party/libgdiplus \
  node scripts/verify-tictactoe-reconstruction.mjs \
  benchmarks/tictactoe/original/TicTacToe.exe \
  /absolute/path/to/new-recovery-directory/Replica.exe
```

The one-command workflow owns its display lifecycle, so routine use does not require the individual commands above.

## Bundled versus installed tools

| Component                                                   | Included in source/package                                                         | Verified status                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Engine CLI/MCP, agent skill source, controller and adapters | Yes                                                                                | Built locally; workflow executed                                                                     |
| ILSpy 9.1.0.7988 official binary NuGet package              | Yes, with package hash, repository signature and dependency notices                | Clean offline install and reuse health checks passed; actual binaries decompiled                     |
| X11-enabled libgdiplus 6.1 for macOS ARM64                  | Yes, built library plus official source archive, license, notices and build record | Original/rebuilt game integration passed; upstream GoogleTest build remains failed                   |
| .NET 10 and ARM Mono                                        | No; existing installations reused                                                  | Real compilation and execution passed                                                                |
| XQuartz/Xvfb                                                | No; XQuartz was installed through Homebrew on this host                            | Actual isolated display and cleanup verified                                                         |
| Ghidra, radare2, compilers and debuggers                    | Existing integration and installation profiles; not all binaries embedded          | Prior scoped evidence is linked in the README                                                        |
| Frida/LIEF/Z3/Capstone/Pillow wheels and sources            | Workspace offline bundle builder; existing local bundle                            | Health/integration records retained; complete native dependency redistribution audit remains pending |
| Proprietary/licensed optional tools                         | Not redistributed                                                                  | Optional, subject to user licensing                                                                  |

The isolated libgdiplus build enables X11 and selects existing libpng16 instead of obsolete libpng14. The library build and real game integration passed; the old GoogleTest build failed under the current compiler. It is not reported as a passing upstream test suite.

## Licenses and evidence

The game executable, recovered game code, recovered assets and game images are GPL-3.0 material, aggregated separately from the MIT engine. The original copyright metadata and complete license are retained with the game. A pinned upstream source archive accompanies the original; recovered source accompanies the rebuild. ILSpy and libgdiplus retain their own notices. The software original is obtained locally from the official publisher and is not included in this repository.

[Recorded artifact manifest](../docs/verification/rea-engine/manifest.json) and execution ZIPs retain actual evidence. They are development-run records, not guaranteed future results. Re-run the workflow to generate fresh evidence for your host. Screenshots and finite tests do not establish universal equivalence.
