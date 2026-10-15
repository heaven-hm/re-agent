# Game behavior verification

REA Engine now provides a local, deterministic PNG frame-sequence comparator:

```sh
npm run --silent compare:game-frames -- ./evidence/original-frames ./evidence/replica-frames
```

Capture both runs at the same declared input/tick checkpoints and write frames
as identically named PNG files (for example `000001.png`). The comparator pairs
files by name, hashes both source files, reports dimensions and changed-pixel
metrics per frame, and exits nonzero for missing or different frames. Default
channel threshold `0` means exact RGBA pixel equality. An optional threshold is
available for explicitly tolerated capture noise, but that result is labeled
`within_channel_threshold` and is never called exact. The JSON on stdout is the
comparison receipt; retain it with the original and replica frame artifacts,
their hashes, the test input log, executable identities, and capture settings.

The comparator reuses REA's validated PNG pixel-diff implementation. It does
not operate a game, synthesize inputs, read game memory, or infer gameplay
state. The repository has no general cross-platform deterministic game-input
replay or game-state oracle yet. For an end-to-end game comparison, a runner
must still supply matched inputs and checkpoints, record observable game state
where the target exposes it, and compare those observations separately from
rendered frames. A frame match alone does not establish game equivalence.

## Tool roles and limits

| Tool                                       | Useful evidence                                                                                                     | What it cannot prove                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compare:game-frames` (bundled REA script) | Exact or thresholded RGBA comparison for ordered PNG captures, per-frame SHA-256 and pixel metrics                  | Inputs, logic, hidden state, timing, audio, network behavior, or uncaptured frames                                                                                                                   |
| FFmpeg (`ffmpeg`)                          | Audio/video inspection and full-reference PSNR/SSIM/VMAF metrics when the local build includes the relevant filters | Exact gameplay or state equivalence; perceptual scores are not byte equality                                                                                                                         |
| RenderDoc                                  | Graphics API frame capture and draw/resource/shader inspection on supported API/platform combinations               | General application behavior or full game equivalence. It is not a universal game comparator and is unsuitable for REA's general third-party proprietary-game workflow under its stated usage policy |
| apitrace                                   | Graphics API call traces, replay and image/state diffs for supported graphics APIs                                  | Non-graphics game logic, unsupported APIs, or full behavior. Interception requires target-specific authorization and a supported runtime                                                             |
| SDL gamepad API                            | Normalized gamepad inputs for applications built with SDL                                                           | Replay of arbitrary third-party game input or deterministic behavior by itself                                                                                                                       |

REA's current autonomy inventory probes FFmpeg and RenderDoc availability. A
probe is only tool discovery/health evidence: it does not mean the tool is
installed, licensed for a target, or wired as an analysis provider. This
checkout has no general RenderDoc or apitrace provider. See the [open-source
tool gap audit](verification/rea-engine/open-source-tool-gaps-2026-10-14.md)
and [tool distribution audit](verification/rea-engine/toolchain-distribution-audit-2026-10-14.md)
for host-specific availability and integration status.

## Evidence standard

Report separate outcomes for input/state behavior, visual frames, audio, timing,
file/network effects, and the declared test suite. Preserve original capture
files and run manifests; do not silently resize, recolor, align, or normalize
images to make them pass. If normalization is necessary, record its exact
parameters and retain raw comparisons too. Passing every declared case is
empirical test-suite success, not a proof of universal equivalence. A formal
equivalence claim requires a proof method and stated assumptions that cover the
relevant implementation behavior.
