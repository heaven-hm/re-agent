# Batch 2 license audit

Audit scope: official release provenance, publisher SHA-256 where supplied, and precise license documents. No upstream implementation source was read. This is a preliminary distribution assessment; it does not certify bundled third-party dependencies or game artwork. Original binaries stay in ignored `originals/` directories and are not committed.

| Target/version        | License evidence retrieved                                                                          | Distribution status                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fd 10.5.0             | Exact tag `LICENSE-MIT`, official API also detects Apache-2.0                                       | Keep original local; preserve chosen license/copyright notices if redistributed and audit bundled dependency notices                                                               |
| ripgrep 15.2.0        | Exact tag `COPYING` declares MIT or Unlicense choice                                                | Keep original local; preserve selected license and applicable notices before binary redistribution                                                                                 |
| bat 0.26.1            | Exact tag `LICENSE-MIT`, official API also detects Apache-2.0                                       | Keep original local; dependencies/syntax/theme assets need separate audit before distribution                                                                                      |
| OpenLieroX 20260912.1 | Exact tag `COPYING.LIB` is GNU Library GPL v2; root `COPYING` absent; GitHub classifier NOASSERTION | Whole-release/asset grant unresolved; do not bundle original game based solely on library license text                                                                             |
| SuperTux 0.7.0        | Exact tag `LICENSE.txt` is GPL v3 text                                                              | Original distribution requires applicable GPL source/notice compliance; bundled GPL text and font license documents inspected; broader artwork/dependency grants remain unverified |
| Powder Toy 100.1.400  | Exact tag `LICENSE` is GPL v3 text                                                                  | Original distribution requires applicable GPL source/notice compliance; dependencies remain unverified                                                                             |

The release archives/executable acquisition manifests record exact publisher URL, downloaded hash and PE identity. Publisher digest matching establishes artifact integrity against publisher metadata; it does not establish safety or behavioral equivalence.

## Reproducible document acquisition

Only GitHub license/contents API calls were used: `/repos/OWNER/REPO/license` and `/repos/OWNER/REPO/contents/LICENSENAME?ref=EXACT_TAG`. The OpenLieroX root directory request listed only license-document paths; implementation file contents were not fetched. Saved API responses and decoded exact-tag license documents live in `analysis/license-documents/`.

Official references:

- https://github.com/sharkdp/fd/blob/v10.5.0/LICENSE-MIT
- https://github.com/BurntSushi/ripgrep/blob/15.2.0/COPYING
- https://github.com/sharkdp/bat/blob/v0.26.1/LICENSE-MIT
- https://github.com/openlierox/openlierox/blob/20260912.1/COPYING.LIB
- https://github.com/SuperTux/supertux/blob/v0.7.0/LICENSE.txt
- https://github.com/The-Powder-Toy/The-Powder-Toy/blob/v100.1.400/LICENSE

No complete third-party SBOM audit or all-artwork permission audit has passed. Independently reconstructed code and generated fixtures may be committed; this report grants no right to redistribute original closed or license-unresolved assets.

## Completed release archives and bundled notice inspection

All six publisher artifacts completed acquisition, matching their publisher SHA-256 digests in `manifests/*-acquisition.json`. Original executable/DLL/assets bytes remain private in ignored `originals/`; provenance verification does not authorize unrestricted redistribution.

Only bundled text license/notice documents were opened. No source code, binary implementation, fonts or artwork content was read for this audit. The acquisition scanner's broad name matching also lists PNG filenames containing “notice”; these are artwork filenames, not license documents, and were excluded from license conclusions.

| Target     | Actual bundled text license documents examined                                                                                  | Remaining limitations                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fd         | LICENSE-MIT and LICENSE-APACHE                                                                                                  | Distribution dependencies and SBOM still unverified                                                                                                                    |
| ripgrep    | COPYING, UNLICENSE, LICENSE-MIT                                                                                                 | COPYING explicitly offers MIT/Unlicense; dependency distribution notices still unverified                                                                              |
| bat        | LICENSE-MIT and LICENSE-APACHE                                                                                                  | Embedded themes/syntax and dependency obligations unverified                                                                                                           |
| OpenLieroX | No license text discovered in the complete release archive                                                                      | One PNG name contains “notice”, which supplies no grant; official COPYING.LIB alone does not certify the entire game/assets                                            |
| SuperTux   | doc/LICENSE.txt (GPLv3), font license documents for Varela Round, Dekko, Noto Sans, Source Code Pro, MapoBackpacking and Roboto | Five font notices identify SIL Open Font License1.1; MapoBackpacking identifies KOGL Type1. All remaining artwork/audio/dependency permissions require separate review |
| Powder Toy | Standalone EXE has no adjacent bundled text license notice                                                                      | Official exact-tag GPLv3 document retrieved; complete dependency/source-offer compliance still unverified                                                              |

The font document named SOURCECODEPRO_LICENSE.md contains license terms for a font; it is not implementation source code. Reading it does not violate the binary-only reconstruction constraint. No all-assets or all-dependencies license certification is asserted.
