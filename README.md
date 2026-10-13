# REA Extended

**Repository: [heaven-hm/rea-extended](https://github.com/heaven-hm/rea-extended).**
REA Extended builds directly on [morluto/rea](https://github.com/morluto/rea), retaining its MIT license, attribution and working integrations. The compatible package and CLI names currently remain `rea-agents` and `rea`.

### What differs from upstream REA

| Area                           | REA Extended addition                                                                                                         | Source / reproducible evidence                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autonomous reconstruction      | Persistent checkpoints, bounded build/test/repair, rollback, mismatch regression inputs                                       | [Controller](src/application/autonomy/AutonomousInvestigation.ts), [25/25 fixture report](docs/verification/rea-extended/fixture-report.json)           |
| Unknown function investigation | Existing static providers feed runtime hypotheses and independent bounded affine reconstruction                               | [Discovery](src/composition/autonomousDiscovery.ts), [recovery](src/application/autonomy/AffineRecovery.ts)                                             |
| Runtime/static correlation     | Owned Frida Gadget profile checks binary identity, ASLR and instruction prefix, records arguments/returns and cleanup         | [Adapter](src/native/FridaAutonomyTrace.ts), [five-call report](docs/verification/rea-extended/frida-report.json)                                       |
| Conditional verification       | Z3 checks extracted scalar expressions under explicit assumptions                                                             | [Proof implementation](src/application/autonomy/AffineEquivalenceProof.ts), [verification guide](docs/autonomous-reconstruction-benchmark.md)           |
| Tool installation and bundles  | Reuse installed tools; pinned official downloads, hashes, health checks, offline wheel/source bundle builder                  | [Bootstrap and license limits](docs/autonomy-tool-bootstrap.md)                                                                                         |
| Coding-agent integration       | Existing CLI/MCP plus autonomous investigation operations and packaged skill instructions; host Codex/Claude can operate them | [Agent workflow](.agents/skills/reverse-engineer-anything/references/autonomous-reconstruction.md), [workflow guide](docs/autonomous-reconstruction.md) |
| Interface                      | Local evidence/status dashboard with pause/resume/stop                                                                        | [Dashboard](src/composition/autonomyDashboard.ts)                                                                                                       |

These are additions to the upstream tool ecosystem. Ghidra, native UI, browser analysis and general Frida capabilities already exist upstream and are not claimed as inventions of this fork.

### All completed reconstruction demonstrations

| Target                                                       | Recorded result                                                                        | What remains unproven                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Authored native branch fixture (software validation fixture) | 25/25 declared cases after two iterations; 10 regression inputs; 217 evidence records  | General software reconstruction and byte-identical executables                                                                              |
| Installed Apple Calculator (proprietary desktop software)    | 10/10 declared final numeric display comparisons; original and replica hashes recorded | Full UI, complete behavior and byte identity; expanded suite interrupted at percent presentation, and a later correction still needs replay |
| Authored Frida fixture                                       | Five real instrumented calls with static/runtime correlation and verified cleanup      | This is instrumentation validation, not reconstruction of a game                                                                            |
| Games / Windows-to-macOS ports                               | **No completed, verified demonstration yet**                                           | All game and cross-platform fidelity claims                                                                                                 |

**100% byte-to-byte reconstructed games: none. 100% byte-to-byte reconstructed complete applications: none.** Passing a finite suite does not establish universal equivalence. Calculator's different executable hashes explicitly disprove byte identity for that demonstration. Native Windows PE and macOS Mach-O builds also require separate behavioral claims.

[Recorded reports and SHA-256 manifest](docs/verification/rea-extended/manifest.json) preserve actual development results. Re-run `npm run verify:autonomy`, `npm run verify:autonomy:calculator` and `npm run verify:autonomy:frida` to generate fresh local evidence; required tools and OS permissions are documented in the linked guides. A recorded report is evidence of its recorded run, not a promise a later expanded suite passes.

### Installed tools versus distributed tools

Development health checks confirmed Frida 17.23.3, LIEF 1.0.0, Z3 5.1.0.0, Capstone 5.0.9 and Pillow 12.3.0. Ghidra/radare2 and native compilers are reused locally. **A clone does not contain every installed external tool binary.** The installer and offline bundle builder are shipped in source; generated local bundles are not a license-approved public distribution. Frida/LIEF native dependency source and license coverage require further audit. Optional licensed tools and Apple Calculator are not redistributed. See [tool profiles and limitations](docs/autonomy-tool-bootstrap.md).

## Build and use this repository

```sh
git clone https://github.com/heaven-hm/rea-extended.git
cd rea-extended
npm ci
npm run build:cached
node scripts/rea.mjs setup
node scripts/rea.mjs --help
```

Use the built repository CLI to register its MCP server and packaged agent skill. A published upstream npm package is not this fork. The implementation retains compatible command names while the product identity is REA Extended.

## Documentation

- [Autonomous reconstruction and host-agent workflow](docs/autonomous-reconstruction.md)
- [Executed benchmarks and reproduction](docs/autonomous-reconstruction-benchmark.md)
- [Static/runtime tool bootstrap and offline bundles](docs/autonomy-tool-bootstrap.md)
- [CLI and evidence](docs/cli.md)
- [Ghidra provider](docs/ghidra-provider.md)
- [Managed .NET analysis](docs/managed-code-analysis.md)
- [MCP contracts](docs/mcp-contracts.md)
- [Licensing](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)

Report issues and contribute at [heaven-hm/rea-extended](https://github.com/heaven-hm/rea-extended).
