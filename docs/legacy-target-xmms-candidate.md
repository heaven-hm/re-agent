# Candidate for the first independently verified legacy application case study

## XMMS 1.2.x — legacy music player

- Reference source mirror: https://github.com/sedwards/xmms
- Historical release archive: https://fossies.org/linux/misc/old/xmms-1.2.11.tar.gz/
- License: upstream repository lists GPL-2.0. Verify exact release COPYING, individual plugin licenses and dependencies before redistribution.
- Current modernization context: https://github.com/rafael2k/dmms (a maintained modernization fork). Do not claim original work already performed by that project as an RE-Agent contribution.

**Status: CANDIDATE — not acquired, compiled, executed, repaired or ported by RE-Agent.** This is a target assessment, not a completed case study.

## Appropriate real maintenance scope

1. Reproduce a demonstrable legacy compatibility problem in the original build, documenting old GTK/GLib, audio backend, plugin and toolchain dependencies.
2. Recover the relevant static call paths and runtime behavior with RE-Agent; retain binary and tool hashes.
3. Patch a separately authorized copy or create an independent compatibility layer for a scoped playback feature.
4. Verify with legally redistributable, generated audio fixtures (WAV; avoid unlicensed commercial recordings).
5. Run original and candidate in separate controlled graphical Linux environments. Record plugin decisions, play/pause/seek state, playback duration, output WAV/PCM hashes and error paths.
6. Capture paired real application screenshots with run/profile identities and exact scenario steps; screenshots alone cannot prove playback or fidelity.
7. Publish source, patches and modified binaries only after verifying license notices, source-offer obligations, audio plugin dependencies and packaging rights.

## Gate

No README 'completed preservation work' entry until:
- Build/install/execute evidence from the original and candidate.
- At least one reproducible defect or feature improvement beyond a toy reconstruction.
- Static + runtime + memory observations, including unsupported paths.
- At least one PASS and deliberately failing negative test on real executions.
- Validated manifest via `node scripts/verify-case-study.mjs path/to/case.json`.
- Authentic before/after screenshots with recorded provenance where the scope is graphical.
- Full rights/distribution review of exact sources and artifacts.

Alternative: pick an equally rights-clear discontinued document viewer/editor if the actual environment can be reproduced more economically. Do not count merely reading GPL source as reverse-engineering success.
