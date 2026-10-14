# fd native macOS experiment — PARTIAL

`fdmac.cpp` is an independent native C++ implementation developed without upstream fd source. The latest REA-bound macOS run matched **14 of 15 declared original observations byte-for-byte**: all 11 search probes plus invalid-regex, invalid-option and version behavior. `--help` remains different. The captured originals ran through CrossOver, so this result characterizes the declared CrossOver/fixture suite; it does not prove native Windows symlink behavior or complete fd semantics.

Original target: `fd-v10.5.0-x86_64-pc-windows-msvc/fd.exe`, SHA-256 `d67d27a8e375ed7e9bca2b506a9dd5082bc24547aeba908b863f6f8b8ab0c3b9`.

Build from any directory on a macOS host with a C++17 compiler:

```sh
benchmarks/native-batch-2/reconstructed/fd/build.sh
benchmarks/native-batch-2/reconstructed/fd/build/fdmac --help
```

The latest observed build is a native arm64 Mach-O executable, 162,216 bytes, SHA-256 `34637d595ba14ee183b0af33652f3e3159f08d9b7788d393d85abc2afb276262`. The performance receipt binds this executable hash to the current source and all 15 REA-owned replica process observations.

The measured subset covers recursive filename search, regular expressions, simple glob expressions, extensions, case handling, hidden files, local ignore rules, file/directory/symlink filters, depth, UTF-8 names, invalid input, version and help. The implementation intentionally reproduces the original's Windows path output for relative fixture paths and the observed CrossOver symlink classification. Rust-regex edge cases, complete gitignore precedence, Unicode case folding, global ignore configuration, parallel ordering and fd's full option set remain unsupported or unverified. `--help` exits 0 but its text differs from the original.

`tests/fd-fixture.mjs` declares the fixture tree and 15 original/replica probes. `tests/fd-replica-probes.mjs` uses REA's shared `runOwnedCommand` for actual native executions. The current `reports/fd/replica-probes.json` retains **15 OBSERVED executions**. `reports/fd/comparison.json` retains raw mismatches separately from normalized search results. `reports/fd/repair-loop.json` records actual pre/post executions and source/binary hashes: invalid-regex and version change from raw mismatch to raw pass; help improves its exit status while retaining its text mismatch. The pre-correction own source is reconstructed by reverting these explicit corrections before compilation and is identified honestly as such.

`analysis/fd/overview.json` retains the initial Ghidra `provider_timeout` at 330,000 ms, including real analyzer diagnostics and target identity. `analysis/fd/open.json` records the retry MCP session opening the correct PE; it does not establish successful analysis. The retry declared disabled Decompiler Switch Analysis and Decompiler Parameter ID analyzers and a 600,000 ms startup budget. It was stopped gracefully through its verified MCP child after the root agent instructed us to halt heavy workloads. `analysis/fd/investigation-failure.json` records connection closure. No function-level dossier or recovered algorithm claim resulted.

After the checkout rename, a CrossOver rerun failed before target execution with `wineserver crashed`; that run is retained as a worker fault and excluded from target outcomes. The accepted original records from before the rename remain hash-bound to the same exact fixture-tree hash and their run IDs, and compare against the current replica runs. They remain CrossOver observations, not native Windows execution. No screenshot or universal proof is claimed.

## Subsequent resource recovery and real evidence

After host resources recovered, `analysis/fd/resilience-investigate.mjs` completed one serial REA MCP/Ghidra investigation in **73 seconds**, using a declared lightweight profile disabling Decompiler Switch Analysis and Decompiler Parameter ID. Java heap was requested at 1 GiB; the observed process family peaked at **1,043,644,416 bytes RSS**, beneath its 1.5 GiB monitoring guard. Disk reserve stayed above 1 GiB. RSS monitoring is observational and is not an OS-enforced memory sandbox.

The resulting canonical Evidence records in `analysis/fd/resilience/` establish **8,153 discovered procedures, 2,066 defined strings and seven segments** for the original hash. `entry-dossier.json` binds pseudocode, assembly, complete body ranges, CFG and typed references to the real entry at **0x14027cda0**. Its 18-byte body calls `0x14027d1c0` and transfers to `0x14027cc20`. Those addresses are observed startup relationships; application main and conversion/search algorithm semantics are not inferred from them. `close.json` records successful closure. This bounded static success supersedes the earlier inability to produce a function inventory but does not establish candidate reconstruction fidelity.

The accepted original observations and current REA-owned replica observations are linked in `reports/fd/original-relocation.json`, `reports/fd/replica-probes.json` and `reports/fd/comparison.json`. The original emits `./` at the root and Windows separators within nested paths; the candidate reproduces those bytes for the declared relative-root cases. CrossOver exposes the fixture's `link.txt` as a file, and the candidate reproduces that observed behavior for `--type f`/`--type l`. This says nothing about how the native Windows kernel classifies a real NTFS symlink.

## Observed startup chain and measured corrections

`analysis/fd/resilience-main/` and `resilience-application/` retain additional canonical dossiers. The CRT at `0x14027cc20` calls `0x140092b20`; that startup function sets up exception handling and a thread named `main`, then passes `0x14002b5f0` to `0x1400165d0`. The latter is a 12-byte wrapper calling its code-pointer argument. The 112-byte callback calls `0x140025180`, handles a tagged error path and exits through `0x14003c240`. These are observed call/data relationships. Search dispatcher semantics, complete types and all application behavior remain unverified. No upstream source was used.

The corrected unclosed-character-class diagnostic is generated from the caught C++ regex error class and actual supplied pattern. Its equality is established for the recorded `[` input only; other error classes and caret positions require further tests. Compatibility version is an observed release datum. Help remains an honest native supported-capability listing rather than advertising unimplemented original options.

## Held-out worker failure

`tests/fd-heldout.mjs` generates 24 independently seeded filenames at varying depths, with case, Unicode, hidden-file and ignore variations (seed 34001). Ten additional search probes are declared. Real native outputs from the initial comparison attempt are archived in `reports/fd/heldout-initial-backend-failure.json`. They cannot establish parity: every original attempt reported a Wine server crash. The original producer now explicitly records `runtime_failed`, `target_observation_valid: false`, the actual wrapper exit 0 and unknown target exit. The current `heldout-comparison.json` therefore reports **UNVERIFIED**, rather than treating worker failure as original fd behavior or ten passing tests. The verifier requires matching target hash, arguments, working directory, raw-stream commitments and successful diagnostic-free positive-search baseline before launching comparison cases.
