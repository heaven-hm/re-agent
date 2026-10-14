/** Held-out native executions and comparisons against retained original probes. */
import { runOwnedCommand } from "../../../dist/process/OwnedCommand.js";
import { fdHeldoutCases, createFdHeldoutFixture } from "./fd-heldout.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const base = resolve("benchmarks/native-batch-2"),
  hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cwd = await createFdHeldoutFixture(base + "/tests/fd-heldout-tree"),
  executable = resolve("build/native-batch-2/fdmac");
const normalize = (text) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replaceAll("\\", "/").replace(/^\.\//u, ""))
    .sort();
const report = {
  schema: "rea.fd-heldout-comparison.v1",
  seed: 34001,
  generatedFiles: 24,
  universalEquivalence: false,
  status: "UNVERIFIED",
  scope:
    "Ten declared search probes on a separately generated seeded tree; raw output and path/order normalized comparisons are separate.",
  sourceSha256: hash(await readFile(base + "/reconstructed/fd/fdmac.cpp")),
  replicaSha256: hash(await readFile(executable)),
  cases: [],
};
for (const item of fdHeldoutCases) {
  let original, originalStdout, originalStderr;
  try {
    original = JSON.parse(
      await readFile(`${base}/logs/runtime/fd-heldout-${item.id}.json`, "utf8"),
    );
    originalStdout = await readFile(
      `${base}/logs/runtime/fd-heldout-${item.id}.stdout.bin`,
    );
    originalStderr = await readFile(
      `${base}/logs/runtime/fd-heldout-${item.id}.stderr.bin`,
    );
  } catch (cause) {
    report.cases.push({
      id: item.id,
      status: "UNVERIFIED",
      reason: "original baseline absent",
      detail: cause.code,
    });
    continue;
  }
  if (
    original.target_sha256 !==
      "d67d27a8e375ed7e9bca2b506a9dd5082bc24547aeba908b863f6f8b8ab0c3b9" ||
    resolve(original.cwd) !== cwd ||
    JSON.stringify(original.arguments) !== JSON.stringify(item.arguments)
  ) {
    report.cases.push({
      id: item.id,
      status: "UNVERIFIED",
      reason: "original target/input contract differs",
    });
    continue;
  }
  if (
    original.status !== "completed" ||
    original.exit_code !== 0 ||
    originalStderr.length !== 0
  ) {
    report.cases.push({
      id: item.id,
      status: "UNVERIFIED",
      reason: "positive-search original baseline did not complete successfully",
      original,
    });
    continue;
  }
  if (
    original.stdout?.sha256 !== hash(originalStdout) ||
    original.stderr?.sha256 !== hash(originalStderr)
  ) {
    report.cases.push({
      id: item.id,
      status: "UNVERIFIED",
      reason: "original artifact commitment mismatch",
    });
    continue;
  }
  const actual = await runOwnedCommand(
    {
      command: executable,
      arguments: item.arguments,
      cwd,
      env: process.env,
      runId: "rea-fd-heldout-" + randomUUID(),
      expectedCommand: null,
    },
    { timeoutMs: 10000, diagnosticBytes: 1024 * 1024, acceptNonZeroExit: true },
  );
  const dimensions = {
    rawStdout: originalStdout.equals(Buffer.from(actual.stdout.text)),
    rawStderr: originalStderr.equals(Buffer.from(actual.stderr.text)),
    exitStatus: original.exit_code === actual.exitCode,
    normalizedSearch:
      JSON.stringify(normalize(originalStdout.toString("utf8"))) ===
      JSON.stringify(normalize(actual.stdout.text)),
  };
  const observed = original.status === "completed";
  report.cases.push({
    id: item.id,
    arguments: item.arguments,
    original,
    replica: actual,
    dimensions,
    status: !observed
      ? "UNVERIFIED"
      : dimensions.exitStatus &&
          dimensions.rawStderr &&
          dimensions.normalizedSearch
        ? "PASS"
        : "FAIL",
  });
  await writeFile(
    base + "/reports/fd/heldout-comparison.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
report.status = report.cases.every((item) => item.status === "UNVERIFIED")
  ? "UNVERIFIED"
  : report.cases.every((item) => item.status === "PASS")
    ? "TEST_SUITE_EQUIVALENCE_UNDER_DECLARED_NORMALIZATION"
    : "PARTIAL";
report.normalizedPass = report.cases.filter(
  (item) => item.status === "PASS",
).length;
report.rawPass = report.cases.filter(
  (item) =>
    item.dimensions &&
    item.dimensions.rawStdout &&
    item.dimensions.rawStderr &&
    item.dimensions.exitStatus,
).length;
await writeFile(
  base + "/reports/fd/heldout-comparison.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    normalizedPass: report.normalizedPass,
    rawPass: report.rawPass,
  }),
);
