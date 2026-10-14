# Batch 1 known limitations (honest ledger)

1. No byte-identical executables: all ports are independent implementations;
   original/replica hashes differ everywhere by design.
2. Guideline-filled gameplay: tetromino rotations/scores/gravity use standard
   values where the binary did not yield exact tables (pixeltetris, tetris).
3. Snake tick (200ms) derives from constructor args; Wine wall-clock too slow
   to corroborate. Score-per-food (+1) and checksum scheme assumed.
4. Clipjar static analysis unavailable (Ghidra 330s budget); recovery is
   strings + runtime only. Image clipboard, hotkey, autopaste unported.
5. imgview not started: UPX stub, no upx on host.
6. Wine/CrossOver is a test harness for originals, never the port vehicle.
7. Screenshots: real window captures where present; absent original-side GUI
   shots are marked UNVERIFIED, not substituted.
8. A parallel session shares this checkout (batch-2 + README); paths under
   benchmarks/native-windows-ports/ are this session's scope.
