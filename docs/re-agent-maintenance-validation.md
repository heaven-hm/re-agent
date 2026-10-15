# RE-Agent maintenance integration validation

Executed 2026-10-15 on macOS (`darwin`, Apple Silicon `arm64`), Node 22.23.2. This record covers the new maintenance workflow, not reconstruction of a proprietary program or game. No source-free recovery or automatic repair was claimed for these authored fixtures.

## Results

| Check                                    | Measured outcome                                  |
| ---------------------------------------- | ------------------------------------------------- |
| New maintenance filesystem tests         | 7 passed                                          |
| Existing skill install/cleanup tests     | 12 passed                                         |
| TypeScript no-emit compilation           | Exit 0                                            |
| MCP registry metadata validation         | Exit 0, `re-agent@6.4.0`; not publication         |
| Compiled CLI skill discovery             | 6 modules, catalog VALID                          |
| Captured-buffer search                   | Offsets 0 and 3 for `48 8B ??`                    |
| Real original/replica process comparison | 3 of 3 declared cases passed, 12 evidence records |
| Checkpoint resume                        | `suite-passed` after loading saved checkpoint     |
| Deliberately incorrect replica           | 3 of 3 cases failed, `budget-exhausted`           |
| Automatic repair                         | Not exercised; 0 repair iterations                |

Both fixtures were independently compiled C executables using the local `cc` compiler, using two authored arithmetic expressions. The inputs were `-3`, `0`, `5`. Comparison used the existing controller's terminal/interaction dimensions and exit outcome checks. The mismatched replica printed `wrong`; this was detected rather than normalized away. This verifies the route into the existing controller, not algorithm discovery. The host coding agent still supplies investigation and implementation work for the hosted maintenance workflow.

## Reproduce

Build the checkout, then:

```sh
node scripts/run-development-tests.mjs focused tests/boundary/filesystem/legacyMaintenance.test.ts tests/boundary/filesystem/setupSkill.test.ts tests/boundary/filesystem/setupSkillCleanupOwnership.test.ts
node node_modules/typescript/bin/tsc --noEmit
node scripts/verify-mcp-registry-metadata.mjs
node scripts/verify-legacy-maintenance.mjs /absolute/path/to/a-new-evidence-directory
```

The [fixture runner](../scripts/verify-legacy-maintenance.mjs) refuses an existing output directory. It preserves source files, executable files, build logs, requests, plans, CLI stdout/stderr, both comparison checkpoints and a summary. It requires a C compiler and permission to launch the two owned executables. The initial sandbox run failed with `spawn EPERM`; the complete run used an approved execution context. Windows/Linux execution remains unverified.

Actual run directory: `/private/tmp/re-agent-maintenance-proof-20261015-v4`, with a retained local copy at `output/legacy-maintenance-20261015/`. These local files are not bundled as application binaries or a public benchmark. The SHA-256 commitments below identify that run; a new run has different timestamps/process evidence and may have different executable hashes.

| File                       | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `original`                 | `2bc857a41b4a5cbf077aeab97eb57429bd042e2a2df68414994333066ae38131` |
| `checkpoint.json`          | `2023d9ab81f2a7a33c98d7e388ea5450e99f917c925140092003a9c2cb18a78e` |
| `mismatch-checkpoint.json` | `e3c3f1982182581f9c3ce730afc62943f626821374d9770b905d71262fc724b5` |
| `summary.json`             | `ce2dad4fe38d693aed52a6861b2c1693662a1dd2fb8810cb816d65f8cb43e094` |

See [integration provenance](cheat-agent-integration.md) for the selected MIT scanner and excluded unsupported verification claims, [maintenance workflow](legacy-maintenance.md) for authority boundaries, and [community skills](community-skills.md) for extensions. No graphical/runtime-provider parity or universal byte equivalence follows from this fixture suite.
