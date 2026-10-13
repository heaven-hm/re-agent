# Autonomous reconstruction

Use the installed server's actual schema. This fork adds `autonomous_investigation` to the existing REA MCP server; do not create another server for capabilities REA already provides.

1. Bind the authorized original target and retain its digest and provenance.
2. Use `action: tools` to discover existing installations. Executable/module health is distinct from successful integration. Reuse installed tools.
3. If authorized dependencies are missing, `action: install-tools` with `binary` runs the workspace-local official-wheel profile. It records pinned hashes and health checks; failures/skips remain explicit. Ghidra/JDK reuse follows the existing provider compatibility policy. Proprietary tools are optional.
4. Discover functions through existing `search_procedures` and `analyze_function`. Prefer unknown executable code over imported stubs. Do not require guessed addresses from the user.
5. Generate a reconstruction plan with original/replica commands, a build command, declared cases and comparison dimensions. Use an explicit model provider if source generation needs a model. Keep model credentials in environment variables.
6. Use `action: start` with local `plan` and `checkpoint` paths. Inspect `status`, request `pause` or `stop`, and `resume` the same validated checkpoint. Original binary and argument-file digests bind the investigation.
7. Every mismatch becomes a regression input. Repair candidates must compile, pass targeted cases and preserve earlier passing behavior; rejected candidates roll back. Respect iteration/time/output budgets.
8. Use existing native UI/browser tools to capture real interactions. Compare the same abstract events, observable state, and screenshots. Do not replace an unknown application with hardcoded answers to declared cases.
9. `action: trace-frida` with a strict local `config` can investigate an owned native function. Static evidence, runtime module/path/slide and instruction-prefix correlation must support any observed function claim. The initial profile supports host-architecture 64-bit Mach-O and an owned target that remains alive until input is supplied. Failed attachment does not establish runtime observation.
10. `action: prove-affine` additionally accepts `checkpoint`, `source`, `output`, and `range`. It proves only supported extracted scalar expressions under explicitly named decompiler/compiler/correspondence/non-overflow assumptions. This is not whole-program binary equivalence.

CLI equivalents:

```sh
rea autonomy-tools --json
rea autonomy-install-tools /absolute/path/original --json
rea autonomy-run /absolute/path/plan.json /absolute/path/checkpoint.json --json
rea autonomy-status /absolute/path/checkpoint.json --json
rea autonomy-trace-frida /absolute/path/experiment.json --json
rea autonomy-ui /absolute/path/plan.json /absolute/path/checkpoint.json
```

Report separately: observed behavior, declared test-suite results, visual comparison, coverage gaps, conditional proofs, and exact binary identity. Equal final numeric results do not establish UI fidelity. Equal extracted expressions do not establish executable identity. A byte-identical claim requires actual complete-byte comparison or matching cryptographic digests over the same declared files; an independent reconstruction normally produces a different executable.

Use the shipped skill from Codex, Claude Code, or another compatible agent. Client installation does not grant target-execution authority, silently approve destructive operations, or prove unavailable capabilities.
