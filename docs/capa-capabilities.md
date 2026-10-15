# Optional capa capability evidence

REA Engine exposes the same installed-engine operation through its CLI and existing MCP server:

```sh
export REA_CAPA_PATH=/absolute/path/to/capa
rea inspect-capa-capabilities /authorized/application.exe --format json
```

MCP: `inspect_capa_capabilities` with an absolute `path`, optional `backend` (`auto`, `vivisect`, or `pefile`), `timeout_ms`, `max_file_bytes`, and `max_output_bytes`. No additional MCP server, provider UI, proprietary backend, or model API is required. CLI options use `--timeout-ms`, `--max-file-bytes`, and `--max-output-bytes`.

This profile requires a compatible **native standalone capa distribution with packaged default rules**. Python/venv entry-point scripts are rejected because hashing a launcher alone cannot identify its separately installed rule/dependency files. A configured path only declares availability; each inspection validates the executable, health version, report version/static flavor, digest, format, and matching rule identities. Installation and public redistribution are separate workflows; the command does not download or upgrade tools.

## Meaning and bounds

The operation reads a stable regular PE/ELF source, analyzes a private copy through REA's existing owned process supervisor, and returns authenticated **derived** Evidence. It records source and tool SHA-256, provider version, extractor, selected backend, matched rule names/namespaces/scopes, and original location coordinate types. File-scope matches with `type: "no address"` preserve that omission. Match locations do not become verified functions or runtime addresses. Missing matches do not establish missing behavior.

The default source budget is 64 MiB (maximum 256 MiB), output budget 4 MiB (maximum 16 MiB), and analysis deadline 120 seconds (maximum 600 seconds). The version probe is separately bounded by the smaller of 30 seconds and the selected deadline. One inspection runs at a time. Bounds are never silently clamped. Cancellation, incomplete output, malformed reports, changed source/tool/snapshot bytes, and unconfirmed cleanup produce failures rather than passing partial results. Failed cleanup owners and snapshot roots remain available for retry during service shutdown. The supervisor controls parser processes; this is not a security sandbox for hostile parser inputs.

Successful MCP observations enter the existing session Evidence collection and can be exported with `export_evidence_bundle` and imported through the existing validated bundle workflow. Finite capability matches do not prove reconstructed behavior or byte equality.

## Free platform profiles

Official capa 9.4.0 standalone assets exist for Windows x64, Linux x64/ARM64, and macOS x64/ARM64. The repository and exact release license use Apache-2.0. Existing REA native process/snapshot ownership must also be supported on the selected host; Windows requires its established private-runtime DACL and owned-process support.

Only the macOS ARM64 asset was downloaded and health-tested here. Publisher SHA-256:

```text
119964afc348c80fff93ad8830124a0c55630f179906acb796636c0f8d410672
```

[Official release](https://github.com/mandiant/capa/releases/tag/v9.4.0), [exact release license](https://github.com/mandiant/capa/blob/v9.4.0/LICENSE.txt), and [evaluation/validation](verification/rea-engine/integration-evaluation-2026-10-14.md).

The original release archive contains one executable without separate dependency notices. Its download integrity and first-party license checks do not certify the entire embedded dependency distribution. The binary remains in ignored local output; it is not committed or claimed as a license-approved all-tools bundle. Linux and Windows runtime integration remain unverified until those workers run their real checks.
