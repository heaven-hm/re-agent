# Local ILSpy CLI artifact

The source checkout retains the unmodified official NuGet package `ilspycmd.9.1.0.7988.nupkg` for managed static reconstruction. Its SHA-256, signature record, exact source commit, dependency identities and runtime requirements are retained in `manifest.json` and `signature-verification.txt`. The local package hash matches the manifest; `dotnet nuget verify` did not complete successfully on the current host, so the package signature is not claimed as verified. The upstream MIT license is retained in `LICENSE`.

The npm package ships this directory's metadata, license and notices only; it excludes the `.nupkg` because the complete transitive notice and redistribution audit is unfinished. Do not infer redistribution approval from repository presence or a matching hash.

```sh
node scripts/install-managed-analysis-tool.mjs
```

Installation uses only the local package feed in an isolated workspace. A healthy matching installation is reused. The verified host uses installed .NET 10 with explicit major-version roll-forward; this does not imply every runtime version is supported. This package does not bundle .NET, Mono, Ghidra or all other tools. `dependency-notices.json` records 51 dependency identities, and every notice path referenced by that inventory resolves to a file under `licenses/` (checked in this checkout). This inventory check is not a legal review, and it does not establish that every package is approved for redistribution in every distribution format.
