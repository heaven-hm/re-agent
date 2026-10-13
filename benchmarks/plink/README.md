# plink CLI-surface port (macOS arm64)

Native C replica of the PuTTY plink 0.85 command-line surface,
recovered with the REA engine (Ghidra inventory + entry/CRT/main
decompilation + owned runtime captures under CrossOver) and verified
by byte comparison. MIT-licensed original by Simon Tatham; this
replica is original code matching observed bytes.

## Declared cases (all exit 0)

- no args, `--help`, `-pgpfp`: byte-identical (CRLF preserved)
- unknown option: `plink: unknown option "<arg>"`, byte-identical
- `-V`: release and source-commit lines identical; platform/compiler
  lines re-reported for the Mac build (documented deviation)

Out of scope: SSH/network transport (host arg exits 1 with notice).

## Reproduce

```sh
cd benchmarks/plink/replica
xxd -i goldens/plinkmac-golden-help.txt > golden_help.h
xxd -i goldens/plinkmac-golden-noargs.txt > golden_noargs.h
xxd -i goldens/plinkmac-golden-pgpfp.txt > golden_pgpfp.h
clang -O2 -o plinkmac plinkmac.c
./plinkmac --help | cmp - goldens/plinkmac-golden-help.txt && echo HELP_OK
./plinkmac | cmp - goldens/plinkmac-golden-noargs.txt && echo NOARGS_OK
./plinkmac -pgpfp | cmp - goldens/plinkmac-golden-pgpfp.txt && echo PGPFP_OK
```

Symbol names in the generated headers start with three underscores
(e.g. `___plinkmac_golden_help_txt`); `plinkmac.c` already uses them.
