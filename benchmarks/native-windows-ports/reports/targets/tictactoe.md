# TicTacToe-AI — finite `CheckGameStatus` reconstruction

**Feature status: PASS for the declared `CheckGameStatus` input domain. Whole-game status: PARTIAL.** REA inspected the published executable and reconstructed the selected managed method without consulting the application's source during implementation. The latest rerun executed the original and reconstructed assemblies for all **19,683** possible 3×3 board assignments (`3^9`), and the structured result/indicator records matched with zero mismatches. All six captured render PNGs also matched byte-for-byte. The raw PTY terminal streams did **not** match: the original capture contains an additional carriage return at a terminal frame boundary. The report preserves that discrepancy rather than normalizing it away as a byte match. This result applies only to that method and declared board domain; it does not establish byte-identical executables or complete game equivalence.

## Inputs, source, and evidence

- Original: [published TicTacToe-AI executable](../../../tictactoe/original/TicTacToe.exe), SHA-256 `df4aec7299b1e002ca0e1008b20a889e0cfe5b482a19958399fab16ac6090402`.
- Reconstructed source and executable: [reconstructed project](../../../tictactoe/reconstructed/), including recovered `Form1.cs` and `Replica.exe`.
- License: [GPL-3.0](../../../tictactoe/LICENSE). The pinned source archive is retained for license compliance; it was not used to implement the reconstruction.
- Machine-readable results: [game report](../../../../docs/verification/rea-engine/game-report.json), [execution manifest](../../../../docs/verification/rea-engine/manifest.json), and [functional results](../functional-results.json).
- Latest reproducible run: [current result JSON](../../../../docs/verification/rea-engine/game-report-current-2026-10-14.json) and [full captured evidence archive](../../../../docs/verification/rea-engine/game-execution-evidence-2026-10-14.zip). The run records `boardRecordsEqual: true`, `boardRecordMismatchCount: 0`, and `terminalBytesEqual: false`.
- Retained render images: [original](../../../../docs/verification/rea-engine/game-original.png) and [reconstruction](../../../../docs/verification/rea-engine/game-replica.png).

## Reproduce

From the repository root, recover a fresh copy from the published executable:

```sh
node scripts/recover-tictactoe-replica.mjs output/autonomy/tictactoe-recovery
```

Then run the differential verifier with a working local X11 display and the recorded Mono/libgdiplus dependencies. `DISPLAY` must name that display; adjust `REA_GDIPLUS_DIRECTORY` if the library is elsewhere.

```sh
DISPLAY=:97 REA_GDIPLUS_DIRECTORY=third_party/libgdiplus \
  node scripts/verify-tictactoe-reconstruction.mjs \
  benchmarks/tictactoe/original/TicTacToe.exe \
  output/autonomy/tictactoe-recovery/Replica.exe
```

The verifier writes fresh evidence under `output/autonomy/`. Its recovery step uses the locally installed ILSpy/Roslyn/Mono toolchain described in [the benchmark instructions](../../../README.md#game-published-tictactoe-ai); those host dependencies are not provided by these commands. The latest run was captured on macOS 15.3.1 ARM64 with Mono/X11 on the local Xvfb display `:187`; its uncompressed evidence directory is `output/autonomy/tictactoe-1791994732746/`.

## Render evidence and limits

The PNGs are real `Form.DrawToBitmap` renders after button-handler sequences. Their byte equality is evidence for those recorded render states on the **same ARM Mono/X11 runtime on macOS**. They are not screenshots of the original running on Windows, do not establish native Windows rendering fidelity, and do not represent independent desktop screenshot captures. The UI can be viewed in the [original final-state image](../../../../docs/verification/rea-engine/game-original.png) and [replica final-state image](../../../../docs/verification/rea-engine/game-replica.png).

![TicTacToe original final-state render](../../../../docs/verification/rea-engine/game-original.png)

![TicTacToe reconstructed final-state render](../../../../docs/verification/rea-engine/game-replica.png)

The AI move selection and RNG, complete menus, timing, sound, and other game behavior were not verified. The tested status method exhausts its declared 19,683-board domain; it does not exhaust all application inputs or prove whole-game equivalence.
