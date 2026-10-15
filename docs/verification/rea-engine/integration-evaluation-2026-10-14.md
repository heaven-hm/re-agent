# Optional reverse-engineering integrations evaluated on 2026-10-14

This evaluation compares official repositories and release/license metadata against the current REA Engine source and installed tool profile. Repository popularity or installation alone does not establish reconstruction or fidelity. No upstream target implementation source was read. No new MCP server or duplicate Ghidra/Frida integration was created.

## Decisions

| Official project                                                    | Observed license / role                                     | Current REA overlap                                                                                     | Decision                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Mandiant capa](https://github.com/mandiant/capa)                   | Apache-2.0; static executable capability rules              | New optional typed provider, service, CLI command, and operation on the existing MCP server             | Implemented and exercised on the authorized gconv PE; tool binary remains optional and is not bundled                        |
| [Mandiant FLOSS](https://github.com/mandiant/flare-floss)           | Apache-2.0; recover obfuscated/stack/decoded strings        | Existing Ghidra defined-string inventory does not recover all decoded strings                           | Useful issue #7 follow-up; add only when ordinary strings leave concrete uncertainty                                         |
| [angr](https://github.com/angr/angr)                                | BSD-2-Clause; symbolic analysis                             | Existing ToolDiscovery probes and official-wheel installer already include angr                         | Issue #12 should improve existing availability/real target symbolic execution, not add another engine wrapper                |
| [Qiling](https://github.com/qilingframework/qiling)                 | GPL-2.0 detected by GitHub; instrumentable binary emulation | Overlaps some dynamic/Frida workflows; requires compatible OS API/rootfs behavior                       | Defer: meaningful Windows GUI/renderer emulation is not established and redistribution/rootfs rights need separate decisions |
| [Microsoft WinAppDriver](https://github.com/microsoft/WinAppDriver) | MIT; Windows desktop automation server                      | Existing native UI/browser tooling; isolated Windows worker remains incomplete                          | Consider only with an actual Windows worker; it does not supply macOS control or binary reconstruction                       |
| [NSA Ghidra](https://github.com/NationalSecurityAgency/ghidra)      | Apache-2.0; disassembly/decompilation                       | Existing read-only headless provider/MCP workflows, actual DLL analyses, packaged upstream distribution | Reuse current integration; adding another Ghidra MCP server would duplicate working interfaces                               |

GitHub repository metadata and capa/FLOSS latest-release responses are retained under `integration-metadata/`. The classification above distinguishes existing tool discovery from actual production-provider integration. REA now exposes bounded read-only radare2 function inventory (`aflj`) and caller-addressed disassembly (`pdj`) through shared routes. Raw disassembly output was captured, but the provider execution remains unverified because owned-process cleanup inspection failed with `spawn EPERM`; CFG, call-graph, decompilation, and complete function recovery are not established.

## Actual installation/profile constraints

`src/application/autonomy/ToolDiscovery.ts` probes native tools and six Python modules: Frida, Capstone, LIEF, Z3, angr and Pillow. `scripts/install-autonomy-analysis-tools.mjs` has a fixed matching package list and verifies official PyPI wheel hashes. `scripts/package-autonomy-tool-bundle.mjs` deliberately omits unresolved angr and withholds public redistribution approval for incomplete transitive native-source/notice coverage.

Neither capa nor FLOSS was on PATH at the initial check. They are not silently added to the existing wheel installer: standalone release distribution, bundled rule identities, health checks and transitive licensing differ from its current Python-wheel contract. Existing submodules (jadx MCP, binwalk, unblob, Ghidra NativeAOT and wakaru) remain reused rather than recloned.

## capa release and production adapter

Official release: [capa v9.4.0](https://github.com/mandiant/capa/releases/tag/v9.4.0). Native macOS ARM64 artifact is `capa-v9.4.0-macos-arm64.zip`, 35,926,668 bytes. Publisher SHA-256 from the release API:

```text
119964afc348c80fff93ad8830124a0c55630f179906acb796636c0f8d410672
```

The downloaded archive matched this digest before extraction/execution. `capa --version` returned `capa 9.4.0`. The exact-tag [LICENSE.txt](https://github.com/mandiant/capa/blob/v9.4.0/LICENSE.txt) is Apache-2.0. The release archive contains a single executable and no separate notice files; this audit therefore does not approve public redistribution of all packaged third-party dependencies. The binary and private target results remain in ignored `output/optional-tools/capa-9.4.0/`, outside the published source/package artifacts. No proprietary binary is bundled.

The provider is registered through the existing `inspect-capa-capabilities` CLI and `inspect_capa_capabilities` MCP operation. It uses the existing process supervisor and Evidence model; it does not add a second MCP server. The named contract bounds input size, output, time, selected backend and reports. It binds the capa executable hash (including the packaged default rules), validates target and tool bytes around execution, and preserves file-scope matches without inventing an address. Failed cleanup ownership remains available for retry.

The optional executable adapter is `src/capa/` plus `src/application/native/CapaCapabilitiesService.ts`. The old standalone experiment script has been superseded by the registered production path and should not be used as the supported interface. Native capa remains BYO via `REA_CAPA_PATH`; the source integration is present in the engine, but no capa binary is bundled.

## FLOSS release verification gap

Official [FLOSS v3.1.1](https://github.com/mandiant/flare-floss/releases/tag/v3.1.1) publishes Windows/Linux/macOS archives; the release metadata returned no publisher `digest` for those assets. The macOS archive is not identified as ARM64 in its filename. No FLOSS binary was downloaded or installed in this task. A future installer must verify architecture and available signatures/checksums, accurately recording when independent publisher integrity evidence is unavailable instead of fabricating it.

## Real validation scope

- A clean isolated checkout built with `npm run build:cached` successfully; the 10 `CapaCapabilitiesService` focused tests passed.
- Public CLI invocation on authorized `gconv.exe` SHA-256 `5616139f4f94e7299b0703954d6a3eeda36fdda5cb17e19fa32163ba6b326c78` produced authenticated Evidence `ev_3cb77a8234bf3568dd472e22e5c8d6684c7ca64dd91d94552bb69e69c75b0179` with 17 derived rule matches. capa 9.4.0 executable SHA-256: `55634be2449c02a123dcd46e56eec131f038fa1ab66c1175c24146cb8e1d6bbe`.
- The existing MCP server returned Evidence `ev_6300cb5d3541f459ffc8e6e68be34fd070a35fcd7d0e9b8a9404cd567f7a9e80`; export and import both passed. This confirms the MCP adapter, persistence, and existing evidence-bundle path for this one PE.
- The focused tests cover identity/hash changes, malformed reports, location omission, cancellation, bounded output, cleanup retry, missing configuration, unknown arguments and size limits. This does not establish Windows/Linux integration or arbitrary-target correctness.
- No target application was launched by these capability checks. No reconstruction or byte-equivalence claim is made.

For issue priority: land a reviewed bounded capa evidence contract first (#8), use FLOSS only for a target with obscured strings (#7), and resolve the existing angr installation/target experiment gap (#12). Additional tool names do not close native reconstruction, Windows worker or six-target behavioral verification issues.

Final adapter execution: authenticated Evidence `ev_a746f6e47f54ba48e060a361055f451f74d16de097d3a646d3cd81db00c86e51`, 17 derived static rule matches; tool SHA-256 `55634be2449c02a123dcd46e56eec131f038fa1ab66c1175c24146cb8e1d6bbe`. The final version/flavor and match-location validation checks passed against real capa output.
