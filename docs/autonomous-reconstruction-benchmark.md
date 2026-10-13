# Autonomous reconstruction validation

The native validation fixture exercises REA's existing process capture, comparison and verification evidence through the autonomous controller. It is deliberately separate from the proprietary desktop benchmark. Passing these finite tests is not universal equivalence.

## Reproduce

Build REA with `npm run build:cached`, then run:

```sh
node scripts/verify-autonomous-reconstruction.mjs
node scripts/verify-autonomous-reconstruction.mjs --calculator
node scripts/verify-calculator-reconstruction.mjs
```

The first command requires installed `clang` and `radare2`. The Calculator command requires macOS, Apple's installed Calculator, Swift command-line tools and native UI permission for the REA host. Run with normal operating-system permissions; restricted sandboxes may deny compiler caches, application launch, accessibility or screen recording. No proprietary binary is copied or redistributed. Each default invocation creates a fresh directory in ignored `output/autonomy/`; an optional output path selects another local evidence directory.

## What the fixture establishes

The fixture source is authored validation material. The script compiles it to a real native binary. Radare2 automatically finds the function, records its disassembly and confirms a CFG branch. The reconstruction policy does not read the original C source: it experimentally measures output at 0 and 1, infers an initial affine hypothesis, and generates independent C source.

Both executables receive the same declared 15 inputs, including negative, zero, positive and boundary values. Negative mismatches trigger a repair policy that probes -1 and -2, infers another affine branch and proposes replacement source. REA builds that candidate, reruns the suite and retains or rejects it using its controller. Persistent mismatch case IDs are regression inputs. The script reopens the checkpoint and checks the resulting status.

The policy is constrained to a piecewise affine hypothesis class. It is not a general decompiler or a universal unknown-program reconstruction policy. Static branching evidence motivates the hypothesis; runtime experiments infer coefficients. Tests cover only the declared inputs. The evidence preserves original capture timing; comparison normalizes incidental timestamps with its declared timing bucket. Terminal output and interaction dimensions are checked. Every captured process's exit outcome is independently checked for a successful exit; settlement timing is excluded from the fidelity claim.

## Proprietary desktop benchmark

Apple Calculator is the real installed proprietary target. The reproducible `--calculator` workflow records the executable SHA-256, signing metadata, radare2's actual function candidates and the upstream REA native UI evidence for its selected window.

The `--calculator` workflow establishes local provenance, static discovery and native desktop observation. Function candidates and imported stubs are not verified functions. Apple hardened runtime restrictions and dynamic instrumentation remain separately evaluated capabilities.

The separate `verify-calculator-reconstruction.mjs` workflow probes the actual Calculator UI eight times, selects arithmetic laws from a declared four-law hypothesis class, generates an independent Swift/AppKit application, compiles it, and runs identical abstract button-event scripts against both native applications. Buttons are discovered through REA's existing accessibility observer. It compares final numeric display values for ten held-out cases, normalizing bidi controls, English grouping separators and Unicode minus. Intermediate display, reset/backspace semantics, rendering and internal arithmetic function equivalence are outside this suite.

The fresh execution in `output/autonomy/calculator-reconstruction-1791873987375/report.json` passed **10/10** cases. Per-action authenticated evidence, runtime observations, generated source, compiled replica identity and report are retained in that directory. An earlier failed report remains available: its selector picked the replica window title instead of the numeric display. The reusable numeric display selector now rejects ambiguous or truncated observations; both the corrected retained traces and a fresh execution passed. This is a finite result-display benchmark, not full Calculator reconstruction.

The reviewed rerun in `output/autonomy/calculator-reconstruction-1791881265463/report.json` also passed **10/10**, with ten canonical comparison records linking the original and replica action evidence. The selector rejects accessibility observation gaps and malformed English grouping. Cleanup initially reported failure because its AppKit termination observer did not service the run loop; an independent query confirmed the replica was already absent. The corrected helper was then tested against a newly launched owned replica before any UI observation: `cleanup-reviewed-report.json` records successful termination, launch-worker exit and independent process absence. The failed diagnostic is preserved in `output/autonomy/calculator-final-reviewed-stderr.log`; the whole reviewed benchmark process initially exited nonzero despite its passing display comparisons.

## Extracted expression proof

`rea autonomy-prove-affine CHECKPOINT SOURCE OUTPUT_DIRECTORY --min=-1000000 --max=1000000 --json` runs installed Z3 against an evidence-linked Ghidra function expression and independently parsed generated C result expression. The recorded `output/autonomy/cli-profile-1791837799/proof-z3/proof.json` reports `unsat` over that range. Its authenticated evidence names the decompiler, compiler, function correspondence and non-overflow assumptions. This proves the extracted scalar expressions equal under those assumptions; it does not prove complete native executable equivalence. A real solver regression test also returns `sat` for a deliberately wrong negative branch.

## Evidence outputs

| File                         | Evidence                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `functions.json`             | Real compiled fixture function inventory                                               |
| `transform-disassembly.json` | Disassembly and branching observations for the discovered function                     |
| `investigation.json`         | Persistent captures, comparisons, verification evidence, mismatches and repair history |
| `replica.c`                  | Generated independent candidate implementation                                         |
| `report.json`                | Exact finite validation claims and limitations                                         |
| `calculator-functions.json`  | Real installed Calculator candidate inventory                                          |
| `calculator-provenance.txt`  | Installed bundle signing metadata                                                      |
| `calculator-ui-probe.json`   | Exact selected process/window and permission observation                               |
| `calculator-rea-ui.json`     | Existing REA native UI evidence with binary identity                                   |

The report is generated only after assertions succeed. A process failure or failed comparison remains a failure, and the evidence checkpoint is preserved for investigation.

## Recorded development execution

The macOS Apple Silicon execution completed the authored suite with **15/15 passing inputs after one repair**, seven persisted regression case IDs and 60 actual process capture records across two iterations. Original and replica capture exit outcomes were successful, and reopening the JSON checkpoint preserved `suite-passed`. The recovered coefficients were inferred from observations `(0,7)`, `(1,12)`, `(-1,10)`, `(-2,13)`.

The installed proprietary target's SHA-256 was `0ebdae8618cd675bcf492d6fc8f48dd79c4712e0532c80f1a1cb59269fd76be9`. Radare2 returned 5,535 function candidates including imported stubs. Existing REA captured the Calculator accessibility tree and screenshot; a selected button scenario completed with post-action display observations changing from `35÷` to `35`, then to `5`. These are native UI observations, not reconstructed Calculator semantics.

The attempted upstream LLDB function instrumentation did **not** complete: it returned `cleanup_incomplete` after a 90-second timeout, with ownership-token cleanup unavailable. The exact created debugger, fixture and caller process chain was subsequently verified by command, parent and launch time and terminated; process absence was confirmed and a cleanup audit was saved. Runtime argument capture and static/runtime address correlation are therefore unverified in this development report. Normal process execution and UI observation do not establish debugger instrumentation coverage.
