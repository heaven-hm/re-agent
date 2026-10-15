# Workspace analysis dependency bootstrap

Run from the REA repository root:

```sh
node scripts/install-autonomy-analysis-tools.mjs /absolute/path/to/authorized/native-fixture
```

The default input is the retained authored reconstruction fixture at `output/autonomy/reconstruction-1791837432410/original`. Choose an existing Mach-O fixture when running the current macOS smoke suite. The script does not obtain proprietary targets.

## Installation and provenance

The bootstrap imports each module first, checking the existing workspace environment before the selected system Python. Healthy installed imports are reused. Missing open-source packages are resolved into `output/autonomy/tools-python/venv`; system Python and unrelated software are not upgraded. Set `REA_BOOTSTRAP_PYTHON` and `REA_BOOTSTRAP_UV` to choose existing executables.

Dependencies include Frida, Capstone, LIEF, Z3, angr and Pillow. `uv pip compile` resolves wheel-only distributions from the official PyPI index and retains a dated `requirements-install-*.lock` with hashes. The final `requirements.lock` pins all successfully available direct tools, including reused installations, using their exact versions and official release wheel hashes. Pip downloads wheels using `--require-hashes`. Before installation, the script computes every wheel's SHA-256 and checks it against the matching official PyPI release metadata and `files.pythonhosted.org` URL. Installation then uses the retained wheels offline with hash checking enabled. No source distribution builds or proprietary downloads are performed.

The report records exact wheel URLs, hashes, release metadata URLs and declared license metadata. Declared package licenses do not replace a redistribution audit of transitive packages. Hashes for reused installations describe the official version available for reproduction; they do not certify the provenance of pre-existing local files. Downloaded wheels and environments stay in ignored local output; they are not added to the published REA package.

## Health evidence and limits

`output/autonomy/tools-python/bootstrap-report.json` records separate results for:

- Capstone disassembly of actual native Mach-O text bytes, with target hash.
- LIEF parsing of the same target, with section count and hash.
- Z3 solving a real integer constraint and checking its model.
- Frida querying its local device through the installed module.
- angr loading the target without loading external libraries.
- Pillow encoding, decoding and comparing actual PNG pixels.

An unsupported loader, denied local device or missing compatible wheel is reported as a failure. Frida device discovery does not establish that runtime hooks work. Importing angr or loading one target does not establish symbolic recovery of arbitrary applications. These tools alone do not prove behavioral or visual equivalence.

## Existing REA MCP integration

Use REA's existing MCP server rather than installing duplicate Ghidra, disassembler or computer-use MCP servers. The built local server can be configured with an absolute Node path and REA's `scripts/rea.mjs` entry, the `mcp` argument and existing target/provider environment variables. Consult the current README's MCP configuration for the entry point supported by the installed package.

`node scripts/print-mcp-config.mjs /absolute/path/to/target --local` produces a configuration for this built source checkout. Use `--local` for the engine preview: the renamed npm package has not been published to the registry. Existing `autonomous_investigation` MCP actions remain the shared orchestration interface. Installing these Python dependencies makes them available to explicit adapters and experiments; it does not silently register new supported REA operations. `rea autonomy-tools --json` reports existing native executable probes separately from this Python dependency report.

## Verified execution on this development host

The macOS Apple Silicon run used Python 3.12 and the authored Mach-O fixture with SHA-256 `17968b177b549e790f90f35f520ae2e4a62bacd61d32a82b6c99fe78a87711d0`. It installed Frida 17.23.3, LIEF 1.0.0 and z3-solver 5.1.0.0 from three verified official wheels, and reused Capstone 5.0.9 and Pillow 12.3.0. All five smoke checks passed. angr was explicitly skipped because its `mulpyplexer` dependency has no usable wheel for this resolution; the full resolver reason is retained in `angr-resolution-failure.txt`. The process returns a nonzero exit status for this partial result so callers cannot mistake it for a complete installation.

## Create a local binary and source bundle

```sh
node scripts/package-autonomy-tool-bundle.mjs
```

This profile requires macOS 13 or newer on Apple Silicon and Python 3.12. It downloads all five exact pinned wheel distributions, including previously reused Capstone and Pillow, using `--require-hashes` and the official PyPI index. It verifies every wheel against exact release metadata, downloads available original source distributions with the same SHA-256 checks, and retains those archives unmodified. No source builds run.

The output `rea-analysis-tools-macos-arm64-python312-*.tar.gz` includes:

- Original wheels and original source distributions for Frida, Capstone, LIEF, Z3 and Pillow.
- Full located LICENSE, COPYING, NOTICE and copyright files from those archives.
- Exact release-tag LIEF license and copyright notices when its PyPI artifacts omit them.
- The complete GNU LGPL document referenced by Frida's wxWindows COPYING, retained from the official SPDX v3.27.0 license list.
- Pinned requirements, offline installation instructions and a manifest recording exact artifact URLs, hashes, licenses and notice provenance.

The companion report gives the final archive's checksum and size. Only PyPI artifacts have independently published release hashes; fetched upstream notice hashes identify the retained HTTPS content and are not presented as separately verified published checksums.

**Public redistribution remains unapproved by this script.** Frida's retained wxWindows exception explicitly permits distributing binary object code, but that does not prove complete source and license coverage for embedded native dependencies. LIEF's wheel and source distribution omit notices, so the bundle adds exact upstream notices and records that gap. A source distribution's availability does not establish that it contains the complete corresponding native library source. These concrete issues remain in `manifest.json` for review before publication.

No proprietary Apple binaries, Python environments, credentials or target applications enter this bundle. It omits angr and does not claim to supply every REA analysis, gameplay, graphics or platform integration.

## Engine preview distributions

The source checkout retains the ILSpy 9.1.0.7988 NuGet package and local ARM64 X11-enabled libgdiplus build/source archive. Their hashes and available notices are recorded locally. NuGet signature verification did not succeed on the current host, and the license/notice audit is incomplete. The npm package therefore contains only their metadata, licenses and notices, not these binaries or archives. The installer can use the local ILSpy package in a source checkout and has a pinned-hash download fallback when only metadata is installed. See `third_party/ilspy/`, `third_party/libgdiplus/` and `third_party/distribution-inventory.json`.

The preview release supplies the unmodified official Ghidra 12.1.2 ZIP as an optional release asset, with its embedded licenses preserved; `third_party/ghidra/manifest.json` records the publisher digest and runtime requirements. This is separate from the unapproved Python redistribution bundle above. It does not bundle every analysis tool, JDK, .NET, Mono, XQuartz, or all platform dependencies.
