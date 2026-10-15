# Native Binary Reconstruction — Benchmark Batch 2

This workspace investigates the six exact native Windows releases selected by
the user. The originals are private inputs. Acquisition verifies the publisher's
release-asset SHA-256, inventories actual PE files, rejects CLR assemblies, and
records imports and bundled resources. Original source is excluded from behavior
recovery; precise license documents are permitted for the licensing audit.

Run from the repository root:

```sh
python3 benchmarks/native-batch-2/scripts/acquire.py
GHIDRA_INSTALL_DIR=/absolute/ghidra JAVA_HOME=/absolute/jdk \
  node benchmarks/native-batch-2/scripts/analyze-target.mjs bat
```

Acquisition and native analysis need the installed GitHub CLI, curl, Python 3,
REA's built runtime, Ghidra, and a compatible JDK. Existing installations are
reused. No competing analysis server is introduced: the analysis script connects
to REA Engine's existing MCP server and Ghidra provider.

Read `manifests/*-acquisition.json` for exact artifact identities and
`analysis/*/summary.json` for completed analysis and retained failures. The
acquisition `PASS` status certifies that stage only. It does not certify the
application's reconstruction, runtime, licensing, or behavioral equivalence.

The host coding agent performs investigation and implementation reasoning. REA
provides native analysis, canonical Evidence, bounded process ownership and
comparison infrastructure. This workflow must not be described as unattended
algorithm recovery when agent engineering was required.

Windows-original executions through CrossOver are compatibility observations on
macOS. They do not establish behavior on a real Windows OS, and Wine execution
does not establish a reconstructed native macOS port. Feature results, full
application status, byte-exact output comparisons, and whole-binary identity
are reported separately.

Original archives, extracted resources, provider snapshots and locally built
executables are excluded from Git and npm packaging. Licensing and notice
obligations must be resolved before redistributing original binaries or assets.

## Receipt-derived Batch 2 reports

Regenerate summaries from the retained original/native comparison receipts:

```sh
python3 benchmarks/native-batch-2/scripts/report.py
```

The generator uses REA's existing canonical Evidence parser to validate case and
static record identities. It recomputes raw comparison dimensions from retained
stream commitments and replica text, checks original/candidate/source bindings,
and reports invalid or missing receipts as UNVERIFIED. It preserves runtime and
license reports maintained by their owners. Output is deterministic for identical
inputs and includes an input fingerprint rather than an invented generation time.

The latest projection contains **31 run-bound cases: 30 passing, 1 differing, and 0 unverified**. fd has 14/15 exact raw-byte passes across the declared suite; `--help` remains different. The candidate reproduces the observed Windows path rendering and the CrossOver-observed symlink classification for this fixture, while native Windows symlink behavior remains unverified. Bat has 8/8 raw-byte passes. ripgrep has 8/8 passes: six search cases pass after separately recorded relative-path separator normalization, and the declared invalid-regex diagnostic now matches exact stderr bytes. Each result joins original, replica and comparison run IDs and checks target, source, executable, and fixture-tree hashes. The checkout moved from `rea` to `rea-engine`; archived original CrossOver captures retain the old absolute CWD, while their exact fixture hashes match the current fixture trees. A post-move fd original rerun failed at wineserver startup and is not counted as target behavior. Originals were run through CrossOver on macOS, not on Windows OS. All whole applications remain partial or unverified; the separate ten-case fd held-out suite is still unverified. See [functional results](reports/functional-tests.json) and the [fd relocation binding](reports/fd/original-relocation.json) for case-level status and evidence.

Latest receipt-validated summary: [batch overview](reports/batch-2-overview.md)
and [functional results](reports/functional-tests.json). Game targets remain
analysis-only; no game reconstruction or game screenshot has been verified.

Successful fd lightweight Ghidra profiles and actual startup/callback dossiers
supersede the earlier inventory failure for that measured scope. Default-profile
failures are retained separately. Whole applications remain PARTIAL or UNVERIFIED;
games, actual Windows OS verification and universal equivalence require their
own evidence. Held-out worker crashes remain UNVERIFIED and cannot erase earlier
valid comparisons or become new passing cases.
