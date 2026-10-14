# gconv (gconv-qvm-toolchain) — proof (behavioral parity only)

Independent `qvmtool` reimplementation covering gconv error behavior for QVM
scripts. Not byte-identical to the original executables; behavioral parity only
(see `reports/limitations.md:3-4`).

## Original binary identity

- Driver: `/Users/haseeb-mir/Downloads/tools/gconv.exe (2003, PE32 x86 console, 192KB)` (`manifest.json:4`)
- Driver SHA-256: `5616139f4f94e7299b0703954d6a3eeda36fdda5cb17e19fa32163ba6b326c78` (`manifest.json:5`)
- Library: `/Users/haseeb-mir/Downloads/tools/gconvapi.dll (393KB, exports gcGetNumberOfErrors/gcParseCommandLine/gcNewOption/gcInit/gcExecuteScript/gcMessage)` (`manifest.json:6`)
- Library SHA-256: `f76ce99b51402bba2b93b43135c1e6a622545e82b895f810309dad6fbaf4b6de` (`manifest.json:7`)
- Codec: `/Users/haseeb-mir/Downloads/tools/vqdll.dll (1998, VQ texture codec)` (`manifest.json:8`)
- Corpus: `1786 .qvm scripts from a local IGI2 install (originals untouched; copies executed)` (`manifest.json:9`)

## Analysis performed (binary only, no app source)

- Driver scale: `547` procedures (`manifest.json:12`).
- QVM format: `LOOP magic; 8-u32 header (strtab offset); offset table; NUL string table; task/data/bytecode sections` (`manifest.json:13`).
- Opcodes: `byte + fixed operand (0x0e/0x12=u32, 0x0f/0x13=u8, 0x10/0x14=u16); mnemonics ILLEGAL/MINUS/ASSIGN/PUSHM/PUSH1/PUSH0/PUSHIIW/PUSHIIB/PUSHII/PUSHI/PUSHSIW/PUSHSIB/PUSHSI/PUSHS/PUSHA/PUSHF/PUSHW` (`manifest.json:14`).
- Entry rule: `first identifier-like string (len>=4) in table order vs empty host registry (120/120)` (`manifest.json:15`).
- Natives seen: `AISquad_DefaultHandler, AISquad_GetState, AIFunction_GetCurrentEventType, DefinePhysicsObjType, Task_DeclareParameters` (`manifest.json:16-22`).

## Replica build

Source/binary/commands as recorded in manifest (build not re-verified here):

```sh
cd benchmarks/native-windows-ports/gconv/replica
clang -O2 -o qvmtool qvmtool.c
./qvmtool info|dis|run <script.qvm>
```

Build string source: `manifest.json:23-29`. Commands: `info (header/strings), dis (linear disassembly), run (error-parity executor stub)` (`manifest.json:28`).

## Verification

| Case                                                                                                    | Status     | Basis                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Differential error parity: 120/120 real IGI2 scripts, identical Unknown-identifier lines + error counts | PASS       | `manifest.json:31`                                                                                         |
| `info` header/string-table reporting                                                                    | PASS       | `manifest.json:28` (command exists as recorded; output parity claims rest on the differential entry above) |
| `dis` linear disassembly                                                                                | PARTIAL    | `manifest.json:28` (command exists; full mnemonic/operand parity not claimed)                              |
| Full VM execution with engine natives                                                                   | UNVERIFIED | `manifest.json:32` (explicitly out of scope)                                                               |

Scope note: `error-behavior parity only; full VM execution with engine natives is UNVERIFIED and out of scope` (`manifest.json:32`).

## Non-goals

- No byte-identical executables; independent implementation by design (`reports/limitations.md:3-4`).
- No full VM execution with engine natives.
- No codec (`vqdll.dll`) or library (`gconvapi.dll`) ABI reimplementation beyond the recorded error-parity stub.
- No modification of original `.qvm` corpus files (copies executed).

## Screenshots

No committed screenshots for this target in `../screenshots/` (present files cover only `notepadmac-*`, `pixelmac-*`, `tetrismac-*`; CLI tool has no GUI capture).
