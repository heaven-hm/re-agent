# ripgrep — Batch 2

Application: **PARTIAL**. Acquisition: **PASS**.

Original SHA-256: `14231169855ec5205cf5a1b6f1db358ff4aed4247c86b69ce8aae647c77f6680`. Run-bound comparisons: **8 completed; 8 passing; 0 differing; 0 unverified**. Retained measured outcomes: **8 equal; 0 different**. Discovered functions: None; unique retained dossiers: 0.

Read [cases](../functional-tests.json), [static evidence](../static-analysis.md), [runtime/current faults](../runtime-analysis.md) and [licensing](../license-audit.md). Finite cases do not establish complete equivalence.

These cases ran through CrossOver on macOS, not Windows. One case (version) is raw-byte exact; six search cases pass only after normalizing the leading relative-path separator (`.\` to `./`), with their raw byte mismatches retained. The invalid-regex stderr case differs. This is a finite CLI subset, not full application equivalence.
