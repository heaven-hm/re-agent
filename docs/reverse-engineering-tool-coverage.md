# Reverse-engineering tool coverage

This page separates RE-Agent operations that are part of the source tree from
optional host tools, local development installs, and work that is still only a
proposal. Installing a tool does not automatically register it as an RE-Agent
operation. A provider counts as integrated here only when its adapter is wired
to the shared CLI/MCP workflow and produces retained Evidence.

## Current capability map

| Analysis area                          | Integrated in RE-Agent                                                                                                                     | Depends on the host                                                                  | Limits                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static native analysis                 | Ghidra provider; read-only Hopper and IDA provider adapters; native artifact inspection; PE/ELF/Mach-O and other format-specific workflows | Ghidra is bring-your-own; Hopper and IDA are proprietary and optional                | Provider support, language coverage, symbols, and decompiler output vary by target. A discovered function is an analysis result, not proof of complete function recovery. |
| Managed analysis                       | Execution-free PE/CLI metadata inspection and member analysis                                                                              | ILSpy package/profile and runtime dependencies                                       | Managed analysis does not execute the target and is not a native Windows runtime test.                                                                                    |
| Dynamic analysis                       | Owned-process workflows, native call observation, Frida-backed trace correlation, process capture, browser and native UI scenarios         | OS permissions, compatible Frida device/runtime, LLDB, or browser installation       | Instrumentation is platform- and target-dependent. An unavailable hook is reported as unavailable; memory writes are not part of the ordinary observation workflow.       |
| Memory and state evidence              | Process snapshots, native call argument observations, selected state and file observations                                                 | Compatible operating-system process APIs and permissions                             | These capture selected observable state. They do not establish whole-process equivalence or recover all memory semantics.                                                 |
| Symbolic and differential verification | Bounded Z3 checks for supported scalar expressions; independent differential tests, regression evidence, and bounded repair workflows      | Z3 and a runnable original/replica pair                                              | Formal results apply only to the extracted expression and explicit assumptions. Test-suite agreement is empirical, not universal equivalence.                             |
| Game-specific verification             | General binary, process, UI, image, and differential workflows can support selected game investigations                                    | Game assets, graphics/audio capture tools, input devices, and often a Windows worker | No universal gameplay, physics, rendering, or audio equivalence provider is present. Cross-platform screenshots alone are not an engine proof.                            |

The existing interfaces and evidence model are documented in the
[Ghidra provider guide](ghidra-provider.md),
[autonomous tool bootstrap guide](autonomy-tool-bootstrap.md), and
[verification reports](verification/).

## Adapters not currently exposed as public RE-Agent operations

The working tree may contain experimental or incomplete adapter code. It is
not a supported operation until its input/output contracts, provider
composition, CLI/MCP exposure, lifecycle tests, and a real-tool verification
lane are complete. In particular, CAPA and radare2 source drafts must not be
described as registered engine capabilities until those gates pass.

This distinction is important because upstream tools do different jobs:

- [radare2](https://github.com/radareorg/radare2) provides static disassembly,
  analysis, debugging, and scripting. Its official documentation describes
  JSON output and `r2pipe`; an RE-Agent adapter must still constrain accepted
  commands and preserve target/evidence identity.
- [Mandiant CAPA](https://github.com/mandiant/capa) matches static or supported
  sandbox-report features against rules. Its JSON output is a capability
  hypothesis set; unmatched behavior is unknown, not absent.
- [Frida](https://frida.re/docs/modes/) supports injected, embedded, and
  preloaded instrumentation. Because injection can affect a target process,
  each workflow needs explicit target selection, bounded lifetime, and cleanup
  evidence; its existence on a host is not proof of an RE-Agent integration.
- [Ghidra headless analysis](https://github.com/NationalSecurityAgency/ghidra/blob/master/GhidraDocs/GettingStarted.md)
  can batch-analyze binaries. RE-Agent's current Ghidra contract remains the
  supported path; a duplicate Ghidra MCP server is not needed merely to add
  another frontend.

## Development-host snapshot

Observed on macOS Apple Silicon on 2026-10-15 using `command -v` and version
probes. This is a local host snapshot, not a release manifest or a statement
that these tools ship with a clone.

| Tool                                          | Host observation                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ghidra                                        | `ghidraRun` resolves to Homebrew Ghidra 12.1.2                                                                             |
| radare2                                       | `r2` reports 6.2.0                                                                                                         |
| LLDB                                          | `/usr/bin/lldb`, version `lldb-1600.0.39.109`                                                                              |
| ripgrep                                       | `rg` reports 15.2.0                                                                                                        |
| Capstone                                      | Python package 5.0.9 in the system Python probe                                                                            |
| Pillow                                        | Python package 12.3.0 in the system Python probe                                                                           |
| Frida CLI, GDB, CAPA CLI, YARA, RenderDoc CLI | Not found on the probed `PATH`                                                                                             |
| Frida, LIEF, Z3, angr                         | Not found in the probed system Python; a separate bootstrap environment is documented in `docs/autonomy-tool-bootstrap.md` |

The tool bootstrap report in that guide records verified wheel provenance and
smoke-test outcomes for its own environment. Do not combine that report with
this system-Python snapshot as if they came from the same installation.

## Evidence required before marking an integration complete

For each adapter, retain:

1. The exact input artifact SHA-256 and the external tool path, version, and
   executable SHA-256.
2. A real provider request through the supported RE-Agent CLI or MCP surface.
3. The complete request outcome, process exit status, bounded stdout/stderr,
   cleanup result, and resulting Evidence identity.
4. Tests for malformed output, cancellation, artifact mutation, output limits,
   and cleanup failure at the production boundary.
5. A statement of what the tool did not establish.

Passing a schema test or showing that a tool is installed does not satisfy
these integration checks.
