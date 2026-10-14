# Batch 2 games: real static evidence and blockers

No game port or gameplay equivalence has passed. This report records the actual REA operations run against publisher binaries and their resource-related failures. No upstream implementation source, game assets, or prebuilt macOS port was used as a reconstruction.

| Target                | Original status                                                                                                                 | REA static result                                                                                                 | Port status              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Powder Toy 100.1.400  | Exact official Windows x64 EXE acquired; publisher SHA-256 matched                                                              | PE resource inspection PASS; full Ghidra startup timed out at330s,900s retry cancelled when host exhausted memory | UNIMPLEMENTED/UNVERIFIED |
| OpenLieroX 20260912.1 | Official archive hash matched; exact Windows x64 EXE extracted independently; complete original runtime/assets folder extracted | PE resource inspection PASS; Ghidra cancelled when host exhausted memory                                          | UNIMPLEMENTED/UNVERIFIED |
| SuperTux 0.7.0        | Exact official Windows portable archive completed; publisher SHA-256 matched; full runtime/assets extracted                     | REA PE resource inspection PASS; full Ghidra/game function analysis unperformed after memory exhaustion           | UNIMPLEMENTED/UNVERIFIED |

## Artifact identities and actual REA operations

### powder-toy

- Windows original SHA-256: `df32b616b31dabae10b82028731ebdfd6867c872198b81f29d418cbafbf460c3` (8690342 bytes).
- REA operation: `inspect_pe_resources`; evidence `ev_8c274c9b179b5d726a2ce90fe9c8a9d3ddc0e9cf32112aed25f5381034ee1796`.
- Actual observed inventory: 12 resource entries, 2 icon groups; coverage and limitations remain in the evidence JSON.
- Retained evidence: `analysis/powder-toy/rea-pe-resources.json`; failed/cancelled deep analysis envelopes in the same directory.

### openlierox

- Windows original SHA-256: `0f79c968ab9aabd8cb99e173500fa241e883846fd3e0c9ca2f7f0bf3771fa5c1` (12853347 bytes).
- REA operation: `inspect_pe_resources`; evidence `ev_416d2dda3a137a4a85fb92b16e4f1bcafc2c1f2125c591a1f805581038534786`.
- Actual observed inventory: 7 resource entries, 1 icon groups; coverage and limitations remain in the evidence JSON.
- Retained evidence: `analysis/openlierox/rea-pe-resources.json`; failed/cancelled deep analysis envelopes in the same directory.

Powder Toy first Ghidra run established importer recognition of MinGW PE x64 and an external debug-info link to `powder.dbg`; the associated DWARF sidecar was absent. Its startup timed out before REA function inventory returned, so no discovered-function count or particle algorithm is asserted. Official release metadata lists a matching Windows x64 `.dbg` asset; adding explicit sidecar symbol evidence is a possible future improvement, with no source-code access required.

OpenLieroX standalone PE inventory records image base, entry RVA,22 imported DLLs and10 sections in `analysis/openlierox/pe-inventory.json`. The verified archive SHA-256 is `fbc14a948166bea0fa34c9d0fe26e3d46a96f2a7bec0dd2fa8cba06459cb43ad`; executable SHA-256 is `0f79c968ab9aabd8cb99e173500fa241e883846fd3e0c9ca2f7f0bf3771fa5c1`. Archive names contain no license/COPYING documents. The independently extracted analysis EXE remains under ignored `originals/openlierox/analysis-input/`. The complete original runtime/DLL/assets layout is now also available under `originals/openlierox/extracted/openlierox-20260912.1-windows/`.

## Cancellation and cleanup

The two owned active REA commands were sent SIGINT through their signal/cleanup path after the host reported application-memory exhaustion. Both returned structured `cancelled` error envelopes; no success substituted for cancellation. The owned Powder Toy worker was absent from the subsequent process check. No further Ghidra job was launched after the memory warning.

## Next required evidence

1. Use the now-complete verified original runtime layouts for authorized isolated runtime capture.
2. Free host resources, then run one Ghidra analysis at a time within the configured startup/memory budget.
3. Discover actual game functions and data structures, correlate runtime addresses, capture deterministic original game state/inputs.
4. Choose one named behavior from recovered evidence, implement independently, and compare identical input/state sequences.
5. Preserve every mismatch and unresolved dependency as failures; only claim success over the declared tested artifact/scope.

No byte-identical Windows-to-Mach-O executable is claimed. Equality of specific generated files or traces remains testable once originals, recovered behavior and independent macOS implementation are available.

## Completed acquisition update

All six Batch 2 official Windows artifacts are now acquired; all six acquisition manifests report PASS with verified publisher digests. This establishes input provenance only, not reconstruction or behavior parity. Both OpenLieroX and SuperTux game asset/runtime folders are completely extracted.

SuperTux archive SHA-256: `d637f79e8a77fc4d42982cfea40f74f812d5050b9d6d53309b287dae734e1970` (308538500 bytes). Its original PE at `originals/supertux/extracted/SuperTux-portable/bin/supertux2.exe` has SHA-256 `6249f25a6ac1cc3d27955ca09852b8368618ce58ad9c13e0c5084051c2c02b43`. REA `inspect_pe_resources` succeeded with 1 resource entry and 0 icon groups; evidence `ev_34d4d7b4a718806589e62d4f3970327162fbc370ab38069bb805ebdff4219f35` is preserved in `analysis/supertux/pe-resources.json`. No SuperTux function or gameplay recovery has passed.
