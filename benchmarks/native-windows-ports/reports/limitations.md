# Batch 1 known limitations (honest ledger)

1. No byte-identical executables: all ports are independent implementations;
   original/replica hashes differ everywhere by design.
2. Guideline-filled gameplay: tetromino rotations/scores/gravity use standard
   values where the binary did not yield exact tables (pixeltetris, tetris).
3. Snake tick (200ms) derives from constructor args; Wine wall-clock too slow
   to corroborate. Score-per-food (+1) and checksum scheme assumed.
4. Clipjar static analysis unavailable (Ghidra 330s budget); recovery is
   strings + runtime only. Image clipboard, hotkey, autopaste unported.
5. imgview's UPX-packed original was unpacked and statically analyzed; the
   independent macOS replica was built and a replica-only PNG display capture
   is retained. Original-versus-replica GUI comparison remains UNVERIFIED:
   the current host could not capture a display during the latest attempt
   (`screenshots/imgview-capture-attempt.json`).
6. Wine/CrossOver is a test harness for originals, never the port vehicle.
7. Screenshots: real window captures where present; absent original-side GUI
   shots are marked UNVERIFIED, not substituted.
8. The benchmark catalog also includes Batch 2 targets and records their
   acquisition, reconstruction, evidence, and report paths. Their overall
   states remain target-specific; analysis-only games are not marked as
   reconstructed.
