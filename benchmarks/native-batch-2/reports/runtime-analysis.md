# Original runtime analysis

Published retained observations: [compatibility records](runtime-original-observations.json)
and [failed canonical REA capture](runtime-fd-capture.json). Reproduction script:
`../scripts/probe-originals.py`; declared inputs: `../tests/runtime-probes.json`.
Raw stream files and the desktop screenshot remain private local evidence.

## Environment and evidence scope

Host: macOS arm64. Installed CrossOver 26.3.0 is a Windows compatibility layer, not an actual Windows worker. Actual Windows operating-system observations are **UNVERIFIED**. No upstream application source was used in these experiments.

Original Windows PE artifacts were acquired by the root investigator; exact hashes are in the acquisition manifests. Fixtures and bounded probe definitions are under `tests/` and `logs/runtime/`.

## Actual experiments

1. `fd-version-rea-capture.json`: real REA Engine `capture-process` invocation. The initially selected gconv recovery bottle was 32-bit and incompatible with the x64 executable. Retained partial frames show `wine: could not load kernel32.dll, status c000007b`; wrapper exit code 123. REA then reported `cleanup_incomplete` due ambiguous Darwin process environment ownership. This is a failed run, not target behavior.
2. Created a distinct temporary 64-bit Windows 10 CrossOver bottle, `rea-native-x64`, under `/private/tmp/rea-gconv-bottles`.
3. `fd-all.json`, `fd-regex.json`, `fd-glob.json`, `fd-extension.json`: supplemental Python-controlled runs against the actual original fd PE in the x64 bottle, outside canonical REA capture. All timed out at 15 seconds and produced zero stdout/stderr. Subsequent read-only process inspection showed original fd processes remaining alive after a minute, so the observed hang was not established to be merely inherited output pipes. Cleanup of those descendants is unverified; no broad Wine termination was performed.
4. A focused fd `--version` diagnosis likewise emitted no output. A subsequent ripgrep version observation could not persist its metadata because the filesystem reported `ENOSPC`. It is not recorded as a completed experiment.

## Recovery and resource limits

The supplemental runner now redirects output into ordinary files, so waiting for a direct child does not depend on daemon pipe EOF. It applies a hard 1 MiB limit per output file and refuses to start with less than 512 MiB free disk space. It records original SHA-256, exact arguments, cwd, exit status, duration, stream hashes, and precise compatibility/cleanup limits.

Automatic approval review rejected another runtime retry while disk space was approximately 77 MiB: additional Wine output could worsen system disk exhaustion. No workaround was used. Disk later recovered to approximately 1.0 GiB free. The capped rerun was approved and completed three controlled version observations: fd, ripgrep, and bat each timed out after 15 seconds with zero stdout/stderr. Ordinary-file output therefore did not resolve the execution block.

A desktop screenshot (`logs/runtime/worker-screen.png`) shows macOS reporting "Your system has run out of application memory". The Force Quit panel lists Ghostty and pixelmac at 59.21 GB each and CrossOver at 517.5 MB. This is evidence of host resource exhaustion, not proof of a target algorithm failure. No user application was force-quit. Runtime recovery must resolve this host resource condition and verify a healthy worker before resuming probes.

## Verification status

No successful original fd, ripgrep, or bat computation is currently established. No original-to-replica comparison, native macOS portability, UI screenshot comparison, or universal equivalence claim is supported. These runtime failures must remain visible in the final batch status and must never be replaced by expected output from source documentation.

## Recovery on continued investigation

After the user's continuation, host resources recovered: disk approximately 2.4 GiB free, pixelmac absent, Ghostty approximately 50 MiB RSS. All three exact original Windows PE version probes completed with exit code 0. The canonical REA fd version capture `fd-version-x64-rea-capture.json` also completed successfully with owned process group, terminal renderer, and temporary root all cleaned. Evidence ID: `ev_dabf0b7bfe22148bc19c91304f6d2121a713bca50ce132ae129ad5f50e8588ec`.

The declared 31 original compatibility probes (15 fd, 8 ripgrep, 8 bat) completed; exact raw stdout, stderr, and exit codes are retained under `logs/runtime/`. `successful-original-probes-summary.json` indexes them. Invalid pattern and missing file cases are expected observed nonzero exits, not benchmark failures. These successful current observations supersede the earlier blocked status; historical `fd-version-rea-capture.json` retains the genuine initial REA failure. Current probe paths contain recovered results.

Windows-specific runtime differences are observable: fd uses backslashes within paths and does not expose the fixture's macOS symlink as type `l` through Wine. bat's redirected `--style numbers` output is plain bytes in this invocation context; its CRLF file output preserves CRLF. These facts should guide explicit fidelity scopes rather than hidden normalization.

Sanitized structural procargs diagnostics for two stale selected fd processes are retained in `old-fd-procargs-structure.json`: argc 9/10 and a 95-byte NUL gap appear in rewritten launch data. No argv/environment contents were persisted. Existing ownership parser fixtures already cover multiple empty environment records before a run token and preserve fail-closed behavior; this evidence does not justify relaxing that safeguard.

The original compatibility baseline is now established for the declared probes. Actual Windows OS coverage, full application behavior, screenshots of application UI, replicas, and equivalence remain separate and unverified by this runtime investigator.

## Ownership boundary validation

The repository's focused boundary runner was attempted but stopped before executing tests because current unrelated browser capture imports did not typecheck (missing `HAR_CAPTURE_HEAP_LIMITS`, `HAR_CAPTURE_PROCESS_MEMORY_LIMIT_BYTES`, and `decodeHarText`). This is recorded as a blocked whole-file check.

The exact production `bridge/process/ProcessRunTokenReader.swift` was then compiled directly with the existing `tests/fixtures/processRunTokenParserProbe.swift` using installed `xcrun swiftc`. Its real output is saved as `logs/runtime/ownership-parser-probe.json`. All 16 boolean boundary assertions passed, including empty-record ambiguity, Apple-vector token rejection, duplicate token rejection, truncated argv, zero argc, and legitimate token reads; ordinary ambiguity remained `ambiguous_environment_boundary`, restricted ambiguity remained `restricted_process_environment_withheld`. No safety policy was weakened and no synthetic result was represented as real Wine behavior.

Latest read-only readiness inspection: system-wide memory free percentage 41%, disk approximately 2.3 GiB free. The capped original runner enforces at least 1 GiB disk reserve and matches each original SHA-256 to its exact acquisition-manifest path before executing.

## Game startup and worker lifecycle continuation

Three bounded 15-second Powder Toy original Windows launches were recorded through REA. The game's actual process initialized its macOS compatibility input client. The first capture reported incomplete cleanup for an owned Wine explorer process; the second and third cleaned owned resources. No on-screen window matched the selected original's owner/title during the bounded searches. `logs/runtime/games/powder-toy/startup-summary.json` preserves the outcomes. A rendering screenshot, gameplay behavior, native macOS replica, and graphics equivalence remain unverified.

The previously healthy temporary worker directory subsequently disappeared without an investigator deletion. A persistent isolated worker was created under `.runtime-workers/rea-native-x64`. Its wrapper then reported `wineserver crashed` even with exit code 0. Held-out fd probes are classified `runtime_failed`, `target_observation_valid: false`, with original exit unknown and wrapper exit preserved. They must not be counted as original algorithm failures or successes. The latest fd version record likewise reflects this current worker fault; earlier successful canonical REA version evidence remains available separately.

The producing runtime runner now validates target digests, refuses absent workers, detects these observed compatibility faults, and archives previous evidence before replacing the current case paths. No user bottle or global Wine server was terminated; one prefix-scoped restart of the newly created worker was attempted and did not restore health.

`benchmarks/gconv/runtime/help-observation-summary.json` separately records successful real GConv `-h` and `/?`: 3,913 byte-identical bytes, SHA-256 `4a8459cf34d6426e09401d6cf5ae05680af10f515c99697ad3047d3f8df6f875`, empty stderr, exits 0. No conversion or replica comparison is claimed.

## Actual Windows verification entry point

`scripts/verify-originals-windows.py` is prepared for a `windows-latest` CI worker. It requires `sys.platform == "win32"`, downloads only the three declared official release archives, validates archive and executable hashes, creates exact byte fixtures, captures the original 31 probe results, and writes an actual Windows host report. macOS refusal and Python syntax were verified locally; the Windows run is still pending CI execution. Output for artifact upload is `logs/runtime/windows-originals/` (report JSON and exact stdout/stderr). This is explicitly supplemental native Windows process observation because canonical REA Windows PTY ownership remains unsupported.
