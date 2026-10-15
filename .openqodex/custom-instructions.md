# OpenQodex review instructions

## Repository context

RE-Agent is a TypeScript/Node CLI and MCP platform for authorized legacy software maintenance. The domain Evidence records are the source of truth; provider adapters and CLI/MCP layers must preserve their identity and limitations. Keep MIT licensing and existing attribution intact.

## Conventions to apply

- Review only behavior supported by the changed code and tests. Distinguish observed, derived, inferred, unknown, partial, and blocked results.
- Bind binary and process evidence to authenticated content hashes and provider identity. Paths and filenames alone do not establish binary identity.
- Validate persisted state at boundaries. Reject malformed, tampered, dangling, mismatched, or over-budget evidence rather than normalizing it into a passing result.
- Preserve uncertainty for unresolved mappings, incomplete coverage, and platform/provider gaps.
- Reuse existing CLI, MCP, Evidence, process ownership, and provider contracts; flag duplicate servers or unneeded parallel abstractions.
- Treat the repository's generated files, fixture-only behavior, and static-analysis outputs according to their existing ownership scripts.

## Always check

- Does each graph assertion cite valid Evidence for the graph's exact target hash?
- Do checkpoint migrations preserve legacy state while rejecting tampering and unsupported versions?
- Are process-capture comparisons tied to the exact executable identity recorded in the capture manifest?
- Are unresolved or native-provider facts represented as partial coverage when their provenance cannot authenticate them?
- Do CLI summaries and existing MCP status expose the same validated graph without registering a second server?
- Do tests cover rejection paths as well as successful projection, persistence, and resume?
- Do the report and PR distinguish tests actually run from baseline failures and platform work that is blocked or unexecuted?

## Never flag

- Do not call finite declared-scenario tests proof of universal application equivalence.
- Do not report unavailable Ghidra, radare2, clang, GUI, audio, Windows, or macOS execution as successful.
- Do not request closure of Issues #25–#28 from interface or graph-foundation work alone.
- Do not flag fixture-only findings unless they escape fixture scope into production behavior.
