import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createEvidence } from "../dist/domain/evidence.js";
import { jsonValueSchema } from "../dist/domain/jsonValue.js";
import {
  observeNativeNumericDisplay,
  numericDisplayNormalization,
} from "../dist/domain/native/nativeNumericDisplay.js";
import { parseBinaryTarget } from "../dist/application/BinaryTargetResolver.js";
import { observeNativeUi } from "../dist/native/NativeUiObservation.js";
import { createNativeUiHelperRuntime } from "../dist/native/NativeUiHelperRuntime.js";
if (process.platform !== "darwin")
  throw new Error(
    "Real Calculator reconstruction benchmark requires macOS native UI",
  );
const exec = promisify(execFile),
  repo = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(
  process.argv[2] ??
    join(repo, `output/autonomy/calculator-reconstruction-${Date.now()}`),
);
await mkdir(output, { recursive: process.argv[2] === undefined });
const binary = "/System/Applications/Calculator.app/Contents/MacOS/Calculator";
await exec("/usr/bin/open", ["/System/Applications/Calculator.app"]);
const hash = (path) =>
  readFile(path).then((bytes) =>
    createHash("sha256").update(bytes).digest("hex"),
  );
const originalHash = await hash(binary);
const dependencyMetadata = await exec("/usr/bin/otool", ["-L", binary]);
await writeFile(
  join(output, "static-dependencies.txt"),
  dependencyMetadata.stdout,
);
const target = await parseBinaryTarget(binary);
assert.ok(target.ok);
await writeFile(
  join(output, "static-target.json"),
  JSON.stringify(target.value, null, 2),
);
const probe = join(output, "probe.swift");
await writeFile(
  probe,
  `import AppKit
import ApplicationServices
import Foundation
let apps=NSRunningApplication.runningApplications(withBundleIdentifier:"com.apple.calculator")
let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly],kCGNullWindowID) as? [[String:Any]] ?? []
let own=windows.filter{w in apps.contains{ $0.processIdentifier == (w[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value }}
print(String(data:try! JSONSerialization.data(withJSONObject:["windows":own]),encoding:.utf8)!)
`,
);
const probeExecutable = join(output, "metadata-probe");
await exec(
  "/usr/bin/xcrun",
  [
    "swiftc",
    "-module-cache-path",
    join(output, "probe-modules"),
    probe,
    "-o",
    probeExecutable,
  ],
  { timeout: 120000 },
);
const probeResult = await exec(probeExecutable, [], { timeout: 10000 });
const metadata = JSON.parse(probeResult.stdout);
await writeFile(
  join(output, "native-button-metadata.json"),
  JSON.stringify(metadata, null, 2),
);
const window = metadata.windows.find((w) => w.kCGWindowLayer === 0);
assert.ok(window);
const originalScope = {
  pid: window.kCGWindowOwnerPID,
  window_id: window.kCGWindowNumber,
  screenshot: false,
  accessibility: true,
  max_nodes: 100,
};
const runtime = createNativeUiHelperRuntime(process.env);
let replicaProcess;
let replicaIdentity;
let cleanupSource;
let replicaExecutable;
let replicaLaunchBound;
const observations = [];
const completedComparisons = [];
const display = (snapshot) => {
  const observed = observeNativeNumericDisplay(snapshot);
  assert.equal(observed.status, "observed", JSON.stringify(observed));
  return observed.value;
};
const descriptions = {
  clear: "Delete",
  "+": "Add",
  "-": "Subtract",
  "*": "Multiply",
  "/": "Divide",
  "=": "Equals",
  ".": "Point",
  sign: "Change Sign",
  percent: "Percent",
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [String(i), String(i)]),
  ),
};
const eventsFor = (a, operator, b) => [
  ...Array(8).fill("clear"),
  ...String(a),
  operator,
  ...String(b),
  "=",
];
// An error Result is returned only when the initial observation fails, before any scenario action.
// Completed/failed step Results are never replayed because an action may already have affected state.
async function observeStableWindow(
  selectedTarget,
  operation,
  parameters,
  attemptPrefix,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await observeNativeUi(
      selectedTarget,
      operation,
      parameters,
      { environment: process.env, runtime },
    );
    if (
      result.ok ||
      !result.error.message.includes("ambiguous-window") ||
      attempt === 4
    )
      return result;
    await writeFile(
      join(output, `${attemptPrefix}-initial-attempt-${attempt}.json`),
      JSON.stringify(result, null, 2),
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
}
const originalPath = async (event) => {
  const observed = await observeStableWindow(
    target.value,
    "observe_native_ui",
    originalScope,
    `path-${event.charCodeAt(0)}-${Date.now()}`,
  );
  assert.ok(observed.ok, observed.error?.message);
  const fresh = {
    buttons: observed.value.initial.nodes.filter(
      (node) => node.role === "AXButton",
    ),
  };
  const wanted = descriptions[event];
  const candidates = fresh.buttons.filter(
    (button) =>
      button.description === wanted ||
      (event === "clear" &&
        ["Clear", "All Clear"].includes(button.description)),
  );
  assert.equal(candidates.length, 1, `Unique current button ${event}`);
  return candidates[0].path;
};
async function capture(selectedTarget, scope, { events, paths, id }) {
  const records = [];
  let final;
  for (const [index, event] of events.entries()) {
    const steps = [
      { kind: "click", path: await paths(event) },
      { kind: "wait", milliseconds: 60 },
    ];
    const result = await observeStableWindow(
      selectedTarget,
      "capture_native_ui_scenario",
      { ...scope, steps },
      `${id}-${index}`,
    );
    await writeFile(
      join(output, `${id}-${index}-raw.json`),
      JSON.stringify(result, null, 2),
    );
    assert.ok(result.ok, result.error?.message);
    const evidence = createEvidence(
      selectedTarget,
      {
        id: "native-macos",
        name: "macOS native inspection utilities",
        version: null,
      },
      {
        operation: "capture_native_ui_scenario",
        parameters: { ...scope, steps },
        result: jsonValueSchema.parse(result.value),
        confidence: "observed",
        authority: "controlled-replay",
        limitations: [
          "Final accessibility display comparison only; no internal arithmetic equivalence claim.",
        ],
      },
    );
    await writeFile(
      join(output, `${id}-${index}-evidence.json`),
      JSON.stringify(evidence, null, 2),
    );
    records.push(evidence.evidence_id);
    assert.ok(
      result.value.steps.every((step) => step.outcome === "completed"),
      JSON.stringify(
        result.value.steps.filter((step) => step.outcome !== "completed"),
      ),
    );
    final = result.value.steps.at(-1).after;
  }
  assert.ok(final);
  const record = {
    id,
    targetSha256: selectedTarget.sha256,
    events,
    evidenceIds: records,
    display: display(final),
  };
  await writeFile(join(output, `${id}.json`), JSON.stringify(record, null, 2));
  observations.push(record);
  return record.display;
}

try {
  const initial = await observeNativeUi(
    target.value,
    "observe_native_ui",
    originalScope,
    { environment: process.env, runtime },
  );
  await writeFile(
    join(output, "initial-observation.json"),
    JSON.stringify(initial, null, 2),
  );
  assert.ok(initial.ok, JSON.stringify(initial.ok ? null : initial.error));
  await writeFile(
    join(output, "original-initial.json"),
    JSON.stringify(initial.value, null, 2),
  );
  const candidateLaws = {
    add: (a, b) => a + b,
    subtract: (a, b) => a - b,
    multiply: (a, b) => a * b,
    divide: (a, b) => a / b,
  };
  const recovered = {};
  for (const operator of ["+", "-", "*", "/"]) {
    const probes = [];
    for (const [a, b] of [
      [8, 2],
      [9, 3],
    ]) {
      const id = `probe-${operator.charCodeAt(0)}-${a}-${b}`;
      const value = await capture(target.value, originalScope, {
        events: eventsFor(a, operator, b),
        paths: originalPath,
        id,
      });
      probes.push({ a, b, value: Number(value), id });
    }
    const matches = Object.entries(candidateLaws).filter(([, law]) =>
      probes.every((p) => law(p.a, p.b) === p.value),
    );
    assert.equal(
      matches.length,
      1,
      `A unique arithmetic hypothesis is supported for ${operator}: ${JSON.stringify(probes)}`,
    );
    recovered[operator] = {
      law: matches[0][0],
      support: probes.map((p) => p.id),
    };
  }
  await writeFile(
    join(output, "recovered-semantics.json"),
    JSON.stringify(recovered, null, 2),
  );
  const app = join(output, "Replica.app"),
    contents = join(app, "Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await writeFile(
    join(contents, "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>replica</string><key>CFBundleIdentifier</key><string>io.rea.calculator.recovered</string><key>CFBundleName</key><string>Calculator Replica</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`,
  );
  const source = join(output, "replica.swift");
  const laws = Object.entries(recovered)
    .map(([operator, data]) => `"${operator}":"${data.law}"`)
    .join(",");
  await writeFile(
    source,
    `// Operation mapping generated from runtime evidence in recovered-semantics.json.
${await readFile(join(repo, "scripts/calculator/CalculatorEngine.swift"), "utf8")}
${await readFile(join(repo, "scripts/calculator/CalculatorWindow.swift"), "utf8")}
let app=NSApplication.shared
app.setActivationPolicy(.regular)
let engine=CalculatorEngine(recoveredLaws:[${laws}])
let window=createCalculatorWindow(engine:engine)
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps:true)
DispatchQueue.main.asyncAfter(deadline:.now()+0.5){let record="{\\"pid\\":\\(ProcessInfo.processInfo.processIdentifier),\\"window_id\\":\\(window.windowNumber)}\\n";FileHandle.standardOutput.write(Data(record.utf8))}
app.run()
`,
  );
  const executable = join(contents, "MacOS", "replica");
  await exec(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-module-cache-path",
      join(output, "replica-modules"),
      source,
      "-o",
      executable,
    ],
    { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
  );
  const readyPath = join(output, "replica-readiness.jsonl");
  replicaExecutable = executable;
  cleanupSource = join(output, "replica-owner");
  const ownershipSource = join(output, "replica-owner.swift");
  await writeFile(
    ownershipSource,
    `import AppKit
import Foundation
let args=CommandLine.arguments
let expected=args[2]
let earliest=Double(args[3])!
let apps=NSWorkspace.shared.runningApplications.filter { $0.executableURL?.resolvingSymlinksInPath().path==expected && ($0.launchDate?.timeIntervalSince1970 ?? 0)>=earliest }
if args[1]=="inspect" {
 guard apps.count==1,let app=apps.first,let launch=app.launchDate else {exit(3)}
 print(String(data:try! JSONSerialization.data(withJSONObject:["pid":app.processIdentifier,"path":expected,"launch":launch.timeIntervalSince1970]),encoding:.utf8)!)
} else {
 for app in apps {
  guard let launch=app.launchDate else {exit(4)}
  let identity:[String:Any]=["pid":app.processIdentifier,"path":expected,"launch":launch.timeIntervalSince1970]
  _=app.terminate()
  let deadline=Date().addingTimeInterval(5)
  while !app.isTerminated && Date()<deadline {RunLoop.current.run(until:Date().addingTimeInterval(0.05))}
  if !app.isTerminated {exit(5)}
  print(String(data:try! JSONSerialization.data(withJSONObject:identity),encoding:.utf8)!)
 }
}
`,
  );
  await exec(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-module-cache-path",
      join(output, "owner-modules"),
      ownershipSource,
      "-o",
      cleanupSource,
    ],
    { timeout: 120000 },
  );
  replicaLaunchBound = Date.now() / 1000 - 1;
  replicaProcess = spawn(
    "/usr/bin/open",
    [
      "-n",
      "-W",
      "--stdout",
      readyPath,
      "--stderr",
      join(output, "replica-stderr.log"),
      app,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const replicaScope = await (async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const text = await readFile(readyPath, "utf8");
        if (text.includes("\n")) return JSON.parse(text.split("\n")[0]);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (replicaProcess.exitCode !== null)
        throw new Error(
          `Replica LaunchServices failed: ${replicaProcess.exitCode}`,
        );
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error("Replica window launch timed out");
  })();
  replicaIdentity = JSON.parse(
    (
      await exec(
        cleanupSource,
        ["inspect", executable, String(replicaLaunchBound)],
        { timeout: 10000 },
      )
    ).stdout,
  );
  assert.equal(
    replicaIdentity.pid,
    replicaScope.pid,
    "Readiness is from the owned replica process",
  );
  const replicaTarget = await parseBinaryTarget(executable);
  assert.ok(replicaTarget.ok);
  const scoped = {
    ...replicaScope,
    screenshot: false,
    accessibility: true,
    max_nodes: 100,
  };
  const tree = await observeNativeUi(
    replicaTarget.value,
    "observe_native_ui",
    scoped,
    { environment: process.env, runtime },
  );
  await writeFile(
    join(output, "replica-observation-diagnostic.json"),
    JSON.stringify(tree.ok ? tree.value : tree.error, null, 2),
  );
  assert.ok(tree.ok, JSON.stringify(tree.ok ? null : tree.error));
  assert.equal(tree.value.initial.window.pid, replicaIdentity.pid);
  assert.equal(tree.value.initial.window.launch_time, replicaIdentity.launch);
  await writeFile(
    join(output, "replica-initial.json"),
    JSON.stringify(tree.value, null, 2),
  );
  const paths = new Map(
    tree.value.initial.nodes
      .filter((n) => n.role === "AXButton")
      .map((n) => [n.identifier?.replace("calculator-key-", ""), n.path]),
  );
  paths.set("clear", paths.get("AC"));
  paths.set("sign", paths.get("+/-"));
  paths.set("percent", paths.get("%"));
  for (const token of Object.keys(descriptions))
    assert.ok(paths.has(token), `Replica exposes ${token}`);
  const suite = [
    [2, "+", 3],
    [17, "+", 24],
    [48, "-", 17],
    [3, "-", 8],
    [6, "*", 7],
    [12, "*", 3],
    [24, "/", 6],
    [9, "/", 2],
    [0, "+", 8],
    [99, "-", 99],
  ];
  suite.push(
    ...[
      ["1", ".", "2", "+", "3", ".", "4", "="],
      ["7", ".", "5", "*", "2", "="],
      ["9", "/", "4", "="],
      ["5", "sign", "+", "3", "="],
      ["8", "percent", "="],
      ["2", "0", "0", "+", "1", "0", "percent", "="],
      ["2", "+", "3", "*", "4", "="],
      ["2", "+", "3", "=", "="],
    ].map((events) => ({ events: [...Array(8).fill("clear"), ...events] })),
  );
  const comparisons = completedComparisons;
  for (const [index, specification] of suite.entries()) {
    const events = Array.isArray(specification)
        ? eventsFor(...specification)
        : specification.events,
      id = `case-${index}`;
    const original = await capture(target.value, originalScope, {
      events,
      paths: originalPath,
      id: `${id}-original`,
    });
    const replica = await capture(replicaTarget.value, scoped, {
      events,
      paths: (event) => paths.get(event),
      id: `${id}-replica`,
    });
    const comparison = {
      id,
      events,
      original,
      replica,
      status: original === replica ? "pass" : "fail",
    };
    const evidence = createEvidence(
      target.value,
      {
        id: "rea-calculator-display",
        name: "REA native display comparison",
        version: null,
      },
      {
        operation: "compare_calculator_display",
        parameters: { events, normalization: numericDisplayNormalization },
        result: jsonValueSchema.parse(comparison),
        confidence: "derived",
        authority: "controlled-replay",
        evidenceLinks: observations
          .filter(
            (record) =>
              record.id === `${id}-original` || record.id === `${id}-replica`,
          )
          .flatMap((record) => record.evidenceIds),
        limitations: [
          "Only final displayed numeric result under the declared abstract button events is compared.",
        ],
      },
    );
    await writeFile(
      join(output, `${id}-comparison-evidence.json`),
      JSON.stringify(evidence, null, 2),
    );
    comparisons.push({ ...comparison, evidenceId: evidence.evidence_id });
  }
  const visualRecords = [];
  for (const [name, selectedTarget, scope] of [
    ["original", target.value, originalScope],
    ["replica", replicaTarget.value, scoped],
  ]) {
    const observation = await observeNativeUi(
      selectedTarget,
      "observe_native_ui",
      { ...scope, screenshot: true },
      { environment: process.env, runtime },
    );
    assert.ok(observation.ok, JSON.stringify(observation.error));
    const screenshot = observation.value.initial.screenshot;
    assert.ok(
      screenshot,
      "Actual screenshot is required for visual comparison",
    );
    const visualEvidence = createEvidence(
      selectedTarget,
      {
        id: "native-macos",
        name: "macOS native inspection utilities",
        version: null,
      },
      {
        operation: "observe_native_ui",
        parameters: { ...scope, screenshot: true },
        result: jsonValueSchema.parse(observation.value),
        confidence: "observed",
        authority: "controlled-replay",
        limitations: [
          "A single observed window state is not complete visual coverage.",
        ],
      },
    );
    await writeFile(
      join(output, `${name}-visual-evidence.json`),
      JSON.stringify(visualEvidence, null, 2),
    );
    await writeFile(
      join(output, `${name}-window.png`),
      Buffer.from(screenshot.base64, "base64"),
    );
    visualRecords.push(visualEvidence.evidence_id);
  }
  const visual = JSON.parse(
    (
      await exec(
        "python3",
        [
          join(repo, "scripts/calculator/compare-images.py"),
          join(output, "original-window.png"),
          join(output, "replica-window.png"),
          join(output, "window-difference.png"),
        ],
        { timeout: 30000 },
      )
    ).stdout,
  );
  const visualEvidence = createEvidence(
    target.value,
    {
      id: "rea-window-comparison",
      name: "REA exact window pixel comparison",
      version: null,
    },
    {
      operation: "compare_calculator_windows",
      parameters: { normalization: visual.normalization },
      result: jsonValueSchema.parse(visual),
      confidence: "derived",
      authority: "controlled-replay",
      evidenceLinks: visualRecords,
      limitations: [
        "Window activation, rendering and capture state are retained; mismatches are not hidden.",
        "One state does not establish complete UI equivalence.",
      ],
    },
  );
  await writeFile(
    join(output, "visual-comparison-evidence.json"),
    JSON.stringify(visualEvidence, null, 2),
  );
  const report = {
    kind: "proprietary-native-display-boundary",
    original: { path: binary, sha256: originalHash },
    replica: { path: executable, sha256: await hash(executable) },
    recovered,
    normalization: numericDisplayNormalization,
    comparisons,
    passed: comparisons.filter((c) => c.status === "pass").length,
    total: suite.length,
    visualComparison: { ...visual, evidenceId: visualEvidence.evidence_id },
    fullCalculatorFidelityEstablished: false,
    claim: comparisons.every((c) => c.status === "pass")
      ? "Finite declared basic arithmetic result-display equivalence under identical abstract button event scripts"
      : "Mismatches found in the declared arithmetic result-display suite",
    limitations: [
      "No claim of full Calculator reconstruction or universal equivalence",
      "Arithmetic laws inferred from real UI probes under a declared four-law hypothesis class",
      "Original button paths discovered from native AX descriptions; replica paths discovered by AX title",
      "Only final displayed result is compared; intermediate display rendering and reset/backspace semantics excluded",
      "Static Calculator inventory separately recorded; arithmetic resides partly in imported Calculate framework and no internal arithmetic function equivalence established",
      "No runtime hooking, game, audio, memory, timing, or formal proof claim",
    ],
  };
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  assert.equal(
    report.passed,
    report.total,
    "Declared original/replica display cases all pass",
  );
} catch (cause) {
  await writeFile(
    join(output, "failure-report.json"),
    JSON.stringify(
      {
        status: "incomplete",
        error: cause instanceof Error ? cause.message : String(cause),
        completedComparisons,
        fullCalculatorFidelityEstablished: false,
        limitations: [
          "Interrupted cases are not passing cases; action effects are preserved in raw observations.",
        ],
      },
      null,
      2,
    ),
  );
  throw cause;
} finally {
  try {
    try {
      if (
        replicaProcess &&
        cleanupSource &&
        replicaExecutable &&
        replicaLaunchBound
      ) {
        const cleanup = await exec(
          cleanupSource,
          ["terminate", replicaExecutable, String(replicaLaunchBound)],
          { timeout: 10000 },
        );
        await writeFile(join(output, "replica-cleanup.jsonl"), cleanup.stdout);
      }
    } finally {
      if (replicaProcess && replicaProcess.exitCode === null) {
        await new Promise((resolveExit, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Replica launch worker cleanup timed out")),
            10000,
          );
          replicaProcess.once("exit", () => {
            clearTimeout(timer);
            resolveExit();
          });
        });
      }
    }
  } finally {
    await runtime.close();
  }
}
