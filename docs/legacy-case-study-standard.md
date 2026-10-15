# Legacy-software case study standard

Use this template for **real maintenance, compatibility, or independent-port projects**. Test fixtures belong in the benchmark archive and must not be promoted as verified customer/product maintenance.

## Target identification
- Product, vendor/project, release date, operating systems and architecture
- Original artifact hashes and acquisition provenance
- Legal scope of analysis, modification, porting and redistribution
- Known dependencies, assets, and supported execution workers

## Maintenance objective
- Reproducible failure or independently scoped behavior to preserve
- Operational importance and supported baseline
- Clear acceptance and non-goals

## Investigation evidence
- Static: provider/version, binary hash, functions, imports, data structures, assumptions
- Runtime: owned process/run identity, input, outputs, filesystem/registry/network effects, timing bounds
- Memory: snapshots/traces, regions and dropped-event limitations
- Cross-correlation: evidence IDs and unresolved hypotheses

## Candidate implementation
- Separate source and build instructions
- Dependencies, license boundaries and permitted asset reuse
- Functionality implemented versus stubbed or unsupported

## Independent verification
- Original environment and candidate environment described independently
- Identical inputs and scenario steps, run-bound raw captures and hashes
- Output, failure and state comparisons with normalization and tolerances declared
- Negative tests and minimized counterexamples
- Reproducible command and fresh run evidence
- Explicit coverage, unknown behavior and release blockers

## Visual evidence
Include **only authentic screenshots or video frames** associated with independently captured original and candidate executions. For each image retain: binary hash, run ID, scenario, timestamp/step, platform, raw capture, and whether the display was original or candidate. Do not substitute a fixture screenshot for a legacy-target image. Screen-image equality is not gameplay/state equivalence.

## Publication standard
Mark results as INVESTIGATION, PARTIAL, VERIFIED-SCOPE, or UNVERIFIED. Never present a tool inventory, static scan, generated candidate, or finite passing test suite as proof of a complete application or game port.
