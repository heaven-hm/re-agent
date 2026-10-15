# radare2 bounded disassembly smoke

This is a host-tool smoke on macOS `/bin/ls`, not one of the Windows Batch 2
benchmarks and not evidence of reconstruction or behavioral equivalence.

## Import-table gate

Before disassembly, `rabin2 -i /bin/ls` completed with exit code 0. Its complete
stdout, stderr, command, binary hash, tool hash, and import classifications are
preserved in [imports-evidence.json](imports-evidence.json), [imports.txt](imports.txt),
and [imports.stderr](imports.stderr). `rabin2 -e /bin/ls` supplied the selected
entry address `0x100003a58`.

## Raw radare2 result

`r2 -q -c 'pdj 8 @ 0x100003a58' /bin/ls` completed with exit code 0 and returned
eight sequential instructions. The exact JSON and stderr are in
[disassembly.json](disassembly.json) and [disassembly.stderr](disassembly.stderr);
[disassembly-evidence.json](disassembly-evidence.json) records the binary and
radare2 hashes and output digest. Inspection showed radare2 6.2.0 emits the
address field as `addr`; the adapter normalizes that field to `address` and
retains only `size`, `opcode`, `disasm`, and `bytes` when emitted.

## REA provider result

The provider-level execution was attempted and **failed**. Its result is
preserved in [provider-result.json](provider-result.json). The host could not
complete owned-process cleanup (`spawn EPERM` / process-ownership inspection
failure in this sandbox), so provider success is unverified. The top-level
record names `inspect_radare2_disassembly`, but its nested cleanup error names
`inspect_radare2_function_inventory`; that inconsistency means the retained
record does not independently prove which provider operation produced the
failure. Do not treat it as a successful provider smoke. The raw `r2` result
above proves only the host tool's bounded decode.
