# rea-rg independent subset

This is a small, independent C++17 search utility for macOS, written without
using ripgrep source. It is a reconstruction experiment, not a ripgrep clone.
The available Windows PE has a verified acquisition hash. Eight declared CLI
cases were executed through CrossOver and compared against this candidate with
REA's owned-process runner. The original is a macOS CrossOver compatibility
observation, not a Windows OS run. Seven cases match after a separately recorded
normalization of only a leading relative-path separator (`.\\` to `./`); the
version case matches byte-for-byte. One invalid-regex stderr comparison differs.
See [case evidence](../../reports/ripgrep/) and the
[target report](../../reports/ripgrep/target-report.md).

Build and run its local smoke checks on macOS:

```sh
./build.sh
./test.sh
```

The generated arm64/x86_64 executable is written to the ignored `build/`
directory so a local build cannot be mistaken for a checked-in benchmark
artifact or leak into an npm package assembled from this workspace.

The supported subset is literal/regular-expression line search, case folding,
hidden-file inclusion, deterministic path sorting, line-number output, basic
root `.gitignore` filtering, and match/no-match exit status. The implementation
intentionally omits ripgrep's regex engine semantics, nested ignore-file rules,
binary detection policy, Unicode normalization, multiline search, colors,
parallel traversal, symlink following, JSON output, and detailed CLI
compatibility. `--no-ignore` is accepted; ignore files are skipped for that
mode. Unsupported options fail.

The version case intentionally prints the measured compatible version output.
This does not claim identical implementation or binary. The Windows binary is
executed only as the original comparison subject; the macOS candidate is built
from the independent C++ source here.
