# LTRData Luhn utility — finite-suite reconstruction

**Feature status: PASS for five declared suites; full-application status: PARTIAL.** The independent managed replica matched the original utility's captured terminal bytes in those suites. This does not prove complete equivalence or executable byte identity.

## Inputs and reconstruction

- Original published managed assembly SHA-256: `e30a028e8db474b8a3b17f7088efb8054b818f08b1e30011a50112480d5be353`.
- Replica source: [`LuhnReplica.cs`](../../scripts/benchmarks/LuhnReplica.cs); included output assembly: [`Replica.dll`](replica/Replica.dll).
- The reconstruction used binary CIL/static facts and runtime observations; the original source repository was not used to implement behavior.

## Retained proof

The [structured run report](../../docs/verification/rea-engine/luhn-report.json) records five suites, 230 numeric and Unicode input lines, equal original/replica terminal SHA-256 values for each suite, evidence IDs, and successful exit codes. The comparison is exact for the recorded terminal bytes. The report explicitly says the original ran under macOS .NET 10; this is not native Windows OS execution, whole-app equivalence, or byte-identical executable proof.

Re-run with `node scripts/verify-luhn-reconstruction.mjs /absolute/path/to/luhn.dll` using the authorized original assembly.
