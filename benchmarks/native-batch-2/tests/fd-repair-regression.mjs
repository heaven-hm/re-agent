/** Actual pre/post candidate executions, not simulated provider results. */
import { runOwnedCommand } from "../../../dist/process/OwnedCommand.js";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const base = resolve("benchmarks/native-batch-2"),
  hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const probes = [
  {
    id: "invalid-regex",
    arguments: ["--color", "never", "--threads", "1", "[", "."],
  },
  { id: "version", arguments: ["--version"] },
  { id: "help", arguments: ["--help"] },
];
const report = {
  schema: "rea.fd-candidate-repair.v1",
  scope:
    "Actual own candidate pre/post corrections on three recorded original probes; no complete fd-equivalence claim.",
  beforeSource: {
    path: "reports/fd/before-candidate.cpp",
    sha256: hash(await readFile(base + "/reports/fd/before-candidate.cpp")),
    provenance:
      "Pre-correction own source reconstructed by reverting the explicit correction before compilation; not upstream fd source.",
  },
  afterSource: {
    path: "reconstructed/fd/fdmac.cpp",
    sha256: hash(await readFile(base + "/reconstructed/fd/fdmac.cpp")),
  },
  cases: [],
};
for (const item of probes) {
  const original = JSON.parse(
    await readFile(`${base}/logs/runtime/fd-${item.id}.json`, "utf8"),
  );
  const stdout = await readFile(
      `${base}/logs/runtime/fd-${item.id}.stdout.bin`,
    ),
    stderr = await readFile(`${base}/logs/runtime/fd-${item.id}.stderr.bin`);
  const sides = {};
  for (const side of ["before", "after"]) {
    const executable = resolve(
      "build/native-batch-2/fdmac" + (side === "before" ? "-before" : ""),
    );
    const observed = await runOwnedCommand(
      {
        command: executable,
        arguments: item.arguments,
        cwd: base + "/tests/fd-fixture-tree",
        env: process.env,
        runId: "rea-fd-repair-" + randomUUID(),
        expectedCommand: null,
      },
      { timeoutMs: 10000, diagnosticBytes: 65536, acceptNonZeroExit: true },
    );
    sides[side] = {
      binarySha256: hash(await readFile(executable)),
      ...observed,
      dimensions: {
        stdout: stdout.equals(Buffer.from(observed.stdout.text)),
        stderr: stderr.equals(Buffer.from(observed.stderr.text)),
        exit: original.exit_code === observed.exitCode,
      },
    };
    sides[side].rawPass = Object.values(sides[side].dimensions).every(Boolean);
  }
  report.cases.push({
    id: item.id,
    arguments: item.arguments,
    originalExit: original.exit_code,
    ...sides,
  });
}
await writeFile(
  base + "/reports/fd/repair-loop.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    report.cases.map((item) => ({
      id: item.id,
      before: item.before.rawPass,
      after: item.after.rawPass,
      beforeExit: item.before.exitCode,
      afterExit: item.after.exitCode,
    })),
  ),
);
