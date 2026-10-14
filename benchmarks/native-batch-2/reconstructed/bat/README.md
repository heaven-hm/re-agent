# Independent batmac candidate

The C++ implementation is independently engineered from actual published
Windows bat 0.26.1 output observations. No upstream implementation source was
read. Its supported scope is unpaged plain UTF-8 output, multiple-file byte
concatenation, observed missing-file diagnostics, and the compatibility version
datum. Number styling is ignored in redirected output, as in the tested original.

Syntax grammars, themes, colored code rendering, interactive numbering, paging,
encoding auto-detection and complete option semantics remain unimplemented or
unverified. A plain-output suite cannot certify the full bat application.

Build from any directory on a macOS host with a C++17 compiler:

```sh
benchmarks/native-batch-2/reconstructed/bat/build.sh
benchmarks/native-batch-2/reconstructed/bat/build/batmac --help
```

The native Mach-O executable has a different identity from the Windows PE.
Report stdout/stderr/exit equality only for actually executed declared cases.
