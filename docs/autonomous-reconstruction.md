# Autonomous reconstruction in REA

REA now includes a bounded reconstruction controller shared by its CLI, MCP server and local dashboard. It discovers functions through existing static providers, generates experiments, captures original and replica execution, builds candidate source, compares declared behavior and applies or rolls back repairs. Checkpoints retain canonical REA evidence and regression case IDs.

The demonstrated native validation reconstructs a constrained integer transformation. Full proprietary desktop reconstruction, autonomous game reconstruction and universal equivalence remain unverified. The separate [benchmark report](autonomous-reconstruction-benchmark.md) describes actual execution and its limits.

## Run and control an investigation

Build this checkout with `npm ci` and `npm run build:cached`. Use the existing `rea` executable, or replace `rea` with `node scripts/rea.mjs` when running directly from the checkout.

```sh
rea autonomy-tools --json
rea autonomy-run /absolute/path/plan.json /absolute/path/checkpoint.json --json
rea autonomy-status /absolute/path/checkpoint.json --json
rea autonomy-pause /absolute/path/checkpoint.json --json
rea autonomy-run /absolute/path/plan.json /absolute/path/checkpoint.json --resume --json
rea autonomy-stop /absolute/path/checkpoint.json --json
rea autonomy-ui /absolute/path/plan.json /absolute/path/checkpoint.json
```

`autonomy-ui` returns a loopback dashboard URL. Its controls use the same workflow and checkpoint as the CLI. Pause and stop requests reach the active investigation through its persisted owner control channel. Resume requires the same original binary and declared plan identity; a stopped investigation cannot resume. Use a fresh checkpoint for a new investigation.

The MCP operation is `autonomous_investigation`. Its actions are `start`, `resume`, `status`, `pause`, `stop`, `tools` and `prove-affine`; start and resume require local `plan` and `checkpoint` paths. Proof additionally requires source, output directory and range. Other investigation actions require `checkpoint`; tools needs neither.

```json
{
  "action": "start",
  "plan": "/absolute/path/plan.json",
  "checkpoint": "/absolute/path/checkpoint.json"
}
```

## A reproducible plan without a model

The built-in `piecewise-affine` policy derives an initial affine hypothesis and, after mismatches, investigates a second branch around zero. It requires C, a declared integer range and static evidence. It supports a specific hypothesis class; it does not recover arbitrary native algorithms.

Create an authorized native target, create a writable reconstruction workspace and replace `/absolute/...` below with real local paths. `sourcePath` is relative to that workspace; compiler arguments are explicit vectors, executed without shell interpolation.

```json
{
  "investigation": {
    "binaryPath": "/absolute/original",
    "workspace": "/absolute/workspace",
    "original": { "command": "/absolute/original", "arguments": [] },
    "replica": { "command": "/absolute/workspace/replica", "arguments": [] },
    "build": {
      "command": "clang",
      "arguments": [
        "-O2",
        "/absolute/workspace/replica.c",
        "-o",
        "/absolute/workspace/replica"
      ]
    },
    "cases": [],
    "maxIterations": 3,
    "timeoutMs": 120000,
    "dimensions": ["terminal", "interaction"]
  },
  "analysis": { "provider": "ghidra", "maxFunctions": 2 },
  "experiments": {
    "range": { "min": -1000000, "max": 1000000 },
    "count": 25,
    "seed": 61
  },
  "reconstruction": {
    "policy": "piecewise-affine",
    "sourcePath": "replica.c",
    "language": "C",
    "objective": "Recover a single-integer CLI transformation from static evidence and runtime observations",
    "range": { "min": -1000000, "max": 1000000 }
  }
}
```

`cases: []` is valid in a plan with generated experiments. Seeded generation covers endpoints, neighboring boundary values and zero where the range permits, then fills the finite budget. Explicit cases use `{ "id": "case_1", "arguments": ["12"], "stdin": "optional input" }`. Case arguments follow each executable's configured arguments.

`maxIterations`, process timeout, output limit and model token/timeout settings bound resource use. A failed candidate build or regression rolls source bytes back; successful repair preserves the source and continues. `suite-passed` means the declared evidence-supported dimensions passed the finite suite. `budget-exhausted` means further investigation is needed.

## Model reconstruction

For model reconstruction, replace the example's reconstruction settings with a `model` policy and add a model configuration. Supply both together and retain `analysis` so the model receives static evidence.

```json
{
  "model": {
    "provider": "openai",
    "model": "YOUR_AVAILABLE_MODEL_ID",
    "credentialEnvironmentVariable": "OPENAI_API_KEY",
    "timeoutMs": 60000,
    "maxOutputTokens": 8192
  },
  "reconstruction": {
    "policy": "model",
    "sourcePath": "replica.c",
    "language": "C",
    "objective": "Recover the observed authorized target behavior; cite evidence IDs and mark uncertain behavior"
  }
}
```

Credentials are read from the named environment variable when a request is made. Put no API key in a plan or checkpoint. Default credential variables are `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY` and `REA_LOCAL_API_KEY`. Provider values are `openai`, `anthropic`, `google`, `openrouter` and `local`. An optional `baseUrl` selects an endpoint; HTTPS is required except for local loopback HTTP. The local default is `http://127.0.0.1:11434/v1`.

Provider adapters have contract tests. No live cloud or local model reconstruction was executed during the reported benchmark. Configure a model identifier available to your account; the example makes no availability claim.

Language values include `C`, `C++`, `Rust` and `C#`. The model generates source in that language; the caller supplies its actual build and launch commands. For C++, a typical vector is `clang++ ["source.cpp", "-o", "replica"]`; Rust uses `rustc ["source.rs", "-o", "replica"]`; C# normally uses a prepared project with `dotnet ["build", "project.csproj", "-o", "build"]`, then `dotnet ["build/Replica.dll"]` for the replica command. Project creation and language runtime installation are separate prerequisites. Only the C reconstruction/build path was validated here.

## Platform installation profiles

| Profile             | Prerequisites and configuration                                                                                                                                               | Observed status                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| macOS Apple Silicon | Supported Node.js/npm, installed Clang and Swift command-line tools, optional LLDB, installed Ghidra and compatible JDK; Accessibility and Screen Recording for native UI     | Real arm64 native fixture compilation, process capture, repair and Calculator observation/interaction completed |
| Linux x64           | Supported Node.js/npm, C/C++ compiler, installed Ghidra/JDK; reuse GDB, radare2 or other tools reported healthy; configure native desktop providers supported by existing REA | New autonomy workflow not executed on Linux in this report                                                      |
| Windows x64         | Supported Node.js/npm, native compiler or .NET SDK, installed Ghidra/JDK; reuse existing REA Windows capabilities and provider admission rules                                | New autonomy workflow not executed on Windows in this report                                                    |

For configured static analysis, the autonomy workflow searches standard installation locations and reuses compatible Ghidra/JDK installations through existing REA compatibility checks. Explicit environment settings are preserved. You can set `GHIDRA_INSTALL_DIR` to its actual distribution directory and `JAVA_HOME` to its compatible JDK. The validated local installation used:

```sh
export GHIDRA_INSTALL_DIR=/opt/homebrew/opt/ghidra/libexec
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

See [Ghidra provider](ghidra-provider.md) and [installation](installation.md) for upstream requirements. These paths are examples for the observed host, not portable defaults.

`autonomy-tools` finds installations on PATH, probes their versions and reports existing REA provider readiness through its doctor workflow. A healthy version probe establishes executable availability; it does not establish a complete real analysis integration. Ghidra, Java, package managers and proprietary providers retain their existing bring-your-own policy. The additive pinned-executable installer accepts an explicitly trusted official HTTPS host, SHA-256, redistribution license and health arguments; it is not an automatic installer for every requested analysis engine. No proprietary tool is bundled or downloaded by this extension.

The npm package includes the benchmark verifier and authored C fixture. Existing package/platform boundaries remain in force. An isolated Windows worker fleet and a unified bundled distribution of all requested tools have not been implemented or tested.

## Evidence and acceptance status

Paths below are local ignored development outputs. Reproduce them with `npm run verify:autonomy`, `node scripts/verify-autonomous-reconstruction.mjs --calculator`, or the public plan workflow. Binary/function identities, experiment observations, captures, comparisons and verification records remain inspectable; raw evidence is not replaced by a fidelity percentage.

| Acceptance criterion               | Actual status and evidence                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REA extended successfully          | Implemented in existing application/composition/CLI/MCP modules; standalone native suite succeeded: `output/autonomy/reconstruction-1791837432410/report.json`                                 |
| Existing functionality preserved   | Existing workflows reused; targeted test coverage applies. Complete upstream/provider preservation across every platform is unverified                                                         |
| Automatic dependency discovery     | Implemented tool/architecture/version probes and existing doctor integration; `rea autonomy-tools --json`                                                                                      |
| Missing tools installed/configured | Pinned executable installer implemented; comprehensive live installation of the requested tool list unverified; installed RE tools reused                                                      |
| Static analysis                    | Real native fixture disassembly: `output/autonomy/reconstruction-1791837432410/transform-disassembly.json`; Calculator inventory: `output/autonomy/calculator-final/calculator-functions.json` |
| Dynamic analysis                   | Real process observations recorded. LLDB instrumentation attempt failed: `output/autonomy/native-call-evidence.json`; no successful argument tracing claim                                     |
| Native desktop computer use        | Real Calculator AX button discovery, click and post-action capture: `output/autonomy/calculator-final/calculator-rea-interaction.json`                                                         |
| Autonomous function discovery      | Installed radare2 discovered fixture and Calculator candidates; identities/disassembly recorded. Candidates are not verified signatures                                                        |
| Static/runtime correlation         | Unverified; the real LLDB attempt did not complete                                                                                                                                             |
| Reconstruction and compilation     | Independent inferred C compiled and executed: `output/autonomy/reconstruction-1791837432410/replica.c` and checkpoint                                                                          |
| Original and replica executable    | 60 real process captures across two iterations in `output/autonomy/reconstruction-1791837432410/investigation.json`                                                                            |
| Differential testing               | 15/15 declared standalone fixture cases passed after repair; canonical REA comparison and verification records retained                                                                        |
| Automatic mismatch repair          | One inferred repair; seven persisted regression cases; same standalone report/checkpoint                                                                                                       |
| Persistent evidence database       | Versioned persistent JSON checkpoint containing 90 canonical evidence records, results and history; dedicated SQL evidence database not implemented                                            |
| Agent checkpoint/resume            | Standalone checkpoint reopened successfully; interruption/rollback tests cover controller semantics; no general distributed multi-agent scheduler claim                                        |
| Model-provider abstraction         | Five provider adapters and contract tests; live provider reconstruction unverified                                                                                                             |
| Reproducible benchmark             | Repository verifiers execute finite native and proprietary result-display suites; full Calculator reconstruction remains incomplete                                                            |
| License compliance                 | REA MIT retained; authored fixture included; proprietary Calculator binary and third-party tools not redistributed. No comprehensive license audit of every requested engine                   |

The public CLI workflow in `output/autonomy/cli-profile-1791837799/` subsequently completed **25/25 automatically generated cases** in two iterations after the adapter's search parser was corrected and the failed checkpoint resumed. Installed Ghidra 12.1.2 discovered eight functions and produced two dossiers. The built-in numerical policy generated independent C from runtime experiments, compiled it, detected ten negative-input mismatches, repaired the sign branch, and retained ten regression cases. `checkpoint.json` contains 167 authenticated Evidence records, including 100 original/replica process captures and 50 comparisons. `report.json`, `result-resume.json` and the actual dashboard screenshot `output/autonomy/dashboard.png` provide the recorded results. This is a constrained authored native benchmark, not a Calculator reconstruction or universal equivalence proof.

The original target must be authorized. The controller executes the caller's original/build/replica vectors and writes only its declared reconstruction workspace, but it is not an operating-system sandbox for hostile code. Use an isolated host or VM for untrusted targets. Existing process ownership and audit/evidence semantics are preserved. Cloud model configuration explicitly sends selected evidence to that provider.

Timing normalization is declared separately from behavioral claims. Every case must also have matching observed exit codes, signals and termination reasons; a timeout or unsettled execution remains unknown. This mandatory outcome check excludes incidental settlement duration. Terminal/interaction success does not establish precise scheduling, memory, rendering, physics, animation, audio or network equivalence. Coverage-complete native behavior and game fidelity remain unverified.

The fresh proprietary Calculator result-display benchmark passed **10/10** held-out cases after eight real UI inference probes, independent Swift/AppKit source generation and compilation. Run `npm run verify:autonomy:calculator`; see `output/autonomy/calculator-reconstruction-1791873987375/report.json`. Full Calculator reconstruction remains incomplete.

The optional `autonomy-prove-affine` command and MCP `prove-affine` action compare evidence-linked extracted Ghidra and generated C scalar expressions with installed Z3. The recorded proof in `output/autonomy/cli-profile-1791837799/proof-z3/proof.json` returned `unsat` over [-1000000, 1000000], with explicit decompilation, compiler, correspondence and non-overflow assumptions. This is conditional expression equivalence, not a whole-binary proof.

The final reviewed Calculator comparison run again passed 10/10 with linked canonical comparison evidence in `output/autonomy/calculator-reconstruction-1791881265463/`. Its initially stale cleanup observation and separately successful corrected owned-process lifecycle test are documented in the benchmark report. Incomplete accessibility trees yield unknown; a failed comparison suite reports mismatches rather than an affirmative equivalence claim.

The final reviewed CLI run in `output/autonomy/cli-final-reviewed/report.json` passed 25/25 cases in two iterations with ten regression inputs and 217 authenticated records: 100 process captures, 50 output comparisons, 50 exit-outcome comparisons, eight discovered functions and two analyzed functions. Its first provider attempt failed; the retained checkpoint resumed successfully. Provider failures now retain their safe diagnostic projection in checkpoint history. The fresh live dashboard showed `suite-passed` and 25/25 without horizontal overflow. The installable local package was installed in an isolated directory and reopened the completed checkpoint; its CLI also executed real Z3.

## Coding-agent hosts and installed tools

Codex, Claude Code and other MCP clients can host the investigation using REA's existing server and shipped skill. A direct model API is optional. Generate a local checkout configuration with `node scripts/print-mcp-config.mjs TARGET --local`; it points to this checkout instead of the upstream npm release. The shipped skill reference describes the shared autonomy commands and conservative verification rules.

`rea autonomy-install-tools TARGET --json` runs the workspace-local official-wheel profile. `autonomous_investigation` also accepts `action: install-tools` with `binary`. Installed Python modules appear separately from executable probes in `autonomy-tools`; a healthy Frida module does not imply successful attachment. See [tool bootstrap and binary bundle](autonomy-tool-bootstrap.md). This profile does not install every requested platform engine.

`rea autonomy-trace-frida CONFIG --json`, or MCP `action: trace-frida` with `config`, runs a bounded owned-function experiment. The actual `node scripts/verify-frida-autonomy.mjs --gadget` run in `output/autonomy/frida-1791885038092/report.json` captured five calls to an automatically discovered authored function, with matching argument/return observations and runtime PID, module, ASLR slide and instruction-prefix correlation. The child exited and was reaped; the session, connection and private Gadget configuration were removed. Direct host attachment timed out, including against a debug-signed fixture, and remains unverified. The successful private preload profile does not establish support for hardened applications or complete game analysis.

The Calculator renderer now uses the measured native window dimensions, circular layout and palette. Ten original arithmetic cases passed with the redesigned renderer. Expanded comparisons confirmed decimal and sign cases, then exposed the original's pending percentage display (`8%`), which the earlier replica incorrectly reduced immediately. The model now retains that pending presentation. Full scientific/programmer modes, complete visual equivalence, all intermediate states and the percentage repair's complete replay remain unverified. Full Calculator reconstruction acceptance remains incomplete.
