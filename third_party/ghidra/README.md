# Ghidra distribution

The preview release carries the unchanged official Ghidra 12.1.2 archive (572,803,866 bytes), with its embedded third-party licenses preserved. This archive version is distinct from REA's bridge verification baseline: the bridge is verified against Ghidra 12.1.4 and accepts the 12.1.x release line, while other accepted builds are reported as compatible but unverified. Verify the archive SHA-256 in manifest.json before extracting. Existing healthy installations are reused. JDK and platform dependencies are not included.

The checked-in `licenses/ghidra-12.1.4-*` files are unchanged reference copies for the BYO 12.1.4 verification runtime. They are not the license files for the 12.1.2 archive; that archive carries its own license and third-party notice files, enumerated in `license-inventory.json`.

This archive is an optional static analysis tool distribution; it does not establish universal reconstruction or full tool-suite completeness.
