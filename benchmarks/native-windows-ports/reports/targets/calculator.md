# Apple Calculator — finite display-boundary experiment

**Feature status: PASS for the declared finite suite. Application reconstruction status: PARTIAL.** Ten scripted basic arithmetic cases produced equal final displayed values after stated normalization. This does not prove equivalence of the Calculator applications or their internal arithmetic implementations.

## Inputs and implementation

- Original: the installed macOS Calculator binary at `/System/Applications/Calculator.app/Contents/MacOS/Calculator`, SHA-256 `0ebdae8618cd675bcf492d6fc8f48dd79c4712e0532c80f1a1cb59269fd76be9` at capture time. It is a local system app, not included in this repository.
- Replica source: [CalculatorEngine.swift](../../../../scripts/calculator/CalculatorEngine.swift) and [CalculatorWindow.swift](../../../../scripts/calculator/CalculatorWindow.swift). The report records the replica executable hash at run time; its original output path is ephemeral and is not present in the checked-in tree.
- Driver: [verify-calculator-reconstruction.mjs](../../../../scripts/verify-calculator-reconstruction.mjs).
- Structured case report: [calculator-report.json](../../../../docs/verification/rea-extended/calculator-report.json).

## Evidence

The JSON report contains 10/10 historical final-display comparisons and evidence IDs for each case. Cases cover simple addition, subtraction, multiplication and division, including a fractional result. It declares normalization of bidi controls, English grouping separators and Unicode minus. Those records are retained as prior finite-suite evidence; this turn could not rerun the verifier in the current execution environment.

There is no accepted, fresh screenshot pair. The historical [calculator.png](../../../../output/autonomy/calculator.png) is 198×350 pixels, matching the replica surface dimensions, but has no adjacent process/window identity record and is not accepted here as proof of either app. The earlier attribution of that file as an original-app capture is unsubstantiated and should not be relied on. A new capture attempt is documented in [capture-attempt.json](../../screenshots/calculator/capture-attempt.json). It records the system binary hash and the exact failures: LaunchServices returned `kLSNoExecutableErr` when asked to open the installed Calculator, and `screencapture` reported `could not create image from display 0`. No screenshot was generated, no PID/window identity could be bound to a capture, and no replica process was observed. A side-by-side visual comparison therefore remains unverified.

## Open behavior

Only final displayed results for the listed two-operand scripts were compared in the historical run. Intermediate rendering, reset/backspace semantics, broader input sequences, and internal function equivalence were not established. The probe infers arithmetic laws within a limited hypothesis class. The JSON report lists these limits explicitly. The current host has no usable display capture path, so original/replica process-bound screenshots remain a blocker; feature status does not imply application or visual equivalence.
