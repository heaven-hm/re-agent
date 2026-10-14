# plink CLI surface — partial reconstruction

The macOS C candidate was built and matched three retained output goldens byte-for-byte: no arguments, `--help`, and `-pgpfp`. Its `-V` case is also checked for release/source-commit fields and valid macOS host-specific output; Windows and macOS version lines are not byte-equal. The generated [receipt](reports/replica-golden-comparison.json) records the candidate hash, output hashes, exit codes and comparison method per case.

The old manifest cited an ignored original-run receipt that is not present in this repository. The original executable is also not included. The retained files therefore prove candidate-to-golden consistency only; they do not independently prove the golden provenance or original-versus-replica equivalence. Unknown-option behavior has no current differential receipt. SSH/network transport is outside this reconstruction.

Rebuild and rerun the retained-golden checks on macOS:

```sh
benchmarks/plink/replica/test.sh
```

See the dedicated [target report](reports/target-report.md) for the exact evidence boundary.
