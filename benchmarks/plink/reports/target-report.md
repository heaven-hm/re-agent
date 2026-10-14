# plink CLI surface — partial reconstruction

**Status: PARTIAL.** The macOS candidate matches three retained output goldens byte-for-byte. Its `-V` behavior is checked with host-aware assertions: release and source commit are retained while platform/compiler lines describe macOS. The original-side run receipt cited by the old manifest is absent, so this is not a reproducible original-versus-replica comparison and does not support a byte-identical-to-original claim.

## Target and implementation

- Original identity recorded in the prior analysis: PuTTY plink 0.85 Windows x64, SHA-256 `969f36879d5716aa1a9811f43a6a6510e8f08372dbeb9695b810b9c776f39c75`. The original binary is not retained in this repository.
- Independent C candidate: [`plinkmac.c`](../replica/plinkmac.c); reproducible macOS build: [`build.sh`](../replica/build.sh).
- Re-run candidate-to-golden checks with [`test.sh`](../replica/test.sh). It writes a receipt to [`replica-golden-comparison.json`](replica-golden-comparison.json).
- The byte-compared cases are no arguments, `--help`, and `-pgpfp`. Their stdout bytes, zero exit codes, and empty stderr are checked against retained golden files.
- The `-V` case checks exit status, empty stderr, CRLF framing, release version, host-specific macOS fields, and the retained source commit. It explicitly does not require Windows and macOS host fields to match.

## Evidence boundary

The checked receipt identifies and hashes the candidate executable and each golden, and records exact case outcomes. It does **not** include a fresh original executable run or a process-linked capture proving the golden provenance. Unknown-option behavior remains outside the receipt. The version case is host-aware and is not a byte match. SSH/network transport is unimplemented. This evidence supports candidate-to-recorded-golden consistency only, not original parity, application equivalence, or executable byte identity.
