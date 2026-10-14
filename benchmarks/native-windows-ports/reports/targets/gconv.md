# GConv QVM toolchain — observed script error behavior

**Overall status: PARTIAL.** A narrow, real-corpus error-output comparison passes for 120 scripts. The implementation is not a port of the full GConv application or QVM runtime.

## Inputs and implementation

- Original inputs are locally supplied Windows x86 `gconv.exe`, `gconvapi.dll` and `vqdll.dll`; the executable and DLLs are not included in this repository. Their hashes, corpus description and analysis are in [manifest](../../gconv/manifest.json) and [DLL analysis](../../../gconv/analysis-dll/README.md).
- Independent macOS implementation: [qvmtool.c](../../gconv/replica/qvmtool.c), [ARM64 executable](../../gconv/replica/qvmtool).
- Local original runtime captures and help bytes are indexed in [runtime report](../../../gconv/runtime/README.md).

## Evidence

The manifest reports **120/120** real IGI2 QVM scripts matching the observed unknown-identifier output lines and error counts. The line-level record is [gconv-diff.txt](../../gconv/gconv-diff.txt). `info` and linear `dis` are present as separate tool commands; the stated 120-case comparison concerns error behavior only.

No screenshot is claimed for this CLI target.

## Open behavior

Full bytecode execution, engine-native calls, and behavior beyond the tested error paths are unverified and out of scope of this comparison. The inputs are user-provided proprietary binaries and game scripts, not redistributable project assets.
