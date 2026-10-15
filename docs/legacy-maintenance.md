# RE-Agent legacy maintenance

RE-Agent extends the existing REA codebase. It reuses static providers, Frida/runtime and process capture, evidence storage, reconstruction checkpoints and bounded build/test/repair. Codex, Claude Code or another connected coding agent supplies reasoning and source generation. No second MCP server or model API subscription is required for the hosted workflow.

## Start a scoped investigation

Build the source checkout, then run:

```sh
node scripts/rea.mjs maintenance-skills
node scripts/rea.mjs maintenance-plan request.json
```

After a local package install, `re-agent` is the primary executable. `rea`, `rea-engine`, `rea-extended` and `rea-agents` remain aliases. The existing `rea` MCP registration key, `rea.json` configuration and `REA_*` environment variables are retained for compatibility. The renamed npm/MCP registry metadata does not establish that a package has been published.

A request selects a real local regular file (up to the current 256 MiB preparation budget):

```json
{
  "schema_version": 1,
  "target_path": "/absolute/path/to/original.exe",
  "target_kind": "game",
  "target_platform": "macos",
  "support_status": "end-of-life",
  "support_evidence": [
    "publisher end-of-support notice or documented reference"
  ],
  "authorization": {
    "basis": "written-permission",
    "reference": "permission and permitted scope"
  },
  "goal": "Reproduce and repair the startup crash in an independent macOS port",
  "max_repair_iterations": 3
}
```

Authorization and support references are caller attestations, not independently verified legal conclusions. `target_platform` selects the intended repair/port platform; record the original execution platform separately in actual captures.

## Modular hosted workflow

`maintenance-skills` automatically discovers bundled skill manifests and explicitly selected community roots. `maintenance-plan` hashes the request and target, selects applicable skills and returns the ordered stages: triage, static analysis, runtime analysis, memory analysis, repair/port, verification and release. It reports missing stages and rejected skills as INCOMPLETE. Read the returned SKILL.md paths and use their actual advertised tools. Discovery never executes skill code.

The plan prepares work for the host agent; it does not itself discover bugs or generate a port. The host follows the skills to reproduce issues, collect evidence, implement authorized changes and verify regressions. Use the existing `autonomy-run`/MCP investigation controller for plans it supports, bounded by its existing contracts; preparing a skill plan does not expand that controller's algorithm-recovery coverage. There is no claim of an unattended universal repair service.

Record a real issue only after reproducible evidence. Track static candidates separately. Preserve failures and original bytes, fix in a replica workspace, compare against the original, reject regressions and checkpoint. Requested new features are intentional differences and cannot count as vanilla equivalence.

## Execute a bounded controller plan

`re-agent maintenance-run request.json controller-plan.json checkpoint.json` validates the legacy request and skills, checks that the existing controller plan names the same target and stays within the declared retry budget, then delegates to the existing reconstruction/build/compare/repair controller. Use `--resume` with the controller's existing checkpoint constraints. Controller plans remain explicit executable authority; skill text never becomes an automatic shell command. Inspect the commands and worker scope as part of the authorized task. This is not an OS sandbox.

The controller supports its existing plan/reconstruction contracts. Host-generated repairs use the connected coding agent; the existing optional model backend remains optional. A `suite-passed` result applies only to the controller's declared test cases. It does not establish whole-game or whole-application equivalence.

## Runtime and memory

Use existing process supervision, Frida, debugger, UI or browser tools according to actual host availability and authorization. Bind process start identity, image hash, working directory and asset hashes. A Windows worker or CrossOver observation is not proof of a native macOS executable. OS permissions remain required.

`memory-snapshot-pattern snapshot.bin "48 8B ?? 90" --max-matches 20` searches captured bytes with the adapted MIT scanner from cheat-agent. It returns the file digest, offsets, examined bytes and truncation; it does not attach to a process or write memory. Inputs over 64 MiB are rejected explicitly. Invalid bytes and all-wildcard patterns are rejected rather than silently broadened. Offsets do not prove field semantics or live addresses.

## What verification means

| Claim                         | Required evidence                                                         |
| ----------------------------- | ------------------------------------------------------------------------- |
| Byte-identical artifact       | Complete compared file bytes/hashes for the declared artifacts            |
| Observed behavior matches     | Identical declared inputs/initial state and measured matching observables |
| Test-suite equivalence        | Every declared case passes; missing/unrun cases stay unknown              |
| Function proof                | Solver result linked to recovered expressions and bounded assumptions     |
| Whole-application equivalence | Complete justified scope; finite-suite success alone is insufficient      |

Use existing `compare_process_captures`, `compare_artifacts`, conditional Z3 checks and controller comparisons where applicable. Normalize only stated platform differences. Native ports across OS/ISA generally have different instruction bytes. Compare state transitions, outputs, files, exit codes and relevant physics/render/audio/events rather than calling their binaries byte-identical. Compilation, process liveness and screenshots do not establish equivalence.

## Host support

The TypeScript catalog/planner and snapshot scanner are portable across the package's supported Windows/Linux/macOS Node hosts. Individual providers, debuggers, UI APIs and worker tools have their own platform requirements. This change is verified on the available macOS host; Windows/Linux execution of the new workflow remains unverified until tested there. No universal cross-platform reconstruction claim is made.
