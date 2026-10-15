# Reverse Engineering Engine

**Repository: [heaven-hm/rea-engine](https://github.com/heaven-hm/rea-engine).**
Reverse Engineering Engine builds directly on [morluto/rea](https://github.com/morluto/rea), retaining its MIT license, attribution and working integrations. The package identity is `rea-engine`; compatible `rea` and `rea-agents` command aliases are retained. Registry metadata is configured for `io.github.heaven-hm/rea-engine`; this does not imply npm or MCP Registry publication.

## Architecture at a glance

REA Engine extends the existing [REA](https://github.com/morluto/rea) analysis ecosystem with a bounded investigation and reconstruction layer. The diagrams below distinguish inherited providers from engine-specific orchestration. They describe supported workflows, **not** a promise of fully automatic reconstruction for arbitrary binaries.

```mermaid
flowchart TB
    U["Developer / coding agent"] --> I["CLI · MCP · local dashboard"]
    I --> C["Autonomous investigation controller"]
    C --> S["Durable workspace · checkpoints · stop/resume"]

    subgraph EXISTING["Existing REA analysis capabilities"]
        P["Static analysis providers<br/>Ghidra · managed assemblies · artifacts"]
        R["Runtime and process evidence<br/>capture · instrumentation"]
    end

    subgraph ENGINE["REA Engine extensions"]
        D["Evidence-led discovery"]
        T["Owned Frida trace correlation"]
        A["Bounded affine recovery"]
        V["Conditional Z3 equivalence checks"]
        B["Build · test · bounded repair"]
    end

    C --> D
    D --> P
    D --> R
    R --> T
    P --> A
    T --> A
    A --> V
    V --> B
    B --> S
    B --> O["Scoped evidence · reports · benchmark results"]
    O --> I

    classDef entry fill:#1e293b,stroke:#64748b,color:#ffffff
    classDef control fill:#1d4ed8,stroke:#60a5fa,color:#ffffff
    classDef upstream fill:#f1f5f9,stroke:#94a3b8,color:#0f172a
    classDef extension fill:#ecfeff,stroke:#0891b2,color:#164e63
    classDef output fill:#ecfdf5,stroke:#059669,color:#065f46
    class U,I entry
    class C,S control
    class P,R upstream
    class D,T,A,V,B extension
    class O output
```

### Bounded investigation and repair workflow

Each iteration works from collected evidence and explicit constraints. Verification is conditional and target-dependent; an unsupported recovery or exhausted budget produces a recorded result rather than an equivalence claim.

```mermaid
flowchart TD
    START["Select authorized target and investigation plan"] --> BASE["Collect baseline static/runtime evidence"]
    BASE --> H["Form a candidate hypothesis"]
    H --> REC["Recover or implement a bounded candidate"]
    REC --> TEST["Build and execute declared tests"]
    TEST --> MATCH{"Declared checks pass?"}
    MATCH -- "Yes" --> VERIFY["Run applicable independent / Z3 checks"]
    VERIFY --> OUT{"Evidence supports claim?"}
    OUT -- "Yes" --> DONE["Record scoped result and artifacts"]
    OUT -- "No" --> LIMIT{"Repair budget available?"}
    MATCH -- "No" --> LIMIT
    LIMIT -- "Yes" --> REPAIR["Record mismatch · checkpoint · repair or roll back"]
    REPAIR --> TEST
    LIMIT -- "No" --> STOP["Stop with limitations and preserved evidence"]
    classDef start fill:#1e293b,stroke:#64748b,color:#ffffff
    classDef step fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef decision fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef success fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef stopped fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    class START start
    class BASE,H,REC,TEST,VERIFY,REPAIR step
    class MATCH,OUT,LIMIT decision
    class DONE success
    class STOP stopped
```

### Extension boundary and provenance

```mermaid
flowchart LR
    subgraph UP["Upstream morluto/rea"]
        REA["CLI / MCP and agent workflows"]
        PROVIDERS["Ghidra · Frida · native / managed / web analysis"]
    end
    subgraph EXT["heaven-hm/rea-engine additions"]
        AUTO["Persistent autonomy controller"]
        PROOF["Affine recovery · constrained verification"]
        TOOL["Verified tool bootstrap · offline bundle builder"]
        UI["Investigation dashboard · reconstruction evidence"]
    end
    REA --> AUTO
    PROVIDERS --> AUTO
    AUTO --> PROOF
    AUTO --> UI
    TOOL -. "Optional local dependencies" .-> PROVIDERS
    classDef inherited fill:#f1f5f9,stroke:#64748b,color:#0f172a
    classDef added fill:#eff6ff,stroke:#2563eb,color:#1e40af
    class REA,PROVIDERS inherited
    class AUTO,PROOF,TOOL,UI added
```

For implementation details, see the [investigation controller](src/application/autonomy/AutonomousInvestigation.ts), [autonomous discovery](src/composition/autonomousDiscovery.ts), [Frida correlation adapter](src/native/FridaAutonomyTrace.ts), [affine recovery](src/application/autonomy/AffineRecovery.ts), [conditional proof implementation](src/application/autonomy/AffineEquivalenceProof.ts), and [dependency packaging limits](docs/autonomy-tool-bootstrap.md).

### What differs from upstream REA

| Area                           | Reverse Engineering Engine addition                                                                                           | Source / reproducible evidence                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomous reconstruction      | Persistent checkpoints, bounded build/test/repair, rollback, mismatch regression inputs                                       | [Controller](src/application/autonomy/AutonomousInvestigation.ts), [25/25 fixture report](docs/verification/rea-extended/fixture-report.json)           |
| Unknown function investigation | Existing static providers feed runtime hypotheses and independent bounded affine reconstruction                               | [Discovery](src/composition/autonomousDiscovery.ts), [recovery](src/application/autonomy/AffineRecovery.ts)                                             |
| Runtime/static correlation     | Owned Frida Gadget profile checks binary identity, ASLR and instruction prefix, records arguments/returns and cleanup         | [Adapter](src/native/FridaAutonomyTrace.ts), [five-call report](docs/verification/rea-extended/frida-report.json)                                       |
| Conditional verification       | Z3 checks extracted scalar expressions under explicit assumptions                                                             | [Proof implementation](src/application/autonomy/AffineEquivalenceProof.ts), [verification guide](docs/autonomous-reconstruction-benchmark.md)           |
| Tool installation and bundles  | Reuse installed tools; pinned official downloads, hashes, health checks, offline wheel/source bundle builder                  | [Bootstrap and license limits](docs/autonomy-tool-bootstrap.md)                                                                                         |
| Coding-agent integration       | Existing CLI/MCP plus autonomous investigation operations and packaged skill instructions; host Codex/Claude can operate them | [Agent workflow](.agents/skills/reverse-engineer-anything/references/autonomous-reconstruction.md), [workflow guide](docs/autonomous-reconstruction.md) |
| Interface                      | Local evidence/status dashboard with pause/resume/stop                                                                        | [Dashboard](src/composition/autonomyDashboard.ts)                                                                                                       |

These are additions to the upstream tool ecosystem. Ghidra, native UI, browser analysis and general Frida capabilities already exist upstream and are not claimed as inventions of this fork.

### Binary-only legacy case study: IGI 2 GConv

The [GConv record](benchmarks/native-windows-ports/gconv/README.md) starts from locally supplied 2003 Windows PE32 binaries, not vendor source. A fresh offline radare2 6.2.0 scan hash-bound `gconv.exe`, `gconvapi.dll`, and `vqdll.dll`; it recorded 487 heuristic function entries in the EXE, enumerated the DLL's `gc*` exports and the codec's `VqCalc` export, and retained raw function/import/export records. That scan used radare2 directly. The current CLI deep-analysis selector still rejects `--provider radare2` (it offers Ghidra, Hopper, and IDA); RE-Agent's new radare2 MCP operations have not yet been exercised end to end on this target. This is a concrete integration gap to close. The binary evidence points to a useful next behavior slice: connect one exported API/native call to an independently implemented test, while keeping unknown semantics unresolved.

**Status: partial static analysis; no confirmed vendor bug or repair yet.** The checkout also retains a 120-script error-parity receipt, but the private original corpus and a replay harness are not present, so this turn did not reproduce that historical result. Full QVM execution, native-call semantics, DLL ABI/codec compatibility, a Windows runtime trace, and a full game port remain unverified. The supplied Windows files are not committed; their SHA-256 values and local-only status are documented. A supported release scope is also unresolved: the target catalog records why public modification/redistribution is not currently cleared.

Current genuine evidence is the machine-readable [radare2 function inventory](benchmarks/native-windows-ports/gconv/analysis/gconv-functions-radare2.json), [static analysis note](benchmarks/native-windows-ports/gconv/analysis/static-analysis.md), retained [imports/exports](benchmarks/native-windows-ports/gconv/analysis/), and [existing differential receipt](benchmarks/native-windows-ports/gconv/gconv-diff.txt). GConv is a console tool, and no runtime screenshot is claimed. The documented terminal records are the appropriate evidence until a reproducible runtime capture is added.

### Engineering validation fixtures (not legacy-support case studies)

The following earlier comparisons help validate specific analysis and comparison plumbing, but are weak evidence for maintenance of unsupported proprietary applications: the Calculator is an actively supported Apple app; TicTacToe and Luhn are managed examples; and the Batch 1/Batch 2 native samples are open-source projects. They remain in the repository as transparent engineering fixtures and their original reports are preserved. Do not present them as proof that RE-Agent found and repaired a defect in closed-source legacy software.

#### Software and game: exact measured fixture comparisons

| Target                                                                             | Result                                                                                                     | Proof                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LTRData Luhn utility, reconstructed from its published .NET binary                 | **5/5 suites: identical terminal bytes**, 230 numeric/Unicode lines plus mode, usage and termination cases | [Report](docs/verification/rea-engine/luhn-report.json), [complete execution evidence](docs/verification/rea-engine/software-execution-evidence.zip), [reconstructed executable](benchmarks/luhn/replica/Replica.dll)                                                                     |
| Published TicTacToe-AI Windows managed game, rebuilt from recovered code/resources | **19,683/19,683 board configurations: identical observed state bytes; 6/6 frames: identical PNG bytes**    | [Report](docs/verification/rea-engine/game-report.json), [complete execution evidence](docs/verification/rea-engine/game-execution-evidence.zip), [original executable](benchmarks/tictactoe/original/TicTacToe.exe), [rebuilt executable and source](benchmarks/tictactoe/reconstructed) |
| Native branch validation fixture                                                   | 25/25 declared cases after repair                                                                          | [Report](docs/verification/rea-extended/fixture-report.json)                                                                                                                                                                                                                              |
| Installed Apple Calculator                                                         | 10/10 final numeric-display comparisons in the recorded smaller suite                                      | [Report](docs/verification/rea-extended/calculator-report.json); complete UI and expanded suite remain unverified                                                                                                                                                                         |

**These results prove exact equality of the listed captured bytes, not byte-identical executable files or universal equivalence.** Every original/replica executable hash differs. The game comparison exhausts the defined board input space for its win/draw function; AI, RNG, all menus, timing and whole-game behavior remain unverified. The Windows managed artifacts ran on macOS .NET/Mono; this is not proof of native Windows OS execution or native AppKit port fidelity.

The analysis used REA's `inspect-managed-members`, `import-managed-reconstruction` and `capture-process` workflows, with ILSpy recovery and real compilation. The host coding agent operated the engine; no model API key was required. Game source was recovered from the binary, not consulted from the original repository. A pinned original source archive was subsequently retained solely for GPL redistribution obligations. The independent software implementation preserves a recovered quirk: checksum parity counts UTF-16 string length, including punctuation.

#### Software capture proof viewer

This is an actual screenshot of the engine's proof viewer, captured through REA's owned browser scenario after recomputing the supplied terminal-file hashes. It shows recorded original/replica CLI output; it is not an original-app GUI screenshot. [Browser evidence and verified cleanup](docs/verification/rea-engine/proof-browser-evidence.json).

![Engine software byte-comparison proof viewer](docs/verification/rea-engine/software-proof-view.png)

#### Actual original and rebuilt game renders

These are actual `Form.DrawToBitmap` renders after the same button-handler sequence on the same Mono/X11 runtime. They are not Windows desktop screenshots. Their PNG SHA-256 is identical: `67673e4f3536084732a35c6da809ea5a69ea89afb0f336c3870a9b0baaa855be`.

| Original compiled game                                                          | Rebuilt game                                                                  |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ![Original game rendered frame](docs/verification/rea-engine/game-original.png) | ![Rebuilt game rendered frame](docs/verification/rea-engine/game-replica.png) |

[Interactive proof report](docs/verification/rea-engine/index.html) · [Reproduction and scope](benchmarks/README.md) · [artifact SHA-256 inventory](docs/verification/rea-engine/manifest.json)

### Installed tools versus distributed tools

Development health checks confirmed Frida 17.23.3, LIEF 1.0.0, Z3 5.1.0.0, Capstone 5.0.9 and Pillow 12.3.0. Ghidra/radare2 and native compilers are reused locally. **Bundled now:** the signature-verified ILSpy package and the built X11 libgdiplus library with source and licenses. The [preview release](https://github.com/heaven-hm/rea-engine/releases/tag/engine-preview-2026-10-13) also carries the checksum-verified, unmodified Ghidra 12.1.2 archive; see its [manifest](third_party/ghidra/manifest.json). **A clone does not contain every installed external tool binary.** The installer and offline bundle builder are shipped in source; generated local bundles are not a license-approved public distribution. Frida/LIEF native dependency source and license coverage require further audit. Optional licensed tools and Apple Calculator are not redistributed. See [tool profiles and limitations](docs/autonomy-tool-bootstrap.md).

# Binary-first port fixtures (Batch 1; not closed-source legacy case studies)

Independent macOS reconstructions and one explicitly blocked investigation of
six MIT-licensed native Windows targets, recovered binary-first with REA (no
original source consulted). Five Windows originals and the available macOS
replicas are committed under
`benchmarks/native-windows-ports/` with manifests, goldens and reports.

| Target                | Original (Windows x64)                                           | macOS port                                     | Status                                         |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Snake v1.1.0          | `original-binaries/snake-windows-x86_64.exe` (55KB)              | `snake/replica/snakemac` (C, terminal)         | Structural frame parity                        |
| PixelTetris v1.0.0    | `original-binaries/Pixeltetris.exe` (1.1MB, SDL2)                | `pixeltetris/replica/pixelmac` (C, SDL2)       | Menu corrected to near-identity; gameplay live |
| Tetris v1.0.0         | `original-binaries/Tetris.exe` (2.2MB, SDL2)                     | `tetris/replica/tetrismac` (C, SDL2)           | Menu + gameplay screenshots verified           |
| legacy-notepad v1.2.1 | `original-binaries/legacy-notepad-x64.exe` (263KB, Win32)        | `notepad/replica/notepadmac` (Swift, AppKit)   | Unicode window + save-bytes verified           |
| Clipjar v1.2.0        | `original-binaries/clipjar.exe` (5.3MB, Rust)                    | `clipjar/replica/clipjarmac` (Swift, menu-bar) | SQLite capture/persist/dedupe PASS             |
| imgview v0.3          | `original-binaries/imgview64.exe` (UPX stub, unpacked upx 5.2.1) | `imgview/replica/imgviewmac` (Swift, AppKit)   | PNG render verified                            |

## Port evidence

Tetris macOS port, live menu + gameplay windows:

![tetrismac menu](benchmarks/native-windows-ports/screenshots/tetrismac-menu.png)
![tetrismac gameplay](benchmarks/native-windows-ports/screenshots/tetrismac-play.png)

Notepad macOS port, live Unicode window:

![notepadmac window](benchmarks/native-windows-ports/screenshots/notepadmac-hello.png)

PixelTetris macOS port, live menu + gameplay windows:

![pixelmac menu](benchmarks/native-windows-ports/screenshots/pixelmac-menu4.png)
![pixelmac gameplay](benchmarks/native-windows-ports/screenshots/pixelmac-play.png)

Snake: 26-line terminal frames byte-identical modulo RNG cells
(`snake/original-run0.txt`); Clipjar: synthetic capture → SHA-256 row,
restart persistence and hash-dedupe verified against live SQLite.

See `benchmarks/native-windows-ports/reports/` (license audit, binary
analysis, functional results, limitations). Whole-executable identity is
not claimed; unverified items are listed per target, not hidden.

## Native Binary Reconstruction — Benchmark Batch 2

Batch 2 also uses published compiled binaries, but its targets are openly
licensed projects. They are useful pipeline benchmarks, not evidence of
maintaining closed-source legacy products. Their results below remain scoped
to the listed features.

The complete app/game inventory across managed examples, Batch 1 and Batch 2 is in the [package-checked benchmark catalog](benchmarks/catalog.json), with per-target implementation and evidence links in the [benchmark index](benchmarks/README.md).

**Current result: incomplete; all six application-level results are UNVERIFIED.**
All six requested official Windows assets were downloaded, publisher SHA-256
verified, and actual native x64 PE executables inventoried. No upstream
implementation source was used. Originals and runtime assets stay private.

| Target                    | Windows release and binary                                                                                                                 | macOS reconstruction                                                                                         | Functional comparison                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| OpenLieroX — C++ game     | [20260912.1 ZIP](https://github.com/openlierox/openlierox/releases/download/20260912.1/openlierox-20260912.1-windows.zip)                  | Unimplemented                                                                                                | UNVERIFIED                               |
| SuperTux — C++ game       | [v0.7.0 portable ZIP](https://github.com/SuperTux/supertux/releases/download/v0.7.0/SuperTux-v0.7.0-win64-portable.zip)                    | Unimplemented                                                                                                | UNVERIFIED                               |
| The Powder Toy — C++ game | [v100.1.400 EXE](https://github.com/The-Powder-Toy/The-Powder-Toy/releases/download/v100.1.400/powder-v100.1.400-x86_64-windows-mingw.exe) | Unimplemented                                                                                                | UNVERIFIED                               |
| ripgrep — Rust utility    | [15.2.0 ZIP](https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-x86_64-pc-windows-msvc.zip)                     | Independent C++17 macOS subset; 7/8 retained CrossOver observations match after path-separator normalization | PARTIAL feature / application UNVERIFIED |
| fd — Rust utility         | [v10.5.0 ZIP](https://github.com/sharkdp/fd/releases/download/v10.5.0/fd-v10.5.0-x86_64-pc-windows-msvc.zip)                               | C++ ARM64 candidate; 2 raw, 9 normalized search cases pass                                                   | PARTIAL feature / application UNVERIFIED |
| bat — Rust utility        | [v0.26.1 ZIP](https://github.com/sharkdp/bat/releases/download/v0.26.1/bat-v0.26.1-x86_64-pc-windows-msvc.zip)                             | C++ ARM64 candidate; 8/8 plain-output cases pass                                                             | PARTIAL feature / application UNVERIFIED |

Original executable SHA-256 values, distinct from release archive hashes:

| Target         | Original PE SHA-256                                                |
| -------------- | ------------------------------------------------------------------ |
| OpenLieroX     | `0f79c968ab9aabd8cb99e173500fa241e883846fd3e0c9ca2f7f0bf3771fa5c1` |
| SuperTux       | `6249f25a6ac1cc3d27955ca09852b8368618ce58ad9c13e0c5084051c2c02b43` |
| The Powder Toy | `df32b616b31dabae10b82028731ebdfd6867c872198b81f29d418cbafbf460c3` |
| ripgrep        | `14231169855ec5205cf5a1b6f1db358ff4aed4247c86b69ce8aae647c77f6680` |
| fd             | `d67d27a8e375ed7e9bca2b506a9dd5082bc24547aeba908b863f6f8b8ab0c3b9` |
| bat            | `9ea9f7ab1c27aa5c9390e91543f9f47c6bd17bc53f3e30ac9db762f28f55c4fd` |

**Actual capabilities used:** existing REA MCP/Ghidra workflows and PE resource
Evidence, installed compilers, tool health inventory, owned process supervision,
and the existing autonomous controller's checkpoint creation/reopening. Deep
analysis timed out or was cancelled under host memory/disk pressure. No Batch 2
native function recovery is verified. Original utility probes through CrossOver
timed out; actual Windows OS behavior remains unverified. The controller also
rejected a compatibility launcher that differed from its hash-bound target.

**New extension:** a reusable bounded file differential benchmark runner compares
exact output-file bytes, diagnostics and exit outcomes in independent workdirs.
Its infrastructure tests use actual child processes; they are separate from
application fidelity tests. Windows workers, complete native recovery, FLOSS/capa
integration and game reconstruction remain future work.

Receipt-derived records currently contain **23 completed utility comparisons:
10 raw byte/exit passes, 13 raw differences, and 9 additional fd search cases
that pass only under declared path/order normalization**. fd has 2 raw passes
among 15 cases; bat has 8/8 raw passes for its declared plain-output cases.
These are feature-level results; all six Batch 2 applications remain PARTIAL
or UNVERIFIED overall. fd has a completed bounded repair loop, while gameplay,
game screenshots, original Windows OS execution, whole-application equivalence
and formal proofs remain unavailable. See the
[receipt-derived Batch 2 summary](benchmarks/native-batch-2/README.md) and
[target reports](benchmarks/native-batch-2/reports/).

[Full Batch 2 report](benchmarks/native-batch-2/reports/batch-2-overview.md) ·
[binary/import inventory](benchmarks/native-batch-2/reports/binary-inventory.json) ·
[license audit](benchmarks/native-batch-2/reports/license-audit.md) ·
[native build/execution results](benchmarks/native-batch-2/reports/macos-build-results.md) ·
[functional cases](benchmarks/native-batch-2/reports/functional-tests.json) ·
[measured metrics](benchmarks/native-batch-2/reports/performance-results.json) ·
[visual evidence status](benchmarks/native-batch-2/reports/visual-comparisons.md) ·
[known blockers](benchmarks/native-batch-2/reports/known-limitations.md)

## Build and use this repository

```sh
git clone https://github.com/heaven-hm/rea-engine.git
cd rea-engine
npm ci
npm run build:cached
node scripts/print-mcp-config.mjs /absolute/path/to/target --local
node scripts/rea.mjs --help
```

Use the printed local MCP configuration with your host coding agent and the built packaged skill. A published upstream npm package is not this fork. The implementation retains compatible command names while the product identity is Reverse Engineering Engine.

Setup supports [configured coding agents](docs/installation.md#supported-agents). Other MCP clients can use the [manual MCP registry instructions](docs/installation.md#mcp-registry).

## Documentation

- [Autonomous reconstruction and host-agent workflow](docs/autonomous-reconstruction.md)
- [Executed benchmarks and reproduction](docs/autonomous-reconstruction-benchmark.md)
- [Static/runtime tool bootstrap and offline bundles](docs/autonomy-tool-bootstrap.md)
- [CLI and evidence](docs/cli.md)
- [Ghidra provider](docs/ghidra-provider.md)
- [Managed .NET analysis](docs/managed-code-analysis.md)
- [MCP contracts](docs/mcp-contracts.md)
- [Generated MCP tool catalog](docs/mcp-contracts.md#generated-catalog)
- [Licensing](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)

Report issues and contribute at [heaven-hm/rea-engine](https://github.com/heaven-hm/rea-engine).

Latest validation: the complete managed benchmark command passed again with verified owned-display cleanup. The focused autonomy regression batch passed 37 tests with 2 skipped; type and lint checks passed. [Execution logs and checksum inventory](docs/verification/rea-engine/manifest.json). These are scoped development checks, not certification of all REA capabilities.
