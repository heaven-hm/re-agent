# Bundled ILSpy CLI

The unmodified official NuGet package `ilspycmd.9.1.0.7988.nupkg` is bundled for managed static reconstruction. Its SHA-256, repository signature, exact source commit, dependency identities and runtime requirements are retained in `manifest.json` and `signature-verification.txt`. The upstream MIT license is retained in `LICENSE`.

```sh
node scripts/install-managed-analysis-tool.mjs
```

Installation uses only the local package feed in an isolated workspace. A healthy matching installation is reused. The verified host uses installed .NET 10 with explicit major-version roll-forward; this does not imply every runtime version is supported. This package does not bundle .NET, Mono, Ghidra or all other tools. Transitive license notices are being collected; do not describe this as an audited complete third-party tool distribution.
