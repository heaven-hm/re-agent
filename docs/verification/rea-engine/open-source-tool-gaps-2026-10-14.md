# Open-source reverse-engineering tool gaps — 2026-10-14

This is a read-only gap audit of the current REA Engine checkout. It identifies
candidate tools that may add materially distinct capabilities. **None of the
candidates below was integrated, installed, downloaded, built, or verified as
part of this audit.** A project-level open-source license does not establish
that a particular release archive, binary, plugin set, or dependency graph may
be redistributed. Audit the exact artifact and all included dependencies,
notices, source obligations, platform builds, and terms before packaging.

## Existing REA capabilities considered

The checkout already has a shared CLI/MCP server, canonical Evidence and
provider contracts, provider selection, and process supervision. Existing
analysis paths include Ghidra, IDA, and Hopper providers; Frida instrumentation;
LLDB native call tracing; native UI observation; browser/CDP and Playwright
capture; and process capture. The toolchain audit also records Z3 availability,
Capstone/LIEF probes, a bounded radare2 function-inventory provider, and an
unsuccessful angr wheel-only resolution. The current worktree adds a
caller-addressed `pdj` disassembly operation through the radare2 provider,
CLI, and MCP. Raw radare2 output on `/bin/ls` is preserved, but the REA
provider smoke failed during owned-process cleanup inspection (`spawn EPERM`).
CFG recovery, call-graph analysis, decompilation, and complete function
discovery remain unsupported or unverified. These bounded operations do not
establish full target analysis.
Current JavaScript symbolic support is narrow and is not a native binary
symbolic-execution provider. Z3 availability alone does not establish binary
equivalence checking.

Relevant integration points include:

- `src/application/AnalysisProvider.ts` — provider-neutral operations and
  Evidence-producing analysis executions.
- `src/composition/binary.ts` — binary provider composition and selection.
- `src/native/LldbCallTracer.ts` and `src/application/native/` — native
  function-call observations.
- `src/native/NativeUiObservation.ts` — native UI observations.
- `src/browser/` — existing browser observation and scenario support.
- `src/process/` — process supervision and capture ownership.
- `docs/frida-instrumentation.md` — existing Frida workflow and limits.
- `docs/autonomy-tool-bootstrap.md` and
  `docs/verification/rea-engine/toolchain-distribution-audit-2026-10-14.md` —
  current tool discovery, package, and redistribution findings.

New capabilities should extend those contracts and workflows. A duplicate
standalone MCP server is not needed merely to expose another tool.

## Prioritized gap matrix

| Priority                 | Candidate and distinct capability                                                                                                                                                                                                   | REA integration target                                                                                                                                                                  | Upstream license and technical limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**                    | **QBDI** — instruction-level instrumentation and memory-access observations, complementing Frida's API/function hooks and LLDB's breakpoint/call traces.                                                                            | Optional backend under the existing native investigation/provider workflow; preserve tool identity, target identity, limits, and observations in canonical Evidence.                    | Upstream identifies QBDI as Apache-2.0 and its license file enumerates additional linked components and licenses, including LLVM with LLVM exceptions, fmt/spdlog, Catch2, pybind11, and a SHA-256 implementation with GPLv3/Apache alternatives. Upstream lists Windows/macOS/Linux x86/x64 support and narrower ARM support. It also documents limits around new threads, signals, and C++ exceptions. Audit the exact selected build and dependency set. [Project/platforms](https://github.com/QBDI/QBDI), [license and dependency terms](https://github.com/QBDI/QBDI/blob/dev-next/LICENSE.txt)                                                    |
| **2 — restricted scope** | **RenderDoc** — GPU frame capture and graphics-resource, pipeline, and shader inspection. No RenderDoc or GPU frame-analysis integration was found in this checkout.                                                                | If approved for eligible targets, add an optional game graphics-capture provider that records trace identity and selected observations through existing process and Evidence workflows. | RenderDoc's upstream README says it is intended for debugging programs the user created and explicitly disallows discussion of capturing programs not created by the user, including commercial games. This makes it unsuitable as general support for third-party proprietary targets. Its documented API/platform matrix covers Windows, Linux, and Android; macOS and Metal are not listed as supported. The project is MIT-licensed, but third-party notices still need review. [README, policy, and support matrix](https://github.com/baldurk/renderdoc/blob/v1.x/README.md), [license](https://github.com/baldurk/renderdoc/blob/v1.x/LICENSE.md) |
| **2**                    | **Rizin** — an alternative native disassembly/debugging engine with structured output. REA has bounded radare2 `aflj` inventory and `pdj` disassembly operations, but no Rizin provider or general radare2 CFG/call-graph workflow. | If Rizin is evaluated, use the existing read-only `AnalysisProvider`, operation, provider-selection, and Evidence contracts; map only verified semantics and coverage.                  | The official repository reports LGPL-3.0 and GPL-3.0 components. Inspect the exact build, plugins, and dependency closure before bundling. Rizin overlaps existing Ghidra/IDA/Hopper analysis, so first establish the specific missing operations it would fill. Prefer caller-supplied installation until its package is audited. [Rizin repository and license metadata](https://github.com/rizinorg/rizin), [packager guidance](https://github.com/rizinorg/rizin/blob/dev/doc/PACKAGERS.md)                                                                                                                                                          |
| **3**                    | **apitrace** — graphics API call capture/replay and state inspection, including documented OpenGL and Direct3D APIs. This is distinct from UI screenshots and general process capture.                                              | Optional graphics-trace adapter using REA process supervision; retain raw trace identity and normalize only observed call/state facts into Evidence.                                    | The project identifies itself as MIT-licensed. Its documented Windows usage includes wrapper DLLs/interception, which requires target-scope, authority, and cleanup review under REA's contribution rules. API support varies by platform and graphics API; it is not universal. Inspect the release's third-party code and dependencies. [Project, capabilities, and license](https://github.com/apitrace/apitrace), [usage and API details](https://github.com/apitrace/apitrace/blob/master/docs/USAGE.markdown)                                                                                                                                      |
| **3**                    | **DynamoRIO** — dynamic code instrumentation, basic-block coverage, and instruction/memory traces. It overlaps QBDI, so evaluate one first against REA's target matrix.                                                             | Optional source of runtime coverage observations for differential experiments, with exact target identity and incomplete-coverage reporting.                                            | Upstream says the source is primarily under a BSD license; its README documents Windows/Linux/Android support and says macOS support is in progress. Release packages include tools/components whose exact notices must be audited. Native build and platform CI would be needed. [DynamoRIO repository, capabilities, and license links](https://github.com/DynamoRIO/dynamorio)                                                                                                                                                                                                                                                                        |
| **4**                    | **angr native symbolic execution** — the current checkout has no verified general native-binary symbolic-execution provider; its JavaScript symbolic support is narrow.                                                             | Qualify angr as an optional binary-analysis provider, recording loader support, path bounds, solver limits, and unknown behavior through existing provider/Evidence contracts.          | angr's project is BSD-2-Clause, but the previous host's wheel-only resolution failed on a dependency. That failure and the license of angr itself do not settle the full transitive/native dependency graph or cross-platform installation. [angr project and license](https://github.com/angr/angr)                                                                                                                                                                                                                                                                                                                                                     |
| **4**                    | **rr** — deterministic record/replay for supported native debugging sessions.                                                                                                                                                       | Optional Linux replay backend connected to existing process/session and LLDB workflows; persist replay identity and observations rather than treating a trace as complete proof.        | The repository's license file contains multiple license notices, and rr is Linux x86-64 focused with CPU/kernel constraints. Review all included third-party material and trace-distribution behavior. It is not a cross-platform solution. [rr project](https://github.com/rr-debugger/rr), [license file](https://github.com/rr-debugger/rr/blob/master/LICENSE)                                                                                                                                                                                                                                                                                       |
| **5**                    | **AFL++** — coverage-guided fuzzing could provide a native input-generation loop that is not established by the current Z3 smoke test.                                                                                              | Future test-generation backend feeding the existing differential-test and Evidence workflow, with explicit target authorization and resource bounds.                                    | AFL++ says the combined `afl-fuzz` binary is AGPL-3.0-or-later; individual files and bundled components can have different licenses. Resolve the exact files, dependencies, distribution obligations, and service use before bundling. It is not a low-risk permissive binary bundle. [AFL++ licensing overview](https://github.com/AFLplusplus/AFLplusplus)                                                                                                                                                                                                                                                                                             |

## Suggested order

For capability exploration, evaluate a bounded QBDI coverage/instruction-trace
workflow first, then a read-only Rizin provider if it demonstrates concrete
operations missing from the existing Ghidra/IDA/Hopper providers. Keep
RenderDoc restricted to projects covered by its stated use policy; do not list
it as general third-party game reverse-engineering support. Evaluate apitrace
only against explicitly approved graphics targets. Choose between QBDI and
DynamoRIO after measuring actual target/platform coverage rather than
integrating both by default.

## Scope and verification gates

The repository's `CONTRIBUTING.md` requires an explicit maintainer scope decision
before substantial integration of capabilities involving target execution,
injection, or mutation. This applies to QBDI, DynamoRIO, RenderDoc, apitrace, and
rr proposals. Such a decision must cover target authority, side effects,
cleanup, resource bounds, and real-provider verification. A license summary is
not legal approval: exact release artifacts and dependency notices must be
reviewed before redistribution. None of these candidates is integrated or
verified here, and none supports a claim of byte-identical or universally
equivalent reconstruction.
