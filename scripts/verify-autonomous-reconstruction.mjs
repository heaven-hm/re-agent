import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AutonomousInvestigation } from "../dist/application/autonomy/AutonomousInvestigation.js";
const exec = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const calculatorMode = process.argv.includes("--calculator");
const outputArgument = process.argv
  .slice(2)
  .find((value) => !value.startsWith("--"));
const output = resolve(
  outputArgument ??
    join(repo, "output/autonomy", `reconstruction-${Date.now()}`),
);
if (outputArgument !== undefined) await mkdir(output);
else await mkdir(output, { recursive: true });
if (calculatorMode) {
  if (process.platform !== "darwin")
    throw new Error("Installed Apple Calculator benchmark requires macOS");
  const binary =
    "/System/Applications/Calculator.app/Contents/MacOS/Calculator";
  const sha256 = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  await exec("/usr/bin/open", ["/System/Applications/Calculator.app"]);
  const probe = join(output, "calculator-probe.swift");
  await writeFile(
    probe,
    `import AppKit
import ApplicationServices
import Foundation
let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.calculator")
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String:Any]] ?? []
let own = windows.filter { ($0[kCGWindowOwnerName as String] as? String) == "Calculator" }
print(String(data: try! JSONSerialization.data(withJSONObject:["accessibility_trusted":AXIsProcessTrusted(), "screen_capture_allowed":CGPreflightScreenCaptureAccess(),"processes":apps.map { ["pid": $0.processIdentifier,"executable": $0.executableURL?.path ?? ""] as [String:Any] },"windows": own],options:[.sortedKeys]),encoding:.utf8)!)
`,
  );
  const result = await exec(
    "/usr/bin/swift",
    ["-module-cache-path", join(output, "modules"), probe],
    { timeout: 120000 },
  );
  const observed = JSON.parse(result.stdout);
  await writeFile(join(output, "calculator-ui-probe.json"), result.stdout);
  const signing = await exec("/usr/bin/codesign", [
    "-dv",
    "--verbose=2",
    "/System/Applications/Calculator.app",
  ]);
  await writeFile(join(output, "calculator-provenance.txt"), signing.stderr);
  const analysis = await exec("r2", ["-q", "-c", "aaa;aflj", binary], {
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
  });
  await writeFile(join(output, "calculator-functions.json"), analysis.stdout);
  const window = observed.windows.find((w) =>
    observed.processes.some((p) => p.pid === w.kCGWindowOwnerPID),
  );
  if (!window)
    throw new Error(
      "Calculator selected window unavailable; observation saved",
    );
  const cli = join(repo, "scripts/rea.mjs");
  const ui = await exec(
    process.execPath,
    [
      cli,
      "observe-native-ui",
      binary,
      "--pid",
      String(window.kCGWindowOwnerPID),
      "--window-id",
      String(window.kCGWindowNumber),
      "--screenshot",
      "false",
      "--json",
    ],
    { timeout: 180000, maxBuffer: 16 * 1024 * 1024 },
  );
  await writeFile(join(output, "calculator-rea-ui.json"), ui.stdout);
  const evidence = JSON.parse(ui.stdout);
  assert.ok(
    evidence.evidence_id && !evidence.error,
    "REA produced genuine native UI evidence",
  );
  const button = evidence.normalized_result.initial.nodes.find(
    (node) => node.role === "AXButton" && node.actions.includes("AXPress"),
  );
  assert.ok(button, "Selected window exposes an actionable button");
  const scenario = await exec(
    process.execPath,
    [
      cli,
      "capture-native-ui-scenario",
      binary,
      "--pid",
      String(window.kCGWindowOwnerPID),
      "--window-id",
      String(window.kCGWindowNumber),
      "--screenshot",
      "false",
      "--steps",
      JSON.stringify([
        { kind: "click", path: button.path },
        { kind: "wait", milliseconds: 100 },
      ]),
      "--json",
    ],
    { timeout: 180000, maxBuffer: 16 * 1024 * 1024 },
  );
  await writeFile(
    join(output, "calculator-rea-interaction.json"),
    scenario.stdout,
  );
  const interaction = JSON.parse(scenario.stdout);
  assert.ok(interaction.evidence_id && !interaction.error);
  assert.ok(
    interaction.normalized_result.steps.every(
      (step) => step.outcome === "completed",
    ),
  );
  const report = {
    kind: "proprietary-desktop-observation",
    binary,
    sha256,
    discoveredFunctions: JSON.parse(analysis.stdout).length,
    uiEvidenceId: evidence.evidence_id,
    interactionEvidenceId: interaction.evidence_id,
    claims: [
      "Installed Apple Calculator binary hashed and static functions discovered",
      "Real selected native Calculator accessibility tree captured with upstream REA",
      "Discovered accessibility button pressed and resulting UI captured through REA",
    ],
    limitations: [
      "Calculator implementation has not been reconstructed",
      "No original/replica Calculator differential suite or fidelity claim",
      "Function inventory contains analyzer candidates and imported stubs; these are not verified behavior",
    ],
  };
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const original = join(output, "original");
const replica = join(output, "replica");
const replicaSource = join(output, "replica.c");
const run = async (command, args, options = {}) =>
  exec(command, args, {
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
await run("clang", [
  "-O0",
  "-g",
  join(repo, "tests/fixtures/autonomy/branch-calibration.c"),
  "-o",
  original,
]);
const inventory = await run("r2", ["-q", "-c", "aaa;aflj", original]);
const functions = JSON.parse(inventory.stdout);
assert.ok(
  functions.some((f) => f.name.includes("rea_unknown_transform")),
  "Real static discovery found the compiled unknown function",
);
await writeFile(join(output, "functions.json"), inventory.stdout);
const transform = functions.find((f) =>
  f.name.includes("rea_unknown_transform"),
);
const disassembly = await run("r2", [
  "-q",
  "-c",
  `aaa;pdfj @ ${transform.addr}`,
  original,
]);
await writeFile(join(output, "transform-disassembly.json"), disassembly.stdout);
assert.ok(
  JSON.parse(disassembly.stdout).ops.some((op) =>
    ["cjmp", "jmp"].includes(op.type),
  ),
  "Static CFG contains branching, motivating a branch hypothesis",
);
const experiments = [];
const observe = async (x) => {
  const execution = await run(original, [String(x)]);
  const y = Number(execution.stdout.trim());
  assert.ok(Number.isSafeInteger(y));
  experiments.push({ input: x, output: y });
  return y;
};
const intercept = await observe(0);
const positiveSlope = (await observe(1)) - intercept;
const source = (negativeSlope) =>
  `#include <stdio.h>\n#include <stdlib.h>\nint main(int argc,char **argv){if(argc!=2)return 2;char *end;long x=strtol(argv[1],&end,10);if(*end||end==argv[1]||x < -1000000||x > 1000000)return 2;printf("%ld\\n",${intercept}L+(${negativeSlope === undefined ? `${positiveSlope}L*x` : `x<0?${negativeSlope}L*x:${positiveSlope}L*x`}));return 0;}\n`;
await writeFile(replicaSource, source());
const inputs = [
  -1000000, -999, -100, -10, -3, -2, -1, 0, 1, 2, 3, 10, 100, 999, 1000000,
];
const cases = inputs.map((x, i) => ({
  id: `input_${i}`,
  arguments: [String(x)],
}));
const store = join(output, "investigation.json");
const controller = await AutonomousInvestigation.create(store, {
  binaryPath: original,
  workspace: output,
  original: { command: original, arguments: [] },
  replica: { command: replica, arguments: [] },
  build: { command: "clang", arguments: ["-O0", replicaSource, "-o", replica] },
  cases,
  maxIterations: 3,
  timeoutMs: 120000,
  dimensions: ["terminal", "interaction"],
});
let repairs = 0;
const state = await controller.run({
  repair: async () => {
    repairs++;
    const negativeOne = await observe(-1);
    const negativeTwo = await observe(-2);
    const slope = intercept - negativeOne;
    assert.equal(
      negativeTwo,
      intercept - 2 * slope,
      "Independent experiment supports the negative affine hypothesis",
    );
    return { files: [{ path: replicaSource, content: source(slope) }] };
  },
});
assert.equal(state.status, "suite-passed", JSON.stringify(state.results));
assert.ok(repairs >= 1, "At least one real observed mismatch triggered repair");
assert.ok(
  state.regressions.length >= 1,
  "Observed mismatches persist as regressions",
);
assert.equal(
  state.results.filter((r) => r.status === "pass").length,
  cases.length,
);
const captures = state.evidence.filter(
  (e) => e.operation === "capture_process_scenario",
);
assert.ok(captures.length >= cases.length * 2);
for (const capture of captures)
  assert.deepEqual(
    capture.normalized_result.exit,
    { code: 0, signal: 0, reason: "exited" },
    "Original and replica exited successfully",
  );
const reopened = await AutonomousInvestigation.open(store);
assert.equal(reopened.state.status, "suite-passed");
const report = {
  kind: "authored-native-validation",
  binarySha256: createHash("sha256")
    .update(await readFile(original))
    .digest("hex"),
  functionCount: functions.length,
  transformAddress: transform.addr,
  staticBranchObserved: true,
  experiments,
  repairs,
  status: state.status,
  caseCount: cases.length,
  regressions: state.regressions,
  claims: [
    "Real compiled original and independently generated replica were executed",
    "Reconstruction inferred two affine branches from numeric runtime observations",
    "All declared finite inputs pass after mismatch repair",
  ],
  limitations: [
    "Fixture is authored and is not the requested proprietary desktop benchmark",
    "Policy supports only this declared piecewise affine hypothesis class",
    "No claim of universal equivalence or desktop/game reconstruction",
    "Exit settlement timing is not verified; incidental frame times normalized by declared bucket",
    "Static analysis used installed radare2; controller process capture and comparison use existing REA providers",
  ],
};
await writeFile(
  join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
