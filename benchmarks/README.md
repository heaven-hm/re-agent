# Real software and game reconstruction benchmarks

These are scoped, reproducible demonstrations operated by the host coding agent through the engine's existing managed analysis, reconstruction import, owned process capture and compilation paths. No model API key is required. Exact tested output bytes are compared; whole executable byte identity is not established.

## Included application and game catalog

[`catalog.json`](catalog.json) is the package-checked inventory of every benchmark application/game currently created with REA Engine or tracked as an incomplete reconstruction. It points to each available original binary retained in the repository, implementation source, checked-in runnable artifact where present, evidence, target report, and available target acquisition manifests or build guides. It also records the SHA-256, size, and acquisition manifest for six locally acquired Batch 2 Windows PE originals (seven executable files including one analysis copy) that are intentionally excluded from source/package distribution. Those private originals are not required to exist in a clean checkout; their tracked acquisition manifests provide portable provenance. Status is per the tested scope; it does not imply full application equivalence. Targets whose original binary is not retained link to acquisition or execution records instead.

The package check also scans packaged benchmark manifests, retained original executables, target reports, reconstruction sources, and build scripts for entries missing from the catalog. A new benchmark record or retained original binary cannot silently ship outside the inventory.

The current repository scan finds **17 targets (10 software, 7 games), seven hash-bound local-only original PE executables for six targets, zero unlisted benchmark records, and zero missing package references**. The package verifier checks that each distributable source, build input, asset, report, evidence file, and retained original resolves to a regular file before packing; separate checks reject private originals and generated build outputs from the package. This inventory result does not mean every target has a finished reconstruction or original-versus-replica proof; status and missing evidence remain target-specific below.

The 2026-10-14 npm package dry run included all 17 catalog entries and their referenced tracked sources, reports, evidence, assets and retained originals: 2,070 package entries total, including 367 benchmark files and 55 benchmark executables/assets. All 11 declared replica artifact files (10 runnable replica binaries plus the Luhn runtime configuration) and all seven cataloged original executables were present in the dry-run package. Six Batch 2 Windows release originals and one analysis copy are now explicitly represented by hash-bound local-only records but remain excluded from distribution under `benchmarks/native-batch-2/.gitignore`; the three Batch 2 game records have analysis evidence but no reconstructed game executable to package yet. Scratch copies under ignored `output/` and `_reference/` are transient investigations or reference inputs, not additional unique deliverable targets.

The catalog contains 17 targets: 10 software targets and 7 games. Fourteen have an implementation or finite feature reconstruction; the three Batch 2 game targets are analysis-only. Calculator, Luhn and TicTacToe have finite feature-suite passes. Ten other implemented targets are partial. ripgrep has eight run-bound CrossOver comparisons: seven pass under the documented relative-path separator normalization, while invalid-regex diagnostics differ; the app remains PARTIAL. Seven retained original executables are listed explicitly; originals acquired for Batch 2 and private runtime-worker state are intentionally excluded from the npm package. The catalog records the Calculator screenshot attempt as failed and does not present it as visual evidence.

| Target                   | Kind     | Current scope status                                                                                      | Evidence / implementation record                                            |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| LTRData Luhn utility     | Software | Feature PASS                                                                                              | [Target report](luhn/target-report.md)                                      |
| TicTacToe-AI             | Game     | Feature PASS                                                                                              | [Target report](native-windows-ports/reports/targets/tictactoe.md)          |
| Apple Calculator         | Software | Feature PASS                                                                                              | [Target report](native-windows-ports/reports/targets/calculator.md)         |
| plink                    | Software | Partial                                                                                                   | [Target report](plink/reports/target-report.md)                             |
| Snake                    | Game     | Partial                                                                                                   | [Target report](native-windows-ports/reports/targets/snake.md)              |
| PixelTetris              | Game     | Partial                                                                                                   | [Target report](native-windows-ports/reports/targets/pixeltetris.md)        |
| Tetris                   | Game     | Partial                                                                                                   | [Target report](native-windows-ports/reports/targets/tetris.md)             |
| Legacy Notepad           | Software | Partial                                                                                                   | [Target report](native-windows-ports/reports/targets/notepad.md)            |
| Clipjar                  | Software | Partial                                                                                                   | [Target report](native-windows-ports/reports/targets/clipjar.md)            |
| GConv QVM behavior slice | Software | Partial                                                                                                   | [Target report](native-windows-ports/reports/targets/gconv.md)              |
| imgview                  | Software | Partial                                                                                                   | [Target report](native-windows-ports/reports/targets/imgview.md)            |
| fd                       | Software | Partial (14/15 exact raw-byte matches across the declared suite; complete fd behavior remains unverified) | [Batch 2 target report](native-batch-2/reports/fd/target-report.md)         |
| ripgrep                  | Software | Partial (8/8 cases; six search results require path normalization)                                        | [Batch 2 target report](native-batch-2/reports/ripgrep/target-report.md)    |
| bat                      | Software | Feature PASS (8/8 bound cases; app partial)                                                               | [Batch 2 target report](native-batch-2/reports/bat/target-report.md)        |
| OpenLieroX               | Game     | UNVERIFIED (analysis only)                                                                                | [Batch 2 target report](native-batch-2/reports/openlierox/target-report.md) |
| SuperTux                 | Game     | UNVERIFIED (analysis only)                                                                                | [Batch 2 target report](native-batch-2/reports/supertux/target-report.md)   |
| The Powder Toy           | Game     | UNVERIFIED (analysis only)                                                                                | [Batch 2 target report](native-batch-2/reports/powder-toy/target-report.md) |

The benchmark directories also retain detailed per-target instructions and historical evidence. A compiled artifact is included only when it is a checked-in, redistributable build for the current host; other targets include source and rebuild instructions instead. OpenLieroX, SuperTux and The Powder Toy currently have acquisition/static-analysis records only: there is no reconstructed game executable or gameplay screenshot for these targets yet.

### Visual evidence still missing

- TicTacToe has paired original/rebuilt PNG renders produced by `DrawToBitmap` on the same Mono/X11 runtime; these are not Windows desktop captures.
- PixelTetris, Tetris, Legacy Notepad and imgview have genuine macOS replica screenshots only. There is no paired original-app image comparison for those targets.
- Calculator's screenshot attempt failed and is retained as an attempt record, not a screenshot. Clipjar and Snake have no screenshots.
- OpenLieroX, SuperTux and The Powder Toy have no reconstructed game or runtime screenshot. Batch 2 visual evidence currently records zero target screenshots.
- CLI targets are supported by textual execution/comparison receipts where available; those receipts do not establish complete application behavior.

These gaps are also described in the individual target reports. The repository has reports for all 17 targets, but no report claims whole-application or executable byte identity.

## Rebuildable native samples

The calculator sample now has a standalone AppKit entry point and build recipe. Snake, PixelTetris, Tetris, Legacy Notepad, Clipjar, GConv QVM, imgview, plink, fd, ripgrep and bat each have a repository-relative build script. They place fresh outputs under ignored `build/` directories so builds do not overwrite checked-in artifacts. The SDL games require SDL2 packages discoverable through `pkg-config`; the other scripts use the host Swift, Clang or C++ toolchain. PixelTetris and Tetris load their cataloged `replica/assets/` directories at runtime. The catalog lists TicTacToe's complete recovered C# source set and both embedded `.resources` build inputs. These scripts build the checked-in reconstruction sources; they do not build the three analysis-only Batch 2 games.

```sh
scripts/calculator/build.sh
benchmarks/native-windows-ports/snake/replica/build.sh
benchmarks/native-windows-ports/pixeltetris/replica/build.sh
benchmarks/native-windows-ports/tetris/replica/build.sh
benchmarks/native-windows-ports/notepad/replica/build.sh
benchmarks/native-windows-ports/clipjar/replica/build.sh
benchmarks/native-windows-ports/gconv/replica/build.sh
benchmarks/native-windows-ports/imgview/replica/build.sh
benchmarks/plink/replica/build.sh
benchmarks/native-batch-2/reconstructed/fd/build.sh
benchmarks/native-batch-2/reconstructed/ripgrep/build.sh
benchmarks/native-batch-2/reconstructed/bat/build.sh
```

Run `npm run benchmarks:build` on macOS to build the 12 currently implemented desktop replicas in one pass. It stops reporting only after attempting every recipe and returns failure if any build fails. Outputs remain in ignored `build/` directories; host-specific generated binaries are not distributed. The three Batch 2 CLI outputs are written to their respective `reconstructed/<target>/build/` directories. The cataloged source, build scripts, required assets, reports and available evidence are included. Batch 2 game originals are private inputs and are not redistributed.

The latest recorded macOS ARM64 build run rebuilt all 12 listed recipes: 12/12 succeeded and each output was identified as an arm64 Mach-O. Its [machine-readable receipt](validation/2026-10-14/results.json) includes the exact commands, source and executable SHA-256 values, compiler versions, per-build logs and test logs. In the same run, plink passed 4 byte-golden checks, ripgrep passed 7 local CLI behavior checks, and the Batch 2 capture/report-integrity suite passed 21 tests. These are build and harness results only; they do not upgrade any target's reconstruction or fidelity status. The host still cannot capture display 0, so this receipt contains no new screenshots.

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
