# fd — Batch 2

Application: **PARTIAL**. Acquisition: **PASS**.

Original SHA-256: `d67d27a8e375ed7e9bca2b506a9dd5082bc24547aeba908b863f6f8b8ab0c3b9`. Run-bound comparisons: **15 completed; 14 passing; 1 differing; 0 unverified**. Retained measured outcomes: **14 equal; 1 different**. Discovered functions: 8153; unique retained dossiers: 5.

Read [cases](../functional-tests.json), [static evidence](../static-analysis.md), [runtime/current faults](../runtime-analysis.md) and [licensing](../license-audit.md). Finite cases do not establish complete equivalence.

Original probes were captured through CrossOver before the checkout was renamed. The archived records bind the original PE hash, per-case arguments and run IDs, plus fixture-tree SHA-256 `1127eeee5e052a02d22098f07b494283858b3d0489ee749a72745e05ea14b088`. That hash matches the current fixture tree. The original and replica working-directory strings differ because of the rename; output path and separator differences remain measured separately. A post-rename CrossOver retry was attempted but failed at wineserver startup, so it is retained as a failed worker attempt and not treated as target output.
