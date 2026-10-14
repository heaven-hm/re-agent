/** Compare one actual Windows-release version probe with the native replica. */
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runOwnedCommand } from "../../../dist/process/OwnedCommand.js";

const base = resolve(import.meta.dirname, "..");
const repository = resolve(base, "../..");
const originalPath = resolve(base, "logs/runtime/fd-version.json");
const original = JSON.parse(await readFile(originalPath, "utf8"));
const targetSha256 =
  "d67d27a8e375ed7e9bca2b506a9dd5082bc24547aeba908b863f6f8b8ab0c3b9";
if (
  original.status !== "completed" ||
  original.target_sha256 !== targetSha256 ||
  JSON.stringify(original.arguments) !== JSON.stringify(["--version"]) ||
  original.exit_code !== 0
)
  throw new Error(
    "No successful, hash-bound original fd version observation exists",
  );

const attempt = JSON.parse(
  await readFile(resolve(base, original.attempt_record_path), "utf8"),
);
if (
  attempt.run_id !== original.run_id ||
  attempt.target_sha256 !== targetSha256
)
  throw new Error("Original fd attempt record does not match its run identity");
const originalStdout = await readFile(resolve(base, original.stdout.path));
const originalStderr = await readFile(resolve(base, original.stderr.path));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (
  hash(originalStdout) !== original.stdout.sha256 ||
  hash(originalStderr) !== original.stderr.sha256
)
  throw new Error(
    "Original fd stream bytes do not match their retained digests",
  );

const executable = resolve(repository, "build/native-batch-2/fdmac");
const source = resolve(base, "reconstructed/fd/fdmac.cpp");
const executableBytes = await readFile(executable);
const sourceBytes = await readFile(source);
const replicaRunId = `rea-replica-${randomUUID().replaceAll("-", "")}`;
const replica = await runOwnedCommand(
  {
    command: executable,
    arguments: ["--version"],
    cwd: original.cwd,
    env: process.env,
    runId: replicaRunId,
    expectedCommand: null,
  },
  {
    timeoutMs: 60_000,
    diagnosticBytes: 64 * 1024,
    acceptNonZeroExit: true,
  },
);
const replicaStdout = Buffer.from(replica.stdout.text);
const replicaStderr = Buffer.from(replica.stderr.text);
const dimensions = {
  stdoutBytesEqual: originalStdout.equals(replicaStdout),
  stderrBytesEqual: originalStderr.equals(replicaStderr),
  exitStatusEqual:
    original.exit_code === replica.exitCode && replica.signal === null,
};
const pass = Object.values(dimensions).every(Boolean);
const report = {
  schema: "rea.fd-version-parity.v1",
  status: pass ? "PASS" : "FAIL",
  universalEquivalence: false,
  scope: "One --version invocation; exact stdout/stderr bytes and exit status.",
  comparisonRunId: `rea-comparison-${randomUUID().replaceAll("-", "")}`,
  input: {
    arguments: ["--version"],
    cwd: original.cwd,
    fixtureTreeSha256: original.fixture_tree_sha256,
  },
  original: {
    binarySha256: original.target_sha256,
    runtime: original.runtime,
    runId: original.run_id,
    captureMethod: original.capture,
    exitCode: original.exit_code,
    stdoutSha256: hash(originalStdout),
    stderrSha256: hash(originalStderr),
    stdout: originalStdout.toString("utf8"),
    stderr: originalStderr.toString("utf8"),
  },
  replica: {
    sourceSha256: hash(sourceBytes),
    executableSha256: hash(executableBytes),
    os: process.platform,
    architecture: process.arch,
    runId: replicaRunId,
    exitCode: replica.exitCode,
    signal: replica.signal,
    stdoutSha256: hash(replicaStdout),
    stderrSha256: hash(replicaStderr),
    stdout: replica.stdout.text,
    stderr: replica.stderr.text,
  },
  dimensions,
  limitations: [
    "Original ran under CrossOver on macOS, not native Windows.",
    "This single version query does not verify filesystem search behavior or whole-application equivalence.",
  ],
};
await writeFile(
  resolve(base, "reports/fd/version-parity.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify({ status: report.status, dimensions }));
if (!pass) process.exitCode = 1;
