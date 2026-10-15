import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AutonomousInvestigation,
  normalizeInvestigationConfig,
} from "../../../dist/application/autonomy/AutonomousInvestigation.js";

const root = resolve(import.meta.dirname, "..");
const repo = resolve(root, "../..");
const binary = JSON.parse(
  await readFile(resolve(root, "manifests/fd-acquisition.json"), "utf8"),
).executables[0];
const checkpoint = resolve(root, "logs/checkpoints/fd.json");
await mkdir(resolve(root, "logs/checkpoints"), { recursive: true });
const original = resolve(root, binary.path);
const fixture = resolve(root, "tests/fd-fixture-tree");
const config = {
  binaryPath: original,
  workspace: resolve(root, "reconstructed/fd"),
  original: { command: original, arguments: [], cwd: fixture },
  replica: {
    command: resolve(repo, "build/native-batch-2/fdmac"),
    arguments: [],
    cwd: fixture,
  },
  build: {
    command: "/usr/bin/clang++",
    arguments: [
      "-std=c++17",
      "-O2",
      resolve(root, "reconstructed/fd/fdmac.cpp"),
      "-o",
      resolve(repo, "build/native-batch-2/fdmac"),
    ],
  },
  cases: [
    {
      id: "glob",
      arguments: ["--color", "never", "--threads", "1", "--glob", "*.txt", "."],
    },
    {
      id: "extension",
      arguments: ["--color", "never", "--threads", "1", "-e", "txt", "."],
    },
  ],
  dimensions: ["terminal", "interaction"],
  maxIterations: 3,
  timeoutMs: 15000,
  outputLimitBytes: 65536,
};
let compatibilityLauncher;
try {
  await normalizeInvestigationConfig({
    ...config,
    original: {
      command: resolve(
        process.env.HOME,
        "Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
      ),
      arguments: [
        "--bottle",
        "rea-native-x64",
        "--no-update",
        "--no-gui",
        original,
      ],
      cwd: fixture,
    },
  });
  compatibilityLauncher = { status: "accepted" };
} catch (error) {
  compatibilityLauncher = { status: "rejected", reason: String(error) };
}
let investigation;
try {
  await readFile(checkpoint);
  investigation = await AutonomousInvestigation.open(checkpoint);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  investigation = await AutonomousInvestigation.create(checkpoint, config);
}
const reopened = await AutonomousInvestigation.open(checkpoint);
await writeFile(
  resolve(root, "reports/fd/controller-checkpoint.json"),
  JSON.stringify(
    {
      status: reopened.state.status,
      binarySha256: reopened.state.binarySha256,
      checkpoint: "logs/checkpoints/fd.json",
      createdAndReopened: true,
      iterations: reopened.state.iteration,
      cases: reopened.state.config.cases.map((c) => c.id),
      evidenceRecords: reopened.state.evidence.length,
      compatibilityLauncher,
      limitation:
        "Only checkpoint creation/reopening was executed. Configuration binds original command to actual PE and cannot execute natively on macOS. No controller reconstruction, differential run or repair completed; isolated Windows worker support remains absent. Compatibility wrapper launch was rejected by the existing identity guard.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "REA controller checkpoint created/reopened; ready, zero comparison results.",
);
